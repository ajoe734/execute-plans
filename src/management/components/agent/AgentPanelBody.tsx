// Management AI chat panel — Pantheon BFF runtime ONLY.
//
// Runtime path:
//   User → Lovable FE → POST /bff/management/nl/ask → Pantheon BFF
//                                                 → OpenClaw gateway / Codex
//
// 2026-06-03c (multi-turn + UI actions):
//   • Multi-turn: sessionId is reused across submits until the user starts a
//     new chat. Each request sends `conversation.recentTurns` + summary.
//   • UI snapshot: every request includes the current route, selected entity,
//     visible filters, and the allowlisted `availableUiActions`.
//   • UI actions: BFF MAY return `data.uiActions | suggestedActions | actions`.
//     They are rendered as confirm chips. Only allowlisted kinds run; backend
//     mutations (`runBffAction`) are NEVER auto-executed.
//   • Resync uses GET /bff/management/ai/conversations/{session_id} WITHOUT
//     trace_id (trace_id is per-turn audit, not history filter).
//   • No Lovable AI fallback. degraded/disabled/error → degraded banner only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AlertCircle, ExternalLink, RefreshCcw, Plus, Trash2, MessagesSquare, Play, ShieldAlert } from "lucide-react";
import {
  askManagementAi,
  fetchManagementAiConversation,
  type ManagementAiResult,
  type ManagementAiUiAction,
  type ManagementAiUiSnapshot,
  type ProviderStatus,
} from "@/lib/bff-v1/managementAi";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AVAILABLE_UI_ACTIONS,
  executeUiAction,
  isHighRiskAction,
  type UiAction,
} from "./uiActionRegistry";
import { useManagementNlContext, setManagementNlContext } from "@/management/hooks/useManagementNlContext";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  providerStatus?: ProviderStatus | null;
  auditLogHref?: string | null;
  conversationHref?: string | null;
  traceId?: string | null;
  uiActions?: ManagementAiUiAction[];
  createdAt: number;
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
const RECENT_TURNS_LIMIT = 12;

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nlCtx = useManagementNlContext();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [conversationSummary, setConversationSummary] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [degraded, setDegraded] = useState<DegradedState | null>(null);
  const [text, setText] = useState("");
  const [sessions, setSessions] = useState<SessionIndexEntry[]>(() => loadSessionIndex());
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
    inputRef.current?.focus();
  }, []);

  const resync = useCallback(async (id?: string | null) => {
    const target = id ?? sessionId;
    if (!target) return;
    // NOTE: do NOT pass traceId — full conversation must not be trace-filtered.
    const res = await fetchManagementAiConversation(target);
    if (res.kind === "failure") {
      setDegraded({ message: `Resync failed: ${res.message}`, providerStatus: null });
      return;
    }
    setTurns(res.turns.map((t) => ({
      id: t.id,
      role: t.role === "assistant" ? "assistant" : "user",
      text: t.text,
      providerStatus: t.providerStatus ?? null,
      createdAt: t.createdAt ? Date.parse(t.createdAt) || Date.now() : Date.now(),
    })));
    setDegraded(null);
  }, [sessionId]);

  const loadSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    setSessionId(id);
    setTraceId(null);
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
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

  // ---- UI snapshot (sent on every turn) ----
  const buildUiSnapshot = useCallback((): ManagementAiUiSnapshot => {
    const filters: Record<string, string> = {};
    searchParams.forEach((v, k) => { filters[k] = v; });
    return {
      currentRoute: location.pathname,
      selectedEntity: (nlCtx.selectedEntityKind && nlCtx.selectedEntityId)
        ? { kind: nlCtx.selectedEntityKind, id: nlCtx.selectedEntityId }
        : null,
      visiblePanels: [],
      filters,
      availableUiActions: AVAILABLE_UI_ACTIONS.map((d) => ({
        kind: d.kind, description: d.description, paramsSchema: d.paramsSchema,
      })),
    };
  }, [location.pathname, searchParams, nlCtx.selectedEntityKind, nlCtx.selectedEntityId]);

  // ---- Execute an allowlisted UI action ----
  const runUiAction = useCallback((action: ManagementAiUiAction, key: string) => {
    const result = executeUiAction(action as UiAction, {
      navigate: (p) => navigate(p),
      setSelectedEntity: (kind, id) => setManagementNlContext({ selectedEntityKind: kind as never, selectedEntityId: id }),
      setSearchParam: (k, v) => {
        const next = new URLSearchParams(searchParams);
        if (v === "") next.delete(k); else next.set(k, v);
        setSearchParams(next);
      },
      refresh: () => window.location.reload(),
    });
    setActionFeedback((prev) => ({
      ...prev,
      [key]: result.ok ? "已執行" : (result.reason ?? "未執行"),
    }));
  }, [navigate, searchParams, setSearchParams]);

  const submit = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    setPending(true);
    setDegraded(null);
    const now = Date.now();
    const userTurn: ChatTurn = { id: turnId("u"), role: "user", text: question, createdAt: now };

    // Build recentTurns from CURRENT turns + the new user message (so BE sees
    // it even if it doesn't persist history yet). Limited to last N turns.
    const recentTurns = [...turns, userTurn].slice(-RECENT_TURNS_LIMIT).map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.text,
    }));

    setTurns((prev) => [...prev, userTurn]);

    const ui = buildUiSnapshot();

    const result: ManagementAiResult = await askManagementAi({
      question,
      focus: "all",
      sessionId,
      context: JSON.stringify({
        route: location.pathname,
        pageLabel: nlCtx.pageLabel,
        selectedEntity: ui.selectedEntity,
      }),
      conversation: {
        recentTurns,
        summary: conversationSummary,
      },
      ui,
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
        traceId: result.traceId,
        uiActions: result.uiActions,
        createdAt: Date.now(),
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
      setDegraded({
        message: result.status
          ? `Pantheon BFF returned ${result.status}: ${result.message}`
          : `BFF transport failure: ${result.message}`,
        providerStatus: null,
      });
    }

    setPending(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pending, turns, buildUiSnapshot, sessionId, location.pathname, nlCtx.pageLabel, conversationSummary, upsertSessionIndex]);

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
            <div className="px-2 py-3 text-[10px] text-muted-foreground">尚無對話紀錄</div>
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
                  <div className="text-[9px] text-muted-foreground font-mono">{s.id.slice(0, 10)}…</div>
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
          <span className="text-[10px] text-muted-foreground">· {turns.length} 則訊息</span>
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
            {(lastLinks.audit || lastLinks.conversation || traceId) && (
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
                description="多回合對話 · 經 Pantheon BFF → OpenClaw / Codex。FE 不會自行生成答案。"
              />
            )}
            {turns.map((t) => (
              <div key={t.id} className="space-y-1">
                <Message from={t.role}>
                  {t.role === "assistant"
                    ? <MessageResponse>{t.text}</MessageResponse>
                    : <MessageContent>{t.text}</MessageContent>}
                </Message>
                {t.role === "assistant" && t.uiActions && t.uiActions.length > 0 && (
                  <div className="px-4 flex flex-wrap gap-1.5">
                    {t.uiActions.map((a, idx) => {
                      const key = `${t.id}:${idx}`;
                      const highRisk = isHighRiskAction(a as UiAction);
                      const feedback = actionFeedback[key];
                      return (
                        <Button
                          key={key}
                          size="sm"
                          variant={highRisk ? "outline" : "secondary"}
                          className="h-7 text-[11px] gap-1"
                          onClick={() => runUiAction(a, key)}
                          title={a.rationale ?? a.kind}
                        >
                          {highRisk ? <ShieldAlert className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          <span>{a.label ?? a.kind}</span>
                          {feedback && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">{feedback}</Badge>}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
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
              placeholder="跟 Management AI 說話…（多回合 · 經 Pantheon BFF / OpenClaw）"
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
