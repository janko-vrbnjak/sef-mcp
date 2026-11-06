#!/usr/bin/env node
/**
 * Writes the server.json that is published to the official MCP Registry:
 *
 *   node scripts/registry-server-json.mjs <path to the released sef-mcp.mcpb> [out=build/server.json]
 *
 * The committed server.json has no fileSha256 on purpose: the hash belongs to the exact file on the
 * GitHub Release, so CI computes it from the downloaded release asset. The script refuses to run
 * when server.json and package.json disagree on the version or the download URL.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [mcpbPath, outArg] = process.argv.slice(2);
if (!mcpbPath) {
  process.stderr.write("Usage: node scripts/registry-server-json.mjs <sef-mcp.mcpb> [out]\n");
  process.exit(2);
}

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
const expectedUrl = `https://github.com/janko-vrbnjak/sef-mcp/releases/download/v${version}/sef-mcp.mcpb`;
const pkg = server.packages?.[0];

const problems = [];
if (server.version !== version) problems.push(`server.json version ${server.version} != package.json ${version}`);
if (server.packages?.length !== 1 || pkg?.registryType !== "mcpb") problems.push("server.json must have exactly one mcpb package");
if (pkg?.identifier !== expectedUrl) problems.push(`identifier must be ${expectedUrl}`);
if (problems.length) {
  process.stderr.write(problems.map((p) => `server.json: ${p}\n`).join(""));
  process.exit(1);
}

pkg.fileSha256 = createHash("sha256").update(readFileSync(mcpbPath)).digest("hex");
const out = resolve(outArg ?? join(root, "build", "server.json"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(server, null, 2) + "\n");
process.stdout.write(`${out}\nfileSha256 ${pkg.fileSha256}\n`);
