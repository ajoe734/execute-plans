import { Outlet } from "react-router-dom";
import { SideNav, type NavGroup } from "@/platform/components/SideNav";
import { useT } from "@/platform/hooks";
import {
  LayoutDashboard, Boxes, Users, Wallet, ListOrdered, Repeat, GitBranch,
  FlaskConical, Database, Rocket, Server, ListChecks, Bell, AlertOctagon,
  ScrollText, ClipboardCheck, Wrench, Network, Sparkles, Radio, Settings,
  BookOpen, Workflow, FileText, Factory, Clock, ShieldCheck, Brain, MessagesSquare,
  Beaker,
} from "lucide-react";

export const ManagementLayout = () => {
  const t = useT();
  const groups: NavGroup[] = [
    { label: t("groups.command"), items: [
      { to: "/management/command-center", label: t("nav.commandCenter"), icon: LayoutDashboard },
      { to: "/management/overview", label: t("nav.overview"), icon: LayoutDashboard },
    ]},
    { label: t("groups.coreManagement"), items: [
      { to: "/management/strategies", label: t("nav.strategies"), icon: Boxes },
      { to: "/management/alpha-factory", label: t("nav.alphaFactory"), icon: Factory },
      { to: "/management/personas", label: t("nav.personas"), icon: Users },
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
      { to: "/management/risk-center", label: t("nav.riskCenter"), icon: AlertOctagon },
      { to: "/management/incidents", label: t("nav.incidents"), icon: AlertOctagon },
      { to: "/management/jobs", label: t("nav.jobs"), icon: ListChecks },
      { to: "/management/alerts", label: t("nav.alerts"), icon: Bell },
      { to: "/management/approvals", label: t("nav.approvals"), icon: ClipboardCheck },
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
