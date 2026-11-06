import { describe, expect, it } from "vitest";
import {
  extractStrategyStateCounts,
  normalizeStrategyFilterParam,
  resolveStrategyListQuery,
  shortenHash,
} from "./Lists";

describe("shortenHash", () => {
  it("shortens the real artifact sha256 and keeps prefix", () => {
    const full = "sha256:38fb8f49fbee0b7131014b14c432fdd8dc521d522b4c76be2e04d002608e008e";
    const short = shortenHash(full);
    expect(short).toBe("sha256:38fb8f49…e008e".replace("…e008e", "…" + full.slice(-6)));
    expect(short.length).toBeLessThan(full.length / 2);
    expect(full.startsWith("sha256:38fb8f49")).toBe(true);
    expect(full.endsWith(short.slice(-6))).toBe(true);
  });
  it("leaves short values alone", () => {
    expect(shortenHash("abc123")).toBe("abc123");
  });
});

describe("StrategiesList state filter and query helpers", () => {
  it("maps default, all, and explicit DTO state filters to BFF query options", () => {
    expect(normalizeStrategyFilterParam(null)).toBe("default");
    expect(normalizeStrategyFilterParam("")).toBe("default");
    expect(normalizeStrategyFilterParam("default")).toBe("default");
    expect(normalizeStrategyFilterParam("approved")).toBe("approved");
    expect(normalizeStrategyFilterParam("paper_running")).toBe("paper_running");
    expect(normalizeStrategyFilterParam("all")).toBe("all");

    expect(resolveStrategyListQuery("default")).toEqual({
      exclude_state: "draft",
      page_size: 20,
    });
    expect(resolveStrategyListQuery("all", "20")).toEqual({
      page_size: 20,
      page_token: "20",
    });
    expect(resolveStrategyListQuery("approved", "40")).toEqual({
      state: "approved",
      page_size: 20,
      page_token: "40",
    });
  });

  it("extracts defaultCount, allCount, and per-state counts from meta.state_counts and returns null when state_counts is null", () => {
    const counts = extractStrategyStateCounts({
      state_counts: {
        draft: 4764,
        review: 1,
        approved: 133,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 2,
      },
    });
    expect(counts).toEqual({
      byState: {
        draft: 4764,
        review: 1,
        approved: 133,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 2,
      },
      defaultCount: 134,
      allCount: 4898,
      draftCount: 4764,
    });

    expect(extractStrategyStateCounts({ state_counts: null })).toBeNull();
    expect(extractStrategyStateCounts({})).toBeNull();
    expect(extractStrategyStateCounts(null)).toBeNull();
  });
});
