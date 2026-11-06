import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerPager, freshServerPageCursor } from "./ServerPager";

vi.mock("@/platform/hooks", () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

afterEach(cleanup);

describe("ServerPager", () => {
  it("shows page_info.total, advances with the server next token, and goes back", () => {
    const setCursor = vi.fn();
    const { rerender } = render(
      <ServerPager
        cursor={freshServerPageCursor("k")}
        setCursor={setCursor}
        pageSize={20}
        total={1521}
        visibleCount={20}
        nextToken="20"
        testIdPrefix="jobs"
        ariaLabel="Jobs"
      />,
    );
    const nav = screen.getByTestId("jobs-list-pagination");
    expect(nav).toHaveAttribute("data-total", "1521");
    expect(screen.getByTestId("jobs-list-page-indicator").textContent).toContain('"totalPages":77');
    expect(screen.getByTestId("jobs-page-prev")).toBeDisabled();
    fireEvent.click(screen.getByTestId("jobs-page-next"));
    expect(setCursor).toHaveBeenCalledWith({ key: "k", currentToken: "20", prevTokens: [undefined], pageIndex: 1 });

    rerender(
      <ServerPager
        cursor={{ key: "k", currentToken: "20", prevTokens: [undefined], pageIndex: 1 }}
        setCursor={setCursor}
        pageSize={20}
        total={1521}
        visibleCount={20}
        testIdPrefix="jobs"
        ariaLabel="Jobs"
      />,
    );
    expect(screen.getByTestId("jobs-page-next")).toBeDisabled();
    fireEvent.click(screen.getByTestId("jobs-page-prev"));
    expect(setCursor).toHaveBeenLastCalledWith({ key: "k", currentToken: undefined, prevTokens: [], pageIndex: 0 });
  });

  it("hides jump-to-last unless enabled", () => {
    const props = {
      cursor: freshServerPageCursor("k"),
      setCursor: vi.fn(),
      pageSize: 20,
      total: 100,
      visibleCount: 20,
      nextToken: "20",
      testIdPrefix: "x",
      ariaLabel: "x",
    };
    const { rerender } = render(<ServerPager {...props} enableJumpToLast={false} />);
    expect(screen.queryByTestId("x-page-last")).toBeNull();
    rerender(<ServerPager {...props} />);
    expect(screen.getByTestId("x-page-last")).toBeInTheDocument();
  });
});
