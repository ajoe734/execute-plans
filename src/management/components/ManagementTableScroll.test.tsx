import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ManagementTableScroll } from "./ManagementTableScroll";

describe("ManagementTableScroll", () => {
  it("renders a pinned horizontal scrollbar synced with the native table scroller", () => {
    render(
      <ManagementTableScroll testId="management-table-scroll" minScrollWidth={1200}>
        <div style={{ width: 1200 }}>wide table content</div>
      </ManagementTableScroll>,
    );

    const root = screen.getByTestId("management-table-scroll");
    expect(root).toHaveAttribute("data-management-table-scroll", "pinned-horizontal");

    const pinned = root.querySelector<HTMLDivElement>("[data-management-table-scrollbar='pinned']");
    const native = root.querySelector<HTMLDivElement>("[data-management-table-scrollbar='native']");

    expect(pinned).toBeTruthy();
    expect(native).toBeTruthy();

    pinned!.scrollLeft = 320;
    fireEvent.scroll(pinned!);
    expect(native!.scrollLeft).toBe(320);

    native!.scrollLeft = 48;
    fireEvent.scroll(native!);
    expect(pinned!.scrollLeft).toBe(48);
  });
});
