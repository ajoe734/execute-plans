// FE-RISK-STRATEGY-RESEARCH-UI-20261120 WP6.4 — ResearchList hides non-real rows,
// readable fallback titles, 未記錄執行器. Fixture follows the BFF contract shape of
// GET /bff/research-tasks (is_non_real, name_is_fallback_id, display_summary, meta.hidden_non_real_count).
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ResearchList } from "./Lists";

const mocks = vi.hoisted(() => ({ useLiveListV1: vi.fn() }));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return { ...actual, useLiveListV1: mocks.useLiveListV1 };
});

const body = (includeNonReal: boolean) => ({
  items: [
    {
      task_id: "rtask-7c1e9a40b2d3",
      id: "rtask-7c1e9a40b2d3",
      name: "rtask-7c1e9a40b2d3",
      name_is_fallback_id: true,
      task_type: "factor_eval",
      display_summary: { symbol: "2330", dataset_ref: "dataset:tw-equity-ohlcv-top50-2024-daily", subject_ref: null },
      status: "completed",
      is_non_real: false,
      run_count: 1,
      latest_run: { run_id: "run-1", status: "completed", adapter: null, dispatch_mode: null },
      created_by: "operator",
      updated_at: "2026-11-20T00:00:00Z",
    },
    ...(includeNonReal
      ? [
          {
            task_id: "rtask-stub-1",
            id: "rtask-stub-1",
            name: "Stub probe",
            status: "completed",
            is_non_real: true,
            run_count: 1,
            latest_run: { run_id: "run-s", status: "completed", adapter: "stub", dispatch_mode: "stub" },
            created_by: "system",
            updated_at: "2026-11-20T00:00:00Z",
          },
        ]
      : []),
  ],
  meta: { hidden_non_real_count: 5 },
});

function renderResearch() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/management/experiments"]}>
          <Routes>
            <Route path="/management/experiments" element={<ResearchList />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("ResearchList (FE-RISK-STRATEGY-RESEARCH-UI-20261120)", () => {
  beforeEach(async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    const actual = await vi.importActual<typeof import("@/lib/bff-v1")>("@/lib/bff-v1");
    mocks.useLiveListV1.mockImplementation(actual.useLiveListV1);
    await i18n.changeLanguage("zh-TW");
  });
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    liveStatus._reset();
    await i18n.changeLanguage("en-US");
  });

  it("hides is_non_real rows by default, shows the hidden count and renders readable fallback titles", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      return new Response(JSON.stringify(body(url.includes("include_non_real=true"))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderResearch();
    const title = await screen.findByTestId("research-row-title");
    expect(title).toHaveTextContent("因子評估 · 2330 · dataset:tw-equity-ohlcv-top50-2024-daily");
    expect(screen.getByTestId("research-row-task-id")).toHaveTextContent("rtask-7c1e9a40b2d3");
    expect(screen.getByTestId("research-runner-unrecorded")).toHaveTextContent("未記錄執行器");
    expect(document.body.textContent ?? "").not.toContain("unknown / unknown");
    expect(screen.queryByText("Stub probe")).not.toBeInTheDocument();
    expect(screen.getByTestId("research-non-real-text")).toHaveTextContent("5");
    expect(urls.some((u) => u.includes("include_non_real=false"))).toBe(true);

    fireEvent.click(screen.getByTestId("research-toggle-non-real-button"));
    expect(await screen.findByText("Stub probe")).toBeInTheDocument();
    expect(urls.some((u) => u.includes("include_non_real=true"))).toBe(true);
  });
});
