// Management Agent — Lovable AI powered chat agent.
// TEST MODE: no auth. Re-enable JWT + per-user RLS before production.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "npm:ai";
import { z } from "npm:zod";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BFF_BASE_URL =
  Deno.env.get("PANTHEON_BFF_BASE_URL") ??
  "https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io";

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: "https://ai.gateway.lovable.dev/v1",
  headers: {
    "Lovable-API-Key": LOVABLE_API_KEY,
    "X-Lovable-AIG-SDK": "vercel-ai-sdk",
  },
});

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SYSTEM_PROMPT = `You are the Pantheon Management Cockpit assistant — a senior operator copilot.

You can:
- Answer questions about the management cockpit using BFF tools (cockpit metrics, persona league, portfolio book, human inbox, trading pulse, alerts).
- Navigate the user to any management surface by calling the \`navigate\` tool.
- Propose high-risk actions (approve/reject human-inbox items, create ask/intervention, trigger readiness checks) — these require user approval before execution.
- Answer general product/usage questions about the Pantheon Management UI.

Rules:
- Always cite real data from tool results; never invent numbers.
- Respond in the user's language (default: 繁體中文; English when prompted in English).
- Before any destructive or governance-touching action, briefly explain why and what will happen.
- Available surfaces: /management/cockpit, /management/persona-fleet, /management/human-inbox, /management/trading-pulse, /management/portfolio-book, /management/persona-league, /management/quarterly-ranking, /management/performance-attribution, /management/evolution-journal, /management/evidence, /management/sentinel, /management/interventions, /management/readiness/{bff-ha,broker-live,capital-binding-live,ep5,strict-publish}.
- Keep responses concise. Use markdown.`;

async function bffGet(path: string): Promise<unknown> {
  const r = await fetch(`${BFF_BASE_URL}${path}`);
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text.slice(0, 2000) }; }
}

function buildTools() {
  return {
    navigate: tool({
      description: "Navigate the user's browser to a management surface route. Use absolute paths like /management/human-inbox.",
      inputSchema: z.object({
        href: z.string().describe("App route, e.g. /management/cockpit"),
        reason: z.string().optional(),
      }),
    }),
    query_cockpit: tool({
      description: "Fetch the management cockpit snapshot.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/cockpit"),
    }),
    query_persona_league: tool({
      description: "Fetch persona league rankings.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/persona-league"),
    }),
    query_portfolio_book: tool({
      description: "Fetch portfolio book overview.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/portfolio-book"),
    }),
    query_trading_pulse: tool({
      description: "Fetch trading pulse comparison.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/trading-pulse"),
    }),
    query_human_inbox: tool({
      description: "List human inbox items.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/approvals"),
    }),
    query_alerts: tool({
      description: "List recent system alerts.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/alerts"),
    }),
    decide_inbox_item: tool({
      description: "Approve, reject, or defer a human-inbox item. HIGH RISK — requires user approval.",
      inputSchema: z.object({
        itemId: z.string(),
        action: z.enum(["approve", "reject", "defer"]),
        reason: z.string().min(3),
      }),
      needsApproval: true,
      execute: async ({ itemId, action, reason }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/approvals/${encodeURIComponent(itemId)}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    create_ask: tool({
      description: "Open an Ask channel. HIGH RISK — requires user approval.",
      inputSchema: z.object({ target: z.string(), question: z.string().min(3) }),
      needsApproval: true,
      execute: async ({ target, question }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, question }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    create_intervention: tool({
      description: "Submit an intervention. HIGH RISK — requires user approval.",
      inputSchema: z.object({
        target: z.string(),
        kind: z.string(),
        payload: z.record(z.unknown()).optional(),
      }),
      needsApproval: true,
      execute: async ({ target, kind, payload }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/interventions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, kind, payload: payload ?? {} }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    trigger_readiness: tool({
      description: "Trigger a readiness re-check. HIGH RISK — requires user approval.",
      inputSchema: z.object({
        check: z.enum(["bff-ha", "broker-live", "capital-binding-live", "ep5", "strict-publish"]),
      }),
      needsApproval: true,
      execute: async ({ check }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/management/readiness/${check}/probe`, {
          method: "POST",
        });
        return { status: r.status, ok: r.ok };
      },
    }),
  };
}

const responseHeaders = { ...corsHeaders, "X-Pantheon-Test-Mode": "true" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });

  console.warn("[management-agent] TEST MODE: no auth");

  try {
    const body = await req.json() as { messages: UIMessage[]; threadId: string; anonId: string };
    const { messages, threadId, anonId } = body;
    if (!Array.isArray(messages) || !threadId || !anonId) {
      return new Response(JSON.stringify({ error: "Invalid request: messages, threadId, anonId required" }), {
        status: 400, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify thread exists & belongs to this anonId; auto-create if missing.
    const { data: thread } = await admin
      .from("chat_threads")
      .select("id, user_id, title")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread) {
      await admin.from("chat_threads").insert({ id: threadId, user_id: anonId, title: "New conversation" });
    } else if (thread.user_id !== anonId) {
      return new Response(JSON.stringify({ error: "Thread not owned by this session" }), {
        status: 403, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist newest user message.
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      const { error: insErr } = await admin.from("chat_messages").insert({
        thread_id: threadId,
        user_id: anonId,
        role: "user",
        parts: last.parts ?? [],
        message_id: last.id ?? null,
      });
      if (insErr) console.error("[management-agent] insert user msg failed", insErr);

      if (thread?.title === "New conversation" || !thread) {
        const text = (last.parts ?? [])
          .filter((p: { type: string }) => p.type === "text")
          .map((p: { text?: string }) => p.text ?? "")
          .join(" ")
          .slice(0, 80);
        if (text) {
          await admin.from("chat_threads").update({ title: text }).eq("id", threadId);
        }
      }
    }

    const tools = buildTools();
    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: responseHeaders,
      onFinish: async ({ responseMessage }) => {
        try {
          await admin.from("chat_messages").insert({
            thread_id: threadId,
            user_id: anonId,
            role: "assistant",
            parts: responseMessage.parts ?? [],
            message_id: responseMessage.id ?? null,
          });
          await admin.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        } catch (e) {
          console.error("[management-agent] persist assistant failed", e);
        }
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[management-agent] error", msg);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }
});
