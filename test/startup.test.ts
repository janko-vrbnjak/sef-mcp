/**
 * Startup robustness: the server must answer `initialize` even with the values the Claude Desktop
 * extension passes for untouched fields (empty strings, unsubstituted placeholders) or a broken profile.
 * Regression for 0.2.1: an empty SEF_ENV made the process exit right after start.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../src/env.js";

const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));

function initialize(env: Record<string, string>): Promise<{ response: any; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, "serve"], { env: { PATH: process.env.PATH ?? "", HOME: tmpdir(), ...env } });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no initialize response; stderr: ${err}`));
    }, 8000);
    child.stdout.on("data", (d) => {
      out += d;
      const line = out.split("\n").find((l) => l.includes('"id":0'));
      if (line) {
        clearTimeout(timer);
        child.kill();
        resolvePromise({ response: JSON.parse(line), stderr: err });
      }
    });
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!out.includes('"id":0')) reject(new Error(`exited with ${code} before answering; stderr: ${err}`));
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) + "\n"
    );
  });
}

const untouchedExtensionFields = (dataDir: string) => ({
  SEF_ENV: "",
  SEF_API_KEY_DEMO: "",
  SEF_API_KEY_PROD: "",
  SEF_MCP_ALLOW_PROD_WRITE: "",
  SEF_MCP_DATA_DIR: dataDir,
  SEF_MCP_ATTACHMENTS_DIR: "",
});

test("answers initialize with untouched extension fields (empty strings)", async () => {
  const { response } = await initialize(untouchedExtensionFields(mkdtempSync(join(tmpdir(), "sef-start-"))));
  assert.equal(response.result.serverInfo.name, "sef-mcp");
  assert.notEqual(response.result.serverInfo.version, "0.1.0");
});

test("answers initialize with unsubstituted placeholders and a broken profile", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "sef-start-"));
  writeFileSync(join(dataDir, "profile.json"), "{ not json");
  const { response, stderr } = await initialize({
    ...untouchedExtensionFields(dataDir),
    SEF_ENV: "${user_config.sef_env}",
    SEF_MCP_ATTACHMENTS_DIR: "${user_config.attachments_dir}",
  });
  assert.ok(response.result);
  assert.match(stderr, /Profil firme nije ispravan/);
});

test("empty, placeholder and invalid settings fall back to safe defaults and are reported", () => {
  assert.equal(loadRuntimeConfig({ SEF_ENV: "" }).env, "demo");
  assert.equal(loadRuntimeConfig({ SEF_ENV: "${user_config.sef_env}" }).env, "demo");
  assert.equal(loadRuntimeConfig({ SEF_ENV: " PROD " }).env, "prod");
  const bad = loadRuntimeConfig({ SEF_ENV: "produkcija" });
  assert.equal(bad.env, "demo");
  assert.ok(bad.problems[0]?.includes("produkcija"));
  assert.equal(loadRuntimeConfig({ SEF_MCP_ALLOW_PROD_WRITE: "${user_config.allow_prod_write}" }).allowProdWrite, false);
  const fallback = loadRuntimeConfig({ SEF_MCP_DATA_DIR: "/tmp/sef-x", SEF_MCP_ATTACHMENTS_DIR: "${HOME}/x" });
  assert.equal(fallback.attachmentsDir, join("/tmp/sef-x", "prilozi"));
  assert.deepEqual(loadRuntimeConfig({ SEF_ENV: "", SEF_MCP_DATA_DIR: "" }).problems, []);
});
