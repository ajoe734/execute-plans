## 目標

把 2026-05-08 Planner 對 Stage 2 A 組 P0 的回覆完整歸檔，並依其六條裁示調整 FE：
**核心原則**：FE 保留 superset / alias 相容層；backend-facing canonical 必須更窄、明確標註，且不得宣稱 spec backport 已完成（要等 OpenAPI / Pack D / AsyncAPI 真的更新）。

---

## 一、歸檔（純文檔）

新增到 `.lovable/feedback/2026-05-08-planner-stage2-audit/`：

```
Pantheon_Planner_Response_to_Lovable_Stage2_Audit_2026-05-08.md   ← 原文 copy
INDEX.md                                                           ← 摘要 + 6 條裁示對照
```

並在 `.lovable/feedback/2026-05-07-planner-response/INDEX.md` 加 cross-ref：「Stage 2 A 組已收到 2026-05-08 Planner 回覆，見 `../2026-05-08-planner-stage2-audit/`」。

---

## 二、文檔/狀態調整（非行為變更）

### 2.1 更新 `.lovable/feedback/2026-05-07-planner-response/INDEX.md`

§5 三列改寫為 planner §5.1–5.3 指定文案：
- I1：「FE accepted union = 22 values：19 canonical + 3 legacy aliases (snapshot/rebalance/experiment)。Backend SHOULD emit canonical 19 only。」
- I2：「Backend canonical = redactionReasonCode + requiredCapability；FE alias reason + capabilityRequired 為相容欄位，由 normalizer 統一。」
- I3：「12-role 為 BFF `/bff/me` canonical；目前 5-role FE mock 為 subset；Capabilities 為 source of truth。」

### 2.2 更新 `Disposition.csv`

加入或修改 6 列：

```
I1,RESOLVED_BY_COMPATIBILITY_LAYER,...
I2,RESOLVED_BY_COMPATIBILITY_LAYER,...
I3,ACCEPTED_STAGE4,...
A1,FE_READY_OPENAPI_BACKPORT_PENDING,...
A2,FE_READY_PACKD_BACKPORT_PENDING,...
A3,FE_READY_ASYNCAPI_BACKPORT_PENDING,...
```

### 2.3 註解修正

- `src/lib/bff-v1/dto.ts`：把 `redactionReasonCode alias 對齊 planner` 改為「`redactionReasonCode` + `requiredCapability` are backend canonical；`reason` / `capabilityRequired` are FE legacy aliases (normalized via `normalizeRedactedEvidenceRef`)」。
- `src/lib/v4/errorCodes.ts`：在 26 list 上方加 `// FE_READY — Pack D D21 markdown backport pending（do not claim spec backported）`。
- `src/lib/bff-v1/sse/channels.ts` + `payloads.ts`：在 `SseEvent.correlationId?:` 上方加註「FE compatibility-only optional；backend AsyncAPI 必須 required；mock 走 `ensureCorrelationId()`」。

---

## 三、程式碼落地（小幅、相容層）

### 3.1 `src/lib/bff-v1/dto.ts` — EvidenceKind 三層化

宣告 named subtype（不改實際 union 成員，只是命名 + 標籤）：

```ts
export type CanonicalEvidenceKind = /* 19 values */;
export type LegacyEvidenceKindAlias = "snapshot" | "rebalance" | "experiment";
export type EvidenceKind = CanonicalEvidenceKind | LegacyEvidenceKindAlias;

export const CANONICAL_EVIDENCE_KINDS: readonly CanonicalEvidenceKind[] = [...];
export const LEGACY_EVIDENCE_KIND_ALIASES: readonly LegacyEvidenceKindAlias[] = [...];
export function isLegacyEvidenceKind(k: EvidenceKind): k is LegacyEvidenceKindAlias;
```

在 `EVIDENCE_CAPABILITY_MAP` 表格註解加 `// legacy alias` 標記三項。

### 3.2 `src/lib/bff-v1/dto.ts` — RedactedEvidenceRef normalizer

新增 export（與既有 interface 並存，欄位不變）：

```ts
export type RedactionReasonCode =
  | "INSUFFICIENT_CAPABILITY"
  | "TENANT_SCOPE_MISMATCH"
  | "POLICY_REDACTED";

export interface CanonicalRedactedEvidenceRef {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: RedactionReasonCode;
  requiredCapability?: string;
}

export function normalizeRedactedEvidenceRef(
  input: RedactedEvidenceRef,
): CanonicalRedactedEvidenceRef;
```

mapping 依 §2.4 表格（`PERMISSION_DENIED`/`CAPABILITY_MISSING` → `INSUFFICIENT_CAPABILITY`；`TENANT_SCOPE_MISMATCH` 同名）。

### 3.3 `src/lib/bff-v1/sse/payloads.ts` — `ensureCorrelationId` helper

新增 export：

```ts
export function ensureCorrelationId<E extends { id: string; correlationId?: string }>(
  event: E,
): E & { correlationId: string };
```

mock event bridge / `liveSse` 接收端引用，保留 `correlationId?:` 不動以維持相容。

### 3.4 `src/lib/v4/roleCapabilities.ts` — 12-role superset 補齊

階段 4 已落 12-role；本輪只補：
- 確認 Role union 為 planner §3.2 12 值（現況檢查；若已對齊則僅補註解）。
- 加註「Capabilities are source of truth；unknown role 不 crash、不推導、保留字串、dev/test 才 warn」並在 `usePermissions` 對 unknown role 加 `if (import.meta.env.DEV) console.warn(...)` 一行。

### 3.5 測試

新增 `src/lib/bff-v1/__tests__/plannerStage2Audit.test.ts`：
- `CANONICAL_EVIDENCE_KINDS.length === 19`、`LEGACY... === 3`、`isLegacyEvidenceKind('snapshot')` true。
- `normalizeRedactedEvidenceRef` 三條 mapping。
- `ensureCorrelationId` 補值與保留原值。
- 12-role superset 完整性。

確保既有 350 tests 全綠。

---

## 四、明確不做

- 不收窄任何既有 union（保 22 值 / `reason` union / `correlationId?` 全部保留）。
- 不修改 backend-facing OpenAPI / AsyncAPI / Pack D markdown（那是 planner / BE 工作；本輪只標 *_BACKPORT_PENDING）。
- 不改任何 UI、business logic、design token、route。

---

## 五、執行順序

1. 歸檔原文 + INDEX（階段 A）。
2. 文檔狀態 / CSV / 註解修正（階段 B）。
3. 程式碼相容層 dto / payloads / roleCapabilities + 測試（階段 C）。
4. 更新 `mem://index.md` core line（加「Stage 2 audit applied 2026-05-08：canonical/alias 分層 + normalizer + ensureCorrelationId + 12-role superset 鎖定；A1/A2/A3 spec backport pending」）。

預估 ~12 檔（4 新增、6 編輯、2 memory）。一次提交、可逐項 review。
