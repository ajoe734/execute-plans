// Lineage Explorer — Spec Part 3 §19.6.
// Single-object lineage lookup by strategy/persona name or object ID.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useInspector } from "@/platform/components/RightDrawer";
import { useT } from "@/platform/hooks";
import {
  bffV1,
  highlightLineageNodesForRoot,
  managementConsoleReads,
  type LineageRead,
} from "@/lib/bff-v1";
import { lineageNodeTypeLabel, resolveLineageNodeLabel } from "@/lib/enumLabels";
import { resolveEntity, decisionsHref, auditHref } from "@/lib/entityLinks";
import { GitBranch, BookMarked, ArrowUpRight, Search } from "lucide-react";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const TYPES = ["Strategy", "Persona", "Artifact", "CapitalPool", "Experiment", "Dataset"] as const;

export interface LineageLookupCandidate {
  id: string;
  name: string;
  kind: "Strategy" | "Persona";
  searchTokens: string;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function looksLikeLineageEntityId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/[^\p{ASCII}]/u.test(trimmed) || /\s/.test(trimmed)) return false;
  return /^[a-z0-9]+(?:[-_:][a-z0-9_.:@-]+)+$/i.test(trimmed);
}

function resolveCandidateRoot(raw: string, candidateList: LineageLookupCandidate[]): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const exactId = candidateList.find((c) => c.id.toLowerCase() === lower);
  if (exactId) return exactId.id;
  const exactName = candidateList.find((c) => c.name.toLowerCase() === lower);
  if (exactName) return exactName.id;
  const matches = candidateList.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      c.id.toLowerCase().includes(lower) ||
      c.searchTokens.includes(lower),
  );
  const hasNonAscii = /[^\p{ASCII}]/u.test(trimmed);
  if (matches.length === 1 || (hasNonAscii && matches.length > 0)) {
    return matches[0].id;
  }
  return null;
}

function isLineageEdgeLike(record: Record<string, unknown>): boolean {
  return (
    typeof record.from_artifact_id === "string" ||
    typeof record.to_artifact_id === "string" ||
    typeof record.edge_type === "string" ||
    (typeof record.from === "string" && typeof record.to === "string")
  );
}

function isRetiredStateToken(value: unknown): boolean {
  const token = asNonEmptyString(value)?.toLowerCase();
  return token === "retired" || token === "archived" || token === "deprecated";
}

function isCurrentStrategyRow(rec: Record<string, unknown>): boolean {
  const listScope = asNonEmptyString(rec.listScope ?? rec.list_scope)?.toLowerCase();
  if (listScope && listScope !== "current" && listScope !== "unknown") {
    return false;
  }
  const state = asNonEmptyString(
    rec.state ?? rec.status ?? rec.lifecycle_state ?? rec.lifecycleState,
  )?.toLowerCase();
  if (state === "draft" || isRetiredStateToken(state)) {
    return false;
  }
  const opStatus = asNonEmptyString(
    rec.operationalStatus ?? rec.operational_status,
  )?.toLowerCase();
  if (isRetiredStateToken(opStatus)) {
    return false;
  }
  const personaStates = Array.isArray(rec.personaStates)
    ? rec.personaStates
    : Array.isArray(rec.persona_states)
      ? rec.persona_states
      : null;
  if (personaStates && personaStates.length > 0) {
    const allRetired = personaStates.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const pRec = entry as Record<string, unknown>;
      return isRetiredStateToken(pRec.state ?? pRec.status);
    });
    if (allRetired) return false;
  }
  return true;
}

function isCurrentPersonaRow(rec: Record<string, unknown>): boolean {
  if (rec.archived === true) return false;
  const listScope = asNonEmptyString(rec.listScope ?? rec.list_scope)?.toLowerCase();
  if (listScope && listScope !== "unknown") {
    if (listScope !== "current") return false;
  }
  const state = asNonEmptyString(
    rec.state ??
      rec.status ??
      rec.lifecycle_state ??
      rec.lifecycleState ??
      rec.lifecycleStatus ??
      rec.lifecycle_status,
  )?.toLowerCase();
  if (isRetiredStateToken(state)) {
    return false;
  }
  return true;
}

export const LineageExplorerPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialRoot = (params.get("root") ?? "").trim();
  const [activeRootId, setActiveRootId] = useState<string>(initialRoot);
  const [queryInput, setQueryInput] = useState<string>(initialRoot);
  const [isTypingQuery, setIsTypingQuery] = useState<boolean>(false);
  const [isPickerExpanded, setIsPickerExpanded] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<LineageLookupCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState<boolean>(true);
  const [pendingNameLookup, setPendingNameLookup] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TYPES.map((typ) => [typ, true])),
  );

  useEffect(() => {
    const nextRoot = (params.get("root") ?? "").trim();
    if (nextRoot !== activeRootId) {
      setActiveRootId(nextRoot);
      setQueryInput(nextRoot);
      setIsTypingQuery(false);
      setIsPickerExpanded(false);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      bffV1.strategies.listNonDraft({ hideRetiredPersonas: true }).catch(() => []),
      bffV1.personas.list().catch(() => []),
    ]).then(([strategyRows, personaRows]) => {
      if (cancelled) return;
      const byId = new Map<string, LineageLookupCandidate>();
      const personaNamesFromStrategies = new Map<string, string>();
      const excludedPersonaIds = new Set<string>();

      for (const raw of Array.isArray(strategyRows) ? strategyRows : []) {
        if (!raw || typeof raw !== "object") continue;
        const rec = raw as unknown as Record<string, unknown>;
        if (isLineageEdgeLike(rec)) continue;
        const id = asNonEmptyString(rec.id ?? rec.strategy_id ?? rec.strategyId);
        if (!id) continue;
        if (!isCurrentStrategyRow(rec)) continue;
        const name =
          asNonEmptyString(rec.display_name ?? rec.displayName ?? rec.title ?? rec.name) ?? id;
        const personaNameMap =
          rec.persona_display_names && typeof rec.persona_display_names === "object"
            ? (rec.persona_display_names as Record<string, unknown>)
            : {};
        const extraTokens: string[] = [];
        for (const [pid, pname] of Object.entries(personaNameMap)) {
          const cleanPid = asNonEmptyString(pid);
          const cleanPname = asNonEmptyString(pname);
          if (cleanPid && cleanPname) {
            personaNamesFromStrategies.set(cleanPid, cleanPname);
            extraTokens.push(cleanPid, cleanPname);
          }
        }
        byId.set(id, {
          id,
          name,
          kind: "Strategy",
          searchTokens: [id, name, ...extraTokens].join(" ").toLowerCase(),
        });
      }

      for (const raw of Array.isArray(personaRows) ? personaRows : []) {
        if (!raw || typeof raw !== "object") continue;
        const rec = raw as unknown as Record<string, unknown>;
        if (isLineageEdgeLike(rec)) continue;
        const id = asNonEmptyString(rec.id ?? rec.persona_id ?? rec.personaId);
        if (!id) continue;
        if (!isCurrentPersonaRow(rec)) {
          excludedPersonaIds.add(id);
          continue;
        }
        const name =
          asNonEmptyString(
            rec.display_name ??
              rec.displayName ??
              rec.personaName ??
              rec.name ??
              rec.title ??
              personaNamesFromStrategies.get(id),
          ) ?? id;
        byId.set(id, {
          id,
          name,
          kind: "Persona",
          searchTokens: [id, name].join(" ").toLowerCase(),
        });
      }

      for (const [pid, pname] of personaNamesFromStrategies.entries()) {
        if (!byId.has(pid) && !excludedPersonaIds.has(pid)) {
          byId.set(pid, {
            id: pid,
            name: pname,
            kind: "Persona",
            searchTokens: [pid, pname].join(" ").toLowerCase(),
          });
        }
      }

      setCandidates(Array.from(byId.values()));
      setCandidatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data, loading, error } = useV5Live<LineageRead | null>(
    (signal) =>
      activeRootId
        ? managementConsoleReads.lineage(activeRootId, { signal })
        : Promise.resolve(null),
    [activeRootId],
    { cacheKey: `phase2.lineage.${activeRootId || "none"}` },
  );

  const filteredCandidates = useMemo(() => {
    const q = isTypingQuery ? queryInput.trim().toLowerCase() : "";
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.searchTokens.includes(q),
    );
  }, [candidates, isTypingQuery, queryInput]);

  const commitRoot = (nextRootId: string, displayInput?: string) => {
    const trimmed = nextRootId.trim();
    setPendingNameLookup(null);
    setActiveRootId(trimmed);
    setQueryInput(displayInput ?? trimmed);
    setIsTypingQuery(false);
    setIsPickerExpanded(false);
    setSelected(null);
    const p = new URLSearchParams(params);
    if (trimmed) {
      p.set("root", trimmed);
    } else {
      p.delete("root");
    }
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (candidatesLoading || pendingNameLookup === null) return;
    const raw = pendingNameLookup;
    setPendingNameLookup(null);
    const resolved = resolveCandidateRoot(raw, candidates);
    if (resolved !== null) {
      commitRoot(resolved, resolved);
      return;
    }
    if (looksLikeLineageEntityId(raw)) {
      commitRoot(raw, raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesLoading, pendingNameLookup, candidates]);

  const handleSubmitLookup = (e?: FormEvent) => {
    e?.preventDefault();
    const raw = queryInput.trim();
    if (!raw) {
      commitRoot("");
      return;
    }
    if (candidatesLoading) {
      if (looksLikeLineageEntityId(raw)) {
        commitRoot(raw, raw);
      } else {
        setPendingNameLookup(raw);
      }
      return;
    }
    const resolved = resolveCandidateRoot(raw, candidates);
    if (resolved !== null) {
      commitRoot(resolved, resolved);
      return;
    }
    if (looksLikeLineageEntityId(raw)) {
      commitRoot(raw, raw);
    }
  };

  const metaStatus = (
    data?.meta?.status ??
    data?.meta?.surfaces?.lineage?.status ??
    ""
  ).toLowerCase();
  const isUnavailable =
    Boolean(activeRootId) &&
    !loading &&
    (Boolean(error) || !data || metaStatus === "unavailable" || metaStatus === "error" || metaStatus === "failed");
  const hasMore = Boolean(activeRootId && !isUnavailable && (data?.has_more ?? data?.page_info?.has_more));

  const { nodes, edges } = useMemo<{ nodes: LineageNode[]; edges: LineageEdge[] }>(() => {
    if (!activeRootId || !data) {
      return { nodes: [], edges: [] };
    }
    const all: LineageNode[] = highlightLineageNodesForRoot(data.nodes ?? [], activeRootId);
    const e: LineageEdge[] = data.edges ?? [];
    const q = filter.trim().toLowerCase();
    const filtered = all.filter(
      (n) =>
        enabled[n.type] !== false &&
        (!q ||
          (n.display_name ?? "").toLowerCase().includes(q) ||
          resolveLineageNodeLabel(n, t).toLowerCase().includes(q) ||
          n.label.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q)),
    );
    const ids = new Set(filtered.map((n) => n.id));
    return { nodes: filtered, edges: e.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
  }, [data, activeRootId, filter, enabled, t]);

  const selectedCandidate = useMemo(
    () => (activeRootId ? candidates.find((c) => c.id === activeRootId) ?? null : null),
    [candidates, activeRootId],
  );
  const highlightedNode = useMemo(() => {
    if (!activeRootId || !data?.nodes) return null;
    const allHighlighted = highlightLineageNodesForRoot(data.nodes, activeRootId);
    return allHighlighted.find((n) => n.highlight) ?? null;
  }, [data, activeRootId]);
  const isCandidatesCollapsed = Boolean(activeRootId) && !isTypingQuery && !isPickerExpanded;
  const chosenKind = selectedCandidate?.kind ?? highlightedNode?.type;
  const chosenName =
    selectedCandidate?.name ??
    (highlightedNode ? resolveLineageNodeLabel(highlightedNode, t) : activeRootId);

  const selectedResolved = selected ? resolveEntity(selected.id) : null;

  return (
    <>
      <PageHeader title={t("nav.lineage")} subtitle={t("lineageExplorer.subtitle")} />
      <PageBody>
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <form className="space-y-1.5" onSubmit={handleSubmitLookup}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.root")}</div>
              <div className="flex gap-2">
                <Input
                  aria-label={t("lineageExplorer.root")}
                  data-testid="lineage-root-input"
                  value={queryInput}
                  onChange={(e) => {
                    setQueryInput(e.target.value);
                    setPendingNameLookup(null);
                    setIsTypingQuery(true);
                    setIsPickerExpanded(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmitLookup();
                    }
                  }}
                  placeholder={t("lineageExplorer.rootPh", { defaultValue: t("lineageExplorer.root") })}
                />
                <Button type="submit" size="sm" variant="secondary" data-testid="lineage-root-submit">
                  <Search className="h-3.5 w-3.5 mr-1" />
                  {t("lineageExplorer.lookupAction")}
                </Button>
              </div>
            </form>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.filter")}</div>
              <Input
                aria-label={t("lineageExplorer.filter")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("lineageExplorer.filterPh")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.types")}</div>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((typ) => {
                  const typeLabel = lineageNodeTypeLabel(typ, t);
                  return (
                    <button
                      key={typ}
                      type="button"
                      data-testid={`lineage-type-filter-${typ}`}
                      aria-label={typeLabel}
                      aria-pressed={enabled[typ] !== false}
                      onClick={() => setEnabled((p) => ({ ...p, [typ]: !p[typ] }))}
                    >
                      <Badge variant={enabled[typ] ? "default" : "outline"} className="cursor-pointer">{typeLabel}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {candidatesLoading && (
            <div
              role="status"
              data-testid="lineage-candidates-loading"
              className="pt-1 text-xs text-muted-foreground"
            >
              {t("lineageExplorer.loadingCandidates")}
            </div>
          )}
          {(candidates.length > 0 || isCandidatesCollapsed) && (
            <div className="space-y-1.5 pt-1" data-testid="lineage-lookup-candidates">
              {isCandidatesCollapsed ? (
                <div
                  data-testid="lineage-lookup-selected"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("lineageExplorer.selectedObjectLabel")}
                    </span>
                    {chosenKind && (
                      <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0">
                        {lineageNodeTypeLabel(chosenKind, t)}
                      </Badge>
                    )}
                    <span className="font-medium text-foreground" data-testid="lineage-selected-name">
                      {chosenName}
                    </span>
                    {chosenName !== activeRootId && (
                      <span className="text-mono text-[11px] text-muted-foreground break-all" data-testid="lineage-selected-id">
                        {activeRootId}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="lineage-lookup-change"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setIsPickerExpanded(true)}
                  >
                    {t("lineageExplorer.changeObject")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("lineageExplorer.candidatesLabel")}
                  </div>
                  {filteredCandidates.length > 0 ? (
                    <div
                      role="listbox"
                      aria-label={t("lineageExplorer.candidatesLabel")}
                      data-testid="lineage-lookup-options"
                      className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto"
                    >
                      {filteredCandidates.map((item) => {
                        const isSelected = activeRootId === item.id;
                        return (
                          <button
                            key={`${item.kind}:${item.id}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            data-testid={`lineage-lookup-option-${item.id}`}
                            data-candidate-id={item.id}
                            data-candidate-kind={item.kind}
                            onClick={() => commitRoot(item.id, item.id)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-left text-xs transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background hover:bg-muted/60 text-foreground"
                            }`}
                          >
                            <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0">
                              {lineageNodeTypeLabel(item.kind, t)}
                            </Badge>
                            <span className="font-medium" data-testid={`lineage-candidate-name-${item.id}`}>
                              {item.name}
                            </span>
                            <span className="text-mono text-[11px] text-muted-foreground break-all">{item.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      data-testid="lineage-lookup-no-candidates"
                      className="text-xs text-muted-foreground"
                    >
                      {t("lineageExplorer.noCandidates", { query: queryInput.trim() })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {hasMore && (
            <div
              role="status"
              data-testid="lineage-has-more"
              className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
            >
              {t("lineageExplorer.hasMore")}
            </div>
          )}
        </Card>
        <Card className="p-2">
          {!activeRootId ? (
            <div
              data-testid="lineage-lookup-prompt"
              className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            >
              {t("lineageExplorer.selectPrompt")}
            </div>
          ) : !loading && isUnavailable ? (
            <div
              role="alert"
              data-testid="lineage-unavailable"
              className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            >
              {t("lineageExplorer.unavailable")}
            </div>
          ) : (
            <LineageGraph nodes={nodes} edges={edges} height={420} onSelect={(n) => {
              setSelected(n);
              const r = resolveEntity(n.id);
              const displayName = resolveLineageNodeLabel(n, t);
              useInspector.getState().open({
                id: n.id, type: n.type, name: displayName, state: n.state, risk: n.risk,
                href: r?.route,
                meta: [
                  ...(n.state ? [{ label: "State", value: n.state }] : []),
                  ...(n.risk ? [{ label: "Risk", value: n.risk }] : []),
                ],
                lineage: {
                  upstream: edges.filter((e) => e.to === n.id).map((e) => e.from),
                  downstream: edges.filter((e) => e.from === n.id).map((e) => e.to),
                },
              });
            }} />
          )}
        </Card>
        {selected && (
          <Card className="p-4">
            <div className="flex flex-wrap items-baseline gap-3 mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("audit.crossLinks")}</span>
              <span className="font-medium">{resolveLineageNodeLabel(selected, t)}</span>
              <span className="text-mono text-xs text-muted-foreground">{selected.id}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedResolved ? (
                <>
                  <Link to={selectedResolved.route}>
                    <Button size="sm" variant="outline"><ArrowUpRight className="h-3.5 w-3.5 mr-1" />{selectedResolved.label}</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => navigate(decisionsHref(selectedResolved.kind, selectedResolved.id))}>
                    <BookMarked className="h-3.5 w-3.5 mr-1" />{t("audit.openDecisions")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(auditHref(selectedResolved.id))}>
                    <GitBranch className="h-3.5 w-3.5 mr-1" />{t("audit.openAudit")}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("common.noDetailRoute")}</span>
              )}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
};
