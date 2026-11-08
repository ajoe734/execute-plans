import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { EvolutionDetail } from "./EvolutionDetail";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const EXPR = "max_drawdown <= 0.10";

const program = (constraints: unknown[]) => ({
  id: "evp-draft-1",
  program_id: "evp-draft-1",
  name: "Draft Program",
  status: "draft",
  state: "draft",
  origin: "manual",
  source_decision_ids: [],
  run_ids: [],
  allowedActions: ["create_constraint"],
  allowed_actions: ["create_constraint"],
  constraints,
  updatedAt: "2026-11-06T03:22:34Z",
});

describe("EvolutionDetail saved constraint visibility", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    process.env.VITE_BFF_REAL_WRITES = "true";
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("pantheon.bff.bearerToken", "test_tok_operator");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    delete process.env.VITE_BFF_REAL_WRITES;
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  function setup(opts: { commandStatus?: number; commandBody?: unknown; commitOnCommand: boolean }) {
    let owner = program([]);
    let releaseReadback: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseReadback = resolve; });
    let holdReadback = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return json({ data: { session: { authenticated: true, session_kind: "bearer" }, environment: { name: "dev", strict_auth: false } } });
      }
      if (url.endsWith("/bff/evolution-programs/evp-draft-1")) {
        if (holdReadback) {
          await gate;
        }
        return json({ data: owner });
      }
      if (url.endsWith("/bff/v1/commands") && init?.method === "POST") {
        holdReadback = true;
        if (opts.commitOnCommand) {
          owner = program([{ id: "cst-b5dbfe0c", name: EXPR, expression: EXPR, created_at: "2026-11-06T03:22:34Z" }]);
        }
        return json(opts.commandBody ?? { status: "accepted", data: { commandId: "cmd-1", status: "accepted" } }, opts.commandStatus ?? 202);
      }
      return json({ data: [], items: [] });
    });
    return { release: () => releaseReadback() };
  }

  const renderPage = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/evolution/evp-draft-1"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

  async function openConstraintsAndSubmit() {
    renderPage();
    const tab = await screen.findByRole("tab", { name: i18n.t("evolution.tabs.constraints") });
    fireEvent.mouseDown(tab, { button: 0 });
    fireEvent.click(tab);
    const box = await screen.findByPlaceholderText(i18n.t("evolution.constraints.placeholder"));
    fireEvent.change(box, { target: { value: EXPR } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("evolution.constraints.add") }));
    return tab;
  }

  it("keeps the Constraints tab mounted during delayed readback and shows the committed owner constraint", async () => {
    const h = setup({ commitOnCommand: true });
    const tab = await openConstraintsAndSubmit();

    // Readback is in flight: detail must not be replaced by the loading placeholder.
    await waitFor(() => expect(screen.queryByText(i18n.t("common.loading"))).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: i18n.t("evolution.tabs.constraints") })).toHaveAttribute("data-state", "active");
    expect(screen.queryByText(EXPR, { selector: "li span" })).not.toBeInTheDocument(); // no optimistic fabrication

    h.release();
    expect(await screen.findByText(EXPR, { selector: "li span" })).toBeInTheDocument();
    expect(screen.getByText("cst-b5dbfe0c")).toBeInTheDocument();
    expect(tab).toBeDefined();
  });

  it("does not show a constraint when the owner rejects the command", async () => {
    const h = setup({
      commitOnCommand: false,
      commandStatus: 409,
      commandBody: { error: { code: "STATE_CONFLICT", message: "Owner rejected create_constraint" } },
    });
    await openConstraintsAndSubmit();
    h.release();
    expect(await screen.findByTestId("evolution-constraint-action-error")).toHaveTextContent("Owner rejected create_constraint");
    expect(screen.queryByText(EXPR, { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: i18n.t("evolution.tabs.constraints") })).toHaveAttribute("data-state", "active");
  });
});
