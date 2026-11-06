#!/usr/bin/env node
/**
 * Checks that the repository is ready to be tagged as vX.Y.Z — run it before `git tag`:
 *
 *   npm run release:check -- 0.4.0
 *
 * The release workflow runs the same check, so a tag that fails here would fail there too.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  process.stderr.write("Usage: npm run release:check -- X.Y.Z\n");
  process.exit(2);
}
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const lock = json("package-lock.json");
const server = json("server.json");
const url = `https://github.com/janko-vrbnjak/sef-mcp/releases/download/v${version}/sef-mcp.mcpb`;

const checks = [
  ["package.json version", json("package.json").version === version],
  ["package-lock.json version", lock.version === version && lock.packages?.[""]?.version === version],
  ["plugins/sef-fakture/.claude-plugin/plugin.json version", json("plugins/sef-fakture/.claude-plugin/plugin.json").version === version],
  ["server.json version", server.version === version],
  ["server.json package URL", server.packages?.[0]?.identifier === url],
  [`docs/releases/v${version}.md exists`, existsSync(join(root, "docs", "releases", `v${version}.md`))],
  [`CHANGELOG.md has ## [${version}]`, readFileSync(join(root, "CHANGELOG.md"), "utf8").includes(`## [${version}]`)],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) process.stdout.write(`${ok ? "ok  " : "FAIL"} ${name}\n`);
if (failed.length) {
  process.stderr.write(`\nNot ready for v${version}: fix the ${failed.length} item(s) above before tagging.\n`);
  process.exit(1);
}
process.stdout.write(`\nReady: git tag v${version} && git push origin v${version}\n`);
