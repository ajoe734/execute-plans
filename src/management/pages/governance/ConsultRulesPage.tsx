// Phase 11.5 & SD-PERSONA-MEETINGS-20261115 §11.3 — Consult Rules manager.
// Separates M1 Gate Panels (single independent round, risk veto) from
// Deliberative Meetings (MT-1..MT-6 multi-round persona_meeting protocol)
// and links to the Meetings Center Rules & Budget tab (/management/meetings?tab=rules).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, MessagesSquare, Plus, Trash2 } from "lucide-react";
import { bffV1, managementConsoleReads } from "@/lib/bff-v1";
import {
  getMeetingCatalogue,
  type MeetingCatalogueData,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";
import type { ConsultRule, Persona } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const ENVS: ("research" | "paper" | "live")[] = ["research", "paper", "live"];
const MODES: ConsultRule["mode"][] = ["advisory", "blocking", "ack"];

const modeTone: Record<ConsultRule["mode"], string> = {
  advisory: "border-accent/40 text-accent",
  blocking: "border-risk-high/40 text-risk-high",
  ack: "border-status-warning/40 text-status-warning",
};

export const ConsultRulesPage = () => {
  const t = useT();
  const [rules, setRules] = useState<ConsultRule[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [catalogueRead, setCatalogueRead] = useState<MeetingsRead<MeetingCatalogueData> | null>(null);

  useEffect(() => {
    managementConsoleReads.consultRules().then((envelope) => setRules(envelope.items)).catch(() => setRules([]));
    bffV1.personas.list().then(setPersonas).catch(() => setPersonas([]));
    void getMeetingCatalogue().then(setCatalogueRead);
  }, []);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  const enabledCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

  return (
    <>
      <PageHeader
        title={t("governance.consult.title")}
        subtitle={t("governance.consult.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/management/meetings?tab=rules" data-testid="consult-link-meetings-rules">
                <MessagesSquare className="h-3.5 w-3.5 mr-1" />
                {t("governance.consult.openMeetingsRulesTab", {
                  defaultValue: "Open Meetings Rules & Budget Tab",
                })}
              </Link>
            </Button>
            <NonProductionActionButton size="sm" variant="outline" status="no executing owner">
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("governance.consult.add")}
            </NonProductionActionButton>
            <NonProductionActionButton size="sm" status="no executing owner">
              {t("actions.submitForReview")}
            </NonProductionActionButton>
          </div>
        }
      />
      <PageBody>
        <div className="space-y-6">
          {/* Class 1: Gate Panels (審查型會診) */}
          <section className="space-y-3" data-testid="consult-gate-panels-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t("governance.consult.gatePanelsTitle", {
                    defaultValue: "Gate Panels (M1 — Single Independent Round & Risk Veto)",
                  })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("governance.consult.gatePanelsDesc", {
                    defaultValue:
                      "Gate panels (trial_admission, envelope_publication, harness_patch, canary_candidacy) follow CONSULTATION_SESSION_PROTOCOL.md: one independent round with risk veto.",
                  })}
                </p>
              </div>
              <Badge variant="outline">Gate Panels · 1 Round · Risk Veto</Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  {t("governance.consult.totalRules")}
                </div>
                <div className="text-2xl font-semibold mt-1">{rules.length}</div>
              </Card>
              <Card className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  {t("governance.consult.enabled")}
                </div>
                <div className="text-2xl font-semibold mt-1 text-status-success">{enabledCount}</div>
              </Card>
              <Card className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  {t("governance.consult.blocking")}
                </div>
                <div className="text-2xl font-semibold mt-1 text-risk-high">
                  {rules.filter((r) => r.mode === "blocking" && r.enabled).length}
                </div>
              </Card>
            </div>

            <div className="space-y-2">
              {rules.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Switch checked={r.enabled} disabled />
                    <Input value={r.name} disabled className="h-8 text-sm font-medium flex-1" />
                    <Badge variant="outline" className={`text-[10px] uppercase ${modeTone[r.mode]}`}>
                      {r.mode}
                    </Badge>
                    <NonProductionActionButton
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      aria-label={t("actions.delete")}
                      status="no executing owner"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </NonProductionActionButton>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {t("governance.consult.from")}
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                        value={r.fromPersonaId}
                        disabled
                      >
                        {personas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1 flex items-center justify-center pb-1.5">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {t("governance.consult.to")}
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                        value={r.toPersonaId}
                        disabled
                      >
                        {personas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {t("governance.consult.mode")}
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                        value={r.mode}
                        disabled
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {t("governance.consult.envScope")}
                      </label>
                      <div className="flex gap-1 mt-1">
                        {ENVS.map((e) => {
                          const on = r.envScope.includes(e);
                          return (
                            <button
                              key={e}
                              disabled
                              className={`px-2 py-0.5 rounded text-[10px] uppercase border ${
                                on
                                  ? "border-accent text-accent bg-accent/10"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {e}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="col-span-12 mt-1">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {t("governance.consult.trigger")}
                      </label>
                      <Input
                        value={r.trigger}
                        disabled
                        className="h-8 text-xs text-mono mt-0.5"
                        placeholder="e.g. order.risk>=high"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
                    <span>
                      {t("table.owner")}: <span className="text-mono text-foreground">{r.owner}</span>
                    </span>
                    <span>·</span>
                    <span>
                      {t("table.updated")}: {safeDateTime(r.updatedAt)}
                    </span>
                    <span className="ml-auto text-mono">
                      {personaName(r.fromPersonaId)} → {personaName(r.toPersonaId)}
                    </span>
                  </div>
                </Card>
              ))}
              {rules.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  {t("empty.none")}
                </Card>
              )}
            </div>
          </section>

          {/* Class 2: Deliberative Meetings (討論型會議) */}
          <section className="space-y-3" data-testid="consult-deliberative-meetings-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t("governance.consult.deliberativeTitle", {
                    defaultValue: "Deliberative Meetings (M1–M9 — Multi-Round Persona Meetings)",
                  })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("governance.consult.deliberativeDesc", {
                    defaultValue:
                      "Deliberative meetings (MT-1 to MT-6) never gate execution. They run pre-read interpretations, independent Round 1, anonymised Round 2 with red-team devil's advocate, and chair synthesis into existing governed entry points.",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Deliberative · Non-Gating · Anonymised Round 2</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/management/meetings?tab=rules"
                    data-testid="consult-section-link-meetings-rules"
                  >
                    {t("governance.consult.openMeetingsRulesTab", {
                      defaultValue: "Open Meetings Rules & Budget Tab",
                    })}{" "}
                    →
                  </Link>
                </Button>
              </div>
            </div>

            {catalogueRead === null ? (
              <Card className="p-4 text-xs text-muted-foreground" data-testid="consult-deliberative-loading">
                {t("common.loading", { defaultValue: "Loading…" })}
              </Card>
            ) : catalogueRead.state !== "ok" ? (
              <Card
                role="status"
                className="border-dashed p-4 text-xs text-muted-foreground"
                data-testid="consult-deliberative-unavailable"
              >
                Consultation deliberative catalogue unavailable ({catalogueRead.reason})
              </Card>
            ) : catalogueRead.data.types.length === 0 ? (
              <Card className="p-4 text-xs text-muted-foreground" data-testid="consult-deliberative-empty">
                No deliberative meeting types returned by consultation catalogue.
              </Card>
            ) : (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                data-testid="consult-deliberative-types"
              >
                {catalogueRead.data.types.map((mt) => (
                  <Card
                    key={mt.meeting_type}
                    className="p-4 space-y-2"
                    data-testid={`consult-deliberative-type-${mt.meeting_type}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={mt.enabled} disabled />
                        <span className="font-mono text-sm font-semibold">{mt.meeting_type}</span>
                      </div>
                      <Badge variant={mt.enabled ? "default" : "outline"}>
                        {mt.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        Cadence: <code className="text-foreground">{mt.cadence ?? "—"}</code>
                      </div>
                      <div>
                        Roster Rule: <code className="text-foreground">{mt.roster_rule ?? "—"}</code>
                      </div>
                      {mt.budget ? (
                        <div className="font-mono">
                          M9 Budget (coordinator proposal): max_participants=
                          {mt.budget.max_participants ?? 5} · max_rounds={mt.budget.max_rounds ?? 2} ·
                          weekly_limit={mt.budget.weekly_limit ?? 3}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
};
