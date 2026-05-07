import { describe, it, expect, beforeEach } from "vitest";
import {
  ERROR_CODES,
  isErrorCode,
  errorI18nKey,
  DISABLED_REASON_CODES,
  isDisabledReasonCode,
  disabledReasonI18nKey,
} from "../errorCodes";
import { fetchMe, invalidateMe, mockMe, hasCapability } from "../session/me";

describe("Pack D Batch II — errorCodes", () => {
  it("ERROR_CODES contains 23 canonical entries", () => {
    expect(ERROR_CODES.length).toBe(23);
    expect(new Set(ERROR_CODES).size).toBe(23);
  });
  it("isErrorCode narrows correctly", () => {
    expect(isErrorCode("VALIDATION_FAILED")).toBe(true);
    expect(isErrorCode("nope")).toBe(false);
  });
  it("errorI18nKey uses errors.* namespace", () => {
    expect(errorI18nKey("PERMISSION_DENIED")).toBe("errors.PERMISSION_DENIED");
  });
  it("DisabledReasonCode set has 15 entries", () => {
    expect(DISABLED_REASON_CODES.length).toBe(15);
    expect(isDisabledReasonCode("COOLDOWN_ACTIVE")).toBe(true);
    expect(disabledReasonI18nKey("STATE_INVALID")).toBe("disabledReasons.STATE_INVALID");
  });
});

describe("Pack D Batch II — MeResponse mock", () => {
  beforeEach(() => invalidateMe());
  it("mockMe returns a complete DTO", () => {
    const me = mockMe();
    expect(me.user.id).toBeTruthy();
    expect(me.tenant.locale).toBe("zh-TW");
    expect(me.permissionsVersion).toBeTruthy();
    expect(me.serverTime).toBeTruthy();
  });
  it("fetchMe caches within 30s window", async () => {
    const a = await fetchMe();
    const b = await fetchMe();
    expect(a).toBe(b);
  });
  it("hasCapability checks list membership", () => {
    const me = mockMe();
    expect(hasCapability(me, "strategy.create")).toBe(true);
    expect(hasCapability(me, "nonexistent.cap")).toBe(false);
    expect(hasCapability(null, "strategy.create")).toBe(false);
  });
});
