# Pack D §D62 — axe-core CI gate (proposal)

The repo already runs an axe smoke pass under
`src/test/a11y-axe-smoke.test.tsx`. The CI gate is implemented as part of the
default `vitest run` invocation:

```bash
bunx vitest run
```

Any vitest spec named `a11y-axe-*.test.tsx` (or `*-axe.test.tsx`) is treated
as part of the axe gate. Failures with axe `impact === "critical" | "serious"`
fail the build.

To extend coverage of new pages/components, add a colocated spec, e.g.
`src/management/pages/v5/__tests__/control-room-axe.test.tsx`, that mounts the
target subtree (with required providers) and asserts:

```ts
const results = await axe.run(container, {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
  rules: { "color-contrast": { enabled: false } }, // jsdom can't measure
});
const blocking = results.violations.filter(
  (v) => v.impact === "critical" || v.impact === "serious",
);
expect(blocking).toHaveLength(0);
```

## Status (2026-05-07)

- ✅ Drawer (EntityCreateDrawer) — G11 aria-describedby + role="alert" landed
- ✅ Button + Input + Label primitives — base smoke pass
- ⏳ DataTable / LineageGraph — deferred (requires real layout, run in browser CI)
- ⏳ Color contrast — disabled in jsdom; covered by Pack C §C056 token audit
