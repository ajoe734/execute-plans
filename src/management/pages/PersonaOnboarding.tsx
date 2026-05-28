// Persona Onboarding Wizard — 5-step orchestrator.
// Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §7
//
// Every stage call goes through `withWriteFallback` so any 404/405/501 from the BFF
// (see .lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md — most write
// endpoints are not yet live) auto-degrades to writeOverlay + LiveStatusBanner instead
// of breaking the flow.

import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bffFetch } from "@/lib/bff-v1/client";
import { paths } from "@/lib/bff-v1/paths";
import { withWriteFallback } from "@/lib/bff-v1/writeFallback";
import { getPersona, runPersonaAction } from "@/lib/bff-v1/personas";
import { lists } from "@/lib/bff-v1/lists";
import { useT } from "@/platform/hooks";
import type { Persona } from "@/lib/bff/types";

interface CapitalPoolOption { id: string; name?: string; status?: string }

type StepNum = 1 | 2 | 3 | 4 | 5;
const STEP_KEYS: Record<StepNum, "lifecycle" | "binding" | "plan" | "approval" | "runtime"> = {
  1: "lifecycle", 2: "binding", 3: "plan", 4: "approval", 5: "runtime",
};

interface StepState {
  status: "idle" | "running" | "done" | "failed" | "degraded";
  reason?: string;
  payload?: Record<string, unknown>;
}

export default function PersonaOnboarding() {
  const { id = "" } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const step = (Math.min(5, Math.max(1, Number(sp.get("step") ?? 1))) as StepNum);
  const setStep = (n: StepNum) => { sp.set("step", String(n)); setSp(sp, { replace: true }); };

  const [persona, setPersona] = useState<Persona | undefined>();
  const [states, setStates] = useState<Record<StepNum, StepState>>({
    1: { status: "idle" }, 2: { status: "idle" }, 3: { status: "idle" },
    4: { status: "idle" }, 5: { status: "idle" },
  });

  // step-1 form
  const [memo1, setMemo1] = useState("paper-owner advance");
  // step-2 form
  const [poolId, setPoolId] = useState("");
  const [budget, setBudget] = useState(10000);
  // step-3 form
  const [artifactId, setArtifactId] = useState("");
  // step-4 form
  const [reviewerComment, setReviewerComment] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);

  const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;

  const [pools, setPools] = useState<CapitalPoolOption[]>([]);

  useEffect(() => { if (id) getPersona(id).then(setPersona).catch(() => undefined); }, [id]);
  useEffect(() => {
    lists.capitalPools()
      .then((env) => setPools((env.items ?? []) as CapitalPoolOption[]))
      .catch(() => setPools([]));
  }, []);

  const update = (n: StepNum, s: StepState) => setStates((p) => ({ ...p, [n]: s }));

  const run = async <T,>(n: StepNum, endpoint: string, fn: () => Promise<T>) => {
    update(n, { status: "running" });
    try {
      const r = await withWriteFallback(fn, { endpoint });
      if (r.degraded) {
        update(n, { status: "degraded", reason: r.reason });
        toast.warning(t("persona.onboarding.banner.degraded"));
      } else {
        update(n, { status: "done", payload: r.data as Record<string, unknown> });
        toast.success(`Step ${n} ${t("persona.onboarding.stageStatus.done")}`);
        if (n < 5) setStep((n + 1) as StepNum);
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      update(n, { status: "failed", reason: e.code ?? e.message ?? "error" });
    }
  };

  const doStep1 = () => run(1, paths.personaAction(id, "AdvanceLifecycle"),
    () => runPersonaAction(id, "AdvanceLifecycle",
      { target_state: "paper_owner", memo: memo1 }));

  const doStep2 = () => run(2, "/api/v1/bindings", () => bffFetch({
    method: "POST", path: "/api/v1/bindings",
    body: { persona_id: id, capital_pool_id: poolId, role: "paper_owner",
            allowed_deployment_scope: "paper", budget },
  }));

  const doStep3 = () => run(3, "/api/v1/deployment-plans", () => bffFetch({
    method: "POST", path: "/api/v1/deployment-plans",
    body: { binding_id: (states[2].payload?.id as string) ?? `bind-${id}`,
            artifact_id: artifactId, deployment_mode: "paper",
            capital_pool_id: poolId },
  }));

  const doStep4 = () => run(4, "/api/v1/approval-decisions", () => bffFetch({
    method: "POST", path: "/api/v1/approval-decisions",
    body: { plan_id: (states[3].payload?.id as string) ?? `plan-${id}`,
            decision: autoApprove && isDev ? "approve" : "submit",
            memo: reviewerComment || "wizard" },
  }));

  const doStep5 = () => run(5, "/bff/runtimes/.../StartRuntime", () => bffFetch({
    method: "POST", path: `/bff/runtimes/runtime-${id}/actions/StartRuntime`,
    body: { confirm_token: "wizard" },
  }));

  const allDone = (["1", "2", "3", "4", "5"] as const).every(
    (k) => states[Number(k) as StepNum].status === "done" || states[Number(k) as StepNum].status === "degraded",
  );

  return (
    <section className="p-6 max-w-3xl mx-auto space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("persona.onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("persona.onboarding.subtitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {persona?.name ?? id} · {t("persona.onboarding.stepProgress", { current: step, total: 5 })}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/management/personas/${encodeURIComponent(id)}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />{t("persona.onboarding.advancedMode")}
        </Button>
      </header>

      <Stepper step={step} states={states} onJump={setStep} t={t} />

      <Card className="p-4 space-y-4">
        {step === 1 && (
          <StepShell title={t("persona.onboarding.step1.title")} hint={t("persona.onboarding.step1.hint")}
                     state={states[1]} t={t}>
            <Label htmlFor="memo1">{t("persona.onboarding.step1.memoLabel")}</Label>
            <Textarea id="memo1" value={memo1} onChange={(e) => setMemo1(e.target.value)} rows={3} />
            <Button onClick={doStep1} disabled={memo1.length < 8 || states[1].status === "running"}>
              {states[1].status === "running" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("persona.onboarding.step1.run")}
            </Button>
          </StepShell>
        )}
        {step === 2 && (
          <StepShell title={t("persona.onboarding.step2.title")} hint={t("persona.onboarding.step2.hint")}
                     state={states[2]} t={t}>
            <Label htmlFor="poolId">{t("persona.onboarding.step2.poolLabel")}</Label>
            {pools.length > 0 ? (
              <select id="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm">
                <option value="">—</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>{p.name ?? p.id}{p.status ? ` · ${p.status}` : ""}</option>
                ))}
              </select>
            ) : (
              <Input id="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} placeholder="cp-..." />
            )}
            <Label htmlFor="budget">{t("persona.onboarding.step2.budgetLabel")}</Label>
            <Input id="budget" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            <Button onClick={doStep2} disabled={!poolId || states[2].status === "running"}>
              {states[2].status === "running" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("persona.onboarding.step2.run")}
            </Button>
          </StepShell>
        )}
        {step === 3 && (
          <StepShell title={t("persona.onboarding.step3.title")} hint={t("persona.onboarding.step3.hint")}
                     state={states[3]} t={t}>
            <Label htmlFor="artifactId">{t("persona.onboarding.step3.artifactLabel")}</Label>
            <Input id="artifactId" value={artifactId} onChange={(e) => setArtifactId(e.target.value)} placeholder="ar-..." />
            <Button onClick={doStep3} disabled={!artifactId || states[3].status === "running"}>
              {states[3].status === "running" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("persona.onboarding.step3.run")}
            </Button>
          </StepShell>
        )}
        {step === 4 && (
          <StepShell title={t("persona.onboarding.step4.title")} hint={t("persona.onboarding.step4.hint")}
                     state={states[4]} t={t}>
            {autoApprove && isDev && (
              <div className="rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                {t("persona.onboarding.banner.autoApprove")}
              </div>
            )}
            <Label htmlFor="comment">{t("persona.onboarding.step4.commentLabel")}</Label>
            <Textarea id="comment" value={reviewerComment} onChange={(e) => setReviewerComment(e.target.value)} rows={2} />
            {isDev && (
              <div className="flex items-center gap-2">
                <Switch checked={autoApprove} onCheckedChange={setAutoApprove} id="auto-approve" />
                <Label htmlFor="auto-approve" className="text-xs">{t("persona.onboarding.step4.autoApproveToggle")}</Label>
              </div>
            )}
            <Button onClick={doStep4} disabled={states[4].status === "running"}>
              {states[4].status === "running" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("persona.onboarding.step4.run")}
            </Button>
          </StepShell>
        )}
        {step === 5 && (
          <StepShell title={t("persona.onboarding.step5.title")} hint={t("persona.onboarding.step5.hint")}
                     state={states[5]} t={t}>
            <Button onClick={doStep5} disabled={states[5].status === "running"}>
              {states[5].status === "running" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("persona.onboarding.step5.run")}
            </Button>
          </StepShell>
        )}
      </Card>

      {allDone && (
        <Card className="p-4 space-y-2 border-status-success/40 bg-status-success/5">
          <div className="flex items-center gap-2 text-status-success">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">{t("persona.onboarding.done.title")}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate(`/management/runtimes`)}>{t("persona.onboarding.done.viewRuntime")}</Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/management/persona-fleet")}>
              {t("persona.onboarding.done.backToFleet")}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

function Stepper({ step, states, onJump, t }: {
  step: StepNum;
  states: Record<StepNum, StepState>;
  onJump: (n: StepNum) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <ol className="flex items-center gap-1 text-xs">
      {([1, 2, 3, 4, 5] as StepNum[]).map((n) => {
        const s = states[n];
        const active = step === n;
        const tone =
          s.status === "done"     ? "bg-status-success/20 text-status-success border-status-success/40" :
          s.status === "degraded" ? "bg-status-warning/20 text-status-warning border-status-warning/40" :
          s.status === "failed"   ? "bg-status-danger/20 text-status-danger border-status-danger/40" :
          active                  ? "bg-accent text-accent-foreground border-accent" :
                                    "bg-muted text-muted-foreground border-border";
        return (
          <li key={n} className="flex items-center gap-1">
            <button onClick={() => onJump(n)}
                    className={`px-2 py-1 rounded border ${tone} hover:opacity-80`}>
              {n}. {t(`persona.onboarding.stages.${STEP_KEYS[n]}`)}
            </button>
            {n < 5 && <span className="text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function StepShell({ title, hint, state, t, children }: {
  title: string; hint: string; state: StepState;
  t: (k: string, opts?: Record<string, unknown>) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {state.status === "degraded" && (
        <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/40">
          degraded · {state.reason ?? ""}
        </Badge>
      )}
      {state.status === "failed" && (
        <div className="rounded border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          <strong>{t("persona.onboarding.failure.title")}:</strong> {state.reason}
        </div>
      )}
      {children}
    </div>
  );
}
