// Management AI chat panel — Pantheon BFF runtime ONLY.
//
// 2026-06-03 rewrite: stripped the Supabase Edge Function (`management-agent`)
// transport, the @ai-sdk/react `useChat` loop, tool-call/approval UI, and the
// chat_threads/chat_messages persistence. Runtime path is now strictly:
//   User → Lovable FE → POST /bff/management/nl/ask → Pantheon BFF
//                                                 → OpenClaw gateway / Codex
// The FE never generates an answer locally. If the provider runtime is
// degraded/disabled/error OR the BFF endpoint is unreachable, the UI surfaces
// a degraded banner — never a synthetic reply.
//
// 2026-06-03b: restored the conversation list (sidebar). The BFF has no list
// endpoint, so we keep a lightweight per-browser index in localStorage
// (`pantheon.mgmtAi.sessions.v1`) mapping sessionId → {title, updatedAt}.
// Clicking a session calls fetchManagementAiConversation(sessionId) to
// rehydrate turns from the BFF. No message bodies are stored locally.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AlertCircle, ExternalLink, RefreshCcw, Plus, Trash2, MessagesSquare } from "lucide-react";
import { askManagementAi, fetchManagementAiConversation, type ManagementAiResult, type ProviderStatus } from "@/lib/bff-v1/managementAi";
import { useLocation } from "react-router-dom";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  providerStatus?: ProviderStatus | null;
  auditLogHref?: string | null;
  conversationHref?: string | null;
}

interface DegradedState {
  message: string;
  providerStatus: ProviderStatus | null;
}

interface SessionIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
}

const SESSION_INDEX_KEY = "pantheon.mgmtAi.sessions.v1";

function loadSessionIndex(): SessionIndexEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSION_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is SessionIndexEntry =>
      x && typeof x.id === "string" && typeof x.title === "string" && typeof x.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

function saveSessionIndex(list: SessionIndexEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

function turnId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ProviderStatusBar({ s }: { s: ProviderStatus }) {
  const tone = s.used && String(s.status).toLowerCase() === "completed"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-amber-700 dark:text-amber-400";
  return (
    <div className={`text-[10px] font-mono ${tone} flex flex-wrap gap-x-2 gap-y-0.5`}>
      <span>provider={s.provider}</span>
      <span>runtime={s.runtime}</span>
      <span>status={String(s.status)}</span>
      <span>used={String(s.used)}</span>
      <span>fallback={s.fallback ?? "null"}</span>
    </div>
  );
}

export function AgentPanelBody() {
  const location = useLocation();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [degraded, setDegraded] = useState<DegradedState | null>(null);
  const [text, setText] = useState("");
  const [sessions, setSessions] = useState<SessionIndexEntry[]>(() => loadSessionIndex());
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Resolve textarea node without relying on forwardRef in PromptInputTextarea.
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    inputRef.current = inputContainerRef.current?.querySelector("textarea") ?? null;
    inputRef.current?.focus();
  }, []);

  const lastProviderStatus = useMemo<ProviderStatus | null>(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const ps = turns[i].providerStatus;
      if (ps) return ps;
    }
    return null;
  }, [turns]);

  const lastLinks = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.auditLogHref || t.conversationHref) {
        return { audit: t.auditLogHref ?? null, conversation: t.conversationHref ?? null };
      }
    }
    return { audit: null as string | null, conversation: null as string | null };
  }, [turns]);

  const upsertSessionIndex = useCallback((id: string, titleSeed: string) => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === id);
      const title = existing?.title ?? (titleSeed.trim().slice(0, 48) || "新對話");
      const next: SessionIndexEntry = { id, title, updatedAt: Date.now() };
      const others = prev.filter((s) => s.id !== id);
      const list = [next, ...others].slice(0, 50);
      saveSessionIndex(list);
      return list;
    });
  }, []);

  const startNewConversation = useCallback(() => {
    setTurns([]);
    setSessionId(null);
    setTraceId(null);
    setDegraded(null);
    setText("");
    inputRef.current?.focus();
  }, []);

  const resync = useCallback(async (id?: string | null) => {
    const target = id ?? sessionId;
    if (!target) return;
    const res = await fetchManagementAiConversation(target, traceId);
    if (res.kind === "failure") {
      setDegraded({ message: `Resync failed: ${res.message}`, providerStatus: null });
      return;
    }
    setTurns(res.turns.map((t) => ({
      id: t.id,
      role: t.role === "assistant" ? "assistant" : "user",
      text: t.text,
      providerStatus: t.providerStatus ?? null,
    })));
    setDegraded(null);
  }, [sessionId, traceId]);

  const loadSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    setSessionId(id);
    setTraceId(null);
    setDegraded(null);
    setText("");
    await resync(id);
  }, [sessionId, resync]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const list = prev.filter((s) => s.id !== id);
      saveSessionIndex(list);
      return list;
    });
    if (id === sessionId) startNewConversation();
  }, [sessionId, startNewConversation]);

  const submit = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    setPending(true);
    setDegraded(null);
    const userTurn: ChatTurn = { id: turnId("u"), role: "user", text: question };
    setTurns((prev) => [...prev, userTurn]);

    const result: ManagementAiResult = await askManagementAi({
      question,
      focus: "all",
      context: location.pathname,
      sessionId,
    });

    if (result.kind === "ok") {
      const sid = result.sessionId ?? sessionId;
      setSessionId(sid);
      setTraceId(result.traceId);
      setTurns((prev) => [...prev, {
        id: turnId("a"),
        role: "assistant",
        text: result.answer,
        providerStatus: result.providerStatus,
        auditLogHref: result.auditLogHref,
        conversationHref: result.conversationHref,
      }]);
      setDegraded(null);
      if (sid) upsertSessionIndex(sid, question);
    } else if (result.kind === "provider_degraded") {
      const sid = result.sessionId ?? sessionId;
      setSessionId(sid);
      setTraceId(result.traceId);
      setDegraded({ message: result.message, providerStatus: result.providerStatus });
      if (sid) upsertSessionIndex(sid, question);
    } else {
      // transport_failure
      setDegraded({
        message: result.status
          ? `Pantheon BFF returned ${result.status}: ${result.message}`
          : `BFF transport failure: ${result.message}`,
        providerStatus: null,
      });
    }

    setPending(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [location.pathname, pending, sessionId, upsertSessionIndex]);

  const onSubmit = (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = text;
    setText("");
    void submit(t);
  };

  return (
    <div className="flex flex-1 min-h-0 bg-background">
      {/* Sessions sidebar */}
      <aside className="w-44 shrink-0 border-r flex flex-col min-h-0 bg-muted/10">
        <div className="px-2 py-1.5 border-b flex items-center gap-1">
          <MessagesSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] font-medium">對話紀錄</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 ml-auto"
            onClick={startNewConversation}
            title="新對話"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="px-2 py-3 text-[10px] text-muted-foreground">
              尚無對話紀錄
            </div>
          )}
          {sessions.map((s) => {
            const active = s.id === sessionId;
            return (
              <div
                key={s.id}
                className={`group flex items-center gap-1 px-2 py-1.5 border-b cursor-pointer hover:bg-muted/40 ${active ? "bg-muted/60" : ""}`}
                onClick={() => void loadSession(s.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] truncate">{s.title}</div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {s.id.slice(0, 10)}…
                  </div>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  title="刪除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        <div className="border-b px-2 py-1 flex items-center gap-2 bg-muted/20">
          <span className="text-[11px] font-medium">Management AI</span>
          <span className="text-[10px] text-muted-foreground">
            {sessionId ? `session ${sessionId.slice(0, 10)}…` : "new session"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={startNewConversation}>
              新對話
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => void resync()} disabled={!sessionId}>
              <RefreshCcw className="h-3 w-3 mr-1" />Resync
            </Button>
          </div>
        </div>

        {lastProviderStatus && (
          <div className="border-b px-2 py-1 bg-muted/10">
            <ProviderStatusBar s={lastProviderStatus} />
            {(lastLinks.audit || lastLinks.conversation) && (
              <div className="text-[10px] mt-0.5 flex gap-2">
                {lastLinks.audit && (
                  <a href={lastLinks.audit} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    audit log <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {lastLinks.conversation && (
                  <a href={lastLinks.conversation} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    conversation <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {traceId && <span className="text-muted-foreground">trace={traceId.slice(0, 12)}…</span>}
              </div>
            )}
          </div>
        )}

        <Conversation className="flex-1 min-h-0">
          <ConversationContent>
            {turns.length === 0 && !pending && (
              <ConversationEmptyState
                title="Pantheon Management AI"
                description="透過 Pantheon BFF → OpenClaw gateway / Codex provider 回應。FE 不會自行生成答案。"
              />
            )}
            {turns.map((t) => (
              <Message key={t.id} from={t.role}>
                {t.role === "assistant"
                  ? <MessageResponse>{t.text}</MessageResponse>
                  : <MessageContent>{t.text}</MessageContent>}
              </Message>
            ))}
            {pending && (
              <div className="px-4 py-2"><Shimmer>透過 OpenClaw 等候 Codex 回應…</Shimmer></div>
            )}
            {degraded && (
              <div className="mx-4 my-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 space-y-1 text-xs">
                <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Pantheon BFF / OpenClaw provider degraded — FE 不會自行回答。</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground break-all">{degraded.message}</div>
                {degraded.providerStatus && <ProviderStatusBar s={degraded.providerStatus} />}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t p-2" ref={inputContainerRef}>
          <PromptInput onSubmit={onSubmit}>
            <PromptInputTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="跟 Management AI 說話…（經 Pantheon BFF / OpenClaw）"
              disabled={pending}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                status={pending ? "submitted" : "ready"}
                disabled={!text.trim() || pending}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
