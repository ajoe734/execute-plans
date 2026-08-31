// Persona Setup Repair — explicit controller pass for incomplete paper bundles.
// The browser never creates bindings, plans, approvals, or runtimes itself.

import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bffFetch } from "@/lib/bff-v1/client";
import { getPersona } from "@/lib/bff-v1/personas";
import type { Persona } from "@/lib/bff-v1";

type RepairablePersona = Persona & {
  paperLedgerId?: string;
  runtimeBindingId?: string;
};

export interface PersonaProvisioningReconcileMeta {
  status?: "ok" | "degraded" | string;
  lifecycle_state?: string;
  reconciled_by?: string;
  degraded_dependencies?: string[];
  authoritative_readback?: Record<string, unknown>;
}

export interface PersonaProvisioningReconcileResult {
  persona: Persona;
  meta: PersonaProvisioningReconcileMeta;
}

interface PersonaProvisioningReconcileEnvelope {
  data?: Persona;
  meta?: PersonaProvisioningReconcileMeta;
}

export async function reconcilePersonaProvisioning(
  personaId: string,
): Promise<PersonaProvisioningReconcileResult> {
  const id = personaId.trim();
  if (!id) throw new Error("Persona id is required for provisioning reconcile.");

  const response = await bffFetch<PersonaProvisioningReconcileEnvelope>({
    method: "POST",
    path: `/bff/personas/${encodeURIComponent(id)}/provisioning/reconcile`,
  });
  if (!response?.data || typeof response.data !== "object") {
    throw new Error("Persona provisioning controller returned no Persona readback.");
  }
  return { persona: response.data, meta: response.meta ?? {} };
}

export function isCompletePaperBundle(persona: Persona | undefined): boolean {
  if (!persona) return false;
  const bundle = persona as RepairablePersona;
  return persona.state === "paper_running" && Boolean(bundle.paperLedgerId) && Boolean(bundle.runtimeBindingId);
}

function bundleReference(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "pending";
}

export default function PersonaOnboarding() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const failedStep = searchParams.get("failed_step")?.trim() || "provisioning";
  const [persona, setPersona] = useState<Persona>();
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reconcileError, setReconcileError] = useState("");
  const [reconcileMeta, setReconcileMeta] = useState<PersonaProvisioningReconcileMeta>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    if (!id) {
      setPersona(undefined);
      setLoadError("Persona id is missing.");
      setLoading(false);
      return () => { active = false; };
    }

    getPersona(id)
      .then((next) => {
        if (!active) return;
        setPersona(next);
        if (!next) setLoadError(`Persona ${id} was not found.`);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPersona(undefined);
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const reconcile = async () => {
    setReconciling(true);
    setReconcileError("");
    try {
      const result = await reconcilePersonaProvisioning(id);
      setPersona(result.persona);
      setReconcileMeta(result.meta);
      if (isCompletePaperBundle(result.persona)) {
        toast.success("Paper Persona provisioning is complete.");
      } else if (result.meta.status === "degraded") {
        toast.warning("Provisioning controller reported degraded dependencies.");
      } else {
        toast.info("Provisioning controller pass completed; durable owners are still converging.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReconcileError(message);
      toast.error(`Provisioning reconcile failed: ${message}`);
    } finally {
      setReconciling(false);
    }
  };

  const backToPersona = () => navigate(`/management/personas/${encodeURIComponent(id)}`);

  if (loading) {
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading paper persona" />
      </section>
    );
  }

  if (!persona) {
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <Card className="p-5 space-y-3 border-status-failed/40 bg-status-failed/5">
          <div className="flex items-center gap-2 text-status-failed">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Persona repair unavailable</h1>
          </div>
          <p className="text-sm text-muted-foreground">{loadError || "No canonical Persona readback is available."}</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/management/personas")}>Back to Personas</Button>
        </Card>
      </section>
    );
  }

  if (isCompletePaperBundle(persona)) {
    const bundle = persona as RepairablePersona;
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <Card className="p-5 space-y-3 border-status-success/40 bg-status-success/5">
          <div className="flex items-center gap-2 text-status-success">
            <CheckCircle2 className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Paper Persona provisioning complete</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The durable Persona owner reports a running paper ledger and runtime binding. Repair actions are disabled to prevent duplicate resources.
          </p>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Paper ledger</dt><dd className="font-mono">{bundleReference(bundle.paperLedgerId)}</dd></div>
            <div><dt className="text-muted-foreground">Runtime binding</dt><dd className="font-mono">{bundleReference(bundle.runtimeBindingId)}</dd></div>
          </dl>
          <Button size="sm" onClick={backToPersona}>View persona</Button>
        </Card>
      </section>
    );
  }

  const bundle = persona as RepairablePersona;
  const degradedDependencies = reconcileMeta?.degraded_dependencies ?? [];

  return (
    <section className="p-6 max-w-3xl mx-auto space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Paper Persona Setup Repair</h1>
          <p className="text-sm text-muted-foreground">
            Request one restart-safe controller pass for {persona.name || id}. The browser does not create or patch resources itself.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={backToPersona}>
          <ArrowLeft className="h-4 w-4 mr-1" />View persona
        </Button>
      </header>

      <Card className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-status-warning mt-0.5" />
          <div>
            <h2 className="font-semibold">Incomplete durable bundle</h2>
            <p className="text-sm text-muted-foreground">
              Reported failed step: <span className="font-mono text-foreground">{failedStep}</span>. The only enabled mutation is owned by the Persona provisioning controller.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 rounded border border-border p-3 text-xs sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Lifecycle</dt><dd className="font-mono">{persona.state || "unknown"}</dd></div>
          <div><dt className="text-muted-foreground">Paper ledger</dt><dd className="font-mono">{bundleReference(bundle.paperLedgerId)}</dd></div>
          <div><dt className="text-muted-foreground">Runtime binding</dt><dd className="font-mono">{bundleReference(bundle.runtimeBindingId)}</dd></div>
        </dl>

        {degradedDependencies.length > 0 && (
          <div role="status" className="rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
            Degraded owner dependencies: {degradedDependencies.join(", ")}
          </div>
        )}
        {reconcileError && (
          <div role="alert" className="rounded border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-xs text-status-failed">
            {reconcileError}
          </div>
        )}

        <Button onClick={() => void reconcile()} disabled={reconciling}>
          {reconciling
            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-1" />}
          Run durable provisioning reconcile
        </Button>
        <p className="text-xs text-muted-foreground">
          Owner: <span className="font-mono">POST /bff/personas/{id}/provisioning/reconcile</span>
        </p>
      </Card>
    </section>
  );
}
