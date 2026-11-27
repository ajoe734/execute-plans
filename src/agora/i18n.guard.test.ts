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
  "部分可用",
  "資料狀態需確認:",
  "個 View",
];

function collectLeafKeyPaths(node: unknown, prefix: string): string[] {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return [prefix];
  }
  const paths: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    paths.push(...collectLeafKeyPaths(value, `${prefix}.${key}`));
  }
  return paths;
}

describe("Agora locale policy", () => {
  it("never exposes a missing raw i18n key", () => {
    const keyReturningT = ((key: string) => key) as TFunction;
    expect(agoraCopy(keyReturningT, "agora.tradingRoom.missing", "Safe fallback")).toBe("Safe fallback");
  });

  it("keeps Trading Room proposal catalogs in zh-TW/en-US parity", () => {
    expect(Object.keys(zh.agora.tradingRoom.views)).toEqual(Object.keys(en.agora.tradingRoom.views));
    expect(Object.keys(zh.agora.tradingRoom.warnings)).toEqual(Object.keys(en.agora.tradingRoom.warnings));
    expect(Object.keys(zh.agora.tradingRoom.reasons)).toEqual(Object.keys(en.agora.tradingRoom.reasons));
  });

  it("keeps agora.shell in exact zh-TW/en-US key parity with zero dead keys and full shell string coverage", () => {
    const zhShellKeys = collectLeafKeyPaths(zh.agora.shell, "agora.shell");
    const enShellKeys = collectLeafKeyPaths(en.agora.shell, "agora.shell");
    expect(zhShellKeys).toEqual(enShellKeys);
    expect(zhShellKeys.length).toBeGreaterThan(30);

    const shellSource = operatorComponents["./TradingDeskLayout.tsx"] ?? "";
    expect(shellSource.length).toBeGreaterThan(0);

    for (const key of zhShellKeys) {
      expect(
        shellSource,
        `agora.shell key ${key} must be referenced by TradingDeskLayout.tsx (no dead keys allowed)`,
      ).toContain(key);
    }

    const forbiddenShellLiterals = [
      "Agora Servant",
      "Ask AI",
      "Chat with AI",
      "問 AI",
      '"Persona Lab"',
      '"Jobs"',
      '"Sign out"',
      "Open servant drawer",
      "Close servant drawer",
    ];
    for (const literal of forbiddenShellLiterals) {
      expect(
        shellSource,
        `TradingDeskLayout.tsx contains forbidden hardcoded shell literal: ${literal}`,
      ).not.toContain(literal);
    }
  });

  it("rejects the mixed-language literals found by the hosted audit", () => {
    for (const [path, source] of Object.entries(operatorComponents)) {
      for (const literal of forbiddenAuditLiterals) {
        expect(source, `${path} contains forbidden operator copy: ${literal}`).not.toContain(literal);
      }
    }
  });
});
