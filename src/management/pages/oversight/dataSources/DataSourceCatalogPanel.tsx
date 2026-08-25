// Deployed connector definitions catalog panel with offline development need export (SD-SRCM-04).

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  managementDataSourceReads,
  type ConnectorDefinition,
  type SourceDevelopmentNeed,
} from "@/lib/bff-v1/managementDataSources";
import { fmtToken, formatBytes, joinOrDash, toneClass } from "./dataSourceModels";

export interface DataSourceCatalogPanelProps {
  onCreateFromDefinition: (definitionId: string) => void;
}

export function DataSourceCatalogPanel({ onCreateFromDefinition }: DataSourceCatalogPanelProps) {
  const { t } = useTranslation();
  const [definitions, setDefinitions] = useState<ConnectorDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<string>("all");

  // Unsupported Need State
  const [unsupportedProvider, setUnsupportedProvider] = useState("");
  const [unsupportedClass, setUnsupportedClass] = useState("market");
  const [unsupportedDatasets, setUnsupportedDatasets] = useState("");
  const [unsupportedReason, setUnsupportedReason] = useState("");
  const [copiedNeed, setCopiedNeed] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await managementDataSourceReads.catalog();
      setDefinitions(res.definitions);
    } catch {
      // Keep existing on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const filtered = definitions.filter((def) => {
    const matchesSearch =
      !search ||
      def.definition_id.toLowerCase().includes(search.toLowerCase()) ||
      def.provider.toLowerCase().includes(search.toLowerCase()) ||
      def.adapter_token.toLowerCase().includes(search.toLowerCase());

    const matchesState =
      filterState === "all" || def.definition_state.toLowerCase() === filterState.toLowerCase();

    return matchesSearch && matchesState;
  });

  const getDevelopmentNeedPayload = (): SourceDevelopmentNeed => ({
    schema_version: "source_development_need.v1",
    reason: unsupportedReason || "adapter_not_supported",
    provider: unsupportedProvider || "Custom Provider",
    source_class: unsupportedClass || "market",
    required_capabilities: {
      datasets: unsupportedDatasets ? unsupportedDatasets.split(",").map((s) => s.trim()) : [],
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

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder={t("mgmt.dataSources.catalog.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
          <div className="flex gap-1">
            {["all", "supported", "disabled_by_build", "experimental"].map((state) => (
              <Button
                key={state}
                size="sm"
                variant={filterState === state ? "default" : "outline"}
                className="h-8 text-xs px-2.5"
                onClick={() => setFilterState(state)}
              >
                {fmtToken(state)}
              </Button>
            ))}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={loadCatalog} disabled={loading} className="h-9">
          <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          {t("mgmt.actions.refresh")}
        </Button>
      </div>

      {/* Catalog Grid */}
      {loading && definitions.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("mgmt.dataSources.catalog.loadingCatalog")}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {t("mgmt.dataSources.catalog.noDefinitionsMatch")}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((def) => {
            const isSupported = def.definition_state === "supported";
            return (
              <Card
                key={def.definition_id}
                className="p-4 space-y-3 border flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <Database className="h-4 w-4 text-primary shrink-0" />
                        {def.provider}
                      </h4>
                      <code className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                        {def.definition_id}
                      </code>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        isSupported
                          ? "bg-status-success/10 text-status-success border-status-success/30 text-[10px]"
                          : "text-[10px]"
                      }
                    >
                      {fmtToken(def.definition_state)}
                    </Badge>
                  </div>

                  {def.disabled_reason && (
                    <div className="p-2 rounded bg-status-failed/10 border-status-failed/20 text-status-failed text-[11px]">
                      {def.disabled_reason}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground pt-1">
                    <div className="flex items-center justify-between">
                      <span>Adapter:</span>
                      <code className="font-mono text-[11px] text-foreground truncate max-w-[170px]" title={def.adapter_token}>
                        {def.adapter_token}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Deployment SHA:</span>
                      <code className="font-mono text-[11px] text-foreground">
                        {def.deployment_sha ? def.deployment_sha.slice(0, 8) : "—"}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Auth Modes:</span>
                      <span className="font-mono">{joinOrDash(def.auth_modes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Datasets:</span>
                      <span className="font-mono truncate max-w-[170px]">{joinOrDash(def.datasets)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Markets:</span>
                      <span className="font-mono">{joinOrDash(def.markets)}</span>
                    </div>
                    {def.default_limits && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Limits:</span>
                        <span className="font-mono">
                          {def.default_limits.max_records} rec / {formatBytes(def.default_limits.max_bytes)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t flex items-center justify-end">
                  <Button
                    size="sm"
                    variant={isSupported ? "default" : "outline"}
                    className="h-8 text-xs"
                    disabled={!isSupported}
                    onClick={() => onCreateFromDefinition(def.definition_id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t("mgmt.dataSources.catalog.createInstance")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Phase 1 Development Need Intake Section */}
      <Card className="p-6 bg-muted/20 border space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("mgmt.dataSources.catalog.developmentNeedTitle")}
            </h3>
            <p className="text-xs text-muted-foreground max-w-2xl">
              {t("mgmt.dataSources.catalog.developmentNeedDesc")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div>
            <Label className="text-xs">{t("mgmt.dataSources.provider")}</Label>
            <Input
              placeholder="e.g. Bloomberg B-PIPE"
              value={unsupportedProvider}
              onChange={(e) => setUnsupportedProvider(e.target.value)}
              className="text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">{t("mgmt.dataSources.detail.sourceClass")}</Label>
            <Input
              placeholder="e.g. order_flow_depth"
              value={unsupportedClass}
              onChange={(e) => setUnsupportedClass(e.target.value)}
              className="text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Required Datasets</Label>
            <Input
              placeholder="e.g. l2_ticks, market_depth"
              value={unsupportedDatasets}
              onChange={(e) => setUnsupportedDatasets(e.target.value)}
              className="text-xs mt-1 font-mono"
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Development Rationale / Need</Label>
            <Input
              placeholder="e.g. Millisecond order flow depth required for cross-venue arbitrage model"
              value={unsupportedReason}
              onChange={(e) => setUnsupportedReason(e.target.value)}
              className="text-xs mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
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
    </div>
  );
}
