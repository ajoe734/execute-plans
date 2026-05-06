import { Outlet } from "react-router-dom";
import { SideNav, type NavGroup } from "@/platform/components/SideNav";
import { useT } from "@/platform/hooks";
import {
  LayoutDashboard, Boxes, Users, Wallet, ListOrdered, Repeat, GitBranch,
  FlaskConical, Database, Rocket, Server, ListChecks, Bell, AlertOctagon,
  ScrollText, ClipboardCheck, Wrench, Network, Sparkles, Radio, Settings,
  BookOpen, Workflow, FileText, Factory, Clock, ShieldCheck, Brain, MessagesSquare,
  Beaker, Compass, Target, Eye, ShieldAlert,
} from "lucide-react";

export const ManagementLayout = () => {
  const t = useT();
  const groups: NavGroup[] = [
    // Pack E E1+E7 — v5 Closed-Loop OS top-level group (Q17/Q23 staged replacement).
    // dedupeKey prevents double-highlighting when nested loop routes are active.
    { label: t("groups.closedLoopOs"), items: [
      { to: "/management/control-room", label: t("nav.controlRoom"), icon: Compass, dedupeKey: "controlRoom" },
      { to: "/management/loops", label: t("nav.loops"), icon: Workflow, dedupeKey: "loops" },
      { to: "/management/loops/research", label: t("nav.loopResearch"), icon: FlaskConical, dedupeKey: "loops" },
      { to: "/management/loops/execution", label: t("nav.loopExecution"), icon: Target, dedupeKey: "loops" },
      { to: "/management/loops/optimization", label: t("nav.loopOptimization"), icon: GitBranch, dedupeKey: "loops" },
      { to: "/management/sentinel", label: t("nav.sentinel"), icon: ShieldAlert },
      { to: "/management/interventions", label: t("nav.interventions"), icon: Eye },
    ]},
    { label: t("groups.coreManagement"), items: [
      { to: "/management/strategies", label: t("nav.strategies"), icon: Boxes },
      { to: "/management/alpha-factory", label: t("nav.alphaFactory"), icon: Factory },
      // Pack E Q18 — Personas remains canonical entry. Execution Loop persona view
      // shares dedupeKey="personas" so the sidebar does not double-highlight.
      { to: "/management/personas", label: t("nav.personas"), icon: Users, dedupeKey: "personas" },
      { to: "/management/capital", label: t("nav.capital"), icon: Wallet },
      { to: "/management/ranking", label: t("nav.ranking"), icon: ListOrdered },
      { to: "/management/rebalance", label: t("nav.rebalance"), icon: Repeat },
      { to: "/management/evolution", label: t("nav.evolution"), icon: GitBranch },
    ]},
    { label: t("groups.researchGov"), items: [
      { to: "/management/experiments", label: t("nav.experiments"), icon: FlaskConical },
      { to: "/management/governance", label: t("nav.governance"), icon: ClipboardCheck },
      { to: "/management/governance/policies", label: t("nav.routePolicies"), icon: ClipboardCheck },
      { to: "/management/governance/permissions", label: t("nav.permissions"), icon: ShieldCheck },
      { to: "/management/governance/memory", label: t("nav.memoryGov"), icon: Brain },
      { to: "/management/governance/consult", label: t("nav.consultRules"), icon: MessagesSquare },
      { to: "/management/knowledge", label: t("nav.knowledge"), icon: BookOpen },
      { to: "/management/postmortems", label: t("nav.postmortems"), icon: FileText },
      { to: "/management/lineage", label: t("nav.lineage"), icon: Workflow },
      { to: "/management/artifacts", label: t("nav.artifacts"), icon: Database },
    ]},
    { label: t("groups.operations"), items: [
      { to: "/management/deployments", label: t("nav.deployments"), icon: Rocket },
      { to: "/management/runtimes", label: t("nav.runtimes"), icon: Server },
      { to: "/management/risk", label: t("nav.riskCenter"), icon: AlertOctagon },
      { to: "/management/incidents", label: t("nav.incidents"), icon: AlertOctagon },
      { to: "/management/jobs", label: t("nav.jobs"), icon: ListChecks },
      { to: "/management/alerts", label: t("nav.alerts"), icon: Bell },
      // Pack E E6/E7 — Approvals coexists with HIQ. dedupeKey shared so
      // /management/interventions (HIQ) is the canonical entry and Approvals
      // never double-highlights when reached from HIQ links.
      { to: "/management/approvals", label: t("nav.approvals"), icon: ClipboardCheck, dedupeKey: "humanQueue" },
    ]},
    { label: t("groups.capabilities"), items: [
      { to: "/management/tools", label: t("nav.tools"), icon: Wrench },
      { to: "/management/mcp", label: t("nav.mcp"), icon: Network },
      { to: "/management/skills", label: t("nav.skills"), icon: Sparkles },
      { to: "/management/workflows", label: t("nav.workflowTemplates"), icon: Workflow },
      { to: "/management/hooks", label: t("nav.hooks"), icon: Clock },
      { to: "/management/channels", label: t("nav.channels"), icon: Radio },
      { to: "/management/studios", label: t("nav.studios"), icon: Beaker },
    ]},
    { label: t("groups.system"), items: [
      { to: "/management/audit", label: t("nav.audit"), icon: ScrollText },
      { to: "/management/settings", label: t("nav.settings"), icon: Settings },
    ]},
    // Pack E E7 — Legacy group: Command Center / Overview kept reachable
    // for muscle memory but ranked below v5 surfaces. NOT auto-redirected
    // (per Q17) so deep links survive.
    { label: t("groups.legacy"), items: [
      { to: "/management/command-center", label: t("nav.commandCenter"), icon: LayoutDashboard },
      { to: "/management/overview", label: t("nav.overview"), icon: LayoutDashboard },
    ]},
  ];

  return (
    <>
      <SideNav groups={groups} />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </>
  );
};
