# Spec Conflict — 2026-05-06-G

**類型**：spec-conflict（前身為 spec-gap-2026-05-06-G，依 Pack D §13.6 改名歸類）
**對象**：當前 `src/` 實作 vs Pack D canonical contract
**狀態**：**ALL RESOLVED**（C1/C7/C8 + Batch II/III/IV；C2/C4/C5/C6 BFF v1 落地；C3 EntityCreateDrawer Idempotency-Key + cooldown 已補齊 2026-05-08）

---

## RESOLVED — Pack D canonical 與 src/ 衝突（C1–C8 全綠）

| ID | 當前 src/ | Pack D canonical | 處置 |
|---|---|---|---|
| C1 | `writeIntents/types.ts` `BaseCreateInput.risk` 五階含 `info` | D40 五階 | RESOLVED — Batch II risk 五階一致化 |
| C2 | `writeOverlay.ts` 已注入 `correlationId` chain（mock uuid） | D60 必填 correlationId chain | RESOLVED — Batch IV `lib/v4/correlation.newCorrelationId()` |
| C3 | `EntityCreateDrawer` 已用 `idempotencyKey()` header helper + 1.5s confirm cooldown，i18n `entityCreate.cooldown.*` | D45 confirm flow / D15 cooldown | RESOLVED 2026-05-08 — drawer-open 級 stable Idempotency-Key + cooldown countdown + a11y `role=status` |
| C4 | `src/lib/bff-v1/me.ts` re-exports v4 `useMe/fetchMe/MeResponse` | D51/D59 MeResponse 單一來源 | RESOLVED — Batch II mock + bff-v1 facade |
| C5 | `realtime.emitEnvelope` + `bff-v1/sse/channels.ts SSE_SCHEMA_VERSION=1` | D26 typed envelope | RESOLVED — Batch III SseEventEnvelope wrapper |
| C6 | `bff-v1/lists.ts` D22 list-class matrix → `estimatedTotal`/`totalCountExact` | D22 envelope | RESOLVED — Batch III ListEnvelope |
| C7 | `bff-v1/errors.ts` ErrorCode / DisabledReasonCode enum | D13 / D21 enum 集中 | RESOLVED — Batch II |
| C8 | Strategy UI 三軸（lifecycle/review/deployment）顯式白名單 | D01 三軸並用 | RESOLVED — Batch II `lib/v4/strategyTriple` |

---

## RESOLVED — 原 Audit G 14 條整併

| 原 ID | 內容 | 處置 |
|---|---|---|
| G02 | redirect intent contract | RESOLVED — 改 query `?intent=create` |
| G03 | Drawer per-entity controls | RESOLVED — Pack F EntityCreateDrawer Select/Slider/multi-tag |
| G04 | Drawer RBAC guard | RESOLVED — Pack F 短板 + 後續 D-B 統一 |
| G07 | focus 對稱 | RESOLVED — ExecutionLoop+OptimizationLoop focus param |
| G10 | i18n key sweep | RESOLVED — Pack F 補完 |
| G12 | overlay GC | RESOLVED — writeOverlay TTL test |
| G14 | sort default | RESOLVED — D19 nullsLast canonical |
| G01 | CreateIntentResult 缺 async transition | 併入 D05（AsyncTransitionDescriptor） |
| G05 | overlay/audit 對稱 | 併入 D60（correlationId chain） |
| G06 | SSE 對焊 | 併入 D26（typed envelope） |
| G08 | IA 文案三層 | 併入 D49（glossary key） |
| G09 | idempotency | 併入 D45（confirm flow） |
| G11 | a11y focus | 併入 D47（focus ring token） |
| G13 | audit chain ordering | 併入 D60 |

---

## 後續處置

C1–C8 全綠，spec-conflict-G CLOSED。後續若 BFF live mode 接線時發現 server 對 `Idempotency-Key` 處理與 v0 mock 行為不一致，回到 C3 補 server-time cooldown 校準。

