// 2026-05-20 revamp §7.3 + design ruling §4.3 — Capital Binding Live.
import { mgmt } from "@/lib/bff-v1";
import { LiveReadinessPage } from "./LiveReadinessPage";

export const CapitalBindingLiveReadinessPage = () => (
  <LiveReadinessPage
    title="Capital Binding Live"
    ariaLabel="Capital Binding Live Readiness"
    load={() => mgmt.readiness.capitalBindingLiveOnly()}
  />
);
