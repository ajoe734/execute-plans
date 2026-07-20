// Settings — Spec Part 3 §System.
// Workspace, integrations, locale, theme, API keys, feature flags.
// Planner Response §E2 — adds Break-Glass tab (force-transition admin form).
import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { usePlatform } from "@/platform/store";
import { bff } from "@/lib/bff-v1";
import { MockDataBadge } from "@/components/data/MockDataBadge";
import { NON_PRODUCTION_COMMAND_REASON, NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import {
  DEFAULT_FORCE_TRANSITION_POLICY,
  validateForceTransition,
  type ForceTransitionRequest,
} from "@/lib/v4/forceTransitionPolicy";

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <Card className="p-5 space-y-4">
    <div>
      <div className="text-sm font-semibold">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
    <div className="space-y-3">{children}</div>
  </Card>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-6 py-2 border-b border-border last:border-0">
    <div className="min-w-0">
      <div className="text-sm">{label}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const BreakGlassPanel = () => {
  const policy = DEFAULT_FORCE_TRANSITION_POLICY;
  const [entityType, setEntityType] = useState("strategy");
  const [entityId, setEntityId] = useState("");
  const [fromState, setFromState] = useState("");
  const [toState, setToState] = useState("");
  const [justification, setJustification] = useState("");
  const [approvers, setApprovers] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [liveImpact, setLiveImpact] = useState(true);

  const approverIds = approvers.split(",").map((s) => s.trim()).filter(Boolean);
  const req: ForceTransitionRequest = {
    entityType, entityId, fromState, toState,
    justification, approverIds,
    incidentId: incidentId || undefined,
    expectedVersion: 1,
  };
  const approverRoles: Record<string, readonly string[]> = Object.fromEntries(
    approverIds.map((id, i) => [id, i === 0 ? ["platform_admin"] : ["risk_officer"]]),
  );
  const result = validateForceTransition(req, approverRoles, liveImpact, policy);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="text-sm font-semibold">Break-Glass Force Transition</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Admin override per Planner §E2. Requires ≥{policy.minJustificationChars} char justification, ≥{policy.minApproversForLiveImpact} distinct approvers (including {policy.requiredApproverRoles.join(" + ")}). All actions audited; live-impact requires postmortem.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Entity type</Label><Input value={entityType} onChange={(e) => setEntityType(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Entity id</Label><Input value={entityId} onChange={(e) => setEntityId(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">From state</Label><Input value={fromState} onChange={(e) => setFromState(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">To state</Label><Input value={toState} onChange={(e) => setToState(e.target.value)} /></div>
        <div className="space-y-1.5 col-span-2"><Label className="text-xs">Approver IDs (comma-separated, distinct users)</Label><Input value={approvers} onChange={(e) => setApprovers(e.target.value)} placeholder="alice, bob" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Incident ID (optional)</Label><Input value={incidentId} onChange={(e) => setIncidentId(e.target.value)} /></div>
        <div className="flex items-center gap-2 mt-6"><Switch checked={liveImpact} onCheckedChange={setLiveImpact} /><Label className="text-xs">Live-impact (requires 2 approvers + postmortem)</Label></div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Justification (min {policy.minJustificationChars} chars)</Label>
        <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} />
        <div className="text-xs text-muted-foreground text-right text-mono">{justification.length}/{policy.minJustificationChars}</div>
      </div>
      {!result.ok && "reason" in result && (
        <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          Validation: {result.reason}
        </div>
      )}
      <NonProductionActionButton
        size="sm"
        variant="destructive"
      >
        Submit force transition
      </NonProductionActionButton>
    </Card>
  );
};

export const SettingsPage = () => {
  const t = useT();
  const locale = usePlatform((s) => s.locale);
  const setLocale = usePlatform((s) => s.setLocale);
  const acceptLanguage = bff.getAcceptLanguage();

  return (
    <>
      <PageHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />
      <PageBody>
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">{t("settings.tab.profile")}</TabsTrigger>
            <TabsTrigger value="workspace">{t("settings.tab.workspace")}</TabsTrigger>
            <TabsTrigger value="integrations">{t("settings.tab.integrations")}</TabsTrigger>
            <TabsTrigger value="api">{t("settings.tab.api")}</TabsTrigger>
            <TabsTrigger value="locale">{t("settings.tab.locale")}</TabsTrigger>
            <TabsTrigger value="flags">{t("settings.tab.flags")}</TabsTrigger>
            <TabsTrigger value="breakglass">{t("settings.tab.breakglass", { defaultValue: "Break-Glass" })}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <Section title={t("settings.profile.title")}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>{t("settings.profile.displayName")}</Label><Input defaultValue="Operator" /></div>
                <div className="space-y-1.5"><Label>{t("settings.profile.email")}</Label><Input defaultValue="ops@pantheon.local" /></div>
              </div>
              <NonProductionActionButton size="sm">{t("actions.save")}</NonProductionActionButton>
            </Section>
          </TabsContent>

          <TabsContent value="workspace" className="mt-4 space-y-4">
            <Section title={t("settings.workspace.title")}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>{t("settings.workspace.name")}</Label><Input defaultValue="Pantheon" /></div>
                <div className="space-y-1.5"><Label>{t("settings.workspace.tz")}</Label><Input defaultValue="Asia/Taipei" /></div>
              </div>
            </Section>
            <Section title={t("settings.theme.title")}>
              <Row label={t("settings.theme.dark")} hint={t("settings.theme.darkHint")}>
                <span className="inline-flex" title={NON_PRODUCTION_COMMAND_REASON}>
                  <Switch defaultChecked disabled />
                </span>
              </Row>
              <Row label={t("settings.theme.density")}>
                <Badge variant="outline">{t("common.densityComfortable")}</Badge>
              </Row>
            </Section>
          </TabsContent>

          <TabsContent value="integrations" className="mt-4">
            <Section title={t("settings.integrations.title")} hint={t("settings.integrations.hint")}>
              {[
                { name: "Slack", status: "connected" },
                { name: "PagerDuty", status: "connected" },
                { name: "GitHub", status: "disconnected" },
                { name: "Datadog", status: "connected" },
              ].map((i) => (
                <Row key={i.name} label={i.name}>
                  <div className="flex gap-2 items-center">
                    <Badge variant={i.status === "connected" ? "default" : "outline"}>{i.status}</Badge>
                    <NonProductionActionButton size="sm" variant="outline">{i.status === "connected" ? t("settings.integrations.manage") : t("settings.integrations.connect")}</NonProductionActionButton>
                  </div>
                </Row>
              ))}
            </Section>
          </TabsContent>

          <TabsContent value="api" className="mt-4">
            <Section title={t("settings.api.title")} hint={t("settings.api.hint")}>
              {[
                { name: "ops-pipeline", prefix: "pk_live_8a…", created: "2026-04-12" },
                { name: "ci-runner",    prefix: "pk_live_3f…", created: "2026-03-02" },
              ].map((k) => (
                <Row key={k.name} label={k.name} hint={`${k.prefix} · created ${k.created}`}>
                  <NonProductionActionButton size="sm" variant="outline">{t("settings.api.rotate")}</NonProductionActionButton>
                </Row>
              ))}
              <NonProductionActionButton size="sm">{t("settings.api.create")}</NonProductionActionButton>
            </Section>
          </TabsContent>

          <TabsContent value="locale" className="mt-4">
            <Section title={t("settings.locale.title")} hint={t("settings.locale.hint")}>
              <Row label="繁體中文">
                <Button size="sm" variant={locale === "zh-TW" ? "default" : "outline"} onClick={() => setLocale("zh-TW")}>{locale === "zh-TW" ? "✓" : t("settings.locale.use")}</Button>
              </Row>
              <Row label="English (US)">
                <Button size="sm" variant={locale === "en-US" ? "default" : "outline"} onClick={() => setLocale("en-US")}>{locale === "en-US" ? "✓" : t("settings.locale.use")}</Button>
              </Row>
              <Row label={t("settings.locale.acceptLanguage")} hint={t("settings.locale.acceptHint")}>
                {acceptLanguage ? (
                  <Badge variant="outline" className="text-mono text-[10px]">{acceptLanguage}</Badge>
                ) : (
                  <MockDataBadge helperName="bff.getAcceptLanguage" />
                )}
              </Row>
            </Section>
          </TabsContent>

          <TabsContent value="flags" className="mt-4">
            <Section title={t("settings.flags.title")} hint={t("settings.flags.hint")}>
              {[
                ["evolution.autoPromote", false],
                ["rebalance.simulateOnDraft", true],
                ["agora.committeeAutoMemo", true],
                ["risk.realtimeStream", true],
              ].map(([k, v]) => (
                <Row key={k as string} label={k as string}>
                  <span className="inline-flex" title={NON_PRODUCTION_COMMAND_REASON}>
                    <Switch defaultChecked={v as boolean} disabled />
                  </span>
                </Row>
              ))}
            </Section>
          </TabsContent>

          <TabsContent value="breakglass" className="mt-4">
            <BreakGlassPanel />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};
