# Pantheon Frontend Build Spec — Index

Last updated: 2026-05-06 (v5 SA+SD intake)

## Normative order (highest priority first)

1. **`.lovable/spec/v5/`** — v5 SA + SD (2026-05-06). **IA / Loop view-model / Sentinel / HIQ 升級層**。Pack D blockers + Pack E conflicts 已解決，可進入分階段落地。
2. **`.lovable/spec/v4/` + `v4/pack-d/`** — v4 FULL + Pack C (2026-05-05-C) + Pack D (2026-05-06). **Normative type / status enum / permission / BFF / SSE / session / UI contract source of truth.**
3. `.lovable/spec/v3/` — v3 FULL + Part 10 Medium/Low remediation (2026-05-05-B)
4. `.lovable/spec/v2/` — v2 FULL + Part 9 High remediation (2026-05-05-A)
5. `.lovable/spec/` (this folder) — original Parts 1–8 base spec

When implementing IA / Loop / Sentinel / HIQ 概念，prefer v5；status enum / DTO / permission 仍以 v4 為準。fall back to v3/v2/v1 only when both v4 and v5 are silent.

## v5 (newest, IA + Loop layer)

Folder: `.lovable/spec/v5/`

- `Pantheon_v5_Closed_Loop_Supervisor_OS_SA_2026-05-06.md`
- `Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md`
- `Pantheon_v5_INDEX.md`

Companion intake: `.lovable/feedback/2026-05-06-E/Pack_E_Intake_Notes.md`、conflict: `.lovable/audits/spec-conflict-2026-05-06-E.md`

## v4 (current authoritative) + Pack D addendum

Folder: `.lovable/spec/v4/`

- `Pantheon_Frontend_Build_Spec_FULL_v4_zh-TW.md`
- `Pantheon_Frontend_Build_Spec_FULL_v4_en-US.md`
- `Pantheon_Frontend_Build_Spec_v4_INDEX.md`

**Pack D contracts** (`.lovable/spec/v4/pack-d/` — 7 份)：
- `Pantheon_Pack_D_StateMachine_Contract.md` (D-A：D01–D08b)
- `Pantheon_Pack_D_Permission_Contract.md` (D-B：D09–D16)
- `Pantheon_Pack_D_BFF_API_Contract.md` (D-C：D17–D25)
- `Pantheon_Pack_D_SSE_Event_Contract.md` (D-D：D26–D29)
- `Pantheon_Pack_D_DomainRules_Contract.md` (D-E：D30–D38, D60)
- `Pantheon_Pack_D_UI_Tokens_A11y_QA.md` (D-F + D-H：D39–D50, D61–D63)
- `Pantheon_Pack_D_Session_Auth_Tenant_Contract.md` (D-G：D51–D59)

Coverage: 92 (Pack A+B) + 78 (Pack C) + 63 (Pack D) = **233 / 233 SA-SD gaps resolved at spec level**.

Normative order within v4: **Pack D > v4 base FULL > v3 fallback**.

Companion feedback packs:
- `.lovable/feedback/2026-05-05-A/` — Pack A (28 High)
- `.lovable/feedback/2026-05-05-B/` — Pack B (64 M/L)
- `.lovable/feedback/2026-05-05-C/` — Pack C (78 deeper gaps from Audit C)
- `.lovable/feedback/2026-05-06-D/` — Pack D (63 second-order gaps disposition)
- `.lovable/feedback/2026-05-06-E/` — Pack E (v5 conflicts disposition)
- `.lovable/feedback/2026-05-06-F/` — Pack F (write-intent + IA boundary + QA semantics)

## v3 (superseded for Pack-C topics)

Folder: `.lovable/spec/v3/`. Use only when v4 / Pack C is silent.

## v2 / v1 (historical)

`.lovable/spec/v2/` and this folder. Reference only.

## Audits

`.lovable/audits/` — Spec gap audits.
