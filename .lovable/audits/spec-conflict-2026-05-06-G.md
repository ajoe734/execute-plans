# Spec Conflict — 2026-05-06-G

**類型**：spec-conflict（前身為 spec-gap-2026-05-06-G，依 Pack D §13.6 改名歸類）
**對象**：當前 `src/` 實作 vs Pack D canonical contract
**狀態**：**ALL RESOLVED**（C1/C7/C8 + Batch II/III/IV；C2/C4/C5/C6 BFF v1 落地；C3 EntityCreateDrawer Idempotency-Key + cooldown 已補齊 2026-05-08）

---

## OPEN — Pack D canonical 與 src/ 衝突

| ID | 當前 src/ | Pack D canonical | 影響 batch |
|---|---|---|---|
| C1 | `writeIntents/types.ts` `BaseCreateInput.risk: "low\|medium\|high\|critical"` | D40 五階含 `info` | Batch II（risk 五階一致化） |
| C2 | `writeOverlay.ts` audit `auditEvents.unshift({...})` 無 `correlationId` | D60 必填 correlationId chain | Batch IV（v0-mock generate uuid） |
| C3 | `EntityCreateDrawer` 無 `idempotencyKey` / serverTime cooldown | D45 confirm flow / D15 cooldown | Batch IV（mock confirm token） |
| C4 | 無 `/bff/me`，`currentUser` 散落多處 | D51/D59 MeResponse 單一來源 | Batch II（mock）→ Batch III（real） |
| C5 | `bff.realtime.emit("data", { kind, ... })` 無 `SseEventEnvelope.schemaVersion=1` | D26 typed envelope | Batch III（wrapper） |
| C6 | `ListResponse` 無 `estimatedTotal` / `totalCountExact` | D22 envelope | Batch III |
| C7 | ErrorCode / DisabledReasonCode 散落 string literal | D13 / D21 enum 集中 | Batch II |
| C8 | Strategy 部分 UI 仍判斷單一 `state` | D01 三軸並用白名單 | Batch II（lifecycle/review/deployment 顯式校驗） |

---

## RESOLVED — 原 Audit G 14 條整併

| 原 ID | 內容 | 處置 |
|---|---|---|
| G02 | redirect intent contract | RESOLVED — 改 query `?intent=create` |
| G04 | Drawer RBAC guard | RESOLVED — Pack F 短板 + 後續 D-B 統一 |
| G07 | focus 對稱 | RESOLVED — ExecutionLoop+OptimizationLoop focus param |
| G10 | i18n key sweep | RESOLVED — Pack F 補完 |
| G12 | overlay GC | RESOLVED — writeOverlay TTL test |
| G14 | sort default | RESOLVED — D19 nullsLast canonical |
| G01 | CreateIntentResult 缺 async transition | 併入 D05（AsyncTransitionDescriptor） |
| G03 | Drawer per-entity controls | OPEN — 列為 Batch II UI 增量 |
| G05 | overlay/audit 對稱 | 併入 D60（correlationId chain） |
| G06 | SSE 對焊 | 併入 D26（typed envelope） |
| G08 | IA 文案三層 | 併入 D49（glossary key） |
| G09 | idempotency | 併入 D45（confirm flow） |
| G11 | a11y focus | 併入 D47（focus ring token） |
| G13 | audit chain ordering | 併入 D60 |

---

## 後續處置

OPEN 8 條（C1–C8）按 `.lovable/plan.md` Batch II / III / IV 推進，不在本 disposition 階段實作 src/。
