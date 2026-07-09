# BFF Backend Write-Path Probe — 2026-05-28

Generated: 2026-05-31T14:41:42.069Z
BFF base: https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io

Total endpoints: 31
- ✅ implemented: 23
- ❌ NOT implemented: 8
- ⚠️ BE error: 0
- ? other: 0

Probe method: dev-only IDs + `X-Dry-Run: 1` + dev bearer. Any 4xx-typed envelope counts as "implemented".

## P0-D

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ✅ implemented | 201 | POST | /bff/strategies | success | {"data":{"id":"strategy-20260531-02003586","name":"dev-probe","owner":"pantheon-dev-browser","updatedAt":"2026-05-31T14:41:32Z","state":"dra |
| ✅ implemented | 201 | POST | /bff/personas | success | {"data":{"id":"persona-20260531-6f175c5c","name":"dev-probe","owner":"pantheon-dev-browser","updatedAt":"2026-05-31T14:41:33Z","state":"draf |
| ✅ implemented | 201 | POST | /bff/capital-pools | success | {"id":"pool-20260531-429062ed","pool_id":"pool-20260531-429062ed","name":"dev-probe","status":"draft","risk_policy_ref":null,"params":{},"cr |
| ✅ implemented | 422 | POST | /bff/rebalances | precondition failure (typed envelope expected) | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"capital_pool_id is required","retryable":false,"userAct |
| ✅ implemented | 201 | POST | /bff/deployments | success | {"status":"accepted","data":{"status":"accepted","command":"CreateDeployment","commandId":"cmd-11086fb5aaf54460","command_id":"cmd-11086fb5a |
| ❌ NOT implemented | 405 | POST | /bff/runtimes | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ✅ implemented | 201 | POST | /bff/ranking-formulas | success | {"data":{"id":"f18b8c3e2055","name":"dev-probe","expression":"sharpe"},"meta":{"snapshot_at":"2026-05-31T14:41:35Z"}} |
| ✅ implemented | 201 | POST | /bff/research-experiments | success | {"data":{"id":"f998eea489ce","name":"dev-probe","hypothesis":"h","metric":"sharpe"},"meta":{"snapshot_at":"2026-05-31T14:41:35Z"}} |
| ✅ implemented | 201 | POST | /bff/skills | success | {"id":"skill-20260531-ca2b3fbf","skill_id":"skill-20260531-ca2b3fbf","name":"dev-probe","status":"draft","description":"","sandbox_enabled": |

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
| ✅ implemented | 202 | POST | /bff/v5/sentinel/findings/finding-dev/status | success | {"status":"accepted","data":{"status":"accepted","command":"SentinelFindingStatus","commandId":"cmd-5c73280a367b4313","command_id":"cmd-5c73 |
| ✅ implemented | 202 | POST | /bff/v5/sentinel/remediation/build | success | {"status":"accepted","data":{"status":"accepted","command":"SentinelRemediationBuild","commandId":"cmd-c830b6a1706e4fb4","command_id":"cmd-c |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/claim | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-5668be9897264043","command_id":"cmd-5668b |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/release | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-1a5aac03a20546dd","command_id":"cmd-1a5aa |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/escalate | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-8608d62a70944ac8","command_id":"cmd-8608d |
| ✅ implemented | 403 | POST | /bff/v5/interventions/intervention-dev/decide | auth/role rejected | {"error":{"code":"FORBIDDEN","i18nKey":"errors.FORBIDDEN","message":"DecideV5Intervention requires 'operator', 'approver', or 'admin' role", |
| ✅ implemented | 202 | POST | /bff/v5/interventions/intervention-dev/two-man-sign | success | {"status":"accepted","data":{"status":"accepted","command":"V5InterventionAction","commandId":"cmd-d54e788a55434f68","command_id":"cmd-d54e7 |
| ❌ NOT implemented | 405 | POST | /bff/v5/interventions/batch-decide | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |

## P1-E

| Tag | Status | Method | Route | Note | Snippet |
|---|---|---|---|---|---|
| ❌ NOT implemented | 405 | POST | /bff/agora/signals | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ❌ NOT implemented | 404 | POST | /bff/agora/feedback | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ❌ NOT implemented | 404 | POST | /bff/agora/inbox/inbox-dev/triage | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ✅ implemented | 201 | POST | /bff/agora/journal | success | {"data":{"id":"journal-agora-6787b45923","title":"dev-probe","body":"probe","tags":[],"linkedStrategyIds":[],"linkedPersonaIds":[],"visibili |
| ❌ NOT implemented | 404 | POST | /bff/agora/skill-coaching | route missing | {"error":{"code":"RESOURCE_NOT_FOUND","i18nKey":"errors.RESOURCE_NOT_FOUND","message":"Not Found","retryable":false,"userActionable":true,"d |
| ❌ NOT implemented | 405 | POST | /bff/agora/postmortems | route missing | {"error":{"code":"VALIDATION_FAILED","i18nKey":"errors.VALIDATION_FAILED","message":"Method Not Allowed","retryable":false,"userActionable": |
| ✅ implemented | 201 | POST | /bff/agora/ask/sessions | success | {"data":{"id":"ask-e2e3a65e28","sessionId":"ask-e2e3a65e28","title":"Agora ask session","mode":"quick_ask","status":"active","participants": |
