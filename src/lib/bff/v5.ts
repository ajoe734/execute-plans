// BFF v5 facade — compatibility re-export.
// ACG-03-015: the live bffV5 implementation now lives in src/lib/bff-v1/v5.ts,
// the sole live V5 API owner. This file exists only so existing
// `@/lib/bff/v5` imports keep working without a mass call-site migration.

export { bffV5, type BffV5 } from "@/lib/bff-v1/v5";
