import { describe, expect, it } from "vitest";

import { isLiveBffModeConfigured } from "./seedTaxonomy";
import { isLiveBffModeConfigured as barrelIsLiveBffModeConfigured } from "./index";

describe("strict-live fixture guard", () => {
  it("recognizes a production live configuration", () => {
    expect(isLiveBffModeConfigured({
      MODE: "production",
      VITE_BFF_MODE: "live",
    })).toBe(true);
  });

  it("does not classify mock or test configurations as live", () => {
    expect(isLiveBffModeConfigured({
      MODE: "development",
      VITE_BFF_MODE: "mock",
    })).toBe(false);
    expect(isLiveBffModeConfigured({
      MODE: "test",
      VITE_BFF_MODE: "live",
    })).toBe(false);
  });

  it("preserves isLiveBffModeConfigured public export from the bff-v1 barrel without namespace conflict", () => {
    expect(typeof barrelIsLiveBffModeConfigured).toBe("function");
    expect(barrelIsLiveBffModeConfigured).toBe(isLiveBffModeConfigured);
  });
});
