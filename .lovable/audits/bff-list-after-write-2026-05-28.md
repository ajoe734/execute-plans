# Probe: create persona → persona-fleet — 2026-05-28

Generated: 2026-05-31T14:41:36.870Z
BFF base: https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io
Probe name: `dev-probe-1780238492204`

**Verdict:** PASS

## Step 1 — POST /bff/personas
- status: 201
- new id: `persona-20260531-1715d8d2`
- correlationId: `probe-1780238492204-s004ou`

## Step 2 — GET /bff/management/persona-fleet (REGISTRY)
- status: 200
- items: 15
- contains new id: **YES**
- correlationId: `probe-1780238494612-8xsx6v`

## Step 3 — GET /bff/management/persona-league (RANKING SNAPSHOT, may lag)
- status: 200
- items: 15
- contains new id: YES
- correlationId: `probe-1780238495446-80jliu`

## Interpretation

- **PASS** → entire create → registry path works end-to-end. Agent's create_persona tool is good to ship.
- **WRITE OK, FLEET STALE** → /bff/personas writes, but /bff/management/persona-fleet does not project. File a BE bug against the projection layer, NOT the write path.
- **WRITE FAILED** → re-check probe script body shape vs BE OpenAPI §4.