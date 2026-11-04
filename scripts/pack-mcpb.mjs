#!/usr/bin/env node
/**
 * Builds the Claude Desktop extension: dist/sef-mcp-<version>.mcpb
 *
 *   npm run pack:mcpb
 *
 * Steps: compile → stage only runtime files in build/mcpb → install production
 * dependencies there (no install scripts) → validate + pack with the official
 * MCPB CLI. The manifest version is taken from package.json.
 *
 * Needs network access to npm the first time (for @anthropic-ai/mcpb via npx).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "build", "mcpb");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

run(npm, ["run", "build"]);

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "dist"), { recursive: true });
cpSync(join(root, "dist", "src"), join(stage, "dist", "src"), { recursive: true });
cpSync(join(root, "examples"), join(stage, "examples"), { recursive: true });
for (const f of ["LICENSE", "README.md", "SECURITY.md"]) cpSync(join(root, f), join(stage, f));

const manifest = JSON.parse(readFileSync(join(root, "packaging", "mcpb", "manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// Keep dependencies + devDependencies so they match package-lock.json (npm ci requires it);
// --omit=dev below installs only the runtime ones. Scripts are dropped.
const { scripts: _scripts, ...runtimePkg } = pkg;
writeFileSync(join(stage, "package.json"), JSON.stringify(runtimePkg, null, 2) + "\n");
cpSync(join(root, "package-lock.json"), join(stage, "package-lock.json"));
run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage);

const out = join(root, "dist", `sef-mcp-${pkg.version}.mcpb`);
run(npx, ["-y", "@anthropic-ai/mcpb", "validate", join(stage, "manifest.json")]);
run(npx, ["-y", "@anthropic-ai/mcpb", "pack", stage, out]);
process.stdout.write(`\nGotovo: ${out}\n`);
