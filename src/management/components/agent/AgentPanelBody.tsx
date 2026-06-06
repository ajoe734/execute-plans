// Management AI chat panel — Pantheon BFF runtime ONLY.
//
// Runtime path:
//   User → Lovable FE → POST /bff/management/nl/ask → Pantheon BFF
//                                                 → OpenClaw gateway / Codex
//
// 2026-06-03e (anti-truncation v2 + image attachments):
//   • Per-session localStorage cache so switching/reload never loses turns.
//   • loadSession() hydrates from local cache first, then merges resync.
//   • Recent-turn payload no longer hard-capped at 12; uses a char-budget
//     window so long conversations actually reach the LLM.
//   • Paperclip / paste / drop image attachments — sent as base64 in the
//     BFF payload; rendered as thumbnails in the user message.
//   • Still: no Lovable AI fallback; degraded/disabled/error → degraded banner.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AlertCircle, ExternalLink, RefreshCcw, Plus, Trash2, MessagesSquare, Play, ShieldAlert, Info, Paperclip, X as XIcon, ChevronDown, LogIn } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  askManagementAi,
  fetchManagementAiConversation,
  type ManagementAiResult,
  type ManagementAiUiAction,
  type ManagementAiUiSnapshot,
  type ManagementAiRecentTurn,
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
import {
  type ChatAttachment,
  ATTACHMENT_LIMITS,
  PER_TURN_CACHE_BUDGET,
  attachmentToDataUrl,
  compressToThumbnail,
  fileToAttachment,
  formatBytes,
  validateNewFiles,
} from "./attachmentUtils";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  providerStatus?: ProviderStatus | null;
  auditLogHref?: string | null;
  conversationHref?: string | null;
  traceId?: string | null;
  uiActions?: ManagementAiUiAction[];
  attachments?: ChatAttachment[];
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
const TURNS_CACHE_PREFIX = "pantheon.mgmtAi.turns.v1.";
const RECENT_CHAR_BUDGET = 32_000; // ~8k tokens of context
const RECENT_HARD_TURN_CAP = 200;
const CACHE_MAX_TURNS = 500;
const NEW_SESSION_SENTINEL = "__new__";
const CLIENT_SESSION_PREFIX = "cli_";

function mkClientSessionId(): string {
  return `${CLIENT_SESSION_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isClientSessionId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(CLIENT_SESSION_PREFIX);
}

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
  try { window.localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

function turnsCacheKey(sessionId: string): string {
  return `${TURNS_CACHE_PREFIX}${sessionId}`;
}

function loadTurnsCache(sessionId: string): ChatTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(turnsCacheKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is ChatTurn =>
      t && typeof t.id === "string" && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && typeof t.createdAt === "number",
    );
  } catch {
    return [];
  }
}

async function saveTurnsCache(sessionId: string, turns: ChatTurn[]): Promise<void> {
  if (typeof window === "undefined") return;
  const limited = turns.slice(-CACHE_MAX_TURNS);
  // Per-turn attachment budget: if a turn's attachments exceed budget, downscale.
  const safe: ChatTurn[] = await Promise.all(limited.map(async (t) => {
    if (!t.attachments || t.attachments.length === 0) return t;
    const total = t.attachments.reduce((s, a) => s + a.sizeBytes, 0);
    if (total <= PER_TURN_CACHE_BUDGET) return t;
    const thumbs = await Promise.all(t.attachments.map((a) => compressToThumbnail(a)));
    return { ...t, attachments: thumbs };
  }));
  try {
    window.localStorage.setItem(turnsCacheKey(sessionId), JSON.stringify(safe));
  } catch {
    // Quota — try dropping attachments entirely.
    try {
      const stripped = safe.map((t) => t.attachments ? { ...t, attachments: undefined } : t);
      window.localStorage.setItem(turnsCacheKey(sessionId), JSON.stringify(stripped));
    } catch { /* give up */ }
  }
}

function clearTurnsCache(sessionId: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(turnsCacheKey(sessionId)); } catch { /* ignore */ }
}

function turnId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Merge BFF turns into local turns by id; local-only turns are preserved. */
function mergeTurns(local: ChatTurn[], incoming: ChatTurn[]): ChatTurn[] {
  if (incoming.length === 0) return local;
  const byId = new Map<string, ChatTurn>();
  for (const t of local) byId.set(t.id, t);
  for (const t of incoming) {
    const prev = byId.get(t.id);
    byId.set(t.id, prev ? { ...prev, ...t, attachments: prev.attachments ?? t.attachments } : t);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Build the conversation payload: walk turns from the newest backwards until
 * we exhaust the char budget, then if anything was dropped emit a small
 * synthetic "earlier turns omitted" placeholder so the LLM knows.
 */
function buildConversationPayload(turns: ChatTurn[]): {
  recentTurns: ManagementAiRecentTurn[];
  summary?: string;
} {
  const collected: ManagementAiRecentTurn[] = [];
  let used = 0;
  let droppedCount = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const content = t.text;
    const cost = content.length + 8;
    if (collected.length >= RECENT_HARD_TURN_CAP) { droppedCount = i + 1; break; }
    if (used + cost > RECENT_CHAR_BUDGET && collected.length > 0) {
      droppedCount = i + 1;
      break;
    }
    collected.push({ role: t.role, content });
    used += cost;
  }
  collected.reverse();
  const out: { recentTurns: ManagementAiRecentTurn[]; summary?: string } = { recentTurns: collected };
  if (droppedCount > 0) {
    out.summary = `[earlier ${droppedCount} turn(s) omitted by client char-budget; full history available via /bff/management/ai/conversations]`;
  }
  return out;
}

type StatusTone = "ok" | "warn" | "off";

function classifyProvider(s: ProviderStatus | null): { label: string; tone: StatusTone } {
  if (!s) return { label: "Unknown", tone: "warn" };
  const status = String(s.status).toLowerCase();
  const needsReauth =
    s.reason === "CODEX_AUTH_UNAVAILABLE" ||
    s.reasonCode === "CODEX_AUTH_UNAVAILABLE" ||
    s.operatorAction === "reauth_codex_service_user";
  if (needsReauth) return { label: "需要重新登入", tone: "warn" };
  if (status === "completed" && s.used) return { label: "AI Ready", tone: "ok" };
  if (status === "disabled") return { label: "Provider Off", tone: "off" };
  if (status === "degraded") return { label: "Provider Degraded", tone: "warn" };
  return { label: status || "Unknown", tone: "warn" };
}

function ProviderStatusPill({ s }: { s: ProviderStatus | null }) {
  const { label, tone } = classifyProvider(s);
  const cls =
    tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : tone === "off" ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function ProviderTechDetails({ s }: { s: ProviderStatus }) {
  const rows: Array<[string, string | null | undefined]> = [
    ["reason", s.reason],
    ["reasonCode", s.reasonCode],
    ["provider", s.provider],
    ["runtime", s.runtime],
    ["status", String(s.status)],
    ["used", String(s.used)],
    ["fallback", s.fallback],
    ["run_id", s.runId],
  ];
  return (
    <details className="mt-1.5 group">
      <summary className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none hover:text-foreground list-none">
        <ChevronDown className="h-2.5 w-2.5 transition-transform group-open:rotate-0 -rotate-90" />
        技術細節
      </summary>
      <div className="mt-1 rounded border bg-muted/30 p-1.5 font-mono text-[10px] leading-relaxed space-y-0.5">
        {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="break-all select-text">{v}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function AttachmentThumbs({ items, onRemove }: { items: ChatAttachment[]; onRemove?: (i: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a, i) => (
        <div key={`${a.filename}-${i}`} className="relative group">
          <img
            src={attachmentToDataUrl(a)}
            alt={a.filename}
            className="h-14 w-14 rounded object-cover border border-border"
          />
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
              aria-label={`移除 ${a.filename}`}
            >
              <XIcon className="h-2.5 w-2.5" />
            </button>
          )}
          <div className="text-[9px] text-muted-foreground mt-0.5 max-w-[56px] truncate">{formatBytes(a.sizeBytes)}</div>
        </div>
      ))}
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
  const [resyncNotice, setResyncNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sessions, setSessions] = useState<SessionIndexEntry[]>(() => loadSessionIndex());
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- in-flight guards ----
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string>(NEW_SESSION_SENTINEL);

  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    inputRef.current = inputContainerRef.current?.querySelector("textarea") ?? null;
    inputRef.current?.focus();
  }, []);

  // ---- Persist turns whenever they change (debounced via rAF) ----
  useEffect(() => {
    if (!sessionId) return;
    const id = window.requestAnimationFrame(() => { void saveTurnsCache(sessionId, turns); });
    return () => window.cancelAnimationFrame(id);
  }, [sessionId, turns]);

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

  const abortInflight = useCallback((reason: "switch" | "new") => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (pending) {
      setPending(false);
      setResyncNotice(reason === "new" ? "已取消進行中的請求並開新對話。" : "切換對話時取消了上一則進行中的請求。");
    }
  }, [pending]);

  const startNewConversation = useCallback(() => {
    abortInflight("new");
    activeSessionRef.current = NEW_SESSION_SENTINEL;
    setTurns([]);
    setSessionId(null);
    setTraceId(null);
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
    setResyncNotice(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    inputRef.current?.focus();
  }, [abortInflight]);

  /**
   * Pull conversation history from BFF and MERGE into local turns by id.
   * Never wipes visible turns.
   */
  const resync = useCallback(async (id?: string | null) => {
    const target = id ?? sessionId;
    if (!target) return;
    const requestBucket = target;
    const res = await fetchManagementAiConversation(target);

    if (activeSessionRef.current !== requestBucket) return;

    if (res.kind === "failure") {
      setResyncNotice(`Resync 失敗：${res.message}。本地畫面保留，可再次點 Resync 重試。`);
      return;
    }

    const incoming: ChatTurn[] = res.turns.map((t, i) => ({
      id: t.id,
      role: t.role === "assistant" ? "assistant" : "user",
      text: t.text,
      providerStatus: t.providerStatus ?? null,
      createdAt: t.createdAt ? (Date.parse(t.createdAt) || Date.now() + i) : (Date.now() + i),
    }));

    setTurns((prev) => {
      const merged = mergeTurns(prev, incoming);
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[mgmtAi] resync", {
          sessionId: target,
          receivedFromBff: incoming.length,
          localBefore: prev.length,
          mergedTotal: merged.length,
        });
      }
      return merged;
    });

    if (incoming.length === 0) {
      setResyncNotice("BFF 未回傳任何歷史 turn，顯示本地快取。");
    } else {
      setResyncNotice(null);
    }
  }, [sessionId]);

  const loadSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    abortInflight("switch");
    activeSessionRef.current = id;
    setSessionId(id);
    setTraceId(null);
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
    setPendingAttachments([]);
    setAttachmentError(null);
    // Hydrate from local cache FIRST — switching never blanks the screen.
    const cached = loadTurnsCache(id);
    setTurns(cached);
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[mgmtAi] loadSession hydrated", { sessionId: id, cached: cached.length });
    }
    await resync(id);
  }, [sessionId, resync, abortInflight]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const list = prev.filter((s) => s.id !== id);
      saveSessionIndex(list);
      return list;
    });
    clearTurnsCache(id);
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

  // ---- Attachment handlers ----
  const addFiles = useCallback(async (files: File[]) => {
    setAttachmentError(null);
    const { accepted, error } = validateNewFiles(pendingAttachments, files);
    if (error) setAttachmentError(error);
    if (accepted.length === 0) return;
    const parsed = await Promise.all(accepted.map((f) => fileToAttachment(f)));
    setPendingAttachments((prev) => [...prev, ...parsed]);
  }, [pendingAttachments]);

  const removePendingAttachment = useCallback((i: number) => {
    setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length > 0) {
      e.preventDefault();
      void addFiles(images);
    }
  }, [addFiles]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) void addFiles(files);
  }, [addFiles]);

  const submit = useCallback(async (raw: string) => {
    const question = raw.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!question && !hasAttachments) || pending) return;
    setPending(true);
    setDegraded(null);
    setResyncNotice(null);
    const now = Date.now();
    const attachmentsForTurn = pendingAttachments;
    const userTurn: ChatTurn = {
      id: turnId("u"),
      role: "user",
      text: question,
      createdAt: now,
      attachments: attachmentsForTurn.length > 0 ? attachmentsForTurn : undefined,
    };

    const requestBucket = activeSessionRef.current;

    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setPendingAttachments([]);

    const ui = buildUiSnapshot();
    const conv = buildConversationPayload(nextTurns);
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[mgmtAi] sending", {
        sessionId,
        totalTurns: nextTurns.length,
        recentTurnsSent: conv.recentTurns.length,
        summary: conv.summary ?? null,
        attachments: attachmentsForTurn.length,
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;

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
        recentTurns: conv.recentTurns,
        summary: conv.summary ?? conversationSummary,
      },
      ui,
      attachments: attachmentsForTurn.length > 0
        ? attachmentsForTurn.map((a) => ({
            kind: a.kind,
            mimeType: a.mimeType,
            filename: a.filename,
            sizeBytes: a.sizeBytes,
            dataBase64: a.dataBase64,
          }))
        : undefined,
    }, { signal: controller.signal });

    if (abortRef.current === controller) abortRef.current = null;

    if (activeSessionRef.current !== requestBucket) return;

    if (result.kind === "aborted") {
      setPending(false);
      return;
    }

    if (result.kind === "ok") {
      const sid = result.sessionId ?? sessionId;
      if (sid && requestBucket === NEW_SESSION_SENTINEL) activeSessionRef.current = sid;
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
      if (sid) upsertSessionIndex(sid, question || (attachmentsForTurn[0]?.filename ?? "圖片對話"));
    } else if (result.kind === "provider_degraded") {
      const sid = result.sessionId ?? sessionId;
      if (sid && requestBucket === NEW_SESSION_SENTINEL) activeSessionRef.current = sid;
      setSessionId(sid);
      setTraceId(result.traceId);
      if (result.answer) {
        setTurns((prev) => [...prev, {
          id: turnId("a_degraded"),
          role: "assistant",
          text: result.answer,
          providerStatus: result.providerStatus,
          auditLogHref: result.auditLogHref,
          conversationHref: result.conversationHref,
          traceId: result.traceId,
          uiActions: result.uiActions,
          createdAt: Date.now(),
        }]);
      }
      setDegraded({ message: result.message, providerStatus: result.providerStatus });
      if (sid) upsertSessionIndex(sid, question || (attachmentsForTurn[0]?.filename ?? "圖片對話"));
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
  }, [pending, pendingAttachments, turns, buildUiSnapshot, sessionId, location.pathname, nlCtx.pageLabel, conversationSummary, upsertSessionIndex]);

  const onSubmit = (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = text;
    setText("");
    void submit(t);
  };

  const canSubmit = (text.trim().length > 0 || pendingAttachments.length > 0) && !pending;

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
        <div className={`flex-1 min-h-0 overflow-y-auto ${pending ? "cursor-progress" : ""}`}>
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
      <div
        className={`flex flex-1 min-w-0 min-h-0 flex-col relative ${isDragging ? "ring-2 ring-primary ring-inset" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
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

        {(lastProviderStatus || lastLinks.audit || lastLinks.conversation || traceId) && (
          <div className="border-b px-2 py-1 bg-muted/10 flex items-center flex-wrap gap-x-2 gap-y-0.5">
            {lastProviderStatus && <ProviderStatusPill s={lastProviderStatus} />}
            {lastLinks.audit && (
              <a href={lastLinks.audit} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                audit log <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {lastLinks.conversation && (
              <a href={lastLinks.conversation} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                conversation <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {traceId && <span className="text-[10px] text-muted-foreground font-mono">trace={traceId.slice(0, 12)}…</span>}
          </div>
        )}

        {resyncNotice && (
          <div className="border-b px-2 py-1 bg-muted/5 text-[10px] flex items-start gap-1 text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="flex-1">{resyncNotice}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setResyncNotice(null)}
              aria-label="關閉提示"
            >
              ×
            </button>
          </div>
        )}

        <Conversation className="flex-1 min-h-0">
          <ConversationContent>
            {turns.length === 0 && !pending && (
              <ConversationEmptyState
                title="Pantheon Management AI"
                description="多回合對話 · 經 Pantheon BFF → OpenClaw / Codex。FE 不會自行生成答案。支援貼上 / 拖放 / 上傳圖片。"
              />
            )}
            {turns.map((t) => (
              <div key={t.id} className="space-y-1">
                <Message from={t.role}>
                  {t.role === "assistant"
                    ? <MessageResponse>{t.text}</MessageResponse>
                    : (
                      <MessageContent>
                        {t.text && <div className="whitespace-pre-wrap">{t.text}</div>}
                        {t.attachments && t.attachments.length > 0 && (
                          <div className="mt-1.5">
                            <AttachmentThumbs items={t.attachments} />
                          </div>
                        )}
                      </MessageContent>
                    )}
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
            {degraded && (() => {
              const ps = degraded.providerStatus;
              const displayMsg = ps?.displayMessage?.trim() || "AI provider 暫時不可用，目前改用規則式摘要。";
              const needsReauth = ps?.operatorAction === "reauth_codex_service_user";
              const onReauth = () => {
                if (sessionId) void resync();
                toast({
                  title: "需要重新授權",
                  description: "請由 operator 在 Codex service-user 裝置登入流程完成授權。",
                });
              };
              return (
                <div className="mx-4 my-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium text-amber-800 dark:text-amber-300">Management AI 暫時降級</div>
                      <div className="text-foreground/80 break-words">{displayMsg}</div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {needsReauth && (
                          <Button size="sm" variant="default" className="h-7 text-[11px] gap-1" onClick={onReauth}>
                            <LogIn className="h-3 w-3" /> 重新登入
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void resync()} disabled={!sessionId}>
                          <RefreshCcw className="h-3 w-3" /> Resync
                        </Button>
                        {ps && <span className="self-center"><ProviderStatusPill s={ps} /></span>}
                      </div>
                      {ps && <ProviderTechDetails s={ps} />}
                    </div>
                  </div>
                </div>
              );
            })()}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Pending attachments preview */}
        {(pendingAttachments.length > 0 || attachmentError) && (
          <div className="border-t px-2 py-1.5 bg-muted/5 space-y-1">
            {pendingAttachments.length > 0 && (
              <AttachmentThumbs items={pendingAttachments} onRemove={removePendingAttachment} />
            )}
            {attachmentError && (
              <div className="text-[10px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{attachmentError}
              </div>
            )}
          </div>
        )}

        <div className="border-t p-2" ref={inputContainerRef} onPaste={onPaste}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void addFiles(files);
              e.target.value = "";
            }}
          />
          <PromptInput onSubmit={onSubmit}>
            <PromptInputTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="跟 Management AI 說話…（多回合 · 經 Pantheon BFF / OpenClaw · 可貼上/拖放圖片）"
              disabled={pending}
            />
            <PromptInputFooter className="justify-between">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending || pendingAttachments.length >= ATTACHMENT_LIMITS.maxPerMessage}
                title="附加圖片"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>圖片</span>
                {pendingAttachments.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 text-[9px] px-1 py-0">
                    {pendingAttachments.length}/{ATTACHMENT_LIMITS.maxPerMessage}
                  </Badge>
                )}
              </Button>
              <PromptInputSubmit
                status={pending ? "submitted" : "ready"}
                disabled={!canSubmit}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
