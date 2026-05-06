# Pantheon Frontend Build Spec — Index

Last updated: 2026-05-06 (v5 SA+SD intake)

## Normative order (highest priority first)

1. **`.lovable/spec/v5/`** — v5 SA + SD (2026-05-06). **IA / Loop view-model / Sentinel / HIQ 升級層**，疊加於 v4 normative 之上。落地待 Pack D blockers + Pack E conflicts 解決。
2. **`.lovable/spec/v4/`** — v4 FULL + Pack C remediation (2026-05-05-C). **Normative type / status enum / API contract source of truth.**
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

## v4 (current authoritative)

Folder: `.lovable/spec/v4/`

- `Pantheon_Frontend_Build_Spec_FULL_v4_zh-TW.md`
- `Pantheon_Frontend_Build_Spec_FULL_v4_en-US.md`
- `Pantheon_Frontend_Build_Spec_v4_INDEX.md`

Coverage: 92 (Pack A+B) + 78 (Pack C) = 170 / 170 SA-SD gaps resolved at spec level.

Companion feedback packs:
- `.lovable/feedback/2026-05-05-A/` — Pack A (28 High)
- `.lovable/feedback/2026-05-05-B/` — Pack B (64 M/L)
- `.lovable/feedback/2026-05-05-C/` — Pack C (78 deeper gaps from Audit C)

## v3 (superseded for Pack-C topics)

Folder: `.lovable/spec/v3/`. Use only when v4 / Pack C is silent.

## v2 / v1 (historical)

`.lovable/spec/v2/` and this folder. Reference only.

## Audits

`.lovable/audits/` — Spec gap audits.
