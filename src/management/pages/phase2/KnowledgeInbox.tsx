// Knowledge Inbox — Spec Part 3 §19.6.
// Read-only view of connected knowledge sources; surfaces unconnected/failed sources from meta.surfaces.
import { useEffect, useMemo, useState } from "react";
import { managementConsoleReads, type KnowledgeInsightRecord } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";

type SourceIssueKind = "not_connected" | "failed";

interface KnowledgeSourceIssue {
  key: string;
  kind: SourceIssueKind;
}

const AGGREGATE_SURFACE_KEYS = new Set(["knowledge", "knowledge_inbox"]);

function extractKnowledgeSourceIssues(envelope: unknown): KnowledgeSourceIssue[] {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return [];
  }
  const meta = (envelope as { meta?: Record<string, unknown> }).meta;
  if (!meta || typeof meta !== "object") {
    return [];
  }

  const issues: KnowledgeSourceIssue[] = [];
  const seen = new Set<string>();
  const surfaces = meta.surfaces as Record<string, Record<string, unknown>> | undefined;

  if (surfaces && typeof surfaces === "object") {
    for (const [key, state] of Object.entries(surfaces)) {
      if (AGGREGATE_SURFACE_KEYS.has(key) || !state || typeof state !== "object") {
        continue;
      }
      const status = String(state.status ?? "").trim().toLowerCase();
      const source = String(state.source ?? "").trim().toLowerCase();
      const reason = String(state.reason ?? "").trim().toLowerCase();
      if (source === "missing" || reason === "missing") {
        seen.add(key);
        issues.push({ key, kind: "not_connected" });
      } else if ((status && status !== "ok") || source === "unavailable") {
        seen.add(key);
        issues.push({ key, kind: "failed" });
      }
    }
  }

  if (issues.length === 0) {
    const inboxSurface = surfaces?.knowledge_inbox;
    const rawDegraded = Array.isArray(meta.degraded_sources)
      ? meta.degraded_sources
      : Array.isArray(inboxSurface?.degraded_sources)
        ? inboxSurface.degraded_sources
        : [];
    for (const entry of rawDegraded) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const key = String(rec.surface ?? rec.dataset ?? rec.inbox_type ?? "").trim();
      if (!key || seen.has(key)) continue;
      const status = String(rec.status ?? "unavailable").trim().toLowerCase();
      const source = String(rec.source ?? "").trim().toLowerCase();
      const reason = String(rec.reason ?? "").trim().toLowerCase();
      if (source === "missing" || reason === "missing") {
        seen.add(key);
        issues.push({ key, kind: "not_connected" });
      } else if (status !== "ok") {
        seen.add(key);
        issues.push({ key, kind: "failed" });
      }
    }
  }

  return issues;
}

function formatKnowledgeSourceLabel(key: string, t: ReturnType<typeof useT>): string {
  const normalized = key.trim();
  const translated = t(`knowledge.sources.${normalized}`, { defaultValue: "" });
  if (translated && translated !== `knowledge.sources.${normalized}`) {
    return translated;
  }
  return normalized;
}

export const KnowledgeInboxPage = () => {
  const t = useT();
  const { data: envelope, loading, error } = useV5Live(
    (signal) => managementConsoleReads.knowledgeInbox({ signal }),
    [],
    { cacheKey: "phase2.knowledgeInbox" },
  );
  const live = Array.isArray(envelope) ? envelope : envelope?.items;
  const metaStatus = (
    (!Array.isArray(envelope)
      ? envelope?.meta?.status ??
        envelope?.meta?.surfaces?.knowledge_inbox?.status ??
        envelope?.meta?.surfaces?.knowledge?.status
      : undefined) ?? ""
  ).toLowerCase();
  const isUnavailable =
    !loading &&
    (Boolean(error) || !envelope || metaStatus === "unavailable" || metaStatus === "error" || metaStatus === "failed");
  const sourceIssues = useMemo(() => extractKnowledgeSourceIssues(envelope), [envelope]);
  const everySourceRead = !loading && !isUnavailable && sourceIssues.length === 0;

  const [items, setItems] = useState<KnowledgeInsightRecord[]>([]);
  const [active, setActive] = useState<KnowledgeInsightRecord | null>(null);
  useEffect(() => {
    if (!live) {
      setItems([]);
      setActive(null);
      return;
    }
    setItems(live);
    setActive((prev) => (prev && live.some((item) => item.id === prev.id) ? prev : live[0] ?? null));
  }, [live]);

  const activeTime = active?.ts ? safeDateTime(active.ts) : "";
  const formattedTime = activeTime && activeTime !== "—" ? activeTime : (active?.ts || "");
  const activeMetaLine = active ? [active.source, formattedTime].filter(Boolean).join(" · ") : "";

  return (
    <>
      <PageHeader title={t("nav.knowledge")} subtitle={t("knowledge.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <Card className="p-2">
            {loading && items.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center" data-testid="knowledge-inbox-loading">
                {t("knowledge.loading")}
              </div>
            )}
            {!loading && isUnavailable && items.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center" data-testid="knowledge-inbox-unavailable">
                {t("knowledge.unavailable")}
              </div>
            )}
            {!loading && sourceIssues.length > 0 && (
              <div
                className="p-4 m-2 rounded-md border border-status-warning/40 bg-status-warning/5 text-xs space-y-2"
                data-testid="knowledge-source-issues"
              >
                <div className="font-medium text-foreground">{t("knowledge.sourceStatusTitle")}</div>
                <p className="text-muted-foreground">{t("knowledge.sourceStatusSummary")}</p>
                <ul className="space-y-1.5" data-testid="knowledge-source-status-list">
                  {sourceIssues.map((issue) => (
                    <li
                      key={issue.key}
                      data-testid={`knowledge-source-${issue.key}`}
                      data-source-state={issue.kind}
                      className="flex items-center justify-between gap-2 text-foreground"
                    >
                      <span className="font-medium">{formatKnowledgeSourceLabel(issue.key, t)}</span>
                      <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                        {issue.kind === "not_connected"
                          ? t("knowledge.sourceNotConnected")
                          : t("knowledge.sourceReadFailed")}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {!isUnavailable && items.length === 0 && (
                  <p className="text-muted-foreground pt-1" data-testid="knowledge-partial-no-items">
                    {t("knowledge.noItemsFromConnectedSources")}
                  </p>
                )}
              </div>
            )}
            {everySourceRead && items.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center" data-testid="knowledge-inbox-empty">
                {t("knowledge.empty")}
              </div>
            )}
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id}>
                  <button onClick={() => setActive(i)} className={`w-full text-left p-3 hover:bg-muted/40 ${active?.id === i.id ? "bg-muted/60" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RiskBadge level={i.risk} />
                      {i.kind && <Badge variant="outline" className="text-[10px] uppercase">{i.kind}</Badge>}
                    </div>
                    <div className="text-sm font-medium truncate">{i.title}</div>
                    {i.source && <div className="text-xs text-muted-foreground text-mono mt-0.5">{i.source}</div>}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-4">
            {active ? (
              <>
                <div className="flex items-center gap-2">
                  <RiskBadge level={active.risk} />
                  {active.kind && <Badge variant="outline">{active.kind}</Badge>}
                  <span className="text-mono text-xs text-muted-foreground">{active.id}</span>
                </div>
                <h2 className="text-lg font-semibold">{active.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{active.body}</p>
                {activeMetaLine && <div className="text-xs text-muted-foreground text-mono">{activeMetaLine}</div>}
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-12">{t("knowledge.selectHint")}</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
