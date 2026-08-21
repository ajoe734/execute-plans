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
});
