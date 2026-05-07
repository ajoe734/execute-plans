# Pantheon Pack D-F + D-H — UI Tokens / A11y / Format / QA Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-F + D-H
**對應 Audit D**：D39–D50, D62, D63（D-F）+ D61（D-H）
**狀態**：Canonical
**重要**：所有 token 必須以 HSL 寫入 `index.css` / `tailwind.config.ts`，禁止組件硬編色。

---

## D39 — Spacing & Typography Scale

**Spacing（4pt）**：
```text
0=0    1=4px   2=8px   3=12px  4=16px
5=20px 6=24px  8=32px  10=40px 12=48px 16=64px
```

**Typography**：
```text
xs   12/16
sm   14/20
base 16/24
lg   18/28
xl   20/28
2xl  24/32
3xl  30/36
mono-xs 11/16
```

---

## D40 — Risk Severity Color Token

```text
risk.info      hsl(210, 80%, 50%)
risk.low       hsl(145, 60%, 42%)
risk.medium    hsl( 38, 90%, 50%)
risk.high      hsl( 25, 90%, 52%)
risk.critical  hsl(  0, 72%, 52%)
```

Dark mode：相同 hue，lightness +8–12%。

---

## D41 — Toast 規格

```text
position : top-right desktop / bottom-center mobile
duration : success 4s / info 5s / warning 7s / error 8s
critical : sticky until dismissed
max stack: 5
duplicates: collapse by dedupeKey
```

---

## D42 — Form Validation 觸發

1. 初次輸入不即時報錯。
2. field touched 後 `onChange` validation。
3. `onSubmit` 全欄位 validation。
4. high-risk memo 顯示剩餘字數 + min length。

---

## D43 — Skeleton Threshold

```text
show skeleton if loading > 200ms
minimum skeleton display = 300ms
> 2s  show "Still loading" helper
> 10s show retry affordance
```

---

## D44 — Empty State 4 元素

```text
icon + title + description + primary CTA（or 說明 why no CTA）
```

唯讀情境：CTA disabled + tooltip。

---

## D45 — Confirm Dialog + Token Flow

```text
1. User clicks high-risk action。
2. Dialog 顯示 impact / blast radius / rollback info。
3. User 輸入 memo。
4. UI request confirm token。
5. User confirm exact phrase（若需要）。
6. UI redeem token + idempotencyKey。
7. BFF 執行 action。
8. Audit + realtime event emitted。
```

---

## D46 — Reduced Motion

```text
remove: spinners, animated gradients, marquee, pulse loops
keep  : opacity transition ≤100ms, focus ring, progress value changes
```

---

## D47 — Focus Ring Token

```text
focus.ring.color  hsl(210, 90%, 55%)
focus.ring.width  2px
focus.ring.offset 2px
focus.ring.radius inherit
```

---

## D48 — Format Tokens

```ts
type FormatTokens = {
  dateShort: Intl.DateTimeFormatOptions;
  dateTime:  Intl.DateTimeFormatOptions;
  relativeTime: true;
  numberCompact: Intl.NumberFormatOptions;
  percent:  Intl.NumberFormatOptions;
  currency: Intl.NumberFormatOptions;
};
```

---

## D49 — Glossary Key 命名

```text
nav.controlRoom
v5.loop.execution.title
actions.strategy.promote_live.label
errors.PERMISSION_DENIED
```

dot.case namespace。

---

## D50 — Bucket Color

```text
bucket.1 hsl(210, 70%, 55%)
bucket.2 hsl(145, 55%, 45%)
bucket.3 hsl( 38, 88%, 52%)
bucket.4 hsl( 25, 88%, 52%)
bucket.5 hsl(  0, 70%, 52%)
```

與 risk severity 對齊；圖表使用本 token。

---

## D62 — axe-core Rule Subset

```text
violations[impact=critical] = fail
violations[impact=serious]  = fail
moderate                    = warn unless allowlist (owner + expiry)
```

---

## D63 — Perf Budget

| Page class | LCP | TTI | Notes |
|---|---:|---:|---|
| Control Room | 2.5s | 3.0s | above-fold summary |
| Entity List | 2.0s | 2.5s | first 50 rows |
| Detail Page | 2.8s | 3.5s | first tab |
| Heavy Studio | 3.5s | 4.5s | charts lazy |
| Sentinel / HIQ | 2.5s | 3.0s | findings visible |

---

## D61 — E2E Naming + Fixture（Pack D-H）

**Scenario naming**：
```text
e2e.<surface>.<flow>.<expected>
```

**Examples**：
```text
e2e.controlRoom.load.showsLoopSummary
e2e.execution.personaHealth.opensFinding
e2e.interventions.approve.triggersAudit
e2e.writeIntent.strategyCreate.appearsInList
```

**Fixture ID prefixes**：
```text
stg_*  per_*  cp_*  rb_*  dp_*  job_*
al_*   inc_*  ap_*  loop_* find_* int_*
```

---

## 落地階段建議（Batch II 可立即）

1. `index.css` 加入 `--risk-info/low/medium/high/critical`、`--bucket-1..5`、`--focus-ring-*` HSL token。
2. `tailwind.config.ts` 暴露對應 utility（`text-risk-high`, `bg-bucket-3`...）。
3. 新增 `src/components/ui/empty-state.tsx`（4 元素標準）+ `<Skeleton>` 200ms threshold wrapper。
4. `src/lib/v4/format.ts` 包 `Intl.*` formatter（綁 resolvedLocale）。
5. `prefers-reduced-motion` media query 在 `index.css` 統一處理。
6. CI 加 axe-core gate（fail on critical/serious）+ Lighthouse perf budget。
7. 既有 fixture ID 改前綴。
