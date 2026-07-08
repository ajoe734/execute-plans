import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ObjectListPage } from "./ObjectListPage";

const mocks = vi.hoisted(() => ({
  useLiveListV1: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    useLiveListV1: mocks.useLiveListV1,
  };
});

void i18n.changeLanguage("en-US");

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

function renderObjectList() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <Routes>
            <Route
              path="/management/strategies"
              element={(
                <ObjectListPage
                  title="Strategies"
                  loader={vi.fn()}
                  basePath="/management/strategies"
                />
              )}
            />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("ObjectListPage", () => {
  beforeEach(() => {
    stubLiveEnv();
    mocks.useLiveListV1.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("surfaces strict live typed errors instead of looking like an empty seed page", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Injected F15 5xx",
          strictFallbackBlocked: true,
        },
        surfaces: {
          strategies: { status: "unavailable" },
        },
      },
    });

    renderObjectList();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("strict typed error");
    expect(status).toHaveTextContent("Injected F15 5xx");
    expect(status).toHaveTextContent("seed fallback blocked");
  });

  it("does not label governed 4xx list errors as strict seed-fallback blocks", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {
        degradation: {
          reason: "Injected F15 governed 4xx",
          strictFallbackBlocked: false,
        },
        surfaces: {
          strategies: { status: "unavailable" },
        },
      },
    });

    renderObjectList();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Injected F15 governed 4xx");
    expect(status).not.toHaveTextContent("strict typed error");
    expect(status).not.toHaveTextContent("seed fallback blocked");
  });

  it("renders registry tables as viewport-filling scroll regions", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [{
        id: "strategy-1",
        name: "Strategy One",
        state: "deployed",
        risk: "low",
        owner: "ops",
        updatedAt: "2026-07-08T00:00:00Z",
      }],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    const { container } = renderObjectList();

    const pageBody = container.querySelector('[data-page-body-mode="fill"]');
    expect(pageBody).toHaveClass("flex", "min-h-0", "flex-1", "overflow-hidden");

    const dataTable = container.querySelector('[data-data-table-layout="fill"]');
    expect(dataTable).toHaveClass("flex-1", "min-h-0", "overflow-hidden");

    const scrollRoot = container.querySelector('[data-management-table-scroll="pinned-horizontal"]');
    expect(scrollRoot).toHaveClass("h-full", "flex-1", "min-h-0");

    const native = container.querySelector('[data-management-table-scrollbar="native"]');
    expect(native).toHaveClass("h-full", "min-h-0", "overflow-auto");
    expect(native).not.toHaveClass("max-h-[calc(100dvh-10rem)]");
  });
});
