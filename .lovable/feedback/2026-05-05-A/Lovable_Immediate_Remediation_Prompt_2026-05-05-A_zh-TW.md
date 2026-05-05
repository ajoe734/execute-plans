# Lovable Immediate Remediation Prompt — Pantheon Spec Gap 2026-05-05-A

請依照 `Pantheon_Frontend_Build_Spec_FULL_v2_zh-TW.md` 的 Part 9 — SA/SD Gap Remediation Pack 2026-05-05-A 先修正目前前端實作。這是 v2 的最高優先級規格。

## 最高優先事項

1. 統一 Strategy / Persona / CapitalPool / Skill / Memory status enum。
2. 將 Strategy 拆成 `lifecycleStatus`、`reviewStatus`、`deploymentStatus`，不要把 `under_review` 或 `paused` 當成 lifecycle status。
3. 將所有 `availableActions` 統一為 `ActionDescriptor[]`，禁止 string[]。
4. 實作 Role × Entity × Action permission truth tables。
5. 實作 high-risk action 全集與 confirm token flow。
6. 實作 `POST /bff/commands/confirm-token` mock endpoint。
7. 統一 `/management/risk` 為 canonical route，`/management/risk-center` 只做 redirect。
8. 補齊 CapitalPool mandate schema、Ranking scope × metric matrix、Quarterly Rebalance reviewer / approver、Evolution schema。
9. 補齊 Agora handoff schema、Signal feedback endpoint、confidence scale 1–5、Committee evidence pack schema。
10. 更新 mock data，使 mock 100% 符合 Part 9 canonical DTO。

## 禁止事項

- 不要新增未在 Part 9 列出的 status enum。
- 不要用 `etc.` 或 comment TODO 取代欄位定義。
- 不要讓 Agora 直接執行 live deploy、capital rebalance、production MCP grant、skill approval。
- 不要由前端自行推理 RBAC；必須以 BFF `availableActions` 驅動 UI。

## 驗收

完成後，所有 G01–G92 必須能在 disposition table 中標記為 `RESOLVED` 或 `DEFERRED_WITH_OWNER`，不可留空。
