
# 規劃團隊 34 條回覆：歸檔 + 落地實作計畫

## 一、歸檔（不改現有檔）

把上傳的 `Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md` 整份歸檔到：

```
.lovable/feedback/2026-05-07-planner-response/
  Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md   ← 原文
  INDEX.md                                                          ← 對照表 + 狀態
  Disposition.csv                                                   ← 34 條 × {priority, status, FE-action, owner}
```

並新增 memory：「34 條 Planner Response 已歸檔；A/B/C/D 全 RESOLVED_BY_CONTRACT，FE 端可開始落地 mock canonical，待 BFF endpoint 上線再翻 live。」

---

## 二、規劃團隊回覆審閱結果（issues）

整體 34 條接受、可行。發現 3 個需要回標給規劃團隊的點，**不阻塞 FE 開工**，先以 FE 現況為主、planner 為次紀錄差異：

| # | 衝突點 | FE 現況 | Planner 文 | 建議處理 |
|---|---|---|---|---|
| I1 | EvidenceKind 集合 | `audit/snapshot/incident/rebalance/deployment/experiment/postmortem/loop_run/sentinel_finding/intervention/ask_session`（11 種，含 v5 closed-loop） | `alert/incident/job/audit/metric/strategy/persona/deployment/runtime/policy/approval/artifact/signal/journal/postmortem`（15 種，缺 v5 三項） | FE 取 union（≈19 種）並標 `source: planner-2026-05-07 + v5-loop`，附 ticket 請 planner 在下一版 Permission Contract 合併 |
| I2 | RedactedEvidenceRef.reason | union 3 值（`PERMISSION_DENIED \| CAPABILITY_MISSING \| TENANT_SCOPE_MISMATCH`） | 單值 `INSUFFICIENT_CAPABILITY` | FE 保留 union（資訊量大），新增 `redactionReasonCode` alias 對齊 planner naming |
| I3 | ROLE_CAPABILITIES 角色集 | v4 roleLattice 既有 6 角色 | planner 列 12 角色（多 risk_officer/capital_manager/strategy_manager/system_operator/reviewer/capability_admin） | 擴成 12 角色 superset，向下相容 |

其餘 31 條無語意衝突，可直接落地。

---

## 三、實作計畫（9 階段，依 P0→P3 排序）

### 階段 1 — Archive + Memory（首批，唯一純文檔）

- 建 `.lovable/feedback/2026-05-07-planner-response/` 三檔
- 寫入 `mem://features/planner-response-2026-05-07`
- 更新 `mem://index.md` Memories 段

### 階段 2 — A 組 P0：BFF Contract 對齊（無 backend dep）

| 動作 | 檔案 |
|---|---|
| A1：在 `dto.ts` 補 OpenAPI ref 註解、移除「H3 — named ActionCommandStatus」WIP tag | `src/lib/bff-v1/dto.ts` |
| A2：`errors.ts` 移除「H2 superset」註解、宣告與 Pack D D21 v26 對齊 | `src/lib/bff-v1/errors.ts`, `src/lib/v4/errorCodes.ts` |
| A3：`EVIDENCE_CAPABILITY_MAP` 擴成 19 鍵 union；`RedactedEvidenceRef` 加 `redactionReasonCode` alias；新增 `approval` / `ask` SSE channel typed unions | `src/lib/bff-v1/dto.ts`, 新檔 `src/lib/bff-v1/sse/channels.ts` |
| Tests | `src/lib/bff-v1/__tests__/dto.test.ts` 新增 evidence map / redaction 測試 |

### 階段 3 — B 組 P0：Session + SSE schema canonical

| 動作 | 檔案 |
|---|---|
| B5 `MeResponse`：擴 `src/lib/v4/session/me.ts` 至 planner 全欄位（`permissionsVersion`、`counters`、`baseCurrency`、`sessionExpiresAt`、`featureFlags`），mock provider 同步 | `src/lib/v4/session/me.ts` |
| B4 SSE：建 `src/lib/bff-v1/sse/channels.ts` 列 31 個 channel + 7 組 typed payload union（strategy/deployment/incident/loop/approval/ask/transition/rollback/handoff/confirm_token/cooldown）；`src/lib/v5/events.ts` 由 `payload: unknown` 改 generic constrained union | `src/lib/bff-v1/sse/channels.ts`, `src/lib/v5/events.ts` |
| 測試 | channel registry exhaustive test |

### 階段 4 — B 組 P1：State / Permission / List canonical

| 動作 | 檔案 |
|---|---|
| B1 D05：建 `src/lib/v4/asyncTransitionPolicy.ts`，搬 15 條 action 預設表（timeoutMs/warnAfterMs/failureState/failureReasonCode/retryable/maxRetries），`src/lib/v5/timeoutPolicy.ts` 改 `source: 'planner-2026-05-07'` 並 re-export | 新檔 + 改 `timeoutPolicy.ts` |
| B2 D12：建 `src/lib/v4/roleCapabilities.ts`（12 角色 × Capability bundle + wildcard 解析）；`usePermissions()` 改 capability-first，role 為 fallback | 新檔 + `src/lib/usePermissions.ts` |
| B3 D22：建 `src/lib/v4/listTotalCountPolicy.ts`（endpoint→`exact\|estimated\|absent` map），`src/lib/v5/list.ts` 與 `useLiveListV1` 適配 | 新檔 + 改 list adapters |
| 測試 | 各自 unit |

### 階段 5 — C 組 P2：高風險動作合約

| 動作 | 檔案 |
|---|---|
| C1/D36：建 `src/lib/v4/cooldownPriority.ts`（cooldown > confirm token），mock confirm-token redeem 強制檢查 cooldown | 新檔 + 改 `src/lib/v4/confirmToken.ts` |
| C2/D35：建 `src/lib/v4/twoManPolicy.ts`（RoleFamily map + distinct user/family check），mock approver flow 接入 | 新檔 |
| C3：journal PATCH atomic — `src/lib/bff/writeOverlay.ts` merge-patch path 改「all-or-nothing」+ 失敗發 `agora.journal.update.rejected` 記號 | 改 `writeOverlay.ts` |
| C4：建 `src/platform/components/BulkResultDrawer.tsx` + 標準 toast pattern；`BulkActionResponse<T>` 已在 dto，掛 UI | 新元件 |

### 階段 6 — D 組 P1/P2：Saga + Handoff

| 動作 | 檔案 |
|---|---|
| D04：建 `src/lib/v4/rollbackSaga.ts`（DTO + status enum + 8 步 stepper），mock `/bff/rollback-sagas/{id}` provider，platform 元件 `RollbackSagaStepper.tsx` | 新檔 + 新元件 |
| D30：擴 `src/lib/v4/handoffSla.ts` 加 `SlaSegment[]` + `reasonCode` enum，HandoffDrawer UI 顯示 segment timeline | 改 `handoffSla.ts` + `HandoffDrawer.tsx` |

### 階段 7 — E 組 P1（與前項合流）

| 動作 | 檔案 |
|---|---|
| E3：`src/lib/v4/optimisticLock.ts` 擴 `expectedVersion` mismatch UI helper（toast + diff hook），所有 runActionSafe 帶 lockVersion | 改既有 + 新增 hook |
| E7：`src/lib/bff-v1/client.ts` 讀 response `X-Request-Id` + `X-Correlation-Id` 回寫 console / liveStatus（同 H1+ 模式） | 改 `client.ts` |

### 階段 8 — E 組 P2：governance defaults

E2 break-glass / E4 memo policy / E9 handoff multi-turn / E10 mandate breach defaults / E11 quorum — 全部以「config + 型別」落地，無 UI flow：

```
src/lib/v4/forceTransitionPolicy.ts   (E2)
src/lib/v4/memoPolicy.ts              (E4)
src/lib/v4/handoffMultiTurn.ts        (E9)
src/lib/v4/mandateBreachDefaults.ts   (E10)
src/lib/v4/reviewerQuorum.ts          (E11，可能擴既有 rebalanceQuorum)
```

### 階段 9 — E 組 P3：UX polish

| 動作 | 檔案 |
|---|---|
| E16 drawer ESC stack：`RightDrawer.tsx` 改用 stack ref，只 topmost 接 ESC | `RightDrawer.tsx` |
| E17 全域捷徑：擴 `CommandPalette.tsx` + 新 `KeyboardShortcutsHelp.tsx`（`?` 開啟） | 改 + 新 |
| E18 reduced-motion：`src/index.css` 加 `@media (prefers-reduced-motion)` rules，Tailwind 對應 utility | `index.css` |
| E13 i18n ICU：i18next 改用 `i18next-icu`（已在）或補 plural rules 檢查 script | `scripts/check-i18n.ts` |
| E14/E15 預留 spec const file | `src/lib/v4/uiBudgets.ts` |
| E19 audit immutable：`AuditTimeline.tsx` 確認無 edit affordance + 加 `correction` row 樣式 | 改 |
| E20 spec semver：`.lovable/spec/v4/CHANGELOG.md` 模板 | 新檔 |

---

## 四、技術細節（給工程實作）

### 命名與檔案布局原則

- 所有 planner canonical 落到 `src/lib/v4/`（normative layer），v5 / bff-v1 透過 re-export 收斂
- mock provider 永遠加 `source: 'planner-2026-05-07'` 標籤，live wiring 才換成 `source: 'spec'`
- 不刪 `v0-mock` tag，只在新檔同名常數標 `provisional: false`

### 測試策略

- 每階段一支 `*.test.ts`，覆蓋型別 narrowing、wildcard 解析、cooldown vs confirm-token 順序、bulk partial-failure 三種 outcome、handoff SlaSegment 累加
- 既有 331 tests 必須維持綠色

### 不做（明確排除）

- 不接 real backend（沒 endpoint）
- 不改 v3 legacy
- 不改 design tokens

---

## 五、執行順序與粒度

```text
階段 1（archive + memory）
階段 2（A 組 P0）         ─┐ 可並行
階段 3（B 組 P0：Me + SSE）─┘
階段 4（B 組 P1）
階段 5（C 組 P2）         ─┐ 可並行
階段 6（D 組 P1/P2）       ─┘
階段 7（E 組 P1）
階段 8（E 組 P2 config）
階段 9（E 組 P3 polish）
```

每階段一個 commit，可逐階段審；用戶可隨時喊停或挑階段做。

---

## 六、回應規劃團隊（plan 完成後一起送）

把 I1/I2/I3 三點寫入 `.lovable/feedback/2026-05-07-planner-response/INDEX.md` 的「FE feedback to planner」段，下次 planner 修訂 Pack D-B Permission Contract 時納入。

---

## 七、給用戶的選擇

預設執行：階段 1 + 2 + 3（archive + 兩個 P0 批次），約 8–12 檔。

若要全部 9 階段一次走完，估 30+ 檔、數百行新增；建議分批以利 review。
