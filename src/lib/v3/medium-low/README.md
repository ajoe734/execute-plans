# v3 Part 10 — Medium / Low gap remediation

64 gaps from Pack B (`.lovable/feedback/2026-05-05-B/`) resolved at type/contract level.

| Batch | Module | Gaps | Topic |
|---|---|---|---|
| B1 | `B1-platform.ts` | G06, G07, G08, G09, G10, G11, G12, G74, G81 | locale, notifications, drawer surfaces, search, ADR, design tokens, BFF errors |
| B2 | `B2-entities.ts` | G20, G21, G22, G23, G24, G25, G26, G27, G39, G40, G43, G48, G52, G61, G65, G73, G80 | incident, memory, capability separation, insight lineage, jobs, audit retention, full handoff |
| B3 | `B3-console.ts` | G34, G35, G36, G37, G38, G41, G42, G44, G45, G46, G47, G72 | Command Center KPIs, Strategies sort/filter, Run Experiment, Risk/Review SoT, Skill sandbox, Lineage limits, SSE catalog, Empty/Loading/Error templates |
| B4 | `B4-agora.ts` | G50, G51, G53, G54, G55, G59, G60, G62, G63, G64 | Persona ask modes, committee templates, trainer suites, prohibited actions, default route, notebook md, persona lab commit, channel detail |
| B5 | `B5-misc.ts` | G69, G70, G71, G75, G76, G77, G79, G82, G83, G84, G85, G87, G88, G89, G90, G91, G92 | message attachments, missing BFF endpoints, Accept-Language, date/money, review participants, memo limits, formula shortcuts, namespacing, event stream retain, form validation, mock naming, demo scenarios, prompt budget, route param patterns |

All modules export pure types + small const tables — they can be imported by Management / Agora pages incrementally without runtime risk. The high-severity counterparts (Pack A) live alongside in `src/lib/v3/*.ts`.
