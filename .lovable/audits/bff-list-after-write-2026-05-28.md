# Probe: create persona → persona-fleet — 2026-05-28

Generated: 2026-05-28T06:52:51.009Z
BFF base: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io
Probe name: `dev-probe-1779951166987`

**Verdict:** PASS

## Step 1 — POST /bff/personas
- status: 201
- new id: `persona-20260528-f4650c96`
- correlationId: `probe-1779951166988-9r650a`

## Step 2 — GET /bff/management/persona-fleet (REGISTRY)
- status: 200
- items: 4
- contains new id: **YES**
- correlationId: `probe-1779951169501-35xs1l`

## Step 3 — GET /bff/management/persona-league (RANKING SNAPSHOT, may lag)
- status: 200
- items: 4
- contains new id: YES
- correlationId: `probe-1779951169822-yz90m6`

## Interpretation

- **PASS** → entire create → registry path works end-to-end. Agent's create_persona tool is good to ship.
- **WRITE OK, FLEET STALE** → /bff/personas writes, but /bff/management/persona-fleet does not project. File a BE bug against the projection layer, NOT the write path.
- **WRITE FAILED** → re-check probe script body shape vs BE OpenAPI §4.