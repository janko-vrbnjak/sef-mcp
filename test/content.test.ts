/**
 * Resources and prompts as a client sees them: over MCP from a running server, with no mocks.
 * The tests stay at contract level and avoid importing markdown renderers or internal data arrays.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pluginRef = (f: string) =>
  readFileSync(
    join(root, "plugins/sef-fakture/skills/sef-fakturisanje/references", f),
    "utf8",
  );

/** A key passed to the server; if it appears in output, redaction leaked a secret. */
const SENTINEL_KEY = "sef-content-test-key";

const PROMPTS = [
  "mesecna-faktura",
  "podesavanje-firme",
  "status-fakture",
  "storno-ili-otkazivanje",
] as const;
const RESOURCES = [
  "sef-mcp://docs/greske",
  "sef-mcp://docs/pravila",
  "sef-mcp://docs/statusi",
] as const;
const SAFETY = [/izričitog odobrenja/, /API ključ/, /DEMO ili PRODUKCIJA/];
const MUST_HAVE_ERROR_CODES = [
  "InvoiceDeliveryDateMissing",
  "VATCategoryNotAllowed",
  "RS-R-005",
  "HTTP 401",
  "HTTP 403",
] as const;
const STATUS_ACTION: Record<
  string,
  "sef_cancel_invoice" | "sef_storno_invoice" | "none"
> = {
  Draft: "sef_cancel_invoice",
  New: "sef_cancel_invoice",
  Mistake: "sef_cancel_invoice",
  Sent: "sef_storno_invoice",
  Approved: "sef_storno_invoice",
  Rejected: "sef_storno_invoice",
  Cancelled: "none",
  Storno: "none",
};

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") assert.fail(`${label} is missing`);
  return value;
}

function firstColumnRow(markdown: string, token: string): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = markdown
    .split("\n")
    .find((line) => new RegExp(`^\\|\\s*\`?${escaped}\`?\\s*\\|`).test(line));
  assert.ok(row, `missing table row for ${token}`);
  return row;
}

function rowCells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function errorCodes(markdown: string): string[] {
  const out = new Set<string>();
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\|\s*`?([A-Za-z0-9-]+(?:\s+\d{3})?)`?\s*\|/);
    if (!m) continue;
    const token = asString(m[1], "error table token");
    if (token === "Šifra" || token === "Šifra / status") continue;
    out.add(token);
  }
  return [...out].sort();
}

function statusCodes(markdown: string): string[] {
  const out = new Set<string>();
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\|\s*`?([A-Za-z]+)`?\s*\|/);
    if (!m) continue;
    const token = asString(m[1], "status table token");
    if (token === "Status") continue;
    out.add(token);
  }
  return [...out].sort();
}

function environmentLabel(rules: string): "DEMO" | "PRODUKCIJA" {
  const found = rules.match(/Okruženje sada: (?:\*\*)?(DEMO|PRODUKCIJA)/);
  assert.ok(found, "rules document does not name the environment");
  return found[1] as "DEMO" | "PRODUKCIJA";
}

function realInvoiceSending(rules: string): "uključeno" | "isključeno" {
  const found = rules.match(
    /slanje pravih faktura (?:\*\*)?(isključeno|uključeno)/,
  );
  assert.ok(
    found,
    "rules document does not say whether sending real invoices is on",
  );
  return found[1] as "uključeno" | "isključeno";
}

function promptText(response: {
  result?: { messages?: Array<{ content?: { text?: string } }> };
  error?: unknown;
}): string {
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return asString(response.result?.messages?.[0]?.content?.text, "prompt text");
}

function resourceText(response: {
  result?: { contents?: Array<{ text?: string }> };
  error?: unknown;
}): string {
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return asString(response.result?.contents?.[0]?.text, "resource text");
}

function assertNoSecretLeak(texts: string[]): void {
  for (const text of texts) assert.equal(text.includes(SENTINEL_KEY), false);
}

function rpc(
  requests: Array<{ method: string; params?: unknown }>,
  env: Record<string, string> = {},
): Promise<{ results: any[]; stderr: string }> {
  const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));
  const dataDir = mkdtempSync(join(tmpdir(), "sef-content-"));
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, "serve"], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: tmpdir(),
        ...env,
        SEF_MCP_DATA_DIR: dataDir,
        SEF_API_KEY_DEMO: SENTINEL_KEY,
        SEF_API_KEY_PROD: SENTINEL_KEY,
      },
    });
    const all = [
      {
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t", version: "1" },
        },
      },
      ...requests,
    ];
    const results = new Map<number, any>();
    let buf = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout; stderr: ${err}`));
    }, 15000);
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      if (results.size === all.length) return;
      clearTimeout(timer);
      reject(new Error(`exited with ${code}; stderr: ${err}`));
    });
    child.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (typeof msg.id !== "number") continue;
        results.set(msg.id, msg);
        if (msg.id === 0) {
          child.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
            }) + "\n",
          );
          requests.forEach((r, i) =>
            child.stdin.write(
              JSON.stringify({ jsonrpc: "2.0", id: i + 1, ...r }) + "\n",
            ),
          );
        }
        if (results.size === all.length) {
          clearTimeout(timer);
          child.kill();
          resolvePromise({
            results: requests.map((_, i) => results.get(i + 1)),
            stderr: err,
          });
        }
      }
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 0, ...all[0] }) + "\n",
    );
  });
}

async function readRules(env: Record<string, string>): Promise<string> {
  const { results, stderr } = await rpc(
    [{ method: "resources/read", params: { uri: "sef-mcp://docs/pravila" } }],
    env,
  );
  const text = resourceText(results[0]);
  assertNoSecretLeak([stderr, text]);
  return text;
}

test("server exposes the prompt and resource catalog that clients rely on", async () => {
  const [prompts, resources] = (
    await rpc([{ method: "prompts/list" }, { method: "resources/list" }])
  ).results;
  assert.deepEqual(
    prompts.result.prompts.map((p: { name: string }) => p.name).sort(),
    [...PROMPTS].sort(),
  );
  assert.deepEqual(
    resources.result.resources.map((r: { uri: string }) => r.uri).sort(),
    [...RESOURCES].sort(),
  );
});

test("error-resource rows are complete and stay aligned with plugin references", async () => {
  const [{ result }] = (
    await rpc([
      { method: "resources/read", params: { uri: "sef-mcp://docs/greske" } },
    ])
  ).results;
  const served = asString(result.contents?.[0]?.text, "served errors resource");
  const plugin = pluginRef("greske.md");
  assertNoSecretLeak([served, plugin]);

  const servedCodes = errorCodes(served);
  const pluginCodes = errorCodes(plugin);
  assert.deepEqual(servedCodes, pluginCodes);
  for (const code of MUST_HAVE_ERROR_CODES)
    assert.ok(servedCodes.includes(code));

  for (const code of servedCodes) {
    const servedCells = rowCells(firstColumnRow(served, code));
    assert.equal(servedCells.length, 4, `${code} row should have 4 columns`);
    assert.ok(servedCells[1], `${code} row should explain the problem`);
    assert.ok(servedCells[2], `${code} row should explain what to do`);
    firstColumnRow(plugin, code);
  }
});

test("status-resource actions match SEF rules and plugin references", async () => {
  const [{ result }] = (
    await rpc([
      { method: "resources/read", params: { uri: "sef-mcp://docs/statusi" } },
    ])
  ).results;
  const served = asString(
    result.contents?.[0]?.text,
    "served statuses resource",
  );
  const plugin = pluginRef("statusi.md");
  assertNoSecretLeak([served, plugin]);

  const expectedStatuses = Object.keys(STATUS_ACTION).sort();
  assert.deepEqual(statusCodes(served), expectedStatuses);
  assert.deepEqual(statusCodes(plugin), expectedStatuses);

  for (const [status, action] of Object.entries(STATUS_ACTION)) {
    for (const markdown of [served, plugin]) {
      const row = firstColumnRow(markdown, status);
      if (action === "none") {
        assert.equal(row.includes("sef_cancel_invoice"), false, status);
        assert.equal(row.includes("sef_storno_invoice"), false, status);
        assert.match(row, /Ništa/);
      } else {
        assert.ok(row.includes(action), `${status} should name ${action}`);
      }
    }
  }
  for (const markdown of [served, plugin]) {
    assert.match(markdown, /Accepted/);
    assert.match(markdown, /Approved/);
  }
});

test("every prompt repeats safety rules and handles optional arguments correctly", async () => {
  const promptGets = [
    ...PROMPTS.map((name) => ({
      method: "prompts/get",
      params: { name, arguments: {} },
    })),
    {
      method: "prompts/get",
      params: {
        name: "mesecna-faktura",
        arguments: { kupac: "acme", period: "oktobar 2026" },
      },
    },
    {
      method: "prompts/get",
      params: { name: "status-fakture", arguments: { faktura: "123" } },
    },
    {
      method: "prompts/get",
      params: {
        name: "storno-ili-otkazivanje",
        arguments: { faktura: "123", razlog: "pogrešan iznos" },
      },
    },
  ];
  const { results, stderr } = await rpc(promptGets);
  assertNoSecretLeak([stderr]);

  const bare = Object.fromEntries(
    PROMPTS.map((name, i) => [name, promptText(results[i])]),
  ) as Record<(typeof PROMPTS)[number], string>;
  const monthly = promptText(results[PROMPTS.length]);
  const statusPrompt = promptText(results[PROMPTS.length + 1]);
  const cancelPrompt = promptText(results[PROMPTS.length + 2]);

  assertNoSecretLeak([
    ...Object.values(bare),
    monthly,
    statusPrompt,
    cancelPrompt,
  ]);
  for (const text of [
    ...Object.values(bare),
    monthly,
    statusPrompt,
    cancelPrompt,
  ]) {
    for (const rule of SAFETY) assert.match(text, rule);
  }

  assert.match(monthly, /Kupac: acme/);
  assert.match(monthly, /Period usluge: oktobar 2026/);
  assert.doesNotMatch(bare["mesecna-faktura"], /Kupac:/);
  assert.doesNotMatch(bare["mesecna-faktura"], /Period usluge:/);

  assert.match(statusPrompt, /Faktura \(SEF broj ili broj fakture\): 123/);
  assert.doesNotMatch(
    bare["status-fakture"],
    /Faktura \(SEF broj ili broj fakture\):/,
  );

  assert.match(cancelPrompt, /Faktura \(SEF broj\): 123/);
  assert.match(cancelPrompt, /Razlog: pogrešan iznos/);
  assert.doesNotMatch(bare["storno-ili-otkazivanje"], /Faktura \(SEF broj\):/);
  assert.doesNotMatch(bare["storno-ili-otkazivanje"], /Razlog:/);
});

test("rules document reflects runtime environment and write switch", async () => {
  const demo = await readRules({
    SEF_ENV: "demo",
    SEF_MCP_ALLOW_PROD_WRITE: "true",
    SEF_MCP_MAX_ATTACHMENTS: "1",
    SEF_MCP_MAX_ATTACHMENT_BYTES: "2048",
  });
  assert.equal(environmentLabel(demo), "DEMO");
  assert.equal(realInvoiceSending(demo), "isključeno");
  assert.match(demo, /1 PDF/);
  assert.match(demo, /do 2 KB/);

  const prodBlocked = await readRules({ SEF_ENV: "prod" });
  assert.equal(environmentLabel(prodBlocked), "PRODUKCIJA");
  assert.equal(realInvoiceSending(prodBlocked), "isključeno");

  const prodAllowed = await readRules({
    SEF_ENV: "prod",
    SEF_MCP_ALLOW_PROD_WRITE: "true",
  });
  assert.equal(environmentLabel(prodAllowed), "PRODUKCIJA");
  assert.equal(realInvoiceSending(prodAllowed), "uključeno");
});
