import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n";
import en from "@/i18n/locales/en-US";
import zh from "@/i18n/locales/zh-TW";
import { normalizeDiscovery } from "@/lib/bff-v1/discovery";
import {
  AttributionNote,
  DiscoverySections,
  HypothesisCardPanel,
  LineagePanel,
  SampleMetricsPanel,
  SourceHealthPanel,
  TemplateEvaluationsPanel,
} from "./DiscoveryPanels";

const ATTRIBUTION = "資料來源：政府資料開放平臺 data.gov.tw";

const FULL = {
  hypothesis_card: {
    claim: "Post-earnings momentum persists",
    mechanism: "Under-reaction to news",
    horizon: "3m",
    universe: "TWSE large caps",
    direction: "long",
    rule_sketch: "Buy top decile",
    testability: "testable",
    signal_inputs: ["earnings_surprise", "ohlcv"],
    cited_spans: [
      {
        source_record_id: "src-paper-001",
        start: 0,
        end: 10,
        exact_text: "Momentum in TWSE",
        source_record: { source_record_id: "src-paper-001", href: "/bff/management/evidence/src-paper-001" },
      },
    ],
  },
  metrics: {
    in_sample: { sharpe_ratio: 1.5, max_drawdown: -0.12, total_return: 0.3, round_trips: 40 },
    out_of_sample: { sharpe_ratio: 0.7, max_drawdown: -0.2, total_return: 0.1, round_trips: 12 },
    deflated_sharpe_ratio: 0.55,
    trial_count: 9,
  },
  lineage: {
    evidence_bundle_id: "bundle-1",
    source_records: [{ source_record_id: "src-paper-001", href: "/bff/management/evidence/src-paper-001" }],
    citation_refs: ["cit-1"],
    trace_refs: ["trace-1"],
  },
  attribution: { provider: "data.gov.tw", text: ATTRIBUTION },
};

function wrap(node: React.ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en-US");
});

describe("Discovery panels — fields present", () => {
  it("renders hypothesis card, citation link, metrics, lineage and attribution", async () => {
    await i18n.changeLanguage("en-US");
    wrap(<DiscoverySections record={FULL} />);
    expect(screen.getByTestId("discovery-hypothesis-claim")).toHaveTextContent("Post-earnings momentum persists");
    expect(screen.getByTestId("discovery-hypothesis-mechanism")).toHaveTextContent("Under-reaction to news");
    expect(screen.getByTestId("discovery-hypothesis-horizon")).toHaveTextContent("3m");
    expect(screen.getByTestId("discovery-hypothesis-universe")).toHaveTextContent("TWSE large caps");
    expect(screen.getByTestId("discovery-hypothesis-direction")).toHaveTextContent("long");
    expect(screen.getByTestId("discovery-hypothesis-rule-sketch")).toHaveTextContent("Buy top decile");
    expect(screen.getByTestId("discovery-hypothesis-testability")).toHaveTextContent("testable");
    expect(screen.getByTestId("discovery-hypothesis-signal-inputs")).toHaveTextContent("earnings_surprise, ohlcv");
    const citations = screen.getByTestId("discovery-hypothesis-citations");
    expect(citations).toHaveTextContent("Momentum in TWSE");
    expect(citations.querySelector("a")).toHaveAttribute("href", "/management/evidence/src-paper-001");

    expect(screen.getByTestId("discovery-metrics-in-sharpe_ratio")).toHaveTextContent("1.50");
    expect(screen.getByTestId("discovery-metrics-out-sharpe_ratio")).toHaveTextContent("0.70");
    expect(screen.getByTestId("discovery-metrics-in-max_drawdown")).toHaveTextContent("-0.1200");
    expect(screen.getByTestId("discovery-metrics-out-round_trips")).toHaveTextContent("12");
    expect(screen.getByTestId("discovery-metrics-deflated-sharpe")).toHaveTextContent("0.55");
    expect(screen.getByTestId("discovery-metrics-trial-count")).toHaveTextContent("9");

    expect(screen.getByTestId("discovery-lineage-evidence-bundle")).toHaveTextContent("bundle-1");
    expect(screen.getByTestId("discovery-lineage-source-records")).toHaveTextContent("src-paper-001");
    expect(screen.getByTestId("discovery-lineage-citation-refs")).toHaveTextContent("cit-1");
    expect(screen.getByTestId("discovery-lineage-trace-refs")).toHaveTextContent("trace-1");
    expect(screen.getByTestId("discovery-attribution")).toHaveTextContent(ATTRIBUTION);
  });

  it("reads the same fields from a nested `discovery` block", () => {
    const view = normalizeDiscovery({ discovery: FULL });
    expect(view.hypothesisCard?.claim).toBe("Post-earnings momentum persists");
    expect(view.metrics?.inSample.sharpe_ratio).toBe(1.5);
    expect(view.lineage?.sourceRecords).toHaveLength(1);
    expect(view.attribution).toBe(ATTRIBUTION);
  });

  it("renders source health with pause reasons and template evaluations", () => {
    wrap(
      <>
        <SourceHealthPanel
          health={{ health_state: "degraded", effective_lifecycle: "disabled", paused: true, pause_reasons: ["canary_failed"] }}
        />
        <TemplateEvaluationsPanel
          templates={[
            {
              template_id: "qlib_alpha158:KMID",
              name: "KMID",
              family: "qlib",
              status: "evaluated",
              evaluation_ref: "eval-1",
              duplicate_of: null,
              evaluation: { rank_ic: 0.04, ignored: "x" },
              template_attribution: "tpl attribution",
            },
          ]}
        />
      </>,
    );
    expect(screen.getByTestId("discovery-health-state")).toHaveTextContent("degraded");
    expect(screen.getByTestId("discovery-health-lifecycle")).toHaveTextContent("disabled");
    expect(screen.getByTestId("discovery-health-paused")).toHaveTextContent("Paused");
    expect(screen.getByTestId("discovery-health-pause-reasons")).toHaveTextContent("canary_failed");
    expect(screen.getByTestId("discovery-templates-row-qlib_alpha158:KMID")).toHaveTextContent("eval-1");
    expect(screen.getByTestId("discovery-templates-scores-qlib_alpha158:KMID")).toHaveTextContent("rank_ic 0.04");
    expect(screen.getByText("tpl attribution")).toBeInTheDocument();
  });
});

describe("Discovery panels — fields absent render a dash", () => {
  it("shows — for every field when the record has no discovery data", () => {
    wrap(<DiscoverySections record={{ id: "x" }} />);
    for (const id of [
      "claim", "mechanism", "horizon", "universe",
      "direction", "rule-sketch", "testability", "signal-inputs",
      "citations",
    ]) {
      expect(screen.getByTestId(`discovery-hypothesis-${id}`)).toHaveTextContent(/^—$/);
    }
    for (const side of ["in", "out"]) {
      for (const key of ["sharpe_ratio", "max_drawdown", "total_return", "round_trips"]) {
        expect(screen.getByTestId(`discovery-metrics-${side}-${key}`)).toHaveTextContent(/^—$/);
      }
    }
    expect(screen.getByTestId("discovery-metrics-deflated-sharpe")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("discovery-metrics-trial-count")).toHaveTextContent(/^—$/);
    for (const id of ["evidence-bundle", "source-records", "citation-refs", "trace-refs"]) {
      expect(screen.getByTestId(`discovery-lineage-${id}`)).toHaveTextContent(/^—$/);
    }
    expect(screen.getByTestId("discovery-attribution")).toHaveTextContent(/—$/);
  });

  it("shows — for source health and templates when absent", () => {
    wrap(
      <>
        <SourceHealthPanel health={undefined} />
        <TemplateEvaluationsPanel templates={undefined} />
      </>,
    );
    for (const id of ["state", "lifecycle", "paused", "pause-reasons"]) {
      expect(screen.getByTestId(`discovery-health-${id}`)).toHaveTextContent(/^—$/);
    }
    expect(screen.getByTestId("discovery-templates-empty")).toHaveTextContent("—");
  });

  it("keeps standalone panels dash-safe with a null view", () => {
    const view = normalizeDiscovery(null);
    wrap(
      <>
        <HypothesisCardPanel view={view} />
        <SampleMetricsPanel view={view} />
        <LineagePanel view={view} />
        <AttributionNote view={view} />
      </>,
    );
    expect(screen.getByTestId("discovery-attribution")).toBeInTheDocument();
  });
});

describe("Discovery i18n", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it("has identical discovery keys in every supported locale", () => {
    const enKeys = keys((en as { discovery: unknown }).discovery).sort();
    const zhKeys = keys((zh as { discovery: unknown }).discovery).sort();
    expect(enKeys.length).toBeGreaterThan(30);
    expect(zhKeys).toEqual(enKeys);
  });

  it("renders zh-TW labels", async () => {
    await i18n.changeLanguage("zh-TW");
    wrap(<DiscoverySections record={FULL} />);
    expect(screen.getByText("假說卡")).toBeInTheDocument();
    expect(screen.getByText("樣本內 vs 樣本外")).toBeInTheDocument();
    expect(screen.getByText("血緣")).toBeInTheDocument();
  });
});
