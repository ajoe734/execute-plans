import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HighRiskConfirm } from "./HighRiskConfirm";

describe("HighRiskConfirm — repeat submit prevention and confirmation flow", () => {
  it("prevents multiple onConfirm calls during pending async submit", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirmPromise = new Promise<void>((resolve) => {
      resolveConfirm = resolve;
    });
    const onConfirm = vi.fn().mockImplementation(() => onConfirmPromise);
    const onOpenChange = vi.fn();

    render(
      <HighRiskConfirm
        open={true}
        onOpenChange={onOpenChange}
        operation="retire_persona"
        target={{ type: "persona", id: "p_test", name: "Alpha Persona" }}
        risk="high"
        description="Retire persona test action"
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    // Type valid audit memo
    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed audit memo exceeding forty characters for high risk action confirmation." },
    });

    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm once
    fireEvent.click(confirmBtn);

    // Immediately check that onConfirm was called once
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Button should now be disabled / showing submitting state
    expect(confirmBtn).toBeDisabled();

    // Rapid second click should be ignored
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Resolve the async confirm
    resolveConfirm();

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("issues confirm token and enforces typing requiredPhrase for canonical command", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <HighRiskConfirm
        open={true}
        onOpenChange={onOpenChange}
        operation="PausePaperRuntime"
        target={{ type: "Runtime", id: "rt_paper_01", name: "Paper Runtime 01" }}
        canonicalCommand={{
          actionId: "PausePaperRuntime",
          entityType: "Runtime",
          entityId: "rt_paper_01",
        }}
        risk="high"
        description="Pause paper runtime for maintenance"
        onConfirm={onConfirm}
      />,
    );

    // Wait for confirm token issuance and phrase display
    await waitFor(() => {
      expect(screen.getByText(/token:/i)).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    // Memo is required
    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed audit memo exceeding forty characters for runtime pause." },
    });

    // Confirm button must be disabled before typing the required phrase
    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    expect(confirmBtn).toBeDisabled();

    // Type the phrase
    const tokenInput = dialog.querySelectorAll("input")[0]!;
    fireEvent.change(tokenInput, {
      target: { value: "PausePaperRuntime rt_paper_01" },
    });

    // Now button should be enabled
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith(
      "Detailed audit memo exceeding forty characters for runtime pause.",
      expect.stringMatching(/^ctok_/),
    );
  });

  it("disables confirm button and displays error when token request fails", async () => {
    const bffV1 = await import("@/lib/bff-v1");
    vi.spyOn(bffV1, "requestConfirmToken").mockRejectedValueOnce(
      new Error("Network connection failed to token endpoint")
    );

    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <HighRiskConfirm
        open={true}
        onOpenChange={onOpenChange}
        operation="PausePaperRuntime"
        target={{ type: "Runtime", id: "rt_paper_01", name: "Paper Runtime 01" }}
        canonicalCommand={{
          actionId: "PausePaperRuntime",
          entityType: "Runtime",
          entityId: "rt_paper_01",
        }}
        risk="high"
        description="Pause paper runtime for maintenance"
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network connection failed to token endpoint/i)).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed audit memo exceeding forty characters for runtime pause." },
    });

    // Confirm button must remain disabled when token issuance failed
    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    expect(confirmBtn).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
