import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  listWorkshops,
  createWorkshop,
  type StrategyWorkshop,
} from "@/lib/bff-v1/agora/workshops";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { WorkshopSessionView } from "./WorkshopSessionView";
import type { TradingRoomReadinessHandoff } from "./StrategyWorkshopPage";
import { workshopCopy } from "@/agora/components/workshopCardUtils";

const pendingInitialReconstructionIds = new Set<string>();

export function markWorkshopPendingInitialReconstruction(workshopId: string): void {
  if (workshopId.trim()) {
    pendingInitialReconstructionIds.add(workshopId.trim());
  }
}

export function consumePendingInitialReconstruction(workshopId: string): boolean {
  const id = workshopId.trim();
  if (!id || !pendingInitialReconstructionIds.has(id)) return false;
  pendingInitialReconstructionIds.delete(id);
  return true;
}

export function deriveWorkshopTitleFromDescription(description: string): string {
  const cleaned = description
    .replace(/^[#>*\-\d.\s]+/gm, "")
    .trim();
  if (!cleaned) return workshopCopy("agora.workshop.defaultTitle", "策略工坊");
  const firstSegment = cleaned
    .split(/[\r\n。！？；;!?]+/)
    .map((s) => s.trim())
    .find((s) => s.length > 0) ?? cleaned;
  if (firstSegment.length <= 36) return firstSegment;
  return `${firstSegment.slice(0, 36).trim()}…`;
}

const V10_FOCUS_TAGS: ReadonlyArray<{ id: string; labelKey: string; fallback: string; snippet: string }> = [
  {
    id: "chip",
    labelKey: "agora.workshop.createForm.focusTagChip",
    fallback: "籌碼與關鍵分點",
    snippet: "【籌碼與關鍵分點觀察】\n",
  },
  {
    id: "winner",
    labelKey: "agora.workshop.createForm.focusTagWinner",
    fallback: "勝率分點評分",
    snippet: "【勝率分點評分與篩選條件】\n",
  },
  {
    id: "migration",
    labelKey: "agora.workshop.createForm.focusTagMigration",
    fallback: "分點轉移與反手",
    snippet: "【分點轉移與反手出場訊號】\n",
  },
  {
    id: "event",
    labelKey: "agora.workshop.createForm.focusTagEvent",
    fallback: "事件前領先訊號",
    snippet: "【重大事件前領先布局觀察】\n",
  },
  {
    id: "backtest",
    labelKey: "agora.workshop.createForm.focusTagBacktest",
    fallback: "回測與反證設計",
    snippet: "【回測驗證與失效反證條件】\n",
  },
];

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(workshop: StrategyWorkshop | null | undefined, key: string): string | null {
  const value = recordFrom(workshop?.metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workshopTitle(workshop: StrategyWorkshop | null | undefined): string {
  return (
    metadataString(workshop, "strategy_name") ??
    metadataString(workshop, "title") ??
    metadataString(workshop, "display_name") ??
    workshop?.subject?.title?.trim() ??
    workshopCopy("agora.workshop.defaultTitle", "策略工坊")
  );
}

function timestampValue(workshop: StrategyWorkshop): number {
  const updatedAt = metadataString(workshop, "updated_at");
  const value = updatedAt ?? workshop.concluded_at ?? workshop.created_at;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function statusPriority(workshop: StrategyWorkshop): number {
  if (workshop.status === "open") return 4;
  if (workshop.status === "in_review") return 3;
  if (workshop.status === "concluded") return 2;
  return 1;
}

function orderWorkshops(workshops: StrategyWorkshop[]): StrategyWorkshop[] {
  return workshops.slice().sort((a, b) => {
    const statusDiff = statusPriority(b) - statusPriority(a);
    if (statusDiff !== 0) return statusDiff;
    return timestampValue(b) - timestampValue(a);
  });
}

function compactTime(workshop: StrategyWorkshop): string {
  const updatedAt = metadataString(workshop, "updated_at");
  const value = updatedAt ?? workshop.concluded_at ?? workshop.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return workshopCopy("agora.workshop.timeUnavailable", "無時間資料");
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

type ListState = "loading" | "empty" | "loaded" | "error";

export interface WorkshopListViewProps {
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
  onSelectWorkshop?: (workshopId: string) => void;
  selectedWorkshopId?: string | null;
}

function useSafeNavigate() {
  try {
    return useNavigate();
  } catch {
    return null;
  }
}

export function WorkshopListView({
  onAddToTradingRoom,
  onSelectWorkshop,
  selectedWorkshopId: controlledSelectedWorkshopId,
}: WorkshopListViewProps): JSX.Element {
  const navigate = useSafeNavigate();
  const [state, setState] = useState<ListState>("loading");
  const [workshops, setWorkshops] = useState<StrategyWorkshop[]>([]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDescription, setCreateDescription] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedWorkshopId = controlledSelectedWorkshopId !== undefined
    ? controlledSelectedWorkshopId
    : internalSelectedId;

  const fetchWorkshops = useCallback(async () => {
    try {
      const res = await listWorkshops();
      const ordered = orderWorkshops(res);
      setWorkshops(ordered);
      setInternalSelectedId((current) => {
        if (current && ordered.some((workshop) => workshop.workshop_id === current)) return current;
        return ordered[0]?.workshop_id ?? null;
      });
      setState(ordered.length === 0 ? "empty" : "loaded");
      return ordered;
    } catch {
      setState("error");
      return [];
    }
  }, []);

  useEffect(() => {
    void fetchWorkshops();
  }, [fetchWorkshops]);

  const handleSelectWorkshop = (id: string) => {
    setInternalSelectedId(id);
    if (onSelectWorkshop) {
      onSelectWorkshop(id);
    } else if (navigate) {
      navigate(`/agora/strategy-workshop/${encodeURIComponent(id)}`);
    }
  };

  const trimmedDescription = createDescription.trim();
  const trimmedTitle = createTitle.trim();
  const derivedTitle = trimmedTitle || (trimmedDescription ? deriveWorkshopTitleFromDescription(trimmedDescription) : "");
  const initialMessage = trimmedDescription || trimmedTitle;

  const handleCreateWorkshop = async () => {
    if (!initialMessage || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createWorkshop({
        initial_message: initialMessage,
        title: derivedTitle || initialMessage,
      });
      const ordered = await fetchWorkshops();
      const targetId = created?.workshop_id || ordered[0]?.workshop_id || null;
      if (targetId && trimmedDescription) {
        markWorkshopPendingInitialReconstruction(targetId);
      }
      setShowCreateForm(false);
      setCreateDescription("");
      setCreateTitle("");
      if (targetId) {
        handleSelectWorkshop(targetId);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "無法建立策略工坊");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-testid="strategy-workshop-page-list">
      {/* List Header Bar with Create Action */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5 text-foreground shrink-0" data-testid="workshop-list-header">
        <h2 className="text-sm font-semibold text-foreground">
          {workshopCopy("agora.workshop.defaultTitle", "策略工坊")}
        </h2>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-foreground font-semibold h-8 text-xs"
          data-testid="create-workshop-btn"
          onClick={() => setShowCreateForm(true)}
          type="button"
        >
          + {workshopCopy("agora.workshop.newStrategy", "建立新策略")}
        </Button>
      </div>

      {showCreateForm && (
        <div className="border-b border-border bg-card/90 p-5 shrink-0" data-testid="create-workshop-form">
          <div className="max-w-2xl space-y-3.5">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">
                {workshopCopy(
                  "agora.workshop.createForm.headline",
                  "請把您的完整策略想法直接貼進來，或從研究焦點開始與助理討論",
                )}
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {workshopCopy(
                  "agora.workshop.createForm.subheadline",
                  "像和量化研究主管討論一樣，一次把您的交易觀察、訊號條件、出場想法或疑慮寫清楚。助理會先幫您整理成策略結構，再帶您一步一步收斂與驗證。",
                )}
              </p>
            </div>

            {/* V10 Focus Tags */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {workshopCopy("agora.workshop.createForm.focusTagsLabel", "V10 研究焦點領域（點擊可插入段落標題）")}
              </span>
              <div className="flex flex-wrap gap-1.5" data-testid="create-workshop-focus-tags">
                {V10_FOCUS_TAGS.map((tag) => (
                  <button
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/15"
                    data-testid={`create-workshop-focus-tag-${tag.id}`}
                    key={tag.id}
                    onClick={() =>
                      setCreateDescription((prev) =>
                        prev.trim() ? `${prev.trim()}\n\n${tag.snippet}` : tag.snippet,
                      )
                    }
                    type="button"
                  >
                    {workshopCopy(tag.labelKey, tag.fallback)}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-line strategy description (primary V10 input) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-foreground" htmlFor="create-workshop-description">
                {workshopCopy(
                  "agora.workshop.createForm.descriptionLabel",
                  "完整策略描述（多行策略想法、訊號邏輯與風控假設）",
                )}
              </label>
              <textarea
                id="create-workshop-description"
                rows={5}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                data-testid="create-workshop-description-input"
                placeholder={workshopCopy(
                  "agora.workshop.createForm.descriptionPlaceholder",
                  "請直接貼上或輸入完整策略想法：包含交易市場與標的範圍、核心訊號與觀察、進場與持有週期、加減碼與停損規則，以及目前最想驗證的假設…",
                )}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && initialMessage && !creating) {
                    e.preventDefault();
                    void handleCreateWorkshop();
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {workshopCopy(
                  "agora.workshop.createForm.descriptionHint",
                  "支援直接貼上多段中文策略筆記；若未填寫策略名稱，系統會自動從策略描述衍生名稱。",
                )}
              </p>
            </div>

            {/* Optional title input */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="create-workshop-title">
                {workshopCopy(
                  "agora.workshop.createForm.titleOptionalLabel",
                  "策略名稱（選填，留空時自動從策略描述衍生）",
                )}
              </label>
              <input
                id="create-workshop-title"
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                data-testid="create-workshop-title-input"
                placeholder={workshopCopy(
                  "agora.workshop.createForm.titleOptionalPlaceholder",
                  "選填：留空將自動由上方策略描述摘要命名",
                )}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && initialMessage && !creating) {
                    e.preventDefault();
                    void handleCreateWorkshop();
                  }
                }}
              />
              {!trimmedTitle && trimmedDescription ? (
                <p className="text-[11px] text-primary" data-testid="create-workshop-derived-title">
                  {workshopCopy("agora.workshop.createForm.derivedTitlePreview", `自動衍生策略名稱：${derivedTitle}`, {
                    title: derivedTitle,
                  })}
                </p>
              ) : null}
            </div>

            {createError && <p className="text-xs text-rose-400 font-semibold" data-testid="create-workshop-error">{createError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-foreground h-8 text-xs font-semibold"
                data-testid="create-workshop-submit"
                disabled={!initialMessage || creating}
                onClick={() => void handleCreateWorkshop()}
                type="button"
              >
                {creating
                  ? workshopCopy("agora.workshop.createForm.submittingButton", "建立工坊並啟動策略重建…")
                  : workshopCopy("agora.workshop.createForm.submitButton", "開始與助理共同建模")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-border bg-card text-foreground hover:bg-muted"
                data-testid="create-workshop-cancel"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateDescription("");
                  setCreateTitle("");
                  setCreateError(null);
                }}
                type="button"
              >
                {workshopCopy("agora.workshop.actions.cancel", "取消")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground" data-testid="workshop-list-loading">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          {workshopCopy("agora.workshop.loadingList", "正在載入策略工坊…")}
        </div>
      )}
      {state === "empty" && !showCreateForm && (
        <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground" data-testid="workshop-list-empty">
          <Bot className="h-10 w-10 text-muted-foreground" />
          {workshopCopy("agora.workshop.emptyList", "找不到策略工坊。")}
        </div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-rose-400" data-testid="workshop-list-error">
          {workshopCopy("agora.workshop.listError", "無法載入策略工坊。")}
        </div>
      )}
      {state === "loaded" && selectedWorkshopId && (
        <div
          className="grid min-h-0 flex-1 grid-cols-[minmax(210px,260px)_minmax(0,1fr)]"
          data-testid="strategy-workshop-live-tab"
        >
          <aside className="min-h-0 overflow-auto border-r border-border bg-card p-3" data-testid="workshop-selector">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-muted-foreground">
              <span>{workshopCopy("agora.workshop.liveWorkshops", "即時策略工坊")}</span>
              <span className="normal-case text-muted-foreground">{workshops.length} 個工坊</span>
            </div>
            <div className="grid gap-2" data-testid="workshop-list">
              {workshops.map((ws) => {
                const selected = ws.workshop_id === selectedWorkshopId;
                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    className={
                      selected
                        ? "rounded-md border border-indigo-500/50 bg-muted p-2 text-left"
                        : "rounded-md border border-border bg-background p-2 text-left hover:bg-muted/60"
                    }
                    data-testid={`workshop-item-${ws.workshop_id}`}
                    data-workshop-id={ws.workshop_id}
                    key={ws.workshop_id}
                    onClick={() => handleSelectWorkshop(ws.workshop_id)}
                    type="button"
                  >
                    <span className="block text-xs font-semibold text-foreground">{workshopTitle(ws)}</span>
                    <span className="block text-[11px] text-muted-foreground">{ws.status} - {compactTime(ws)}</span>
                  </button>
                );
              })}
            </div>
          </aside>
          <section className="min-h-0 overflow-hidden" data-testid="selected-workshop-runtime">
            <WorkshopSessionView key={selectedWorkshopId} workshopId={selectedWorkshopId} onAddToTradingRoom={onAddToTradingRoom} />
          </section>
        </div>
      )}
    </div>
  );
}
