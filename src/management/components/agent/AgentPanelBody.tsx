// Management AI chat panel — Pantheon BFF runtime ONLY.
//
// Runtime path:
//   User → Pantheon FE → POST /bff/management/nl/ask → Pantheon BFF
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AlertCircle, ExternalLink, RefreshCcw, Plus, Trash2, MessagesSquare, Play, ShieldAlert, Info, Paperclip, X as XIcon, ChevronDown, LogIn, Loader2, KeyRound, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  activateAssistantControlMode,
  askManagementAi,
  deactivateAssistantControlMode,
  fetchAssistantModeStatus,
  fetchManagementAiConversation,
  fetchAssistantOrchestratorStatus,
  generateAssistantDevDocs,
  prepareAssistantRepairWorktree,
  startAssistantProviderReauth,
  type AssistantRepairMetadata,
  type ManagementAiResult,
  type ManagementAiUiAction,
  type ManagementAiUiSnapshot,
  type ManagementAiRecentTurn,
  type ProviderStatus,
  type AssistantOpenClawToolPolicyStatus,
  type AssistantControlModeStatus,
  type AssistantModeStatusResult,
  type AssistantOrchestratorStatus,
  type AssistantOrchestratorStatusResult,
  type AssistantDevDocsGenerateResult,
  type AssistantProviderReauthResult,
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

type RepairRepoKey = "execute-plans" | "pantheon";

const REPAIR_SCOPE_DEFAULTS: Record<RepairRepoKey, string[]> = {
  "execute-plans": [
    "src/management/components/agent",
    "src/lib/bff-v1",
    "src/lib/bff-v1/paths.ts",
    "AGENTS.md",
  ],
  pantheon: [
    "services/control-plane/bff",
    "services/openclaw-gateway-adapter",
    "scripts",
    "docs",
    "docker-compose.yml",
  ],
};

function repairScopeText(repoKey: RepairRepoKey): string {
  return REPAIR_SCOPE_DEFAULTS[repoKey].join("\n");
}

function parseRepairScope(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function repairMergeTarget(_repoKey: RepairRepoKey): string {
  return "dev";
}

function makeRepairTaskId(repoKey: RepairRepoKey): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MGMT-AI-REPAIR-${repoKey.toUpperCase()}-${stamp}-${suffix}`;
}

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

function commandPolicyIsUsable(policy: AssistantOpenClawToolPolicyStatus | null | undefined): boolean {
  if (!policy) return false;
  return policy.assistantCommandUsable ?? policy.assistantCommandAllowed ?? false;
}

function commandPolicyLabel(policy: AssistantOpenClawToolPolicyStatus | null | undefined): string {
  if (!policy) return "assistant.command unknown";
  return `assistant.command ${policy.assistantCommandStatus ?? (commandPolicyIsUsable(policy) ? "usable" : "blocked")}`;
}

function ToolPolicyPill({ policy, failure }: {
  policy?: AssistantOpenClawToolPolicyStatus | null;
  failure?: Extract<AssistantOrchestratorStatusResult, { ok: false }>;
}) {
  if (failure) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
        title={failure.message}
      >
        OpenClaw status unavailable
      </span>
    );
  }
  const usable = commandPolicyIsUsable(policy);
  const cls = usable
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={`OpenClaw ${policy?.status ?? "unknown"} / upstream ${policy?.upstreamStatus ?? "unknown"}`}
    >
      {commandPolicyLabel(policy)}
    </span>
  );
}

function controlModeLabel(status: AssistantControlModeStatus | null | undefined): string {
  if (!status) return "control unknown";
  if (status.active) return `control ${status.mode ?? "active"}`;
  return "control inactive";
}

function taskStatusCounts(tasks: AssistantOrchestratorStatus["tasks"]): string {
  const counts = new Map<string, number>();
  for (const task of tasks ?? []) {
    const key = task.status ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => `${status}:${count}`).join(" · ") || "none";
}

function compactList(items: Array<string | undefined>, limit = 3): string {
  const values = items.filter((item): item is string => Boolean(item));
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} +${values.length - limit}`;
}

function SystemStatusDetails({ status }: { status: AssistantOrchestratorStatus | null | undefined }) {
  if (!status) return null;
  const supervisor = status.supervisor;
  const provider = status.providerReadiness;
  const bridge = status.assistantDevBridge;
  const inbox = bridge?.inbox;
  const tasks = status.tasks ?? [];
  const activeTasks = tasks
    .filter((task) => ["in_progress", "running", "review_approved", "todo"].includes(task.status ?? ""))
    .slice(0, 4);
  const execution = supervisor?.modeOccupancy?.execution;
  const sourceSummary = compactList((status.sourceRefs ?? []).map((ref) => `${ref.sourceType ?? ref.path}:${ref.status ?? (ref.available ? "ok" : "missing")}`), 4);
  const taskSummary = taskStatusCounts(tasks);

  return (
    <details className="w-full group rounded border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground">
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-0.5 list-none">
        <ChevronDown className="h-2.5 w-2.5 transition-transform group-open:rotate-0 -rotate-90" />
        <span className="font-medium text-foreground">System</span>
        <span>snapshot={status.snapshotAt ?? "unknown"}</span>
        <span>supervisor={supervisor?.lifecycle ?? "unknown"}/{supervisor?.modeStatus ?? "unknown"}</span>
        <span>tasks={tasks.length}</span>
        <span>bridge={bridge?.status ?? "unknown"}:p{inbox?.pendingCount ?? 0}/f{inbox?.failedCount ?? 0}</span>
      </summary>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <div className="rounded bg-muted/30 p-1.5 font-mono leading-relaxed">
          <div>project={status.project ?? "unknown"}</div>
          <div>provider={provider?.providerName ?? provider?.provider ?? "unknown"} ready={String(provider?.ready ?? false)} read={String(provider?.capabilities?.read ?? false)} repair={String(provider?.capabilities?.repairWrite ?? false)}</div>
          <div>workspace={provider?.repairWorkspace?.status ?? "unknown"} writable={String(provider?.repairWorkspace?.writable ?? false)} worktrees={provider?.repairWorkspace?.worktreeCount ?? 0}</div>
          <div>supervisor_focus={supervisor?.focusMode ?? "unknown"} execution={execution ? `r${execution.running ?? 0}/p${execution.pending ?? 0}/q${execution.queued ?? 0}` : "unknown"}</div>
        </div>
        <div className="rounded bg-muted/30 p-1.5 font-mono leading-relaxed">
          <div>dev_bridge={bridge?.status ?? "unknown"} pending={inbox?.pendingCount ?? 0} processed={inbox?.processedCount ?? 0} failed={inbox?.failedCount ?? 0}</div>
          <div>sources={sourceSummary || "none"}</div>
          <div>coordination=files:{status.coordination?.fileCount ?? 0} features:{status.coordination?.featureCount ?? 0}</div>
          <div>task_status={taskSummary}</div>
        </div>
      </div>
      {activeTasks.length > 0 && (
        <div className="mt-1 space-y-0.5 font-mono">
          {activeTasks.map((task) => (
            <div key={task.id ?? task.title} className="truncate" title={task.next ?? task.title ?? task.id}>
              {task.status ?? "unknown"}:{task.owner ?? "?"}:{task.id ?? task.title}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function ControlModePill({ status, failure }: {
  status?: AssistantModeStatusResult | null;
  failure?: Extract<AssistantModeStatusResult, { ok: false }>;
}) {
  if (failure) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
        title={failure.message}
      >
        control unavailable
      </span>
    );
  }
  const kernelEnabled = status?.ok ? status.status.kernelEnabled : undefined;
  const controlMode = status?.ok ? status.status.controlMode : null;
  const active = Boolean(controlMode?.active);
  const cls = active
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : kernelEnabled
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
  const kernelLabel = kernelEnabled === true ? "kernel on" : kernelEnabled === false ? "kernel off" : "kernel unknown";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={`${kernelLabel} / ${controlModeLabel(controlMode)} / ${controlMode?.reason ?? controlMode?.state ?? "unknown"}`}
    >
      {kernelLabel} · {controlModeLabel(controlMode)}
    </span>
  );
}

function ProviderReauthNotice({ result }: { result: AssistantProviderReauthResult }) {
  if (!result.ok) {
    return (
      <div className="mt-1.5 rounded border border-amber-500/40 bg-background/60 px-2 py-1.5 text-[10px] text-amber-800 dark:text-amber-300">
        Reauth 失敗：{result.message}
      </div>
    );
  }

  const r = result.reauth;
  const verificationHref = r.verificationUriComplete ?? r.verificationUri;
  return (
    <div className="mt-1.5 rounded border border-amber-500/40 bg-background/60 px-2 py-1.5 text-[10px] text-foreground/80 space-y-1">
      <div className="font-medium text-amber-800 dark:text-amber-300">
        Codex reauth {r.status ?? "pending"}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {r.userCode && <span className="font-mono select-text">code={r.userCode}</span>}
        {verificationHref && (
          <a href={verificationHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline break-all">
            login <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        <span className="font-mono text-muted-foreground">session={r.reauthSessionId}</span>
      </div>
      {r.credentialExchange && (
        <div className="font-mono text-muted-foreground">
          bff_credentials={String(r.credentialExchange.bffHandlesCredentials ?? false)} frontend_credentials={String(r.credentialExchange.frontendHandlesCredentials ?? false)}
        </div>
      )}
    </div>
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

type AssistantDevDocsOk = Extract<AssistantDevDocsGenerateResult, { ok: true }>;

function latestFeatureSummary(turns: ChatTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role !== "user") continue;
    const text = turn.text.trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, 240);
  }
  return "Management AI conversation requested a Pantheon development change.";
}

function compactPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-4).join("/");
}

function devDocsReceiptText(result: AssistantDevDocsOk): string {
  const archive = result.archiveLocations;
  const lines = [
    "SA/SD packet generated for supervisor/autoworker pickup.",
    `packet: ${result.packetId}`,
    `tasks: ${result.taskCount}`,
    archive?.requirementCapture ? `requirements: ${archive.requirementCapture}` : null,
    archive?.systemAnalysis ? `SA: ${archive.systemAnalysis}` : null,
    archive?.systemDesign ? `SD: ${archive.systemDesign}` : null,
    result.taskPacketQueued
      ? `dev bridge queue: ${result.taskPacketQueuePath ?? "queued"}`
      : "dev bridge queue: not queued",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
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
  const [pendingSessions, setPendingSessions] = useState<Record<string, true>>({});
  const [degraded, setDegraded] = useState<DegradedState | null>(null);
  const [resyncNotice, setResyncNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sessions, setSessions] = useState<SessionIndexEntry[]>(() => loadSessionIndex());
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [orchestratorStatus, setOrchestratorStatus] = useState<AssistantOrchestratorStatusResult | null>(null);
  const [assistantModeStatus, setAssistantModeStatus] = useState<AssistantModeStatusResult | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [controlPassphrase, setControlPassphrase] = useState("");
  const [controlTargetMode, setControlTargetMode] = useState<"kernel_debug" | "kernel_repair">("kernel_repair");
  const [controlReason, setControlReason] = useState("Management AI dev repair");
  const [repairRepoKey, setRepairRepoKey] = useState<RepairRepoKey>("execute-plans");
  const [repairDeclaredScope, setRepairDeclaredScope] = useState(repairScopeText("execute-plans"));
  const [lastRepairMetadata, setLastRepairMetadata] = useState<AssistantRepairMetadata | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [devDocsBusy, setDevDocsBusy] = useState(false);
  const [devDocsNotice, setDevDocsNotice] = useState<AssistantDevDocsGenerateResult | null>(null);
  const [providerReauthBusy, setProviderReauthBusy] = useState(false);
  const [providerReauthNotice, setProviderReauthNotice] = useState<AssistantProviderReauthResult | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- in-flight guards (per-session, so multiple conversations run in parallel) ----
  const inflightRef = useRef<Map<string, AbortController>>(new Map());
  const activeSessionRef = useRef<string>(NEW_SESSION_SENTINEL);
  const turnsRef = useRef<ChatTurn[]>([]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);

  // Active-session pending flag — drives input/submit disable & shimmer.
  const pending = sessionId ? !!pendingSessions[sessionId] : false;

  const refreshAssistantRuntimeStatus = useCallback(async () => {
    const [orchestrator, mode] = await Promise.all([
      fetchAssistantOrchestratorStatus(),
      fetchAssistantModeStatus(),
    ]);
    setOrchestratorStatus(orchestrator);
    setAssistantModeStatus(mode);
  }, []);

  // Unmount: abort any still-running requests so we don't leak fetches.
  useEffect(() => {
    const map = inflightRef.current;
    return () => {
      map.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
      map.clear();
    };
  }, []);

  useEffect(() => {
    void refreshAssistantRuntimeStatus();
  }, [refreshAssistantRuntimeStatus]);

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

  /** Reconcile a client-side temporary session id with the BFF-issued id. */
  const renameSession = useCallback((oldId: string, newId: string) => {
    if (oldId === newId) return;
    setSessions((prev) => {
      const entry = prev.find((s) => s.id === oldId);
      if (!entry) return prev;
      const withoutOld = prev.filter((s) => s.id !== oldId && s.id !== newId);
      const list = [{ ...entry, id: newId, updatedAt: Date.now() }, ...withoutOld].slice(0, 50);
      saveSessionIndex(list);
      return list;
    });
    // Move turns cache from cli id → bff id.
    try {
      const cached = loadTurnsCache(oldId);
      if (cached.length > 0) void saveTurnsCache(newId, cached);
    } catch { /* ignore */ }
    clearTurnsCache(oldId);
  }, []);

  // Append a turn to a (possibly non-active) session.
  // Active session → update view state + cache.
  // Background session → write directly to its localStorage cache.
  const appendTurnTo = useCallback((sid: string, turn: ChatTurn) => {
    if (activeSessionRef.current === sid) {
      const base = turnsRef.current;
      const next = [...base, turn];
      turnsRef.current = next;
      setTurns(next);
      void saveTurnsCache(sid, next);
    } else {
      const base = loadTurnsCache(sid);
      const next = [...base, turn];
      void saveTurnsCache(sid, next);
    }
  }, []);

  const startNewConversation = useCallback(() => {
    activeSessionRef.current = NEW_SESSION_SENTINEL;
    setTurns([]);
    setSessionId(null);
    setTraceId(null);
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
    setResyncNotice(null);
    setDevDocsNotice(null);
    setProviderReauthNotice(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    inputRef.current?.focus();
  }, []);

  /**
   * Pull conversation history from BFF and MERGE into local turns by id.
   * Never wipes visible turns.
   */
  const resync = useCallback(async (id?: string | null) => {
    const target = id ?? sessionId;
    if (!target) return;
    void refreshAssistantRuntimeStatus();
    // Client-side temp ids are not known to BFF — skip remote fetch.
    if (isClientSessionId(target)) {
      setResyncNotice("此對話尚未由 BFF 建立 session id（仍為本地暫存），送出下一則訊息後會自動同步。");
      return;
    }
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
  }, [sessionId, refreshAssistantRuntimeStatus]);

  const beginProviderReauth = useCallback(async (ps: ProviderStatus | null, displayMsg: string) => {
    const currentControlMode = assistantModeStatus?.ok ? assistantModeStatus.status.controlMode : null;
    if (!currentControlMode?.active) {
      const result: AssistantProviderReauthResult = {
        ok: false,
        kind: "failure",
        statusCode: null,
        message: "需要先啟用 control mode。",
      };
      setProviderReauthNotice(result);
      setControlTargetMode("kernel_debug");
      setControlReason("Codex provider reauth");
      setControlError(null);
      setControlDialogOpen(true);
      toast({ title: "需要 Control mode", description: result.message });
      return;
    }

    setProviderReauthBusy(true);
    setProviderReauthNotice(null);
    try {
      const result = await startAssistantProviderReauth({
        provider: "codex",
        reason: ps?.displayMessage ?? ps?.reasonCode ?? ps?.reason ?? displayMsg,
        traceId: ps?.runId ?? traceId ?? undefined,
      });
      setProviderReauthNotice(result);
      if (result.ok) {
        toast({
          title: "Codex reauth started",
          description: result.reauth.userCode ? `code ${result.reauth.userCode}` : (result.reauth.status ?? "pending"),
        });
        await refreshAssistantRuntimeStatus();
        if (sessionId) void resync(sessionId);
      } else {
        if (result.statusCode === 403 || result.statusCode === 409) {
          setControlTargetMode("kernel_debug");
          setControlReason("Codex provider reauth");
          setControlError(null);
          setControlDialogOpen(true);
        }
        toast({ title: "Reauth 失敗", description: result.message, variant: "destructive" });
      }
    } finally {
      setProviderReauthBusy(false);
    }
  }, [assistantModeStatus, traceId, refreshAssistantRuntimeStatus, sessionId, resync]);

  const loadSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    activeSessionRef.current = id;
    setSessionId(id);
    setTraceId(null);
    setConversationSummary(undefined);
    setDegraded(null);
    setText("");
    setActionFeedback({});
    setDevDocsNotice(null);
    setProviderReauthNotice(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    // Hydrate from local cache FIRST — switching never blanks the screen.
    const cached = loadTurnsCache(id);
    setTurns(cached);
    if (pendingSessions[id]) {
      setResyncNotice("此對話仍在等待 BFF 回覆，請稍候。");
    } else {
      setResyncNotice(null);
    }
    if (import.meta.env?.DEV) {
      console.debug("[mgmtAi] loadSession hydrated", { sessionId: id, cached: cached.length });
    }
    await resync(id);
  }, [sessionId, resync, pendingSessions]);

  const deleteSession = useCallback((id: string) => {
    // Cancel any in-flight request for this thread.
    const ctrl = inflightRef.current.get(id);
    if (ctrl) {
      try { ctrl.abort(); } catch { /* noop */ }
      inflightRef.current.delete(id);
    }
    setPendingSessions((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
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

  const activateControlMode = useCallback(async () => {
    const passphrase = controlPassphrase.trim();
    if (!passphrase) {
      setControlError("需要 passphrase");
      return;
    }
    setControlBusy(true);
    setControlError(null);
    try {
      const result = await activateAssistantControlMode({
        passphrase,
        mode: controlTargetMode,
        reason: controlReason.trim() || "Management AI control mode",
        ttlSeconds: 900,
        idleTtlSeconds: 300,
        managementSessionId: sessionId && !isClientSessionId(sessionId) ? sessionId : null,
      });
      setControlPassphrase("");
      if (result.kind === "failure") {
        setControlError(result.message);
        return;
      }
      toast({
        title: "Control mode active",
        description: result.controlMode.mode ?? controlTargetMode,
      });
      setControlDialogOpen(false);
      await refreshAssistantRuntimeStatus();
    } finally {
      setControlBusy(false);
    }
  }, [controlPassphrase, controlTargetMode, controlReason, sessionId, refreshAssistantRuntimeStatus]);

  const deactivateControlMode = useCallback(async () => {
    setControlBusy(true);
    setControlError(null);
    try {
      const result = await deactivateAssistantControlMode();
      if (result.kind === "failure") {
        setControlError(result.message);
        return;
      }
      toast({ title: "Control mode inactive" });
      setControlDialogOpen(false);
      await refreshAssistantRuntimeStatus();
    } finally {
      setControlBusy(false);
    }
  }, [refreshAssistantRuntimeStatus]);

  const generateDevDocs = useCallback(async () => {
    const targetSessionId = sessionId;
    if (!targetSessionId || isClientSessionId(targetSessionId)) {
      const result: AssistantDevDocsGenerateResult = {
        ok: false,
        kind: "failure",
        statusCode: null,
        message: "需要先送出一則訊息，讓 BFF 建立正式 session id。",
      };
      setDevDocsNotice(result);
      toast({ title: "SA/SD 尚未送出", description: result.message, variant: "destructive" });
      return;
    }

    const currentControlMode = assistantModeStatus?.ok ? assistantModeStatus.status.controlMode : null;
    if (!currentControlMode?.active) {
      const result: AssistantDevDocsGenerateResult = {
        ok: false,
        kind: "failure",
        statusCode: null,
        message: "需要先啟用 control mode。",
      };
      setDevDocsNotice(result);
      setControlError(null);
      setControlDialogOpen(true);
      toast({ title: "需要 Control mode", description: result.message });
      return;
    }

    const ui = buildUiSnapshot();
    const affectedModules = Array.from(new Set([
      "execute-plans:management-ai",
      "pantheon:bff-assistant",
      "pantheon:openclaw-dev-bridge",
      `route:${location.pathname}`,
      ui.selectedEntity ? `${ui.selectedEntity.kind}:${ui.selectedEntity.id}` : "",
    ].filter(Boolean)));

    setDevDocsBusy(true);
    setDevDocsNotice(null);
    try {
      const result = await generateAssistantDevDocs({
        conversationId: targetSessionId,
        featureSummary: latestFeatureSummary(turns),
        affectedModules,
        proposedOwner: "Codex",
        proposedReviewer: "Supervisor",
        archive: true,
        emitTaskPacket: true,
        queueTaskPacket: true,
        extraContext: {
          route: location.pathname,
          pageLabel: nlCtx.pageLabel,
          selectedEntity: ui.selectedEntity,
          source: "execute-plans.management_ai_panel",
        },
      });
      setDevDocsNotice(result);

      if (result.ok) {
        appendTurnTo(targetSessionId, {
          id: turnId("a_devdocs"),
          role: "assistant",
          text: devDocsReceiptText(result),
          createdAt: Date.now(),
        });
        toast({
          title: "SA/SD 已產生",
          description: result.taskPacketQueued ? "已送進 supervisor dev bridge inbox" : "已產生文件，尚未 queue task packet",
        });
        await refreshAssistantRuntimeStatus();
      } else {
        toast({ title: "SA/SD 失敗", description: result.message, variant: "destructive" });
      }
    } finally {
      setDevDocsBusy(false);
    }
  }, [
    sessionId,
    assistantModeStatus,
    buildUiSnapshot,
    location.pathname,
    nlCtx.pageLabel,
    turns,
    appendTurnTo,
    refreshAssistantRuntimeStatus,
  ]);

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
    if (!question && !hasAttachments) return;
    // Block only if THIS conversation is already in-flight.
    if (sessionId && pendingSessions[sessionId]) return;

    const now = Date.now();
    const attachmentsForTurn = pendingAttachments;
    const userTurn: ChatTurn = {
      id: turnId("u"),
      role: "user",
      text: question,
      createdAt: now,
      attachments: attachmentsForTurn.length > 0 ? attachmentsForTurn : undefined,
    };

    // Mint a client-side session id immediately so the sidebar shows this
    // conversation even before BFF responds (or if BFF degrades without
    // returning a sessionId). The id will be reconciled to BFF's id below.
    let localSessionId = sessionId;
    const titleSeed = question || (attachmentsForTurn[0]?.filename ?? "圖片對話");
    const isNewThread = !localSessionId;
    if (!localSessionId) {
      localSessionId = mkClientSessionId();
      setSessionId(localSessionId);
      activeSessionRef.current = localSessionId;
    }
    upsertSessionIndex(localSessionId, titleSeed);
    const requestBucket = localSessionId;

    if (activeSessionRef.current === requestBucket) {
      setDegraded(null);
      setResyncNotice(null);
    }

    // Append the user turn into the correct thread bucket.
    const baseTurns = activeSessionRef.current === requestBucket
      ? turnsRef.current
      : loadTurnsCache(requestBucket);
    const nextTurns = [...baseTurns, userTurn];
    if (activeSessionRef.current === requestBucket) {
      turnsRef.current = nextTurns;
      setTurns(nextTurns);
    }
    void saveTurnsCache(requestBucket, nextTurns);
    setPendingAttachments([]);

    setPendingSessions((prev) => ({ ...prev, [requestBucket]: true }));

    const ui = buildUiSnapshot();
    const conv = buildConversationPayload(nextTurns);
    // Never send a client-only id to BFF — it will 404 / error.
    const sessionIdForBff = isClientSessionId(localSessionId) ? null : localSessionId;
    if (import.meta.env?.DEV) {
      console.debug("[mgmtAi] sending", {
        sessionId: sessionIdForBff,
        localSessionId,
        isNewThread,
        totalTurns: nextTurns.length,
        recentTurnsSent: conv.recentTurns.length,
        summary: conv.summary ?? null,
        attachments: attachmentsForTurn.length,
      });
    }

    const controller = new AbortController();
    inflightRef.current.set(requestBucket, controller);

    let result: ManagementAiResult | null = null;
    try {
      let repairMetadata: AssistantRepairMetadata | undefined;
      const currentControlMode = assistantModeStatus?.ok ? assistantModeStatus.status.controlMode : null;
      if (currentControlMode?.active && currentControlMode.mode === "kernel_repair") {
        const declaredScope = parseRepairScope(repairDeclaredScope);
        if (declaredScope.length === 0) {
          result = {
            ok: false,
            kind: "transport_failure",
            status: null,
            message: "Repair scope is empty.",
          };
        } else {
          const taskId = makeRepairTaskId(repairRepoKey);
          const prepared = await prepareAssistantRepairWorktree({
            taskId,
            repoKey: repairRepoKey,
            declaredScope,
            expectedBranch: `task/${taskId}`,
            mergeTarget: repairMergeTarget(repairRepoKey),
            reason: controlReason.trim() || "Management AI dev repair",
          }, { signal: controller.signal });
          if (prepared.ok) {
            repairMetadata = prepared.repair;
            setLastRepairMetadata(prepared.repair);
          } else {
            result = {
              ok: false,
              kind: "transport_failure",
              status: prepared.statusCode,
              message: `Repair worktree prepare failed: ${prepared.message}`,
            };
          }
        }
      }
      if (result === null) {
        result = await askManagementAi({
          question,
          focus: "all",
          sessionId: sessionIdForBff,
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
          openclaw: repairMetadata ? { repair: repairMetadata } : undefined,
        }, { signal: controller.signal });
      }
    } finally {
      if (inflightRef.current.get(requestBucket) === controller) {
        inflightRef.current.delete(requestBucket);
      }
    }

    // Always release the per-session pending flag, regardless of which
    // conversation the user is currently viewing.
    const clearPending = () => {
      setPendingSessions((prev) => {
        if (!prev[requestBucket]) return prev;
        const { [requestBucket]: _drop, ...rest } = prev;
        return rest;
      });
    };

    if (result === null) {
      clearPending();
      return;
    }

    if (result.kind === "aborted") {
      clearPending();
      return;
    }

    // Reconcile cli_* → BFF sessionId if BFF returned one.
    // Works even when this thread is not the currently-viewed one.
    const reconcile = (bffSid: string | null): string => {
      if (bffSid && isClientSessionId(localSessionId!) && bffSid !== localSessionId) {
        renameSession(localSessionId!, bffSid);
        // Move pending flag from cli → bff id.
        setPendingSessions((prev) => {
          if (!prev[localSessionId!]) return prev;
          const { [localSessionId!]: _drop, ...rest } = prev;
          return { ...rest, [bffSid]: true };
        });
        // Also move the inflight controller bookkeeping.
        const ctrl = inflightRef.current.get(localSessionId!);
        if (ctrl) {
          inflightRef.current.delete(localSessionId!);
          inflightRef.current.set(bffSid, ctrl);
        }
        if (activeSessionRef.current === localSessionId) {
          activeSessionRef.current = bffSid;
          setSessionId(bffSid);
        }
        return bffSid;
      }
      return bffSid ?? localSessionId!;
    };

    const isActive = (sid: string) => activeSessionRef.current === sid;

    if (result.kind === "ok") {
      const sid = reconcile(result.sessionId ?? null);
      const assistantTurn: ChatTurn = {
        id: turnId("a"),
        role: "assistant",
        text: result.answer,
        providerStatus: result.providerStatus,
        auditLogHref: result.auditLogHref,
        conversationHref: result.conversationHref,
        traceId: result.traceId,
        uiActions: result.uiActions,
        createdAt: Date.now(),
      };
      appendTurnTo(sid, assistantTurn);
      if (isActive(sid)) {
        setTraceId(result.traceId);
        setDegraded(null);
      }
      upsertSessionIndex(sid, titleSeed);
    } else if (result.kind === "provider_degraded") {
      const sid = reconcile(result.sessionId ?? null);
      if (result.answer) {
        const assistantTurn: ChatTurn = {
          id: turnId("a_degraded"),
          role: "assistant",
          text: result.answer,
          providerStatus: result.providerStatus,
          auditLogHref: result.auditLogHref,
          conversationHref: result.conversationHref,
          traceId: result.traceId,
          uiActions: result.uiActions,
          createdAt: Date.now(),
        };
        appendTurnTo(sid, assistantTurn);
      }
      if (isActive(sid)) {
        setTraceId(result.traceId);
        setDegraded({ message: result.message, providerStatus: result.providerStatus });
      }
      upsertSessionIndex(sid, titleSeed);
    } else {
      if (isActive(requestBucket)) {
        setDegraded({
          message: result.status
            ? `Pantheon BFF returned ${result.status}: ${result.message}`
            : `BFF transport failure: ${result.message}`,
          providerStatus: null,
        });
      }
      // Keep cli_* session in sidebar so the user can retry on the same thread.
      upsertSessionIndex(requestBucket, titleSeed);
    }

    clearPending();
    if (activeSessionRef.current === requestBucket || activeSessionRef.current === (result.kind === "ok" || result.kind === "provider_degraded" ? (result.sessionId ?? requestBucket) : requestBucket)) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [
    pendingAttachments,
    sessionId,
    pendingSessions,
    buildUiSnapshot,
    assistantModeStatus,
    repairDeclaredScope,
    repairRepoKey,
    controlReason,
    location.pathname,
    nlCtx.pageLabel,
    conversationSummary,
    upsertSessionIndex,
    renameSession,
    appendTurnTo,
  ]);


  const onSubmit = (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = text;
    setText("");
    void submit(t);
  };

  const canSubmit = (text.trim().length > 0 || pendingAttachments.length > 0) && !pending;
  const toolPolicy = orchestratorStatus?.ok ? orchestratorStatus.status.openclawToolPolicy : null;
  const toolPolicyFailure = orchestratorStatus?.kind === "failure" ? orchestratorStatus : undefined;
  const assistantModeFailure = assistantModeStatus?.kind === "failure" ? assistantModeStatus : undefined;
  const controlMode = assistantModeStatus?.ok ? assistantModeStatus.status.controlMode : null;
  const kernelEnabled = assistantModeStatus?.ok ? assistantModeStatus.status.kernelEnabled : false;
  const controlActive = Boolean(controlMode?.active);
  const canGenerateDevDocs = Boolean(sessionId && !isClientSessionId(sessionId) && turns.length > 0 && !pending && !devDocsBusy);
  const devDocsSystemDesignPath = devDocsNotice?.ok ? compactPath(devDocsNotice.archiveLocations?.systemDesign) : null;
  const devDocsQueuePath = devDocsNotice?.ok ? compactPath(devDocsNotice.taskPacketQueuePath) : null;

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
            const isPending = !!pendingSessions[s.id];
            return (
              <div
                key={s.id}
                className={`group flex items-center gap-1 px-2 py-1.5 border-b cursor-pointer hover:bg-muted/40 ${active ? "bg-muted/60" : ""}`}
                onClick={() => void loadSession(s.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] truncate flex items-center gap-1">
                    <span className="truncate">{s.title}</span>
                    {isPending && (
                      <Loader2
                        className="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground"
                        aria-label="此對話正在等待 BFF 回覆"
                      />
                    )}
                  </div>
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
        <div className="border-b px-2 py-1 flex flex-wrap items-center gap-2 bg-muted/20">
          <span className="text-[11px] font-medium">Management AI</span>
          <span className="text-[10px] text-muted-foreground">
            {sessionId ? `session ${sessionId.slice(0, 10)}…` : "new session"}
          </span>
          <span className="text-[10px] text-muted-foreground">· {turns.length} 則訊息</span>
          {orchestratorStatus && (
            <ToolPolicyPill policy={toolPolicy} failure={toolPolicyFailure} />
          )}
          {assistantModeStatus && (
            <ControlModePill status={assistantModeStatus} failure={assistantModeFailure} />
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={startNewConversation}>
              新對話
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => void resync()} disabled={!sessionId}>
              <RefreshCcw className="h-3 w-3 mr-1" />Resync
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => void generateDevDocs()}
              disabled={!canGenerateDevDocs}
              title={controlActive ? "產生 SA/SD 並送進 dev bridge" : "需要先啟用 control mode"}
            >
              {devDocsBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
              SA/SD
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => {
                setControlError(null);
                setControlDialogOpen(true);
              }}
            >
              <KeyRound className="h-3 w-3 mr-1" />Control
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => void refreshAssistantRuntimeStatus()}>
              OpenClaw
            </Button>
          </div>
        </div>

        <Dialog
          open={controlDialogOpen}
          onOpenChange={(open) => {
            setControlDialogOpen(open);
            if (!open) {
              setControlPassphrase("");
              setControlError(null);
            }
          }}
        >
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">Control mode</DialogTitle>
              <DialogDescription className="text-xs">
                {kernelEnabled ? controlModeLabel(controlMode) : "kernel off"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mgmt-ai-control-passphrase" className="text-xs">Passphrase</Label>
                <Input
                  id="mgmt-ai-control-passphrase"
                  type="password"
                  autoComplete="off"
                  value={controlPassphrase}
                  onChange={(e) => setControlPassphrase(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mode</Label>
                  <Select
                    value={controlTargetMode}
                    onValueChange={(value) => setControlTargetMode(value as "kernel_debug" | "kernel_repair")}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kernel_debug">kernel_debug</SelectItem>
                      <SelectItem value="kernel_repair">kernel_repair</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mgmt-ai-control-reason" className="text-xs">Reason</Label>
                  <Input
                    id="mgmt-ai-control-reason"
                    value={controlReason}
                    onChange={(e) => setControlReason(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Repo</Label>
                  <Select
                    value={repairRepoKey}
                    onValueChange={(value) => {
                      const next = value as RepairRepoKey;
                      setRepairRepoKey(next);
                      setRepairDeclaredScope(repairScopeText(next));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="execute-plans">execute-plans</SelectItem>
                      <SelectItem value="pantheon">pantheon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Merge</Label>
                  <Input value={repairMergeTarget(repairRepoKey)} readOnly className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgmt-ai-repair-scope" className="text-xs">Scope</Label>
                <Textarea
                  id="mgmt-ai-repair-scope"
                  value={repairDeclaredScope}
                  onChange={(e) => setRepairDeclaredScope(e.target.value)}
                  className="min-h-20 resize-none text-xs"
                />
              </div>
              <div className="rounded border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
                <div>kernel={kernelEnabled ? "on" : "off"}</div>
                <div>state={controlMode?.state ?? "unknown"}</div>
                {controlMode?.mode && <div>mode={controlMode.mode}</div>}
                {controlMode?.idleExpiresAt && <div>idle={controlMode.idleExpiresAt}</div>}
                {lastRepairMetadata?.task_id && <div>repair={lastRepairMetadata.repo_key ?? repairRepoKey}:{lastRepairMetadata.task_id}</div>}
              </div>
              {controlError && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  {controlError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void deactivateControlMode()}
                disabled={controlBusy || !controlActive}
              >
                Deactivate
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                onClick={() => void activateControlMode()}
                disabled={controlBusy || !kernelEnabled}
              >
                {controlBusy ? <><Loader2 className="h-3 w-3 animate-spin" />Activating</> : "Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(lastProviderStatus || lastLinks.audit || lastLinks.conversation || traceId || orchestratorStatus?.ok) && (
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
            {toolPolicy && (
              <span className="text-[10px] text-muted-foreground font-mono">
                OpenClaw={toolPolicy.status ?? "unknown"} upstream={toolPolicy.upstreamStatus ?? "unknown"}
              </span>
            )}
            {orchestratorStatus?.ok && <SystemStatusDetails status={orchestratorStatus.status} />}
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

        {devDocsNotice && (
          <div
            className={`border-b px-2 py-1 text-[10px] flex items-start gap-1 ${
              devDocsNotice.ok
                ? "bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
            }`}
            title={devDocsNotice.ok ? (devDocsNotice.taskPacketQueuePath ?? devDocsNotice.packetId) : devDocsNotice.message}
          >
            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="flex-1 min-w-0">
              {devDocsNotice.ok ? (
                <>
                  SA/SD {devDocsNotice.packetId.slice(0, 18)} · tasks {devDocsNotice.taskCount}
                  {devDocsNotice.taskPacketQueued ? " · queued" : " · not queued"}
                  {devDocsSystemDesignPath ? <span className="font-mono"> · SD {devDocsSystemDesignPath}</span> : null}
                  {devDocsQueuePath ? <span className="font-mono"> · inbox {devDocsQueuePath}</span> : null}
                </>
              ) : (
                <>SA/SD 失敗：{devDocsNotice.message}</>
              )}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setDevDocsNotice(null)}
              aria-label="關閉 SA/SD 提示"
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
                void beginProviderReauth(ps ?? null, displayMsg);
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
                          <Button size="sm" variant="default" className="h-7 text-[11px] gap-1" onClick={onReauth} disabled={providerReauthBusy}>
                            {providerReauthBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                            重新登入
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void resync()} disabled={!sessionId}>
                          <RefreshCcw className="h-3 w-3" /> Resync
                        </Button>
                        {ps && <span className="self-center"><ProviderStatusPill s={ps} /></span>}
                      </div>
                      {providerReauthNotice && <ProviderReauthNotice result={providerReauthNotice} />}
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
