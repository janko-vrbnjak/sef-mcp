/**
 * Distribution contract: the repo is a plugin marketplace, versions move together, and the skills'
 * minimum server version never exceeds what this release ships.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_VERSION } from "../src/version.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const cmp = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

test("repository is a marketplace whose plugin entry points at the real plugin", () => {
  const m = json(".claude-plugin/marketplace.json");
  assert.equal(m.name, "sef-mcp");
  assert.equal(m.plugins.length, 1);
  const entry = m.plugins[0];
  assert.ok(entry.source.startsWith("./"));
  const manifest = join(root, entry.source, ".claude-plugin", "plugin.json");
  assert.ok(existsSync(manifest), `missing ${manifest}`);
  assert.equal(JSON.parse(readFileSync(manifest, "utf8")).name, entry.name);
});

test("server, package and plugin versions are the same", () => {
  const pkg = json("package.json").version;
  assert.equal(SERVER_VERSION, pkg);
  assert.equal(json("plugins/sef-fakture/.claude-plugin/plugin.json").version, pkg);
});

test("both skills state the same minimum server version, not newer than this release", () => {
  const re = /Minimum sef-mcp server version: (\d+\.\d+\.\d+)/;
  const mins = ["sef-podesavanje", "sef-fakturisanje"].map((s) => {
    const text = readFileSync(join(root, "plugins/sef-fakture/skills", s, "SKILL.md"), "utf8");
    const m = re.exec(text);
    assert.ok(m, `${s}: no minimum version marker`);
    return m[1]!;
  });
  assert.equal(mins[0], mins[1]);
  assert.ok(cmp(mins[0]!, json("package.json").version) <= 0, "minimum server version is newer than this release");
});
