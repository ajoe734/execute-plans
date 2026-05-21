// M1 stub pages for the 2026-05-20 Management revamp.
// Each will be replaced by a real implementation in subsequent packs (M2/M3/M4).
// Spec: .lovable/spec/management-2026-05-20/Pantheon_Management_Lovable_Spec_2026-05-20.md
import { useT } from "@/platform/hooks";

function Stub({ titleKey, subtitleKey }: { titleKey: string; subtitleKey: string }) {
  const t = useT();
  return (
    <section className="p-6 space-y-2" aria-labelledby="stub-title">
      <h1 id="stub-title" className="text-2xl font-semibold text-foreground">{t(titleKey)}</h1>
      <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground/70">
        {t("oversight.stubNotice")}
      </p>
    </section>
  );
}

export const OneRingCockpitPage = () => <Stub titleKey="oneRing.title" subtitleKey="oneRing.subtitle" />;
export const PersonaFleetPage = () => <Stub titleKey="personaFleet.title" subtitleKey="personaFleet.subtitle" />;
export const HumanInboxPage = () => <Stub titleKey="humanInbox.title" subtitleKey="humanInbox.subtitle" />;
export const TradingPulsePage = () => <Stub titleKey="tradingPulse.title" subtitleKey="tradingPulse.subtitle" />;
export const EvolutionJournalPage = () => <Stub titleKey="evolutionJournal.title" subtitleKey="evolutionJournal.subtitle" />;
export const EvidenceExplorerPage = () => <Stub titleKey="evidence.title" subtitleKey="evidence.subtitle" />;
export const EvidencePacketDetailPage = () => <Stub titleKey="evidence.title" subtitleKey="evidence.subtitle" />;
export const PersonaIntentTracesPage = () => <Stub titleKey="personaIntent.title" subtitleKey="personaIntent.subtitle" />;
export const PersonaIntentTraceDetailPage = () => <Stub titleKey="personaIntent.title" subtitleKey="personaIntent.subtitle" />;

export const BrokerLiveReadinessPage = () => <Stub titleKey="readiness.brokerLive.title" subtitleKey="readiness.brokerLive.subtitle" />;
export const CapitalBindingLiveReadinessPage = () => <Stub titleKey="readiness.capitalLive.title" subtitleKey="readiness.capitalLive.subtitle" />;
export const BffHaReadinessPage = () => <Stub titleKey="readiness.bffHa.title" subtitleKey="readiness.bffHa.subtitle" />;
export const StrictPublishAuditPage = () => <Stub titleKey="readiness.strictPublish.title" subtitleKey="readiness.strictPublish.subtitle" />;
