#!/usr/bin/env node
/**
 * Packs the Claude plugin (skills) into dist/sef-fakture-<version>.plugin
 *   npm run pack:plugin
 * Uses the system `zip` (macOS/Linux) or PowerShell Compress-Archive (Windows).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "plugins", "sef-fakture");
const { version } = JSON.parse(readFileSync(join(src, ".claude-plugin", "plugin.json"), "utf8"));
mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", `sef-fakture-${version}.plugin`);
rmSync(out, { force: true });

if (process.platform === "win32") {
  const zip = out.replace(/\.plugin$/, ".zip");
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${src}\\*','${src}\\.claude-plugin' -DestinationPath '${zip}' -Force; Move-Item '${zip}' '${out}' -Force`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-X", out, ".", "-x", "*.DS_Store"], { cwd: src, stdio: "inherit" });
}
process.stdout.write(`\nGotovo: ${out}\n`);
