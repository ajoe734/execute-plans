# Spec Gap Audit — 2026-05-05-C（實作後反饋）

> 範圍：在完成 Pack A（28 High）與 Pack B（64 Medium/Low）共 92 條規格修補、並完成階段 1A–3 實作後，
> 盤點 v3 spec 仍**無法獨立支撐落地**的 deeper gaps。
>
> 本報告**不修補**（不修改 spec 與程式碼），僅作為下一輪規劃輸入。
>
> 條目命名：`C001 … C0NN`，與 A / B 流水序不衝突。

## 命名與索引

- 主報告：本檔
- 試算表：`spec-gap-2026-05-05-C-summary.csv`
- 索引：`.lovable/audits/INDEX.md` 已新增此版本列

## Severity 定義

- **High (H)**：缺漏直接導致正確性風險（資金、權限、稽核、狀態機一致性）或無法通過 Acceptance Criteria。
- **Medium (M)**：缺漏導致實作期需主觀決策、跨頁不一致、或測試無法收斂。
- **Low (L)**：缺漏屬完整性 / 細節 / 邊界，可在 polish 階段補。

## 統計

- 條目總數：**78**
- High：**14** ｜ Medium：**38** ｜ Low：**26**

---

## 1. 跨層 Normative 衝突（v1 / v2 / v3）

### C001 · [H] · Spec governance · v3 §2 Override Priority
**Gap**：v3 §2 僅敘述「conflict 時 v3 → v2 → v1」，未提供完整 enum / 欄位 mapping table。實作端碰到 v1 `state` vs v3 `lifecycleStatus` 同義異名時，必須逐 entity 自行判讀。
**Impact**：BFF 與前端 type bridge 各自為政；mock seed 補丁多次重做。
**Suggested resolution**：新增 §2.1「Legacy → v3 mapping table」，逐 entity 列出舊欄位 → 新欄位 → 轉換規則 → deprecation 日期。

### C002 · [H] · Spec governance · v3 §2
**Gap**：未定義 BFF 在過渡期是否需 dual-write（同時回 v1 與 v3 欄位）。
**Impact**：前端必須猜「v3 缺欄位時 fallback 到 v1」是否合法；若 BFF 後來移除 v1 欄位則 silent break。
**Suggested resolution**：明訂 dual-write 期限與 sunset 條件；每個 endpoint 標 `apiVersion`。

### C003 · [M] · Spec governance · v3 §13 Page Tab Corrections
**Gap**：被刪除 / 合併的 tab（如 Strategy 舊 tab → 新 13 tabs）未列舊內容 / 已存資料的去處。
**Impact**：實作時不知是否要做資料搬遷或保留舊路由。
**Suggested resolution**：每個 tab 變更附 `from → to | dropped | merged-into:<tab>`。

### C004 · [L] · Spec governance · Disposition.csv
**Gap**：A / B Disposition.csv 未提供 reverse index（v3 章節 → 解決哪些 GID）。
**Impact**：稽核 trace 不雙向，難確認某章節是否漏掉某 gap。
**Suggested resolution**：新增 `v3-section-to-gap.csv` 反向表。

### C005 · [L] · Spec governance · v3 INDEX
**Gap**：v3 INDEX 未列 Part 10 章節清單與行號錨點。
**Impact**：跳轉與 review cost 高。
**Suggested resolution**：在 INDEX 列出每個 §X 的 H2 與一句話描述。

---

## 2. 狀態機完整性（18 machines）

### C006 · [H] · State machines · v3 §4
**Gap**：18 個狀態機僅列 happy-path transition，未定義 **error / timeout / cancellation** 的 fallback transition。例：`paper → live` BFF 失敗時應回到何狀態？
**Impact**：UI 出錯後 entity 卡在 transient state，前端無路徑復原。
**Suggested resolution**：每條 transition 追加 `onFailure: <state>` 與 `timeoutMs`。

### C007 · [H] · State machines · v3 §4
**Gap**：未定義 **admin override / force-transition** 路徑與授權者。
**Impact**：incident 時無人能合法讓 entity 跳出卡死狀態，將被迫直接改 DB。
**Suggested resolution**：定義 `forceTransition(entity, fromAny, toAny, memo, approver=admin)` 並列入 high-risk catalog。

### C008 · [H] · State machines · Strategy lifecycle × review × deployment
**Gap**：v3 §4 拆三軸後，理論 8×4×5 = 160 組合，未列**合法組合白名單**或不變式（例：`lifecycleStatus=retired` 時 `deploymentStatus` 必須是 `none|stopped`）。
**Impact**：mock seed 與 UI 可能組出不可能的 triple；測試無法窮舉。
**Suggested resolution**：新增「Strategy status invariants」表 + JSON schema 約束。

### C009 · [M] · State machines · Terminal states
**Gap**：terminal state（retired, deprecated, archived）後的 archive / purge SLA 未列。
**Impact**：列表是否顯示、search 是否索引、audit 是否可改皆無依據。
**Suggested resolution**：每個 terminal state 標 `retentionDays`、`searchVisible`、`auditMutable`。

### C010 · [M] · State machines · Concurrency
**Gap**：未定義同一 entity 兩個 actor 同時 dispatch transition 的衝突解決。是否使用 `version` / `etag` / optimistic lock？
**Impact**：mock 階段未爆發；接真 BFF 後將出現 lost-update。
**Suggested resolution**：規範 `If-Match: <version>` header + `409 STATE_CONFLICT` envelope。

### C011 · [M] · State machines · Branching
**Gap**：分支 state（如 review → approved/rejected/changes_requested）的 changes_requested 後續路徑（回 review、回 draft、限制次數）未列。
**Impact**：實作猜測，跨 entity 不一致。
**Suggested resolution**：對每個分支點列「子狀態 → 下一可達」表。

### C012 · [L] · State machines · Visualization
**Gap**：未指定 LifecycleStepper 對 18 個機器的渲染變體（橫向/縱向/分支處摺疊）。
**Impact**：UI 對長機器（如 Rebalance 6/9 step）顯示破版。
**Suggested resolution**：每個機器標 `renderHint: linear|branchy|matrix`。

---

## 3. 權限矩陣 / ActionDescriptor

### C013 · [H] · Permissions · v3 §5
**Gap**：Truth table 僅完整覆蓋 Strategy / Persona / CapitalPool / Ranking / Capability 5 類；**Tool / MCP / Skill / Memory / Insight / Artifact / Job / Incident / Deployment / Runtime / RoutePolicy / EvolutionProgram** 的 action × role 細表缺。
**Impact**：前端 PermissionAwareButton 只能對 5 entity 正確；其餘以保守 disable 應對，破壞流程。
**Suggested resolution**：補齊 11 entity × N action × 8 role 完整矩陣。

### C014 · [H] · ActionDescriptor · v3 §8
**Gap**：ActionDescriptor 未列 `disabledReasonI18nKey` 命名空間規約，導致 BFF 自由命名而 i18n 字典爆炸。
**Impact**：tooltip 出現 raw key 或 missing key。
**Suggested resolution**：規約 `actions.<entity>.<action>.disabled.<reasonCode>`，並列舉 reasonCode enum。

### C015 · [M] · ActionDescriptor · v3 §8
**Gap**：未列 `requiresEnv` / `requiresTwoMan` / `ttlSec` / `idempotencyKeyRequired` 欄位。
**Impact**：UI 無法事前提示「此動作需在 prod 環境」「需第二人簽核」。
**Suggested resolution**：擴充 ActionDescriptor schema。

### C016 · [M] · Permissions · Emergency override
**Gap**：未定義誰能授予 emergency override、何種事件可觸發、留痕欄位（justification、approvers[]、expiry）。
**Impact**：incident 時走後門無稽核。
**Suggested resolution**：新增 §5.6 Emergency Override 章節。

### C017 · [L] · Permissions · Role inheritance
**Gap**：8 個 role 之間是否有 inherits 關係（admin ⊇ research_lead？）未列。
**Impact**：truth table 重複維護。
**Suggested resolution**：定義 role lattice。

### C018 · [L] · Permissions · Multi-tenant
**Gap**：是否支援多 team / 多 portfolio scoping 未討論（Capital Manager A 不能動 Capital Manager B 的 pool？）。
**Impact**：未來 scaling 需大改。
**Suggested resolution**：宣告現階段為 single-tenant，並列入 future work。

---

## 4. 高風險動作 / Confirm Token

### C019 · [H] · High-risk · v3 §6.2
**Gap**：Confirm token API 缺 **token 撤銷 / token reuse 偵測 / token 與 idempotency key 關係**。
**Impact**：token 被截獲可重放；同一 token 重送無防呆。
**Suggested resolution**：新增 `revokeToken`、`tokenUsedOnce` 約束、`Idempotency-Key` 必須與 token 綁定。

### C020 · [H] · High-risk · v3 §6.1 catalog
**Gap**：High-risk catalog 與 §5 truth table 中標 `requiresApproval=true` 的 action 未做交叉勾稽，現況有遺漏（如 `mcp.production_grant` 在 §5 未明示）。
**Impact**：confirm flow 漏觸發。
**Suggested resolution**：自動產生交叉表，列出 union 與差異。

### C021 · [M] · High-risk · Memo schema
**Gap**：Memo 必填只有 max length（Pack B G77）與必填規則，未定 **下限字數、是否需引用 incident/jira id、是否支援 markdown / mention**。
**Impact**：稽核 memo 多為 "ok" 字樣，失去事後追溯價值。
**Suggested resolution**：規範 `memo.minLen`, `memo.requireRef: incident|change|none`, `memo.format: text|markdown`。

### C022 · [M] · High-risk · Two-man rule
**Gap**：哪些 action 必須 two-man（執行者 ≠ 簽核者）未明列；目前僅 5 條範例。
**Impact**：實作沿用範例，遺漏其他資金 / 權限類動作。
**Suggested resolution**：在 §6.1 對每條 action 加 `twoMan: true|false`。

### C023 · [L] · High-risk · Cool-down
**Gap**：高風險動作之間是否需 cool-down（避免連發）未定。
**Impact**：紅色按鈕被連點導致連續觸發。
**Suggested resolution**：每條 action 可選 `cooldownSec`。

---

## 5. BFF API Contract

### C024 · [H] · BFF · availableActions ordering
**Gap**：`availableActions: ActionDescriptor[]` 未規定**排序、分組（primary / secondary / destructive）、隱藏規則**。
**Impact**：UI 無法穩定渲染按鈕順序；A/B page 顯示同一 entity 動作順序不同。
**Suggested resolution**：`ActionDescriptor.group: "primary"|"secondary"|"destructive"`、`order: number`。

### C025 · [H] · BFF · Pagination
**Gap**：列表 API 未統一 pagination 約定（offset/limit 還是 cursor？預設 page size？最大值？）。
**Impact**：每個 list page 寫一套，無限載入 / 跳頁互換成本高。
**Suggested resolution**：統一 cursor-based + `pageSize <= 200`。

### C026 · [M] · BFF · Filtering & sorting
**Gap**：filter / sort query 參數命名（`sort=field:asc` vs `orderBy=field&dir=asc`）未統一。
**Impact**：跨頁難共用 hook。
**Suggested resolution**：統一 `sort=field,-field2`、`filter[field]=value` JSON-API 風格。

### C027 · [M] · BFF · Error envelope
**Gap**：`BffError.i18nKey` 已定，但 `retryable` / `userActionable` / `correlationId` / `cause` 欄位語意未定。
**Impact**：toast 無法判斷是否可 retry，log 無法 trace。
**Suggested resolution**：標準 envelope `{code, i18nKey, message, retryable, correlationId, details}`。

### C028 · [M] · BFF · Idempotency
**Gap**：未規範 `Idempotency-Key` header 適用範圍與 server 重放窗口。
**Impact**：mutation 重送導致重複扣款 / 重複建單。
**Suggested resolution**：所有 POST/PATCH 必須帶 key，window 24h。

### C029 · [M] · Realtime · SSE reconnection
**Gap**：SSE catalog 已列（Pack B B3），但 **last-event-id 重放、replay window、heartbeat 間隔、backoff** 未定。
**Impact**：斷線重連事件遺失，UI 與後端 drift。
**Suggested resolution**：定義 reconnect protocol。

### C030 · [L] · BFF · Request id propagation
**Gap**：未定 `X-Request-Id` 是否由前端產生、是否回寫 response。
**Impact**：log trace 缺鏈。
**Suggested resolution**：前端產生 ULID，BFF 回寫並寫入 audit。

### C031 · [L] · BFF · Bulk operations
**Gap**：未定批次 endpoint 是否存在（如 bulk approve handoffs），以及 partial-failure 回應形狀。
**Impact**：UI 提供「全選」但無法批次執行。
**Suggested resolution**：宣告 bulk 為 future work，UI 暫不提供 select-all。

### C032 · [L] · BFF · WebSocket vs SSE
**Gap**：v3 採 SSE，但部分流（如 collaborative cursor、PersonaLab live token stream）需雙向，未討論。
**Impact**：未來新增功能需大改。
**Suggested resolution**：宣告現階段一律 SSE，雙向場景列入 future work。

---

## 6. Agora ↔ Management Handoff

### C033 · [H] · Handoff · v3 §15
**Gap**：7 種 handoff type 已定，但 **SLA 計時起點**（建立時 / 接手時 / 第一次回覆）未明。
**Impact**：逾期判定與升級行為不一致。
**Suggested resolution**：每 type 標 `slaStartAt: created|claimed|replied`。

### C034 · [H] · Handoff · Escalation
**Gap**：逾期升級行為（升給誰、是否重新計 SLA、是否通知 Agora 發起人）未定。
**Impact**：handoff 沉底無人理。
**Suggested resolution**：定義 escalation chain (`primary → secondary → admin`) 與 notification policy。

### C035 · [M] · Handoff · Reject reply
**Gap**：Management 拒絕 / 退回時的 reply schema（reasonCode、附件、是否要求 Agora 補件）未定。
**Impact**：Agora 收到拒絕只能看到 free text。
**Suggested resolution**：定義 `HandoffRejectDTO { reasonCode, message, requiresAttachments[] }`。

### C036 · [M] · Handoff · Attachments
**Gap**：附件 max size / mime allow-list / 病毒掃描責任人未定。
**Impact**：上傳與安全行為各 page 不同。
**Suggested resolution**：統一 `<= 25MB`、allow-list、BFF 端掃描。

### C037 · [L] · Handoff · Threading
**Gap**：handoff 是否支援多輪對話（Agora ↔ Management 來回）未定。
**Impact**：UI 只能 single-shot。
**Suggested resolution**：宣告 v1 為 single-shot，threading 列 future。

---

## 7. Capital / Ranking / Rebalance

### C038 · [H] · Capital · Mandate breach
**Gap**：Mandate JSON schema 已定（Pack A G16），但 **breach 偵測週期、breach 後自動動作、誰被通知** 未定。
**Impact**：超額曝險不會自動觸發，與「Capital Manager 必有護欄」假設衝突。
**Suggested resolution**：新增 `mandateMonitor: { interval, onBreach: { notify[], action } }`。

### C039 · [M] · Ranking · Metric metadata
**Gap**：Ranking metric 缺 `unit`、`direction`(higher-better)、`normalization`(z-score|min-max|none) 欄位。
**Impact**：FormulaBuilder 無法做合理性檢查，正負號錯置。
**Suggested resolution**：擴充 metric library schema。

### C040 · [M] · Rebalance · Backward transitions
**Gap**：Rebalance 6/9 step 是否允許回退（step 5 → step 3）未列。
**Impact**：Reviewer 退件無法定位回哪一步。
**Suggested resolution**：對每個 step 列 `canRollbackTo: step[]`。

### C041 · [M] · Rebalance · Quorum
**Gap**：Reviewer / Approver quorum（最少幾人、是否需跨角色 risk + capital）未定。
**Impact**：單人即可放行。
**Suggested resolution**：每個 approval stage 標 `minApprovers`、`requiredRoles`。

### C042 · [L] · Capital · Currency / FX
**Gap**：Mandate 與 exposure 是否多幣別、FX 折算規則未討論。
**Impact**：跨幣投組顯示金額錯。
**Suggested resolution**：宣告 base currency，FX 由 BFF 折算。

---

## 8. Evolution / Experiment

### C043 · [M] · Evolution · Constraints validation
**Gap**：Constraints / Alerts / Approvals schema 列了欄位但無 validator（max population, max generations, max cost budget 上限）。
**Impact**：使用者可填荒謬值跑爆 runtime。
**Suggested resolution**：對每欄位加 `min/max/step` 並由 BFF dry-run 校驗。

### C044 · [M] · Experiment · Promote gating
**Gap**：Experiment 結果 → Strategy promote 的 gating（min sample, p-value, min duration）未列。
**Impact**：研究員可任意 promote 未顯著結果。
**Suggested resolution**：定義 promote checklist + automated gate。

### C045 · [L] · Evolution · Reproducibility
**Gap**：未定 random seed / data snapshot / code commit 鎖定機制。
**Impact**：跑出的 fitness 無法重現。
**Suggested resolution**：每次 run 必存 `{seed, dataSnapshotId, codeCommit}`。

---

## 9. i18n / Locale / Format

### C046 · [M] · i18n · Mixed-locale UGC
**Gap**：使用者中英混打的儲存與顯示策略未定（detect-and-tag？保留原樣？）。
**Impact**：搜尋、TTS、Persona 回覆語言判定錯。
**Suggested resolution**：UGC 不偵測，保留原樣；Persona 回覆走 §13.8 fallback。

### C047 · [M] · i18n · Date / Number / Currency
**Gap**：未列 ICU pattern 與 fallback（zh-TW 日期格式、千分位、貨幣符號位置）。
**Impact**：各頁 format 不一致。
**Suggested resolution**：在 §13 補 format token 表（`datetime.short`, `money.usd` 等）。

### C048 · [L] · i18n · Region split
**Gap**：未討論 zh-TW / zh-HK / zh-CN 是否分檔。
**Impact**：未來進中港需大改。
**Suggested resolution**：宣告現階段僅 zh-TW、en-US，其餘列 future。

### C049 · [L] · i18n · Pluralization
**Gap**：未定 ICU plural / select 用法。
**Impact**：英文複數錯。
**Suggested resolution**：`{count, plural, one {#} other {#}}` 為標準。

---

## 10. UI 元件 / Design Tokens / a11y

### C050 · [M] · Design tokens · Dark mode
**Gap**：9 design tokens 未列 dark mode 對應值與切換時機。
**Impact**：實作走預設明亮，使用者無切換。
**Suggested resolution**：補 `--*-dark` 對應 token，並指定 system / user toggle。

### C051 · [M] · Design tokens · Density
**Gap**：未定 compact / comfortable density 切換（DataTable rowHeight）。
**Impact**：交易員偏好密集表格無法支援。
**Suggested resolution**：新增 density token + user preference。

### C052 · [M] · Components · Skeleton
**Gap**：Empty / Loading / Error 模板已定（Pack B B3），但 skeleton 對 table / card / chart / drawer 細部規格未定。
**Impact**：各頁 skeleton 形狀不一。
**Suggested resolution**：補 `<TableSkeleton rows>`、`<ChartSkeleton type>` 規格。

### C053 · [M] · Components · LineageGraph
**Gap**：節點上限、layout algorithm、效能 budget（>500 nodes 行為）未定。
**Impact**：大 lineage 卡死。
**Suggested resolution**：上限 200 visible，超出折疊；layout = dagre LR。

### C054 · [L] · Components · RightDrawer stacking
**Gap**：多個 drawer 同時開啟、巢狀、ESC 關閉順序未定。
**Impact**：使用者迷失。
**Suggested resolution**：規定最多 2 層；ESC 關最上層。

### C055 · [L] · Components · CommandPalette scope
**Gap**：CommandPalette 結果包含 entity / action / page，但 ranking、recent、pinned 規則未列。
**Impact**：搜尋體驗不一致。
**Suggested resolution**：定義 ranking weights。

### C056 · [H] · a11y · Accessibility chapter missing
**Gap**：v3 全文未提 WCAG 等級、focus order、ARIA roles、鍵盤捷徑、色弱檢核。
**Impact**：金融內部工具仍需符合 WCAG 2.1 AA；交付會被退件。
**Suggested resolution**：新增 §22 Accessibility，目標 AA，列出元件級 ARIA 規範。

### C057 · [M] · a11y · Keyboard shortcuts
**Gap**：未定全域捷徑（如 `g s` 跳 strategies、`?` 開 help）。
**Impact**：交易員效率低。
**Suggested resolution**：定義 shortcut table 並在 help drawer 列出。

### C058 · [L] · a11y · Reduced motion
**Gap**：未定 `prefers-reduced-motion` 行為。
**Impact**：動效對暈眩使用者不友善。
**Suggested resolution**：所有非必要動畫包 motion-safe。

---

## 11. 測試 / 驗收 / Mock

### C059 · [H] · Acceptance · Cross-page
**Gap**：Acceptance Criteria 寫在每頁底部，但缺 **跨頁端到端 scenario**（Agora 發 handoff → Management 接 → approve → deploy → audit 可查）。
**Impact**：每頁通過，整條流程仍可能斷。
**Suggested resolution**：新增 §23 End-to-End Scenarios（10 條 happy path + 5 條 incident）。

### C060 · [M] · Mock · Seed scale
**Gap**：未列每 entity 應有幾筆 mock、需涵蓋多少 state。
**Impact**：seed 演化無依據；bug repro 不一致。
**Suggested resolution**：每 entity 標 `mockMin: { count, statesCovered: ['*'] }`。

### C061 · [M] · Mock · Demo scenarios
**Gap**：Demo scenario 僅有名稱（如 "P0 incident"），未列 step-by-step 預期結果。
**Impact**：示範與測試需自行編劇。
**Suggested resolution**：每 scenario 補 `Given/When/Then`。

### C062 · [M] · Test · Contract test
**Gap**：未規範 BFF ↔ Frontend contract test（pact / openapi snapshot）。
**Impact**：BFF 接入後 silent break。
**Suggested resolution**：宣告 OpenAPI 為合約 SoT，前端跑 schema validation。

### C063 · [M] · Performance · Targets
**Gap**：未列效能目標（LCP、TTI、p95 list render、SSE event-to-paint）。
**Impact**：performance 不被驗收。
**Suggested resolution**：補 §24 Performance Budget。

### C064 · [H] · Security · Chapter missing
**Gap**：v3 未列 CSP、auth token storage（cookie vs localStorage）、XSS / CSRF 防禦、PII redaction、audit log immutability。
**Impact**：金融內部工具上線需 security review；目前文件無依據。
**Suggested resolution**：新增 §25 Security baseline。

### C065 · [M] · Security · Audit immutability
**Gap**：Audit timeline 是否可編輯 / 刪除未定。
**Impact**：稽核可信度受疑。
**Suggested resolution**：append-only，admin 不可改。

### C066 · [L] · Test · Visual regression
**Gap**：未列 visual regression（chromatic / playwright snapshot）規範。
**Impact**：重構誤改 UI 無感。
**Suggested resolution**：宣告 future work。

---

## 12. 補充：Spec 結構與工作流

### C067 · [M] · Spec · Glossary missing
**Gap**：v3 無 glossary。Lifecycle / Review / Deployment / Approval / Handoff / Mandate 等核心詞無單一定義。
**Impact**：跨團隊解讀分歧。
**Suggested resolution**：新增 §0.1 Glossary（30+ 詞）。

### C068 · [M] · Spec · Diagrams
**Gap**：v3 全文以表格與項目列為主，缺**狀態機圖、流程圖、entity ER 圖**。
**Impact**：新人 ramp-up 慢。
**Suggested resolution**：補 mermaid 圖。

### C069 · [L] · Spec · Versioning
**Gap**：未定 spec semver 規則與 changelog 格式。
**Impact**：v3 → v4 升級節奏不可預測。
**Suggested resolution**：semver + `CHANGELOG.md`。

### C070 · [L] · Spec · Owner per section
**Gap**：每章節無 owner / reviewer 標註。
**Impact**：問題無人 triage。
**Suggested resolution**：每 H2 加 `> owner: <role>`。

---

## 13. 補充：實作期實際撞到的具體缺口

### C071 · [M] · Strategy · Costs / Calendar tab
**Gap**：v3 §13 修正補了 Costs / Calendar tab，但**內含資料 schema、source of truth、計算公式**完全未列。
**Impact**：tab 已加但內容只能 placeholder。
**Suggested resolution**：列出 cost breakdown 欄位、calendar 來源（exchange、custom holiday）。

### C072 · [M] · Persona · Persona Lab tab
**Gap**：Persona Lab tab 補入但 sandbox runtime、commit-to-prod gate、版本比較 UI 未列。
**Impact**：Lab 為空殼。
**Suggested resolution**：補 §11.x Persona Lab 詳設計。

### C073 · [M] · Capital · Ranking Inputs tab
**Gap**：Ranking Inputs tab 補入但 input source（哪些 metric snapshot、frequency、staleness 容忍）未列。
**Impact**：無法計算 ranking。
**Suggested resolution**：補 input contract 表。

### C074 · [M] · Rebalance · 6 step UI components
**Gap**：v3 §11.2 列了 step table，但每 step 對應 UI 元件（confirm modal? wizard? side-by-side diff?）未列。
**Impact**：實作走 generic stepper。
**Suggested resolution**：每 step 標 `uiPattern`。

### C075 · [M] · Signal · Confidence scale 1–5
**Gap**：強制 1–5，但每分等級**標籤、提示、是否需 reason** 未列。
**Impact**：使用者填分隨意。
**Suggested resolution**：定義 1=確定錯 → 5=確定對，4/5 必填 reason。

### C076 · [L] · Committee · Evidence pack template
**Gap**：v3 §18 列了 pack 結構，但 template per committee type 未列。
**Impact**：每場 committee evidence 拼湊。
**Suggested resolution**：4 種 committee 各列必含 evidence。

### C077 · [L] · DailyBrief · KPI 計算
**Gap**：7 KPI 公式已定（Pack B B3），但 **時區、交易日定義（含跨日 future）、null 處理** 未列。
**Impact**：跨時區團隊看到不同數字。
**Suggested resolution**：所有 KPI 標 `tz: UTC`, `tradingDay: exchange-local`。

### C078 · [L] · CommandCenter · Lifecycle bucket 顏色
**Gap**：buckets 已定，但 colour mapping 與 design tokens 對應未列。
**Impact**：與 StatusBadge 不同色，使用者混淆。
**Suggested resolution**：每 bucket 綁 `--status-*` token。

---

## 結論

92 條原始 gap 收斂後，落地過程仍暴露 **78 條 deeper gaps**，集中於：

1. **跨層治理 / 三軸狀態白名單**（C001–C012）—— 影響型別正確性。
2. **權限完整覆蓋 + ActionDescriptor metadata**（C013–C018）—— 影響 UI 渲染與安全。
3. **BFF 合約 / SSE 重連 / idempotency**（C024–C032）—— 影響上線穩定。
4. **Handoff SLA / escalation**（C033–C037）—— 影響流程閉環。
5. **Acceptance / Performance / Security / a11y 章節缺**（C056, C059, C063, C064）—— 影響交付驗收。

建議規劃團隊以 **Pack C（H）→ Pack D（M）→ Pack E（L）** 三輪推進，並在 Pack C 同步補上 Glossary 與 Diagrams 以利後續 review。
