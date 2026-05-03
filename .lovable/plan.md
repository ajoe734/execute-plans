## 目標
把剛存進 `.lovable/spec/` 的 Pantheon 規格書位置記到 memory，避免下次又找不到。

## 變更
1. 建立 `mem://index.md` — Core 規則：「規劃／review 前一律先讀 `.lovable/spec/`」。
2. 建立 `mem://reference/spec.md` — 列出三個 spec 檔路徑、Parts 1–8 主題、讀取方式（`code--view` + 行號範圍 或 `rg`）。

## 不變更
- 程式碼、UI、依賴一律不動。
- 已複製進 repo 的三個 spec 檔保留原樣。
