import { Outlet } from "react-router-dom";
import { SideNav, type NavGroup } from "@/platform/components/SideNav";
import { useT } from "@/platform/hooks";
import {
  Sun, LineChart, Activity, NotebookPen, MessageSquare, BookMarked,
  Bell, Inbox, GraduationCap, Brain, Wand2, FlaskConical, Beaker, Radio, Users,
} from "lucide-react";

export const AgoraLayout = () => {
  const t = useT();
  const groups: NavGroup[] = [
    { label: t("groups.daily"), items: [
      { to: "/agora", label: t("nav.daily"), icon: Sun },
      { to: "/agora/market", label: t("nav.market"), icon: LineChart },
      { to: "/agora/signals", label: t("nav.signals"), icon: Activity },
      { to: "/agora/triage", label: t("nav.triage"), icon: Bell },
    ]},
    { label: t("groups.research"), items: [
      { to: "/agora/notebook", label: t("nav.notebook"), icon: NotebookPen },
      { to: "/agora/ask", label: t("nav.askPersonas"), icon: MessageSquare },
      { to: "/agora/committee", label: t("nav.committee"), icon: Users },
      { to: "/agora/decisions", label: t("nav.decisions"), icon: BookMarked },
      { to: "/agora/insights", label: t("nav.insights"), icon: Inbox },
    ]},
    { label: t("groups.training"), items: [
      { to: "/agora/trainer", label: t("nav.trainerStudio"), icon: GraduationCap },
      { to: "/agora/memory", label: t("nav.memoryReview"), icon: Brain },
      { to: "/agora/skills", label: t("nav.skillCoaching"), icon: Wand2 },
      { to: "/agora/persona-lab", label: t("nav.personaLab"), icon: FlaskConical },
      { to: "/agora/eval", label: t("nav.eval"), icon: Beaker },
      { to: "/agora/channels", label: t("nav.channels"), icon: Radio },
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
