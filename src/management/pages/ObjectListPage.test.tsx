import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ObjectListPage } from "./ObjectListPage";
import { CapitalPoolsList } from "./Lists";
import type { CreateBehavior } from "@/lib/writeIntents/types";
import capitalPoolsFixture from "@/lib/bff-v1/__tests__/fixtures/hosted-20261020/capital-pools.json";

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

function renderObjectList(createBehavior?: CreateBehavior) {
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
                  createBehavior={createBehavior}
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

  it("visibly disables a legacy drawer without a durable create owner", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    renderObjectList({ kind: "drawer", entity: "artifact" });

    expect(screen.getByRole("button", {
      name: "Create disabled: artifact has no typed durable BFF owner.",
    })).toBeDisabled();
  });

  it("keeps the Persona drawer enabled because it has a typed durable owner", () => {
    mocks.useLiveListV1.mockReturnValue({
      items: [],
      pending: 0,
      refresh: vi.fn(),
      meta: {},
    });

    renderObjectList({ kind: "drawer", entity: "persona" });

    expect(screen.getByRole("button", { name: "Create Paper Persona" })).toBeEnabled();
  });

  it("states that paper pools are hidden and how many exist on CapitalPoolsList empty state and translates dataSources cadenceCron/timezone in zh-TW", async () => {
    let loaded = false;
    mocks.useLiveListV1.mockImplementation((loader: () => Promise<{ items: unknown[] }>) => {
      if (!loaded) {
        loaded = true;
        void loader();
      }
      return {
        items: [],
        pending: 0,
        refresh: vi.fn(),
        meta: capitalPoolsFixture.meta,
      };
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(capitalPoolsFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/capital"]}>
            <Routes>
              <Route path="/management/capital" element={<CapitalPoolsList />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("No formal capital pools (2 paper pools hidden)")).toBeInTheDocument();
    expect(screen.queryByText(/upstream is not producing/i)).not.toBeInTheDocument();

    expect(i18n.getFixedT("zh-TW")("mgmt.dataSources.detail.cadenceCron")).not.toBe("mgmt.dataSources.detail.cadenceCron");
    expect(i18n.getFixedT("zh-TW")("mgmt.dataSources.detail.timezone")).not.toBe("mgmt.dataSources.detail.timezone");
  });
});
