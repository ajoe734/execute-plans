import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  activateAssistantControlMode,
  fetchAssistantModeStatus,
  fetchAssistantOrchestratorStatus,
  fetchAssistantProviderReauthStatus,
  fetchAssistantProviderUsageSummary,
  fetchAssistantProviders,
  registerAssistantProvider,
  startAssistantProviderReauth,
  type AssistantControlModeStatus,
  type AssistantModeStatusResult,
  type AssistantOrchestratorStatusResult,
  type AssistantProviderReadinessStatus,
  type AssistantProviderReauthResult,
  type AssistantProvidersResult,
  type AssistantProviderUsageSummaryResult,
  type AssistantProviderUsageSummaryRow,
  type ProviderStatus,
} from "@/lib/bff-v1/managementAi";

export interface OpenClawLlmAuthApi {
  fetchProviders: typeof fetchAssistantProviders;
  fetchMode: typeof fetchAssistantModeStatus;
  fetchOrchestratorStatus: typeof fetchAssistantOrchestratorStatus;
  fetchUsageSummary: typeof fetchAssistantProviderUsageSummary;
  activateControlMode: typeof activateAssistantControlMode;
  startReauth: typeof startAssistantProviderReauth;
  fetchReauthStatus: typeof fetchAssistantProviderReauthStatus;
  registerProvider: typeof registerAssistantProvider;
}

const defaultApi: OpenClawLlmAuthApi = {
  fetchProviders: fetchAssistantProviders,
  fetchMode: fetchAssistantModeStatus,
  fetchOrchestratorStatus: fetchAssistantOrchestratorStatus,
  fetchUsageSummary: fetchAssistantProviderUsageSummary,
  activateControlMode: activateAssistantControlMode,
  startReauth: startAssistantProviderReauth,
  fetchReauthStatus: fetchAssistantProviderReauthStatus,
  registerProvider: registerAssistantProvider,
};

type PanelMode = "summary" | "full";
type AddProviderForm = {
  provider: string;
  providerName: string;
  runtime: string;
  model: string;
  authStrategy: string;
  binary: string;
  binaryEnv: string;
  note: string;
  passphrase: string;
};

const defaultAddProviderForm: AddProviderForm = {
  provider: "",
  providerName: "",
  runtime: "external_llm",
  model: "",
  authStrategy: "manual",
  binary: "",
  binaryEnv: "",
  note: "",
  passphrase: "",
};

interface PanelState {
  providers: AssistantProviderReadinessStatus[];
  mode: AssistantModeStatusResult | null;
  orchestrator: AssistantOrchestratorStatusResult | null;
  providerResult: AssistantProvidersResult | null;
  usageSummary: AssistantProviderUsageSummaryResult | null;
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

function usageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: unknown): string {
  const numeric = usageNumber(value);
  if (numeric === null) return "unknown";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric);
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

function normalizeProviderId(value: unknown): string {
  const id = textFrom(value).toLowerCase();
  if (id === "codex") return "codex_cli";
  if (id === "claude_cli") return "claude";
  return id;
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
  if (typeof provider.reauthSupported === "boolean") return provider.reauthSupported;
  return ["codex", "codex_cli", "claude", "claude_cli"].includes(providerId(provider).toLowerCase());
}

function reauthButtonLabel(provider: AssistantProviderReadinessStatus, controlActive: boolean): string {
  if (!supportsReauth(provider)) return "Reauth unsupported";
  return controlActive ? "Start reauth" : "Enable control + reauth";
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
  if (state.usageSummary && !state.usageSummary.ok) return state.usageSummary.message;
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
    usageSummary: null,
    authProbePending: false,
  });
  const [loading, setLoading] = useState(false);
  const [reauthBusy, setReauthBusy] = useState<string | null>(null);
  const [reauthResult, setReauthResult] = useState<AssistantProviderReauthResult | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [controlPassphrase, setControlPassphrase] = useState("");
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [pendingReauthProvider, setPendingReauthProvider] = useState<AssistantProviderReadinessStatus | null>(null);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [addProviderForm, setAddProviderForm] = useState<AddProviderForm>(defaultAddProviderForm);
  const [addProviderBusy, setAddProviderBusy] = useState(false);
  const [addProviderError, setAddProviderError] = useState<string | null>(null);
  const [addProviderResult, setAddProviderResult] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setState((current) => ({ ...current, authProbePending: true }));
    try {
      const [providerResult, modeResult, orchestratorResult, usageSummary] = await Promise.all([
        api.fetchProviders({ authProbe: false, signal }),
        api.fetchMode({ signal }),
        api.fetchOrchestratorStatus({ signal }),
        api.fetchUsageSummary({ authProbe: false, windowHours: 168, limit: 500, signal }),
      ]);
      if (signal?.aborted) return;
      const providers = providersFromResults(providerResult, orchestratorResult);
      setState({
        providers,
        mode: modeResult,
        orchestrator: orchestratorResult,
        providerResult,
        usageSummary,
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
  const usageByProvider = useMemo(() => {
    const byId = new Map<string, AssistantProviderUsageSummaryRow>();
    const usageRows = state.usageSummary?.ok ? state.usageSummary.providers : [];
    for (const row of usageRows) {
      const key = normalizeProviderId(row.provider ?? row.providerName);
      if (key) byId.set(key, row);
    }
    return byId;
  }, [state.usageSummary]);
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

  const runReauth = useCallback(async (provider: AssistantProviderReadinessStatus) => {
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

  const startReauth = useCallback(async (provider: AssistantProviderReadinessStatus) => {
    if (!supportsReauth(provider)) {
      setReauthResult({
        ok: false,
        kind: "failure",
        statusCode: null,
        message: `${providerLabel(provider)} reauth is not supported by the OpenClaw adapter yet.`,
      });
      return;
    }
    if (!activeControl) {
      setPendingReauthProvider(provider);
      setControlError(null);
      setControlDialogOpen(true);
      return;
    }
    await runReauth(provider);
  }, [activeControl, runReauth]);

  const applyControlMode = useCallback((nextControlMode: AssistantControlModeStatus) => {
    setState((current) => ({
      ...current,
      mode: current.mode?.ok
        ? {
            ...current.mode,
            status: {
              ...current.mode.status,
              controlMode: nextControlMode,
            },
          }
        : current.mode,
    }));
  }, []);

  const activateControlAndStartReauth = useCallback(async () => {
    const passphrase = controlPassphrase.trim();
    if (!passphrase) {
      setControlError("Passphrase is required.");
      return;
    }
    const provider = pendingReauthProvider;
    setControlBusy(true);
    setControlError(null);
    try {
      const result = await api.activateControlMode({
        passphrase,
        mode: "kernel_debug",
        reason: provider ? `OpenClaw LLM Auth reauth: ${providerId(provider)}` : "OpenClaw LLM Auth reauth",
        ttlSeconds: 900,
        idleTtlSeconds: 300,
      });
      if (!result.ok) {
        setControlError(result.message);
        return;
      }
      setControlPassphrase("");
      setControlDialogOpen(false);
      setPendingReauthProvider(null);
      applyControlMode(result.controlMode);
      if (provider) await runReauth(provider);
    } finally {
      setControlBusy(false);
    }
  }, [api, applyControlMode, controlPassphrase, pendingReauthProvider, runReauth]);

  const updateAddProviderForm = useCallback((patch: Partial<AddProviderForm>) => {
    setAddProviderForm((current) => ({ ...current, ...patch }));
  }, []);

  const registerProvider = useCallback(async () => {
    const provider = addProviderForm.provider.trim().toLowerCase().replace(/[-\s]+/g, "_");
    if (!provider) {
      setAddProviderError("Provider id is required.");
      return;
    }
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(provider)) {
      setAddProviderError("Provider id must use lowercase letters, numbers, and underscores.");
      return;
    }
    if (!activeControl && !addProviderForm.passphrase.trim()) {
      setAddProviderError("Control passphrase is required.");
      return;
    }

    setAddProviderBusy(true);
    setAddProviderError(null);
    setAddProviderResult(null);
    try {
      if (!activeControl) {
        const control = await api.activateControlMode({
          passphrase: addProviderForm.passphrase.trim(),
          mode: "kernel_debug",
          reason: `OpenClaw LLM Auth register provider: ${provider}`,
          ttlSeconds: 900,
          idleTtlSeconds: 300,
        });
        if (!control.ok) {
          setAddProviderError(control.message);
          return;
        }
        applyControlMode(control.controlMode);
      }

      const result = await api.registerProvider({
        provider,
        providerName: addProviderForm.providerName.trim() || provider,
        runtime: addProviderForm.runtime.trim() || "external_llm",
        model: addProviderForm.model.trim() || undefined,
        authStrategy: addProviderForm.authStrategy.trim() || "manual",
        binary: addProviderForm.binary.trim() || undefined,
        binaryEnv: addProviderForm.binaryEnv.trim() || undefined,
        note: addProviderForm.note.trim() || undefined,
      });
      if (!result.ok) {
        setAddProviderError(result.message);
        return;
      }
      setState((current) => ({
        ...current,
        providers: [
          ...current.providers.filter((item) => normalizeProviderId(providerId(item)) !== normalizeProviderId(provider)),
          result.provider,
        ],
      }));
      setAddProviderResult(`Registered ${result.provider.providerName ?? result.provider.provider ?? provider}`);
      setAddProviderForm(defaultAddProviderForm);
      setAddProviderOpen(false);
    } finally {
      setAddProviderBusy(false);
    }
  }, [activeControl, addProviderForm, api, applyControlMode]);

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
          {mode === "full" && (
            <Button size="sm" variant="outline" onClick={() => setAddProviderOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add LLM
            </Button>
          )}
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

      {addProviderResult && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-status-success/30 bg-status-success/10 p-3 text-xs text-status-success">
          <CheckCircle2 className="h-4 w-4" />
          <span>{addProviderResult}</span>
        </div>
      )}

      <div className={cn("mt-4 grid gap-3", mode === "full" ? "lg:grid-cols-3" : "md:grid-cols-3")}>
        {rows.map((provider) => (
          <ProviderCard
            key={providerId(provider)}
            mode={mode}
            provider={provider}
            usageSummary={usageByProvider.get(normalizeProviderId(providerId(provider))) ?? null}
            reauthBusy={reauthBusy}
            controlActive={activeControl}
            controlBusy={controlBusy}
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

      {mode === "full" && (
        <UsageHistoryPanel summary={state.usageSummary} />
      )}

      {reauthResult && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
          {!reauthResult.ok ? (
            <div className="text-status-failed">Reauth failed: {reauthResult.message}</div>
          ) : (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground">
                {reauthResult.reauth.provider ?? "codex"} reauth {reauthResult.reauth.status ?? "pending"}
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

      {mode === "full" && (
        <Dialog
          open={controlDialogOpen}
          onOpenChange={(open) => {
            setControlDialogOpen(open);
            if (!open) {
              setControlPassphrase("");
              setControlError(null);
              setPendingReauthProvider(null);
            }
          }}
        >
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">Enable provider reauth</DialogTitle>
              <DialogDescription className="text-xs">
                kernel_debug · 15 minute TTL · {pendingReauthProvider ? providerLabel(pendingReauthProvider) : "provider"} reauth
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="openclaw-llm-auth-control-passphrase" className="text-xs">
                  Control passphrase
                </Label>
                <Input
                  id="openclaw-llm-auth-control-passphrase"
                  type="password"
                  autoComplete="off"
                  value={controlPassphrase}
                  onChange={(event) => setControlPassphrase(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void activateControlAndStartReauth();
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                <div>kernel={state.mode?.ok && state.mode.status.kernelEnabled ? "on" : "off"}</div>
                <div>state={controlMode?.state ?? "unknown"}</div>
                {controlMode?.mode && <div>mode={controlMode.mode}</div>}
              </div>
              {controlError && (
                <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-1.5 text-xs text-status-warning">
                  {controlError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setControlDialogOpen(false)} disabled={controlBusy}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void activateControlAndStartReauth()} disabled={controlBusy}>
                {controlBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                Enable and start reauth
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mode === "full" && (
        <Dialog
          open={addProviderOpen}
          onOpenChange={(open) => {
            setAddProviderOpen(open);
            if (!open) {
              setAddProviderForm(defaultAddProviderForm);
              setAddProviderError(null);
            }
          }}
        >
          <DialogContent className="max-w-lg gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">Add LLM</DialogTitle>
              <DialogDescription className="text-xs">
                Provider registry
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledInput
                id="openclaw-llm-add-provider"
                label="Provider id"
                value={addProviderForm.provider}
                onChange={(value) => updateAddProviderForm({ provider: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-provider-name"
                label="Display name"
                value={addProviderForm.providerName}
                onChange={(value) => updateAddProviderForm({ providerName: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-runtime"
                label="Runtime"
                value={addProviderForm.runtime}
                onChange={(value) => updateAddProviderForm({ runtime: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-model"
                label="Model"
                value={addProviderForm.model}
                onChange={(value) => updateAddProviderForm({ model: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-auth-strategy"
                label="Auth strategy"
                value={addProviderForm.authStrategy}
                onChange={(value) => updateAddProviderForm({ authStrategy: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-binary"
                label="Binary"
                value={addProviderForm.binary}
                onChange={(value) => updateAddProviderForm({ binary: value })}
              />
              <LabeledInput
                id="openclaw-llm-add-binary-env"
                label="Binary env"
                value={addProviderForm.binaryEnv}
                onChange={(value) => updateAddProviderForm({ binaryEnv: value })}
              />
              {!activeControl && (
                <LabeledInput
                  id="openclaw-llm-add-passphrase"
                  label="Control passphrase"
                  type="password"
                  value={addProviderForm.passphrase}
                  onChange={(value) => updateAddProviderForm({ passphrase: value })}
                />
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="openclaw-llm-add-note" className="text-xs">
                  Note
                </Label>
                <Input
                  id="openclaw-llm-add-note"
                  value={addProviderForm.note}
                  onChange={(event) => updateAddProviderForm({ note: event.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {addProviderError && (
              <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-1.5 text-xs text-status-warning">
                {addProviderError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setAddProviderOpen(false)} disabled={addProviderBusy}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void registerProvider()} disabled={addProviderBusy}>
                {addProviderBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function LabeledInput({
  id,
  label,
  value,
  type = "text",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function ProviderCard({
  provider,
  mode,
  usageSummary,
  controlActive,
  controlBusy,
  reauthBusy,
  onStartReauth,
}: {
  provider: AssistantProviderReadinessStatus;
  mode: PanelMode;
  usageSummary: AssistantProviderUsageSummaryRow | null;
  controlActive: boolean;
  controlBusy: boolean;
  reauthBusy: string | null;
  onStartReauth: (provider: AssistantProviderReadinessStatus) => void;
}) {
  const id = providerId(provider);
  const authStatus = providerAuthStatus(provider);
  const quota = recordFrom(usageSummary?.quota);
  const usage = Object.keys(quota).length > 0 ? quota : providerUsage(provider);
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
        <Info label="used" value={formatMetric(usageValue(usage, "used"), unit)} />
        <Info label="history calls" value={formatNumber(usageSummary?.calls)} />
        <Info label="tokens" value={formatNumber(usageSummary?.totalTokens)} />
        {mode === "full" && (
          <>
            {(provider.model || provider.authStrategy) && (
              <Info className="col-span-2" label="model" value={provider.model ?? provider.authStrategy ?? "unknown"} />
            )}
            {provider.authStrategy && (
              <Info className="col-span-2" label="auth strategy" value={provider.authStrategy} />
            )}
            <Info label="limit" value={formatMetric(usageValue(usage, "limit"), unit)} />
            <Info label="reset" value={usageReset(usage)} />
            <Info className="col-span-2" label="quota source" value={usageValue(usage, "source", "status", "reason") || "unknown"} />
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
          disabled={!reauthable || busy || controlBusy}
          onClick={() => onStartReauth(provider)}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
          {reauthButtonLabel(provider, controlActive)}
        </Button>
      )}
    </article>
  );
}

function UsageHistoryPanel({ summary }: { summary: AssistantProviderUsageSummaryResult | null }) {
  if (!summary) {
    return (
      <section className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading provider usage history.</span>
        </div>
      </section>
    );
  }

  if (!summary.ok) {
    return (
      <section className="mt-5 border-t border-border pt-4">
        <div className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{summary.message}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Provider usage history">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Usage history</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatNumber(summary.totals.liveAuthCount)} live auth</Badge>
          <Badge variant="outline">{formatNumber(summary.totals.calls)} calls</Badge>
          <Badge variant="outline">{formatNumber(summary.totals.totalTokens)} tokens</Badge>
        </div>
      </header>

      <div className="mt-3 divide-y divide-border rounded-md border border-border">
        {summary.providers.map((provider) => (
          <UsageHistoryRow key={provider.provider ?? provider.providerName ?? "unknown"} provider={provider} />
        ))}
        {summary.providers.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">No provider usage history returned.</div>
        )}
      </div>
    </section>
  );
}

function UsageHistoryRow({ provider }: { provider: AssistantProviderUsageSummaryRow }) {
  const quota = recordFrom(provider.quota);
  const models = provider.models ?? [];
  return (
    <article className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-foreground">{provider.provider ?? "unknown"}</span>
            <Badge variant="outline" className={statusTone(provider.authStatus ?? provider.status ?? "unknown", provider.liveAuth)}>
              {provider.liveAuth ? "live auth" : provider.authStatus ?? provider.status ?? "unknown"}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{provider.runtime ?? "runtime unknown"}</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Info label="calls" value={formatNumber(provider.calls)} />
          <Info label="fail" value={formatNumber(provider.failedCount)} />
          <Info label="tokens" value={formatNumber(provider.totalTokens)} />
          <Info label="last" value={provider.lastUsedAt ?? "unknown"} />
        </dl>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Info label="quota source" value={usageValue(quota, "source") || "unknown"} />
        <Info label="remaining" value={usageRemaining(quota)} />
        <Info label="quota used" value={formatMetric(usageValue(quota, "used"), usageValue(quota, "unit"))} />
        <Info label="prompt bytes" value={formatNumber(provider.promptBytes)} />
      </dl>
      {models.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {models.slice(0, 4).map((model) => (
            <span key={model.model ?? "default"} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
              <span className="font-mono text-foreground">{model.model ?? "default"}</span>
              {" · "}
              {formatNumber(model.calls)} calls
              {" · "}
              {formatNumber(model.totalTokens)} tokens
            </span>
          ))}
        </div>
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
