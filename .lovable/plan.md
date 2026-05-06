# Audit F — 把實作層 placeholder / no-op 缺口寫成規格條目

## 結論先講
你看到的「建立沒反應」**不是 Pack E 退化**，是 v3/v4 期間 `ObjectListPage` 第 40 行的「建立」按鈕從來就沒接 `onClick`，9 個 list 頁（personas / capital / strategies / ranking / rebalances / deployments / evolution / research / artifacts）共用同一個 placeholder。同檔還帶了一個 pre-Pack-E 的 `forwardRef` warning。Pack E disposition 28 條沒覆蓋這個範圍，所以我會依你的選擇 —— **先記成 Audit F、等規格回應，src/ 一字不動**。

## 要新增 / 修改的檔案

1. **新增** `.lovable/audits/spec-gap-2026-05-06-F.md`
   - 4 條缺口：F01 list 頁建立按鈕無 onClick / F02 ObjectListPage forwardRef warning / F03 v4 PersonasList 與 v5 PersonaHealthMatrix 入口重複 / F04 Pack E smoke 報告未涵蓋寫入路徑
   - 每條標 severity、影響檔案、推測 Pack 歸屬、建議 disposition
   - Cross-ref Audit D blockers（D05 = entity write contract，與 F01 重疊）與 Pack E Q11 / Q17 / Q23

2. **新增** `.lovable/audits/spec-gap-2026-05-06-F-summary.csv`
   - 4 列：id, severity, scope, files, suggested_owner_pack

3. **編輯** `.lovable/audits/INDEX.md`
   - 新增一列：`spec-gap-2026-05-06-F | 2026-05-06 | 實作層 placeholder / no-op | 4 | 1 / 2 / 1 | OPEN | 待 Pack D F-disposition`

4. **編輯** `mem://audits/open-gaps`
   - 在 Audit D blockers 段落後追加 Audit F 的 4 條 OPEN 項

5. **更新** `mem://index.md`
   - Core 段加一句：`Audit F (2026-05-06) 4 條實作層 OPEN — list 頁建立按鈕為 v3/v4 placeholder，待規格 disposition；不主動補實作。`

## 不會做的事

- **不**修 `ObjectListPage.tsx` 的 onClick（等 F01 disposition）
- **不**修 forwardRef warning（F02 與 F01 綁一起，避免重工）
- **不**動 SideNav / 路由 / `src/` 任何檔案
- **不**重發 Pack E smoke report

## 為何這樣排
你已經明確選「把缺口記成 Audit E 條目，等規格回應」（實際編號接續為 F，因 E 已被 v5 disposition 用掉）。這份 plan 的工作量約 10 分鐘，全部在 `.lovable/` 底下。等你核准後切回 build 模式即可一次寫完。
