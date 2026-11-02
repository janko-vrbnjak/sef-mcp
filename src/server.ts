/**
 * MCP wiring (stdio). Thin layer over SefTools.
 *
 * Tool annotations tell the client which tools change state, so clients like
 * Claude Desktop ask the user before running send/cancel.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { redact } from "./safety.js";
import { DraftInvoiceInput, type DraftInvoiceArgs, SefTools } from "./tools.js";

const VERSION = "0.1.0";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export async function startServer(tools: SefTools): Promise<void> {
  const server = new McpServer({ name: "sef-mcp", version: VERSION });
  const secrets = [tools.cfg.apiKey];

  const wrap =
    <A>(fn: (args: A) => unknown | Promise<unknown>) =>
    async (args: A): Promise<ToolResult> => {
      try {
        const out = await fn(args);
        return { content: [{ type: "text", text: redact(JSON.stringify(out, null, 2), secrets) }] };
      } catch (err) {
        const e = err as Error & { body?: string; status?: number };
        const detail = [e.message, e.status ? `HTTP ${e.status}` : "", e.body ?? ""].filter(Boolean).join("\n");
        return { content: [{ type: "text", text: redact(detail, secrets) }], isError: true };
      }
    };

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const readOnlyRemote = { ...readOnly, openWorldHint: true };

  server.registerTool(
    "sef_check_setup",
    {
      title: "Check sef-mcp setup",
      description: "Shows environment (demo/prod), safety switches and profile summary. Makes no network calls.",
      inputSchema: {},
      annotations: readOnly,
    },
    wrap(() => tools.checkSetup())
  );

  server.registerTool(
    "sef_ping",
    {
      title: "Test SEF connection",
      description: "Calls a harmless read-only SEF endpoint to confirm the API key and environment work.",
      inputSchema: {},
      annotations: readOnlyRemote,
    },
    wrap(() => tools.ping())
  );

  server.registerTool(
    "sef_list_customers",
    {
      title: "List customers",
      description: "Lists customers defined in the local profile (id, name, PIB, defaults).",
      inputSchema: {},
      annotations: readOnly,
    },
    wrap(() => tools.listCustomers())
  );

  server.registerTool(
    "sef_list_vat_exemption_reasons",
    {
      title: "List VAT exemption reasons",
      description: "Returns SEF's official list of VAT exemption reason codes (e.g. PDV-RS-33).",
      inputSchema: {},
      annotations: readOnlyRemote,
    },
    wrap(() => tools.vatExemptionReasons())
  );

  server.registerTool(
    "sef_draft_invoice",
    {
      title: "Draft an invoice (no sending)",
      description:
        "Builds a UBL 2.1 invoice locally from the profile and the given lines, stores it as a draft and returns " +
        "totals plus an approvalCode. Nothing is sent to SEF. Always show the result to the user before sending.",
      inputSchema: DraftInvoiceInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    wrap((args: DraftInvoiceArgs) => tools.draftInvoice(args))
  );

  server.registerTool(
    "sef_get_draft",
    {
      title: "Read a draft",
      description: "Returns a stored draft's summary, optionally with the full XML.",
      inputSchema: { draftId: z.string(), includeXml: z.boolean().optional() },
      annotations: readOnly,
    },
    wrap((a: { draftId: string; includeXml?: boolean }) => tools.getDraft(a.draftId, a.includeXml))
  );

  server.registerTool(
    "sef_send_invoice",
    {
      title: "Send an approved draft to SEF",
      description:
        "Uploads a previously drafted invoice to SEF. Requires the draftId and the approvalCode the user approved. " +
        "Only call after the user explicitly approved this exact draft. In prod it also requires SEF_MCP_ALLOW_PROD_WRITE=true.",
      inputSchema: { draftId: z.string(), approvalCode: z.string().length(8) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    wrap((a: { draftId: string; approvalCode: string }) => tools.sendInvoice(a.draftId, a.approvalCode))
  );

  server.registerTool(
    "sef_get_invoice",
    {
      title: "Get sales invoice from SEF",
      description: "Returns a sales invoice and its status from SEF by SEF invoiceId.",
      inputSchema: { invoiceId: z.number().int().positive() },
      annotations: readOnlyRemote,
    },
    wrap((a: { invoiceId: number }) => tools.getInvoice(a.invoiceId))
  );

  server.registerTool(
    "sef_list_invoice_ids",
    {
      title: "List sales invoice ids",
      description: "Lists SEF sales invoice ids by status within a date range.",
      inputSchema: {
        status: z.string().describe("SEF status, e.g. Sent, Accepted, Rejected, Cancelled, Storno"),
        dateFrom: z.string().describe("ISO date-time"),
        dateTo: z.string().describe("ISO date-time"),
      },
      annotations: readOnlyRemote,
    },
    wrap((a: { status: string; dateFrom: string; dateTo: string }) => tools.listInvoiceIds(a.status, a.dateFrom, a.dateTo))
  );

  server.registerTool(
    "sef_cancel_invoice",
    {
      title: "Cancel an invoice not yet delivered",
      description:
        "Cancels a sales invoice on SEF. SEF allows this only for status Draft, New or Sending error; " +
        "for Sent/Accepted/Rejected use sef_storno_invoice. Only call after explicit user approval.",
      inputSchema: { invoiceId: z.number().int().positive(), comment: z.string().min(3).max(1000) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    wrap((a: { invoiceId: number; comment: string }) => tools.cancelInvoice(a.invoiceId, a.comment))
  );

  server.registerTool(
    "sef_storno_invoice",
    {
      title: "Storno a sent invoice",
      description:
        "Reverses (storno) a sales invoice on SEF. SEF allows this only for status Sent, Accepted or Rejected. " +
        "Only call after explicit user approval.",
      inputSchema: {
        invoiceId: z.number().int().positive(),
        comment: z.string().min(3).max(1000),
        stornoNumber: z.string().max(100).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    wrap((a: { invoiceId: number; comment: string; stornoNumber?: string }) =>
      tools.stornoInvoice(a.invoiceId, a.comment, a.stornoNumber)
    )
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the protocol channel; diagnostics go to stderr only.
  process.stderr.write(`sef-mcp ${VERSION} running on stdio (env=${tools.cfg.env}, readOnly=${tools.cfg.readOnly})\n`);
}
