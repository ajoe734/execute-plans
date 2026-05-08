# Planner Response — Stage 2 A-group P0 Compatibility Audit (2026-05-08)

**Source**: `Pantheon_Planner_Response_to_Lovable_Stage2_Audit_2026-05-08.md`
**Scope**: Audit of Lovable's Stage 2 A-group P0 work (歸檔 + EvidenceKind/RedactedEvidenceRef/Role/SSE compatibility decisions).
**Decision**: ACCEPT WITH CLARIFICATION — keep FE superset/alias; backend canonical narrower; spec backports pending.

## Final Status (post-audit)

| ID | Status | Note |
|---|---|---|
| I1 | RESOLVED_BY_COMPATIBILITY_LAYER | FE 22 accepted (19 canonical + 3 legacy aliases) |
| I2 | RESOLVED_BY_COMPATIBILITY_LAYER | Backend canonical = `redactionReasonCode` + `requiredCapability`; FE keeps `reason` + `capabilityRequired` aliases via normalizer |
| I3 | ACCEPTED_STAGE4 | 12-role canonical for `/bff/me`; 5-role mock is valid subset; capabilities are source of truth |
| A1 | FE_READY_OPENAPI_BACKPORT_PENDING | `ActionCommandStatus` named enum needs OpenAPI YAML backport |
| A2 | FE_READY_PACKD_BACKPORT_PENDING | 26-code list canonical at FE; Pack D D21 markdown backport pending |
| A3 | FE_READY_ASYNCAPI_BACKPORT_PENDING | 32 channels OK; AsyncAPI must require `correlationId`; FE may keep optional via `ensureCorrelationId()` |

## FE actions landed this round

1. Archived planner response (this folder).
2. Updated `.lovable/feedback/2026-05-07-planner-response/INDEX.md` §5 wording per planner §5.
3. Updated `.lovable/feedback/2026-05-07-planner-response/Disposition.csv` with audit statuses (I1/I2/I3 added; A1/A2/A3 reflagged).
4. `src/lib/bff-v1/dto.ts`:
   - Split `EvidenceKind` into `CanonicalEvidenceKind | LegacyEvidenceKindAlias`; added constants and `isLegacyEvidenceKind()`.
   - Added `RedactionReasonCode`, `CanonicalRedactedEvidenceRef`, `normalizeRedactedEvidenceRef()`.
   - Updated comments per planner §2.6.
5. `src/lib/bff-v1/sse/payloads.ts`: added `ensureCorrelationId()` helper.
6. `src/lib/bff-v1/sse/channels.ts`: added comment marking `correlationId?:` as FE compatibility-only (AsyncAPI requires required).
7. `src/lib/v4/errorCodes.ts`: added "PackD backport pending" comment.
8. `src/lib/v4/roleCapabilities.ts`: added unknown-role policy comment.
9. New tests: `src/lib/bff-v1/__tests__/plannerStage2Audit.test.ts`.

## Backport ownership (NOT FE)

- `Pantheon_BFF_OpenAPI_3_1.yaml` — add `ActionCommandStatus` schema; reference inline.
- `.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md` — D21 add `RESOURCE_NOT_FOUND` / `APPROVAL_REQUIRED` / `CONFIRM_TOKEN_REVOKED`.
- `Pantheon_BFF_AsyncAPI_SSE.md` — `correlationId` required.

Until those land, smoke reports MUST NOT claim spec backport closed.
