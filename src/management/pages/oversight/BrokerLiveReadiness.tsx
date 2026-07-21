// 2026-05-20 revamp §7.2 + design ruling §4.2 — Broker Live Activation.
import { mgmt } from "@/lib/bff-v1";
import { LiveReadinessPage } from "./LiveReadinessPage";

export const BrokerLiveReadinessPage = () => (
  <LiveReadinessPage
    title="Broker Live Activation"
    ariaLabel="Broker Live Readiness"
    load={() => mgmt.readiness.brokerLiveOnly()}
  />
);
