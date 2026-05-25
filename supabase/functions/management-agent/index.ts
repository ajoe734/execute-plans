// Management Agent — Lovable AI powered chat agent for Pantheon Management Cockpit.
// Streams tokens via AI SDK and persists messages per-user.
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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
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

const SYSTEM_PROMPT = `You are the Pantheon Management Cockpit assistant — a senior operator copilot.

You can:
- Answer questions about the management cockpit using BFF tools (cockpit metrics, persona league, portfolio book, human inbox, trading pulse).
- Navigate the user to any management surface by calling the \`navigate\` tool.
- Propose high-risk actions (approve/reject human-inbox items, create ask/intervention, trigger readiness checks) — these require user approval before execution.

Rules:
- Always cite real data from tool results; never invent numbers.
- Respond in the user's language (default: 繁體中文; English when prompted in English).
- Before any destructive or governance-touching action, briefly explain why and what will happen.
- Available surfaces: /management/cockpit, /persona-fleet, /human-inbox, /trading-pulse, /portfolio-book, /persona-league, /quarterly-ranking, /performance-attribution, /evolution-journal, /evidence, /sentinel, /interventions, /readiness/{bff-ha,broker-live,capital-binding-live,ep5,strict-publish}.
- Keep responses concise. Use markdown.`;

async function bffGet(path: string, token?: string): Promise<unknown> {
  const r = await fetch(`${BFF_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text.slice(0, 2000) }; }
}

function buildTools(bffToken?: string) {
  return {
    navigate: tool({
      description: "Navigate the user's browser to a management surface route. Use absolute paths like /management/human-inbox.",
      inputSchema: z.object({
        href: z.string().describe("App route, e.g. /management/cockpit"),
        reason: z.string().optional(),
      }),
      // No execute — handled client-side by the React app.
    }),
    query_cockpit: tool({
      description: "Fetch the management cockpit snapshot (KPIs, anomalies, readiness).",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/cockpit", bffToken),
    }),
    query_persona_league: tool({
      description: "Fetch persona league rankings and movers.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/persona-league", bffToken),
    }),
    query_portfolio_book: tool({
      description: "Fetch portfolio book overview (positions, exposure, holdings).",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/portfolio-book", bffToken),
    }),
    query_trading_pulse: tool({
      description: "Fetch trading pulse comparison (paper/canary/live vs baseline).",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/management/trading-pulse", bffToken),
    }),
    query_human_inbox: tool({
      description: "List items in the human inbox that require human attention.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/approvals", bffToken),
    }),
    query_alerts: tool({
      description: "List the most recent system alerts.",
      inputSchema: z.object({}),
      execute: async () => bffGet("/bff/alerts", bffToken),
    }),
    decide_inbox_item: tool({
      description: "Approve, reject, or defer a human-inbox item. HIGH RISK — needs user approval before execution.",
      inputSchema: z.object({
        itemId: z.string(),
        action: z.enum(["approve", "reject", "defer"]),
        reason: z.string().min(3),
      }),
      needsApproval: true,
      execute: async ({ itemId, action, reason }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/approvals/${encodeURIComponent(itemId)}/decision`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bffToken ? { Authorization: `Bearer ${bffToken}` } : {}),
          },
          body: JSON.stringify({ action, reason }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    create_ask: tool({
      description: "Open an Ask channel to a persona/target. HIGH RISK — needs user approval.",
      inputSchema: z.object({
        target: z.string().describe("Persona or surface id"),
        question: z.string().min(3),
      }),
      needsApproval: true,
      execute: async ({ target, question }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bffToken ? { Authorization: `Bearer ${bffToken}` } : {}),
          },
          body: JSON.stringify({ target, question }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    create_intervention: tool({
      description: "Submit an intervention against a target. HIGH RISK — needs user approval.",
      inputSchema: z.object({
        target: z.string(),
        kind: z.string(),
        payload: z.record(z.unknown()).optional(),
      }),
      needsApproval: true,
      execute: async ({ target, kind, payload }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/interventions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bffToken ? { Authorization: `Bearer ${bffToken}` } : {}),
          },
          body: JSON.stringify({ target, kind, payload: payload ?? {} }),
        });
        return { status: r.status, ok: r.ok };
      },
    }),
    trigger_readiness: tool({
      description: "Trigger a readiness re-check. HIGH RISK — needs user approval.",
      inputSchema: z.object({
        check: z.enum(["bff-ha", "broker-live", "capital-binding-live", "ep5", "strict-publish"]),
      }),
      needsApproval: true,
      execute: async ({ check }) => {
        const r = await fetch(`${BFF_BASE_URL}/bff/management/readiness/${check}/probe`, {
          method: "POST",
          headers: bffToken ? { Authorization: `Bearer ${bffToken}` } : {},
        });
        return { status: r.status, ok: r.ok };
      },
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userToken = authHeader.slice(7);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body = await req.json() as { messages: UIMessage[]; threadId: string };
    const { messages, threadId } = body;
    if (!Array.isArray(messages) || !threadId) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify thread ownership (RLS enforces but verify explicitly).
    const { data: thread, error: tErr } = await supabase
      .from("chat_threads")
      .select("id, user_id, title")
      .eq("id", threadId)
      .maybeSingle();
    if (tErr || !thread || thread.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist newest user message (last in array if role=user and not yet stored).
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      const { error: insErr } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        user_id: userId,
        role: "user",
        parts: last.parts ?? [],
        message_id: last.id ?? null,
      });
      if (insErr) console.error("[management-agent] insert user msg failed", insErr);

      // Auto-title on first message.
      if (thread.title === "New conversation") {
        const text = (last.parts ?? [])
          .filter((p: { type: string }) => p.type === "text")
          .map((p: { text?: string }) => p.text ?? "")
          .join(" ")
          .slice(0, 80);
        if (text) {
          await supabase.from("chat_threads").update({ title: text }).eq("id", threadId);
        }
      }
    }

    const tools = buildTools(userToken);
    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: corsHeaders,
      onFinish: async ({ responseMessage }) => {
        try {
          await supabase.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "assistant",
            parts: responseMessage.parts ?? [],
            message_id: responseMessage.id ?? null,
          });
          await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
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
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
