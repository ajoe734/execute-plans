import { Outlet } from "react-router-dom";
import { SideNav, type NavGroup } from "@/platform/components/SideNav";
import { useT } from "@/platform/hooks";
import {
  LayoutDashboard, Boxes, Users, Wallet, ListOrdered, Repeat, GitBranch,
  FlaskConical, Database, Rocket, Server, ListChecks, Bell, AlertOctagon,
  ScrollText, ClipboardCheck, Wrench, Network, Sparkles, Radio,
} from "lucide-react";

export const ManagementLayout = () => {
  const t = useT();
  const groups: NavGroup[] = [
    { label: t("groups.overview"), items: [
      { to: "/management", label: t("nav.commandCenter"), icon: LayoutDashboard },
      { to: "/management/overview", label: t("nav.overview"), icon: LayoutDashboard },
      { to: "/management/risk-center", label: t("nav.riskCenter"), icon: AlertOctagon },
    ]},
    { label: t("groups.objects"), items: [
      { to: "/management/strategies", label: t("nav.strategies"), icon: Boxes },
      { to: "/management/personas", label: t("nav.personas"), icon: Users },
      { to: "/management/capital-pools", label: t("nav.capitalPools"), icon: Wallet },
      { to: "/management/ranking-formulas", label: t("nav.rankingFormulas"), icon: ListOrdered },
      { to: "/management/rebalances", label: t("nav.rebalances"), icon: Repeat },
      { to: "/management/evolution", label: t("nav.evolution"), icon: GitBranch },
      { to: "/management/experiments", label: t("nav.experiments"), icon: FlaskConical },
      { to: "/management/artifacts", label: t("nav.artifacts"), icon: Database },
    ]},
    { label: t("groups.operations"), items: [
      { to: "/management/deployments", label: t("nav.deployments"), icon: Rocket },
      { to: "/management/runtimes", label: t("nav.runtimes"), icon: Server },
      { to: "/management/jobs", label: t("nav.jobs"), icon: ListChecks },
      { to: "/management/alerts", label: t("nav.alerts"), icon: Bell },
      { to: "/management/incidents", label: t("nav.incidents"), icon: AlertOctagon },
      { to: "/management/audit", label: t("nav.audit"), icon: ScrollText },
      { to: "/management/approvals", label: t("nav.approvals"), icon: ClipboardCheck },
    ]},
    { label: t("groups.capabilities"), items: [
      { to: "/management/tools", label: t("nav.tools"), icon: Wrench },
      { to: "/management/mcp", label: t("nav.mcp"), icon: Network },
      { to: "/management/skills", label: t("nav.skills"), icon: Sparkles },
      { to: "/management/channels", label: t("nav.channels"), icon: Radio },
    ]},
  ];

  return (
    <>
      <SideNav groups={groups} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </>
  );
};
