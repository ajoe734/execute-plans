# H Version Follow-up Backlog (non-blocking)

源自 v1 BFF Contract FROZEN 結構驗證。以下 3 條不阻塞 v1 定版，留待 H 版收尾。

## H1 — `X-BFF-Api-Version` global header
- 現況：Final §11 已宣告，但 OpenAPI servers / global parameters 尚未加入。
- 動作：於 OpenAPI `components.parameters` 新增 `BffApiVersion` header，所有路徑共享；DTO Catalog §1 補敘。
- Owner：BFF spec 作者；frontend client 在 v1 BFF wrapper 落地時讀 header。

## H2 — Pack D D21 ErrorCode master 補 `RESOURCE_NOT_FOUND`
- 現況：DTO Catalog §3.1 已列，Pack D `Pantheon_Pack_D_BFF_API_Contract.md` D21 master 未列。
- 動作：H 版 Pack D refresh 同步補上，並追加 i18n key `errors.RESOURCE_NOT_FOUND`。

## H3 — OpenAPI 抽出 named `ActionCommandStatus` schema
- 現況：`ActionCommandResponseData.status` 為 inline enum (`accepted | queued | completed`)，DTO Catalog 已命名。
- 動作：抽成 `components.schemas.ActionCommandStatus` named enum，便利 codegen 對齊。

---
追加項可直接補入本檔。H 版啟動前不需動 src/。
