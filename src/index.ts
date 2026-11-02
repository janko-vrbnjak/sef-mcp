#!/usr/bin/env node
/**
 * sef-mcp CLI
 *   sef-mcp serve            start the MCP server on stdio (default)
 *   sef-mcp init <path>      write an example profile to <path>
 *   sef-mcp doctor [--ping]  validate env + profile (and optionally call SEF)
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "./env.js";
import { loadProfile } from "./profile.js";
import { SefTools } from "./tools.js";

function fail(msg: string): never {
  process.stderr.write(`sef-mcp: ${msg}\n`);
  process.exit(1);
}

function setup(): SefTools {
  const cfg = loadRuntimeConfig();
  if (!cfg.profilePath) fail("SEF_MCP_PROFILE is not set. Run `sef-mcp init ./profile.json` and see docs/setup.md.");
  const profile = loadProfile(cfg.profilePath);
  return new SefTools(cfg, profile);
}

async function main(): Promise<void> {
  const [cmd = "serve", ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "serve": {
      const { startServer } = await import("./server.js");
      await startServer(setup());
      return;
    }
    case "init": {
      const target = resolve(rest[0] ?? "profile.json");
      if (existsSync(target)) fail(`${target} already exists; refusing to overwrite.`);
      const here = dirname(fileURLToPath(import.meta.url));
      const example = resolve(here, "..", "..", "examples", "profile.example.json");
      copyFileSync(example, target);
      process.stdout.write(
        `Wrote ${target}\nNext: fill in your company data, then set SEF_MCP_PROFILE=${target} and run \`sef-mcp doctor\`.\n`
      );
      return;
    }
    case "doctor": {
      const tools = setup();
      process.stdout.write(JSON.stringify(tools.checkSetup(), null, 2) + "\n");
      if (rest.includes("--ping")) process.stdout.write(JSON.stringify(await tools.ping(), null, 2) + "\n");
      process.stdout.write("OK\n");
      return;
    }
    default:
      fail(`unknown command "${cmd}". Use: serve | init <path> | doctor [--ping]`);
  }
}

main().catch((err: Error) => fail(err.message));
