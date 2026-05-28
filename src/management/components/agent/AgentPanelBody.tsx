// Chat body for the floating Management AI panel.
// Refactored from src/management/pages/agent/ManagementAgent.tsx — no URL deps,
// internal activeThreadId state, single-shot bootstrap (StrictMode safe).
//
// TEST MODE: anon id in localStorage; no auth.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PlusCircle, Trash2, MessageSquare, Check, X, PanelLeft, ExternalLink, Zap, FileEdit, ShieldCheck, Bot, AlertCircle, Copy } from "lucide-react";
import { readBrowserAuthStorage } from "@/lib/bff-v1/headers";
import { toast } from "sonner";

const FUNCTION_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/management-agent`;

const ANON_KEY = "pantheon.anonId";
function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = `anon-${crypto.randomUUID()}`; localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return `anon-${Math.random().toString(36).slice(2)}`; }
}

interface Thread { id: string; title: string; updated_at: string; }

type PendingApproval = { toolName: string; toolCallId: string; approvalId: string };

const isEmptyAssistantMessage = (message: UIMessage) =>
  message.role === "assistant" && (!message.parts || message.parts.length === 0);

export function AgentPanelBody() {
  const anonId = useMemo(() => getAnonId(), []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const bootstrappedRef = useRef(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // TEST MODE: list ALL threads (RLS policy allows public read). This is intentional
  // because the Lovable preview iframe resets localStorage between sessions, so the
  // anonId changes on every reload and filtering by user_id would hide prior history.
  const reloadThreads = async (): Promise<Thread[]> => {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const list = (data ?? []) as Thread[];
    setThreads(list);
    return list;
  };


  const ACTIVE_THREAD_KEY = "pantheon.agentPanel.activeThreadId";
  const readStoredActiveId = (): string | null => {
    try { return localStorage.getItem(ACTIVE_THREAD_KEY); } catch { return null; }
  };
  const writeStoredActiveId = (id: string | null) => {
    try {
      if (id) localStorage.setItem(ACTIVE_THREAD_KEY, id);
      else localStorage.removeItem(ACTIVE_THREAD_KEY);
    } catch { /* ignore */ }
  };

  // Wrapped setter: keep localStorage in sync so refresh restores the same thread.
  const selectThread = useCallback((id: string | null) => {
    writeStoredActiveId(id);
    setActiveThreadId(id);
  }, []);

  const bootstrap = async () => {
    setBootError(null);
    try {
      const list = await reloadThreads();
      if (list.length > 0) {
        const stored = readStoredActiveId();
        const pick = stored && list.some((t) => t.id === stored) ? stored : list[0].id;
        selectThread(pick);
        return;
      }
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: anonId, title: "New conversation" })
        .select("id,title,updated_at").single();
      if (error) throw error;
      setThreads([data as Thread]);
      selectThread(data.id);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      // eslint-disable-next-line no-console
      console.error("[AgentPanelBody] bootstrap failed", e);
      setBootError(msg);
    }
  };

  // Single-shot bootstrap: pick newest thread, or create one. StrictMode-safe via ref.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anonId]);

  // Load messages whenever activeThreadId changes.
  // STRATEGY: keep initialMessages=null (loading) until fetch completes, then
  // mount ChatWindow with the REAL history. Using [] as a placeholder caused
  // ChatWindow to mount empty and useChat ignored the later update because
  // its `messages` prop is read only at mount → history was lost on refresh.
  useEffect(() => {
    if (!activeThreadId) return;
    let alive = true;
    setInitialMessages(null); // loading
    (async () => {
      try {
        const { data, error } = await supabase.from("chat_messages")
          .select("id,role,parts,message_id,created_at")
          .eq("thread_id", activeThreadId)
          .order("created_at", { ascending: true });
        if (!alive) return;
        if (error) {
          console.error("[AgentPanelBody] load messages failed", error);
          setBootError(`load: ${error.message}`);
          setInitialMessages([]); // unblock UI on error
          return;
        }
        const msgs: UIMessage[] = (data ?? [])
          .map((r) => ({
            id: r.message_id || r.id,
            role: r.role as "user" | "assistant",
            parts: r.parts as UIMessage["parts"],
          }))
          .filter((m) => !isEmptyAssistantMessage(m));
        setInitialMessages(msgs); // always set, even if empty
      } catch (e) {
        if (!alive) return;
        const msg = (e as Error)?.message || String(e);
        console.error("[AgentPanelBody] load messages threw", e);
        setBootError(`load threw: ${msg}`);
        setInitialMessages([]);
      }
    })();
    return () => { alive = false; };
  }, [activeThreadId]);

  // Mirror debug bar state to console on every change.
  useEffect(() => {
    const snap = {
      threads: threads.length,
      active: activeThreadId,
      msgs: initialMessages === null ? "loading" : initialMessages.length,
      boot: bootError ? "ERR" : (activeThreadId && initialMessages !== null) ? "ok" : "pending",
      bootError,
      ts: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.log("[AgentPanelBody:debug]", snap);
  }, [threads, activeThreadId, initialMessages, bootError]);

  // Watchdog: if still loading after 5s, dump diagnostics (last fetch, online, supabase url).
  useEffect(() => {
    if (activeThreadId && initialMessages === null) {
      const t = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn("[AgentPanelBody:stuck] still loading after 5s", {
          activeThreadId,
          threads: threads.length,
          bootError,
          online: typeof navigator !== "undefined" ? navigator.onLine : "n/a",
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          functionUrl: FUNCTION_URL,
          anonId,
          ts: new Date().toISOString(),
        });
      }, 5000);
      return () => clearTimeout(t);
    }
    if (!activeThreadId && !bootError) {
      const t = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn("[AgentPanelBody:stuck] bootstrap still pending after 5s", {
          threads: threads.length,
          anonId,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          ts: new Date().toISOString(),
        });
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [activeThreadId, initialMessages, bootError, threads.length, anonId]);




  const retryBootstrap = () => {
    bootstrappedRef.current = false;
    setBootError(null);
    void bootstrap();
  };

  const newThread = async () => {
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: anonId, title: "New conversation" })
      .select("id,title,updated_at").single();
    if (error) { toast.error(error.message); return; }
    await reloadThreads();
    selectThread(data.id);
  };

  const deleteThread = async (id: string) => {
    await supabase.from("chat_threads").delete().eq("id", id);

    const list = await reloadThreads();
    if (id === activeThreadId) {
      const next = list[0]?.id ?? null;
      selectThread(next);
      if (list.length === 0) {
        bootstrappedRef.current = false; // allow re-bootstrap to create a fresh thread
      }
    }
  };

  return (
    <div className="flex flex-1 min-h-0 bg-background">
      {showSidebar && (
        <aside className="w-48 border-r flex flex-col bg-muted/30">
          <div className="p-2 border-b flex items-center justify-between gap-1">
            <span className="text-xs font-medium px-1">對話</span>
            <Button size="icon" variant="ghost" onClick={newThread} title="新對話" className="h-7 w-7">
              <PlusCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <ul className="p-1 space-y-0.5">
              {threads.map((t) => (
                <li
                  key={t.id}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-accent ${t.id === activeThreadId ? "bg-accent" : ""}`}
                  onClick={() => selectThread(t.id)}
                >
                  <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                    aria-label="刪除對話"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-2 py-1 flex items-center gap-1 bg-muted/20">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowSidebar((v) => !v)} title="對話列表">
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={newThread} title="新對話">
            <PlusCircle className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground ml-auto pr-2">測試模式 · {anonId.slice(-6)}</span>
        </div>

        {/* Always-visible debug status bar */}
        <div className="border-b px-2 py-0.5 bg-muted/10 text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-3">
          <span>threads:{threads.length}</span>
          <span>active:{activeThreadId ? activeThreadId.slice(0, 8) : "—"}</span>
          <span>msgs:{initialMessages === null ? "loading" : initialMessages.length}</span>
          <span className={bootError ? "text-destructive" : ""}>
            boot:{bootError ? "ERR" : (activeThreadId && initialMessages !== null) ? "ok" : "pending"}
          </span>
        </div>

        {activeThreadId && initialMessages !== null ? (
          <ChatWindow key={activeThreadId} threadId={activeThreadId} anonId={anonId} initialMessages={initialMessages} />
        ) : bootError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-xs">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="font-medium text-destructive">無法載入對話</div>
            <div className="text-muted-foreground font-mono text-[10px] text-center break-all max-w-full">
              {bootError}
            </div>
            <Button size="sm" variant="outline" onClick={retryBootstrap}>重試</Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground p-4">
            <span>
              正在載入
              {(() => {
                const title = threads.find((t) => t.id === activeThreadId)?.title;
                return title ? `「${title}」` : "";
              })()}
              的歷史訊息…
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={retryBootstrap}>
                重試
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={() => setInitialMessages([])}
              >
                從空白開始
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

type AgentMode = "auto" | "draft" | "confirm" | "agent";
const MODE_META: Record<AgentMode, { label: string; icon: typeof Zap; hint: string }> = {
  auto:    { label: "自動",   icon: Zap,         hint: "低風險動作直接執行（無確認）" },
  draft:   { label: "草稿",   icon: FileEdit,    hint: "AI 只產生草稿，不寫後端" },
  confirm: { label: "確認",   icon: ShieldCheck, hint: "寫入需你按批准（預設）" },
  agent:   { label: "代理",   icon: Bot,         hint: "多步自動執行，高風險仍需批准" },
};

function ChatWindow({ threadId, anonId, initialMessages }: {
  threadId: string; anonId: string; initialMessages: UIMessage[];
}) {
  const nav = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<AgentMode>(() => {
    try { return (localStorage.getItem("pantheon.agentMode") as AgentMode) || "confirm"; }
    catch { return "confirm"; }
  });
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
    try { localStorage.setItem("pantheon.agentMode", mode); } catch { /* ignore */ }
  }, [mode]);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: FUNCTION_URL,
      body: () => {
        const stored = readBrowserAuthStorage();
        const envToken = (import.meta.env.VITE_BFF_DEV_BEARER_TOKEN as string | undefined) ?? null;
        const bffAuth = {
          token: stored.token ?? envToken ?? null,
          tenantId: stored.tenantId ?? null,
        };
        return { threadId, anonId, mode: modeRef.current, bffAuth };
      },
    }),
    [threadId, anonId],
  );

  const { messages, setMessages, sendMessage, status, addToolResult, addToolApprovalResponse, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => {
      const m = (e as Error).message;
      if (m.includes("429")) toast.error("AI 使用量已達上限，請稍後再試");
      else if (m.includes("402")) toast.error("AI 點數已用罄，請至工作區設定加值");
      else toast.error(m);
    },
    sendAutomaticallyWhen: ({ messages: msgs }) =>
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages: msgs }) ||
      lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs }),
  });

  // Pending high-risk approvals — AI SDK emits state="approval-requested" with part.approval.id
  // for tools declared with needsApproval:true. Resolve via addToolApprovalResponse({id,approved,reason}).
  const pendingApprovals = useMemo<PendingApproval[]>(() => {
    const out: PendingApproval[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts ?? []) {
        const t = part.type as string;
        if (!t?.startsWith("tool-") && t !== "dynamic-tool") continue;
        const p = part as { state?: string; toolCallId?: string; approval?: { id?: string }; toolName?: string };
        if (p.state !== "approval-requested") continue;
        const approvalId = p.approval?.id;
        if (!approvalId || !p.toolCallId) continue;
        const name = t === "dynamic-tool" ? (p.toolName ?? "tool") : t.slice("tool-".length);
        out.push({ toolName: name, toolCallId: p.toolCallId, approvalId });
      }
    }
    return out;
  }, [messages]);
  const hasPending = pendingApprovals.length > 0;

  // Debug: pending approvals snapshot.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[AgentPanelBody:pending]", { threadId, count: pendingApprovals.length, pending: pendingApprovals, status });
  }, [pendingApprovals, status, threadId]);

  const resolveApproval = useCallback(async (p: PendingApproval, approved: boolean) => {
    // eslint-disable-next-line no-console
    console.log(approved ? "[AgentPanelBody:approve]" : "[AgentPanelBody:deny]", { ...p, status });
    // Defensive UI patch first: the SDK helper only mutates the LAST message.
    // If the pending approval was loaded from history and is not the last
    // message, the click looked dead. Patch the matching part locally so the
    // banner unblocks immediately even if the follow-up request fails.
    setMessages((current) => current.map((m) => ({
      ...m,
      parts: (m.parts ?? []).map((part) => {
        const t = part.type as string;
        if (!t?.startsWith("tool-") && t !== "dynamic-tool") return part;
        const candidate = part as typeof part & { state?: string; approval?: { id?: string } };
        if (candidate.state !== "approval-requested" || candidate.approval?.id !== p.approvalId) return part;
        return {
          ...part,
          state: "approval-responded",
          approval: { id: p.approvalId, approved, reason: approved ? undefined : "user_denied" },
        } as typeof part;
      }),
    })));

    try {
      await addToolApprovalResponse({
        id: p.approvalId,
        approved,
        reason: approved ? undefined : "user_denied",
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[AgentPanelBody:approval-error]", { ...p, approved, error: e });
      toast.error("批准狀態已更新，但送出到 AI SDK 時失敗；請再送一次訊息繼續。 ");
    }
  }, [addToolApprovalResponse, setMessages, status]);

  // Auto-resolve tool-navigate ONLY for tool calls produced in THIS session.
  const navHandledRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    for (const m of initialMessages) {
      for (const part of m.parts ?? []) {
        if (part.type === "tool-navigate" && "toolCallId" in part) {
          navHandledRef.current.add((part as { toolCallId: string }).toolCallId);
        }
      }
    }
  }
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts ?? []) {
        if (part.type === "tool-navigate" && part.state === "input-available") {
          if (navHandledRef.current.has(part.toolCallId)) continue;
          navHandledRef.current.add(part.toolCallId);
          const href = (part.input as { href?: string })?.href;
          if (href) {
            try { nav(href); } catch { /* ignore */ }
            addToolResult({ tool: "navigate", toolCallId: part.toolCallId, output: { ok: true, href } });
          }
        }
      }
    }
  }, [messages, addToolResult, nav]);



  useEffect(() => { inputRef.current?.focus(); }, [threadId, status]);

  const onSubmit = async (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim() || status === "submitted" || status === "streaming") return;
    if (hasPending) {
      toast.error("請先批准或拒絕上方待處理的高風險動作");
      return;
    }
    const t = text.trim();
    setText("");
    await sendMessage({ text: t });
  };

  return (
    <>
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Pantheon Management AI"
              description="詢問 cockpit 數據、導航到任何頁面，或請我代為提交審批／介入。"
            />
          )}
          {messages.map((m) => (
            <div key={m.id}>
              {m.parts?.map((part, idx) => {
                if (part.type === "text") {
                  return (
                    <Message key={idx} from={m.role}>
                      {m.role === "assistant"
                        ? <MessageResponse>{part.text}</MessageResponse>
                        : <MessageContent>{part.text}</MessageContent>}
                    </Message>
                  );
                }
                if (part.type?.startsWith("tool-") || part.type === "dynamic-tool") {
                  return <ToolBlock key={idx} part={part} addToolResult={addToolResult} resolveApproval={resolveApproval} />;
                }
                return null;
              })}
            </div>
          ))}
          {status === "submitted" && (
            <div className="px-4 py-2"><Shimmer>Thinking…</Shimmer></div>
          )}
          {error && (
            <div className="px-4 py-2 text-xs text-destructive">{error.message}</div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-2 space-y-1.5">
        {hasPending && (
          <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-2 space-y-1.5">
            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              ⚠ 有 {pendingApprovals.length} 個高風險動作等待你批准。批准或拒絕後才能繼續對話。
            </div>
            {pendingApprovals.map((p) => (
              <div key={p.toolCallId} className="flex items-center gap-1.5 text-xs">
                <span className="font-mono flex-1 truncate">{p.toolName}</span>
                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void resolveApproval(p, false)}>
                  <X className="h-3 w-3 mr-1" />拒絕
                </Button>
                <Button size="sm" className="h-6 text-[10px]" onClick={() => {
                  void resolveApproval(p, true);
                }}><Check className="h-3 w-3 mr-1" />批准</Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 px-0.5" role="radiogroup" aria-label="AI 操作模式">
          {(Object.keys(MODE_META) as AgentMode[]).map((k) => {
            const M = MODE_META[k];
            const Icon = M.icon;
            const active = mode === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(k)}
                title={M.hint}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                }`}
              >
                <Icon className="h-3 w-3" />
                {M.label}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] text-muted-foreground truncate">{MODE_META[mode].hint}</span>
        </div>
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={hasPending ? "請先批准或拒絕上方動作…" : "跟 Management AI 說話…"}
            disabled={status === "streaming" || hasPending}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!text.trim() || hasPending} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

// Active tools currently registered in supabase/functions/management-agent buildTools().
// Tool-call parts from older messages whose toolName is NOT in this set are
// rendered as "stale (historical record)" instead of pending-approval cards.
const ACTIVE_TOOL_NAMES = new Set<string>([
  "navigate",
  "query_cockpit", "query_persona_league", "query_persona_fleet",
  "query_portfolio_book", "query_trading_pulse", "query_human_inbox", "query_alerts",
  // annotate_evidence: REMOVED 2026-05-28 (BFF has no write endpoint; tool always 404'd).
  // Kept out of this set so historical chat parts render as "Historical Record" instead
  // of pending approval cards.
  "propose_inbox_decision", "propose_ask", "propose_create_persona",
  "decide_inbox_item", "create_ask", "decide_intervention",
  "request_sentinel_remediation", "trigger_readiness",
  "create_persona", "create_strategy", "create_capital_pool", "create_rebalance",
  "create_deployment", "create_ranking_formula", "create_research_experiment", "create_skill",
  "retire_persona",
]);

function ToolBlock({ part, addToolResult, resolveApproval }: {
  part: any;
  addToolResult: ReturnType<typeof useChat>["addToolResult"];
  resolveApproval: (p: PendingApproval, approved: boolean) => Promise<void>;
}) {
  const nav = useNavigate();
  const toolName: string = part.type === "dynamic-tool"
    ? (part.toolName as string)
    : (part.type as string).slice("tool-".length);

  const isStale = !ACTIVE_TOOL_NAMES.has(toolName);
  const needsApproval = !isStale && part.state === "approval-requested" && !!part.approval?.id;

  const isDraft = toolName.startsWith("propose_");

  // No auto-mode side-effect tools remain after annotate_evidence removal (2026-05-28).
  const completed = part.state === "output-available";
  const output = part.output as {
    kind?: string; href?: string; payload?: unknown; note?: string;
    ok?: boolean; stubbed?: boolean; status?: number;
    code?: string; i18nKey?: string; message?: string; correlationId?: string;
  } | undefined;

  const isError = completed && output && output.ok === false;

  const openDraft = () => {
    if (!output?.href) return;
    try {
      sessionStorage.setItem("pantheon.agentPrefill", JSON.stringify({
        tool: toolName,
        payload: output.payload,
        at: Date.now(),
      }));
    } catch { /* ignore */ }
    nav(output.href);
  };

  const copyCorrelationId = () => {
    if (!output?.correlationId) return;
    try {
      navigator.clipboard.writeText(output.correlationId);
      toast.success("已複製 correlationId");
    } catch { /* ignore */ }
  };

  return (
    <div className="px-4 py-2 space-y-2">
      {isStale && (
        <div className="ml-4 flex items-start gap-2 text-xs bg-muted/40 border border-muted-foreground/20 rounded-md p-2 text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div>此工具已下線（歷史紀錄）· <span className="font-mono">{toolName}</span></div>
            <div className="text-[10px] opacity-70">不再顯示批准卡片；如需建立 intervention 請使用 request_sentinel_remediation。</div>
          </div>
        </div>
      )}
      {!isStale && (
      <Tool defaultOpen={needsApproval || isError}>

        <ToolHeader type={`tool-${toolName}` as any} state={part.state} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={part.output} errorText={part.errorText} />
        </ToolContent>
      </Tool>
      )}


      {isError && (
        <div className="ml-4 flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/40 rounded-md p-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="font-medium text-destructive">
              工具呼叫失敗 · <span className="font-mono">{toolName}</span>
              {typeof output?.status === "number" && output.status > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">({output.status})</span>
              )}
            </div>
            <div className="text-foreground/80 break-words">
              {output?.i18nKey || output?.code || output?.message || "未知錯誤"}
            </div>
            {output?.correlationId && (
              <button
                onClick={copyCorrelationId}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono hover:text-foreground"
                title="複製 correlationId"
              >
                <Copy className="h-2.5 w-2.5" />
                {output.correlationId}
              </button>
            )}
          </div>
        </div>
      )}

      {isDraft && completed && !isError && output?.href && (
        <div className="ml-4 flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/30 rounded-md p-2">
          <FileEdit className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="flex-1">草稿已就緒：<span className="font-medium">{toolName.replace("propose_", "")}</span>。{output.note ?? ""}</span>
          <Button size="sm" variant="outline" onClick={openDraft}>
            <ExternalLink className="h-3 w-3 mr-1" /> 開啟頁面
          </Button>
        </div>
      )}

      {/* auto-mode success banner removed with annotate_evidence (2026-05-28) */}

      {needsApproval && (
        <div className="ml-4 flex items-center gap-2 text-xs bg-muted/40 border rounded-md p-2">
          <span className="flex-1">⚠ 高風險：<span className="font-medium">{toolName}</span> 需批准。</span>
          <Button size="sm" variant="outline" onClick={() =>
            void resolveApproval({ toolName, toolCallId: part.toolCallId, approvalId: part.approval.id }, false)
          }><X className="h-3 w-3 mr-1" /> 拒絕</Button>
          <Button size="sm" onClick={() =>
            void resolveApproval({ toolName, toolCallId: part.toolCallId, approvalId: part.approval.id }, true)
          }><Check className="h-3 w-3 mr-1" /> 批准</Button>
        </div>
      )}
    </div>
  );
}
