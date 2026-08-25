// Immutable command receipts audit history panel (SD-SRCM-04).

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import {
  managementDataSourceReads,
  type ManagementDataSourceV2DTO,
  type SourceCommandReceipt,
} from "@/lib/bff-v1/managementDataSources";
import {
  fmtToken,
  formatTime,
  receiptStatusTone,
  toneClass,
} from "./dataSourceModels";

export interface DataSourceReceiptPanelProps {
  sources: ManagementDataSourceV2DTO[];
}

export function DataSourceReceiptPanel({ sources }: DataSourceReceiptPanelProps) {
  const { t } = useTranslation();
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    sources[0]?.source_instance_id || sources[0]?.connector_id || "",
  );
  const [receipts, setReceipts] = useState<SourceCommandReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      setSelectedSourceId(sources[0].source_instance_id || sources[0].connector_id);
    }
  }, [sources, selectedSourceId]);

  const loadReceipts = React.useCallback(async () => {
    if (!selectedSourceId) return;
    setLoading(true);
    try {
      const res = await managementDataSourceReads.receipts(selectedSourceId);
      setReceipts(res.receipts);
    } catch {
      // Keep state
    } finally {
      setLoading(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId) {
      loadReceipts();
    }
  }, [selectedSourceId, loadReceipts]);

  const filtered = receipts.filter((rcp) => {
    if (filterType === "all") return true;
    return rcp.command_type.toLowerCase() === filterType.toLowerCase();
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            {t("mgmt.dataSources.runs.selectSource")}:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {sources.map((s) => {
              const id = s.source_instance_id || s.connector_id;
              const isSelected = id === selectedSourceId;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-8 text-xs font-mono"
                  onClick={() => setSelectedSourceId(id)}
                >
                  {s.provider || id}
                </Button>
              );
            })}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={loadReceipts} disabled={loading} className="h-8">
          <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          {t("mgmt.actions.refresh")}
        </Button>
      </div>

      {/* Receipts Card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary" />
            {t("mgmt.dataSources.receipts.title")}
          </h3>
          <span className="text-xs text-muted-foreground">
            {t("mgmt.dataSources.receipts.immutableAuditNotice")}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("mgmt.dataSources.receipts.loadingReceipts")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            {t("mgmt.dataSources.receipts.noReceiptsFound")}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((rcp) => {
              const isExpanded = expandedReceiptId === rcp.receipt_id;
              return (
                <div
                  key={rcp.receipt_id}
                  className="p-3 rounded-lg border bg-card text-xs space-y-2 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setExpandedReceiptId(isExpanded ? null : rcp.receipt_id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <Badge variant="outline" className="font-mono font-medium">
                        {rcp.command_type}
                      </Badge>
                      <span className="font-mono text-muted-foreground text-[11px]">
                        {rcp.receipt_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={receiptStatusTone(rcp.status)}>
                        {rcp.status}
                      </Badge>
                      <span className="font-mono text-muted-foreground text-[11px]">
                        {formatTime(rcp.completed_at || rcp.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-muted-foreground pl-8">
                    <div>
                      Actor: <span className="text-foreground">{rcp.actor_id || "operator"}</span>
                    </div>
                    <div>
                      Revision:{" "}
                      <span className="text-foreground">
                        {rcp.before_revision ?? "—"} → {rcp.after_revision ?? "—"}
                      </span>
                    </div>
                    {rcp.readback && (
                      <div>
                        Readback:{" "}
                        <span className="text-foreground">
                          {rcp.readback.reconciliation_status || "converged"}
                        </span>
                      </div>
                    )}
                    {rcp.trace_id && (
                      <div className="truncate" title={rcp.trace_id}>
                        Trace: <span className="text-foreground">{rcp.trace_id}</span>
                      </div>
                    )}
                  </div>

                  {rcp.failure && (
                    <div className="ml-8 p-2 rounded bg-status-failed/10 border-status-failed/20 text-status-failed text-[11px]">
                      <span className="font-semibold">Failure ({rcp.failure.code || "ERROR"}): </span>
                      {rcp.failure.message}
                    </div>
                  )}

                  {/* Expanded JSON Inspector */}
                  {isExpanded && (
                    <div className="ml-8 pt-2 border-t space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        Receipt Payload (Redacted):
                      </span>
                      <pre className="p-2.5 rounded bg-muted font-mono text-[11px] overflow-x-auto max-h-[220px]">
                        {JSON.stringify(rcp, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
