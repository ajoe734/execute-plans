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
    "Strategy workshop"
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
  if (Number.isNaN(date.getTime())) return "time unavailable";
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

  const handleCreateWorkshop = async () => {
    const title = createTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createWorkshop({
        initial_message: title,
        title,
      });
      const ordered = await fetchWorkshops();
      const targetId = created?.workshop_id || ordered[0]?.workshop_id || null;
      setShowCreateForm(false);
      setCreateTitle("");
      if (targetId) {
        handleSelectWorkshop(targetId);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create workshop");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="strategy-workshop-page-list">
      {/* List Header Bar with Create Action */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shrink-0" data-testid="workshop-list-header">
        <h2 className="text-sm font-semibold text-slate-800">Strategy Workshops</h2>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-8 text-xs"
          data-testid="create-workshop-btn"
          onClick={() => setShowCreateForm(true)}
          type="button"
        >
          + Create Workshop
        </Button>
      </div>

      {showCreateForm && (
        <div className="border-b border-indigo-100 bg-indigo-50/50 p-4 shrink-0" data-testid="create-workshop-form">
          <div className="max-w-md space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Create New Strategy Workshop</h3>
            <div>
              <label className="sr-only" htmlFor="create-workshop-title">Workshop Strategy Title</label>
              <input
                id="create-workshop-title"
                type="text"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                data-testid="create-workshop-title-input"
                placeholder="e.g. BTC Volatility Arbitrage Strategy"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createTitle.trim() && !creating) {
                    e.preventDefault();
                    void handleCreateWorkshop();
                  }
                }}
              />
            </div>
            {createError && <p className="text-xs text-red-600 font-semibold" data-testid="create-workshop-error">{createError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs font-semibold"
                data-testid="create-workshop-submit"
                disabled={!createTitle.trim() || creating}
                onClick={() => void handleCreateWorkshop()}
                type="button"
              >
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                data-testid="create-workshop-cancel"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateTitle("");
                  setCreateError(null);
                }}
                type="button"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500" data-testid="workshop-list-loading">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          Loading workshops...
        </div>
      )}
      {state === "empty" && !showCreateForm && (
        <div className="flex flex-col items-center gap-2 p-6 text-sm text-slate-500" data-testid="workshop-list-empty">
          <Bot className="h-10 w-10 text-slate-300" />
          No workshops found. Click &quot;+ Create Workshop&quot; to begin.
        </div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-red-600" data-testid="workshop-list-error">Unable to load workshops.</div>
      )}
      {state === "loaded" && selectedWorkshopId && (
        <div
          className="grid min-h-0 flex-1 grid-cols-[minmax(210px,260px)_minmax(0,1fr)]"
          data-testid="strategy-workshop-live-tab"
        >
          <aside className="min-h-0 overflow-auto border-r border-slate-200 bg-slate-50 p-3" data-testid="workshop-selector">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-500">
              <span>Live workshops</span>
              <span className="normal-case text-slate-400">{workshops.length} 個工坊</span>
            </div>
            <div className="grid gap-2" data-testid="workshop-list">
              {workshops.map((ws) => {
                const selected = ws.workshop_id === selectedWorkshopId;
                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    className={
                      selected
                        ? "rounded-md border border-blue-300 bg-blue-50 p-2 text-left"
                        : "rounded-md border border-slate-200 bg-white p-2 text-left hover:border-slate-300"
                    }
                    data-testid={`workshop-item-${ws.workshop_id}`}
                    data-workshop-id={ws.workshop_id}
                    key={ws.workshop_id}
                    onClick={() => handleSelectWorkshop(ws.workshop_id)}
                    type="button"
                  >
                    <span className="block text-xs font-semibold text-slate-800">{workshopTitle(ws)}</span>
                    <span className="block text-[11px] text-slate-500">{ws.status} - {compactTime(ws)}</span>
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
