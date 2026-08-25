import { describe, expect, it } from "vitest";
import {
  assertNoRawSecrets,
  isValidSecretRefId,
  managementDataSourceReads,
  managementDataSourceWrites,
} from "./managementDataSources";

describe("managementDataSources client", () => {
  describe("assertNoRawSecrets and isValidSecretRefId", () => {
    it("allows vault://, env://, and ref:// secret references", () => {
      expect(isValidSecretRefId("vault://secret/market-data-key")).toBe(true);
      expect(isValidSecretRefId("env://MARKET_DATA_API_KEY")).toBe(true);
      expect(isValidSecretRefId("ref://secrets/provider/shioaji")).toBe(true);
      expect(isValidSecretRefId("")).toBe(true);
      expect(isValidSecretRefId(undefined)).toBe(true);

      expect(() =>
        assertNoRawSecrets({
          secret_ref_id: "vault://secret/market-data-key",
          apiKey: "env://MARKET_DATA_API_KEY",
          custom_secret_ref_id: "ref://secrets/custom",
        }),
      ).not.toThrow();
    });

    it("rejects short or raw plain text secret_ref_id values", () => {
      expect(isValidSecretRefId("raw123")).toBe(false);
      expect(isValidSecretRefId("my-api-key")).toBe(false);
      expect(isValidSecretRefId("sk_live_93847291847192847192")).toBe(false);
      expect(isValidSecretRefId("12345")).toBe(false);
      expect(isValidSecretRefId("plain_token")).toBe(false);

      expect(() =>
        assertNoRawSecrets({
          secret_ref_id: "raw-token-12345",
        }),
      ).toThrow(/Invalid secret_ref_id/);

      expect(() =>
        assertNoRawSecrets({
          secret_ref_id: "short",
        }),
      ).toThrow(/Invalid secret_ref_id/);

      expect(() =>
        assertNoRawSecrets({
          connector_config: {
            secret_ref_id: "12345",
          },
        }),
      ).toThrow(/Invalid secret_ref_id/);

      expect(() =>
        assertNoRawSecrets({
          provider_secret_ref_id: "plain-secret-ref",
        }),
      ).toThrow(/Invalid secret_ref_id/);
    });

    it("throws when raw inline secret keys contain plain strings", () => {
      expect(() =>
        assertNoRawSecrets({
          secret: "plain-secret-password-12345",
        }),
      ).toThrow(/Raw secret material detected/);

      expect(() =>
        assertNoRawSecrets({
          config: {
            api_key: "ak_live_93847291847192847192",
          },
        }),
      ).toThrow(/Raw secret material detected/);

      expect(() =>
        assertNoRawSecrets({
          password: "super_secret_value",
        }),
      ).toThrow(/Raw secret material detected/);
    });

    it("allows empty secret strings and normal configuration parameters", () => {
      expect(() =>
        assertNoRawSecrets({
          endpoint_url: "https://openapi.twse.com.tw",
          timeout_seconds: 15,
          secret: "",
          secret_ref_id: "",
        }),
      ).not.toThrow();
    });
  });

  describe("managementDataSourceReads", () => {
    it("reads catalog successfully in mock fallback", async () => {
      const catalog = await managementDataSourceReads.catalog();
      expect(catalog).toBeDefined();
      expect(Array.isArray(catalog.definitions)).toBe(true);
    });

    it("reads detail successfully in mock fallback", async () => {
      const detail = await managementDataSourceReads.detail("ds-mock-01");
      expect(detail).toBeDefined();
      expect(detail.data.source_instance_id).toBe("ds-mock-01");
      expect(detail.data.schema_version).toBe("management_data_source.v2");
      expect(detail.data.allowed_actions.canValidate).toBe(true);
    });

    it("reads runs successfully in mock fallback", async () => {
      const runs = await managementDataSourceReads.runs("ds-mock-01");
      expect(runs).toBeDefined();
      expect(Array.isArray(runs.observations)).toBe(true);
      expect(Array.isArray(runs.canaries)).toBe(true);
    });

    it("reads receipts successfully in mock fallback", async () => {
      const receipts = await managementDataSourceReads.receipts("ds-mock-01");
      expect(receipts).toBeDefined();
      expect(Array.isArray(receipts.receipts)).toBe(true);
    });
  });

  describe("managementDataSourceWrites fail-closed posture", () => {
    it("fails closed when real writes are off for createDataSource", async () => {
      await expect(
        managementDataSourceWrites.createDataSource({
          source_instance_id: "ds-test-create",
          definition_id: "twse-openapi-daily",
          provider: "TWSE",
          source_class: "market_daily",
          connector_config: {
            public: { endpoint: "https://openapi.twse.com.tw" },
            secret_ref_id: "vault://secret/twse",
          },
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for validateDataSource", async () => {
      await expect(
        managementDataSourceWrites.validateDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 1,
          reason: "Validating test source",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for canaryDataSource", async () => {
      await expect(
        managementDataSourceWrites.canaryDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 1,
          reason: "Canary pull test",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for enableDataSource", async () => {
      await expect(
        managementDataSourceWrites.enableDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 1,
          reason: "Operator enabling tested source",
          confirmation: true,
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for disableDataSource", async () => {
      await expect(
        managementDataSourceWrites.disableDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 2,
          reason: "Operator disabling source for maintenance",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for degradeDataSource", async () => {
      await expect(
        managementDataSourceWrites.degradeDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 3,
          reason: "Degrading due to latency",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for resumeDataSource", async () => {
      await expect(
        managementDataSourceWrites.resumeDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 4,
          reason: "Resuming source",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for changeSchedule", async () => {
      await expect(
        managementDataSourceWrites.changeSchedule({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 5,
          reason: "Changing cadence to hourly",
          schedule: {
            enabled: true,
            cadence: "0 * * * *",
            timezone: "Asia/Taipei",
          },
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for replaceDataSource", async () => {
      await expect(
        managementDataSourceWrites.replaceDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 6,
          reason: "Replacing with v2",
          confirmation: true,
          replacementSourceId: "ds-twse-v2",
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });

    it("fails closed when real writes are off for retireDataSource", async () => {
      await expect(
        managementDataSourceWrites.retireDataSource({
          sourceInstanceId: "ds-test-create",
          expectedRevision: 7,
          reason: "Decommissioning",
          confirmation: true,
        }),
      ).rejects.toThrow(/Live writes are unavailable|FEATURE_DISABLED/);
    });
  });

  describe("managementDataSourceWrites client transport assertions", () => {
    it("transports secret_scope and all fields in createDataSource payload", async () => {
      const writeGateModule = await import("./writeGate");
      const clientModule = await import("./client");
      const liveStatusModule = await import("./liveStatus");
      liveStatusModule.liveStatus._reset({ mode: "live", effective: "live" });
      const liveGateSpy = vi.spyOn(writeGateModule, "liveWriteGated").mockResolvedValue(true);
      const bffFetchSpy = vi.spyOn(clientModule, "bffFetch").mockResolvedValue({
        data: {
          receipt: {
            receipt_id: "rcp-test-create-001",
            command_id: "cmd-test-create-001",
            source_instance_id: "ds-test-create",
            command_type: "create",
            status: "succeeded",
          },
        },
      } as any);

      try {
        const receipt = await managementDataSourceWrites.createDataSource({
          source_instance_id: "ds-test-create",
          definition_id: "twse-openapi-daily",
          provider: "TWSE",
          source_class: "market_daily",
          secret_scope: "env_isolated",
          license_scope: "official_reference",
          connector_config: {
            public: { endpoint: "https://openapi.twse.com.tw" },
            secret_ref_id: "vault://secret/twse",
          },
        });

        expect(receipt.receipt_id).toBe("rcp-test-create-001");
        expect(bffFetchSpy).toHaveBeenCalled();
        const calledReq = bffFetchSpy.mock.calls[0][0];
        expect(calledReq.method).toBe("POST");
        expect(calledReq.path).toBe("/bff/management/data-sources");
        expect((calledReq.body as any).secret_scope).toBe("env_isolated");
        expect((calledReq.body as any).source_instance_id).toBe("ds-test-create");
        expect((calledReq.body as any).license_scope).toBe("official_reference");
      } finally {
        liveGateSpy.mockRestore();
        bffFetchSpy.mockRestore();
        liveStatusModule.liveStatus._reset();
      }
    });

    it("transports replaceDataSource payload without migrate_dependents", async () => {
      const writeGateModule = await import("./writeGate");
      const clientModule = await import("./client");
      const liveStatusModule = await import("./liveStatus");
      liveStatusModule.liveStatus._reset({ mode: "live", effective: "live" });
      const liveGateSpy = vi.spyOn(writeGateModule, "liveWriteGated").mockResolvedValue(true);
      const bffFetchSpy = vi.spyOn(clientModule, "bffFetch").mockResolvedValue({
        data: {
          receipt: {
            receipt_id: "rcp-test-replace-001",
            command_id: "cmd-test-replace-001",
            source_instance_id: "ds-test-old",
            command_type: "replace",
            status: "succeeded",
          },
        },
      } as any);

      try {
        const receipt = await managementDataSourceWrites.replaceDataSource({
          sourceInstanceId: "ds-test-old",
          expectedRevision: 2,
          reason: "Upgrading to v2",
          confirmation: true,
          replacementSourceId: "ds-test-new",
        });

        expect(receipt.receipt_id).toBe("rcp-test-replace-001");
        expect(bffFetchSpy).toHaveBeenCalled();
        const calledReq = bffFetchSpy.mock.calls[0][0];
        expect(calledReq.method).toBe("POST");
        expect(calledReq.path).toBe("/bff/management/data-sources/ds-test-old/actions/replace");
        expect((calledReq.body as any).replacement_source_id).toBe("ds-test-new");
        expect((calledReq.body as any).expected_revision).toBe(2);
        expect((calledReq.body as any).confirmation).toBe(true);
        expect((calledReq.body as any).reason).toBe("Upgrading to v2");
        expect((calledReq.body as any).migrate_dependents).toBeUndefined();
      } finally {
        liveGateSpy.mockRestore();
        bffFetchSpy.mockRestore();
        liveStatusModule.liveStatus._reset();
      }
    });
  });

  describe("direct V2-preserving and legacy projection adapters", () => {
    it("preserves full V2 structures and allowedActions through adaptDataSourceV2OrLegacy", async () => {
      const { adaptDataSourceV2OrLegacy } = await import("./managementConsoleReads");

      const rawV2 = {
        schema_version: "management_data_source.v2",
        source_instance_id: "ds-preserve-v2",
        connector_id: "conn-twse-market",
        provider: "TWSE",
        source_class: "market_daily",
        definition: {
          definition_id: "conn-twse-market",
          adapter_token: "TwseAdapter.records_from_payload",
          adapter_version: "1.2.0",
          provider: "TWSE",
          definition_state: "supported",
          datasets: ["tw_price_daily"],
          markets: ["TW"],
        },
        instance: {
          data_source_id: "ds-preserve-v2",
          source_kind: "data_source",
          definition_id: "conn-twse-market",
          connector_id: "conn-twse-market",
          provider: "TWSE",
          source_class: "market_daily",
          lifecycle_state: "enabled",
          revision: 3,
        },
        desired: {
          source_instance_id: "ds-preserve-v2",
          revision: 3,
          desired_lifecycle: "enabled",
          connector_config: {
            public: { endpoint: "https://openapi.twse.com.tw" },
            secret_ref_id: "vault://secret/twse-api-key",
          },
          schedule: {
            enabled: true,
            cadence: "0 19 * * 1-5",
            timezone: "Asia/Taipei",
          },
        },
        observed: {
          source_instance_id: "ds-preserve-v2",
          desired_revision: 3,
          observed_revision: 3,
          reconciliation_status: "converged",
          effective_lifecycle: "enabled",
          health_state: "healthy",
          credential_state: "configured",
          validation_state: "passed",
          canary_state: "passed",
        },
        allowed_actions: {
          canValidate: true,
          canCanary: true,
          canEnable: false,
          canDisable: true,
          canDegrade: true,
          canResume: false,
          canChangeSchedule: true,
          canReplace: true,
          canRetire: false,
          blockedReasons: ["already_enabled"],
        },
      };

      const adapted = adaptDataSourceV2OrLegacy(rawV2, 0);
      expect(adapted).toBeDefined();
      expect("schema_version" in adapted && adapted.schema_version).toBe("management_data_source.v2");

      const v2 = adapted as typeof rawV2 & { allowedActions: typeof rawV2.allowed_actions };
      expect(v2.source_instance_id).toBe("ds-preserve-v2");
      expect(v2.provider).toBe("TWSE");
      expect(v2.definition.adapter_token).toBe("TwseAdapter.records_from_payload");
      expect(v2.instance.revision).toBe(3);
      expect(v2.desired.schedule?.cadence).toBe("0 19 * * 1-5");
      expect(v2.observed.reconciliation_status).toBe("converged");
      expect(v2.allowed_actions.canDisable).toBe(true);
      expect(v2.allowed_actions.canEnable).toBe(false);
      expect(v2.allowedActions.canChangeSchedule).toBe(true);
    });

    it("projects V2 DTO to legacy SystemDataSourceRecord accurately", async () => {
      const { v2ToLegacyRecord } = await import(
        "@/management/pages/oversight/dataSources/dataSourceModels"
      );

      const v2Dto = {
        schema_version: "management_data_source.v2" as const,
        source_instance_id: "ds-proj-test",
        connector_id: "conn-shioaji",
        provider: "Shioaji",
        source_class: "broker_realtime",
        definition: {
          definition_id: "conn-shioaji",
          adapter_token: "ShioajiAdapter.stream",
          provider: "Shioaji",
          definition_state: "supported",
        },
        instance: {
          data_source_id: "ds-proj-test",
          source_kind: "data_source",
          definition_id: "conn-shioaji",
          connector_id: "conn-shioaji",
          provider: "Shioaji",
          source_class: "broker_realtime",
          lifecycle_state: "enabled",
          revision: 2,
          markets: ["TW"],
          datasets: ["tw_orderbook"],
        },
        desired: {
          source_instance_id: "ds-proj-test",
          revision: 2,
          desired_lifecycle: "enabled",
          schedule: { enabled: true },
        },
        observed: {
          source_instance_id: "ds-proj-test",
          desired_revision: 2,
          observed_revision: 2,
          effective_lifecycle: "enabled",
          health_state: "healthy",
          credential_state: "configured",
          dependent_refs: ["persona-alpha-arb"],
          freshness: {
            last_success_at: "2026-08-25T05:00:00Z",
          },
          last_run: {
            evidence_bundle_id: "ev-shioaji-001",
          },
        },
        allowed_actions: {
          canValidate: true,
          canCanary: false,
          canEnable: false,
          canDisable: true,
          canDegrade: true,
          canResume: false,
          canChangeSchedule: true,
          canReplace: true,
          canRetire: false,
          blockedReasons: [],
        },
        allowedActions: {
          canValidate: true,
          canCanary: false,
          canEnable: false,
          canDisable: true,
          canDegrade: true,
          canResume: false,
          canChangeSchedule: true,
          canReplace: true,
          canRetire: false,
          blockedReasons: [],
        },
      };

      const projected = v2ToLegacyRecord(v2Dto);
      expect(projected.providerKey).toBe("conn-shioaji");
      expect(projected.provider).toBe("Shioaji");
      expect(projected.status).toBe("enabled");
      expect(projected.tone).toBe("ok");
      expect(projected.credentialState).toBe("configured");
      expect(projected.liveIngestionEnabled).toBe(true);
      expect(projected.readOnly).toBe(true);
      expect(projected.consumerPersonaIds).toEqual(["persona-alpha-arb"]);
      expect(projected.evidenceRefs).toEqual(["ev-shioaji-001"]);
    });

    it("adapts minimal/partial V2 payloads without synthetic positive truth fallbacks", async () => {
      const { adaptDataSourceV2OrLegacy } = await import("./managementConsoleReads");

      const partialV2 = {
        schema_version: "management_data_source.v2",
        source_instance_id: "ds-partial-01",
      };

      const adapted = adaptDataSourceV2OrLegacy(partialV2, 0);
      expect(adapted).toBeDefined();
      expect("schema_version" in adapted && adapted.schema_version).toBe("management_data_source.v2");

      const v2 = adapted as import("./managementDataSources").ManagementDataSourceV2DTO;
      expect(v2.source_instance_id).toBe("ds-partial-01");
      expect(v2.provider).toBe("unknown");
      expect(v2.definition.definition_state).toBe("unknown");
      expect(v2.definition.adapter_token).toBe("unknown");
      expect(v2.instance.lifecycle_state).toBe("unknown");
      expect(v2.instance.revision).toBe(0);
      expect(v2.desired.desired_lifecycle).toBe("unknown");
      expect(v2.desired.revision).toBe(0);
      expect(v2.observed.effective_lifecycle).toBe("unknown");
      expect(v2.observed.health_state).toBe("unknown");
      expect(v2.observed.reconciliation_status).toBe("unknown");
      expect(v2.observed.credential_state).toBe("unknown");
    });

    it("projects partial V2 record to legacy record without positive defaults", async () => {
      const { v2ToLegacyRecord } = await import(
        "@/management/pages/oversight/dataSources/dataSourceModels"
      );

      const partialV2Dto = {
        schema_version: "management_data_source.v2" as const,
        source_instance_id: "ds-partial-02",
        connector_id: "conn-partial",
        provider: "PartialProvider",
        source_class: "market",
        definition: {
          definition_id: "conn-partial",
          adapter_token: "unknown",
          provider: "PartialProvider",
          definition_state: "unknown" as const,
        },
        instance: {
          data_source_id: "ds-partial-02",
          source_kind: "data_source",
          definition_id: "conn-partial",
          connector_id: "conn-partial",
          provider: "PartialProvider",
          source_class: "market",
          lifecycle_state: "unknown" as const,
          revision: 0,
        },
        desired: {
          source_instance_id: "ds-partial-02",
          revision: 0,
          desired_lifecycle: "unknown" as const,
        },
        observed: {
          source_instance_id: "ds-partial-02",
          effective_lifecycle: "unknown" as const,
          health_state: "unknown" as const,
          reconciliation_status: "unknown" as const,
        },
        allowed_actions: {
          canValidate: false,
          canCanary: false,
          canEnable: false,
          canDisable: false,
          canDegrade: false,
          canResume: false,
          canChangeSchedule: false,
          canReplace: false,
          canRetire: false,
          blockedReasons: [],
        },
        allowedActions: {
          canValidate: false,
          canCanary: false,
          canEnable: false,
          canDisable: false,
          canDegrade: false,
          canResume: false,
          canChangeSchedule: false,
          canReplace: false,
          canRetire: false,
          blockedReasons: [],
        },
      };

      const projected = v2ToLegacyRecord(partialV2Dto);
      expect(projected.providerKey).toBe("conn-partial");
      expect(projected.provider).toBe("PartialProvider");
      expect(projected.status).toBe("unknown");
      expect(projected.tone).toBe("muted");
      expect(projected.credentialState).toBe("unknown");
      expect(projected.liveIngestionEnabled).toBe(false);
    });
  });
});
