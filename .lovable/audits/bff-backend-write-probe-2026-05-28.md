# BFF Backend Write-Path Probe — 2026-05-28

Generated: 2026-05-28T05:42:26.285Z
BFF base: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io

Total endpoints: 31
- ✅ implemented: 23
- ❌ NOT implemented: 8
- ⚠️ BE error: 0
- ? other: 0

Probe method: dev-only IDs + `X-Dry-Run: 1` + dev bearer. Any 4xx-typed envelope counts as "implemented".

## P0-D

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ✅ implemented | 201 | POST | /bff/strategies | success | {"data":{"id":"strategy-20260528-aeeec016","name":"dev-probe","owner":"pantheon-dev-browser","updatedAt":"2026-05-28T05:42:17Z","state":"dra |
| ✅ implemented | 201 | POST | /bff/personas | success | {"data":{"id":"persona-20260528-e4eae627","name":"dev-probe","owner":"pantheon-dev-browser","updatedAt":"2026-05-28T05:42:18Z","state":"draf |
| ✅ implemented | 201 | POST | /bff/capital-pools | success | {"id":"pool-20260528-544d35c9","pool_id":"pool-20260528-544d35c9","name":"dev-probe","status":"draft","risk_policy_ref":null,"params":{},"cr |
| ✅ implemented | 422 | POST | /bff/rebalances | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"capital_pool_id is required","retryable":false,"userAct |
| ✅ implemented | 201 | POST | /bff/deployments | success | {"status":"accepted","data":{"status":"accepted","command":"CreateDeployment","commandId":"cmd-692fe792082b44e8","command_id":"cmd-692fe7920 |
| ❌ NOT implemented | 405 | POST | /bff/runtimes | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ✅ implemented | 201 | POST | /bff/ranking-formulas | success | {"data":{"id":"0ccee83e25f3","name":"dev-probe","expression":"sharpe"},"meta":{"snapshot_at":"2026-05-28T05:42:19Z"}} |
| ✅ implemented | 201 | POST | /bff/research-experiments | success | {"data":{"id":"d3851e2bede5","name":"dev-probe","hypothesis":"h","metric":"sharpe"},"meta":{"snapshot_at":"2026-05-28T05:42:19Z"}} |
| ✅ implemented | 201 | POST | /bff/skills | success | {"id":"skill-20260528-b9b24e0d","skill_id":"skill-20260528-b9b24e0d","name":"dev-probe","status":"draft","description":"","sandbox_enabled": |

## P1-A

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ✅ implemented | 422 | POST | /bff/actions/strategies/strategy-dev/promote_live | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Unsupported action entity type","retryable":false,"user |
| ✅ implemented | 422 | POST | /bff/actions/strategies/strategy-dev/pause | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Unsupported action entity type","retryable":false,"user |
| ✅ implemented | 422 | POST | /bff/actions/strategies/strategy-dev/throttle | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Unsupported action entity type","retryable":false,"user |
| ✅ implemented | 422 | POST | /bff/actions/strategies/strategy-dev/archive | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Unsupported action entity type","retryable":false,"user |
| ✅ implemented | 422 | POST | /bff/actions/strategies/strategy-dev/edit | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Unsupported action entity type","retryable":false,"user |
| ✅ implemented | 403 | POST | /bff/approvals/approval-dev/decide | auth/role rejected | {"error":{"code":"FORBIDDEN","i18nKey":"errors.FORBIDDEN","message":"Approval decide requires 'approver' or 'admin' role","retryable":false, |
| ❌ NOT implemented | 404 | POST | /bff/command-confirmations/token-dev/confirm | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |

## P1-C

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ✅ implemented | 202 | POST | /bff/v5/sentinel/findings/finding-dev/status | success | {"status":"accepted","data":{"status":"accepted","command":"SentinelFindingStatus","commandId":"cmd-c45eb4cb842c4740","command_id":"cmd-c45e |
| ✅ implemented | 202 | POST | /bff/v5/sentinel/remediation/build | success | {"status":"accepted","data":{"status":"accepted","command":"SentinelRemediationBuild","commandId":"cmd-06fd7b57024d44e8","command_id":"cmd-0 |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/claim | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-e545798dc16f4033","command_id":"cmd-e5457 |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/release | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-c8656837bc6a40ca","command_id":"cmd-c8656 |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/escalate | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-caa8ac915d414d48","command_id":"cmd-caa8a |
| ✅ implemented | 403 | POST | /bff/v5/interventions/intervention-dev/decide | auth/role rejected | {"error":{"code":"FORBIDDEN","i18nKey":"errors.FORBIDDEN","message":"DecideV5Intervention requires 'operator', 'approver', or 'admin' role", |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/two-man-sign | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-57e52465910f4103","command_id":"cmd-57e52 |
| ❌ NOT implemented | 405 | POST | /bff/v5/interventions/batch-decide | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |

## P1-E

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ❌ NOT implemented | 405 | POST | /bff/agora/signals | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ❌ NOT implemented | 404 | POST | /bff/agora/feedback | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ❌ NOT implemented | 404 | POST | /bff/agora/inbox/inbox-dev/triage | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ✅ implemented | 201 | POST | /bff/agora/journal | success | {"data":{"id":"journal-agora-f92c72620c","title":"dev-probe","body":"probe","tags":[],"linkedStrategyIds":[],"linkedPersonaIds":[],"visibili |
| ❌ NOT implemented | 404 | POST | /bff/agora/skill-coaching | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ❌ NOT implemented | 405 | POST | /bff/agora/postmortems | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ✅ implemented | 201 | POST | /bff/agora/ask/sessions | success | {"data":{"id":"ask-e1c32ef6ce","sessionId":"ask-e1c32ef6ce","title":"Agora ask session","mode":"quick_ask","status":"active","participants": |
