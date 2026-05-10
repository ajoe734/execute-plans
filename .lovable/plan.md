## 目標

由 FE 端直接把 B 組 backport 規格寫進 spec 檔（不再等 Planner），並輸出**現階段完整版規格快照** `.lovable/spec/current/`，作為唯一最新對外 SoT。同步整合 A/C/D 狀態進單一 audit 表。

## 為什麼可以由 FE 直接做

- B1/B2/B3 的內容都已在 `.lovable/feedback/2026-05-09-addendum/FE_Blueprint_Gap_Missing_Spec_Addendum_2026-05-09.md` 被 Planner APPROVED
- FE 端 TS artifacts 早已實作（`errorCodes.ts` 26 條、`bff-v1/dto.ts` `ActionCommandStatus` + `EVIDENCE_CAPABILITY_MAP`、`bff-v1/sse/payloads.ts` `ApprovalEvent`/`AskEvent`）
- 只剩把這些「碼即規格」回灌到 markdown / OpenAPI YAML / AsyncAPI markdown

## 變更清單

### 1. Pack D markdown backport（normative spec）

**`.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md`**
- D21 ErrorCode master：列出 26 條 canonical（補 RESOURCE_NOT_FOUND / APPROVAL_REQUIRED / CONFIRM_TOKEN_REVOKED）
- §3.1 ErrorEnvelope 範例對齊 26 條

**`.lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md`**
- §1 SseEventEnvelope：`correlationId: string`（required，不再 optional）
- §2 channel 清單加 `approval` / `ask`（first-class）
- §3 ApprovalEvent 4 子型別（created / stage.changed / decided / sla.escalated）
- §4 AskEvent 6 子型別（session.started / message.delta / tool.called / message.completed / session.completed / session.failed）

**`.lovable/spec/v4/pack-d/Pantheon_Pack_D_Permission_Contract.md`**
- 新增 §EvidenceKind Capability Map：19 canonical + 3 legacy alias 對應 capability（依 addendum §B3.6 表）

### 2. OpenAPI / AsyncAPI 回灌

**`.lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml`**
- `components.schemas.ActionCommandStatus`：named enum [accepted, queued, completed]
- 所有 inline `enum: [accepted, queued, completed]` 改 `$ref`
- `components.schemas.ErrorCode`：26 條 enum

**`.lovable/feedback/2026-05-07-final/Pantheon_BFF_AsyncAPI_SSE.md`**
- envelope `correlationId` required
- channels.approval / channels.ask 章節 + payload schema
- EvidenceKind 19+3 章節 + 提示 backend SHOULD NOT 發 legacy alias

### 3. 現階段完整版規格快照（新目錄）

**`.lovable/spec/current/INDEX.md`** — 唯一最新入口，列：
- normative 層：v4 + Pack D（含本次 backport）
- 升級層：v5 SA + SD
- BFF Contract：2026-05-07 Final（含本次 backport）
- 已 supersede：v3、v2、v1

**`.lovable/spec/current/Pantheon_Spec_Current_2026-05-10.md`** — 單檔 consolidated：
- §1 Source-of-truth 樹狀清單 + 衝突優先序
- §2 Entity / Status / Transition 全集（從 Pack D StateMachine_Contract 摘要）
- §3 BFF Contract 摘要（Final + ActionCommandStatus + 26 ErrorCode）
- §4 SSE Contract 摘要（correlationId required、20 channels、ApprovalEvent/AskEvent）
- §5 Permission Contract 摘要（12 role × entity × action + EvidenceKind capability map）
- §6 v5 升級層摘要（IA / Loop / Sentinel / HIQ）
- §7 已 LANDED 的全部 spec gap（233 + G 系列 + Stage 2 + 2026-05-09 Addendum）
- §8 剩餘工作三類：A 後端 / B 已由本次 backport 收掉 / D optional

### 4. 整合 audit（取代散落文件）

**`.lovable/audits/fe-spec-status-2026-05-10.md`** — 單表狀態總覽
- A 組：5 個 P0 backend checklist + live probe HTTP code 對照
- B 組：全部 ✅ RESOLVED_BY_FE_BACKPORT_2026-05-10（指向本次改動）
- C 組：全部 ✅ LANDED（C1–C5）
- D 組：D1–D4 LANDED + 列剩餘可深化方向
- spec-conflict-G：G01/G05/G06/G07/G09/G12/G13/G14 全 LANDED
- H 版 backlog：H1/H2/H3 全 FE CLOSED

**`.lovable/audits/INDEX.md`** 加入口：`- [FE × Spec Status 2026-05-10] — 唯一最新整合狀態表`

`.lovable/audits/fe-blueprint-gap-2026-05-09.md` 頂端加 `> Superseded by fe-spec-status-2026-05-10.md`

### 5. Memory 更新

`mem://index.md` Core 加一行：
> **2026-05-10 spec backport LANDED**：B1/B2/B3 已由 FE 直接落地至 Pack D markdown + OpenAPI + AsyncAPI；現階段完整規格快照於 `.lovable/spec/current/`。

新增 `mem://reference/current-spec` — 指向 `.lovable/spec/current/INDEX.md`

### 6. FE artifact 註記回收

- `src/lib/v4/errorCodes.ts` 頂端 `FE_READY — Pack D D21 markdown backport pending` → 改為 `LANDED 2026-05-10 — Pack D D21 markdown 已對齊 26 條`
- `src/lib/bff-v1/dto.ts` ActionCommandStatus / EvidenceKind 對應註記同步更新
- `src/lib/bff-v1/sse/payloads.ts` correlationId 註記更新

## 不做

- 不改 src/ 任何 runtime 邏輯（只改註解）
- 不改 Pack D 其它條目的 normative 內容（只 backport B 組）
- 不改 v5 SA/SD（屬升級層，不在 backport 範圍）
- 不刪除舊 audit / feedback 歷史（保留歸檔）
- 不開新 spec 決策（一切引用既有 Planner APPROVED disposition）

## 驗收

完成後：
1. `grep RESOURCE_NOT_FOUND .lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md` 命中
2. AsyncAPI 含 `approval` / `ask` channel 章節
3. OpenAPI 有 `components.schemas.ActionCommandStatus`
4. `.lovable/spec/current/INDEX.md` 存在且引用所有 backport 後的檔案
5. `fe-spec-status-2026-05-10.md` B 組標 RESOLVED
6. 366 tests green（無 src/ 邏輯變動，預期不影響）

## 預估規模

- Pack D 3 檔：各加 30–80 行
- OpenAPI YAML：~40 行
- AsyncAPI markdown：~120 行
- `spec/current/` 2 檔：INDEX 30 行、consolidated ~600 行
- audit 1 檔：~250 行
- 共約 1100 行 markdown / YAML 增減；0 行 src/ 邏輯變動
