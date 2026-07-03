import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { RuntimeListItem } from "@/lib/bff-v1";
import { RuntimesPage } from "./Runtimes";

const mocks = vi.hoisted(() => ({
  useLiveListV1: vi.fn(),
  runActionSafe: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    useLiveListV1: mocks.useLiveListV1,
    runActionSafe: mocks.runActionSafe,
  };
});

void i18n.changeLanguage("en-US");

function renderRuntimes(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/runtimes" element={<RuntimesPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("RuntimesPage", () => {
  beforeEach(() => {
    mocks.useLiveListV1.mockReset();
    mocks.runActionSafe.mockReset();
  });

  it("focuses live runtime binding rows and renders missing telemetry as nan", () => {
    const rows: RuntimeListItem[] = [{
      id: "rt-rescue-0260528-5937dea1",
      name: "rt-rescue-0260528-5937dea1",
      kind: "paper" as RuntimeListItem["kind"],
      env: "paper",
      status: "active",
      cpu: Number.NaN,
      memory: Number.NaN,
      latencyP95Ms: Number.NaN,
      uptimePct: Number.NaN,
      region: "",
      updatedAt: "",
      runtimeId: "rt-rescue-0260528-5937dea1",
      runtimeBindingId: "rb-433f2a614995432b9e7a463c882dbefb",
      personaId: "persona-20260528-5937dea1",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
    });

    renderRuntimes("/management/runtimes?persona=persona-20260528-5937dea1&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb");

    expect(screen.getByText(/Focused persona: persona-20260528-5937dea1/)).toBeInTheDocument();
    expect(screen.getByText("rt-rescue-0260528-5937dea1")).toBeInTheDocument();
    expect(screen.getByText("rb-433f2a614995432b9e7a463c882dbefb")).toBeInTheDocument();
    expect(screen.getByText("persona-20260528-5937dea1")).toBeInTheDocument();
    expect(screen.getAllByText("nan").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("0ms")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
  });

  it("does not fall back to unrelated runtime rows when focus misses", () => {
    const rows: RuntimeListItem[] = [{
      id: "rt-other",
      name: "rt-other",
      kind: "executor" as RuntimeListItem["kind"],
      env: "live",
      status: "active",
      cpu: 0.1,
      memory: 0.2,
      latencyP95Ms: 15,
      uptimePct: 99.9,
      region: "ap-northeast-1",
      updatedAt: "",
      runtimeId: "rt-other",
      runtimeBindingId: "rb-other",
      personaId: "persona-other",
    }];
    mocks.useLiveListV1.mockReturnValue({
      items: rows,
      refresh: vi.fn(),
      loading: false,
    });

    renderRuntimes("/management/runtimes?persona=persona-tw&runtime=rt-tw&binding=rb-tw");

    expect(screen.getByText("No runtime row declares persona persona-tw / runtime rt-tw / binding rb-tw.")).toBeInTheDocument();
    expect(screen.getByText("No runtime rows.")).toBeInTheDocument();
    expect(screen.queryByText("rt-other")).not.toBeInTheDocument();
    expect(screen.queryByText("persona-other")).not.toBeInTheDocument();
  });
});
