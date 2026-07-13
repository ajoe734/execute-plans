import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { agoraCopy } from "./i18n";
import en from "@/i18n/locales/en-US";
import zh from "@/i18n/locales/zh-TW";

const operatorComponents = import.meta.glob("./**/*.tsx", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const forbiddenAuditLiterals = [
  "Trading Servant Proposal",
  "All Strategies",
  "Live workshops",
  "Position Actions",
  "Strategy Performance",
  "部分可用",
  "資料狀態需確認:",
  "個 View",
];

describe("Agora locale policy", () => {
  it("never exposes a missing raw i18n key", () => {
    const keyReturningT = ((key: string) => key) as TFunction;
    expect(agoraCopy(keyReturningT, "agora.tradingRoom.missing", "Safe fallback")).toBe("Safe fallback");
  });

  it("keeps Trading Room proposal catalogs in zh-TW/en-US parity", () => {
    expect(Object.keys(zh.agora.shell.bottom)).toEqual(Object.keys(en.agora.shell.bottom));
    expect(Object.keys(zh.agora.shell.servant)).toEqual(Object.keys(en.agora.shell.servant));
    expect(Object.keys(zh.agora.tradingRoom.views)).toEqual(Object.keys(en.agora.tradingRoom.views));
    expect(Object.keys(zh.agora.tradingRoom.warnings)).toEqual(Object.keys(en.agora.tradingRoom.warnings));
    expect(Object.keys(zh.agora.tradingRoom.reasons)).toEqual(Object.keys(en.agora.tradingRoom.reasons));
    expect(Object.keys(zh.agora.tradingRoom.page)).toEqual(Object.keys(en.agora.tradingRoom.page));
    expect(Object.keys(zh.agora.performance)).toEqual(Object.keys(en.agora.performance));
    expect(Object.keys(zh.agora.workshop)).toEqual(Object.keys(en.agora.workshop));
  });

  it("rejects the mixed-language literals found by the hosted audit", () => {
    for (const [path, source] of Object.entries(operatorComponents)) {
      if (path.endsWith(".test.tsx")) continue;
      for (const literal of forbiddenAuditLiterals) {
        expect(source, `${path} contains forbidden operator copy: ${literal}`).not.toContain(literal);
      }
    }
  });
});
