import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lists, type Deployment, type Persona } from "@/lib/bff-v1";
import {
  DeploymentsList,
  PersonasList,
  extractStrategyStateCounts,
  normalizeStrategyFilterParam,
  resolveStrategyListQuery,
  shortenHash,
} from "./Lists";

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("PersonasList and DeploymentsList show every row across pages", () => {
  it("renders every persona row past the first 20 rows including provisioning-only retired row", async () => {
    const personaRows: Persona[] = Array.from({ length: 25 }, (_, index) => ({
      id: index === 24 ? "persona-c6ef44745087d11cc138" : `persona-row-${index + 1}`,
      name:
        index === 0
          ? "青禾｜2330 台股 Paper 學習 R2"
          : index === 24
            ? "persona-c6ef44745087d11cc138"
            : `Persona Row ${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: index === 24 ? "retired" : "approved",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.62,
    }));

    vi.spyOn(lists, "personas").mockResolvedValue({
      items: personaRows,
      cursor: {},
      pageSize: personaRows.length,
      estimatedTotal: personaRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/personas"]}>
        <PersonasList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
      expect(screen.getByText("Persona Row 21")).toBeInTheDocument();
      expect(screen.getByText("persona-c6ef44745087d11cc138")).toBeInTheDocument();
    });
  });

  it("renders every deployment row past the first 20 rows normalized from plan_id", async () => {
    const deploymentRows: Deployment[] = Array.from({ length: 25 }, (_, index) => ({
      id:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      name:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "deployed",
      risk: "low",
      target: "paper",
      artifactId: "artifact-persona-298e138c136c9840b0e4",
      version: "1",
    }));

    vi.spyOn(lists, "deployments").mockResolvedValue({
      items: deploymentRows,
      cursor: {},
      pageSize: deploymentRows.length,
      estimatedTotal: deploymentRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/deployments"]}>
        <DeploymentsList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("plan-persona-paper-row-1")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-row-21")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-298e138c136c9840b0e4")).toBeInTheDocument();
    });
  });
});
