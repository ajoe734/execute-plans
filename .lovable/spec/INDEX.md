# Pantheon Frontend Build Spec — Index

Last updated: 2026-05-05 (v4)

## Normative order (highest priority first)

1. **`.lovable/spec/v4/`** — v4 FULL + Pack C remediation (2026-05-05-C). **Authoritative.**
2. `.lovable/spec/v3/` — v3 FULL + Part 10 Medium/Low remediation (2026-05-05-B)
3. `.lovable/spec/v2/` — v2 FULL + Part 9 High remediation (2026-05-05-A)
4. `.lovable/spec/` (this folder) — original Parts 1–8 base spec

When implementing, **always prefer v4**; fall back to v3/v2/v1 only when v4 is silent.

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
