import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

import {
  NON_PRODUCTION_COMMAND_REASON,
  NonProductionActionButton,
} from "./NonProductionActionButton";

describe("NonProductionActionButton", () => {
  it("renders a disabled action with a production command-truth reason when no status given", () => {
    render(<NonProductionActionButton size="sm">Submit</NonProductionActionButton>);

    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.closest("span")).toHaveAttribute("title", NON_PRODUCTION_COMMAND_REASON);
    expect(button).toHaveAttribute("data-reason", NON_PRODUCTION_COMMAND_REASON);
  });

  it("renders owner pending status tooltip in both en-US and zh-TW locales", async () => {
    await i18n.changeLanguage("en-US");
    const { unmount } = render(
      <NonProductionActionButton
        size="sm"
        status="owner endpoint exists with frontend wiring pending"
      >
        Promote
      </NonProductionActionButton>,
    );

    let button = screen.getByRole("button", { name: "Promote" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-status", "owner endpoint exists with frontend wiring pending");
    expect(button.closest("span")).toHaveAttribute(
      "title",
      "Owner endpoint exists with frontend wiring pending",
    );

    unmount();

    await i18n.changeLanguage("zh-TW");
    render(
      <NonProductionActionButton
        size="sm"
        status="owner endpoint exists with frontend wiring pending"
      >
        Promote
      </NonProductionActionButton>,
    );

    button = screen.getByRole("button", { name: "Promote" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-status", "owner endpoint exists with frontend wiring pending");
    expect(button.closest("span")).toHaveAttribute("title", "Owner 端點已存在待接線");
  });

  it("renders no owner status tooltip in both en-US and zh-TW locales", async () => {
    await i18n.changeLanguage("en-US");
    const { unmount } = render(
      <NonProductionActionButton size="sm" status="no executing owner">
        Delete
      </NonProductionActionButton>,
    );

    let button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-status", "no executing owner");
    expect(button.closest("span")).toHaveAttribute("title", "No executing owner");

    unmount();

    await i18n.changeLanguage("zh-TW");
    render(
      <NonProductionActionButton size="sm" status="no executing owner">
        Delete
      </NonProductionActionButton>,
    );

    button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-status", "no executing owner");
    expect(button.closest("span")).toHaveAttribute("title", "無執行 owner");
  });
});
