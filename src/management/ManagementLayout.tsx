import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { SideNav, type NavGroup } from "@/platform/components/SideNav";

import { FloatingAgentPanel } from "@/management/components/agent/FloatingAgentPanel";
import { useT } from "@/platform/hooks";
import {
  Boxes, Users, Wallet, ListOrdered, Repeat, GitBranch,
  FlaskConical, Database, Rocket, Server, ListChecks, Bell, AlertOctagon,
  ScrollText, ClipboardCheck, Wrench, Network, Sparkles, Radio, Settings,
  BookOpen, Workflow, FileText, Factory, Clock, ShieldCheck, Brain, MessagesSquare,
  Compass, Target, Eye, ShieldAlert, Trophy, BarChart3, PieChart, CalendarClock,
  KeyRound,
} from "lucide-react";

export const ManagementLayout = () => {
  const t = useT();
  // 2026-05-20 Management revamp §5.1 + PM-1 — Pathreon Management Oversight IA.
  // Oversight (cockpit-first) → Live Readiness → Advanced Registry → Operations →
  // Capabilities → System. Visible labels must read Pathreon Management; internal
  // symbol names may keep historical aliases.
  const groups: NavGroup[] = [
    { label: t("groups.oversight"), items: [
      { to: "/management/cockpit", label: t("nav.managementCockpit"), icon: Compass, dedupeKey: "cockpit" },
      { to: "/management/persona-fleet", label: t("nav.personaFleet"), icon: Users, dedupeKey: "fleet" },
      { to: "/management/human-inbox", label: t("nav.humanInbox"), icon: Eye, dedupeKey: "humanQueue" },
      { to: "/management/trading-pulse", label: t("nav.tradingPulse"), icon: Target },
      { to: "/management/evolution-journal", label: t("nav.evolutionJournal"), icon: GitBranch },
      { to: "/management/evidence", label: t("nav.evidenceExplorer"), icon: FileText },
      { to: "/management/persona-intent", label: t("nav.personaIntent"), icon: Brain },
      // /management/ask removed — the ask flow is the always-available floating
      // agent panel (bottom-right); the standalone mock NL page was redundant.
    ]},

    // 2026-05-22 PM-12 — Performance & League group.
    { label: t("groups.performanceLeague"), items: [
      { to: "/management/portfolio-book", label: t("nav.portfolioBook"), icon: PieChart },
      { to: "/management/persona-league", label: t("nav.personaLeague"), icon: Trophy },
      { to: "/management/quarterly-ranking", label: t("nav.quarterlyRanking"), icon: CalendarClock },
      { to: "/management/performance-attribution", label: t("nav.performanceAttribution"), icon: BarChart3 },
    ]},

    { label: t("groups.liveReadiness"), items: [
      { to: "/management/readiness/ep5", label: "EP5 Canary Readiness", icon: ShieldAlert },
      { to: "/management/readiness/broker-live", label: t("nav.brokerLiveReadiness"), icon: ShieldAlert, dedupeKey: "brokerLive" },
      { to: "/management/readiness/capital-binding-live", label: t("nav.capitalLiveReadiness"), icon: Wallet, dedupeKey: "capitalLive" },
      { to: "/management/readiness/bff-ha", label: t("nav.bffHaReadiness"), icon: Server, dedupeKey: "bffHa" },
      { to: "/management/readiness/strict-publish", label: t("nav.strictPublishAudit"), icon: ShieldCheck, dedupeKey: "strict" },
    ]},
    { label: t("groups.advancedRegistry"), items: [
      { to: "/management/strategies", label: t("nav.strategyRegistry"), icon: Boxes },
      { to: "/management/alpha-factory", label: t("nav.alphaFactory"), icon: Factory },
      { to: "/management/personas", label: t("nav.personaRegistry"), icon: Users, dedupeKey: "personas" },
      { to: "/management/capital", label: t("nav.capital"), icon: Wallet },
      { to: "/management/ranking", label: t("nav.ranking"), icon: ListOrdered },
      { to: "/management/rebalance", label: t("nav.rebalance"), icon: Repeat },
      { to: "/management/evolution", label: t("nav.evolution"), icon: GitBranch },
      { to: "/management/experiments", label: t("nav.experiments"), icon: FlaskConical },
      { to: "/management/artifacts", label: t("nav.artifacts"), icon: Database },
      { to: "/management/lineage", label: t("nav.lineage"), icon: Workflow },
      // Closed-Loop OS detail surfaces stay routable, but the primary nav only
      // exposes the overview until each loop subpage has production-depth proof.
      { to: "/management/loops", label: t("nav.loops"), icon: Workflow, dedupeKey: "loops" },
    ]},
    { label: t("groups.operations"), items: [
      { to: "/management/deployments", label: t("nav.deployments"), icon: Rocket },
      { to: "/management/runtimes", label: t("nav.runtimes"), icon: Server },
      { to: "/management/risk", label: t("nav.riskCenter"), icon: AlertOctagon },
      { to: "/management/incidents", label: t("nav.incidents"), icon: AlertOctagon },
      { to: "/management/jobs", label: t("nav.jobs"), icon: ListChecks },
      { to: "/management/alerts", label: t("nav.alerts"), icon: Bell },
      { to: "/management/sentinel", label: t("nav.sentinel"), icon: ShieldAlert, dedupeKey: "humanQueue" },
      { to: "/management/interventions", label: t("nav.interventions"), icon: Eye, dedupeKey: "humanQueue" },
      { to: "/management/approvals", label: t("nav.approvals"), icon: ClipboardCheck, dedupeKey: "humanQueue" },
      { to: "/management/governance", label: t("nav.governance"), icon: ClipboardCheck },
      { to: "/management/governance/policies", label: t("nav.routePolicies"), icon: ClipboardCheck },
      { to: "/management/governance/permissions", label: t("nav.permissions"), icon: ShieldCheck },
      { to: "/management/governance/memory", label: t("nav.memoryGov"), icon: Brain },
      { to: "/management/governance/consult", label: t("nav.consultRules"), icon: MessagesSquare },
      { to: "/management/knowledge", label: t("nav.knowledge"), icon: BookOpen },
      { to: "/management/postmortems", label: t("nav.postmortems"), icon: FileText },
    ]},
    { label: t("groups.capabilities"), items: [
      { to: "/management/tools", label: t("nav.tools"), icon: Wrench },
      { to: "/management/mcp", label: t("nav.mcp"), icon: Network },
      { to: "/management/skills", label: t("nav.skills"), icon: Sparkles },
      { to: "/management/workflows", label: t("nav.workflowTemplates"), icon: Workflow },
      { to: "/management/hooks", label: t("nav.hooks"), icon: Clock },
      { to: "/management/channels", label: t("nav.channels"), icon: Radio },
    ]},
    { label: t("groups.system"), items: [
      { to: "/management/llm-provider-auth", label: "LLM Provider Auth", icon: KeyRound },
      { to: "/management/data-sources", label: t("nav.dataSourcesManagement"), icon: Database },
      { to: "/management/audit", label: t("nav.audit"), icon: ScrollText },
      { to: "/management/settings", label: t("nav.settings"), icon: Settings },
    ]},
    // 2026-06-15 console consolidation — legacy nav group removed.
    // Control Room / Overview now redirect to the single Cockpit console.

  ];

  return (
    <>
      <SideNav groups={groups} />
      <main className="w-full flex-1 min-w-0 overflow-x-hidden">
        <ErrorBoundary key={useLocation().pathname} scope="Management page">
          <Outlet />
        </ErrorBoundary>

      </main>
      <FloatingAgentPanel />
    </>
  );
};
