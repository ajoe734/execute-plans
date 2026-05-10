# FE × Spec Status — 2026-05-10（唯一最新整合狀態表）

> Supersedes：`fe-blueprint-gap-2026-05-09.md`
> Spec snapshot：`.lovable/spec/current/`
> Tests：**366/366 green**；FE coverage ~98%

---

## 0. Executive summary

| 群 | 條數 | 狀態 |
|---|---:|---|
| **A. Backend pending** | 5 P0 + ~39 entity registries | BACKEND_IMPLEMENTATION_PENDING（FE no-op） |
| **B. Spec backport** | 8（B1, B2, B3.1–B3.6） | ✅ **RESOLVED_BY_FE_BACKPORT_2026-05-10** |
| **C. FE tail** | 5（C1–C5） | ✅ LANDED 2026-05-09 |
| **D. Optional enhancement** | 4（D1–D4） | ✅ LANDED 2026-05-09；剩餘為 product backlog |
| **G. spec-conflict** | 8（G01/05/06/07/09/12/13/14） | ✅ LANDED |
| **H. version backlog** | 3（H1/H2/H3） | ✅ FE CLOSED |

**沒有任何條目在等系統設計團隊回答**。

---

## 1. A 組 — Backend P0 endpoint readiness

Source：`bff-live-probe-2026-05-09.md`。Live BFF 43 個 canonical endpoint 中僅 ~9% 實作。

| 區 | Endpoint | live HTTP | FE fallback |
|---|---|---|---|
| P0-A Session | `GET /bff/me`、`POST /bff/auth/refresh`、`POST /bff/logout` | 404 | mock 模式 bootstrap |
| P0-B OpenAPI | `GET /openapi.json` | 500 | n/a |
| P0-C Action | `POST /bff/actions/{type}/{id}/{actionId}` | 404 | `VITE_BFF_FALLBACK=auto` 退 mock |
| P0-D Decide | `POST /bff/approvals/{id}/decide`、`/v5/interventions/{id}/decide` | 404 | mock writeOverlay |
| P0-E Registries | strategies / personas / capital-pools / deployments / jobs / alerts / incidents / audit | 部分 401，多數 404 | mock seed |

**FE 動作**：無。`paths.ts` 已對齊 canonical；`.env.example` 預設 `VITE_BFF_MODE=mock`。
**Handoff**：lupin BE team。

---

## 2. B 組 — Spec backport ✅ RESOLVED_BY_FE_BACKPORT_2026-05-10

| ID | Backport target | Commit |
|---|---|---|
| B1 | `Pantheon_BFF_OpenAPI_3_1.yaml` `components.schemas.ActionCommandStatus` named enum；`ActionCommandResponseData.status` `$ref` | 2026-05-10 |
| B2 | `Pantheon_Pack_D_BFF_API_Contract.md` §D21：23 → 26 條（+RESOURCE_NOT_FOUND / APPROVAL_REQUIRED / CONFIRM_TOKEN_REVOKED） | 2026-05-10 |
| B3.1 | AsyncAPI §2.1 已標 correlationId required（pre-existing）；Pack D D26 envelope 同步 | 2026-05-10 |
| B3.2 | Pack D D26 channel 清單加 `approval` / `ask` first-class | 2026-05-10 |
| B3.3 | Pack D D26 加 `ApprovalEvent` 4 子型別 union | 2026-05-10 |
| B3.4 | Pack D D26 加 `AskEvent` 6 子型別 union | 2026-05-10 |
| B3.5 | Pack D D26 + AsyncAPI §9.0 列 `CanonicalEvidenceKind` 19 + `LegacyEvidenceKindAlias` 3 | 2026-05-10 |
| B3.6 | `Pantheon_Pack_D_Permission_Contract.md` §D-EvidenceKind capability map（19+3） | 2026-05-10 |

FE artifact 一律已 align：`src/lib/v4/errorCodes.ts`、`src/lib/bff-v1/dto.ts`、`src/lib/bff-v1/sse/{channels,payloads}.ts`、`ensureCorrelationId`。

---

## 3. C 組 — FE tail ✅ LANDED 2026-05-09

| ID | Item | Artifact |
|---|---|---|
| C1 | v3 lib deprecation header + ESLint `no-restricted-imports` warn | `src/lib/v3/index.ts`、`eslint.config.js` |
| C2 | `src/lib/v5/timeoutPolicy.ts` deprecated（superseded by `v4/asyncTransitionPolicy`） | 同上 |
| C3 | v5 axe smoke 擴覆 PersonaHealthMatrix | `src/test/a11y-axe-smoke-v5.test.tsx` |
| C4 | G05 AuditTimeline `ephemeral` badge tooltip + i18n `audit.ephemeralTooltip` | AuditTimeline component |
| C5 | UI walkthrough notes | `.lovable/audits/ui-walkthrough-2026-05-09.md` |

---

## 4. D 組 — Optional enhancement ✅ LANDED 2026-05-09

| ID | Item |
|---|---|
| D1 | PersonaHealthMatrix sparkline |
| D2 | Intervention batch decide |
| D3 | Sentinel timeline view |
| D4 | ControlRoom cross-section severity focus filter |

**剩餘可深化（product backlog，非缺漏）**：cross-region drill-down、saved view、Loop stage detail evidence drawer 拓展。

---

## 5. G 組 — spec-conflict ✅ LANDED

| ID | Item |
|---|---|
| G01 | 文件化 |
| G05 | AuditTimeline ephemeral badge + tooltip |
| G06 | `ENTITY_TO_SSE_CHANNEL` + `isSseChannel` guard |
| G07 | `LoopFocus` enum |
| G09 | 文件化 |
| G12 | `writeOverlay.startGcTimer()` |
| G13 | audit prevHash/hash placeholder |
| G14 | `withOverlay` 可選排序 |

---

## 6. H 組 — version backlog ✅ FE CLOSED

| ID | Item |
|---|---|
| H1 | `X-BFF-Api-Version` global header + mismatch banner |
| H2 | Pack D D21 ErrorCode master（FE 已 26 條，2026-05-10 markdown 同步） |
| H3 | OpenAPI named `ActionCommandStatus`（2026-05-10 已 backport） |

---

## 7. Open questions to systems-design team

**0 條**。所有 backport 已成 instruction，本表無等待裁示項。

---

## 8. Verification

```bash
grep -c RESOURCE_NOT_FOUND .lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md   # ≥ 1
grep -c "ApprovalEvent\|AskEvent" .lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md  # ≥ 2
grep -c "D-EvidenceKind" .lovable/spec/v4/pack-d/Pantheon_Pack_D_Permission_Contract.md   # ≥ 1
grep -c "ActionCommandStatus:" .lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml  # ≥ 1
```

執行於 2026-05-10：全部命中。

---

## 9. Cross-references

- Spec snapshot：`.lovable/spec/current/INDEX.md`
- Consolidated spec：`.lovable/spec/current/Pantheon_Spec_Current_2026-05-10.md`
- Live probe：`.lovable/audits/bff-live-probe-2026-05-09.md`
- Walkthrough：`.lovable/audits/ui-walkthrough-2026-05-09.md`
- BFF Contract Final：`.lovable/feedback/2026-05-07-final/`
- FE_Blueprint_Gap addendum：`.lovable/feedback/2026-05-09-addendum/`
