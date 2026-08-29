// BFF realtime bus — compatibility re-export.
// ACG-03-006 / ACG-03-014: the RealtimeBus implementation and all emit/
// subscribe behavior now live in src/lib/bff-v1/sse/bridge.ts, the canonical
// SSE owner. This file exists only so existing `@/lib/bff/realtime` imports
// keep working without a mass call-site migration.

export { realtime, type RealtimeStatus, type RealtimeJobEvent } from "@/lib/bff-v1/sse/bridge";
