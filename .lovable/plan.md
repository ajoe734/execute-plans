
# Pantheon 全量缺口盤點 — Pack F 落地後

範圍：盤點截至 2026-05-06 Pack F 實作完成後，**所有層級** 仍 OPEN 的缺口；分 spec / impl / QA 三軸。本份不實作，僅交付清單與優先序建議。

---

## 1. Spec 層 OPEN（需規劃團隊回應）

### 1.1 Audit D — 63 條 second-order gaps（**全數 OPEN**）

來源：`.lovable/audits/spec-gap-2026-05-06-D.md` + `-summary.csv` + `-blockers.md`

分類聚合：

| 分類 | 條目數 | 嚴重度（H/M/L） | 代表條目 |
|---|---|---|---|
| StateMachine | 8 (D01–D08b) | 5/2/1 | D01 三軸組合白名單、D04 Incident↔Rollback 雙寫、**D05 timeoutMs/failureState** |
| Permission | 8 (D09–D16) | 5/2/1 | D09–D11 缺 entity action 列、**D12 Role×Capability bundle**、D13 disabledReasonCode enum |
| API | 9 (D17–D25) | 5/3/1 | D17 cursor 失效、D18 filter grammar、D19 sort/null、D20 error envelope、D21 ErrorCode master、**D22 totalCount** |
| SSE | 4 (D26–D29) | 1/3/0 | **D26 channel payload schema**、D27 Last-Event-Id 視窗 |
| Domain（Handoff/Mandate/Ranking/Rebalance/Evolution/Approval/Token/Skill/Audit/Memory） | 10 (D30–D38, D60) | 4/5/1 | D30 reopen SLA、D31 breach 公式、D32 metric registry、D35 two-man same-role |
| Tokens / UI / A11y / Format / Glossary | 12 (D39–D50, D62, D63) | 2/8/2 | D39 spacing scale、D40 risk severity color、D41 Toast 規格、D44 Empty state、D47 focus ring |
| Session / Auth / Tenant / i18n / Time | 9 (D51–D59) | 4/4/1 | **D51/D59 /bff/me DTO**、D52 401 retry、D53 tenant scope 優先序 |
| QA | 2 (D61, D63) | 0/0/2 | E2E fixture、Perf budget |

**5 條 blockers（pack-D-blockers.md 已抽出）**：D05、D12、D22、D26、D51/D59
建議優先序：D51/D59 → D26 → D05 → D12 → D22

### 1.2 Audit E / F

* Audit E（v5 SA+SD 19 條 spec-conflict）— **RESOLVED 28/28**（Pack E disposition 已落地）
* Audit F（4 條實作層 gap）— **RESOLVED**（Pack F 已實作）
* **無 OPEN 條目**

### 1.3 待產生但尚未啟動的 Audit

* **Audit G (擬)**：Pack F 落地後第三輪盤點 — 預期會浮現 write-intent / IA boundary 引發的新 second-order gap（例：drawer validation 規則跨 entity 一致性、PersonaHealthMatrix focus query 與 deep-link permission、createBehavior redirect 後 intent 的傳遞契約）
* **Audit H (擬)**：v5 Sentinel / Loop / HIQ 升級層落地後對 v4 normative DTO 的影響盤點（目前只在 spec 層宣告 view-model only，尚未在實作層全面驗證）

---

## 2. Impl 層 OPEN（已知未做或受 spec 缺口阻塞）

### 2.1 直接受 D blockers 阻塞，無法實作

| 模組 | 阻塞於 | 現況 | 影響 |
|---|---|---|---|
| `/bff/me` session bootstrap | D51 / D59 | 全站用 mock currentUser，無 tenantId / featureFlags / serverTime | 無法做真 RBAC、cooldown、env switcher |
| Cooldown 倒數 | D15 + D51 | 用 client clock | 跨頁倒數不一致 |
| SSE type-safe handler | D26 | `src/lib/bff/realtime.ts` 事件型別為寬鬆 union | reducer 無法 exhaustive check |
| Async transition timeout UI | D05 | 所有 async 動作無 SLA 倒數、無自動歸位 | Deployment / Job / Skill scan 永遠 pending |
| List 「X of Y」/分頁總數 | D22 | 多數 list 不顯示總數 | UX 不一致 |
| Permission disabled tooltip 文案 | D13 / D14 | reasonCode 為 string | i18n key 散落 |

### 2.2 Pack F 已實作但**尚為 mock**，未來必補

* `src/lib/bff/writeOverlay.ts` 30min TTL，**無真後端 CRUD**
* `EntityCreateDrawer` 9 entity 共用 form，**未拆 per-entity 進階欄位**（spec §2.5 後續會擴）
* `Ranking Formulas` / `Rebalances` 走 redirect，但目標頁（Formula Studio / Optimization Loop）的 `intent=create` 接收端**尚未實作**
* Audit / realtime emit 是本機事件，**未對接後端 audit pipeline**

### 2.3 v5 升級層對齊度

* `src/lib/v5/` 已落地 enums / events / health / sentinel / overlay / timeoutPolicy / list / remediation
* **未驗證**：v5 view-model enums 是否在所有 list / detail 頁都正確 fall back 到 v4 DTO（僅 18 個 v5 test 覆蓋核心路徑）
* **未實作**：HIQ（Human-in-Queue）升級層的 `/management/approvals` 與新 HIQ 入口共存的「跨入口決策同步」（Pack E 已宣告 coexist，但實作只有路由共存）
* `/loops/execution?focus=personas` 已加入，但 `?focus=strategies` / `?focus=capital` 等對稱 deep-link **尚未補齊**

### 2.4 Console / a11y / i18n

* Pack F F4 修了 ObjectListPage / CapitalPoolsList 的 forwardRef warning，但**未全站掃描**：仍可能在 v5 卡片（PersonaHealthMatrix、Sentinel 卡片）有 Radix Slot ref warning
* `scripts/check-i18n.ts` 通過，但**未啟用 CI gate**
* 無 axe-core CI（D62）
* 無 LCP/TTI budget（D63）

### 2.5 路由 / IA

* `src/App.tsx` `/management/personas` = registry，已驗證
* **未做**：v5 Pack E 宣告的「Pantheon 產品名」全站品牌套用（仍多處顯示舊名 / 通用字樣）
* **未做**：SideNav `dedupeKey` 機制（spec §4 提到，目前以 label 差異化代替）

---

## 3. QA 層 OPEN

### 3.1 Smoke 覆蓋

* Pack E smoke report 僅 read-path-clean（已在 Audit F F04 標註）
* Pack F smoke report 採 5-tier，但：
  - `loop-action-clean` 只跑了 4 個 loop 入口
  - `full-regression-clean` 標 PASS 是基於 201 unit tests，**未跑端到端 E2E**
* 無 visual regression
* 無 mobile viewport 驗收

### 3.2 Test gap

* 既有 201 vitest 全綠，但：
  - writeOverlay TTL 過期路徑只有 1 個 case
  - EntityCreateDrawer 9 entity × validation matrix 未 parametric 測試
  - PersonaHealthMatrix focus query 無 test
  - SideNav dedupe 無 test
* 無 contract test（mock vs spec 對焊）
* 無 perf test

---

## 4. 文件 / 流程

| 項目 | 狀態 |
|---|---|
| `.lovable/spec/v5/` SA+SD 雙文件 | ✅ 已落 |
| `.lovable/spec/v4/` zh-TW + en-US | ✅ 已落 |
| `.lovable/audits/INDEX.md` | ✅ 已更新到 Pack F |
| `.lovable/plan.md` | ✅ Pack F 段已寫 |
| `mem://index.md` Pack F Core | ✅ 已更新 |
| **Audit G/H 啟動文件** | ❌ 未建立 |
| **Pack D disposition 收件追蹤** | ❌ 未建（規劃團隊回應 ETA 不明） |
| **Pantheon 品牌準則文件** | ❌ 未建（Pack E 宣告產品名但無視覺準則） |

---

## 5. 建議下一步（優先序）

依「阻塞下游程度」排序：

1. **等規劃團隊送 Pack D disposition** — 解 63 條 spec 缺口，特別是 5 個 blockers（D51/D59 → D26 → D05 → D12 → D22）。在此之前，impl 層有 2.1 表中所有項目無法收斂。
2. **啟動 Audit G**（Pack F 後第三輪盤點）— 不依賴 Pack D，可在本 build loop 內做；產出 `.lovable/audits/spec-gap-2026-05-06-G.md`，預估 8–15 條新 second-order gap。
3. **補 Pack F mock 短板**（不需新規範）：
   - Ranking / Rebalance redirect 目標頁 `intent=create` 接收
   - PersonaHealthMatrix 對稱 focus deep-link（strategies / capital / deployments）
   - 全站 Radix forwardRef sweep
   - writeOverlay TTL / EntityCreateDrawer parametric test 補強
4. **Pantheon 品牌套用** — 無外部依賴，可獨立做：全站文案 / title / favicon / OG meta。
5. **CI gate 強化** — i18n check / axe-core / 至少 1 個 E2E flow。

---

## 6. 一句話結論

> Spec 層：Audit D 63 條全 OPEN（5 blockers 阻塞 Pack D），E/F 已 RESOLVED。
> Impl 層：Pack F mock 已可用，但 6 大模組（session/SSE/timeout/totalCount/permission tooltip/cooldown）受 D blockers 阻塞，加上 4 項 Pack F 短板可獨立補。
> QA 層：5-tier smoke 已採用，但 E2E / visual / mobile / contract test 全缺。
> 下一個關鍵動作 = 啟動 **Audit G** + 等 **Pack D disposition**。

需要我啟動 Audit G、或先補 Pack F 4 項短板，請指示。
