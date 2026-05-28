# BFF Backend Write-Path Gap — 2026-05-28

## Scope correction

`bff-backend-gap-2026-05-25-delta-v5.md` 宣告 "ALL CLEAR" 但**僅覆蓋 GET / read-path**：

- CORS preflight ✅
- error envelope canonical ✅
- §8 PM-Live 14 + §9 PM-12 + paths.mgmt* 共 21/21 GET=200 ✅
- `GET /bff/command-confirmations/{token}` 200 ✅

**沒有任何 write 端點被 BE re-probe**。先前 mem index 寫「BFF handoff = COMPLETE」是 read-only 範圍，已撤回。

## Write batches still OPEN

對照 `.lovable/feedback/2026-05-07-final/Pantheon_BFF_Backend_Handoff.md`：

### P0-D — Entity create (status: ❌ not verified)

| Path | Method | Spec | Probe |
|---|---|---|---|
| /bff/strategies | POST | OpenAPI §4 | ⬜ |
| /bff/personas | POST | OpenAPI §4 | ⬜ |
| /bff/capital-pools | POST | OpenAPI §4 | ⬜ |
| /bff/rebalances | POST | OpenAPI §4 | ⬜ |
| /bff/deployments | POST | OpenAPI §4 | ⬜ |
| /bff/runtimes | POST | OpenAPI §4 | ⬜ |
| /bff/ranking-formulas | POST | OpenAPI §4 | ⬜ |
| /bff/research-experiments | POST | OpenAPI §4 | ⬜ |
| /bff/skills | POST | OpenAPI §4 | ⬜ |

### P1-A — Action commands (status: ❌ not verified)

| Path pattern | Method | Spec | Probe |
|---|---|---|---|
| /bff/actions/strategies/{id}/promote_live | POST | OpenAPI §6 ActionCommand | ⬜ |
| /bff/actions/strategies/{id}/pause | POST | OpenAPI §6 | ⬜ |
| /bff/actions/strategies/{id}/throttle | POST | OpenAPI §6 | ⬜ |
| /bff/actions/strategies/{id}/archive | POST | OpenAPI §6 | ⬜ |
| /bff/actions/strategies/{id}/edit | POST | OpenAPI §6 | ⬜ |
| /bff/approvals/{id}/decide | POST | OpenAPI §6 | ⬜ |
| /bff/command-confirmations/{token}/confirm | POST | OpenAPI §6 | ⬜ |

### P1-C — v5 Sentinel + HIQ writes (status: ❌ not verified)

| Path | Method | Spec | Probe |
|---|---|---|---|
| /bff/v5/sentinel/findings/{id}/status | POST | v5 SA §3 | ⬜ |
| /bff/v5/sentinel/remediation/build | POST | v5 SA §3 | ⬜ |
| /bff/v5/interventions/{id}/claim | POST | v5 SA §4 | ⬜ |
| /bff/v5/interventions/{id}/release | POST | v5 SA §4 | ⬜ |
| /bff/v5/interventions/{id}/escalate | POST | v5 SA §4 | ⬜ |
| /bff/v5/interventions/{id}/decide | POST | v5 SA §4 | ⬜ |
| /bff/v5/interventions/{id}/two-man-sign | POST | v5 SA §4 | ⬜ |
| /bff/v5/interventions/batch-decide | POST | v5 SA §4 | ⬜ |

**⚠️ Spec 沒有 `POST /bff/v5/interventions` (create)。** Interventions 由 Sentinel `remediation/build` 自動生成。先前 `management-agent` 的 `create_intervention` 工具會 404，已移除。

### P1-E — Agora writes (status: ❌ not verified)

| Path | Method | Spec | Probe |
|---|---|---|---|
| /bff/agora/signals | POST | OpenAPI §10 | ⬜ |
| /bff/agora/feedback | POST | OpenAPI §10 | ⬜ |
| /bff/agora/inbox/{id}/triage | POST | OpenAPI §10 | ⬜ |
| /bff/agora/journal | POST | OpenAPI §10 | ⬜ |
| /bff/agora/skill-coaching | POST | OpenAPI §10 | ⬜ |
| /bff/agora/postmortems | POST | OpenAPI §10 | ⬜ |
| /bff/agora/ask/sessions | POST | OpenAPI §10 | ⬜ |

## FE mitigation (已 LANDED 2026-05-28)

1. **`src/lib/bff-v1/writeFallback.ts`** — `withWriteFallback<T>(fn, { entity, payload })`：
   - 執行 BE write
   - 若回 `404 / 501 / METHOD_NOT_ALLOWED` 或 code = `NOT_IMPLEMENTED / RESOURCE_NOT_FOUND`：寫 `writeOverlay`（30min TTL）+ `liveStatus.recordWriteDegraded(path)` + emit realtime envelope 模擬成功
   - 其他 error：正常傳遞 typed error envelope

2. **`LiveStatusBanner`** 加 `writeDegraded` 紅色 strip：顯示「BE write endpoint 未上線 — 本地 draft only (30min TTL)」+ 過去 5min fallback 次數 + 端點清單 popover。

3. **`supabase/functions/management-agent/index.ts`**：
   - **移除** `create_intervention`（spec 不存在）
   - **新增** `decide_intervention(id, decision, memo)` → `POST /bff/v5/interventions/{id}/decide`
   - **新增** `request_sentinel_remediation(findingId, plan)` → `POST /bff/v5/sentinel/remediation/build`
   - prompt 更新：建立 intervention = Sentinel finding → remediation/build → 自動生成

## Next steps

- 跑 `scripts/probe-bff-write-paths.mjs` 拿真實 status code → `.lovable/audits/bff-backend-write-probe-2026-05-28.md`
- 把結果回灌給 BE owner，明確區分「已實作」/「未實作」/「precondition 失敗但已上線」
