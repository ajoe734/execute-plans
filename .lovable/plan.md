# Plan：BFF Contract Spec 2026-05-07-B Patch

產出單一檔案 `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-B.md`，作為 2026-05-07 spec 的 **normative 補丁**（非取代）。後端可直接 append。

## 範圍（covering P0 + P1，共 9 區塊）

### Block 1 — Missing DTOs（P0 #1, #2）
補齊 §7 已宣告但 §8 缺的 DTO：
- `RuntimeDTO` / `RuntimeKind` / `RuntimeEnv` / `RuntimeHealth`
- `ToolDTO` / `ToolCategory` / `ToolScope`
- `McpServerDTO` / `McpServerHealth` / `McpToolDTO`
- `SkillDTO` / `SkillArchetype`
- `ChannelDTO` / `ChannelKind`
全部對齊 `src/lib/bff/types.ts` 既有形狀 + Pack D status enum。

補 v5 引用但未定義的型別：
- `LoopStage` enum（對齊 v5 SD §3）
- `EvidenceRef`（id / kind / uri / hash）
- `Role` / `Capability`（對齊 Pack D Permission Contract）

### Block 2 — Error Envelope 對齊（P0 #3）
廢除 `CommandResponse.error: string`；統一改為：
- 成功：`{ ok: true, data, lockVersion?, idempotencyKey? }`
- 失敗：throw `BffErrorEnvelope`（§4.1 既有形狀）+ `ErrorDetails` discriminated union（援引 Pack D D20）
補 §4.2 `ErrorCode` master list（援引 Pack D D21，含 `CONFIRM_TOKEN_REVOKED` / `CONFIRM_TOKEN_REUSED` / `CONFIRM_TOKEN_BINDING_MISMATCH`）。

### Block 3 — Pack F EntityCreate 對齊（P0 #4）
§9 補齊 9 個 entity 的 `EntityCreateInput<T>` schema（Strategy/Persona/CapitalPool/RankingFormula/Rebalance/Tool/McpServer/Skill/Channel），與前端 `src/lib/writeIntents/createDefaults.ts` + `EntityCreateDrawer` 完全對齊。

### Block 4 — §11 Action Table（P1 #6）
補齊所有 entity 的 lifecycle actions（含 endpoint / method / requiresConfirm / requiresTwoMan / cooldown / idempotency）：
- CapitalPool: freeze/unfreeze/adjustLimit
- Deployment: promote/rollback/pause/resume
- Artifact: publish/deprecate/sign
- Job: cancel/retry
- Runtime: restart/scale/drain
- Tool/McpServer/McpTool/Skill/Channel: lifecycle CRUD + enable/disable
- Research: queue/conclude/attach
- Evolution: start/pause/promote/discard

### Block 5 — Agora (v5 IA) Endpoints（P1 #7）
新增 §15 Agora API：
- `/agora/signals`、`/agora/signals/:id/feedback`
- `/agora/inbox`（InsightInbox）
- `/agora/journal`（DecisionJournal CRUD）
- `/agora/ask`（AskPersonas）
- `/agora/skill-coaching`、`/agora/persona-lab`
- `/agora/alerts/triage`、`/agora/postmortems`
- `/agora/evaluation-suites`
全部對齊前端 `src/agora/pages/*` 既有資料形狀。

### Block 6 — HIQ Layer（P1 #8）
新增 §16 Human-In-Queue：
- `QueueItemDTO`（含 priority / claimedBy / slaDeadline）
- `/hiq/queue`、`/hiq/claim`、`/hiq/release`、`/hiq/escalate`
- Two-man approval：`/hiq/approve` 雙簽 token 流程
- SLA 計時規則對齊 Pack D StateMachine §SLA

### Block 7 — SSE Channel Catalog（P1 #9）
新增 §17 SSE channels（援引 Pack D SSE Event Contract D26-D32）：
- 列出全部 13 channel：artifact / runtime / mcp / skill / channel / tool / ranking / rebalance / evolution / research / signal / inbox / journal / postmortem
- 每 channel 的 event types + payload schema
- Reconnect protocol（Last-Event-Id / heartbeat / replay）

### Block 8 — Platform Endpoints（P1 補強）
新增 §18：
- `/healthz`、`/capabilities`、`/feature-flags`
- `/me`（補 serverTimezone / roles / pendingInterventionsCount / unreadAuditCount）
- `/switch-tenant`、`/locale`、`/audit/export`
- `ConfirmToken` 完整生命週期（POST/GET/DELETE + cooldown）

### Block 9 — Cross-cutting Conventions（P1 補強）
新增 §19：
- API versioning：URL path `/v1/...` + `apiVersion` header（援引 v4 envelope）
- Pagination cursor opacity（base64 opaque，TTL 15min，援引 Pack D D17/D22）
- Bulk endpoint envelope（援引 Pack D D23）
- Attachment policy（援引 Pack D D24）
- Rate limit headers（援引 Pack D D25）
- i18n key namespace lock：`bff.<entity>.<action>` / `errors.<ErrorCode>`

## P2 處理方式
P2 #15/#18/#19/#20 在 Block 9 一併補；其餘 P2 列為 spec-B 結尾「Open Questions」附錄，不阻塞。

## 交付
- 單一 markdown 檔：`/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-B.md`
- 結尾附錄：對應 Pack D 條款交叉表 + 與前端檔案 anchor 對照表
- 同步在 `.lovable/feedback/2026-05-07-B/` 建立索引條目

## 不做
- 不改前端代碼
- 不改 Pack D / v5 spec（只引用）
- 不處理 P2 中與業務未定的部分（artifact upload 路徑、bulk request 細節）
