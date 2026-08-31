import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  bffFetch,
  getMockResolver,
  setMockResolver,
  strategies,
} from "@/lib/bff-v1";
import { prepareMockEnvironment, bootstrapApp } from "@/main";

describe("Bootstrap mock resolver ordering", () => {
  beforeEach(() => {
    // Explicitly unbind the mock resolver so this test does NOT rely on
    // src/test/setup.ts preloading the registry at test process launch.
    setMockResolver(undefined);
  });

  afterAll(async () => {
    // Restore the mock environment for any subsequent tests in the suite.
    await prepareMockEnvironment();
  });

  it("proves that an uninitialized mock resolver fails with RESOURCE_NOT_FOUND", async () => {
    expect(getMockResolver()).toBeUndefined();

    await expect(
      bffFetch({ method: "GET", path: "/bff/strategies", mode: "mock" }),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "No mock for GET /bff/strategies",
    });
  });

  it("proves resolver-before-render bootstrap guarantees the first mock-mode request succeeds", async () => {
    // 1. Initial state: resolver is uninitialized
    expect(getMockResolver()).toBeUndefined();

    // 2. Run the bootstrap preparation (which main.tsx awaits before rendering)
    const resolver = await prepareMockEnvironment();
    expect(resolver).toBeDefined();
    expect(getMockResolver()).toBeDefined();

    // 3. The very first mock-mode BFF request must succeed and not hit RESOURCE_NOT_FOUND
    const result = await bffFetch<{ items: Array<{ id: string }> }>({
      method: "GET",
      path: "/bff/strategies",
      mode: "mock",
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].id).toBe("stg_001");

    // 4. Domain caller also succeeds on first try
    const domainList = await strategies.list();
    expect(Array.isArray(domainList)).toBe(true);
    expect(domainList.length).toBeGreaterThan(0);
    expect(domainList[0].id).toBe("stg_001");
  });

  it("bootstrapApp mounts the application with the mock resolver ready before render", async () => {
    expect(getMockResolver()).toBeUndefined();

    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    try {
      await bootstrapApp(root);

      expect(getMockResolver()).toBeDefined();

      // Ensure the rendered DOM contains the top-level application root
      await waitFor(() => {
        expect(root.children.length).toBeGreaterThan(0);
      });
    } finally {
      document.body.removeChild(root);
    }
  });
});
