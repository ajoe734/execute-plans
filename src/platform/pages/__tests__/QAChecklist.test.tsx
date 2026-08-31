import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QAChecklist } from "../QAChecklist";
import { toast } from "sonner";
import i18n from "@/i18n";
import { StrictLiveMockPersistenceError } from "@/mocks/strictLiveMockPersistenceUnavailable";
import * as persistenceModule from "@/lib/bff-v1/mocks/persistence";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderComponent() {
  return render(
    <MemoryRouter>
      <QAChecklist />
    </MemoryRouter>,
  );
}

describe("QAChecklist persistence controls", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en-US");
  });

  it("renders the persistence controls card", () => {
    renderComponent();
    expect(screen.getByText(/Mock BFF Persistence/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Snapshot now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset persistence/i })).toBeInTheDocument();
  });

  it("handles successful snapshot now", async () => {
    const persistNowSpy = vi.spyOn(persistenceModule, "persistNow").mockImplementation(() => {});
    renderComponent();

    const snapshotBtn = screen.getByRole("button", { name: /Snapshot now/i });
    fireEvent.click(snapshotBtn);

    await waitFor(() => {
      expect(persistNowSpy).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
      const outcome = screen.getByTestId("qa-persist-outcome");
      expect(outcome).toBeInTheDocument();
      expect(outcome).toHaveTextContent(/Persistence snapshot written/i);
    });
  });

  it("handles strict-live snapshot failure with explicit error outcome", async () => {
    vi.spyOn(persistenceModule, "persistNow").mockImplementation(() => {
      throw new StrictLiveMockPersistenceError("Mock persistence snapshot is unavailable in a strict-live build.");
    });
    renderComponent();

    const snapshotBtn = screen.getByRole("button", { name: /Snapshot now/i });
    fireEvent.click(snapshotBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: expect.stringContaining("unavailable in a strict-live build") }),
      );
      const outcome = screen.getByTestId("qa-persist-outcome");
      expect(outcome).toBeInTheDocument();
      expect(outcome).toHaveTextContent(/unavailable in a strict-live build/i);
    });
  });

  it("handles strict-live reset failure with explicit error outcome", async () => {
    vi.spyOn(persistenceModule, "clearPersisted").mockImplementation(() => {
      throw new StrictLiveMockPersistenceError("Mock persistence reset is unavailable in a strict-live build.");
    });
    renderComponent();

    // Click reset persistence to open confirm modal
    const resetBtn = screen.getByRole("button", { name: /Reset persistence/i });
    fireEvent.click(resetBtn);

    // In HighRiskConfirm modal, fill memo (>= 40 chars for high risk) and token
    const textareas = screen.getAllByRole("textbox");
    const memoInput = textareas.find((el) => el.tagName.toLowerCase() === "textarea");
    if (memoInput) {
      fireEvent.change(memoInput, {
        target: { value: "Audit memo for reset testing: resetting mock storage to initial seed state." },
      });
    }
    const tokenInput = textareas.find((el) => el.tagName.toLowerCase() === "input");
    if (tokenInput) {
      fireEvent.change(tokenInput, { target: { value: "RESET" } });
    }
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: expect.stringContaining("unavailable in a strict-live build") }),
      );
      const outcome = screen.getByTestId("qa-persist-outcome");
      expect(outcome).toBeInTheDocument();
      expect(outcome).toHaveTextContent(/unavailable in a strict-live build/i);
    });
  });
});
