# 2026-05-07-C BFF Contract Follow-up Questions

- Artifacts:
  - Questions: `/mnt/documents/Pantheon_BFF_Contract_Spec_2026-05-07-C_Followup_Questions.md`
  - Planner disposition: `Pantheon_BFF_Contract_Spec_2026-05-07-C_Planner_Disposition.md`（this dir）+ `/mnt/documents/...` mirror
  - **Final (B+C merged)**: `.lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`
- Status: **RESOLVED** — planner APPROVED 全 8 條；Final 已 commit 至 repo
- Disposition 摘要: C.1 Modify · C.2 Accept · C.3 Modify · C.4 Accept · C.5 Accept · C.6 Modify · C.7 Accept · C.8 Accept
- **C.1 wording fix (2026-05-07 reviewer note)**：Disposition 表格原「asynchronous accepted command 可回 `requires_approval` 作 accepted outcome」**已刪除**，改為「success 一律 `accepted`/`queued` + `approvalId`/`jobId`；preconditions missing 一律 non-2xx `BffErrorEnvelope`」。Final 正文 §2 自始即正確。
- 後端 handoff source = `2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`
- 待辦（不阻塞）：Pack D D21 補 `APPROVAL_REQUIRED`、SSE Contract 補 approval/ask、Permission Contract 補 EvidenceKind map、`X-BFF-Api-Version` 統一處理；OpenAPI/AsyncAPI 留 H 版
