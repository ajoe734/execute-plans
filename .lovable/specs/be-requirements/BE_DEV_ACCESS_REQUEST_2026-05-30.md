# BE Dev Access Request — Lupin VM 重建後 — 2026-05-30 (rev 2)

> **Context**：lupin dev BFF 的 VM 已搬到新 GCP / cloud 帳號重建，原本的
> `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io` 可能：
> (a) IP 變了、sslip.io subdomain 失效，或
> (b) 入站防火牆 / CORS 規則沒有跟著遷移過去。
>
> 在 BE 重新發布前，**Lovable agent 完全打不到 BFF**（read + write 都掛）。
> 本文件列出讓 agent sandbox 重新連得到所需的 4 項交付物。

## 0. 為什麼這次更急

| 之前 (2026-05-28) | 現在 (VM 重建後) |
|---|---|
| sandbox 打不到 BFF，但 user 真實瀏覽器可以（CORS 白名單在）| user 預覽**也可能掛**，因為 origin allow-list / DNS 都還沒重綁 |
| 只影響 agent 獨立驗證 | 影響 dev 環境整體 read-path（preview cockpit 拉不到 200） |
| `withWriteFallback` 還能 degrade write | 連 GET 都會 fail，FE 顯示 LiveStatusBanner red |

## 1. 我這邊（Lovable agent sandbox）的固定資料

| 項目 | 值 |
|---|---|
| Sandbox egress IPv4 (2026-05-30) | **`34.147.96.59`** |
| Sandbox egress IPv6 | `2a07:8241:fff:1002::/64` |
| 預覽 origin (browser fetch from) | `https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app` |
| 預覽備援 origin | `https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com` |
| 已發布 origin | `https://pantheon-dev.lovable.app` |
| Dev bearer 目前值 | `Bearer pantheon-dev-browser:reviewer` |
| Lovable project id | `b75d3452-f667-4cf4-893a-1061de45b347` |
| Supabase project ref | `kwjtcynauaulrxngyetk` |

> ⚠️ Sandbox IPv4 每次 session 重啟可能換到同 GCP `europe-west` 區段的別的 IP。
> 請以 **`34.147.96.0/24`**（或更寬的 GCP europe-west egress range）為白名單最小單位。

## 2. BE 團隊需要交付的 4 件事

### ✅ 2.1 新的 BFF URL（最緊急）

請 BE 在本 issue / 回覆訊息中提供：

```yaml
bff_dev_url: https://___________________________   # 新的 host，含 scheme
bff_dev_ipv4: ___.___.___.___                       # 給 FE log + DNS sanity check
bff_dev_health_path: /health                        # 確認與舊版一致
bff_dev_ready_at:   2026-05-__T__:__Z              # 預計可連上時間
```

收到後我會：
- 更新 `.env.development.example` 與 `src/lib/bff-v1/paths.ts` 預設值
- 跑 `curl ${bff_dev_url}/health` 驗證 sandbox 連線
- 跑三支 probe 收回 `.lovable/audits/be-write-gap-verification-2026-05-30.md`

### ✅ 2.2 防火牆入站白名單

請在新 VM 的 GCP firewall / Cloud Armor 加：

```
# Allow inbound 443 from:
- 34.147.96.0/24                  # Lovable agent sandbox egress
- (Lovable infra 提供的完整 CIDR)  # 跟 Lovable infra 索取
- Lovable preview/publish 出口 IP # 由 user 真實瀏覽器走 CDN，通常已開
```

驗證：sandbox 跑 `curl -sS -m 5 ${bff_dev_url}/health` 應在 1s 內回 `200 {"status":"ok"}`。

### ✅ 2.3 CORS Allow-Origin 重綁

新 BFF 的 CORS middleware 需 allow（精確匹配，不可只設 `*`，因為要回應
`Access-Control-Allow-Credentials: true`）：

```
Access-Control-Allow-Origin（list）:
  - https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
  - https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com
  - https://pantheon-dev.lovable.app
  - https://*.lovableproject.com          (萬用，可選)
  - https://*.sandbox.lovable.dev         (萬用，可選)
Access-Control-Allow-Methods:
  - GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers:
  - authorization, content-type, accept, accept-language,
    x-bff-api-version, x-correlation-id, x-request-id,
    x-dry-run, idempotency-key
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 600
```

驗證：headless 瀏覽器從 `*.lovableproject.com` origin fetch 不應再回
`TypeError: Failed to fetch` (即 preflight OPTIONS 應回 204)。

### ✅ 2.4 Auth bearer 在新 VM 有效

舊的 `pantheon-dev-browser:reviewer` token 在新 VM secret store 內可能不見了。
請確認新 BFF 收到此 bearer 時：
- 不回 401（auth bypass 對 dev 環境保留）
- role-claim 解析為 `reviewer`（read + dry-run write）

或發一組新的：

```yaml
agent_ci_bearer: <jwt or static token>
identity:  lovable-agent-ci
roles:     [reviewer, approver]
ttl:       90d
rotate_via: <endpoint or 1Password / Vault link>
```

我會用 `secrets--add_secret` 收進 Lovable Cloud，永遠不寫 codebase。

## 3. 自動回歸驗證（開通後）

開通後 sandbox 會跑：

```bash
node scripts/probe-bff-write-paths.mjs           # 31 write endpoints
node scripts/probe-persona-onboarding-endpoints.mjs  # 8 wizard stages
node scripts/probe-create-persona-then-fleet.mjs # write→read 一致性
```

結果輸出到 `.lovable/audits/be-write-gap-verification-<date>.md`。
全綠則：
- `mem://audits/bff-write-gap-2026-05-28` 標 CLOSED
- 撤掉 `src/lib/bff-v1/writeFallback.ts` NOT_IMPLEMENTED 分支
- 撤 `LiveStatusBanner` writeDegraded strip
- `.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md` 整份 archive

## 4. Checklist for BE owner

- [ ] **2.1**: 在本 repo issue 回覆新 BFF URL + IP + health ready 時間
- [ ] **2.2**: GCP firewall 加 `34.147.96.0/24`（或 Lovable infra CIDR）
- [ ] **2.3**: 新 BFF CORS middleware 套上 §2.3 list
- [ ] **2.4**: 確認 `pantheon-dev-browser:reviewer` 仍有效 / 發新 token
- [ ] 通知 Lovable：「請 agent 跑 `scripts/probe-*.mjs` 收尾」

## 5. 期間 FE 端的工作（我這邊先做）

不阻塞 BE：
- [x] 把這份 access request 寫出來
- [ ] 等 BE 給新 URL 後，**一個 commit 改三個檔**：
  - `.env.development.example`
  - `.env.example`
  - `src/lib/bff-v1/paths.ts`（若 base URL 寫死）
- [ ] 跑 probe → 寫 verification report → 更新 memory

---

**Owner mapping**:
- §2.1 / §2.2 → BE platform / DevOps
- §2.3 → BE BFF service owner
- §2.4 → BE auth owner
- §3 / §5 → Lovable agent (我)

**Contact channel**: 本 repo issue 或 `.lovable/feedback/2026-05-30-agent-access/` 子目錄。
