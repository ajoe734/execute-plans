# Frontend locale policy

Pantheon operator surfaces use `zh-TW` as the primary locale and `en-US` as
the fallback. `src/i18n/index.ts` owns that runtime policy; components must not
choose a separate default.

Operator-visible copy belongs in the frontend catalogs under
`src/i18n/locales/`. BFF contracts may return stable i18n keys, enum values,
and warning/reason codes. During additive migrations, deprecated display-copy
fields may remain as a safe fallback, but the UI must resolve the key first and
must never render a raw key.

Agora Trading Room proposal copy uses `agora.tradingRoom.*`. Add every new key
to both catalogs, render additive BFF keys through `agoraCopy`, and extend the
Agora i18n guard when an audit identifies another forbidden mixed-language
literal.
