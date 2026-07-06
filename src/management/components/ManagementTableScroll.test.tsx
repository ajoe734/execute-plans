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
    expect(root).toHaveAttribute("data-management-table-scroll-mode", "pinned");

    const pinned = root.querySelector<HTMLDivElement>("[data-management-table-scrollbar='pinned']");
    const native = root.querySelector<HTMLDivElement>("[data-management-table-scrollbar='native']");

    expect(pinned).toBeTruthy();
    expect(native).toBeTruthy();
    expect(pinned).toHaveClass("sticky");
    expect(pinned).toHaveClass("bottom-0");
    expect(native).toHaveClass("pinned-horizontal-scroll__native");
    expect(native).toHaveAttribute("role", "region");
    expect(native).toHaveAttribute("tabindex", "0");
    expect(native).toHaveAttribute("aria-label", "Table horizontal scroll");

    pinned!.scrollLeft = 320;
    fireEvent.scroll(pinned!);
    expect(native!.scrollLeft).toBe(320);

    native!.scrollLeft = 48;
    fireEvent.scroll(native!);
    expect(pinned!.scrollLeft).toBe(48);
  });

  it("can render a bounded native table viewport without hiding native scrollbars", () => {
    render(
      <ManagementTableScroll
        testId="management-table-scroll"
        minScrollWidth={1200}
        showPinnedScrollbar={false}
        viewportClassName="max-h-[400px] overflow-auto"
      >
        <div style={{ width: 1200, height: 1200 }}>wide table content</div>
      </ManagementTableScroll>,
    );

    const root = screen.getByTestId("management-table-scroll");
    const native = root.querySelector<HTMLDivElement>("[data-management-table-scrollbar='native']");

    expect(root).toHaveAttribute("data-management-table-scroll-mode", "native");
    expect(root.querySelector("[data-management-table-scrollbar='pinned']")).toBeNull();
    expect(native).toBeTruthy();
    expect(native).not.toHaveClass("pinned-horizontal-scroll__native");
    expect(native).toHaveClass("max-h-[400px]");
    expect(native).toHaveClass("overflow-auto");
  });
});
