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

/**
 * Agora trading-room and performance sources whose static `t("agora.…")`
 * keys must resolve in both zh-TW and en-US. A missing key would otherwise
 * render the raw key path (e.g. "agora.tradingRoom.editor.enterEditMode").
 */
const tradingRoomAndPerformanceSources = {
  ...(import.meta.glob(
    [
      "./TradingDeskLayout.tsx",
      "./drawers/**/*.tsx",
      "./pages/trading-room/**/*.tsx",
      "./trading-room/**/*.tsx",
      "./pages/strategy-performance/**/*.tsx",
      "./pages/strategy-workshop/**/*.tsx",
      "./widgets/**/*.tsx",
      "./components/*.tsx",
      "!./**/*.test.tsx",
    ],
    { eager: true, import: "default", query: "?raw" },
  ) as Record<string, string>),
};

const PLURAL_SUFFIXES = ["", "_zero", "_one", "_two", "_few", "_many", "_other"];

function resolveLeaf(catalog: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, catalog);
}

function hasTranslation(catalog: unknown, key: string): boolean {
  return PLURAL_SUFFIXES.some((suffix) => typeof resolveLeaf(catalog, `${key}${suffix}`) === "string");
}

export function staticAgoraKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const match of source.matchAll(/\b(?:t|workshopCopy)\(\s*["'](agora\.[A-Za-z0-9_.]+)["']/g)) {
    keys.add(match[1]);
  }
  return [...keys];
}

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

  it("keeps agora.drawers in exact zh-TW/en-US key parity with zero dead keys across global drawer sources", () => {
    const zhDrawerKeys = collectLeafKeyPaths(zh.agora.drawers, "agora.drawers");
    const enDrawerKeys = collectLeafKeyPaths(en.agora.drawers, "agora.drawers");
    expect(zhDrawerKeys).toEqual(enDrawerKeys);
    expect(zhDrawerKeys.length).toBeGreaterThan(80);

    const drawerBundleSource = [
      operatorComponents["./TradingDeskLayout.tsx"] ?? "",
      operatorComponents["./drawers/GlobalDrawers.tsx"] ?? "",
      operatorComponents["./drawers/ServantCorrectionSection.tsx"] ?? "",
    ].join("\n");
    expect(drawerBundleSource.length).toBeGreaterThan(0);

    for (const key of zhDrawerKeys) {
      expect(
        drawerBundleSource,
        `agora.drawers key ${key} must be referenced by global drawer sources (no dead keys allowed)`,
      ).toContain(key);
    }
  });

  it("fails on any missing zh-TW or en-US key used by Agora trading-room or performance code", () => {
    const sources = Object.entries(tradingRoomAndPerformanceSources);
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "./trading-room/WorkspaceGridEditor.tsx",
        "./pages/trading-room/TradingRoomPage.tsx",
        "./pages/strategy-performance/StrategyPerformancePage.tsx",
        "./components/TradeDecisionCard.tsx",
        "./components/CandidateReviewDrawer.tsx",
      ]),
    );
    const missing: string[] = [];
    let checked = 0;
    for (const [path, source] of sources) {
      for (const key of staticAgoraKeys(source)) {
        checked += 1;
        if (!hasTranslation(zh, key)) missing.push(`${path}: zh-TW ${key}`);
        if (!hasTranslation(en, key)) missing.push(`${path}: en-US ${key}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it("detects a missing grid-editor key the way the guard scans source", () => {
    const sample = 'const a = t("agora.tradingRoom.editor.enterEditMode"); const b = t("agora.tradingRoom.editor.notARealKey");';
    const keys = staticAgoraKeys(sample);
    expect(keys).toEqual([
      "agora.tradingRoom.editor.enterEditMode",
      "agora.tradingRoom.editor.notARealKey",
    ]);
    expect(keys.filter((key) => !hasTranslation(zh, key))).toEqual(["agora.tradingRoom.editor.notARealKey"]);
  });

  it("keeps the grid-editor, live-queue, intent, candidate-review and rule-vs-human catalogs in parity", () => {
    for (const path of [
      "agora.tradingRoom.editor",
      "agora.tradingRoom.live",
      "agora.tradingRoom.mobile",
      "agora.tradingRoom.decisionCard",
      "agora.tradingRoom.intent",
      "agora.tradingRoom.candidateReview",
      "agora.tradingRoom.candidateContext",
      "agora.performance.ruleVsHuman",
      "agora.performance.shadow",
      "agora.workshop",
    ]) {
      expect(collectLeafKeyPaths(resolveLeaf(zh, path), path)).toEqual(
        collectLeafKeyPaths(resolveLeaf(en, path), path),
      );
    }
    for (const key of ["enterEditMode", "exitEditMode", "versionHistory", "restoreWidget"]) {
      expect(hasTranslation(zh, `agora.tradingRoom.editor.${key}`)).toBe(true);
      expect(hasTranslation(en, `agora.tradingRoom.editor.${key}`)).toBe(true);
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
