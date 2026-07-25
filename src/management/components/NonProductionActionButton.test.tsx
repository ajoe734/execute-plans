import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  NON_PRODUCTION_COMMAND_REASON,
  NonProductionActionButton,
} from "./NonProductionActionButton";

describe("NonProductionActionButton", () => {
  it("renders a disabled action with a production command-truth reason", () => {
    render(<NonProductionActionButton size="sm">Submit</NonProductionActionButton>);

    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.closest("span")).toHaveAttribute("title", NON_PRODUCTION_COMMAND_REASON);
  });
});
