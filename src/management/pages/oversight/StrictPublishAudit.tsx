// 2026-05-20 revamp §7.5 + design ruling §4.5 — Strict Publish Audit.
import { mgmt } from "@/lib/bff-v1";
import { LiveReadinessPage } from "./LiveReadinessPage";

export const StrictPublishAuditPage = () => (
  <LiveReadinessPage
    title="Strict Publish Audit"
    ariaLabel="Strict Publish Audit"
    load={() => mgmt.readiness.strictPublishLiveOnly()}
  />
);
