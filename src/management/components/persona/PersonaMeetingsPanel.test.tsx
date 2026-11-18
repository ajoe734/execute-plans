import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@/i18n";
import { setMockResolver } from "@/lib/bff-v1/client";
import { bffV1 } from "@/lib/bff-v1";
import * as personaClient from "@/lib/bff-v1/personas";
import * as personaDetailData from "@/management/pages/personaDetailData";
import { PersonaMeetingsPanel } from "./PersonaMeetingsPanel";
import { PersonaDetail } from "@/management/pages/PersonaDetail";

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  useAgoraWriteAccess: () => ({
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null,
    writeAllowed: true,
    writeDisabledReason: null,
  }),
}));

describe("PersonaMeetingsPanel and PersonaDetail meetings tab (AC3 & AC7)", () => {
  beforeEach(() => {
    setMockResolver(undefined);
  });

  afterEach(() => {
    cleanup();
    setMockResolver(undefined);
    vi.restoreAllMocks();
  });

  it("renders a persona's meetings, weekly count, schedule, refusals, and proposals with downstream links", async () => {
    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings") {
        return (req) => {
          expect(req.query.persona_id).toBe("persona-alpha");
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                items: [
                  {
                    meeting_id: "mtg-001",
                    meeting_type: "MT-1",
                    topic: "Weekly pool evolution review #1",
                    status: "closed",
                    outcome: "PROPOSALS_ISSUED",
                    chair_persona_id: "persona-alpha",
                    participants: [{ persona_id: "persona-alpha", role: "chair" }],
                    closed_at: "2026-11-16T10:05:00Z",
                  },
                ],
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/bff/management/meetings/proposals") {
        return (req) => {
          expect(req.query.persona_id).toBe("persona-alpha");
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                items: [
                  {
                    proposal_id: "prop-001",
                    meeting_id: "mtg-001",
                    kind: "research_demand",
                    sponsor_persona_id: "persona-alpha",
                    downstream: {
                      target: "research_demand",
                      id: "rd-101",
                      status: "pending",
                      href: "/management/experiments",
                    },
                  },
                ],
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/bff/management/meetings/catalogue") {
        return (req) => {
          expect(req.query.persona_id).toBe("persona-alpha");
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                types: [
                  {
                    meeting_type: "MT-1",
                    enabled: true,
                    budget: { max_participants: 5, max_rounds: 2, weekly_limit: 3 },
                  },
                ],
                schedule: [
                  {
                    persona_id: "persona-alpha",
                    meeting_type: "MT-1",
                    last_run_at: "2026-11-09T10:00:00Z",
                    next_due_at: "2026-11-16T10:00:00Z",
                    weekly_count: 1,
                    weekly_limit: 3,
                  },
                ],
                refusals: [
                  {
                    persona_id: "persona-alpha",
                    meeting_type: "MT-3",
                    reason: "insufficient_participants",
                    at: "2026-11-16T09:00:00Z",
                  },
                ],
              },
            },
          };
        };
      }
      return undefined;
    });

    render(
      <MemoryRouter>
        <PersonaMeetingsPanel personaId="persona-alpha" />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("persona-meetings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("persona-meetings-weekly-count")).toHaveTextContent(
      "Weekly Count: 1 / 3",
    );
    expect(screen.getByTestId("persona-meetings-refusals")).toHaveTextContent(
      "insufficient_participants",
    );
    expect(screen.getByTestId("persona-meeting-mtg-001")).toHaveTextContent(
      "Weekly pool evolution review #1",
    );
    expect(screen.getByTestId("persona-proposal-downstream-prop-001")).toHaveAttribute(
      "href",
      "/management/experiments",
    );
  });

  it("shows explicit empty state and explicit unavailable state with reason", async () => {
    setMockResolver((method, path) => {
      if (method === "GET" && path.startsWith("/bff/management/meetings")) {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "unavailable",
            owner: "consultation",
            reason: "consultation_owner_unavailable",
            data: { status: "unavailable", reason: "consultation_owner_unavailable", items: [] },
          },
        });
      }
      return undefined;
    });

    const { unmount } = render(
      <MemoryRouter>
        <PersonaMeetingsPanel personaId="persona-alpha" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("persona-meetings-unavailable")).toHaveTextContent(
      "consultation_owner_unavailable",
    );
    unmount();

    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings/catalogue") {
        return () => ({
          kind: "json",
          status: 200,
          body: { status: "ok", data: { types: [], schedule: [], refusals: [] } },
        });
      }
      if (method === "GET" && path.startsWith("/bff/management/meetings")) {
        return () => ({
          kind: "json",
          status: 200,
          body: { status: "ok", data: { items: [] } },
        });
      }
      return undefined;
    });

    render(
      <MemoryRouter>
        <PersonaMeetingsPanel personaId="persona-alpha" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("persona-meetings-empty")).toBeInTheDocument();
    expect(screen.getByTestId("persona-meetings-proposals-empty")).toBeInTheDocument();
  });

  it("mounts the meetings tab on PersonaDetail at /management/personas/:id?tab=meetings", async () => {
    vi.spyOn(personaDetailData, "resolvePersonaForDetail").mockResolvedValue({
      id: "persona-alpha",
      name: "Alpha Momentum Persona",
      archetype: "Momentum",
      state: "deployed",
      risk: "medium",
      owner: "quant-team",
      routedStrategies: 2,
      successRate: 0.64,
      updatedAt: "2026-11-16T00:00:00Z",
    });
    vi.spyOn(personaClient, "getPersonaManagement").mockResolvedValue({
      data: {},
      meta: { surfaces: {} },
    } as personaClient.PersonaManagementEnvelope);
    vi.spyOn(bffV1.strategies, "listForPersona").mockResolvedValue([]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);

    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            data: {
              items: [
                {
                  meeting_id: "mtg-persona-01",
                  meeting_type: "MT-2",
                  topic: "Optimisation review for Alpha Momentum",
                  status: "open",
                  chair_persona_id: "persona-alpha",
                  participants: [{ persona_id: "persona-alpha", role: "chair" }],
                },
              ],
            },
          },
        });
      }
      if (method === "GET" && path === "/bff/management/meetings/proposals") {
        return () => ({
          kind: "json",
          status: 200,
          body: { status: "ok", data: { items: [] } },
        });
      }
      if (method === "GET" && path === "/bff/management/meetings/catalogue") {
        return () => ({
          kind: "json",
          status: 200,
          body: { status: "ok", data: { types: [], schedule: [], refusals: [] } },
        });
      }
      return undefined;
    });

    render(
      <MemoryRouter initialEntries={["/management/personas/persona-alpha?tab=meetings"]}>
        <Routes>
          <Route path="/management/personas/:id" element={<PersonaDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("persona-meeting-mtg-persona-01")).toHaveTextContent(
      "Optimisation review for Alpha Momentum",
    );
  });
});
