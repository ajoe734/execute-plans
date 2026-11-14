// Discovery read-surface normalizer (FE-DISCOVERY-VIEWS-20261110).
//
// Shapes come from the BFF discovery projection (BFF-DISCOVERY-READ-SURFACES):
// hypothesis_card (cited_spans -> source_record links), in/out-of-sample metrics,
// lineage, data.gov.tw attribution, data-source health/pause reasons and alpha
// template evaluations. Every field is optional: an absent field stays `null`
// so the UI can render a dash — nothing here invents a value.

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => x !== null) : [];

export interface DiscoverySourceRecordLink {
  sourceRecordId: string;
  href: string | null;
}

export interface DiscoveryCitedSpan {
  sourceRecordId: string | null;
  exactText: string | null;
  start: number | null;
  end: number | null;
  href: string | null;
}

export interface DiscoveryHypothesisCard {
  claim: string;
  mechanism: string | null;
  horizon: string | null;
  universe: string | null;
  direction: string | null;
  ruleSketch: string | null;
  testability: string | null;
  signalInputs: string[];
  citedSpans: DiscoveryCitedSpan[];
}

export type DiscoverySampleKey = "sharpe_ratio" | "max_drawdown" | "total_return" | "round_trips";
export const DISCOVERY_SAMPLE_KEYS: readonly DiscoverySampleKey[] = [
  "sharpe_ratio",
  "max_drawdown",
  "total_return",
  "round_trips",
];

export interface DiscoverySampleMetrics {
  inSample: Record<DiscoverySampleKey, number | null>;
  outOfSample: Record<DiscoverySampleKey, number | null>;
  deflatedSharpeRatio: number | null;
  trialCount: number | null;
}

export interface DiscoveryLineage {
  evidenceBundleId: string | null;
  sourceRecords: DiscoverySourceRecordLink[];
  citationRefs: string[];
  traceRefs: string[];
}

export interface DiscoveryHealth {
  healthState: string | null;
  effectiveLifecycle: string | null;
  paused: boolean | null;
  pauseReasons: string[];
}

export interface DiscoveryTemplateEvaluation {
  templateId: string;
  name: string | null;
  family: string | null;
  status: string | null;
  evaluationRef: string | null;
  duplicateOf: string | null;
  /** Flat numeric evaluation entries the owner supplied (key -> value). */
  scores: Array<{ key: string; value: number }>;
  attribution: string | null;
}

export interface DiscoveryView {
  hypothesisCard: DiscoveryHypothesisCard | null;
  metrics: DiscoverySampleMetrics | null;
  lineage: DiscoveryLineage | null;
  attribution: string | null;
  health: DiscoveryHealth | null;
}

function normalizeCard(raw: unknown): DiscoveryHypothesisCard | null {
  const r = rec(raw);
  const claim = r ? str(r.claim) : null;
  if (!r || !claim) return null;
  const spans = (Array.isArray(r.cited_spans) ? r.cited_spans : [])
    .map((s) => rec(s))
    .filter((s): s is Rec => s !== null)
    .map((s): DiscoveryCitedSpan => {
      const link = rec(s.source_record);
      return {
        sourceRecordId: str(s.source_record_id) ?? str(link?.source_record_id),
        exactText: str(s.exact_text),
        start: num(s.start),
        end: num(s.end),
        href: str(link?.href),
      };
    });
  return {
    claim,
    mechanism: str(r.mechanism),
    horizon: str(r.horizon),
    universe: str(r.universe),
    direction: str(r.direction),
    ruleSketch: str(r.rule_sketch),
    testability: str(r.testability),
    signalInputs: strList(r.signal_inputs),
    citedSpans: spans,
  };
}

function sampleSide(raw: unknown): Record<DiscoverySampleKey, number | null> {
  const r = rec(raw) ?? {};
  return {
    sharpe_ratio: num(r.sharpe_ratio),
    max_drawdown: num(r.max_drawdown),
    total_return: num(r.total_return),
    round_trips: num(r.round_trips),
  };
}

function normalizeMetrics(raw: unknown): DiscoverySampleMetrics | null {
  const r = rec(raw);
  if (!r) return null;
  const inSample = sampleSide(r.in_sample);
  const outOfSample = sampleSide(r.out_of_sample);
  const any = [...Object.values(inSample), ...Object.values(outOfSample)].some((v) => v !== null);
  if (!any) return null;
  return {
    inSample,
    outOfSample,
    deflatedSharpeRatio: num(r.deflated_sharpe_ratio),
    trialCount: num(r.trial_count),
  };
}

function normalizeLineage(raw: unknown): DiscoveryLineage | null {
  const r = rec(raw);
  if (!r) return null;
  const records: DiscoverySourceRecordLink[] = [];
  for (const item of Array.isArray(r.source_records) ? r.source_records : []) {
    const link = rec(item);
    const id = str(link?.source_record_id);
    if (id) records.push({ sourceRecordId: id, href: str(link?.href) });
  }
  return {
    evidenceBundleId: str(r.evidence_bundle_id),
    sourceRecords: records,
    citationRefs: strList(r.citation_refs),
    traceRefs: strList(r.trace_refs),
  };
}

function normalizeAttribution(raw: unknown): string | null {
  if (typeof raw === "string") return str(raw);
  return str(rec(raw)?.text);
}

export function normalizeDiscoveryHealth(raw: unknown): DiscoveryHealth | null {
  const r = rec(raw);
  if (!r) return null;
  return {
    healthState: str(r.health_state),
    effectiveLifecycle: str(r.effective_lifecycle),
    paused: typeof r.paused === "boolean" ? r.paused : null,
    pauseReasons: strList(r.pause_reasons),
  };
}

/**
 * Read discovery fields from a record. Looks at the top level, then the
 * `discovery` block (journal / candidate / strategy detail), then `metadata`.
 */
export function normalizeDiscovery(raw: unknown): DiscoveryView {
  const top = rec(raw) ?? {};
  const block = rec(top.discovery) ?? {};
  const meta = rec(top.metadata) ?? {};
  const pick = (key: string): unknown => top[key] ?? block[key] ?? meta[key];
  const lineageSummary = rec(top.lineage_summary);
  return {
    hypothesisCard: normalizeCard(pick("hypothesis_card")),
    metrics: normalizeMetrics(pick("metrics")),
    lineage: normalizeLineage(pick("lineage")),
    attribution: normalizeAttribution(pick("attribution") ?? lineageSummary?.attribution),
    health: normalizeDiscoveryHealth(pick("health") ?? lineageSummary?.health),
  };
}

/** Rows of GET /bff/alpha-factory `data.templates` (research owner evaluations). */
export function normalizeTemplateEvaluations(raw: unknown): DiscoveryTemplateEvaluation[] {
  const out: DiscoveryTemplateEvaluation[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const r = rec(item);
    const templateId = r ? str(r.template_id) : null;
    if (!r || !templateId) continue;
    const evaluation = rec(r.evaluation) ?? {};
    const scores = Object.entries(evaluation)
      .map(([key, value]) => ({ key, value: num(value) }))
      .filter((e): e is { key: string; value: number } => e.value !== null);
    out.push({
      templateId,
      name: str(r.name),
      family: str(r.family),
      status: str(r.status),
      evaluationRef: str(r.evaluation_ref),
      duplicateOf: str(r.duplicate_of),
      scores,
      attribution: str(r.template_attribution),
    });
  }
  return out;
}
