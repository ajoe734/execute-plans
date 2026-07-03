// 2026-05-20 revamp §7.4 + design ruling §4.4 — BFF HA / Control Plane.
import { mgmt } from "@/lib/bff-v1";
import { LiveReadinessPage } from "./LiveReadinessPage";

export const BffHaReadinessPage = () => (
  <LiveReadinessPage
    title="BFF HA / Control Plane Resilience"
    ariaLabel="BFF HA Readiness"
    load={() => mgmt.readiness.bffHaLiveOnly()}
  />
);
