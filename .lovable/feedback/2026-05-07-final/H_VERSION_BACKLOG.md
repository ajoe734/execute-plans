# H Version Follow-up Backlog (non-blocking)

源自 v1 BFF Contract FROZEN 結構驗證。以下 3 條 frontend 端已落地，留待 BFF spec H 版同步。

## H1 — `X-BFF-Api-Version` global header — ✅ FE CLOSED 2026-05-07
- OpenAPI `components.parameters.BffApiVersion` 已存在（default `2026-05-07`）。
- `src/lib/bff-v1/headers.ts` `BFF_API_VERSION` 已對齊為 `2026-05-07`，`buildHeaders` 已注入。
- 測試：`src/lib/bff-v1/__tests__/headers.test.ts`。

## H2 — Pack D D21 ErrorCode master 補 `RESOURCE_NOT_FOUND` — ✅ FE CLOSED 2026-05-07
- `src/lib/v4/errorCodes.ts` `ERROR_CODES` 已加入 `RESOURCE_NOT_FOUND`、`APPROVAL_REQUIRED`、`CONFIRM_TOKEN_REVOKED`，與 v1 BFF DTO §3.1 對齊。
- `src/lib/bff-v1/dto.ts` 的 `ErrorCode` 已收斂為 `V4ErrorCode`（不再用 superset union）。
- i18n key 規約 `errors.<ErrorCode>` 由 `errorI18nKey()` 產出；i18n 字串本體待 spec 作者於 H 版補翻譯。

## H3 — OpenAPI 抽出 named `ActionCommandStatus` schema — ✅ FE CLOSED 2026-05-07
- `src/lib/bff-v1/dto.ts` 已導出 `ACTION_COMMAND_STATUSES` 常數 + `ActionCommandStatus` named type + `isActionCommandStatus()` guard。
- 待 BFF spec H 版將 OpenAPI 內聯 enum 抽成 `components.schemas.ActionCommandStatus`，前端 codegen 即可對接。

---
追加項可直接補入本檔。FE 端已收尾 H1/H2/H3。
