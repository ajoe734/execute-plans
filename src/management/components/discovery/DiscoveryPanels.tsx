// Discovery panels (FE-DISCOVERY-VIEWS-20261110): hypothesis card + citations,
// in/out-of-sample metrics, lineage, attribution, source health and template
// evaluations. Every absent field renders "—" so pages work before and after
// the BFF discovery projection is live.
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  DISCOVERY_SAMPLE_KEYS,
  normalizeDiscovery,
  normalizeDiscoveryHealth,
  normalizeTemplateEvaluations,
  type DiscoveryView,
} from "@/lib/bff-v1/discovery";
import { useT } from "@/platform/hooks";

const DASH = "—";

function fmt(value: number | null, digits = 2): string {
  return value === null ? DASH : value.toFixed(digits);
}

function Row({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function RecordLink({ id, href }: { id: string; href: string | null }) {
  if (!href) return <span className="text-mono text-xs">{id}</span>;
  // BFF hrefs are API paths (/bff/management/evidence/{id}); the management evidence page is the UI target.
  const to = href.replace(/^\/bff\/management\/evidence\//, "/management/evidence/");
  return (
    <Link to={to} className="text-mono text-xs text-primary hover:underline">
      {id}
    </Link>
  );
}

export function HypothesisCardPanel({ view, testId = "discovery-hypothesis" }: { view: DiscoveryView; testId?: string }) {
  const t = useT();
  const card = view.hypothesisCard;
  return (
    <Card className="p-4 space-y-3" data-testid={testId}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("discovery.hypothesis.title")}</h3>
      <dl className="grid gap-3 md:grid-cols-2">
        <Row label={t("discovery.hypothesis.claim")} value={card?.claim ?? DASH} testId={`${testId}-claim`} />
        <Row label={t("discovery.hypothesis.mechanism")} value={card?.mechanism ?? DASH} testId={`${testId}-mechanism`} />
        <Row label={t("discovery.hypothesis.horizon")} value={card?.horizon ?? DASH} testId={`${testId}-horizon`} />
        <Row label={t("discovery.hypothesis.universe")} value={card?.universe ?? DASH} testId={`${testId}-universe`} />
        <Row label={t("discovery.hypothesis.direction")} value={card?.direction ?? DASH} testId={`${testId}-direction`} />
        <Row label={t("discovery.hypothesis.testability")} value={card?.testability ?? DASH} testId={`${testId}-testability`} />
        <Row label={t("discovery.hypothesis.ruleSketch")} value={card?.ruleSketch ?? DASH} testId={`${testId}-rule-sketch`} />
        <Row
          label={t("discovery.hypothesis.signalInputs")}
          value={card && card.signalInputs.length > 0 ? card.signalInputs.join(", ") : DASH}
          testId={`${testId}-signal-inputs`}
        />
      </dl>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("discovery.hypothesis.citations")}</div>
        {card && card.citedSpans.length > 0 ? (
          <ul className="mt-1 space-y-2" data-testid={`${testId}-citations`}>
            {card.citedSpans.map((span, i) => (
              <li key={`${span.sourceRecordId ?? "span"}-${i}`} className="text-xs border-l-2 border-border pl-2">
                <blockquote className="italic">{span.exactText ?? DASH}</blockquote>
                <div className="mt-0.5 text-muted-foreground">
                  {t("discovery.hypothesis.sourceRecord")}:{" "}
                  {span.sourceRecordId ? <RecordLink id={span.sourceRecordId} href={span.href} /> : DASH}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-0.5 text-sm" data-testid={`${testId}-citations`}>{DASH}</div>
        )}
      </div>
    </Card>
  );
}

/**
 * `collapseWhenAbsent` renders just the title and a dash when the owner supplied
 * no sample metrics, so dense cards (alpha factory board) never show metric
 * labels for values that were not reported.
 */
export function SampleMetricsPanel({
  view,
  testId = "discovery-metrics",
  collapseWhenAbsent = false,
}: {
  view: DiscoveryView;
  testId?: string;
  collapseWhenAbsent?: boolean;
}) {
  const t = useT();
  const m = view.metrics;
  if (!m && collapseWhenAbsent) {
    return (
      <Card className="p-3 text-xs" data-testid={testId}>
        <span className="uppercase tracking-wider text-muted-foreground">{t("discovery.metrics.title")}: </span>
        <span data-testid={`${testId}-absent`}>{DASH}</span>
      </Card>
    );
  }
  return (
    <Card className="p-4 space-y-3" data-testid={testId}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("discovery.metrics.title")}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left py-1">{t("discovery.metrics.metric")}</th>
            <th className="text-right py-1">{t("discovery.metrics.inSample")}</th>
            <th className="text-right py-1">{t("discovery.metrics.outOfSample")}</th>
          </tr>
        </thead>
        <tbody>
          {DISCOVERY_SAMPLE_KEYS.map((key) => {
            const digits = key === "round_trips" ? 0 : key === "sharpe_ratio" ? 2 : 4;
            return (
              <tr key={key} className="border-b border-border/50">
                <td className="py-1">{t(`discovery.metrics.${key}`)}</td>
                <td className="py-1 text-right text-mono" data-testid={`${testId}-in-${key}`}>
                  {fmt(m?.inSample[key] ?? null, digits)}
                </td>
                <td className="py-1 text-right text-mono" data-testid={`${testId}-out-${key}`}>
                  {fmt(m?.outOfSample[key] ?? null, digits)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <dl className="grid gap-3 md:grid-cols-2">
        <Row label={t("discovery.metrics.deflatedSharpe")} value={fmt(m?.deflatedSharpeRatio ?? null)} testId={`${testId}-deflated-sharpe`} />
        <Row label={t("discovery.metrics.trialCount")} value={fmt(m?.trialCount ?? null, 0)} testId={`${testId}-trial-count`} />
      </dl>
    </Card>
  );
}

export function LineagePanel({ view, testId = "discovery-lineage" }: { view: DiscoveryView; testId?: string }) {
  const t = useT();
  const l = view.lineage;
  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : DASH);
  return (
    <Card className="p-4 space-y-3" data-testid={testId}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("discovery.lineage.title")}</h3>
      <dl className="grid gap-3 md:grid-cols-2">
        <Row label={t("discovery.lineage.evidenceBundle")} value={l?.evidenceBundleId ?? DASH} testId={`${testId}-evidence-bundle`} />
        <Row
          label={t("discovery.lineage.sourceRecords")}
          value={
            l && l.sourceRecords.length > 0 ? (
              <span className="flex flex-wrap gap-2">
                {l.sourceRecords.map((r) => (
                  <RecordLink key={r.sourceRecordId} id={r.sourceRecordId} href={r.href} />
                ))}
              </span>
            ) : (
              DASH
            )
          }
          testId={`${testId}-source-records`}
        />
        <Row label={t("discovery.lineage.citationRefs")} value={list(l?.citationRefs ?? [])} testId={`${testId}-citation-refs`} />
        <Row label={t("discovery.lineage.traceRefs")} value={list(l?.traceRefs ?? [])} testId={`${testId}-trace-refs`} />
      </dl>
    </Card>
  );
}

export function AttributionNote({ view, testId = "discovery-attribution" }: { view: DiscoveryView; testId?: string }) {
  const t = useT();
  return (
    <div className="text-xs text-muted-foreground" data-testid={testId}>
      <span className="uppercase tracking-wider">{t("discovery.attribution.title")}: </span>
      {view.attribution ?? DASH}
    </div>
  );
}

export function SourceHealthPanel({ health, testId = "discovery-health" }: { health: unknown; testId?: string }) {
  const t = useT();
  const h = normalizeDiscoveryHealth(health);
  return (
    <Card className="p-4 space-y-3" data-testid={testId}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("discovery.health.title")}</h3>
      <dl className="grid gap-3 md:grid-cols-2">
        <Row label={t("discovery.health.healthState")} value={h?.healthState ?? DASH} testId={`${testId}-state`} />
        <Row label={t("discovery.health.lifecycle")} value={h?.effectiveLifecycle ?? DASH} testId={`${testId}-lifecycle`} />
        <Row
          label={t("discovery.health.paused")}
          value={h?.paused == null ? DASH : h.paused ? t("discovery.health.pausedYes") : t("discovery.health.pausedNo")}
          testId={`${testId}-paused`}
        />
        <Row
          label={t("discovery.health.pauseReasons")}
          value={h && h.pauseReasons.length > 0 ? h.pauseReasons.join(", ") : DASH}
          testId={`${testId}-pause-reasons`}
        />
      </dl>
    </Card>
  );
}

export function TemplateEvaluationsPanel({ templates, testId = "discovery-templates" }: { templates: unknown; testId?: string }) {
  const t = useT();
  const rows = normalizeTemplateEvaluations(templates);
  return (
    <Card className="p-4 space-y-3" data-testid={testId}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("discovery.templates.title")}</h3>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{DASH}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.templateId} className="text-xs border-b border-border/50 pb-2" data-testid={`${testId}-row-${r.templateId}`}>
              <div className="text-mono">{r.name ?? r.templateId}</div>
              <div className="text-muted-foreground">
                {t("discovery.templates.family")}: {r.family ?? DASH} · {t("discovery.templates.status")}: {r.status ?? DASH} ·{" "}
                {t("discovery.templates.evaluationRef")}: {r.evaluationRef ?? DASH} · {t("discovery.templates.duplicateOf")}:{" "}
                {r.duplicateOf ?? DASH}
              </div>
              <div className="text-mono" data-testid={`${testId}-scores-${r.templateId}`}>
                {t("discovery.templates.scores")}:{" "}
                {r.scores.length > 0 ? r.scores.map((s) => `${s.key} ${s.value}`).join(" · ") : DASH}
              </div>
              {r.attribution ? <div className="text-muted-foreground">{r.attribution}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Hypothesis + metrics + lineage + attribution for any record carrying discovery fields. */
export function DiscoverySections({ record, testId = "discovery" }: { record: unknown; testId?: string }) {
  const view = normalizeDiscovery(record);
  return (
    <div className="space-y-3" data-testid={testId}>
      <HypothesisCardPanel view={view} testId={`${testId}-hypothesis`} />
      <SampleMetricsPanel view={view} testId={`${testId}-metrics`} />
      <LineagePanel view={view} testId={`${testId}-lineage`} />
      <AttributionNote view={view} testId={`${testId}-attribution`} />
    </div>
  );
}
