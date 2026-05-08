# 規劃團隊待補規範清單（FE 端無事可做，全部卡 spec / BFF contract）

整理依據：`H_VERSION_BACKLOG.md`、`Pantheon_BFF_Contract_Spec_2026-05-07_Final.md §10/§11`、`spec-conflict-2026-05-06-G.md`、`spec-conflict-2026-05-06-E.md §B`、`spec-gap-2026-05-05-C-planner.md`、`smoke-2026-05-07-ui-hygiene.md`。

FE 對每一項都已落地 transitional / mock 版本（`v0-mock` / `mockTimeoutPolicy` / superset enum / fallback banner），等規劃團隊出 canonical spec 後才能去掉 mock 標籤、刪除 fallback、收斂為 single source of truth。

---

## A. BFF Contract H 版（最高優先，3 條）

來源：`H_VERSION_BACKLOG.md` + Final §11。

### A1. OpenAPI `components.schemas.ActionCommandStatus` 抽 named enum
- 現況：OpenAPI 仍用內聯 enum `["accepted","queued","completed"]`。
- FE 已備：`src/lib/bff-v1/dto.ts` 導出 `ACTION_COMMAND_STATUSES` + named type + `isActionCommandStatus()` guard。
- 規劃需做：把 `paths.*.responses` 內聯 enum 改 `$ref: '#/components/schemas/ActionCommandStatus'`，方便 codegen。

### A2. Pack D D21 ErrorCode master 補 3 條
- 現況：Pack D D21 仍是 23 條，v1 BFF DTO §3.1 已有 26 條。
- FE 已備：`src/lib/v4/errorCodes.ts` 已 superset 為 26 條 + i18n 全補。
- 規劃需做：Pack D-C §D21 灌回 `RESOURCE_NOT_FOUND`、`APPROVAL_REQUIRED`、`CONFIRM_TOKEN_REVOKED`，與 DTO §3.1 對齊。

### A3. SSE Contract 補 channel + Permission Contract 補 capability map
- Final §11 列示：Pack D-D 須加 `approval` / `ask` channel；Pack D-B Permission Contract 須加 `EvidenceKind → capability` map。
- FE 已備：`src/lib/bff-v1/dto.ts` `EVIDENCE_CAPABILITY_MAP` + `RedactedEvidenceRef`。
- 規劃需做：把 FE map 灌回 Pack D canonical contract。

---

## B. Pack D 5 大 Critical Blockers（spec 待 canonical 化）

來源：`spec-gap-2026-05-06-D-blockers.md`。FE 全部用 v0-mock 版上線中。

### B1. D05 — 10+ 狀態機 `timeoutMs` / `failureState` / `failureReasonCode`
- 影響清單：Job、Deployment、Handoff、EvolutionRun、Incident、CapitalPool、Skill scan、Memory review、Artifact promote、RoutePolicy activate、Alert ack。
- FE 已備：`src/lib/v5/timeoutPolicy.ts` 標 `timeoutPolicy=v0-mock`。
- 規劃需做：每個 async transition 三欄定值（建議草稿值已在 blockers brief §B1）。

### B2. D12 — Role × Capability bundle 對應表
- 規劃需做：`ROLE_CAPABILITIES: Record<Role, readonly Capability[]>`，+ `*` wildcard 規則 + roles vs capabilities 衝突時的 source of truth 宣告（建議 capabilities 為主）。

### B3. D22 — list endpoint totalCount 分類
- 規劃需做：每個 list endpoint 標 `totalCountExact: true | false | absent`。registry 必須 exact、feed 可 estimated、infinite 可 absent。FE `V5ListResponse` 已 hardcode true，需對齊。

### B4. D26 — SSE 每個 channel 的 payload schema
- 規劃需做：每 channel discriminated union + `schemaVersion`。FE `src/lib/v5/events.ts` 用 transitional envelope，等 spec 補完才能移除 `payload: unknown` 兜底。

### B5. D51/D59 — `/bff/me` session DTO
- 規劃需做：`MeResponse` 完整欄位（user / tenant / roles / capabilities / env / featureFlags / serverTime / sessionExpiresAt / locale / tz）+ cache TTL + 401 refresh 策略。FE 現用最小 `V5SessionContext` 兜（tenantId="demo"）。

---

## C. spec-conflict-G — BFF-dependent OPEN 子項

來源：`smoke-2026-05-07-ui-hygiene.md` §31。

| ID | 主題 | 規劃需做 |
|---|---|---|
| G-C2 | Confirm token vs cooldown 語意 | 兩者觸發條件、是否疊加、cooldown 計時起點 |
| G-C4 | Two-man approval 同人/異角色判定 | 何謂「distinct approver」（同 user？同 role？同 tenant scope？） |
| G-C5 | PATCH journal 失敗回滾 | merge-patch 部分欄位失敗時的 audit diff 形狀 |
| G-C6 | Bulk action partial-failure UI 規範 | partial=true 時的 toast / drawer 行為 spec |

C1/C3/C7/C8 FE 已 CLOSED。

---

## D. Pack D §11.3 BFF-dependent 4 條

來源：`smoke-2026-05-07-ui-hygiene.md` §32。

| ID | 主題 |
|---|---|
| D04 | Incident ↔ Deployment rollback **Saga state machine** 未定（補償流程、失敗點 fallback） |
| D30 | Handoff Reopen SLA（重開後是否重計、升級對象） |
| D35 | Two-Man Distinct（與 G-C4 重疊，需合併裁示） |
| D36 | Confirm Token vs Cooldown 語意（與 G-C2 重疊） |

建議規劃團隊把 D35↔G-C4、D36↔G-C2 兩對合併為單一 spec 段落。

---

## E. spec-gap-2026-05-05-C-planner 中尚未裁示的 second-order gaps

抽出 FE 仍待 spec 才能收斂的高影響條目：

1. **狀態機 error/timeout/cancellation fallback transition**（與 B1 D05 相關，需擴大到全部 18 個狀態機）。
2. **Admin override / force-transition 路徑與授權者**（誰能授予、留痕欄位 justification/approvers/expiry）。
3. **同 entity 兩 actor concurrent dispatch 衝突解決**（version / etag / optimistic lock）。
4. **Memo 下限字數 / 是否需引用 incident id / markdown / mention**。
5. **高風險動作 cool-down 連發限制**（與 G-C2 重疊）。
6. **SSE last-event-id replay window / heartbeat / backoff**。
7. **`X-Request-Id` 是否前端產生 + response 回寫策略**（FE 目前單向送出）。
8. **Bulk endpoint 是否存在 + partial-failure 形狀**（FE 已備 `BulkActionResponse<T>`，缺 spec 列哪些 endpoint 支援）。
9. **Handoff 是否多輪對話**（Agora ↔ Management 來回）。
10. **Mandate breach 偵測週期 + 自動動作 + 通知對象**。
11. **Reviewer / Approver quorum**（最少幾人、跨 risk + capital 角色強制）。
12. **Random seed / data snapshot / code commit 鎖定機制**（experiment 重現性）。
13. **i18n ICU plural / select 用法 + Accept-Language fallback 鏈**。
14. **DataTable density 切換 + skeleton 細部規格 per (table/card/chart/drawer)**。
15. **LineageGraph 節點上限 / layout / >500 nodes 效能 budget**。
16. **多 drawer 同時開 + 巢狀 + ESC 關閉順序**。
17. **全域捷徑表**（`g s` 跳 strategies、`?` 開 help 等）。
18. **`prefers-reduced-motion` 行為規範**。
19. **Audit timeline 是否可編輯/刪除**。
20. **Spec semver 規則 + changelog 格式**。

完整列表 67 條在 `spec-gap-2026-05-05-C-planner.md`，這裡是 FE 影響面最大的 20 條。

---

## F. 規劃團隊建議排序

最阻塞 → 最不阻塞：

```text
A1+A2+A3 (H 版 BFF refresh)  ──┐
B5  /bff/me DTO              ──┤  P0 — 阻塞 type-safe codegen 與 startup
B4  SSE payload schema       ──┘
B1  D05 timeoutMs            ──┐
B2  D12 ROLE_CAPABILITIES     │  P1 — 阻塞測試/驗收/audit
B3  D22 totalCount            │
D04 Saga rollback           ──┘
G-C2/D36 Confirm vs cooldown ──┐
G-C4/D35 Two-man distinct    ──┤  P2 — 阻塞高風險動作驗收
D30 Handoff Reopen SLA       ──┘
E §1–§20 second-order gaps  ──    P3 — 逐項清單，影響面較窄
```

---

## G. FE 端對應狀態（給規劃團隊參考）

每一項 spec 落定後，FE 需做的最小動作（不需重新規劃）：

| Spec 落定 | FE 動作 |
|---|---|
| A1 ActionCommandStatus 抽 enum | 重跑 codegen，移除手寫 const |
| A2 D21 26 條 | `errorCodes.ts` 註解移除 H2 superset 標記 |
| A3 SSE channel + capability map | Pack D-D / D-B canonical 對齊，移除 dto.ts 註解 |
| B1 D05 timeout | `timeoutPolicy.ts` 移除 `v0-mock` 標籤，`source` 改 `spec` |
| B2 D12 ROLE_CAPABILITIES | 新增 `src/lib/v4/roleCapabilities.ts` + `usePermissions` 接 capability list |
| B3 D22 totalCount 分類 | `V5ListResponse` adapter 改讀 spec table |
| B4 D26 SSE schema | `src/lib/v5/events.ts` 移除 `payload: unknown`，灌入 union |
| B5 /bff/me | 替換 `V5SessionContext` 為真 `MeResponse` adapter |

---

## H. 不在規劃團隊範圍（FE 端可獨立推進，本次不列）

避免混淆，以下三類**不需要規劃補規範**，是 FE 自己可以做的：

- **Edit/Update flow**（Pack F 只做 Create）
- **Agora/Studios 頁面功能深度**（mock data → real 接線）
- **H2+ / H3+ 強化項**（404→envelope 轉換、`writes.ts` runtime narrowing）— 純 FE refactor

要我做這幾項時可單獨開 ticket。

---

**結論**：規劃團隊待補項共 **A(3) + B(5) + C(4) + D(4，與 C 重疊 2) + E(20) = 34 條**，建議優先用 P0/P1 共 **8 條**換取整個 BFF live 接線可下 mock 標。
