import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Check, Circle } from "lucide-react";

type Item = { id: string; label: string; detail?: string };
type Section = { id: string; title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "shell",
    title: "Platform Shell",
    items: [
      { id: "topbar", label: "TopBar shows env switcher, search (⌘K), indicators (approvals/alerts/jobs), locale, role" },
      { id: "palette", label: "Cmd-K palette opens and filters across objects" },
      { id: "i18n", label: "Locale switch toggles zh-TW / en-US strings live" },
      { id: "rt", label: "Realtime ticker increments job/alert badges over time" },
    ],
  },
  {
    id: "management",
    title: "Management Console",
    items: [
      { id: "lists", label: "All 9 object lists render with filters + columns" },
      { id: "detail", label: "Each detail page exposes Overview / Lifecycle / Audit / Linked tabs" },
      { id: "highrisk", label: "Promote → Live and Retire flows demand typed token confirmation" },
      { id: "ops", label: "Jobs / Alerts / Incidents / Approvals / Audit pages all wired" },
      { id: "caps", label: "Tools / MCP / Skills / Channels CRUD-ish surfaces present" },
      { id: "runtime", label: "Runtimes page shows env health, CPU / mem / latency" },
    ],
  },
  {
    id: "agora",
    title: "Agora Workbench",
    items: [
      { id: "brief", label: "Daily Brief renders watchlist + alerts + signals" },
      { id: "signals", label: "Signal Review supports Approve / Reject / Flag feedback loop" },
      { id: "triage", label: "Alert Triage separates Open / Acknowledged with escalate flow" },
      { id: "journal", label: "Decision Journal supports inline edit + tagging" },
      { id: "insights", label: "Insight Inbox supports Promote / Discuss / Dismiss" },
      { id: "trainer", label: "Trainer Studio: Memory / Skills / Persona / Eval / Channels all reachable" },
    ],
  },
  {
    id: "governance",
    title: "Governance & Safety",
    items: [
      { id: "rbac", label: "Role switch hides/shows surfaces appropriately" },
      { id: "states", label: "Lifecycle transitions follow state machine (no skipping)" },
      { id: "audit", label: "Every high-risk action emits an audit event" },
      { id: "mcpgrant", label: "MCP destructive tools require GRANT-LIVE confirmation" },
    ],
  },
  {
    id: "ux",
    title: "UX & Visual System",
    items: [
      { id: "tokens", label: "All colors via semantic tokens (no raw text-white/bg-black)" },
      { id: "mono", label: "IDs, hashes, metrics rendered in mono font" },
      { id: "responsive", label: "Layout works at 1280px+ and degrades gracefully" },
      { id: "empty", label: "Empty states + loading states present on lists" },
    ],
  },
];

const STORAGE_KEY = "qa-checklist-v1";

export const QAChecklist = () => {
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

  return (
    <div className="flex-1">
      <PageHeader
        title="QA Checklist"
        subtitle={`Part 8 acceptance: ${done} / ${total} items complete (${pct}%)`}
        actions={<Button size="sm" variant="outline" onClick={reset}>Reset</Button>}
      />
      <PageBody>
        <Card className="p-4">
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

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
