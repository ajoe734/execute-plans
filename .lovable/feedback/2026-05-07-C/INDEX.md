# 2026-05-07-C BFF Contract Follow-up Questions

- Artifact: `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-C_Followup_Questions.md`
- Scope: 8 unresolved items found while reviewing planner response in patch B
- Status: **BLOCKER for applying patch B** — wait for planner disposition before merging
- Items:
  - P0 (3): C.1 ActionCommandResponse status/error 雙軌 / C.2 idempotencyKey body→header / C.3 data?: T 破壞 narrow type
  - P1 (3): C.4 SSE 缺 approval+ask channel / C.5 action table canonical 未明示 / C.6 缺 McpToolCreateInput
  - P2 (2): C.7 EvidenceKind 與 Pack D permission 對照 / C.8 PATCH journal body 格式
- Cross-ref: Pack D D17–D32; src/lib/v4/{errorEnvelope,actionDescriptor}.ts; src/lib/v3/availableActions.ts
