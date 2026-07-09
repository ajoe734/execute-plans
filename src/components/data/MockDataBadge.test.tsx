import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MockDataBadge,
  MockDataEmptyState,
} from "@/components/data/MockDataBadge";
import { getMockDataBadgeModel } from "@/components/data/mockDataBadgeModel";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import type { LiveStatusSnapshot } from "@/lib/bff/liveTransport";

const liveSnapshot: LiveStatusSnapshot = {
  configuredMode: "hybrid",
  transportMode: "hybrid",
  usingSeed: false,
  fallbackStandby: true,
  seedFallbackArmed: false,
  typedError: false,
  fellBack: false,
};

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "auto");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

describe("MockDataBadge", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("renders live-mode mock status for mock_only_dev helpers", () => {
    const model = getMockDataBadgeModel("bff.watchers.forSubject", liveSnapshot);

    expect(model?.category).toBe("mock_only_dev");
    expect(model?.label).toBe("mock data disabled");
  });

  it("renders live-mode empty state for deferred helpers", () => {
    const model = getMockDataBadgeModel("bff.fitnessFormulas.list", liveSnapshot);

    expect(model?.category).toBe("deferred");
    expect(model?.label).toBe("mock data hidden");
  });

  it("does not badge live_required helpers", () => {
    expect(getMockDataBadgeModel("bff.strategies.list", liveSnapshot)).toBeNull();
  });

  it("uses the taxonomy model in the rendered badge", () => {
    stubLiveEnv();

    render(<MockDataBadge helperName="bff.getAcceptLanguage" />);

    expect(screen.getByText("mock data disabled")).toBeInTheDocument();
  });

  it("renders an explicit empty state for deferred helpers", () => {
    stubLiveEnv();

    render(<MockDataEmptyState helperName="bff.fitnessFormulas.list" />);

    expect(screen.getByRole("status")).toHaveTextContent("Live data not wired");
    expect(screen.getByRole("status")).toHaveTextContent("bff.fitnessFormulas.list");
  });
});
