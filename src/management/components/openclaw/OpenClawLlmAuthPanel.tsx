import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchAssistantModeStatus,
  fetchAssistantOrchestratorStatus,
  fetchAssistantProviderReauthStatus,
  fetchAssistantProviders,
  startAssistantProviderReauth,
  type AssistantControlModeStatus,
  type AssistantModeStatusResult,
  type AssistantOrchestratorStatusResult,
  type AssistantProviderReadinessStatus,
  type AssistantProviderReauthResult,
  type AssistantProvidersResult,
  type ProviderStatus,
} from "@/lib/bff-v1/managementAi";

export interface OpenClawLlmAuthApi {
  fetchProviders: typeof fetchAssistantProviders;
  fetchMode: typeof fetchAssistantModeStatus;
  fetchOrchestratorStatus: typeof fetchAssistantOrchestratorStatus;
  startReauth: typeof startAssistantProviderReauth;
  fetchReauthStatus: typeof fetchAssistantProviderReauthStatus;
}

const defaultApi: OpenClawLlmAuthApi = {
  fetchProviders: fetchAssistantProviders,
  fetchMode: fetchAssistantModeStatus,
  fetchOrchestratorStatus: fetchAssistantOrchestratorStatus,
  startReauth: startAssistantProviderReauth,
  fetchReauthStatus: fetchAssistantProviderReauthStatus,
};

type PanelMode = "summary" | "full";

interface PanelState {
  providers: AssistantProviderReadinessStatus[];
  mode: AssistantModeStatusResult | null;
  orchestrator: AssistantOrchestratorStatusResult | null;
  providerResult: AssistantProvidersResult | null;
  authProbePending: boolean;
}

function textFrom(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function providerId(provider: AssistantProviderReadinessStatus): string {
  return textFrom(provider.provider, provider.providerName, "unknown");
}

function providerLabel(provider: AssistantProviderReadinessStatus): string {
  return textFrom(provider.providerName, provider.provider, "unknown");
}

function providerAuthStatus(provider: AssistantProviderReadinessStatus): string {
  return textFrom(provider.authStatus, provider.auth, provider.status, "unknown");
}

function providerReason(provider: AssistantProviderReadinessStatus): string {
  return textFrom(provider.degradedReason, provider.reason, provider.message);
}

function providerUsage(provider: AssistantProviderReadinessStatus): Record<string, unknown> {
  const usage = recordFrom(provider.usage);
  if (Object.keys(usage).length > 0) return usage;
  return recordFrom(provider.quota);
}

function usageValue(usage: Record<string, unknown>, ...keys: string[]): string {
  return textFrom(...keys.map((key) => usage[key]));
}

function formatMetric(value: string, unit: string): string {
  if (!value) return "unknown";
  return unit ? `${value} ${unit}` : value;
}

function usageRemaining(usage: Record<string, unknown>): string {
  const unit = usageValue(usage, "unit");
  const remaining = formatMetric(usageValue(usage, "remaining"), unit);
  const percent = usageValue(usage, "remainingPercent", "remaining_percent");
  return percent && remaining !== "unknown" ? `${remaining} (${percent}%)` : remaining;
}

function usageReset(usage: Record<string, unknown>): string {
  return usageValue(usage, "resetAt", "reset_at", "updatedAt", "updated_at", "checkedAt", "checked_at") || "unknown";
}

function statusTone(status: string, ready?: boolean): string {
  const normalized = status.toLowerCase();
  if (ready === true || ["ready", "ok", "completed", "authorized"].includes(normalized)) {
    return "border-status-success/30 bg-status-success/10 text-status-success";
  }
  if (["pending", "capturing", "processing", "not_checked"].includes(normalized)) {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  if (["degraded", "timeout", "unavailable", "unknown"].includes(normalized)) {
    return "border-status-warning/30 bg-status-warning/15 text-status-warning";
  }
  if (["failed", "error", "mount_unavailable"].includes(normalized) || ready === false) {
    return "border-status-failed/30 bg-status-failed/10 text-status-failed";
  }
  return "bg-muted text-muted-foreground";
}

function needsAttention(provider: AssistantProviderReadinessStatus): boolean {
  if (provider.ready === false) return true;
  const auth = providerAuthStatus(provider).toLowerCase();
  return ["failed", "timeout", "unavailable", "mount_unavailable", "degraded", "unknown"].includes(auth);
}

function supportsReauth(provider: AssistantProviderReadinessStatus): boolean {
  return ["codex", "codex_cli"].includes(providerId(provider).toLowerCase());
}

function controlModeFrom(mode: AssistantModeStatusResult | null): AssistantControlModeStatus | null {
  return mode?.ok ? mode.status.controlMode ?? null : null;
}

function kernelLabel(mode: AssistantModeStatusResult | null): string {
  if (!mode) return "kernel unknown";
  if (!mode.ok) return "kernel unavailable";
  return mode.status.kernelEnabled ? "kernel on" : "kernel off";
}

function activeProviderLabel(providerStatus: ProviderStatus | null | undefined): string {
  if (!providerStatus) return "unknown";
  return `${providerStatus.provider}/${providerStatus.runtime}`;
}

function firstError(state: PanelState): string | null {
  if (state.providerResult && !state.providerResult.ok) return state.providerResult.message;
  if (state.mode && !state.mode.ok && state.mode.message !== "aborted") return state.mode.message;
  if (state.orchestrator && !state.orchestrator.ok && state.orchestrator.message !== "aborted") return state.orchestrator.message;
  return null;
}

function reauthHref(result: AssistantProviderReauthResult | null): string | null {
  if (!result?.ok) return null;
  return result.reauth.verificationUriComplete ?? result.reauth.verificationUri;
}

function providersFromResults(
  providerResult: AssistantProvidersResult,
  orchestratorResult: AssistantOrchestratorStatusResult,
  previousProviders: AssistantProviderReadinessStatus[] = [],
): AssistantProviderReadinessStatus[] {
  if (providerResult.ok && providerResult.providers.length > 0) {
    return providerResult.providers;
  }
  if (previousProviders.length > 0) {
    return previousProviders;
  }
  return orchestratorResult.ok && orchestratorResult.status.providerReadiness
    ? [orchestratorResult.status.providerReadiness]
    : [];
}

export function OpenClawLlmAuthPanel({
  mode = "full",
  api = defaultApi,
}: {
  mode?: PanelMode;
  api?: OpenClawLlmAuthApi;
}) {
  const [state, setState] = useState<PanelState>({
    providers: [],
    mode: null,
    orchestrator: null,
    providerResult: null,
    authProbePending: false,
  });
  const [loading, setLoading] = useState(false);
  const [reauthBusy, setReauthBusy] = useState<string | null>(null);
  const [reauthResult, setReauthResult] = useState<AssistantProviderReauthResult | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setState((current) => ({ ...current, authProbePending: true }));
    try {
      const [providerResult, modeResult, orchestratorResult] = await Promise.all([
        api.fetchProviders({ authProbe: false, signal }),
        api.fetchMode({ signal }),
        api.fetchOrchestratorStatus({ signal }),
      ]);
      if (signal?.aborted) return;
      const providers = providersFromResults(providerResult, orchestratorResult);
      setState({
        providers,
        mode: modeResult,
        orchestrator: orchestratorResult,
        providerResult,
        authProbePending: true,
      });

      const authProbeResult = await api.fetchProviders({ authProbe: true, signal });
      if (signal?.aborted) return;
      setState((current) => ({
        ...current,
        providers: providersFromResults(authProbeResult, orchestratorResult, current.providers),
        providerResult: authProbeResult,
        authProbePending: false,
      }));
    } catch {
      if (signal?.aborted) return;
      setState((current) => ({ ...current, authProbePending: false }));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const controlMode = controlModeFrom(state.mode);
  const activeControl = Boolean(controlMode?.active);
  const activeProvider = state.orchestrator?.ok ? state.orchestrator.status.providerStatus : null;
  const attentionCount = useMemo(() => state.providers.filter(needsAttention).length, [state.providers]);
  const error = firstError(state);
  const rows = mode === "summary" ? state.providers.slice(0, 3) : state.providers;
  const checkingAuth = state.authProbePending || (loading && rows.length === 0);
  const authProbeFailed = Boolean(state.providerResult && !state.providerResult.ok);
  const authSummaryLabel = checkingAuth
    ? "checking auth"
    : authProbeFailed
      ? "auth unknown"
    : attentionCount > 0
      ? `${attentionCount} attention`
      : rows.length > 0
        ? "auth ready"
        : "auth unknown";
  const authSummaryTone = checkingAuth
    ? statusTone("pending")
    : authProbeFailed
      ? statusTone("unknown")
    : attentionCount > 0
      ? statusTone("degraded", false)
      : statusTone(rows.length > 0 ? "ready" : "unknown", rows.length > 0);
  const href = reauthHref(reauthResult);

  const startReauth = useCallback(async (provider: AssistantProviderReadinessStatus) => {
    const id = providerId(provider);
    setReauthBusy(id);
    setReauthResult(null);
    try {
      const result = await api.startReauth({
        provider: id,
        reason: "OpenClaw LLM Auth management",
      });
      setReauthResult(result);
    } finally {
      setReauthBusy(null);
    }
  }, [api]);

  const refreshReauth = useCallback(async () => {
    if (!reauthResult?.ok) return;
    setReauthBusy(reauthResult.reauth.provider ?? "codex");
    try {
      const refreshed = await api.fetchReauthStatus(
        reauthResult.reauth.reauthSessionId,
        reauthResult.reauth.provider ?? "codex",
      );
      setReauthResult(refreshed);
      if (refreshed.ok && refreshed.reauth.status === "completed") void load();
    } finally {
      setReauthBusy(null);
    }
  }, [api, load, reauthResult]);

  return (
    <Card className={cn("p-4", mode === "full" && "p-5")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            OpenClaw LLM Auth
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            active={activeProviderLabel(activeProvider)} · {kernelLabel(state.mode)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusTone(activeControl ? controlMode?.mode ?? "active" : "inactive", activeControl)}>
            {activeControl ? controlMode?.mode ?? "active" : "control inactive"}
          </Badge>
          <Badge variant="outline" className={authSummaryTone}>
            {authSummaryLabel}
          </Badge>
          <Button size="icon-sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh OpenClaw LLM auth">
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className={cn("mt-4 grid gap-3", mode === "full" ? "lg:grid-cols-3" : "md:grid-cols-3")}>
        {rows.map((provider) => (
          <ProviderCard
            key={providerId(provider)}
            mode={mode}
            provider={provider}
            reauthBusy={reauthBusy}
            controlActive={activeControl}
            onStartReauth={startReauth}
          />
        ))}
      </div>

      {loading && rows.length === 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Checking assistant provider auth status.</span>
        </div>
      )}

      {state.authProbePending && rows.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Updating auth probe results.</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          No assistant provider auth status returned.
        </div>
      )}

      {reauthResult && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
          {!reauthResult.ok ? (
            <div className="text-status-failed">Reauth failed: {reauthResult.message}</div>
          ) : (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground">
                Codex reauth {reauthResult.reauth.status ?? "pending"}
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                {reauthResult.reauth.userCode && (
                  <span className="font-mono text-foreground">code={reauthResult.reauth.userCode}</span>
                )}
                <span className="font-mono">session={reauthResult.reauth.reauthSessionId}</span>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    login <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => void refreshReauth()} disabled={Boolean(reauthBusy)}>
                {reauthBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                Refresh reauth
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "summary" && (
        <div className="mt-4 flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to="/management/openclaw-llm-auth">Open management page</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}

function ProviderCard({
  provider,
  mode,
  controlActive,
  reauthBusy,
  onStartReauth,
}: {
  provider: AssistantProviderReadinessStatus;
  mode: PanelMode;
  controlActive: boolean;
  reauthBusy: string | null;
  onStartReauth: (provider: AssistantProviderReadinessStatus) => void;
}) {
  const id = providerId(provider);
  const authStatus = providerAuthStatus(provider);
  const usage = providerUsage(provider);
  const unit = usageValue(usage, "unit");
  const busy = reauthBusy === id;
  const reauthable = supportsReauth(provider);

  return (
    <article className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{providerLabel(provider)}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{provider.runtime ?? "runtime unknown"}</p>
        </div>
        <Badge variant="outline" className={statusTone(authStatus, provider.ready)}>
          {provider.ready ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
          {authStatus}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Info label="status" value={provider.status ?? "unknown"} />
        <Info label="mount" value={provider.mountMode ?? "unknown"} />
        <Info label="remaining" value={usageRemaining(usage)} />
        <Info label="limit" value={formatMetric(usageValue(usage, "limit"), unit)} />
        {mode === "full" && (
          <>
            <Info label="used" value={formatMetric(usageValue(usage, "used"), unit)} />
            <Info label="reset" value={usageReset(usage)} />
            <Info className="col-span-2" label="usage" value={usageValue(usage, "status", "reason") || "unknown"} />
            <Info className="col-span-2" label="checked" value={provider.checkedAt ?? "unknown"} />
          </>
        )}
        {providerReason(provider) && (
          <Info className="col-span-2" label="reason" value={providerReason(provider)} />
        )}
      </dl>

      {mode === "full" && (
        <Button
          className="mt-3 w-full"
          size="sm"
          variant="outline"
          disabled={!reauthable || !controlActive || busy}
          onClick={() => onStartReauth(provider)}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
          {reauthable ? "Start reauth" : "Reauth unavailable"}
        </Button>
      )}
    </article>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}

export default OpenClawLlmAuthPanel;
