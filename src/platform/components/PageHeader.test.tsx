import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageBody } from "./PageHeader";

afterEach(cleanup);

describe("PageBody bottom clearance", () => {
  it("document mode reserves space via the optional clearance variable with a zero default", () => {
    const { container } = render(<PageBody>x</PageBody>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset.pageBodyMode).toBe("document");
    expect(el.className).toContain(
      "after:h-[var(--page-body-bottom-clearance,0px)]",
    );
  });

  it("fill mode does not reserve clearance", () => {
    const { container } = render(<PageBody fill>x</PageBody>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset.pageBodyMode).toBe("fill");
    expect(el.className).not.toContain("page-body-bottom-clearance");
  });
});
