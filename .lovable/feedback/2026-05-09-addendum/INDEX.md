# 2026-05-09 FE Blueprint Gap — Missing Spec Addendum

- Source: `FE_Blueprint_Gap_Missing_Spec_Addendum_2026-05-09.md` (Planner, APPROVED)
- Targets: `.lovable/audits/fe-blueprint-gap-2026-05-09.md` 中 A/B/C/D 四組剩餘工作
- Status vocabulary: BACKEND_IMPLEMENTATION_PENDING / SPEC_BACKPORT_REQUIRED / FE_IMPLEMENTATION_READY / FE_VALIDATION_PENDING / PRODUCT_ENHANCEMENT_OPTIONAL / RESOLVED_BY_THIS_ADDENDUM

## Scope per group

| Group | Disposition |
|---|---|
| A | Backend P0 endpoint readiness (FE no-op) — see addendum §2 |
| B | Spec backport canonical (FE 已 ready) — see addendum §3 |
| C | FE governance/QA tail (executable now) — see addendum §4 |
| D | Optional product enhancement backlog (not blocker) — see addendum §5 |

## B group — FE coverage status (verified 2026-05-09)

| ID | Spec | FE artifact | Status |
|---|---|---|---|
| B1 (A1) | OpenAPI named `ActionCommandStatus` enum [accepted, queued, completed] | `src/lib/bff-v1/dto.ts` `ACTION_COMMAND_STATUSES` + `isActionCommandStatus` + `ActionCommandStatus` type | FE_READY — awaits OpenAPI YAML backport |
| B2 (A2) | Pack D D21 ErrorCode master 26 條（+ RESOURCE_NOT_FOUND / APPROVAL_REQUIRED / CONFIRM_TOKEN_REVOKED） | `src/lib/v4/errorCodes.ts` 26 條全收齊；i18n en/zh 全翻齊 | FE_READY — awaits Pack D markdown + OpenAPI backport |
| B3.1 | SSE envelope `correlationId` required | `src/lib/bff-v1/sse/payloads.ts` + `ensureCorrelationId()` normalize layer | FE_READY — awaits AsyncAPI backport |
| B3.2 | AsyncAPI 必含 `approval` / `ask` channel | `src/lib/bff-v1/sse/channels.ts` 已列為 first-class | FE_READY |
| B3.3 | ApprovalEvent 4 子型別 | `src/lib/bff-v1/sse/payloads.ts` 已建模 | FE_READY |
| B3.4 | AskEvent 6 子型別 | `src/lib/bff-v1/sse/payloads.ts` 已建模 | FE_READY |
| B3.5 | EvidenceKind 19 canonical + 3 legacy alias | `src/lib/bff-v1/dto.ts` `CanonicalEvidenceKind` + `LegacyEvidenceKindAlias` + guards | FE_READY |
| B3.6 | EvidenceKind → capability map | `src/lib/bff-v1/dto.ts` `EVIDENCE_CAPABILITY_MAP`（19+3） | FE_READY — awaits Permission Contract backport |

**結論**：B 組所有規格在 FE 端均已 RESOLVED_BY_THIS_ADDENDUM；剩 backport（OpenAPI YAML / Pack D D21 markdown / AsyncAPI / Permission Contract）由 Planner 落到 spec markdown 即可，前端零 code 變動。

## Cross-references
- Audit: `.lovable/audits/fe-blueprint-gap-2026-05-09.md`
- Live probe: `.lovable/audits/bff-live-probe-2026-05-09.md`
- BFF Final contract: `.lovable/feedback/2026-05-07-final/`
- H-version backlog (closed FE side): `.lovable/feedback/2026-05-07-final/H_VERSION_BACKLOG.md`
