// Add Data Source Wizard creating configured_disabled instances with secret references only (SD-SRCM-04).

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isValidSecretRefId,
  managementDataSourceReads,
  managementDataSourceWrites,
  type ConnectorDefinition,
  type CreateSourceInput,
  type SourceCommandReceipt,
  type SourceDevelopmentNeed,
} from "@/lib/bff-v1/managementDataSources";
import { realWritesEnabled } from "@/lib/bff-v1/liveTransport";
import { fmtToken, joinOrDash } from "./dataSourceModels";

export interface DataSourceAddWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedDefinitionId?: string | null;
  onSourceCreated?: (receipt: SourceCommandReceipt) => void;
}

const LICENSE_OPTIONS = [
  "official_reference",
  "vendor",
  "public",
  "restricted",
  "proprietary",
];

const ALLOWED_USE_OPTIONS = [
  "research_data",
  "backtest_data",
  "monitoring",
  "live_signal",
];

const SENSITIVITY_OPTIONS = [
  "public",
  "internal",
  "confidential",
  "restricted",
];

const SECRET_KEYWORDS = [
  "api_key",
  "apikey",
  "secret",
  "password",
  "token",
  "auth_token",
  "private_key",
  "secret_key",
];

function containsRawSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("env://") || v.startsWith("vault://") || v.startsWith("ref://")) {
    return false;
  }
  // If it's a raw long token or contains suspicious secret characters
  if (v.length > 20 && !v.includes(" ") && !v.includes("/")) return true;
  return false;
}

export function DataSourceAddWizard({
  open,
  onOpenChange,
  preselectedDefinitionId,
  onSourceCreated,
}: DataSourceAddWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<number>(1);
  const [definitions, setDefinitions] = useState<ConnectorDefinition[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(false);

  // Form State
  const [selectedDefId, setSelectedDefId] = useState<string>("");
  const [sourceInstanceId, setSourceInstanceId] = useState<string>("");
  const [connectorId, setConnectorId] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [sourceClass, setSourceClass] = useState<string>("market_daily");
  const [datasetsInput, setDatasetsInput] = useState<string>("");
  const [marketsInput, setMarketsInput] = useState<string>("TW");

  // Connection & Config
  const [secretRefId, setSecretRefId] = useState<string>("");
  const [secretScope, setSecretScope] = useState<string>("runtime_read_only");
  const [publicConfigPairs, setPublicConfigPairs] = useState<Array<{ key: string; value: string }>>([]);

  // Governance & Policy
  const [licenseScope, setLicenseScope] = useState<string>("official_reference");
  const [allowedUses, setAllowedUses] = useState<string[]>(["research_data", "backtest_data", "monitoring"]);
  const [retentionPolicyRef, setRetentionPolicyRef] = useState<string>("source-retention://standard-1y");
  const [deletionPolicyRef, setDeletionPolicyRef] = useState<string>("source-deletion://standard");
  const [freshnessSlaSeconds, setFreshnessSlaSeconds] = useState<number>(86400);
  const [sensitivity, setSensitivity] = useState<string>("public");

  // Universe & Schedule
  const [universePolicyRef, setUniversePolicyRef] = useState<string>("active_universe_scheduling_policy.v1");
  const [cadence, setCadence] = useState<string>("0 19 * * 1-5");
  const [timezone, setTimezone] = useState<string>("Asia/Taipei");
  const [jitterSeconds, setJitterSeconds] = useState<number>(120);
  const [maxRecords, setMaxRecords] = useState<number>(100);
  const [maxBytes, setMaxBytes] = useState<number>(1048576);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(15);

  // Unsupported Connector Need State
  const [unsupportedMode, setUnsupportedMode] = useState<boolean>(false);
  const [unsupportedProvider, setUnsupportedProvider] = useState<string>("");
  const [unsupportedClass, setUnsupportedClass] = useState<string>("");
  const [unsupportedReason, setUnsupportedReason] = useState<string>("");
  const [copiedNeed, setCopiedNeed] = useState<boolean>(false);

  // Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoadingDefs(true);
      managementDataSourceReads
        .catalog()
        .then((res) => {
          setDefinitions(res.definitions);
          if (preselectedDefinitionId) {
            setSelectedDefId(preselectedDefinitionId);
            const found = res.definitions.find((d) => d.definition_id === preselectedDefinitionId);
            if (found) {
              setProvider(found.provider);
              if (found.source_classes?.[0]) setSourceClass(found.source_classes[0]);
              if (found.datasets?.length) setDatasetsInput(found.datasets.join(", "));
              if (found.markets?.length) setMarketsInput(found.markets.join(", "));
            }
          }
        })
        .finally(() => setLoadingDefs(false));
    }
  }, [open, preselectedDefinitionId]);

  const handleSelectDefinition = (defId: string) => {
    setSelectedDefId(defId);
    setUnsupportedMode(false);
    const def = definitions.find((d) => d.definition_id === defId);
    if (def) {
      setProvider(def.provider);
      if (def.source_classes?.[0]) setSourceClass(def.source_classes[0]);
      if (def.datasets?.length) setDatasetsInput(def.datasets.join(", "));
      if (def.markets?.length) setMarketsInput(def.markets.join(", "));
      if (def.default_limits?.max_records) setMaxRecords(def.default_limits.max_records);
      if (def.default_limits?.max_bytes) setMaxBytes(def.default_limits.max_bytes);
      if (def.default_limits?.timeout_seconds) setTimeoutSeconds(def.default_limits.timeout_seconds);

      const generatedId = `ds-${def.provider.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;
      if (!sourceInstanceId) {
        setSourceInstanceId(generatedId);
        setConnectorId(generatedId);
      }
    }
  };

  const handleNext = () => {
    setErrorMsg(null);
    if (step === 1) {
      if (!selectedDefId && !unsupportedMode) {
        setErrorMsg(t("mgmt.dataSources.wizard.selectDefinitionRequired"));
        return;
      }
      if (unsupportedMode) return;
    }
    if (step === 2) {
      if (!sourceInstanceId.trim()) {
        setErrorMsg(t("mgmt.dataSources.wizard.sourceIdRequired"));
        return;
      }
      if (!provider.trim()) {
        setErrorMsg(t("mgmt.dataSources.wizard.providerRequired"));
        return;
      }
    }
    if (step === 3) {
      if (!secretScope) {
        setErrorMsg(t("mgmt.dataSources.wizard.secretScopeRequired"));
        return;
      }
      // Secret Validation Check
      if (secretRefId.trim() && (!isValidSecretRefId(secretRefId.trim()) || containsRawSecret(secretRefId))) {
        setErrorMsg(t("mgmt.dataSources.wizard.rawSecretDetected"));
        return;
      }
      for (const pair of publicConfigPairs) {
        if (SECRET_KEYWORDS.some((kw) => pair.key.toLowerCase().includes(kw)) || containsRawSecret(pair.value)) {
          setErrorMsg(t("mgmt.dataSources.wizard.rawSecretInPublicConfig", { key: pair.key }));
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => {
    setErrorMsg(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleReset = () => {
    setStep(1);
    setSelectedDefId("");
    setSourceInstanceId("");
    setConnectorId("");
    setProvider("");
    setSecretRefId("");
    setSecretScope("runtime_read_only");
    setPublicConfigPairs([]);
    setUnsupportedMode(false);
    setErrorMsg(null);
    onOpenChange(false);
  };

  const handleAddPublicConfigPair = () => {
    setPublicConfigPairs([...publicConfigPairs, { key: "", value: "" }]);
  };

  const handleRemovePublicConfigPair = (index: number) => {
    setPublicConfigPairs(publicConfigPairs.filter((_, i) => i !== index));
  };

  const handleUpdatePublicConfigPair = (index: number, field: "key" | "value", val: string) => {
    const updated = [...publicConfigPairs];
    updated[index][field] = val;
    setPublicConfigPairs(updated);
  };

  const getDevelopmentNeedPayload = (): SourceDevelopmentNeed => ({
    schema_version: "source_development_need.v1",
    reason: unsupportedReason || "adapter_not_supported",
    provider: unsupportedProvider || "Custom Provider",
    source_class: unsupportedClass || "market",
    required_capabilities: {
      datasets: datasetsInput ? datasetsInput.split(",").map((s) => s.trim()) : [],
      markets: marketsInput ? marketsInput.split(",").map((s) => s.trim()) : [],
    },
    suggested_adapter_token: `${(unsupportedProvider || "Custom").replace(/[^a-zA-Z0-9]/g, "")}Adapter.records_from_payload`,
    timestamp: new Date().toISOString(),
  });

  const handleCopyDevelopmentNeed = () => {
    navigator.clipboard.writeText(JSON.stringify(getDevelopmentNeedPayload(), null, 2));
    setCopiedNeed(true);
    setTimeout(() => setCopiedNeed(false), 2000);
  };

  const handleDownloadDevelopmentNeed = () => {
    const blob = new Blob([JSON.stringify(getDevelopmentNeedPayload(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `source-development-need-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    const publicConfig: Record<string, unknown> = {};
    for (const pair of publicConfigPairs) {
      if (pair.key.trim()) {
        publicConfig[pair.key.trim()] = pair.value.trim();
      }
    }

    const payload: CreateSourceInput = {
      source_instance_id: sourceInstanceId.trim(),
      definition_id: selectedDefId,
      connector_id: connectorId.trim() || sourceInstanceId.trim(),
      provider: provider.trim(),
      source_class: sourceClass,
      datasets: datasetsInput ? datasetsInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
      markets: marketsInput ? marketsInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
      license_scope: licenseScope,
      secret_scope: secretScope,
      allowed_use: allowedUses,
      retention_policy_ref: retentionPolicyRef.trim(),
      deletion_policy_ref: deletionPolicyRef.trim(),
      freshness_sla_seconds: Number(freshnessSlaSeconds),
      sensitivity,
      connector_config: {
        public: publicConfig,
        secret_ref_id: secretRefId.trim() || null,
        secret_scope: secretScope,
      },
      schedule: {
        enabled: false, // MANDATORY: Created disabled
        cadence: cadence.trim(),
        timezone: timezone.trim(),
        jitter_seconds: Number(jitterSeconds),
      },
      universe_policy_ref: universePolicyRef.trim(),
      limits: {
        max_records: Number(maxRecords),
        max_bytes: Number(maxBytes),
        timeout_seconds: Number(timeoutSeconds),
      },
      reason: "Operator created new configured_disabled data source via wizard",
    };

    try {
      const receipt = await managementDataSourceWrites.createDataSource(payload);
      setSubmitting(false);
      onSourceCreated?.(receipt);
      handleReset();
    } catch (err: unknown) {
      setSubmitting(false);
      const e = err as { message?: string };
      setErrorMsg(e.message || t("mgmt.dataSources.wizard.createFailed"));
    }
  };

  const writesLive = realWritesEnabled();

  return (
    <Dialog open={open} onOpenChange={handleReset}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              {t("mgmt.dataSources.wizard.title")}
            </DialogTitle>
            <Badge variant="outline" className="text-xs font-mono">
              Step {step} / 6
            </Badge>
          </div>
          <DialogDescription>
            {t("mgmt.dataSources.wizard.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="grid grid-cols-6 gap-1 py-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <Card className="p-3 bg-status-failed/10 border-status-failed/30 text-xs text-status-failed flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </Card>
        )}

        <div className="py-2 space-y-4 text-xs">
          {/* STEP 1: Select Deployed Definition */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground">
                  {t("mgmt.dataSources.wizard.step1Title")}
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setUnsupportedMode(!unsupportedMode)}
                  className="h-6 text-xs text-primary"
                >
                  {unsupportedMode
                    ? t("mgmt.dataSources.wizard.backToCatalog")
                    : t("mgmt.dataSources.wizard.unsupportedConnector")}
                </Button>
              </div>

              {!unsupportedMode ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {loadingDefs ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("mgmt.dataSources.wizard.loadingDefinitions")}
                    </div>
                  ) : definitions.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      {t("mgmt.dataSources.wizard.noDefinitionsFound")}
                    </div>
                  ) : (
                    definitions.map((def) => {
                      const isSelected = selectedDefId === def.definition_id;
                      const isSupported = def.definition_state === "supported";
                      return (
                        <div
                          key={def.definition_id}
                          onClick={() => isSupported && handleSelectDefinition(def.definition_id)}
                          className={`p-3 rounded-md border cursor-pointer transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : isSupported
                                ? "hover:border-border hover:bg-muted/40"
                                : "opacity-60 cursor-not-allowed bg-muted/20"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {def.provider}
                              <code className="text-[11px] font-mono text-muted-foreground">
                                ({def.definition_id})
                              </code>
                            </div>
                            <Badge variant="outline" className={isSupported ? "bg-status-success/10 text-status-success" : ""}>
                              {fmtToken(def.definition_state)}
                            </Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground flex flex-wrap gap-2 text-[11px]">
                            <span>Adapter: <code className="font-mono">{def.adapter_token}</code></span>
                            <span>Datasets: {joinOrDash(def.datasets)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Unsupported Mode - Phase 1 Development Need Artifact */
                <Card className="p-4 bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2 text-status-warning font-semibold">
                    <Sparkles className="h-4 w-4" />
                    {t("mgmt.dataSources.wizard.unsupportedTitle")}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("mgmt.dataSources.wizard.unsupportedDesc")}
                  </p>

                  <div className="space-y-2 pt-1">
                    <div>
                      <Label className="text-[11px]">{t("mgmt.dataSources.provider")}</Label>
                      <Input
                        value={unsupportedProvider}
                        onChange={(e) => setUnsupportedProvider(e.target.value)}
                        placeholder="e.g. Bloomberg B-PIPE"
                        className="text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t("mgmt.dataSources.detail.sourceClass")}</Label>
                      <Input
                        value={unsupportedClass}
                        onChange={(e) => setUnsupportedClass(e.target.value)}
                        placeholder="e.g. order_flow_depth"
                        className="text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t("mgmt.dataSources.wizard.needReason")}</Label>
                      <Input
                        value={unsupportedReason}
                        onChange={(e) => setUnsupportedReason(e.target.value)}
                        placeholder="e.g. Real-time L2 order flow data for momentum strategy"
                        className="text-xs mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={handleCopyDevelopmentNeed} className="text-xs">
                      {copiedNeed ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {t("mgmt.dataSources.wizard.copyNeedJson")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownloadDevelopmentNeed} className="text-xs">
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {t("mgmt.dataSources.wizard.downloadNeedArtifact")}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* STEP 2: Identity & Basics */}
          {step === 2 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-foreground">
                {t("mgmt.dataSources.wizard.step2Title")}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sourceInstanceId" className="text-xs">
                    {t("mgmt.dataSources.detail.sourceId")} *
                  </Label>
                  <Input
                    id="sourceInstanceId"
                    value={sourceInstanceId}
                    onChange={(e) => setSourceInstanceId(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="connectorId" className="text-xs">
                    {t("mgmt.dataSources.detail.connectorId")}
                  </Label>
                  <Input
                    id="connectorId"
                    value={connectorId}
                    onChange={(e) => setConnectorId(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="provider" className="text-xs">
                    {t("mgmt.dataSources.provider")} *
                  </Label>
                  <Input
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sourceClass" className="text-xs">
                    {t("mgmt.dataSources.detail.sourceClass")}
                  </Label>
                  <Input
                    id="sourceClass"
                    value={sourceClass}
                    onChange={(e) => setSourceClass(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="datasetsInput" className="text-xs">
                    {t("mgmt.dataSources.detail.datasets")} (comma separated)
                  </Label>
                  <Input
                    id="datasetsInput"
                    value={datasetsInput}
                    onChange={(e) => setDatasetsInput(e.target.value)}
                    placeholder="tw_price_daily, tw_dividends"
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="marketsInput" className="text-xs">
                    {t("mgmt.dataSources.markets")} (comma separated)
                  </Label>
                  <Input
                    id="marketsInput"
                    value={marketsInput}
                    onChange={(e) => setMarketsInput(e.target.value)}
                    placeholder="TW, US"
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Connection & Secrets (Strict Reference Only) */}
          {step === 3 && (
            <div className="space-y-4">
              <Label className="text-xs font-medium text-foreground">
                {t("mgmt.dataSources.wizard.step3Title")}
              </Label>

              {/* Secret Reference & Scope Input */}
              <Card className="p-3 bg-muted/40 space-y-3 border-primary/20">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  {t("mgmt.dataSources.wizard.secretReferenceTitle")}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("mgmt.dataSources.wizard.secretReferenceNotice")}
                </p>
                <div className="pt-1">
                  <Label htmlFor="secretRefId" className="text-xs">
                    {t("mgmt.dataSources.detail.secretRefId")} (e.g. <code className="font-mono">vault://secrets/twse</code> or <code className="font-mono">env://TWSE_KEY</code>)
                  </Label>
                  <Input
                    id="secretRefId"
                    value={secretRefId}
                    onChange={(e) => setSecretRefId(e.target.value)}
                    placeholder="vault://path/to/secret-ref"
                    className="text-xs font-mono mt-1"
                  />
                </div>

                <div className="pt-1 space-y-1">
                  <Label htmlFor="secretScopeSelect" className="text-xs">
                    {t("mgmt.dataSources.wizard.secretScope")} *
                  </Label>
                  <Select value={secretScope} onValueChange={setSecretScope}>
                    <SelectTrigger id="secretScopeSelect" className="text-xs">
                      <SelectValue placeholder="Select secret scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="runtime_read_only">
                        {t("mgmt.dataSources.wizard.scopes.runtime_read_only")} (runtime_read_only)
                      </SelectItem>
                      <SelectItem value="tenant_isolated">
                        {t("mgmt.dataSources.wizard.scopes.tenant_isolated")} (tenant_isolated)
                      </SelectItem>
                      <SelectItem value="operator_shared">
                        {t("mgmt.dataSources.wizard.scopes.operator_shared")} (operator_shared)
                      </SelectItem>
                      <SelectItem value="restricted_canary">
                        {t("mgmt.dataSources.wizard.scopes.restricted_canary")} (restricted_canary)
                      </SelectItem>
                      <SelectItem value="production_market_data">
                        {t("mgmt.dataSources.wizard.scopes.production_market_data")} (production_market_data)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {t("mgmt.dataSources.wizard.secretScopeNotice")}
                  </p>
                </div>
              </Card>

              {/* Public Config Key-Value Pairs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    {t("mgmt.dataSources.detail.publicConfig")}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleAddPublicConfigPair} className="h-6 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    {t("mgmt.dataSources.wizard.addConfigPair")}
                  </Button>
                </div>
                {publicConfigPairs.length === 0 ? (
                  <p className="text-muted-foreground text-[11px] italic">
                    {t("mgmt.dataSources.wizard.noConfigPairsAdded")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {publicConfigPairs.map((pair, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input
                          placeholder="Key (e.g. endpoint_url)"
                          value={pair.key}
                          onChange={(e) => handleUpdatePublicConfigPair(idx, "key", e.target.value)}
                          className="text-xs font-mono"
                        />
                        <Input
                          placeholder="Value (e.g. https://openapi.twse.com.tw)"
                          value={pair.value}
                          onChange={(e) => handleUpdatePublicConfigPair(idx, "value", e.target.value)}
                          className="text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemovePublicConfigPair(idx)}
                          className="h-8 text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Governance & Policy */}
          {step === 4 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-foreground">
                {t("mgmt.dataSources.wizard.step4Title")}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("mgmt.dataSources.detail.licenseScope")}</Label>
                  <Select value={licenseScope} onValueChange={setLicenseScope}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-xs">
                          {fmtToken(opt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("mgmt.dataSources.wizard.sensitivity")}</Label>
                  <Select value={sensitivity} onValueChange={setSensitivity}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENSITIVITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-xs">
                          {fmtToken(opt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="retentionPolicyRef" className="text-xs">
                    {t("mgmt.dataSources.detail.retentionPolicy")}
                  </Label>
                  <Input
                    id="retentionPolicyRef"
                    value={retentionPolicyRef}
                    onChange={(e) => setRetentionPolicyRef(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="deletionPolicyRef" className="text-xs">
                    {t("mgmt.dataSources.detail.deletionPolicy")}
                  </Label>
                  <Input
                    id="deletionPolicyRef"
                    value={deletionPolicyRef}
                    onChange={(e) => setDeletionPolicyRef(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="freshnessSlaSeconds" className="text-xs">
                    {t("mgmt.dataSources.detail.freshnessSla")} (seconds)
                  </Label>
                  <Input
                    id="freshnessSlaSeconds"
                    type="number"
                    value={freshnessSlaSeconds}
                    onChange={(e) => setFreshnessSlaSeconds(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">{t("mgmt.dataSources.detail.allowedUse")}</Label>
                  <div className="grid grid-cols-2 gap-2 border p-2.5 rounded-md">
                    {ALLOWED_USE_OPTIONS.map((use) => (
                      <div key={use} className="flex items-center space-x-2">
                        <Checkbox
                          id={`use-${use}`}
                          checked={allowedUses.includes(use)}
                          onCheckedChange={(checked) => {
                            if (checked) setAllowedUses([...allowedUses, use]);
                            else setAllowedUses(allowedUses.filter((u) => u !== use));
                          }}
                        />
                        <Label htmlFor={`use-${use}`} className="text-xs font-normal cursor-pointer">
                          {fmtToken(use)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Universe, Limits & Schedule */}
          {step === 5 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-foreground">
                {t("mgmt.dataSources.wizard.step5Title")}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="universePolicyRef" className="text-xs">
                    {t("mgmt.dataSources.detail.universePolicyRef")}
                  </Label>
                  <Input
                    id="universePolicyRef"
                    value={universePolicyRef}
                    onChange={(e) => setUniversePolicyRef(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cadence" className="text-xs">
                    {t("mgmt.dataSources.detail.cadenceCron")}
                  </Label>
                  <Input
                    id="cadence"
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timezone" className="text-xs">
                    {t("mgmt.dataSources.detail.timezone")}
                  </Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="maxRecords" className="text-xs">
                    Max Records Limit
                  </Label>
                  <Input
                    id="maxRecords"
                    type="number"
                    value={maxRecords}
                    onChange={(e) => setMaxRecords(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timeoutSeconds" className="text-xs">
                    Timeout (seconds)
                  </Label>
                  <Input
                    id="timeoutSeconds"
                    type="number"
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <Card className="p-3 bg-muted/40 text-[11px] text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground">{t("mgmt.dataSources.wizard.scheduleDisabledNoticeTitle")}</span>
                <p>{t("mgmt.dataSources.wizard.scheduleDisabledNoticeDesc")}</p>
              </Card>
            </div>
          )}

          {/* STEP 6: Review & Finalize (Created Disabled Warning) */}
          {step === 6 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-foreground">
                {t("mgmt.dataSources.wizard.step6Title")}
              </Label>

              <Card className="p-4 space-y-2.5 bg-card border">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t("mgmt.dataSources.detail.sourceId")}:</span>
                    <p className="font-mono font-medium">{sourceInstanceId}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("mgmt.dataSources.provider")}:</span>
                    <p className="font-medium">{provider}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Definition:</span>
                    <p className="font-mono">{selectedDefId}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("mgmt.dataSources.detail.licenseScope")}:</span>
                    <p className="font-mono">{licenseScope}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Secret Reference:</span>
                    <p className="font-mono">{secretRefId || t("mgmt.dataSources.detail.noSecretRequired")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Initial State:</span>
                    <Badge variant="outline" className="font-mono">configured_disabled</Badge>
                  </div>
                </div>
              </Card>

              <Card className="p-3 bg-status-warning/10 border-status-warning/30 text-xs text-status-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t("mgmt.dataSources.wizard.createDisabledWarningTitle")}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("mgmt.dataSources.wizard.createDisabledWarningDesc")}
                  </p>
                </div>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center gap-2 pt-2 border-t">
          <div>
            {step > 1 && (
              <Button size="sm" variant="outline" onClick={handleBack} disabled={submitting}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                {t("mgmt.actions.back")}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleReset} disabled={submitting}>
              {t("mgmt.actions.cancel")}
            </Button>
            {step < 6 ? (
              <Button size="sm" onClick={handleNext} disabled={unsupportedMode}>
                {t("mgmt.actions.next")}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !writesLive}
                title={!writesLive ? t("mgmt.dataSources.realWritesRequired") : undefined}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                {t("mgmt.dataSources.wizard.createButton")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
