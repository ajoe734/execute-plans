import { describe, expect, it } from "vitest";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import {
  buildSystemDataSourceRegistry,
  summarizeSystemDataSources,
} from "./systemDataSources";

const rows: ManagementPersonaFleetRow[] = [
  {
    personaId: "persona-tw-equity",
    personaName: "Taiwan Equity Persona",
    owner: "pathreon-management",
    ooda: "Decide",
    autonomy: "supervised",
    perfDelta: 0.1,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    marketScope: ["TW"],
    dataSourceStatus: {
      state: "partial_readback",
      summary: "Shioaji readback present; TEJ credential unavailable.",
      providerStatuses: {
        shioaji: "read_ok",
        tej: "credential_unavailable",
        mops: "public_reference_unavailable",
      },
      readbackRefs: ["support/evidence/repo-local-quote-readback/shioaji.json"],
      unavailableRefs: [
        "support/evidence/repo-local-uncredentialed/tej.json",
        "support/evidence/repo-local-uncredentialed/mops.json",
      ],
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: false,
    },
    dataSources: [
      {
        providerKey: "shioaji",
        provider: "Shioaji quote",
        status: "read_ok",
        sourceClass: "broker_execution",
        orderCapableProvider: true,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "tej",
        provider: "TEJ API",
        status: "credential_unavailable",
        sourceClass: "research_grade",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ],
  },
];

describe("system data source registry", () => {
  it("aggregates shared provider state from persona requirements", () => {
    const records = buildSystemDataSourceRegistry(rows);
    expect(records.map((record) => record.providerKey)).toEqual(["tej", "mops", "shioaji"]);

    const shioaji = records.find((record) => record.providerKey === "shioaji");
    expect(shioaji?.tone).toBe("ok");
    expect(shioaji?.consumerPersonaIds).toEqual(["persona-tw-equity"]);
    expect(shioaji?.evidenceRefs).toContain("support/evidence/repo-local-quote-readback/shioaji.json");

    const tej = records.find((record) => record.providerKey === "tej");
    expect(tej?.credentialState).toBe("missing");
    expect(tej?.tone).toBe("bad");

    const mops = records.find((record) => record.providerKey === "mops");
    expect(mops?.provider).toBe("MOPS");
    expect(mops?.status).toBe("public_reference_unavailable");
  });

  it("summarizes global data source health", () => {
    const summary = summarizeSystemDataSources(buildSystemDataSourceRegistry(rows));
    expect(summary.total).toBe(3);
    expect(summary.readable).toBe(1);
    expect(summary.degraded).toBe(2);
    expect(summary.credentialMissing).toBe(1);
    expect(summary.consumerPersonas).toBe(1);
    expect(summary.markets).toEqual(["TW"]);
  });
});
