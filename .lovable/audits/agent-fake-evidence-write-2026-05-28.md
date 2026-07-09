# Agent fake evidence/journal write — 2026-05-28

## Symptom
User saw the management agent narrate:
> "我已經將剛才所有的觀測證據、API 調用記錄以及『指令接受但未執行』的矛盾點，彙整並標註在系統的 Evidence (證據牆) 與 Evolution Journal (進化日誌) 中。"

…immediately followed by the tool failure card:
```
工具呼叫失敗 · annotate_evidence(404)
errors.RESOURCE_NOT_FOUND
```

## Root cause (two independent bugs)

### Bug 1 — Fabricated tool endpoint
`supabase/functions/management-agent/index.ts` defined an `annotate_evidence` tool that POSTed to
`/bff/evidence/{id}/annotate`. **This endpoint does not exist anywhere in the BFF contract.**

- Pack D BFF API Contract (`.lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md`): no `evidence` write path
- Final OpenAPI (`.lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`): only mentions evidence in §redacted-refs (read semantics)
- `src/lib/bff-v1/paths.ts`: only `mgmtEvidenceExplorer: GET /bff/management/evidence`

The tool was FE-invented and always returned 404. No BE gap — pure FE hallucination at agent-definition time.

### Bug 2 — Pre-narration of success
The model said "我已經…彙整並標註" **before** the tool result returned. Even if the tool had succeeded, this is unsafe behaviour: the user reads the past-tense claim, then sees a 404 card, leaving an ambiguous audit trail. For audit entities (Evidence, Evolution Journal, Audit log) it is especially dangerous because the user may copy the claim into a real report.

## Fix (FE-only, 2026-05-28)

1. **Remove `annotate_evidence` tool** from `supabase/functions/management-agent/index.ts`:
   - Tool definition deleted (replaced with explanatory comment at line ~235).
   - All references in `BASE_SYSTEM_PROMPT` removed.
   - `modeHint('auto')` rewritten: auto mode is now strictly read-only.
   - `delete tools.annotate_evidence` in mode filter removed (no longer registered).

2. **New prompt section "Evidence wall & Evolution Journal rules"** explicitly tells the model:
   > The current BFF exposes ONLY a read explorer at `GET /bff/management/evidence`. There is NO write endpoint for evidence annotation, evolution journal entries, or audit notes. … If the user asks to record/annotate/log, reply that there is no write endpoint, then navigate to `/management/evidence` or `/management/human-inbox`.

3. **New prompt section "CRITICAL — Do NOT pre-narrate tool success"**:
   > Before a tool call returns, NEVER use past tense ("我已經…", "已標註", "已寫入"). Use future tense before calling, then report based on actual `ok: true/false`. For audit entities (Evidence, Evolution Journal, Audit log), NEVER claim a write happened unless a needsApproval write tool is listed in the Tool catalogue. As of now, none exist.

4. **`src/management/components/agent/AgentPanelBody.tsx`**:
   - Removed `"annotate_evidence"` from `ACTIVE_TOOL_NAMES` → historical chat parts now render as "Historical Record" (stale tool) instead of pending approval / success cards.
   - Removed the `isAuto` auto-mode success banner (no auto-mode write tools remain).

5. Edge function `management-agent` redeployed.

## Out of scope (independent BE gaps, NOT addressed here)

- **No BE evidence write path exists.** If product wants user-attached annotations on evidence items, BE must add `POST /bff/evidence/{id}/annotate` (or similar) AND update Pack D contract, AsyncAPI EvidenceKind, and the audit chain hashing semantics. Until then, FE will not expose any write affordance.
- **No BE evolution-journal write path exists.** Same status as above.
- **Sentinel rule gap**: 13 personas in `degraded (score 85)` with reasons `persona_lifecycle_not_active` + `no_runtime_binding` produce **no Sentinel findings**. This is a BE rule-coverage gap, tracked separately. FE cannot fix.

## Verification

1. Restart chat → in any mode (auto/draft/confirm/agent), `annotate_evidence` is no longer in the tool catalogue.
2. Prompt "請幫我把剛才的觀測寫進 evidence / journal" → model now responds with "目前 BFF 沒有 evidence/journal 寫入端點" and offers navigation to `/management/evidence` or `/management/human-inbox`. No 404 tool card.
3. Old chat threads that contain `annotate_evidence` parts render with the muted "Historical Record / 此工具已下線" badge, no approve/reject buttons.
4. Model no longer uses past-tense "我已經…" before a tool result returns (test with any write request).

## Cross-references
- `.lovable/audits/bff-backend-write-gap-2026-05-28.md` — updated to list `annotate_evidence` and `journal/*` as NOT IN SPEC.
- `.lovable/audits/persona-no-delete-2026-05-28.md` — sibling fix (same anti-fake-tool pattern, different domain).
