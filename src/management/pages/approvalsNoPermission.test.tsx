// FE-VIEWER-APPROVALS-NO-PERMISSION-STATE-20261126
// A viewer's approvals read answers a typed 403 (FORBIDDEN,
// details.permission_state=no_permission). Each approvals surface renders a
// visible no-permission state for that section while the rest of the page
// loads; an untyped 403, a 401, a 5xx or a network error still renders an
// error state.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BffError, normalizeBffErrorEnvelope } from "@/lib/bff-v1/errors";
import { isNoPermissionError, noPermissionSurface, sectionReadFailure } from "@/lib/bff-v1/permissionState";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { resetSharedQueryClientForTests } from "@/lib/bff-v1/queryKeys";

const mocks = vi.hoisted(() => ({
  approvalsList: vi.fn(),
  approvalsGet: vi.fn(),
  rebalanceGet: vi.fn(),
  deploymentGet: vi.fn(),
  evolutionGet: vi.fn(),
  capitalGet: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      approvals: { ...actual.bffV1.approvals, list: mocks.approvalsList, get: mocks.approvalsGet },
      rebalances: { ...actual.bffV1.rebalances, get: mocks.rebalanceGet },
      deployments: { ...actual.bffV1.deployments, get: mocks.deploymentGet },
      evolution: { ...actual.bffV1.evolution, get: mocks.evolutionGet },
      capitalPools: { ...actual.bffV1.capitalPools, get: mocks.capitalGet },
    },
  };
});

import { RebalanceDetail } from "./RebalanceDetail";
import { DeploymentDetail } from "./DeploymentDetail";
import { EvolutionDetail } from "./EvolutionDetail";
import { CapitalPoolDetail } from "./CapitalPoolDetail";
import { GovernanceReview } from "./GovernanceReview";
import { GovernanceQueuePage } from "./phase2/GovernanceQueue";
import { ApprovalsPage } from "./Operations";

const TYPED_BODY = { error: { code: "FORBIDDEN", message: "forbidden", details: { permission_state: "no_permission", surface: "approvals" } } };
const UNTYPED_BODY = { error: { code: "FORBIDDEN", message: "forbidden" } };

function bffError(status: number, body: unknown): BffError {
  return new BffError(status, normalizeBffErrorEnvelope(body, status)!);
}
const typed403 = () => bffError(403, TYPED_BODY);
const untyped403 = () => bffError(403, UNTYPED_BODY);
const server500 = () => bffError(500, { error: { code: "UNKNOWN_ERROR", message: "boom" } });
const unauth401 = () => bffError(401, { error: { code: "AUTH_REQUIRED", message: "login" } });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const base = { owner: "ops", updatedAt: "2026-11-26T00:00:00Z", risk: "low" as const };

function renderAt(path: string, pattern: string, element: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={pattern} element={element} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

async function openTab(name: RegExp) {
  const tab = await screen.findByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute("data-state", "active"));
}

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  resetSharedQueryClientForTests();
  for (const fn of Object.values(mocks)) fn.mockReset();
  // Every other read on these pages answers an empty live list.
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ data: [], items: [] }));
  mocks.rebalanceGet.mockResolvedValue({ ...base, id: "rb_1", name: "Q3 rebalance", state: "draft", quarter: "2026Q3", targetPoolId: "pool_1", proposedDelta: 0, lines: [] });
  mocks.deploymentGet.mockResolvedValue({ ...base, id: "dp_1", name: "Paper deployment", state: "deployed", version: "v1", env: "paper", strategyId: "stg_1", runtimeId: "rt_1" });
  mocks.evolutionGet.mockResolvedValue({ ...base, id: "ev_1", name: "Evolution one", state: "running" });
  mocks.capitalGet.mockResolvedValue({ ...base, id: "pool_1", name: "Pool one", state: "active", mode: "paper", aum: 0, allocated: 0, strategies: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  liveStatus._reset();
});

describe("typed no-permission detection", () => {
  it("only a 403 with details.permission_state=no_permission is a no-permission answer", () => {
    expect(isNoPermissionError(typed403())).toBe(true);
    expect(noPermissionSurface(typed403())).toBe("approvals");
    expect(isNoPermissionError(bffError(403, { detail: TYPED_BODY }))).toBe(true);
    expect(isNoPermissionError(untyped403())).toBe(false);
    expect(isNoPermissionError(unauth401())).toBe(false);
    expect(isNoPermissionError(bffError(500, TYPED_BODY))).toBe(false);
    expect(isNoPermissionError(new TypeError("Failed to fetch"))).toBe(false);
    expect(sectionReadFailure(typed403())).toEqual({ status: "no_permission", surface: "approvals" });
    expect(sectionReadFailure(untyped403())).toMatchObject({ status: "error" });
  });
});

type DetailCase = {
  name: string;
  path: string;
  pattern: string;
  element: () => ReactElement;
  loaded: RegExp;
  tab: RegExp;
};
const DETAIL_CASES: DetailCase[] = [
  { name: "rebalance", path: "/management/rebalance/rb_1", pattern: "/management/rebalance/:id", element: () => <RebalanceDetail />, loaded: /2026Q3 · target pool_1/, tab: /Approval/i },
  { name: "deployment", path: "/management/deployments/dp_1", pattern: "/management/deployments/:id", element: () => <DeploymentDetail />, loaded: /Paper deployment/, tab: /Approvals/i },
  { name: "evolution", path: "/management/evolution/ev_1", pattern: "/management/evolution/:id", element: () => <EvolutionDetail />, loaded: /Evolution one/, tab: /Approvals/i },
  { name: "capital-pool", path: "/management/capital/pool_1", pattern: "/management/capital/:id", element: () => <CapitalPoolDetail />, loaded: /Pool one/, tab: /Governance/i },
];

describe.each(DETAIL_CASES)("$name detail approvals section", (c) => {
  it("typed 403 -> visible no-permission section (and tab badge) while the page loads", async () => {
    mocks.approvalsList.mockRejectedValue(typed403());
    renderAt(c.path, c.pattern, c.element());
    expect((await screen.findAllByText(c.loaded)).length).toBeGreaterThan(0);
    const badge = await screen.findByTestId("no-permission-badge");
    expect(badge).toHaveAttribute("data-permission-state", "no_permission");
    expect(badge).toHaveAttribute("data-permission-surface", "approvals");
    await openTab(c.tab);
    const state = await screen.findByTestId("no-permission-state");
    expect(within(state).getByText("No permission")).toBeInTheDocument();
    expect(state).toHaveAttribute("data-permission-surface", "approvals");
    expect(screen.queryByTestId("section-read-error")).not.toBeInTheDocument();
  });

  it.each([
    ["untyped 403", untyped403],
    ["401", unauth401],
    ["5xx", server500],
    ["network error", () => new TypeError("Failed to fetch")],
  ])("%s -> error state, never no-permission", async (_label, makeErr) => {
    mocks.approvalsList.mockRejectedValue(makeErr());
    renderAt(c.path, c.pattern, c.element());
    expect((await screen.findAllByText(c.loaded)).length).toBeGreaterThan(0);
    await openTab(c.tab);
    expect(await screen.findByTestId("section-read-error")).toBeInTheDocument();
    expect(screen.queryByTestId("no-permission-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("no-permission-badge")).not.toBeInTheDocument();
  });

  it("issues exactly one approvals read", async () => {
    mocks.approvalsList.mockRejectedValue(typed403());
    renderAt(c.path, c.pattern, c.element());
    await screen.findByTestId("no-permission-badge");
    expect(mocks.approvalsList).toHaveBeenCalledTimes(1);
  });
});

describe.each(DETAIL_CASES.filter((c) => c.name !== "capital-pool"))("$name detail not found", (c) => {
  it("issues no approvals read for a not-found id", async () => {
    for (const fn of [mocks.rebalanceGet, mocks.deploymentGet, mocks.evolutionGet]) fn.mockResolvedValue(undefined);
    mocks.approvalsList.mockRejectedValue(typed403());
    renderAt(c.path, c.pattern, c.element());
    expect((await screen.findAllByText(/not found/i)).length).toBeGreaterThan(0);
    expect(mocks.approvalsList).not.toHaveBeenCalled();
  });
});

describe("/management/governance queue", () => {
  it("typed 403 -> no-permission state", async () => {
    mocks.approvalsList.mockRejectedValue(typed403());
    renderAt("/management/governance", "/management/governance", <GovernanceQueuePage />);
    const state = await screen.findByTestId("no-permission-state");
    expect(state).toHaveAttribute("data-permission-surface", "approvals");
  });
  it.each([["untyped 403", untyped403], ["5xx", server500]])("%s -> error state", async (_l, makeErr) => {
    mocks.approvalsList.mockRejectedValue(makeErr());
    renderAt("/management/governance", "/management/governance", <GovernanceQueuePage />);
    expect(await screen.findByTestId("section-read-error")).toBeInTheDocument();
    expect(screen.queryByTestId("no-permission-state")).not.toBeInTheDocument();
  });
});

describe("/management/governance/:id review", () => {
  it("typed 403 -> no-permission state instead of 'unavailable'", async () => {
    mocks.approvalsGet.mockRejectedValue(typed403());
    renderAt("/management/governance/apr_1", "/management/governance/:id", <GovernanceReview />);
    const state = await screen.findByTestId("no-permission-state");
    expect(state).toHaveAttribute("data-permission-surface", "approvals");
    expect(screen.queryByText("Approval request unavailable")).not.toBeInTheDocument();
  });
  it.each([["untyped 403", untyped403], ["401", unauth401], ["5xx", server500]])("%s -> existing error state", async (_l, makeErr) => {
    mocks.approvalsGet.mockRejectedValue(makeErr());
    renderAt("/management/governance/apr_1", "/management/governance/:id", <GovernanceReview />);
    expect(await screen.findByText("Approval request unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("no-permission-state")).not.toBeInTheDocument();
  });
});

describe("/management/approvals", () => {
  // Through the real client: the 403 body is parsed into a BffError.
  const serve = (status: number, body: unknown) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/approvals") ? jsonResponse(body, status) : jsonResponse({ data: [], items: [] }));

  it("typed 403 -> no-permission state", async () => {
    serve(403, TYPED_BODY);
    renderAt("/management/approvals", "/management/approvals", <ApprovalsPage />);
    const state = await screen.findByTestId("no-permission-state");
    expect(state).toHaveAttribute("data-permission-surface", "approvals");
    expect(screen.queryByTestId("section-read-error")).not.toBeInTheDocument();
  });
  it.each([[403, UNTYPED_BODY], [401, { error: { code: "AUTH_REQUIRED", message: "login" } }], [503, { error: { code: "BACKEND_UNAVAILABLE", message: "down" } }]])(
    "%s -> error state", async (status, body) => {
      serve(status, body);
      renderAt("/management/approvals", "/management/approvals", <ApprovalsPage />);
      expect(await screen.findByTestId("section-read-error")).toBeInTheDocument();
      expect(screen.queryByTestId("no-permission-state")).not.toBeInTheDocument();
    });
});
