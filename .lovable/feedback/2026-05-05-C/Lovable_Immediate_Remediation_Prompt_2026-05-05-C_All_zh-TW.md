# Lovable Immediate Remediation Prompt — 2026-05-05-C

請依照 `Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-C_All_en-US.md` 修正目前 Pantheon 前端。這份 Pack C 是 normative addendum，優先於 v3、Pack A、Pack B。

必須完成：

1. 實作 legacy → v3 mapping table 與 `apiVersion='v3'` response 行為。
2. 補所有狀態機 failure / timeout / cancel transition；實作 Strategy 三軸狀態白名單。
3. 用 Pack C permission matrix 取代所有猜測式 permission。
4. 擴充 `ActionDescriptor`：group、order、disabledReasonCode、requiresEnv、requiresTwoMan、ttlSec、cooldownSec、idempotencyKeyRequired。
5. 補 confirm token revoke / reuse detection / token-idempotency binding。
6. 改成 cursor pagination、統一 filter/sort、標準 error envelope。
7. 實作 SSE reconnect：Last-Event-Id、heartbeat、replay window、resync_required。
8. 實作 Agora handoff SLA、escalation、reject DTO、attachment constraints。
9. 補 mandate breach monitor、ranking metric metadata、rebalance quorum / rollback rules。
10. 補 accessibility WCAG 2.1 AA、security baseline、performance budget、E2E scenarios。
11. 更新 mock seed 數量與狀態覆蓋，符合 Pack C C060。
12. 不得再使用 placeholder 或自行推測本文件已定義的欄位。

驗收條件：C001–C078 全部在 UI / mock BFF / stateMachines / permission / i18n / QA 中有對應實作或明確 future-work guard。
