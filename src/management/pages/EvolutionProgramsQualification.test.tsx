import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      // FE-EVO-JOURNAL-DIRECTION-20261125: the time is shown in the viewer time zone, not as raw ISO text.
      expect(screen.getByTestId("qualification-evaluated-at")).toHaveTextContent(
        new Date("2026-11-05T04:00:00Z").toLocaleString(),
      );
      expect(screen.getByTestId("qualification-evaluated-at").textContent).not.toContain("2026-11-05T04:00:00Z");
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

describe("EvolutionList member baselines and test records (FE-EVO-JOURNAL-DIRECTION-20261125)", () => {
  const REAL_PROGRAM = {
    id: "evp-c0ce26091e8b443495bfa61e3dac34ff",
    program_id: "evp-c0ce26091e8b443495bfa61e3dac34ff",
    name: "DEV ACCEPTANCE ONLY 1793924182061",
    status: "draft",
    origin: "manual",
    updated_at: "2026-11-04T10:00:00Z",
  };
  const baselineReport = {
    policy_version: "evolution-qualification.v1",
    evaluated_at: "2026-11-25T04:00:00Z",
    evaluated: 3,
    qualified: 0,
    drafted: 0,
    counts_by_first_failing_criterion: { real_threshold_signal: 3 },
    failure_reason: null,
    items: [],
    total: 3,
    limit: 50,
    offset: 0,
    member_baselines: [
      { persona_id: "per-a", persona_name: "Alpha Persona", artifact_ref: "strat-a@1", stage: "trial", risk_weight: 0.4, pool_version: 2, status: "approved", reason: null },
      { persona_id: "per-a", persona_name: "Alpha Persona", artifact_ref: "strat-b@1", stage: "active", risk_weight: 0.6, pool_version: 2, status: "no_approved_baseline", reason: "gate_not_passed" },
      { persona_id: "per-b", persona_name: "Beta Persona", artifact_ref: "strat-c@3", stage: "active", risk_weight: 1, pool_version: 1, status: "no_approved_baseline", reason: "some_future_reason_code" },
      { persona_id: "per-b", persona_name: "Beta Persona", artifact_ref: "strat-d@1", stage: "trial", risk_weight: 0.2, pool_version: 1, status: "unavailable", reason: "registry_entry_unreadable:TimeoutError" },
    ],
    member_baselines_surface: { status: "ok", reason: null, approved: 1, not_approved: 2, unavailable: 1 },
  };

  function mockFetch(opts: { qualification?: () => Response; programs?: unknown[] }) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/evolution-qualification")) {
        return opts.qualification
          ? opts.qualification()
          : new Response(JSON.stringify({ data: baselineReport }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/bff/evolution-programs")) {
        const rows = opts.programs ?? [REAL_PROGRAM];
        return new Response(JSON.stringify({ data: rows, total: rows.length, total_complete: true, cursor: { next: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [], items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  }

  async function renderList(lang: "en-US" | "zh-TW", entry = "/management/evolution") {
    await i18n.changeLanguage(lang);
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/management/evolution" element={<EvolutionList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );
  }

  beforeEach(() => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    liveStatus._reset();
    await i18n.changeLanguage("en-US");
  });

  it("shows each member's baseline status and plain reason per persona, with an unknown code as a plain sentence plus the raw code (zh-TW)", async () => {
    mockFetch({});
    await renderList("zh-TW");
    const section = await screen.findByTestId("member-baselines");
    expect(section).toHaveTextContent("Alpha Persona");
    expect(section).toHaveTextContent("Beta Persona");
    expect(section).toHaveTextContent("已有基準 1、尚無基準 2、無法讀取 1");
    const rows = within(section).getAllByTestId("member-baseline-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("已有核准基準");
    expect(rows[0].querySelector("[data-testid=member-baseline-reason]")).toBeNull();
    expect(rows[1]).toHaveTextContent("尚無核准基準");
    expect(rows[1]).toHaveTextContent("閘門檢查沒有通過。");
    expect(rows[1].querySelector("[data-testid=member-baseline-raw]")).toBeNull();
    expect(rows[2]).toHaveTextContent("原因無法辨識，請查看下方代碼。");
    expect(rows[2].querySelector("[data-testid=member-baseline-raw]")).toHaveTextContent("代碼：some_future_reason_code");
    expect(rows[3]).toHaveTextContent("無法讀取");
    expect(rows[3]).toHaveTextContent("登錄庫紀錄目前無法讀取。");
    expect(rows[3].querySelector("[data-testid=member-baseline-raw]")).toHaveTextContent("registry_entry_unreadable:TimeoutError");
  });

  it("shows the latest evaluation time in the viewer time zone and keeps criterion codes as secondary text", async () => {
    mockFetch({});
    await renderList("en-US");
    const at = await screen.findByTestId("qualification-evaluated-at");
    await waitFor(() => expect(at).toHaveTextContent(new Date("2026-11-25T04:00:00Z").toLocaleString()));
    expect(at.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const code = screen.getByTestId("qualification-criterion-code-real_threshold_signal");
    expect(code).toHaveTextContent("Code: real_threshold_signal");
    expect(code.className).toContain("text-muted-foreground");
  });

  it("distinguishes denied, unavailable and not-provided baseline states", async () => {
    mockFetch({
      qualification: () => new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "no" } }), { status: 403, headers: { "Content-Type": "application/json" } }),
    });
    await renderList("en-US");
    expect(await screen.findByTestId("member-baselines-denied")).toBeInTheDocument();
    expect(screen.getByTestId("qualification-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("member-baselines-unavailable")).toBeNull();
  });

  it("shows unavailable (not empty) when the qualification read fails with a server error", async () => {
    mockFetch({
      qualification: () => new Response(JSON.stringify({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "down" } }), { status: 503, headers: { "Content-Type": "application/json" } }),
    });
    await renderList("en-US");
    expect(await screen.findByTestId("member-baselines-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("qualification-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("member-baselines-empty")).toBeNull();
  });

  it("says an old BFF gave no baselines, and an empty list is a different message", async () => {
    mockFetch({
      qualification: () => new Response(JSON.stringify({ data: { ...baselineReport, member_baselines: undefined, member_baselines_surface: undefined } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    });
    await renderList("en-US");
    expect(await screen.findByTestId("member-baselines-not-provided")).toBeInTheDocument();
  });

  it("shows an explicit empty message when the BFF returns an empty member list", async () => {
    mockFetch({
      qualification: () => new Response(JSON.stringify({ data: { ...baselineReport, member_baselines: [], member_baselines_surface: { status: "ok", reason: null, approved: 0, not_approved: 0, unavailable: 0 } } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    });
    await renderList("en-US");
    expect(await screen.findByTestId("member-baselines-empty")).toBeInTheDocument();
  });

  it("keeps a program visible when the BFF gives no classification, even with an acceptance-looking name", async () => {
    mockFetch({});
    await renderList("en-US");
    expect(await screen.findByText("DEV ACCEPTANCE ONLY 1793924182061")).toBeInTheDocument();
    expect(screen.queryByTestId("evolution-toggle-test-records")).toBeNull();
  });

  it("hides programs the BFF recorded as test records behind a toggle that shows their count", async () => {
    mockFetch({
      programs: [
        { ...REAL_PROGRAM, id: "evp-real", program_id: "evp-real", name: "Momentum Regime Program", origin: "auto_qualified" },
        { ...REAL_PROGRAM, id: "evp-test", program_id: "evp-test", name: "Created by a run", record_class: "acceptance" },
        { ...REAL_PROGRAM, id: "evp-seed", program_id: "evp-seed", name: "Seeded draft", origin: "seed" },
      ],
    });
    await renderList("en-US");
    expect(await screen.findByText("Momentum Regime Program")).toBeInTheDocument();
    expect(screen.queryByText("Created by a run")).toBeNull();
    expect(screen.queryByText("Seeded draft")).toBeNull();
    const toggle = screen.getByTestId("evolution-toggle-test-records");
    expect(toggle).toHaveTextContent("Show test records (2)");
    fireEvent.click(toggle);
    expect(await screen.findByText("Created by a run")).toBeInTheDocument();
    expect(screen.getByText("Seeded draft")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-test-record-evp-test")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-toggle-test-records")).toHaveTextContent("Hide test records");
  });
});
