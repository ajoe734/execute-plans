// BFF Contract v1 — public surface.
// FROZEN. Source: .lovable/feedback/2026-05-07-final/ (4-file bundle).
// VITE_BFF_MODE = "mock" (default) | "live".

export * from "./dto";
export * from "./errors";
export * from "./headers";
export * from "./paths";
export * from "./client";
export * from "./sse/channels";
export * from "./sse/protocol";
export * from "./sse/bridge";
export * from "./sse/liveSse";
export * from "./lists";
export * from "./useLiveListV1";
export * from "./writes";
export * from "./me";
export * from "./liveStatus";
export * from "./liveTransport";
// Batch VII — escape hatch for legacy seed accessors during migration.
export * from "./legacy";
// Batch VII-c — v5 closed-loop OS namespace (single entrypoint).
export * from "./v5";
