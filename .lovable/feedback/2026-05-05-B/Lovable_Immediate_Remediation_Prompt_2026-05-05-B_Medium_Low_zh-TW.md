# Lovable Immediate Remediation Prompt — 2026-05-05-B Medium / Low

請依照 `Pantheon_Frontend_Build_Spec_SA_SD_Gap_Remediation_2026-05-05-B_Medium_Low_en-US.md` 立即修補 Medium / Low gaps。不要用既有 mock 推測，不要保留 TODO，不要再標示 future patch target。

## 必做

1. 更新 Notification Center：實作 NotificationType enum 與 NotificationDTO。
2. 更新 RightDrawer：實作 RightDrawerSurface 完整 enum。
3. 更新 Global Search：實作 SearchEntityType、SearchResultDTO、BFF score behavior。
4. 更新 i18n：Persona response language fallback、Accept-Language fallback、BffError.i18nKey。
5. 更新 Incident：timeline attachments、mitigation、training feedback。
6. 更新 Jobs：JobType 全集與每種 input/output payload、progress throttling。
7. 更新 Agora Handoff：7 種 handoff type、SLA、attach-to-strategy endpoint。
8. 更新 Command Center KPI formulas。
9. 更新 Strategy list filters/sort、RunExperimentRequest。
10. 更新 Risk/Review source of truth。
11. 更新 Skill sandbox schema。
12. 更新 Committee Evidence Pack。
13. 更新 Signal Feedback endpoint 與 confidence 1–5。
14. 更新 EvaluationSuiteDTO 與 publish gate。
15. 更新 SSE catalog 與 diagnostics endpoint。
16. 更新 mock naming convention 與 mock schema alignment。
17. 更新 route param patterns。
18. 更新 index count：H=28 / M=41 / L=23。

## 驗收

所有 G06–G12、G20–G27、G34–G47、G50–G55、G59–G65、G69–G77、G79–G85、G87–G92 必須在程式與 mock 中有具體對應。不得只產生表面 UI。
