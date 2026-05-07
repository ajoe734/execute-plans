// E3 follow-up — research loop derivation + B3 H2 i18n strings.
import { describe, it, expect } from "vitest";
import { legacyBff as bff } from "@/lib/bff-v1";
import { ERROR_CODES, errorI18nKey } from "@/lib/v4/errorCodes";
import enUS from "@/i18n/locales/en-US";
import zhTW from "@/i18n/locales/zh-TW";

describe("E3 research loop derivation", () => {
  it("emits research LoopRuns with Design→Collect→Analyze→Review stages", async () => {
    const r = await bff.v5.loops.list("research");
    expect(r.items.length).toBeGreaterThan(0);
    const run = r.items[0];
    expect(run.loopKind).toBe("research");
    expect(run.stages.map((s) => s.name)).toEqual(["Design", "Collect", "Analyze", "Review"]);
    expect(run.subjectKind).toBe("research");
  });

  it("review-status experiment surfaces awaiting_human_decision", async () => {
    const r = await bff.v5.loops.list("research");
    const review = r.items.find((x) => x.nextAction?.kind === "awaiting_human_decision");
    if (review) expect(review.nextAction?.label).toBe("Reviewer decision");
  });
});

describe("B3 H2 — error i18n strings", () => {
  const enErrors = (enUS as { errors: Record<string, string> }).errors;
  const zhErrors = (zhTW as { errors: Record<string, string> }).errors;

  it("covers every Pack D D21 ErrorCode in en-US and zh-TW", () => {
    for (const code of ERROR_CODES) {
      const key = errorI18nKey(code);
      expect(key).toBe(`errors.${code}`);
      expect(enErrors[code], `en-US missing errors.${code}`).toBeTruthy();
      expect(zhErrors[code], `zh-TW missing errors.${code}`).toBeTruthy();
    }
  });
});
