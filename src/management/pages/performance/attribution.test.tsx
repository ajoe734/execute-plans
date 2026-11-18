import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import i18n from "@/i18n";
import { setMockResolver, type MockHandler } from "@/lib/bff-v1/client";
import { makeBffError } from "@/lib/bff-v1/errors";
import { OutliersAttributionTab } from "./OutliersAttributionTab";
import { ShadowComparisonTab } from "./ShadowComparisonTab";

void i18n.changeLanguage("en-US");

const json = (body: unknown, status = 200) => ({ kind: "json" as const, status, body });
let routes: Record<string, MockHandler> = {};

beforeEach(() => {
  routes = {};
  setMockResolver((method, path) => (method === "GET" ? routes[path] : undefined));
});
afterEach(() => {
  cleanup();
  setMockResolver(undefined);
  vi.restoreAllMocks();
});

const OUT = "/bff/management/attribution/outliers";
const shadow = (id: string) => `/bff/management/attribution/shadow/${id}`;

// Recorded shapes mirroring BFF-ATTRIBUTION-VIEWS-20261116
const recorded = {
  status: "ok",
  owner: "attribution",
  empty: false,
  items: [
    {
      record_id: "attr-1",
      subject_kind: "trader",
      subject_id: "trd-9",
      direction: "outstanding",
      decomposition: { selection: 0.4, entry_timing: 0.1, sizing: -0.02, exit: 0.05, costs: -0.01 },
      luck_interval: [0.01, 0.2],
      sample_size: 42,
      meeting: { meeting_id: "mtg-4", meeting_type: "MT-4", status: "closed" },
      hypothesis_validation: { status: "supported", items: [{ hypothesis: "sizing discipline", status: "supported" }] },
    },
    {
      record_id: "attr-2",
      subject_kind: "persona",
      subject_id: "per_quant",
      direction: "underperform",
      decomposition: {},
      luck_interval: null,
      meeting: null,
      hypothesis_validation: { status: "unavailable", reason: "no_hypothesis_recorded" },
    },
  ],
  page_info: { next_cursor: null },
  meta: { status: "ok" },
};

const renderOutliers = () => render(<MemoryRouter><OutliersAttributionTab /></MemoryRouter>);
const renderShadow = (url = "/p?tab=shadow&decision=dec-1") =>
  render(<MemoryRouter initialEntries={[url]}><ShadowComparisonTab /></MemoryRouter>);

describe("OutliersAttributionTab", () => {
  it("lists outliers with decomposition, luck interval, meeting link and hypothesis status", async () => {
    routes[OUT] = () => json(recorded);
    renderOutliers();
    const card = await screen.findByTestId("outlier-attr-1");
    expect(card.textContent).toContain("trd-9");
    expect(card.textContent).toContain("[0.01, 0.2]");
    expect(card.textContent).toContain("selection: 0.4");
    expect(card.querySelector("a")?.getAttribute("href")).toBe("/management/meetings/mtg-4");
    expect(card.textContent).toContain("supported");
    const second = screen.getByTestId("outlier-attr-2");
    expect(second.textContent).toContain("none convened");
    expect(second.textContent).toContain("no_hypothesis_recorded");
  });

  it("shows explicit empty state", async () => {
    routes[OUT] = () => json({ status: "empty", items: [], empty: true });
    renderOutliers();
    expect(await screen.findByTestId("outliers-empty")).toBeTruthy();
  });

  it("shows unavailable with reason (envelope and HTTP error)", async () => {
    routes[OUT] = () => json({ status: "unavailable", reason: "attribution_owner_unconfigured", items: [] });
    renderOutliers();
    expect((await screen.findByTestId("outliers-unavailable")).textContent).toContain("attribution_owner_unconfigured");
    cleanup();
    routes[OUT] = () => { throw makeBffError({ status: 503, code: "UPSTREAM_UNAVAILABLE" } as never); };
    renderOutliers();
    await waitFor(() => expect(screen.getByTestId("outliers-unavailable")).toBeTruthy());
  });
});

describe("ShadowComparisonTab", () => {
  const data = {
    status: "degraded",
    data: {
      decision_id: "dec-1",
      arms: [
        { arm: "trader", decision_detail: { available: true, decision: "buy" }, settlement_source: "actual_fill", outcome: 0.02, settled_at: "t", unavailable_reason: null },
        { arm: "base_strategy", decision_detail: { available: true }, settlement_source: "paper_proxy", outcome: 0.01, settled_at: "t", unavailable_reason: null },
        { arm: "private_servant", decision_detail: { available: false, unavailable_reason: "private_servant_arm_not_recorded" }, settlement_source: null, outcome: null, settled_at: null, unavailable_reason: "arm_not_reported_by_attribution_owner" },
        { arm: "institutional_view", decision_detail: { available: true }, settlement_source: "paper_simulated", outcome: -0.01, settled_at: "t", unavailable_reason: null },
      ],
    },
    meta: { sources: { attribution: "ok", agora: "agora_lock_not_found" } },
  };

  it("shows four arms side by side and never labels paper proxy as actual fill", async () => {
    routes[shadow("dec-1")] = () => json(data);
    renderShadow();
    await screen.findByTestId("shadow-arms");
    expect(screen.getByTestId("shadow-arm-trader").textContent).toContain("Actual fill");
    for (const arm of ["base_strategy", "institutional_view"]) {
      const text = screen.getByTestId(`shadow-arm-${arm}`).textContent ?? "";
      expect(text).toContain("Paper proxy (not an actual fill)");
      expect(text).not.toMatch(/^Actual fill/);
    }
    const missing = screen.getByTestId("shadow-arm-private_servant").textContent ?? "";
    expect(missing).toContain("Settlement source unknown");
    expect(missing).toContain("arm_not_reported_by_attribution_owner");
    expect(screen.getByTestId("shadow-degraded").textContent).toContain("agora=agora_lock_not_found");
  });

  it("renders an honest not-found for an unknown decision", async () => {
    routes[shadow("nope")] = () => { throw makeBffError({ status: 404, code: "RESOURCE_NOT_FOUND" } as never); };
    renderShadow("/p?tab=shadow&decision=nope");
    expect((await screen.findByTestId("shadow-not-found")).textContent).toContain("nope");
  });

  it("shows an explicit prompt without a decision and loads on submit", async () => {
    routes[shadow("dec-1")] = () => json(data);
    renderShadow("/p?tab=shadow");
    expect(screen.getByTestId("shadow-prompt")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Decision id"), { target: { value: "dec-1" } });
    fireEvent.click(screen.getByText("Load"));
    expect(await screen.findByTestId("shadow-arms")).toBeTruthy();
  });

  it("shows unavailable with reason", async () => {
    routes[shadow("dec-1")] = () => json({ status: "unavailable", reason: "read_timeout" });
    renderShadow();
    expect((await screen.findByTestId("shadow-unavailable")).textContent).toContain("read_timeout");
  });
});
