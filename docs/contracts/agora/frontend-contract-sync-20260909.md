# Agora generated contract synchronization — 2026-09-09

Task: `DEV-PROOF-PAIR-ID-008`, PR follow-up for the required contract gate.

## Actual generation input

The input contract bytes are those bound by protected Pantheon dev commit
`77df37d54f9da6f6091bc150fce03ca711b494ec`, including the research provenance
schema extension. Validation uses the existing command:

```sh
PANTHEON_CONTRACT_ROOT=/tmp/pantheon-artifact-wiring-20260909-root npm run contract:drift:update
```

The current protected Pantheon dev tip `e6d480211ad34698d4ee97ec408d17cc019d0f08`
still validates those exact bound input bytes. This rebase retains the generated
output already accepted on frontend dev and verifies it against that current
backend contract; it does not claim a new runtime observation.

The older `runtime_commit` and `generated_from_contract_commit` values in the
v1.13 handoff remain compatibility anchors. They are not claimed as the input
revision of this refresh. Neither those anchors nor the hash algorithms changed.

## Generated changes and byte identity

- `ResearchRunProjection.provenance` preserves four distinct optional values:
  `real`, `simulation`, `fixture`, and `unavailable`. No conversion or default to
  `real` is introduced.
- Both generated files bind the research projection schema hash
  `305bac84f1075bc3448238bf6157bcc1f7d39b1e18501cdef7dd39035f66c887`.
- Actual `contract-snapshot.json` SHA-256:
  `c43a65f0e539cca5ab1bc44bb7d9a6a902722724bbd45c4cd18592ab619c31a3`.
- Actual `types.ts` SHA-256:
  `630fec3549cd9bdfa65b0c726de5ce2ac34a68b6b8fd0cb868e91db574618ab1`.
- The sorted `path<TAB>file_hash<LF>` aggregate SHA-256 is
  `2b57c86327dc15e559d41ff22bed425a8e9b5600378301d5c63457fa31630dd9`; the handoff
  field is updated from these actual bytes, not a bypass value.

Focused regressions check the generated provenance declaration and recompute
the handoff's aggregate hash from files. These are contract-generation checks,
not proof that a deployed research worker produced real data or that Loop 5
passed. Runtime provenance acceptance still needs the fresh research run's
authoritative receipt and durable readback.

## Local validation

- Existing `test:contract`: aligned 49 schemas, 157 routes, and 75 hash entries;
  all 9 contract tests passed, including the two new regressions.
- Existing `typecheck`: passed.
- Pair-identity, schema, parent-consumer, paired-workflow, and release-candidate
  regressions: 101 passed.
- Scoped ESLint and `git diff --check`: passed.
- Production build: passed in 48.48 seconds with current public dev Identity
  configuration, live BFF transport, strict fallback, and both write flags false.
  Existing Browserslist-age and large-chunk warnings remain. The build was local,
  not a hosted deployment or browser acceptance result; `dist/` is not committed.
