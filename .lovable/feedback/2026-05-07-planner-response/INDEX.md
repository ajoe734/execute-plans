# Planner Response — 34 Spec Backlog Disposition (2026-05-07)

**Source**: `Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md` (planner team handoff)
**Status**: APPROVED FOR CONTRACT CONSOLIDATION — implementation in progress
**FE archive date**: 2026-05-08

---

## 1. 結論

34 條全部 ACCEPTED：
- A 組 (3) / B 組 (5) / C 組 (4) / D 組 (4，與 C 重疊 2) — `RESOLVED_BY_CONTRACT — implementation pending`
- E 組 (20) — E1/E5/E6/E8 併入前項；其餘 P2/P3

C/D 重疊合併：
- `G-C2 + D36` → `CONFIRM_TOKEN_COOLDOWN_SEMANTICS`
- `G-C4 + D35` → `TWO_MAN_DISTINCT_POLICY`

## 2. Status Vocabulary

| Status | 意義 |
|---|---|
| `RESOLVED_BY_CONTRACT` | 規劃裁示完成、可進 OpenAPI/AsyncAPI/DTO |
| `SPEC_BACKPORT_REQUIRED` | 裁示已定，待回灌 Pack D / v4 canonical spec |
| `IMPLEMENTATION_PENDING` | contract 已定，後端或前端未落地 |
| `V0_MOCK_ALLOWED` | 前端可維持 mock，須標 `source=v0-mock` |
| `PLANNING_OPEN` | 尚無規劃裁示（A/B/C/D 組已不應再出現） |

## 3. FE 收尾動作（per planner §9）

見 `Disposition.csv` `fe_action` 欄。

## 4. FE 落地進度

落地依 `.lovable/plan.md` 9 階段執行：

| 階段 | 範圍 | 狀態 |
|---|---|---|
| 1 | Archive + memory | ✅ landed 2026-05-08 |
| 2 | A 組 P0（dto/errors/sse channels 補齊） | ✅ landed 2026-05-08 |
| 3 | B 組 P0（MeResponse + SSE typed payload） | ✅ landed 2026-05-08 |
| 4 | B 組 P1（D05/D12/D22） | TODO |
| 5 | C 組 P2（cooldown/two-man/PATCH/bulk） | TODO |
| 6 | D 組 P1/P2（saga/handoff SLA） | TODO |
| 7 | E 組 P1（optimistic lock / X-Request-Id echo） | TODO |
| 8 | E 組 P2（governance config defaults） | TODO |
| 9 | E 組 P3（UX polish） | TODO |

## 5. FE Feedback to Planner（下一版 Pack D-B 修訂時納入）

| ID | 衝突點 | FE 既有 | Planner 文 | FE 處理 |
|---|---|---|---|---|
| I1 | EvidenceKind 集合差異 | 11 種，含 v5 closed-loop (`loop_run`/`sentinel_finding`/`intervention`/`ask_session`) | 15 種，缺 v5 三項 | FE 取 union（≈19 種），新增註解請 planner 在下一版合併 |
| I2 | RedactedEvidenceRef.reason 命名 | union `PERMISSION_DENIED \| CAPABILITY_MISSING \| TENANT_SCOPE_MISMATCH` | 單值 `INSUFFICIENT_CAPABILITY` | FE 保留 union（資訊量大），新增 `redactionReasonCode` alias 對齊 planner |
| I3 | ROLE_CAPABILITIES 角色集 | v4 5 角色 | planner 12 角色 | 階段 4 擴成 12 角色 superset |

## 6. 對應檔案

- `Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md` — 規劃團隊原文
- `Disposition.csv` — 34 條 × {priority, status, fe_action}
