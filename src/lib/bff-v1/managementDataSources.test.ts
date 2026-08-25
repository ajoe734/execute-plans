import { describe, expect, it, vi } from "vitest";
import {
  assertNoRawSecrets,
  managementDataSourceReads,
  managementDataSourceWrites,
} from "./managementDataSources";

describe("managementDataSources client", () => {
  describe("assertNoRawSecrets", () => {
    it("allows vault:// and env:// secret references", () => {
      expect(() =>
        assertNoRawSecrets({
          secret_ref_id: "vault://secret/market-data-key",
          apiKey: "env://MARKET_DATA_API_KEY",
        }),
      ).not.toThrow();
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
    });

    it("allows empty secret strings and normal configuration parameters", () => {
      expect(() =>
        assertNoRawSecrets({
          endpoint_url: "https://openapi.twse.com.tw",
          timeout_seconds: 15,
          secret: "",
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

  describe("managementDataSourceWrites", () => {
    it("creates data source in configured_disabled state in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.createDataSource({
        source_instance_id: "ds-test-create",
        definition_id: "twse-openapi-daily",
        provider: "TWSE",
        source_class: "market_daily",
        connector_config: {
          public: { endpoint: "https://openapi.twse.com.tw" },
          secret_ref_id: "vault://secret/twse",
        },
      });

      expect(receipt).toBeDefined();
      expect(receipt.source_instance_id).toBe("ds-test-create");
      expect(receipt.command_type).toBe("create");
      expect(receipt.status).toBe("succeeded");
    });

    it("validates data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.validateDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 1,
        reason: "Validating test source",
      });
      expect(receipt.command_type).toBe("validate");
      expect(receipt.status).toBe("succeeded");
    });

    it("canaries data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.canaryDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 1,
        reason: "Canary pull test",
      });
      expect(receipt.command_type).toBe("canary");
      expect(receipt.status).toBe("succeeded");
    });

    it("enables data source with explicit confirmation in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.enableDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 1,
        reason: "Operator enabling tested source",
        confirmation: true,
      });
      expect(receipt.command_type).toBe("enable");
      expect(receipt.after_revision).toBe(2);
    });

    it("disables data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.disableDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 2,
        reason: "Operator disabling source for maintenance",
      });
      expect(receipt.command_type).toBe("disable");
    });

    it("degrades data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.degradeDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 3,
        reason: "Degrading due to latency",
      });
      expect(receipt.command_type).toBe("degrade");
    });

    it("resumes data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.resumeDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 4,
        reason: "Resuming source",
      });
      expect(receipt.command_type).toBe("resume");
    });

    it("updates schedule in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.changeSchedule({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 5,
        reason: "Changing cadence to hourly",
        schedule: {
          enabled: true,
          cadence: "0 * * * *",
          timezone: "Asia/Taipei",
        },
      });
      expect(receipt.command_type).toBe("change_schedule");
    });

    it("replaces data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.replaceDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 6,
        reason: "Replacing with v2",
        confirmation: true,
        replacementSourceId: "ds-twse-v2",
      });
      expect(receipt.command_type).toBe("replace");
    });

    it("retires data source in mock fallback", async () => {
      const receipt = await managementDataSourceWrites.retireDataSource({
        sourceInstanceId: "ds-test-create",
        expectedRevision: 7,
        reason: "Decommissioning",
        confirmation: true,
      });
      expect(receipt.command_type).toBe("retire");
    });
  });
});
