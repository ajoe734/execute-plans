# Persona Paper/Live Production Gap - 2026-07-03

本文把 Persona 建立、paper 交易、canary/live 晉級、季度重排、人類審核、緊急處置、管理 UI 與 production gate 的規則重新收斂成同一份可實作、可驗收的定義。

## 結論

現在正確的產品定義不是「先建立一個不能交易的 Draft Persona，之後再用啟動精靈補齊」。正確定義是：

1. 建立 Persona 時就要完成必要綁定，建立成功後直接進入 `paper_running`。
2. 初始資金池只能是 paper / sandbox capital pool，不允許建立時直接綁 live capital pool。
3. Paper、canary、live Persona 在同一個競爭池排名，但不同交易模式要有不同風險限制與證據要求。
4. Paper 晉級 canary/live 必須走 Human Inbox 人類審核。
5. 每季重新排名、資金重新配置、live 替換也必須走 Human Inbox 人類審核。
6. 嚴重虧損、風控違規、資料/券商/授權失效時，不等季度審核，系統必須立即處置並留下 evidence。

因此，已存在且已 deployed 的 Persona 不應該再顯示「啟動精靈」作為主要行動。它應該被歸一成明確 runtime 狀態，例如 `paper_running`、`canary_running`、`live_running`、`needs_human_approval`、`rollback_required` 或 `stopped`。

## 當前已完成證據

- Frontend PR #160 已合併到 `dev`，merge commit 是 `fcd5e3e3f408922863ecb6751866764ee32a5b80`。
- Dev deployment `/deployment.json` 已回報 `fcd5e3e3f408922863ecb6751866764ee32a5b80`，`VITE_BFF_MODE=live`，`VITE_BFF_FALLBACK=strict`。
- Hosted browser/BFF probe 已能在 `/management/persona-fleet` 看到 Persona Fleet rows，且 `/bff/management/persona-fleet`、`/bff/me` 成功。
- Persona Fleet 測試已覆蓋：
  - `paper_running` 走 runtime，不走 onboarding。
  - `deployed` 走 runtime，不走 onboarding。
  - `needs_human_approval` 走 Human Inbox。
  - explicit `promotion_review:*` 走 Human Inbox detail。
  - 只有 `draft` 才走 onboarding。
- TopBar 測試已覆蓋「retired global environment selector」不應再渲染，也就是截圖中的全域 `研究 / 模擬 / 正式` 選單不應存在於目前程式碼。
- Backend 已有 promotion review BFF routes：
  - `POST /bff/management/personas/{persona_id}/promotion-reviews`
  - `GET /bff/management/promotion-reviews`
  - `GET /bff/management/promotion-reviews/{review_id}`
  - `POST /bff/management/promotion-reviews/{review_id}/decisions`
- Human Inbox 已能接 `promotion_review` kind；核准後會把 Persona 更新為 `paper_running`，並把 canary activation state 設為 `authorized_not_started`。

## 目前仍然不該宣稱完成的地方

Dev integration gate 仍有 production-level blocker：

- Run `28635290690` 的 aggregate release gate 最後仍紅。
- 最新 rerun 中實際 browser/BFF 與 SSE 類問題已通過，但 MGMT-LOAD-006/007 還是失敗。
- 真正的 route-load 問題是某次 CI runner/dev BFF 下：
  - `/bff/me`
  - `/health`
  - `/bff/management/evidence`
  都約 18.37 秒才完成，超過 route content timeout 15 秒。
- 目前 workflow 還有診斷錯誤：`compose-release-load-gate.mjs` 在 route-load fail 時會寫出 manifest 但 exit nonzero；因 workflow `set -o pipefail`，後面的 `echo PANTHEON_LOAD_GATE_MANIFEST=... >> $GITHUB_ENV` 不會執行，導致 acceptance 把真問題報成 `manifest missing`。

這代表現在不能只說「開發好了」。正確狀態是：功能已合併並部署到 dev，但 release gate 還需要修正 load-gate evidence 傳遞，並繼續觀察/治理 BFF 首次載入延遲。

## Persona 生命週期定義

### Create

建立 Persona 不是建立一個空殼。建立成功的最低要求：

- Persona identity：name、archetype、owner、mandate。
- Strategy direction：策略方向、可交易市場、可用策略/研究 artifact。
- Data source grants：至少一組可讀市場資料源，狀態必須可 readback。
- Paper capital binding：綁定 paper capital pool、paper budget、risk budget。
- Runtime binding：綁定 paper runtime / executor 或已排入 runtime binding job。
- Risk profile：最大回撤、單日損失、曝險、槓桿、單筆/單市場限制。
- Audit evidence：建立 request、binding result、資料源 readback、風險設定 snapshot。

建立完成後狀態應為：

- `paper_running`：已可模擬交易。
- `needs_human_approval`：如果缺某個高風險 grant 或需要人類確認。
- `failed` / `stopped`：建立流程失敗，不應假裝 deployed。

`draft` 只能代表尚未送出或未完成建立流程的暫存表單，不是已存在 Persona 的長期狀態。

### Paper

Paper 是所有 Persona 的第一個競爭場。

- Paper 可以交易，但只能用 sandbox capital pool。
- Paper 可以用真實市場資料與真實成本模型，但不得有 live capital side effect。
- Paper 需要持續產生 order intent、fill simulation、PnL、risk、data health、broker simulation readback。
- Paper 排名與 live/canary 一起看，但 score 要標示 `capital_mode=paper`，避免把未承擔真實資金風險的成績和 live 成績混為一談。

### Canary

Canary 是進入實盤前或小額實盤初期的受控狀態。

- 必須由 Human Inbox 審核核准。
- 必須有可回滾 plan。
- 必須有 live broker/auth/capital binding evidence。
- 初始配置小於 live 上限，並有更緊的停損與風控閥值。
- 狀態應用 `canary_running`、`canary_authorized_not_started`、`canary_paused` 等明確字眼。

### Live

Live 是正式實盤交易。

- 必須由 Human Inbox 審核核准。
- 每季重新排名、升降級、替換、資金擴縮都要再審核。
- Live 的 score 必須同時計入真實交易成本、滑價、容量、風控事件與人工 override penalty。
- Live 出現重大違規時，系統可立即處置，不等待季度審核。

## Paper 到 Canary/Live 晉級規則

Paper Persona 進入 promotion review 前至少要滿足：

- 最短觀察期：例如 30 個交易日或等價市場週期。
- 最少交易/訊號數：避免靠少量樣本晉級。
- Data health：主要資料源 readback 成功率達標，且無未處理資料缺口。
- Risk health：最大回撤、單日損失、曝險、槓桿、集中度未違規。
- Execution health：模擬成交、成本、滑價、延遲模型沒有重大失真。
- Evidence freshness：paper score、risk report、data report、runtime report 均在有效期內。
- Human narrative：Persona 的 mandate、策略方向、最近 mutation、已知風險、rollback plan 清楚。

系統可以自動產生 promotion candidate，但不能自動升級到 canary/live。promotion candidate 必須進 Human Inbox，審核人至少包含 risk / ops / capital 或設定中的必要角色。

## 每季排名與實盤排序規則

所有 Persona 進入同一個 league table，但 ranking score 需要 mode-aware。

推薦 score 組成：

- Risk-adjusted return：Sharpe、Sortino、Calmar、annualized return。
- Downside control：max drawdown、drawdown recovery days、tail risk。
- Stability：rolling window score 穩定性、regime 切換表現。
- Cost/execution：turnover、slippage、market impact、fill quality。
- Capacity：策略容量、資金可擴張性、流動性限制。
- Data/reliability：資料源 freshness、readback 成功率、runtime uptime。
- Governance penalty：人工 override、policy violation、incident、missing evidence。
- Live/paper divergence：live 結果與 paper baseline 偏離過大要扣分。

季度流程：

1. 系統產生 league snapshot。
2. 系統提出 promotion / demotion / capital reallocation 建議。
3. Human Inbox 建立 quarterly ranking review。
4. 人類審核可以核准、拒絕、要求補 evidence、或改成保守配置。
5. 核准後才執行 live capital rebalance 或 persona replacement。
6. 所有決策寫入 audit/evidence。

## 立即處置規則

以下情況不等季度、不等人工慢慢排隊，系統要立即進入處置流程：

- 單日損失超過 hard stop。
- 累積 drawdown 超過 hard stop。
- VaR / exposure / leverage / concentration 超標。
- broker auth、order gateway、capital binding、risk service 出現不可驗證狀態。
- live PnL 與 paper/simulation baseline 發生不可解釋大幅 divergence。
- data source 出現 stale、缺口、供應商錯誤、價格異常，且影響交易判斷。
- Persona 發生未授權 tool/order side effect。
- 人類 compliance/risk officer 手動標記。

立即處置可以是：

- freeze new orders。
- reduce capital。
- pause persona。
- rollback to previous artifact。
- force paper-only。
- kill switch / stop runtime。
- 建立 incident 與 Human Inbox emergency review。

立即處置本身可以由系統執行，但事後必須生成 evidence 並要求人類確認後續策略。

## UI/UX 必改規則

### Persona Fleet

Persona Fleet 是 fleet operating surface，不是 onboarding checklist。

Row 必須呈現：

- Persona identity、owner。
- Current lifecycle：`paper_running`、`canary_running`、`live_running`、`needs_human_approval` 等。
- Capital mode：paper/canary/live 與資金池。
- League rank / score / perf delta。
- Data source health。
- Human review state：沒有 review、promotion pending、quarterly pending、emergency pending。
- Primary action：
  - running 狀態：檢視 runtime。
  - human pending：開 Human Inbox review。
  - researching：開 research/evidence。
  - draft 暫存：才開 onboarding。

已存在 Persona 不應顯示「啟動精靈」作為 row 主要行動。

### Create Persona

建立入口應明確叫「建立 Persona」或「建立並啟動 paper Persona」，不是讓 operator 以為只是在草稿階段填人格設定。

建立流程可以是 wizard，但它的完成定義必須是 paper-ready/paper-running：

- mandate
- strategy direction
- data source grants
- paper capital pool
- risk profile
- runtime binding
- evidence snapshot

### Human Inbox

Human Inbox 是所有高風險決策入口：

- paper -> canary promotion
- canary -> live promotion
- quarterly ranking/reallocation
- emergency intervention confirmation
- rollback/restart approval

Persona Fleet row 只提供導向，不應在 fleet table 直接完成這些決策。

### TopBar / 全域模式選單

管理 console 不應有全域 `研究 / 模擬 / 正式` 選單來切換整個系統視角，因為這會錯誤暗示 paper 和 live 是互斥的 fleet 世界。

正確方式：

- TopBar 只顯示 BFF/session/realtime/data-source 狀態。
- Persona Fleet 內每一列自己標示 `capital_mode` / `runtime_env`。
- Ranking/league 頁面提供 filter，但預設是同一 league table。

## Backend/API gap

已完成或部分完成：

- Promotion review BFF routes 已存在。
- Human Inbox 可讀 `promotion_review`。
- Promotion decision 可更新 Persona 至 paper/canary activation path。

仍需補齊：

- `POST create persona` 應成為 one-shot governed flow，成功即 paper-running 或明確 failure/pending。
- Persona Fleet projection 要把 legacy `deployed` 歸一到 `paper_running` / `canary_running` / `live_running` 或 explicit blocker。
- Fleet row 需要帶 `capital_mode`、`capital_pool_id`、`runtime_binding_id`、`review_id`、`review_type`、`league_rank`、`league_score`。
- Quarterly ranking review API 需要與 Human Inbox 同步。
- Emergency intervention API 需要把 system action、incident、human confirmation 串起來。
- Risk finding 不應用「未部署」語氣描述已 deployed/running Persona；finding 文案要引用實際 runtime/capital/review 狀態。

## Load / production gate gap

Persona Fleet 慢有兩層問題：

1. 使用者可感受到的 BFF 首次載入延遲。
2. CI gate 的 evidence 傳遞錯誤，把 route-load fail 報成 manifest missing。

本輪要先修第 2 點，因為不修它就無法精準判斷 production gate 卡在哪裡。修完後 acceptance 必須顯示：

- manifest present。
- route-load 是 pass / fail / missing 中的真實狀態。
- 如果 fail，要列出 route timing、水位、失敗 milestone，而不是只說 manifest missing。

第 1 點需要後續用 dev gate 與 hosted probe 再驗證。若 repeated BFF latency 超過 15 秒，不能靠放寬 timeout 假裝完成；要回到 BFF projection/query/cache 或 first-route hydration 改善。

## 本輪實作計畫

1. 固定本文為產品與驗收依據。
2. 修 `pantheon-integration-gate.yml`，確保 load gate manifest path 在 compose 失敗時仍寫入 `$GITHUB_ENV`。
3. 強化 `accept-management-hosted-production.mjs`，當 env 缺失時可從 audit/load baseline 目錄 fallback 找到 `release-load-gate-current.json`，避免再把已產生 manifest 誤報為 missing。
4. 加測或用 fixture 驗證：compose script 在 route-load fail 時仍產出 manifest；acceptance 能讀到 fail manifest。
5. 跑本地 validation。
6. commit、push、開 PR、等 checks。
7. merge 到 `dev` 後驗證 dev deploy、`/deployment.json`、hosted browser/BFF probe。
8. 若 integration gate 還因實際 route-load latency 紅燈，不能宣稱完成；要把 latency 當 production blocker 繼續修。

## 驗收標準

本輪不能只用「我本地可以」當完成。完成必須同時滿足：

- Gap 文件存在並清楚定義 Persona lifecycle、paper/live competition、人類審核、緊急處置與 UI 規則。
- Persona Fleet 不把已存在/running/deployed Persona 導向 onboarding/啟動精靈。
- TopBar 不顯示全域 `研究 / 模擬 / 正式` 選單。
- Promotion review 能從 Persona Fleet 進 Human Inbox detail。
- Load gate manifest 在 fail 時仍能被 downstream acceptance 讀到。
- 本地 relevant tests/lint/build 通過，或清楚列出既有 warning/不可執行原因。
- PR 合併到 `dev`。
- Dev deploy 後 `/deployment.json` 指到合併 commit。
- Hosted browser/BFF probe 通過。
- Integration gate 若仍紅，必須是明確 production blocker，不可包裝成完成。
