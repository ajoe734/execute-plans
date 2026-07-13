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
  "目前權限或範圍無法讀取這個操盤室提案。",
  "這個操盤室提案或工作區已不存在，請重新產生。",
  "操盤室提案狀態已變更，請重新產生後再套用。",
  "操盤室狀態已過期，請重新整理後再繼續。",
  "交易操盤室生成功能尚未在目前 BFF 啟用。",
  "重新產生",
  "新增 Widget",
  "交代僕人修改",
  "複製 Widget",
  "移除 Widget",
  "換一種圖表",
  "離開調整",
  "調整版面",
  "可還原 Widget",
  "請先儲存或放棄未儲存的版面調整，再建立 Widget Revision Proposal。",
  "目前權限或範圍無法建立這個 Widget revision proposal。",
  "這個 Workspace、View 或 Widget 已不存在，請重新整理後再試。",
  "Workspace 版本已過期，請重新整理後再套用。",
  "Widget revision proposal 未通過驗證。",
  "BFF 回傳的 Widget revision proposal 格式不完整。",
  'title="Redacted Summary"',
  'title="Attachments"',
  'label: "Strategy title"',
  'label: "Patch proposal"',
  'title="Causal Chain"',
  'title="Explicit Definitions"',
  'title="Servant Inferences"',
  "Needs confirmation",
  'title="Uncertainties"',
  'title="Contradictions"',
  'title="Proposed Next Actions"',
  'label: "Overall grade"',
  'label: "Research ready"',
  'label: "Change"',
  'title="Dimension Updates"',
  'title="Blockers"',
  'title="Readiness Gates"',
  'label: "Gap"',
  'label: "Category"',
  'label: "Severity"',
  'label: "Can defer"',
  'title="Missing Definition"',
  'title="Why It Matters"',
  'title="Blocked Capabilities"',
  'title="Temporary Assumption"',
  'title="Answer Options"',
  'title="Deferral Consequence"',
  'label: "Freeform"',
  'label: "Defer"',
  'title="Why Now"',
  'title="Score Components"',
  'title="Defer Consequence"',
  'label: "Run"',
  'label: "Plan"',
  'label: "Stage"',
  'label: "Status"',
  'label: "Backend"',
  'title="Warnings"',
  'title="Blocking Reasons"',
  'title="Metrics"',
  "Threshold",
  'title="Findings"',
  'label: "Outcome"',
  'label: "Data cutoff"',
  'title="Artifacts"',
  'title="Recommended Patch Proposals"',
  'label: "Proposal"',
  'label: "Base version"',
  'label: "Validation"',
  'title="Change Summary"',
  'title="Rationale"',
  'title="Predicted Effects"',
  'label: "Base"',
  'label: "Candidate"',
  'label: "Recommendation"',
  'title="Field Diffs"',
  'title="Metric Diffs"',
  'title="Risk Diffs"',
  'title="Readiness Diffs"',
  'title="Limitations"',
  'label: "Highest ready gate"',
  'label: "Staleness"',
  'title="Requirement States"',
  'title="Hard Blockers"',
  'title="Temporary Assumptions"',
  'title="Chart Spec"',
  'label: "Kind"',
  'label: "Renderer"',
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
    expect(Object.keys(zh.agora.tradingRoom.widgets)).toEqual(Object.keys(en.agora.tradingRoom.widgets));
    expect(Object.keys(zh.agora.tradingRoom.warnings)).toEqual(Object.keys(en.agora.tradingRoom.warnings));
    expect(Object.keys(zh.agora.tradingRoom.reasons)).toEqual(Object.keys(en.agora.tradingRoom.reasons));
    expect(Object.keys(zh.agora.tradingRoom.page)).toEqual(Object.keys(en.agora.tradingRoom.page));
    expect(Object.keys(zh.agora.tradingRoom.drawer)).toEqual(Object.keys(en.agora.tradingRoom.drawer));
    expect(Object.keys(zh.agora.performance)).toEqual(Object.keys(en.agora.performance));
    expect(Object.keys(zh.agora.workshop)).toEqual(Object.keys(en.agora.workshop));

    function checkSymmetry(obj1: any, obj2: any, path = "") {
      if (typeof obj1 !== typeof obj2) {
        throw new Error(`Type mismatch at ${path}`);
      }
      if (obj1 && typeof obj1 === "object" && !Array.isArray(obj1)) {
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();
        expect(keys1, `Symmetry keys mismatch at path: ${path}`).toEqual(keys2);
        for (const k of keys1) {
          checkSymmetry(obj1[k], obj2[k], path ? `${path}.${k}` : k);
        }
      }
    }
    checkSymmetry(zh.agora, en.agora, "agora");
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
