import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

function stubLiveEnv(fallback: "auto" | "strict" = "auto") {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", fallback);
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

describe("LiveStatusBanner", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("hides visual noise for healthy strict real mode", () => {
    stubLiveEnv("strict");

    const { container } = render(<LiveStatusBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows live source for healthy hybrid mode without claiming seed fallback", () => {
    stubLiveEnv("auto");

    render(<LiveStatusBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("hybrid");
    expect(screen.getByRole("status")).toHaveTextContent("資料來源：live / fallback standby");
    expect(screen.getByRole("status")).not.toHaveTextContent("seed fallback armed");
    expect(screen.queryByText("資料來源：seed")).not.toBeInTheDocument();
  });

  it("shows seed source after hybrid transport fallback", () => {
    stubLiveEnv("auto");
    liveStatus.reportFallback("ECONNREFUSED");

    render(<LiveStatusBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("資料來源：seed");
    expect(screen.getByRole("status")).toHaveTextContent("hybrid fallback active");
  });

  it("shows strict typed-error without claiming seed source", () => {
    stubLiveEnv("strict");
    liveStatus.reportFallback("strict: ECONNREFUSED");

    render(<LiveStatusBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("strict typed error");
    expect(screen.getByRole("status")).toHaveTextContent("seed fallback blocked");
    expect(screen.queryByText("資料來源：seed")).not.toBeInTheDocument();
  });
});
