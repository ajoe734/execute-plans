import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import i18n from "@/i18n";
import { mgmt, useLiveStatus } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { useT } from "@/platform/hooks";
import { EvolutionList, StrategiesList } from "./Lists";

function ShellDataSourceBadgeProbe() {
  const t = useT();
  const live = useLiveStatus();
  const label =
    live.mode === "mock"
      ? t("topbar.dataSource.mock")
      : live.effective === "mock"
        ? t("topbar.dataSource.fallback")
        : t("topbar.dataSource.live");
  return <div data-testid="shell-datasource-probe">{label}</div>;
}

describe("EvolutionList optional qualification read and strict banner isolation", () => {
  beforeEach(async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("renders evolution programs and not-evaluated qualification state when /bff/management/evolution-qualification returns an array body without opening STRICT TYPED ERROR or FALLBACK DATA", async () => {
    let qualificationReads = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/evolution-qualification")) {
        qualificationReads += 1;
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/bff/evolution-programs")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "evp-001",
                program_id: "evp-001",
                name: "Momentum Regime Program",
                status: "under_review",
                state: "under_review",
                origin: "auto_qualified",
                source_decision_ids: ["dec-1"],
                run_ids: ["run-1"],
                updated_at: "2026-11-05T03:00:00Z",
              },
            ],
            total: 1,
            total_complete: true,
            cursor: { next: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <LiveStatusBanner />
            <ShellDataSourceBadgeProbe />
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Momentum Regime Program")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-qualification-summary")).toBeInTheDocument();
    expect(screen.getByTestId("qualification-policy-version")).toHaveTextContent("—");
    expect(screen.getByTestId("qualification-evaluated-at")).toHaveTextContent("Not evaluated yet");
    expect(screen.getByTestId("qualification-evaluated-count")).toHaveTextContent("0");
    expect(screen.getByTestId("qualification-qualified-count")).toHaveTextContent("0");
    expect(
      screen.getByTestId("qualification-criterion-count-real_threshold_signal"),
    ).toHaveTextContent("0");
    expect(qualificationReads).toBe(1);

    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
    expect(screen.queryByText(/strict typed error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FALLBACK DATA/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-datasource-probe")).toHaveTextContent("LIVE BFF");
  });

  it("renders policy version, evaluated and qualified counts, and failing-criterion counts for a valid report with no error or fallback banner", async () => {
    let qualificationReads = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/evolution-qualification")) {
        qualificationReads += 1;
        return new Response(
          JSON.stringify({
            data: {
              tenant_id: "default",
              sweep_id: "evo-qual-sweep-20261105-0002",
              policy_version: "evolution-qualification.v1",
              evaluated_at: "2026-11-05T04:00:00Z",
              evaluated: 12,
              qualified: 2,
              drafted: 2,
              counts_by_first_failing_criterion: {
                real_threshold_signal: 6,
                persistent_breach: 3,
                fresh_evidence: 1,
              },
              failure_reason: null,
              items: [],
              total: 12,
              limit: 50,
              offset: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/bff/evolution-programs")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "evp-002",
                program_id: "evp-002",
                name: "Qualified Alpha Evolution",
                status: "active",
                state: "active",
                origin: "auto_qualified",
                source_decision_ids: ["dec-10", "dec-11"],
                run_ids: ["run-10"],
                updated_at: "2026-11-05T04:05:00Z",
              },
            ],
            total: 1,
            total_complete: true,
            cursor: { next: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution"]}>
            <LiveStatusBanner />
            <ShellDataSourceBadgeProbe />
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Qualified Alpha Evolution")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("qualification-policy-version")).toHaveTextContent(
        "evolution-qualification.v1",
      );
      expect(screen.getByTestId("qualification-evaluated-at")).toHaveTextContent(
        "2026-11-05T04:00:00Z",
      );
      expect(screen.getByTestId("qualification-evaluated-count")).toHaveTextContent("12");
      expect(screen.getByTestId("qualification-qualified-count")).toHaveTextContent("2");
      expect(
        screen.getByTestId("qualification-criterion-count-real_threshold_signal"),
      ).toHaveTextContent("6");
      expect(
        screen.getByTestId("qualification-criterion-count-persistent_breach"),
      ).toHaveTextContent("3");
      expect(
        screen.getByTestId("qualification-criterion-count-fresh_evidence"),
      ).toHaveTextContent("1");
    });

    expect(qualificationReads).toBe(1);
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
    expect(screen.queryByText(/strict typed error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FALLBACK DATA/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-datasource-probe")).toHaveTextContent("LIVE BFF");
  });

  it("keeps strict behavior for other pages and strict readers when a required contract fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/strategies")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "BACKEND_UNAVAILABLE",
              message: "HTTP 503 on /bff/strategies",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/strategies"]}>
            <LiveStatusBanner />
            <ShellDataSourceBadgeProbe />
            <Routes>
              <Route path="/management/strategies" element={<StrategiesList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("HTTP 503 on /bff/strategies");

    await expect(
      mgmt.evolutionQualification.get(),
    ).rejects.toThrow(/live adapter contract mismatch \(strict mode\): adapter returned no data/);

    await waitFor(() => {
      expect(screen.getByText(/strict typed error/i)).toBeInTheDocument();
      expect(screen.getByTestId("shell-datasource-probe")).toHaveTextContent("FALLBACK DATA");
    });
    expect(liveStatus.get().effective).toBe("mock");
  });
});
