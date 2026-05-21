
# Pantheon Management 改版實作計畫（規格 2026-05-20 v1）

## 0. 規格已通讀，先列釐清問題（建議在 M0 之前回覆）

1. **NL Console 後端**：第 7 章 `POST /bff/management/nl/ask` Phase 1 是否要先接 Lovable AI Gateway（`google/gemini-2.5-flash`）做 stub 回答，還是純前端 fixed-mock？我預設 **mock-only**（避免在 strict 模式打雷），等 BFF endpoint 上線再切換。
2. **Persona Intent Traces 隱私**：規格說「不可顯示原始私密文字」。我打算把 `userIntentSummary` 視為已 redact 的欄位，原始 prompt 一律不從 BFF 取回；UI 只顯示三種 visibility（summary / redacted / restricted）。可以嗎？
3. **Trading Pulse 比較基準**：`baselineLabel` 規格沒定義固定值。我建議枚舉 `previous_artifact | 7d_rolling | last_canary | last_review`。需要其他選項嗎？
4. **EP5 / Broker Live / Capital Live / BFF HA / Strict Publish 五頁**：規格 §4.1 列出路由但 §6 沒給 detail spec，只在 §12 Pack M3 列任務。我會以「readiness checklist + EvidencePacket list + 缺項 blockers」三段式作骨架，detail 等後續 spec。OK？
5. **歸檔位置**：擬把上傳檔 copy 至 `.lovable/spec/management-2026-05-20/Pantheon_Management_Lovable_Spec_2026-05-20.md`，並在 `.lovable/spec/INDEX.md` 與 `mem://index.md` 加入引用。可以嗎？

> 若無回覆，我會以上面預設方案進行。

---

## 1. 範圍與不變式

依規格 §2 與 §13，本次改版 **不刪既有頁**，只重排 IA 並新增一線監控頁；所有寫入仍走 `bff-v1` facade + HighRiskConfirm + `VITE_BFF_REAL_WRITES=false` gate；strict 模式禁止 silent seed。

對應已有資產：
- `src/management/pages/v5/ControlRoom.tsx` → 改造為 OneRingCockpit
- `src/management/pages/v5/Interventions.tsx` + `RiskCenter.tsx` + `GovernanceQueuePage` → 整併入 HumanInbox
- `src/lib/bff-v1/v5.ts`（`controlRoom / loops / personas / strategies`）作為 Phase 1 read-model 來源
- `src/lib/bff-v1/lists.ts`、`approvals`、`alerts`、`incidents` 等 facade 已存在

---

## 2. 實作順序（6 個 pack + M0 歸檔）

### Pack M0 — 歸檔 + 釐清
- 複製規格至 `.lovable/spec/management-2026-05-20/`
- 更新 `.lovable/spec/INDEX.md` 與 `mem://index.md` Core 段落
- 在 `.lovable/audits/` 新增 `mgmt-revamp-2026-05-20-plan.md` 追蹤表

### Pack M1 — IA + Navigation（基礎，先落地）
- `src/App.tsx`：新增 13 條路由（§4.1），`/management` index → `Navigate to /management/one-ring`，保留 `/management/control-room` alias 同元件
- `src/management/ManagementLayout.tsx`：依 §5.1 六個 group 重排（Oversight / LiveReadiness / AdvancedRegistry / Operations / Capabilities / System）
- `src/i18n/locales/{en-US,zh-TW}.ts`：補 §10 全部 keys；跑 `scripts/check-i18n.ts`
- 新頁先以 `PageStub` 占位（讓路由 / nav / i18n 先綠）

### Pack M2 — 核心七頁（最大工作量，按依賴順序）

每頁規約：建立 view-model 於 `src/lib/v5/management/<pageName>.ts`（純函式組合既有 facade），頁面元件放 `src/management/pages/oversight/`，所有資料經 `useV5Live` / list facade。

| 順序 | 頁面 | 主要依賴 facade | 重用元件 |
|---|---|---|---|
| 1 | **OneRingCockpit** | `v5.controlRoom.get`、`v5.personas.health`、`v5.strategies.health`、`lists.approvals` | 從 ControlRoom 拆出 AutonomyStatusCard / LoopLane / SentinelPreview / HIQPreview |
| 2 | **PersonaFleet** | `lists.personas`、`v5.personas.health` → 組 `RingPersonaFleetItem` | DataTable、PermissionAwareButton |
| 3 | **HumanInbox** | merge `lists.approvals` + `v5.interventions` + Sentinel findings + human gates | 重用 Interventions 卡片、HighRiskConfirm |
| 4 | **TradingPulse** | `lists.deployments`、`lists.runtimes`、`v5.strategies.health`、`lists.capitalPools` | 新 ComparisonTable |
| 5 | **EvolutionJournal** | `lists.audit` + `v5.optimizationLoop` + EvolutionDetail data | Timeline |
| 6 | **EvidenceExplorer** + Detail | 新 facade `bff-v1/evidence.ts`（mock-first，§8.2 endpoint preview） | 新 EvidencePacketCard |
| 7 | **PersonaIntentTraces** + Detail | 新 facade `bff-v1/personaIntent.ts`（mock-only，redaction-aware） | 新 RedactionBadge |

每頁都需：empty/error state、strict-mode 透傳真錯誤、a11y axe smoke 加進 `src/test/a11y-axe-smoke-v5.test.tsx`。

### Pack M3 — Live Readiness 五頁（骨架版）
依 §4.1 建 `BrokerLiveReadinessPage` / `CapitalBindingLiveReadinessPage` / `BffHaReadinessPage` / `StrictPublishAuditPage` + DeploymentDetail 內加 EP5 panel。  
共用元件 `<ReadinessChecklist>`（綁 EvidencePacket）+ `<BlockersList>`（綁 HumanInbox）。  
detail 內容等規格補完，先綠路由與框架。

### Pack M4 — Natural Language Console
- 新 `src/management/components/nl/NlConsoleDock.tsx`（全域 dock，TopBar 喚起）
- 路由 `/management/ask`（可選頁面殼）
- 新 facade `bff-v1/managementNl.ts`：mock-only 回 `ManagementNlAnswer`
- **硬限制**：回應卡若 `risk in {high, critical}` 或 `requiresHumanGate=true`，按鈕一律 disabled + 改為「開啟 HumanGateDecision」連結，符合 §7.4

### Pack M5 — Write Path Hardening
- `src/lib/bff-v1/personas.ts`：`paths.personaAction(id, action)` → `paths.action("persona", id, action)`，保留 deprecated alias 一個版本
- `DeploymentDetail.tsx`：rollback / reduceAllocation / scheduleDeployment 改走 `runActionSafe` + canonical
- Approval decide 路徑覆核
- 新測試 `src/lib/bff-v1/__tests__/no-legacy-live-write.test.ts`：以 AST scan 阻擋新 page 走 legacy mutation

### Pack M6 — 測試 + 驗收
- Vitest：Persona Fleet filter / Inbox grouping / Pulse direction / Evidence status / Intent redaction / nav route 存在性
- Playwright：`e2e/20-mgmt-one-ring.spec.ts` 等 7 個 route smoke
- Strict-mode test：擴 `e2e/09-strict-vs-hybrid.spec.ts` 涵蓋新頁不出現 seed
- i18n parity gate
- 對齊 §14 acceptance checklist 寫進 `.lovable/audits/mgmt-revamp-2026-05-20-final.md`

---

## 3. 技術細節重點

```text
view-model 層    src/lib/v5/management/<page>.ts   pure compose, 100% testable
page 元件        src/management/pages/oversight/   no fetch, no env branching
facade 擴充      src/lib/bff-v1/{evidence,personaIntent,managementNl}.ts
                 mock-first，paths 對齊 §8.2 future endpoints，strict→錯誤
共用元件        src/management/components/oversight/{AutonomyStrip,FleetCard,
                 InboxCard,ComparisonTable,EvolutionTimeline,
                 EvidencePacketCard,RedactionBadge,ReadinessChecklist}
write path      一律 runActionSafe + HighRiskConfirm + idempotencyKey
i18n            §10 所有 keys 雙語齊備；nav 中性語言（避免 Agora 端泄露 §1.3）
```

執行節奏建議：**M0 → M1 一輪（單次 PR）→ M2 一頁一輪 → M3/M4 並行 → M5 → M6**。  
每輪以「routes green + a11y smoke pass + i18n parity pass + tsc 0 error」為閘門。

---

## 4. 不做（依 §13）
不刪 entity pages、不開 real writes、不繞 HighRiskConfirm、不直 fetch、strict 不偽裝 seed、Intent traces 不顯示未 redact 私文。

---

## 5. 預期產出
- 7 條新一線路由 + 5 條 readiness 路由 + 1 條 NL ask 路由
- 3 條新 BFF facade（mock-first）
- ~10 個共用 oversight 元件
- 6 個 vitest 檔 + 7 個 playwright smoke
- §14 acceptance 14 項全綠

請先回 §0 的 5 個問題（或同意預設方案），我會在 Build 模式按 M0→M6 依序執行。
