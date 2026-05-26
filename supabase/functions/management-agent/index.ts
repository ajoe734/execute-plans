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

type AgentMode = "auto" | "draft" | "confirm" | "agent";

const BASE_SYSTEM_PROMPT = `You are the Pantheon Management Cockpit assistant — a senior operator copilot.

You have FOUR operating modes (chosen by user per message):
- **auto**: low-risk side effects allowed without confirmation (annotate_evidence, query_*).
- **draft**: never write to the backend; produce form drafts via propose_* tools (they only stage payloads + navigate).
- **confirm**: write actions allowed but MUST use needsApproval tools (decide_inbox_item, create_ask, create_intervention, trigger_readiness).
- **agent**: multi-step autonomy; chain query_* → propose_* / decide_* freely. Confirm-tier tools still require approval.

Tool catalogue:
- Read: query_cockpit, query_persona_league, query_portfolio_book, query_trading_pulse, query_human_inbox, query_alerts.
- Navigation: navigate(href).
- Low-risk write (auto): annotate_evidence.
- Draft (draft/agent): propose_inbox_decision, propose_ask. These DO NOT call backend — they only stage a draft and navigate.
- High-risk write (confirm/agent): decide_inbox_item, create_ask, create_intervention, trigger_readiness.

Rules:
- Always cite real data from tool results; never invent numbers or IDs.
- Respond in user's language (default 繁體中文; English when prompted).
- In **draft** mode, NEVER call decide_inbox_item / create_ask / create_intervention / trigger_readiness — use propose_* instead.
- In **auto** mode, NEVER call high-risk write tools either; if user asks for a high-risk action, refuse and suggest switching to confirm/agent.
- In **confirm** mode, prefer needsApproval tools when the user wants to commit.
- Before any destructive action, briefly explain why and what will happen.
- Available surfaces: /management/cockpit, /management/persona-fleet, /management/human-inbox, /management/trading-pulse, /management/portfolio-book, /management/persona-league, /management/quarterly-ranking, /management/performance-attribution, /management/evolution-journal, /management/evidence, /management/sentinel, /management/interventions, /management/readiness/{bff-ha,broker-live,capital-binding-live,ep5,strict-publish}.
- Keep responses concise. Use markdown.`;

function modeHint(mode: AgentMode): string {
  switch (mode) {
    case "auto":
      return `\n\nCURRENT MODE = **auto**. You MAY use annotate_evidence without confirmation. You MAY NOT use any high-risk write tools. Prefer succinct execution.`;
    case "draft":
      return `\n\nCURRENT MODE = **draft**. You MUST NOT call decide_inbox_item / create_ask / create_intervention / trigger_readiness. Use propose_inbox_decision / propose_ask instead — they stage a draft and navigate the user to the relevant page.`;
    case "confirm":
      return `\n\nCURRENT MODE = **confirm** (default). For any backend write, use the needsApproval tools so the user can review and approve.`;
    case "agent":
      return `\n\nCURRENT MODE = **agent**. You may chain multiple tool calls autonomously. High-risk tools still pause for approval. End with a short summary of what you did.`;
  }
}

async function bffGet(path: string): Promise<unknown> {
  const r = await fetch(`${BFF_BASE_URL}${path}`);
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text.slice(0, 2000) }; }
}

function buildTools(mode: AgentMode) {
  const tools: Record<string, ReturnType<typeof tool>> = {
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

    // ─── Low-risk write (auto tier) ─────────────────────────────
    annotate_evidence: tool({
      description: "Attach a tag or short note to an evidence item. LOW RISK — executes immediately in auto/agent mode.",
      inputSchema: z.object({
        evidenceId: z.string(),
        tag: z.string().optional(),
        note: z.string().max(280).optional(),
      }),
      execute: async ({ evidenceId, tag, note }) => {
        // Try BFF; if endpoint missing, return a client-side stub the panel can show.
        try {
          const r = await fetch(`${BFF_BASE_URL}/bff/evidence/${encodeURIComponent(evidenceId)}/annotate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag, note }),
          });
          if (r.ok) return { status: r.status, ok: true, evidenceId, tag, note };
          return { status: r.status, ok: false, stubbed: true, evidenceId, tag, note, hint: "BFF endpoint not yet implemented; annotation staged locally." };
        } catch (e) {
          return { ok: false, stubbed: true, evidenceId, tag, note, error: String(e) };
        }
      },
    }),

    // ─── Draft tier (no backend write) ──────────────────────────
    propose_inbox_decision: tool({
      description: "Stage a DRAFT inbox decision (approve/reject/defer) with reason. Does NOT call backend — user will review and submit from the Human Inbox page.",
      inputSchema: z.object({
        itemId: z.string(),
        action: z.enum(["approve", "reject", "defer"]),
        reason: z.string().min(3),
      }),
      execute: async ({ itemId, action, reason }) => ({
        kind: "draft",
        target: "human-inbox",
        href: "/management/human-inbox",
        payload: { itemId, action, reason },
        note: "Draft staged. Open Human Inbox to review and submit.",
      }),
    }),
    propose_ask: tool({
      description: "Stage a DRAFT Ask (question for a persona). Does NOT call backend — user will review and submit from the Persona Fleet page.",
      inputSchema: z.object({
        target: z.string().describe("persona id or name"),
        question: z.string().min(3),
      }),
      execute: async ({ target, question }) => ({
        kind: "draft",
        target: "persona-fleet",
        href: "/management/persona-fleet",
        payload: { target, question },
        note: "Draft staged. Open Persona Fleet to review and submit.",
      }),
    }),

    // ─── Confirm tier (needsApproval) ───────────────────────────
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

  // Mode-based pruning so the model literally cannot pick disallowed tools.
  if (mode === "draft") {
    delete tools.decide_inbox_item;
    delete tools.create_ask;
    delete tools.create_intervention;
    delete tools.trigger_readiness;
    delete tools.annotate_evidence;
  } else if (mode === "auto") {
    delete tools.decide_inbox_item;
    delete tools.create_ask;
    delete tools.create_intervention;
    delete tools.trigger_readiness;
    delete tools.propose_inbox_decision;
    delete tools.propose_ask;
  } else if (mode === "confirm") {
    // confirm = default; keep everything but propose_* (encourage real commits)
    delete tools.propose_inbox_decision;
    delete tools.propose_ask;
  }
  // agent: keep all.

  return tools;
}

const responseHeaders = { ...corsHeaders, "X-Pantheon-Test-Mode": "true" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });

  console.warn("[management-agent] TEST MODE: no auth");

  try {
    const body = await req.json() as { messages: UIMessage[]; threadId: string; anonId: string; mode?: AgentMode };
    const { messages, threadId, anonId } = body;
    const mode: AgentMode = body.mode && ["auto", "draft", "confirm", "agent"].includes(body.mode)
      ? body.mode
      : "confirm";
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

    const tools = buildTools(mode);
    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: BASE_SYSTEM_PROMPT + modeHint(mode),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(mode === "agent" ? 80 : 50),
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
