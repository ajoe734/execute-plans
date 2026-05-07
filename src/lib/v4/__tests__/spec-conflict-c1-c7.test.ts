// spec-conflict-G C1 + C7 regression tests.
import { describe, it, expect } from "vitest";
import {
  ERROR_CODES, isErrorCode, errorI18nKey,
  DISABLED_REASON_CODES, isDisabledReasonCode, disabledReasonI18nKey,
} from "@/lib/v4/errorCodes";
import { RISK_LEVELS as INTENT_RISK_LEVELS } from "@/lib/writeIntents/types";
import { RISK_LEVELS as BFF_RISK_LEVELS } from "@/lib/bff/types";

describe("spec-conflict-G C1 — RiskLevel 5-tier (Pack D D40)", () => {
  it("BFF RiskLevel includes info", () => {
    expect(BFF_RISK_LEVELS).toEqual(["info", "low", "medium", "high", "critical"]);
  });
  it("writeIntents RiskDefault matches BFF RiskLevel", () => {
    expect(INTENT_RISK_LEVELS).toEqual(BFF_RISK_LEVELS);
  });
});

describe("spec-conflict-G C7 — ErrorCode / DisabledReasonCode centralized", () => {
  it("ERROR_CODES enum contains canonical Pack D D21 entries", () => {
    for (const c of [
      "VALIDATION_FAILED", "PERMISSION_DENIED", "STATE_CONFLICT",
      "ILLEGAL_TRANSITION", "CONFIRM_TOKEN_REQUIRED", "TWO_MAN_REQUIRED",
      "COOLDOWN_ACTIVE", "IDEMPOTENCY_CONFLICT", "BACKEND_UNAVAILABLE",
    ]) {
      expect(ERROR_CODES).toContain(c);
      expect(isErrorCode(c)).toBe(true);
    }
    expect(isErrorCode("not_a_code")).toBe(false);
    expect(errorI18nKey("STATE_CONFLICT")).toBe("errors.STATE_CONFLICT");
  });
  it("DISABLED_REASON_CODES enum contains canonical Pack D D14 entries", () => {
    for (const c of [
      "PERMISSION_DENIED", "STATE_INVALID", "TWO_MAN_REQUIRED",
      "COOLDOWN_ACTIVE", "CONFIRM_TOKEN_REQUIRED", "ENV_RESTRICTED",
    ]) {
      expect(DISABLED_REASON_CODES).toContain(c);
      expect(isDisabledReasonCode(c)).toBe(true);
    }
    expect(disabledReasonI18nKey("PERMISSION_DENIED")).toBe("disabledReasons.PERMISSION_DENIED");
  });
});
