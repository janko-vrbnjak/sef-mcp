/**
 * Runtime configuration from environment variables.
 *
 * Secrets arrive only through the environment (ideally injected by a secret
 * manager such as `op run`). They are never read from the profile, never
 * logged and never returned by a tool.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type SefEnvironment = "demo" | "prod";

export interface RuntimeConfig {
  env: SefEnvironment;
  apiKey: string | undefined;
  profilePath: string;
  dataDir: string;
  attachmentsDir: string | undefined;
  readOnly: boolean;
  allowProdWrite: boolean;
  maxAttachmentBytes: number;
  maxAttachments: number;
  requestTimeoutMs: number;
}

function bool(v: string | undefined): boolean {
  return v !== undefined && ["1", "true", "yes"].includes(v.trim().toLowerCase());
}

function looksLikeUnresolvedSecretRef(v: string): boolean {
  return /^(op|vault|aws-sm|gcp-sm):\/\//i.test(v.trim());
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const rawEnv = (env.SEF_ENV ?? "demo").trim().toLowerCase();
  if (rawEnv !== "demo" && rawEnv !== "prod") {
    throw new Error(`SEF_ENV must be "demo" or "prod" (got "${rawEnv}")`);
  }
  // Per-environment keys (used by the Claude Desktop extension, where both keys live in the OS keychain)
  // take precedence over the single SEF_API_KEY. Empty strings count as "not set".
  const envKey = rawEnv === "prod" ? env.SEF_API_KEY_PROD : env.SEF_API_KEY_DEMO;
  const apiKey = envKey?.trim() || env.SEF_API_KEY?.trim() || undefined;
  if (apiKey && looksLikeUnresolvedSecretRef(apiKey)) {
    throw new Error(
      "SEF_API_KEY looks like an unresolved secret reference (e.g. op://...). " +
        "Start the server through your secret manager, e.g. `op run --env-file=... -- sef-mcp serve`."
    );
  }
  const dataDir = resolve(env.SEF_MCP_DATA_DIR?.trim() || join(homedir(), ".sef-mcp"));
  const timeout = Number(env.SEF_MCP_TIMEOUT_MS ?? 30000);
  // SEF limits (confirmed by the maintainer, 2026-11): 2 attachments, 1 MB each. Configurable downwards or,
  // if SEF raises them, upwards.
  const maxAtt = Number(env.SEF_MCP_MAX_ATTACHMENT_BYTES ?? 1024 * 1024);
  const maxCount = Number(env.SEF_MCP_MAX_ATTACHMENTS ?? 2);
  return {
    env: rawEnv,
    apiKey,
    // Profile defaults to <dataDir>/profile.json so a guided setup can create it in place.
    profilePath: env.SEF_MCP_PROFILE?.trim() ? resolve(env.SEF_MCP_PROFILE) : join(dataDir, "profile.json"),
    // One data dir may serve both environments: every audit entry records its env, and the
    // duplicate-number check filters by it.
    dataDir,
    attachmentsDir: env.SEF_MCP_ATTACHMENTS_DIR?.trim() ? resolve(env.SEF_MCP_ATTACHMENTS_DIR) : undefined,
    readOnly: bool(env.SEF_MCP_READ_ONLY),
    allowProdWrite: bool(env.SEF_MCP_ALLOW_PROD_WRITE),
    maxAttachmentBytes: Number.isFinite(maxAtt) && maxAtt > 0 ? maxAtt : 1024 * 1024,
    maxAttachments: Number.isInteger(maxCount) && maxCount >= 0 ? maxCount : 2,
    requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
  };
}

/** Throws unless a write (send/cancel) is allowed in the current configuration. */
export function assertWriteAllowed(cfg: RuntimeConfig, action: string): void {
  if (cfg.readOnly) {
    throw new Error(`${action} blocked: server runs in read-only mode (SEF_MCP_READ_ONLY=true).`);
  }
  if (cfg.env === "prod" && !cfg.allowProdWrite) {
    throw new Error(
      `${action} blocked: SEF_ENV=prod requires SEF_MCP_ALLOW_PROD_WRITE=true. ` +
        "This second switch exists so a misconfigured environment can never issue a real invoice."
    );
  }
}
