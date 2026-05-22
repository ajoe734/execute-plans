# Pack PM-i18n — Management Revamp 中英文化收尾

範圍：只動 PM-1..PM-11 在 2026-05-21~22 新增/修改的 management 檔案，以及 v5/management seed 中需要被翻譯的 label。不動 v4 normative、Pack D、Agora、BFF DTO。

## 1. 目標

1. 消滅 PM-1..PM-11 新檔案內的 ~64 個 hardcoded English 字串。
2. 補齊 `t("…")` 引用但字典缺失的 19 個 key。
3. en-US / zh-TW 1:1 對齊（`scripts/check-i18n.ts` asymmetry = 0、missing = 0）。
4. 加上 CI guard：`src/management/**` 的 hardcoded 候選 = 0，違反即 fail build。

## 2. i18n key namespace（新增）

統一掛在 `mgmt.*` 命名空間下，與既有 `nav.*` / `groups.*` / `page.*` 共存：

```text
mgmt.cockpit.*           SystemStateStrip / LoopFlowMap / PersonaOodaMatrix / CriticalAnomalyPanel 標題與 label
mgmt.anomaly.*           severity / domain / why / action / manage / evidence / nextAction / evidenceMissing / noAction
mgmt.humanInbox.*        9 kinds 顯示名 + detail page 區塊 label + decision/TTL/signatures
mgmt.readiness.*         checklist / blockers / evidencePacket / header / nextAction
mgmt.nl.*                drawer title / placeholder / status / strict-mode error / explain intents
mgmt.personaIntent.*     summary / redacted / restricted / disclaimer
mgmt.tradingPulse.*      8 ranking blocks 名稱 + baseline labels (12 enum)
mgmt.loopFlow.*          10 OODA node names + 10 edge labels
mgmt.ooda.*              5 phase 名稱
mgmt.actions.*           manage / viewEvidence / decide / acknowledge / runEval 共用按鈕
```

每個 key en-US 與 zh-TW 同步落地。

## 3. 變更清單

### 3.1 字典（必改）

- `src/i18n/locales/en-US.ts` — 新增 `mgmt.*` 子樹（預估 ~140 keys）+ 補 19 missing keys（如 `approval`, `confirm`, `v5.loops.research` 等）。
- `src/i18n/locales/zh-TW.ts` — 1:1 對應翻譯。

### 3.2 元件/頁面（共 ~12 檔，全部把 hardcoded 字串換成 `t(...)`）

| 檔案 | 目前 hardcoded 數 |
|---|---|
| `src/management/pages/oversight/_core.tsx` | 34 |
| `src/management/pages/oversight/HumanGateDetail.tsx` | 10 |
| `src/management/components/anomaly/AnomalyCard.tsx` | 6 |
| `src/management/components/readiness/{Blockers,EvidencePacket,Checklist,Header}.tsx` | 5 |
| `src/management/pages/oversight/Ep5CanaryReadiness.tsx` | 4 |
| `src/management/pages/oversight/NlConsole.tsx` | 2 |
| `src/management/components/cockpit/PersonaOodaMatrix.tsx` | 1 |
| `src/management/components/cockpit/CriticalAnomalyPanel.tsx` | 1 |
| `src/management/components/nl/NlAssistantDrawer.tsx` | 1 |
| `src/management/pages/oversight/PersonaIntentTraces.tsx` | 1 |
| 其餘 cockpit/anomaly 元件少量殘留 | ~ |

每個檔案加 `import { useTranslation } from "react-i18next"` 並把 JSX text node 換為 `{t("mgmt.xxx.yyy")}`。

### 3.3 Seed 層（v5/management）— 引入 i18n key 而非翻譯字串

Seed 不能直接呼叫 `t()`（純函式 + 測試友善），改用「key 引用」模式：

- `src/lib/v5/management/anomaly.ts`：`ManagementAnomaly` 新增 optional `titleKey` / `whyKey` / `recommendedActionKey`；現有 `title/why/recommendedAction` 維持當 fallback。
- `src/lib/v5/management/readinessSeeds.ts`：checklist item / blocker reason 一律改為 key reference。
- `src/lib/v5/management/cockpit.ts`：loop node / matrix phase label 改為 key reference。
- `src/lib/v5/management/humanInbox.ts`：9 kinds label 改為 key reference。
- `src/lib/v5/management/tradingRankings.ts`：8 ranking blocks + 12 baseline 改為 key reference。

UI 端：`label = item.titleKey ? t(item.titleKey) : item.title`。

### 3.4 CI guard

- 擴充 `scripts/check-i18n.ts`：新增 `STRICT_DIRS=["src/management"]`，於該範圍下：
  - hardcoded 候選 > 0 → `process.exit(1)`
  - missing key > 0 → `process.exit(1)`
  - asymmetry > 0 → `process.exit(1)`
- 其餘 src/ 維持 informational（不影響舊有行為）。

### 3.5 測試

- 新增 `src/lib/v5/management/__tests__/i18nParity.test.ts`：
  - 斷言所有 seed 內 `*Key` 欄位存在於 en-US 與 zh-TW 字典中。
  - 斷言 `mgmt.*` 子樹兩語系 key 集合相等。
- 既有 525 vitest 必須續綠。

### 3.6 文件

- `.lovable/audits/mgmt-revamp-2026-05-20-plan.md`：新增「PM-i18n LANDED 2026-05-22」段落。
- `mem://index.md` Core 不需更新（已涵蓋 mgmt 範圍）。

## 4. 不做（明確排除）

- 不改 Agora、不改 v4/Pack D。
- 不引入新 i18n library / 不改 namespace 分割策略。
- 不重寫既有 nav/groups/page keys（值已正確）。
- 不接 AI 翻譯，所有 zh-TW 由人工/規範用語對照表手動產出（保持與既有風格一致：例如 "Manage" → 「管理」、"Evidence" → 「證據」、"Persona" 保留英文）。

## 5. 驗收閘門

- `bunx tsx scripts/check-i18n.ts` → missing=0、asymmetry=0、`src/management/**` hardcoded=0。
- `bunx vitest run` → 全綠（含新 parity test）。
- `bunx tsx scripts/check-management-naming.ts` → 0 hits（既有 guard 不退化）。
- 手動 smoke：`/management/cockpit` 切換 zh-TW ↔ en-US，所有文字翻譯，無 raw key 漏出。

## 6. 預估規模

- 修改：~12 個 component 檔 + 5 個 seed 檔 + 2 個 locale 檔 + 1 個 check 腳本。
- 新增：1 個 parity test。
- 新 i18n key：~140（en + zh 對稱）+ 19 missing 修復。

確認後我會一次性落地，不再分批。
