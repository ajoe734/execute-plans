import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Check, Circle, RotateCcw } from "lucide-react";
import { useT } from "@/platform/hooks";
import { clearPersisted, persistNow } from "@/lib/bff/persistence";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

type Item = { id: string; label: string; detail?: string };
type Section = { id: string; title: string; items: Item[] };

// Sourced verbatim from .lovable/spec/FULL_en-US.md §10–§14 (Part 8 QA Checklist).
const SECTIONS: Section[] = [
  {
    id: "global",
    title: "§10 — Global",
    items: [
      { id: "g.routes", label: "App has /management and /agora route groups." },
      { id: "g.product", label: "Product switcher works." },
      { id: "g.lang", label: "Language switcher supports zh-TW and en-US." },
      { id: "g.persist", label: "Locale persists in local storage." },
      { id: "g.sidebar", label: "Sidebar labels switch language." },
      { id: "g.buttons", label: "Button labels switch language." },
      { id: "g.status", label: "Status badges switch language." },
      { id: "g.risk", label: "Risk badges switch language." },
      { id: "g.empty", label: "Empty states switch language." },
      { id: "g.error", label: "Error states switch language." },
      { id: "g.modal", label: "High-risk confirmation modal switches language." },
      { id: "g.bff", label: "Mock BFF client is used for all data." },
      { id: "g.nobackend", label: "No real backend calls are made." },
      { id: "g.notrade", label: "No real trading operation is possible." },
      { id: "g.actions", label: "All major entities include availableActions." },
      { id: "g.disabled", label: "Disabled actions show disabled reason." },
      { id: "g.jobdrawer", label: "Job drawer exists." },
      { id: "g.notif", label: "Notification center exists." },
      { id: "g.inspector", label: "Right inspector drawer exists." },
    ],
  },
  {
    id: "mgmt",
    title: "§11 — Management Console",
    items: [
      { id: "m.cc.bottle", label: "Command Center shows lifecycle bottlenecks." },
      { id: "m.cc.appr", label: "Command Center shows pending approvals." },
      { id: "m.cc.inc", label: "Command Center shows open incidents." },
      { id: "m.cc.jobs", label: "Command Center shows running jobs." },
      { id: "m.cc.handoff", label: "Command Center shows Agora incoming queue." },
      { id: "m.stg.list", label: "Strategy list shows lifecycle, owner persona, capital pool, risk, paper/live status." },
      { id: "m.stg.detail", label: "Strategy detail has overview, spec, experiments, performance, execution, risk, incidents, artifacts, governance, lineage, audit." },
      { id: "m.stg.highrisk", label: "Strategy high-risk actions require confirmation." },
      { id: "m.per.list", label: "Persona list shows status, rank, capital binding, active strategies, tool permissions, policy violations." },
      { id: "m.per.detail", label: "Persona detail supports route policy, tools/MCP/skills, capital binding, activity monitor, training, evaluation." },
      { id: "m.cap.detail", label: "Capital pool detail shows mandate, risk budget, exposure, persona binding, strategy binding, rebalance history." },
      { id: "m.rank", label: "Ranking formula page supports formula weights, penalties, normalization, compare, approval state." },
      { id: "m.rebal", label: "Quarterly rebalance supports metric freeze, ranking result, allocation simulation, manual override, review, apply, rollback." },
      { id: "m.evo", label: "Evolution program page shows direction, fitness formula, mutation rules, active runs, candidates." },
      { id: "m.exp", label: "Experiments page shows running/completed/failed experiments and jobs." },
      { id: "m.gov", label: "Governance queue shows all approval types." },
      { id: "m.runtime", label: "Runtime / Risk / Incident pages support response actions." },
      { id: "m.caps", label: "Tools / MCP / Skills pages support registry, permissions, audit." },
      { id: "m.jobs", label: "Jobs page shows progress, logs, cancel/retry." },
      { id: "m.audit", label: "Audit page shows entity timeline." },
    ],
  },
  {
    id: "agora",
    title: "§12 — Agora Workbench",
    items: [
      { id: "a.daily.default", label: "Daily Trading Cockpit is the default Agora entry page." },
      { id: "a.daily", label: "Daily page shows market summary, signals, alerts, persona brief, research questions." },
      { id: "a.market", label: "Market / Watchlist page supports annotations and create insight." },
      { id: "a.signal", label: "Signal Review supports agree, disagree, flag suspicious, ask persona, create research task." },
      { id: "a.notebook", label: "Research Notebook supports note creation and convert to insight / strategy idea / experiment request." },
      { id: "a.ask", label: "Ask Personas supports persona selection and context selection." },
      { id: "a.committee", label: "Committee Room supports multiple personas, evidence pack, discussion, memo generation." },
      { id: "a.journal", label: "Decision Journal supports linked signal/strategy, rationale, confidence, outcome follow-up." },
      { id: "a.triage", label: "Alert Triage supports acknowledge, dismiss, escalate, ask persona." },
      { id: "a.inbox", label: "Insight Inbox supports promote to strategy idea, attach to strategy, create research task, create training example." },
      { id: "a.trainer", label: "Trainer Studio supports feedback queue, behavior rules, evaluation, drift monitor." },
      { id: "a.memory", label: "Memory Review supports approve/reject/edit/merge/move memory." },
      { id: "a.skill", label: "Skill Coaching supports draft, sandbox, send to Management." },
      { id: "a.safety", label: "Agora never exposes direct live deploy, rollback, capital rebalance, or production MCP/Skill approval." },
    ],
  },
  {
    id: "highrisk",
    title: "§13 — High-Risk Action QA",
    items: [
      { id: "hr.live", label: "Promote to Live shows confirmation." },
      { id: "hr.rollback", label: "Rollback shows confirmation." },
      { id: "hr.rebal", label: "Apply Rebalance shows confirmation." },
      { id: "hr.freeze", label: "Freeze Capital Pool shows confirmation." },
      { id: "hr.rank", label: "Change Ranking Formula active version shows confirmation." },
      { id: "hr.mcp", label: "Grant MCP Tool shows approval / confirmation." },
      { id: "hr.skill", label: "Approve Skill shows confirmation." },
      { id: "hr.persona", label: "Suspend Persona shows confirmation." },
      { id: "hr.kill", label: "Emergency Kill shows critical confirmation." },
      { id: "hr.modal.op", label: "Modal: Operation name." },
      { id: "hr.modal.target", label: "Modal: Target object." },
      { id: "hr.modal.cur", label: "Modal: Current state." },
      { id: "hr.modal.new", label: "Modal: New state / expected effect." },
      { id: "hr.modal.risk", label: "Modal: Risk impact." },
      { id: "hr.modal.appr", label: "Modal: Required approval." },
      { id: "hr.modal.memo", label: "Modal: Audit memo field." },
      { id: "hr.modal.btn", label: "Modal: Confirm / cancel buttons." },
    ],
  },
  {
    id: "final",
    title: "§14 — Final Acceptance",
    items: [
      { id: "f.split", label: "App clearly separates Management Console and Agora Workbench." },
      { id: "f.mc", label: "Management Console combines management, monitoring, response, approval, deployment, rollback, audit." },
      { id: "f.agora", label: "Agora Workbench is friendly to analysts and traders, not an admin dashboard." },
      { id: "f.mock", label: "All major pages run with mock data." },
      { id: "f.bff", label: "All actions call mock BFF client functions." },
      { id: "f.cards", label: "All major entity cards/detail pages show state, risk, linked entities, available actions, jobs, alerts, audit summary." },
      { id: "f.confirm", label: "High-risk actions are protected by confirmation modal." },
      { id: "f.lang", label: "zh-TW / en-US language switching works across both products." },
      { id: "f.creates", label: "Agora can create insights, research tasks, training examples, management handoff items." },
      { id: "f.noexec", label: "Agora cannot directly execute live or capital-affecting actions." },
      { id: "f.handoff", label: "Management receives handoff items from Agora in Command Center." },
      { id: "f.demo", label: "Demo scenarios A–F can be clicked through with mock data." },
    ],
  },
];

const STORAGE_KEY = "qa-checklist-v2";

export const QAChecklist = () => {
  const t = useT();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
  });

  const toggle = (id: string) => {
    setChecked((c) => {
      const next = { ...c, [id]: !c[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const total = SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const pct = Math.round((done / total) * 100);
  const reset = () => { setChecked({}); localStorage.removeItem(STORAGE_KEY); };
  const fillAll = () => {
    const next: Record<string, boolean> = {};
    SECTIONS.forEach((s) => s.items.forEach((i) => { next[i.id] = true; }));
    setChecked(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const [resetPersistOpen, setResetPersistOpen] = useState(false);
  const handleResetPersist = () => {
    clearPersisted();
    toast.success(t("qa.persistResetDone"));
    setTimeout(() => window.location.reload(), 400);
  };
  const handleSnapshotNow = () => {
    persistNow();
    toast.success(t("qa.persistSnapshotDone"));
  };

  return (
    <div className="flex-1">
      <PageHeader
        title="QA Checklist"
        subtitle={`Spec Part 8 acceptance: ${done} / ${total} items complete (${pct}%)`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={fillAll}>{t("qa.markAll")}</Button>
            <Button size="sm" variant="outline" onClick={reset}>{t("qa.reset")}</Button>
          </div>
        }
      />
      <PageBody>
        <Card className="p-4">
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </Card>

        <Card className="p-4 border-destructive/30">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-destructive" />
                {t("qa.persistTitle")}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                {t("qa.persistDesc")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSnapshotNow}>
                {t("qa.persistSnapshot")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setResetPersistOpen(true)}>
                {t("qa.persistReset")}
              </Button>
            </div>
          </div>
        </Card>

        <HighRiskConfirm
          open={resetPersistOpen}
          onOpenChange={setResetPersistOpen}
          operation="persistence.reset"
          target={{ type: "Storage", id: "pantheon.bff.persist.v1", name: "Mock BFF persistence" }}
          currentState="persisted"
          newState="seed"
          riskLevel="high"
          confirmToken="RESET"
          onConfirm={handleResetPersist}
        />

        {SECTIONS.map((section) => {
          const sDone = section.items.filter((i) => checked[i.id]).length;
          return (
            <Card key={section.id} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">{section.title}</h2>
                <span className="text-mono text-xs text-muted-foreground">
                  {sDone} / {section.items.length}
                </span>
              </div>
              <ul className="space-y-2.5">
                {section.items.map((item) => {
                  const on = !!checked[item.id];
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 cursor-pointer group"
                      onClick={() => toggle(item.id)}
                    >
                      <Checkbox checked={on} className="mt-0.5" />
                      <div className="flex-1">
                        <div className={`text-sm ${on ? "line-through text-muted-foreground" : ""}`}>
                          {item.label}
                        </div>
                        {item.detail && (
                          <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
                        )}
                      </div>
                      {on ? (
                        <Check className="h-4 w-4 text-status-success" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </PageBody>
    </div>
  );
};
