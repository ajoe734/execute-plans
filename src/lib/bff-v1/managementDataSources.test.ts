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
});
