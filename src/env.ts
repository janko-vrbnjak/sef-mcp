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
  /** Configuration problems found at startup (already resolved to safe defaults). */
  problems: string[];
}

/**
 * A value counts as "not set" when it is missing, empty, or still contains an unsubstituted
 * `${...}` placeholder. The Claude Desktop extension passes untouched optional fields as empty
 * strings (or, in some versions, leaves placeholders as-is), so both must fall back to defaults.
 */
export function setting(v: string | undefined): string | undefined {
  const t = v?.trim();
  if (!t || /\$\{[^}]*\}/.test(t)) return undefined;
  return t;
}

function bool(v: string | undefined): boolean {
  const t = setting(v);
  return t !== undefined && ["1", "true", "yes"].includes(t.toLowerCase());
}

function looksLikeUnresolvedSecretRef(v: string): boolean {
  return /^(op|vault|aws-sm|gcp-sm):\/\//i.test(v.trim());
}

/**
 * Never throws: a configuration problem must not kill the server, because MCP clients (e.g. Claude
 * Desktop) only show "server disconnected". Problems fall back to the safe side (demo, no key) and are
 * reported in `problems`, which sef_check_setup and `sef-mcp doctor` show.
 */
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const problems: string[] = [];
  const requestedEnv = setting(env.SEF_ENV)?.toLowerCase() ?? "demo";
  let sefEnv: SefEnvironment = "demo";
  if (requestedEnv === "demo" || requestedEnv === "prod") sefEnv = requestedEnv;
  else problems.push(`SEF_ENV / Okruženje "${requestedEnv}" nije "demo" ni "prod" — koristi se demo.`);

  // Per-environment keys (used by the Claude Desktop extension, where both keys live in the OS keychain)
  // take precedence over the single SEF_API_KEY.
  let apiKey = setting(sefEnv === "prod" ? env.SEF_API_KEY_PROD : env.SEF_API_KEY_DEMO) ?? setting(env.SEF_API_KEY);
  if (apiKey && looksLikeUnresolvedSecretRef(apiKey)) {
    apiKey = undefined;
    problems.push(
      "SEF_API_KEY looks like an unresolved secret reference (e.g. op://...); it is ignored. " +
        "Start the server through your secret manager, e.g. `op run --env-file=... -- sef-mcp serve`."
    );
  }
  const dataDirSetting = setting(env.SEF_MCP_DATA_DIR);
  const dataDir = resolve(dataDirSetting ?? join(homedir(), ".sef-mcp"));
  const profileSetting = setting(env.SEF_MCP_PROFILE);
  const attachmentsSetting = setting(env.SEF_MCP_ATTACHMENTS_DIR);
  const timeout = Number(setting(env.SEF_MCP_TIMEOUT_MS) ?? 30000);
  // SEF limits (confirmed by the maintainer, 2026-11): 2 attachments, 1 MB each. Configurable downwards or,
  // if SEF raises them, upwards.
  const maxAtt = Number(setting(env.SEF_MCP_MAX_ATTACHMENT_BYTES) ?? 1024 * 1024);
  const maxCount = Number(setting(env.SEF_MCP_MAX_ATTACHMENTS) ?? 2);
  return {
    env: sefEnv,
    apiKey,
    // Profile defaults to <dataDir>/profile.json so a guided setup can create it in place.
    profilePath: profileSetting ? resolve(profileSetting) : join(dataDir, "profile.json"),
    // One data dir may serve both environments: every audit entry records its env, and the
    // duplicate-number check filters by it.
    dataDir,
    // Attachments are always confined to one folder; without a setting it is <dataDir>/prilozi.
    attachmentsDir: attachmentsSetting ? resolve(attachmentsSetting) : join(dataDir, "prilozi"),
    readOnly: bool(env.SEF_MCP_READ_ONLY),
    allowProdWrite: bool(env.SEF_MCP_ALLOW_PROD_WRITE),
    maxAttachmentBytes: Number.isFinite(maxAtt) && maxAtt > 0 ? maxAtt : 1024 * 1024,
    maxAttachments: Number.isInteger(maxCount) && maxCount >= 0 ? maxCount : 2,
    requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    problems,
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
