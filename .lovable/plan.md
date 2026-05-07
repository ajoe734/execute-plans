
# Pack D Disposition 歸檔 + 實作方案

Pack D disposition 已完整看過：63 條全 RESOLVED，分 8 個 sub-pack（D-A ~ D-H），§13 明確指示**先做 spec addendum，不改 src/**，衝突另記 `spec-conflict-2026-05-06-G.md`。Audit G 因此正名為 spec-conflict 文件。

---

## 0. 嚴格遵循 §13 Lovable Prompt

> "Implement Pack D disposition as spec addendum only first.
> Do not modify UI implementation yet unless explicitly requested."

→ **本次只落 docs / spec，src/ 完全不動**（包含 src/lib/v4/、writeIntents/）。所有 TypeScript 型別只寫在 spec markdown code block，不產生 .ts。

---

## 1. F0 — Disposition 歸檔（§12 指定路徑）

新增：
- `.lovable/feedback/2026-05-06-D/Pack_D_Disposition.md` — 從 user-uploads 完整複製
- `.lovable/feedback/2026-05-06-D/Pack_D_Disposition.csv` — 63 條 (id, severity, sub_pack, disposition_summary, blocker, status)

---

## 2. F1 — Pack D spec addendum 6 份（§12 指定）

新建 `.lovable/spec/v4/pack-d/`，6 份 markdown 各自摘錄對應條目的 canonical 決議（zh-TW，與既有 v4 spec 風格一致）：

| 檔案 | 涵蓋 | 重點 |
|---|---|---|
| `Pantheon_Pack_D_StateMachine_Contract.md` | D01-D08b (D-A) | Strategy 三軸白名單、Persona retired 終態、CapitalPool frozen state、Incident↔Rollback Saga、AsyncTransitionDescriptor + 12 條 v0 timeout default、quarantine RAG policy |
| `Pantheon_Pack_D_Permission_Contract.md` | D09-D16 (D-B) | Strategy/Persona/Channel/Watchlist/Notebook 5 entity action catalog、ROLE_CAPABILITIES bundle、DisabledReasonCode 15-enum、cooldown serverTime ground truth、capability lowercase dot.case |
| `Pantheon_Pack_D_BFF_API_Contract.md` | D17-D25 (D-C) | Cursor TTL 15min + 失效 fallback、filter bracket grammar、multi-sort + nulls-last、ErrorDetails discriminated union、ErrorCode master 23 項、ListResponse envelope、BulkActionResponse 207、Attachment policy、X-RateLimit headers |
| `Pantheon_Pack_D_SSE_Event_Contract.md` | D26-D29 (D-D) | SseEventEnvelope schemaVersion=1、StrategyEvent / DeploymentEvent / IncidentEvent / LoopEvent discriminated union、replayWindow 86400s、heartbeat 15s/timeout 45s、resync endpoints per channel |
| `Pantheon_Pack_D_Session_Auth_Tenant_Contract.md` | D51-D59 (D-G) | MeResponse 完整 DTO、cache TTL 30s、401 silent refresh once、tenant scope priority 4 級、logout invalidate list、locale fallback chain、user TZ 優先 |
| `Pantheon_Pack_D_UI_Tokens_A11y_QA.md` | D39-D50, D62, D63 (D-F) + D61 (D-H) | 4pt spacing scale、type scale、5 階 risk severity HSL、Toast 規格、validation 觸發時機、Skeleton 200ms、Empty state 4 元素、focus ring、Intl format、glossary dot.case、bucket color、axe-core CI gate、5 類 perf budget、E2E naming + fixture prefixes |

每份檔案開頭 metadata 指明：版本、對應 Audit D ID、屬於 Pack D-x sub-pack、不取代 v4 normative type（v5 view-model 仍 view-model only）。

額外 `Pantheon_Pack_D_DomainRules_Contract.md`（§7 D30-D38 + D60，原 §12 沒列但內容存在 disposition）放在同 dir 補齊：Handoff slaResetOnReopen、CapitalPool breach formula、metric registry 14 項、quorum extension、missing metric policy、two-man distinct user、confirm token vs cooldown 優先、audit reason length、Skill rollback/deprecate 互斥、correlationId chain。

---

## 3. F2 — Audit / Spec Index 更新

- `.lovable/audits/INDEX.md`
  - Audit D 行：狀態改 `RESOLVED BY PACK D DISPOSITION (8 sub-packs)`，備註加 disposition 路徑
  - Audit G 行：title 改 `spec-conflict-2026-05-06-G`，狀態改 `OPEN — Pack F 落地後第三輪盤點，6 條 impl-fixable 已實作，待併入 Pack G/D 後續 disposition`
  - 累計覆蓋段更新：170 + 63 = 233 條 spec-level RESOLVED
- `.lovable/spec/INDEX.md`
  - 新增 `v4/pack-d/` 段，列 7 份 contract 檔
  - 規範 normative order：v5 IA + loop view-model > v4 + Pack D normative > v3/v2/v1 archived

---

## 4. F3 — Spec conflict 文件（§13.6）

新增 `.lovable/audits/spec-conflict-2026-05-06-G.md`（rename from spec-gap-2026-05-06-G.md），列出當前 src/ 與 Pack D canonical 的具體衝突點：

| 衝突 | 當前 src/ | Pack D canonical | 處理 |
|---|---|---|---|
| C1 | `writeIntents/types.ts` BaseCreateInput.risk: "low\|medium\|high\|critical" | D40 五階加 `info` | impl 階段補 |
| C2 | `writeOverlay.ts` audit `auditEvents.unshift` 無 correlationId | D60 必填 | impl 階段補 |
| C3 | `EntityCreateDrawer` 無 idempotencyKey / serverTime cooldown | D45 confirm flow / D15 | impl 階段補 |
| C4 | 無 `/bff/me` endpoint，currentUser 散落 | D51/D59 MeResponse | impl 階段建 |
| C5 | `bff.realtime.emit("data", { kind, ... })` 無 SseEventEnvelope schemaVersion | D26 typed envelope | impl 階段包裝 |
| C6 | `ListResponse` 無 estimatedTotal/totalCountExact | D22 envelope | impl 階段補 |
| C7 | ErrorCode / DisabledReasonCode 散落 string | D13/D21 enum | impl 階段集中 |
| C8 | Strategy state 在 src 用單一 `state`，未三軸並用 | D01 三軸白名單 | v4 已有三軸欄位，UI 層需顯式校驗 |

合併原 Audit G 14 條：G02/G04/G07/G10/G12/G14 已在 Pack F 短板處理，標 RESOLVED；其餘併入 Pack D 對應條目（G01→D05、G06→D26、G05/G09/G13→D60+D45）。

---

## 5. F4 — Memory 更新

- `mem://index.md` Core：
  - 改寫 Audit D 段為 `RESOLVED BY PACK D DISPOSITION (2026-05-06)，63/63 收斂為 8 sub-packs (D-A~D-H)`
  - 新增一條：`Pack D 實作必須分階段，不可單次大改。立即可做：D39-D50 tokens / D13-D16 enum / D51 MeResponse mock。需與 BFF spec 同做：D17-D29、D51-D60。不可前端自由實作：D04/D30/D31/D35/D36 (provisional v0-mock 可，但需標註)`
- `mem://audits/open-gaps`：D 全移到 RESOLVED；新增 spec-conflict-G 區塊列 8 條 (C1-C8)
- 新增 `mem://reference/pack-d-contracts`：路徑指向 `.lovable/spec/v4/pack-d/` 7 份契約

---

## 6. F5 — 不會做的事（嚴守 §13 / §11.3）

- **不寫任何 src/ 程式碼**（型別、enum、DTO、helper 全部不動）
- 不刪 / 改 v5 既有檔案（v5 仍是 IA / view-model layer）
- 不執行測試（無 src 變動）
- 不產 smoke report（沒實作可 smoke）
- 不做 §11.3 列管項目（D04/D30/D31/D35/D36）的具體實作
- 不在 spec markdown 內加超出 disposition 範圍的決議（必須 1:1 摘錄）

---

## 7. 後續實作建議分批（不在本 plan 範圍，僅標出供下一輪選擇）

依 §11.1 / §11.2 切：

**Batch I（純 docs，可立即）**：本 plan F0-F4
**Batch II（Lovable 可獨立 impl，無需 BFF）**：
- D39-D50 tokens 落到 `index.css` / `tailwind.config.ts`
- D13/D21 enum 落到 `src/lib/v4/`
- D44 Empty state 元件、D43 Skeleton threshold、D47 focus ring、D46 reduced motion
- D61 fixture prefix 改造
- spec-conflict G 的 C1（risk 五階補 info）

**Batch III（需 BFF 同步）**：
- D17-D29 envelope 改造（withOverlay → ListResponse）
- D51 MeResponse mock + 替換散落 currentUser
- D26 SseEventEnvelope wrapper

**Batch IV（provisional 可先 mock）**：
- D05 AsyncTransitionDescriptor + 12 transition default
- D31 breach formula、D32 metric registry
- D45 confirm dialog + token flow、D15 cooldown serverTime

每 batch 結束後重跑 vitest，並產對應 smoke report（5-tier）。

---

## 8. 預估與交付

- 7 份 spec markdown，每份 200-400 行（zh-TW，code block 內 TS schema 可英文）
- 1 份 disposition copy + 1 份 csv summary
- 3 份 index 更新（audits/INDEX、spec/INDEX、plan.md）
- 3 份 memory 更新
- 0 個 src/ 改動

預估 1 build loop。
