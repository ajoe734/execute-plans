# Management Data Source Control Center (SD-SRCM-04)

## 1. Overview & Architecture

The **Data Source Control Center** expands `/management/data-sources` into a unified operational console for Pantheon's external financial data providers, connector definitions, ingestion schedules, and cryptographic command receipts.

It provides end-to-end visibility into:
1. **Catalog**: Deployed `ConnectorDefinition`s, adapter tokens, supported datasets/markets, auth modes, and limits.
2. **Instances**: 9-column live observability matrix showing desired vs. observed state divergence, effective lifecycle, and server-governed actions.
3. **Runs & Health**: Real-time watermarks, latency, and bounded read-only canary executions.
4. **Change History**: Immutable, traceable command receipts with post-execution readback convergence.
5. **Add Wizard**: Multi-step workflow that enforces **configured_disabled** initial state and secret reference URIs (`vault://...`, `env://...`), rejecting inline credentials.
6. **Phase-1 Offline Intake**: For unsupported connectors, operator generation of `source_development_need.v1` packets without triggering OpenClaw or Management AI.

---

## 2. Nine Canonical Observation Columns

| # | Column | Key Fields & Badges | Purpose |
|---|--------|---------------------|---------|
| 1 | **Source / Provider** | Provider name, Instance ID, markets, datasets, source class | Primary identity and data scope |
| 2 | **Support / Deployment** | Definition state (`supported`, `disabled_by_build`), Definition ID, Deployment SHA | Adapter build and code provenance |
| 3 | **Desired Lifecycle** | Desired state badge (`configured_disabled`, `enabled`, `degraded`, `disabled`, `retired`), Revision `r{n}` | Target operator intent |
| 4 | **Observed Health** | Health badge (`healthy`, `degraded`, `stale`, `error`), Effective lifecycle, Reconciliation status (`converged`, `reconciling`, `diverged`), Age / SLA, Watermark | Ground truth observability and divergence detection |
| 5 | **Credential / License** | Credential state (`configured`, `not_required`, `missing`), Secret Reference URI, License Scope | Security and entitlement governance |
| 6 | **Schedule / Watermark** | Schedule status (On/Off), Cron cadence, Timezone, Jitter seconds | Ingestion timing and recurring controls |
| 7 | **Latest Run / Search** | Row count, rejected count, Evidence Bundle ID link | Ingestion batch results & evidence audit |
| 8 | **Consumers / Cost** | Dependent persona links (`/management/personas/{id}`), Usage/Cost summary | Downstream consumption lineage |
| 9 | **Actions** | Server-governed action dropdown (Validate, Canary, Enable, Disable, Degrade, Resume, Schedule, Replace, Retire) | Mutating commands governed strictly by server `allowedActions` |

---

## 3. Desired vs. Observed State Reconciliation

Pantheon follows an asynchronous reconciliation model. When an operator issues a command, the desired revision increments and enters a reconciling state until observed status converges:

- **Converged**: Desired revision matches observed revision, and effective lifecycle matches desired lifecycle.
- **Reconciling**: The control plane is applying the state change or executing validation / canary checks.
- **Diverged / Failed**: The observed runtime state conflicts with operator intent (e.g., connector crashed, rate limit exceeded, or validation failed). A warning banner is displayed with detailed server reasons.

---

## 4. Governed Lifecycle Actions & Command Dialog (SD-SRCM-04 § 6.6)

All mutating actions are derived exclusively from the server-provided `allowed_actions` / `allowedActions` object:

| Action | Allowed Key | Confirmation Required | Description | SD-SRCM-04 § 6.6 Command UX |
|--------|-------------|-----------------------|-------------|-----------------------------|
| **Validate** | `canValidate` | No | Validates configuration against definition schema. | Validates connector config against deployed definition and security policies. |
| **Run Canary** | `canCanary` | No | Executes bounded, read-only pull within strict host allowlists. | Displays bounded limits (`max_records`, `max_bytes`, `timeout_seconds`), allowed target hosts, and no-order/safety statement. |
| **Enable** | `canEnable` | **Yes** | Starts scheduled ingestion. Requires passed validation and canary. | Displays prerequisite health gate checklist (validation state, canary state, credential status) with warning when incomplete. |
| **Disable** | `canDisable` | No | Immediately pauses ingestion and halts schedule. | Pauses ingestion and suspends recurring cron schedule. |
| **Degrade** | `canDegrade` | No | Isolates source for maintenance while blocking automated consumers. | Maintenance mode isolation. |
| **Resume** | `canResume` | No | Resumes disabled source and re-evaluates stale canaries. | Explains rerun truth: reactivates schedule, re-evaluates stale canaries, triggers observation poll, and reconciles observed revision. |
| **Change Schedule** | `canChangeSchedule` | No | Updates Cron cadence, timezone, or jitter. | Updates Cron cadence, timezone, or jitter. |
| **Replace** | `canReplace` | **Yes** | Replaces with an alternative source ID and records migration plan. | Displays affected dependent personas and records replacement target without claiming executed rebind. |
| **Retire** | `canRetire` | **Yes (Typed)** | Permanently decommissions instance (terminal state). | Requires typing `"RETIRE"` into confirmation text field before execution. |

### Security & Secret Governance
- **Raw Secrets Forbidden**: The UI and client strictly reject passwords, API keys, and raw tokens. Only `vault://...`, `env://...`, or `ref://...` references are accepted.
- **Secret Scope Selection & Transport**: Every source instance configures an authorization boundary scope (`runtime_read_only`, `tenant_isolated`, `operator_shared`, `restricted_canary`, `production_market_data`) transported top-level and in `connector_config.secret_scope`.
- **Real-Write Gating**: Writes require `liveWriteGated()` / `realWritesEnabled()`. In read-only mode, mutation attempts display explicit guidance.

---

## 5. Lineage, Cost & Quota Observability

- **Consumers & Lineage**: Column 8 renders active consumer count, persona badges linking to `/management/personas/{id}`, daily usage/cost estimate, quota usage %, and dead-letter queue (DLQ) alert badges.
- **Runs & Health Observability**: Dedicated Quota, Usage & DLQ card section showing unresolved DLQ count (with alert badge), quota usage %, estimated cost in USD, and active consumer count.

---

## 6. Phase-1 Offline Development Intake

When a financial provider is not present in the deployed build:
- The UI **does not call OpenClaw or Management AI** directly.
- The operator can export a structured `source_development_need.v1` artifact via JSON copy or file download.
- The artifact is submitted offline to the engineering team for Phase-2 adapter implementation.
