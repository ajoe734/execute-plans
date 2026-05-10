# Pantheon Current Spec Snapshot — 2026-05-10

唯一最新對外 SoT。任何 audit / planner / FE / BE 應以本目錄為現階段完整規格。

## Layered structure

| 層 | 角色 | 路徑 |
|---|---|---|
| **Normative core** | Entity / Status / Permission / SSE / API contracts | `.lovable/spec/v4/` + `.lovable/spec/v4/pack-d/` |
| **Upgrade layer** | v5 IA / Loop / Sentinel / HIQ | `.lovable/spec/v5/` |
| **BFF Contract v1 (FROZEN)** | OpenAPI + AsyncAPI + DTO catalog + handoff | `.lovable/feedback/2026-05-07-final/` |
| **Backports applied 2026-05-10** | B1/B2/B3 from FE_Blueprint_Gap addendum | Pack D + OpenAPI + AsyncAPI（已落地） |
| **Consolidated snapshot** | 本快照 | `Pantheon_Spec_Current_2026-05-10.md` |

## Conflict precedence

```
v5 (IA / closed-loop OS)
  > v4 + Pack D (normative core, with 2026-05-10 backports)
  > 2026-05-07 Final BFF Contract (transport-level binding)
  > v3 (legacy shim, deprecated)
  > v2 / v1 (historical, do not consult)
```

## What changed 2026-05-10

| Backport | Target spec file | FE artifact already aligned |
|---|---|---|
| B1 ActionCommandStatus named enum | `Pantheon_BFF_OpenAPI_3_1.yaml` §components.schemas | `src/lib/bff-v1/dto.ts` |
| B2 D21 ErrorCode 26 master | `Pantheon_Pack_D_BFF_API_Contract.md` §D21 | `src/lib/v4/errorCodes.ts` |
| B3.1 SSE correlationId required | already in `Pantheon_BFF_AsyncAPI_SSE.md` §2.1 | `src/lib/bff-v1/sse/payloads.ts` (+ `ensureCorrelationId`) |
| B3.2 approval / ask channels | already in AsyncAPI §6 + §8.4；補入 Pack D D26 | `src/lib/bff-v1/sse/channels.ts` |
| B3.3 ApprovalEvent 4 subtypes | already in AsyncAPI §6；補入 Pack D D26 | `src/lib/bff-v1/sse/payloads.ts` |
| B3.4 AskEvent 6 subtypes | already in AsyncAPI §8.4；補入 Pack D D26 | `src/lib/bff-v1/sse/payloads.ts` |
| B3.5 EvidenceKind 19+3 | new AsyncAPI §9.0；Pack D D26 列出 | `src/lib/bff-v1/dto.ts` |
| B3.6 EvidenceKind capability map | new `Pantheon_Pack_D_Permission_Contract.md` §D-EvidenceKind | `src/lib/bff-v1/dto.ts` `EVIDENCE_CAPABILITY_MAP` |

## Files in this snapshot

- `INDEX.md`（本檔）
- `Pantheon_Spec_Current_2026-05-10.md` — single-file consolidated reference

## Cross-references

- Status audit：`.lovable/audits/fe-spec-status-2026-05-10.md`
- Backend live readiness：`.lovable/audits/bff-live-probe-2026-05-09.md`
- Memory：`mem://reference/current-spec`
