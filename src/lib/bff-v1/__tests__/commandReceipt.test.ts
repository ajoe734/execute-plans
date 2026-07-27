import { describe, expect, it } from "vitest";
import { commandBatchReceiptDescription, commandReceiptDescription } from "../commandReceipt";

describe("commandReceiptDescription", () => {
  it("surfaces audit receipt ids from legacy mutation results", () => {
    expect(commandReceiptDescription({
      audit: {
        id: "au_1001",
        outcome: "ok",
        correlationId: "corr_abc",
        idempotencyKey: "idem_123",
      },
    })).toBe("command/audit au_1001 · status ok · corr corr_abc · idem idem_123");
  });

  it("surfaces command ids from command envelopes", () => {
    expect(commandReceiptDescription({
      ok: true,
      data: { actionId: "cmd_abc123", status: "accepted" },
      correlationId: "corr_xyz",
      idempotencyKey: "idem_xyz",
    })).toBe("command/audit cmd_abc123 · status accepted · corr corr_xyz · idem idem_xyz");
  });

  it("summarizes batch receipts without hiding the last receipt id", () => {
    expect(commandBatchReceiptDescription([
      { auditEventId: "au_1", correlationId: "corr_1" },
      { auditEventId: "au_2", correlationId: "corr_2" },
    ])).toBe("2 command receipts · command/audit au_2 · corr corr_2");
  });
});
