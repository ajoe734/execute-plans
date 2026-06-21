// Agora app shell — Phase M0 (C3 §3 "Phase M0").
// Displays servant status and the primary IA tab skeleton.
// Three canonical tabs per contract-closure/05:
//   trading-room   交易操盤室
//   strategy-workshop  策略工坊
//   strategy-performance 策略執行與績效
//
// Constraints:
// - No management routes, capital-pool data, or RuntimeBinding references.
// - All BFF reads go through bff-v1/agora/*; no direct fetch() in this file.
// - Auth audience baked at build time (VITE_AUTH_AUDIENCE=pantheon-agora).

import React, { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { agoraServantClient } from "@/lib/bff-v1/agora/servant";
import type { ServantProfile, ServantStatus } from "@/lib/bff-v1/agora/servant";
import { agoraIdentityClient } from "@/lib/bff-v1/agora/identity";

type AgoraTab = "trading-room" | "strategy-workshop" | "strategy-performance";

const TABS: { id: AgoraTab; label: string }[] = [
  { id: "trading-room", label: "交易操盤室" },
  { id: "strategy-workshop", label: "策略工坊" },
  { id: "strategy-performance", label: "策略執行與績效" },
];

type ServantLoadState =
  | { kind: "loading" }
  | { kind: "ready"; profile: ServantProfile }
  | { kind: "error"; message: string };

function statusVariant(status: ServantStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "suspended":
    case "retired":
      return "destructive";
    case "paper_only":
    case "shadow_only":
      return "secondary";
    default:
      return "outline";
  }
}

function statusLabel(status: ServantStatus): string {
  switch (status) {
    case "active":
      return "運作中";
    case "suspended":
      return "已暫停";
    case "paper_only":
      return "紙上交易";
    case "shadow_only":
      return "Shadow";
    case "retired":
      return "已退役";
    default:
      return status;
  }
}

function ServantStatusBar({ state }: { state: ServantLoadState }) {
  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b text-sm text-muted-foreground">
        <span>正在載入 Servant…</span>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b text-sm text-destructive">
        <span>Servant 無法連線：{state.message}</span>
      </div>
    );
  }
  const { profile } = state;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b text-sm">
      <span className="font-medium">{profile.display_name}</span>
      <Badge variant={statusVariant(profile.status)}>{statusLabel(profile.status)}</Badge>
      {profile.capability_summary.can_ask && (
        <span className="text-xs text-muted-foreground">問答</span>
      )}
      {profile.capability_summary.can_research && (
        <span className="text-xs text-muted-foreground">研究</span>
      )}
      {profile.capability_summary.can_workshop && (
        <span className="text-xs text-muted-foreground">工坊</span>
      )}
    </div>
  );
}

function TabNav({
  activeTab,
  onSelect,
  labelledBy,
}: {
  activeTab: AgoraTab;
  onSelect: (tab: AgoraTab) => void;
  labelledBy: string;
}) {
  return (
    <nav role="tablist" aria-labelledby={labelledBy} className="flex border-b">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          onClick={() => onSelect(tab.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function TabPanel({ id, active }: { id: AgoraTab; active: boolean }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className="flex-1 p-6"
    >
      <p className="text-sm text-muted-foreground">
        {TABS.find((t) => t.id === id)?.label} — 即將推出
      </p>
    </div>
  );
}

export function AgoraApp() {
  const headingId = useId();
  const [activeTab, setActiveTab] = useState<AgoraTab>("trading-room");
  const [servantState, setServantState] = useState<ServantLoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function initServant() {
      try {
        await Promise.all([agoraIdentityClient.getMe(), agoraIdentityClient.getCapabilities()]);
        const profile = await agoraServantClient.ensure();
        if (!cancelled) setServantState({ kind: "ready", profile });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Servant 服務無法連線";
          setServantState({ kind: "error", message });
        }
      }
    }

    initServant();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-4 py-3">
        <h1 id={headingId} className="text-base font-semibold">
          Pantheon Agora
        </h1>
      </header>

      <ServantStatusBar state={servantState} />

      <TabNav activeTab={activeTab} onSelect={setActiveTab} labelledBy={headingId} />

      <main className="flex flex-col flex-1 overflow-auto">
        {TABS.map((tab) => (
          <TabPanel key={tab.id} id={tab.id} active={activeTab === tab.id} />
        ))}
      </main>
    </div>
  );
}

export default AgoraApp;
