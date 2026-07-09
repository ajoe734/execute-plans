import { describe, expect, it } from "vitest";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { visibleDataSources } from "./personaFleetDataSources";

describe("PersonaFleetPage data source badges", () => {
  it("prioritizes readable providers before truncating", () => {
    const row = {
      dataSources: [
        { providerKey: "twse", provider: "TWSE OpenAPI", status: "read_unavailable" },
        { providerKey: "tpex", provider: "TPEx E-Data", status: "read_unavailable" },
        { providerKey: "mops", provider: "MOPS", status: "public_reference_unavailable" },
        { providerKey: "tej", provider: "TEJ API", status: "credential_unavailable" },
        { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" },
      ],
    } as ManagementPersonaFleetRow;

    expect(visibleDataSources(row).map((source) => source.providerKey)).toEqual([
      "shioaji",
      "twse",
      "tpex",
      "mops",
    ]);
  });
});
