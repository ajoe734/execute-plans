// Pack C-L wiring tests — 26 L-tier items: render hint, bucket color, glossary,
// reduced motion, format token, component specs, owners, signal confidence,
// committee templates, daily-brief KPI, persona-lab schema, etc.

import { describe, it, expect } from "vitest";
import {
  RENDER_HINTS,
  LIFECYCLE_BUCKET_TOKEN,
  GLOSSARY,
  A11Y_RULES, SHORTCUTS, REDUCED_MOTION_MAX_MS,
  FORMAT_PATTERNS, SUPPORTED_LOCALES, UGC_AUTO_DETECT_LOCALE,
  UI_DEFAULT_PREFS, ROW_HEIGHT_PX, REQUIRED_THEME_TOKENS,
  SKELETON_SPECS, LINEAGE_GRAPH, RIGHT_DRAWER, COMMAND_PALETTE_WEIGHTS,
  SECTION_OWNERS,
  SIGNAL_CONFIDENCE, validateConfidenceFeedback,
  COMMITTEE_TEMPLATES,
  renderKpi, KPI_STORAGE_TZ,
  REBALANCE_STEP_UI,
  FRONTEND_FX_FORBIDDEN, PLATFORM_BASE_CURRENCY,
} from "./index";

// Render-hint table covers all 8 lifecycle machines (C012)
describe("Pack C-L · C012 render hints", () => {
  it("declares hint for every state machine", () => {
    const machines = RENDER_HINTS.map((r) => r.machine);
    expect(machines).toEqual(expect.arrayContaining([
      "Strategy", "Review", "Rebalance", "Evolution",
      "Deployment", "Incident", "Memory", "Skill",
    ]));
    for (const r of RENDER_HINTS) expect(["linear", "branchy"]).toContain(r.renderHint);
  });
});

// Lifecycle bucket → CSS token (C078)
describe("Pack C-L · C078 lifecycle bucket colors", () => {
  it("maps every lifecycle status to a token", () => {
    for (const k of ["discovered","scaffolded","replicated","approved","paper","live","degraded","retired"] as const) {
      expect(LIFECYCLE_BUCKET_TOKEN[k]).toMatch(/^--/);
    }
  });
});

// Glossary terms (C067)
describe("Pack C-L · C067 glossary", () => {
  it("contains 30 mandatory terms with i18n keys", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(30);
    for (const g of GLOSSARY) expect(g.definitionKey).toMatch(/^glossary\./);
  });
});

// Reduced motion + shortcuts + a11y (C056–C058)
describe("Pack C-L · C056/C057/C058 a11y", () => {
  it("declares WCAG rules and shortcut catalog", () => {
    expect(A11Y_RULES.length).toBeGreaterThanOrEqual(7);
    expect(SHORTCUTS.command_palette).toBe("Mod+K");
    expect(REDUCED_MOTION_MAX_MS).toBe(150);
  });
});

// Format tokens (C046–C049)
describe("Pack C-L · C046–C049 i18n format tokens", () => {
  it("provides patterns for both locales + fallback", () => {
    for (const tok of Object.keys(FORMAT_PATTERNS)) {
      const row = FORMAT_PATTERNS[tok as keyof typeof FORMAT_PATTERNS];
      expect(row["zh-TW"]).toBeTruthy();
      expect(row["en-US"]).toBeTruthy();
      expect(row.fallback).toBeTruthy();
    }
    expect(SUPPORTED_LOCALES).toEqual(["zh-TW", "en-US"]);
    expect(UGC_AUTO_DETECT_LOCALE).toBe(false);
  });
});

// Design tokens & density (C050–C051)
describe("Pack C-L · C050/C051 design tokens", () => {
  it("declares row heights and required theme tokens", () => {
    expect(UI_DEFAULT_PREFS).toMatchObject({ theme: "system", density: "comfortable" });
    expect(ROW_HEIGHT_PX.compact).toBeLessThan(ROW_HEIGHT_PX.comfortable);
    expect(REQUIRED_THEME_TOKENS).toEqual(expect.arrayContaining(["--bg", "--fg", "--surface"]));
  });
});

// Component specs (C052–C055)
describe("Pack C-L · C052–C055 component specs", () => {
  it("skeleton/lineage/drawer/command palette declare invariants", () => {
    expect(SKELETON_SPECS.table.defaultRows).toBe(10);
    expect(LINEAGE_GRAPH.maxVisibleNodes).toBe(200);
    expect(RIGHT_DRAWER.maxStackDepth).toBe(2);
    expect(COMMAND_PALETTE_WEIGHTS.exactMatch).toBeGreaterThan(COMMAND_PALETTE_WEIGHTS.prefix);
    expect(COMMAND_PALETTE_WEIGHTS.archived).toBeLessThan(0);
  });
});

// Section owners (C070)
describe("Pack C-L · C070 section owners", () => {
  it("every spec section has an owner + reviewers", () => {
    for (const o of SECTION_OWNERS) {
      expect(o.owner).toBeTruthy();
      expect(o.reviewers.length).toBeGreaterThan(0);
    }
  });
});

// Signal confidence (C075)
describe("Pack C-L · C075 signal confidence", () => {
  it("requires reason on extremes, free on neutral", () => {
    expect(validateConfidenceFeedback(3)).toBeNull();
    expect(validateConfidenceFeedback(5)).toMatch(/reason required/);
    expect(validateConfidenceFeedback(5, "x".repeat(20))).toBeNull();
    expect(SIGNAL_CONFIDENCE).toHaveLength(5);
  });
});

// Committee templates (C076)
describe("Pack C-L · C076 committee templates", () => {
  it("each committee declares required evidence", () => {
    expect(COMMITTEE_TEMPLATES).toHaveLength(4);
    for (const c of COMMITTEE_TEMPLATES) expect(c.requiredEvidence.length).toBeGreaterThanOrEqual(3);
  });
});

// Daily brief KPI tz/null (C077)
describe("Pack C-L · C077 dailybrief KPI", () => {
  it("renders missing/na/value variants", () => {
    expect(KPI_STORAGE_TZ).toBe("UTC");
    expect(renderKpi(null).kind).toBe("missing");
    expect(renderKpi(1, 0).kind).toBe("na");
    expect(renderKpi(0.12, 100).kind).toBe("value");
  });
});

// Rebalance per-step UI patterns (C074)
describe("Pack C-L · C074 rebalance step UI", () => {
  it("each rebalance step declares a UI pattern + component", () => {
    expect(REBALANCE_STEP_UI).toHaveLength(7);
    for (const s of REBALANCE_STEP_UI) {
      expect(s.uiPattern).toBeTruthy();
      expect(s.requiredComponent).toBeTruthy();
    }
  });
});

// FX policy: frontend forbidden from FX conversion (C042)
describe("Pack C-L · C042 fx policy", () => {
  it("forbids frontend FX and pins base currency", () => {
    expect(FRONTEND_FX_FORBIDDEN).toBe(true);
    expect(PLATFORM_BASE_CURRENCY).toBe("USD");
  });
});
