export type DataAvailabilityStatus = "complete" | "partial" | "unavailable";

export type ChartSpecKind =
  | "metric"
  | "table"
  | "line"
  | "area"
  | "bar"
  | "stacked_bar"
  | "heatmap"
  | "scatter"
  | "network"
  | "timeline"
  | "sankey"
  | "candlestick"
  | "gauge";

export type ChartEncodingType = "nominal" | "ordinal" | "quantitative" | "temporal" | "geo" | "boolean";

export type ChartTransformType =
  | "filter"
  | "sort"
  | "top_k"
  | "aggregate"
  | "window"
  | "rolling_mean"
  | "rolling_sum"
  | "percent_change"
  | "rank"
  | "percentile"
  | "normalize"
  | "winsorize"
  | "zscore"
  | "bucket"
  | "time_bucket"
  | "join_by_key";

export type WidgetInteractionKind =
  | "open_candidate"
  | "open_strategy"
  | "open_position"
  | "open_evidence"
  | "open_research_run"
  | "open_shadow_record"
  | "filter_workspace"
  | "cross_highlight"
  | "add_to_monitoring"
  | "remove_from_monitoring"
  | "park_candidate"
  | "request_more_research"
  | "send_to_shadow"
  | "request_widget_revision"
  | "create_journal_note";

export interface ChartEncoding {
  field: string;
  type: ChartEncodingType;
  aggregate?: string;
  format?: string;
  label?: string;
}

export interface ChartSpecV1 {
  spec_version: "1.0";
  kind: ChartSpecKind;
  encodings: Record<string, ChartEncoding>;
  transforms?: Array<{ type: ChartTransformType; [key: string]: unknown }>;
  tooltip_fields?: string[];
  thresholds?: unknown[];
  click_action?: {
    kind: WidgetInteractionKind;
    payload?: Record<string, unknown>;
  };
  options?: Record<string, unknown>;
}

export interface WidgetPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WidgetSize {
  width: number;
  height: number;
}

export interface TradingRoomWidgetSpec {
  id: string;
  widgetType: string;
  title: string;
  purpose: string;
  whyIncluded: string;
  dataSource: string;
  query: {
    filters: Record<string, unknown>;
    sort?: Record<string, "asc" | "desc">;
    limit?: number;
    window?: string;
  };
  chartSpec: ChartSpecV1;
  interactions: Array<{
    kind: WidgetInteractionKind;
    payload?: Record<string, unknown>;
  }>;
  placement: WidgetPlacement;
  minSize: WidgetSize;
  maxSize: WidgetSize;
  sensitivity: "public_market" | "user_private" | "broker_sensitive" | "restricted";
  visible?: boolean;
}

export interface TradingRoomViewSpec {
  id: string;
  title: string;
  purpose: string;
  order: number;
  layoutTemplate: string;
  thumbnailRef?: string;
  widgetCount: number;
  rationale?: string;
  dataAvailability?: DataAvailabilityStatus;
  warnings?: string[];
  widgets: TradingRoomWidgetSpec[];
}

export interface DataAvailabilitySummary {
  status: DataAvailabilityStatus;
  sources: Array<{
    dataSource: string;
    status: DataAvailabilityStatus;
    reason?: string;
  }>;
}

export interface PersonalizationSummary {
  status: "applied" | "not_applied";
  items: Array<{
    key: string;
    value: unknown;
  }>;
}

export interface TradingRoomWorkspaceProposal {
  strategyId: string;
  strategyVersion: string;
  proposalId: string;
  generatedAt: string;
  status: "generating" | "preview" | "accepted" | "cancelled" | "superseded";
  views: TradingRoomViewSpec[];
  rationale: string;
  dataAvailability: DataAvailabilitySummary;
  warnings: string[];
  personalizationApplied: PersonalizationSummary;
}

export interface TradingRoomWorkspace {
  id: string;
  userId: string;
  strategyId: string;
  strategyVersion: string;
  dashboardVersion: number;
  activeViewId: string;
  views: TradingRoomViewSpec[];
  status: "generating" | "preview" | "editing" | "active" | "stale" | "archived";
  generatedBy: "trading_servant" | "user_modified" | "learned_personalization";
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceLayoutOperation {
  kind:
    | "move_widget"
    | "resize_widget"
    | "remove_widget"
    | "add_registered_widget"
    | "replace_chart_spec"
    | "update_widget_query";
  widgetId?: string;
  payload: Record<string, unknown>;
}

export interface WidgetRevisionProposal {
  id: string;
  workspaceId: string;
  viewId: string;
  widgetId: string;
  instruction: string;
  beforeSpec: TradingRoomWidgetSpec;
  proposedSpec: TradingRoomWidgetSpec;
  rationale: string;
  warnings: string[];
  dataAvailability: DataAvailabilityStatus;
  status: "preview" | "accepted" | "rejected" | "superseded";
}

export interface WorkspaceChangeLogEntry {
  changedAt: string;
  changedBy: string;
  reason: string;
  affectedViews: string[];
  affectedWidgets: string[];
  effectEvaluation: string;
  rollbackAvailable: boolean;
  sourceRevisionProposalId?: string | null;
  rollbackOfVersionId?: string | null;
}

export interface TradingRoomDashboardVersion {
  id: string;
  userId: string;
  strategyId: string;
  strategyVersion: string;
  dashboardVersion: number;
  generatedBy: "trading_servant" | "user_modified" | "learned_personalization";
  previousVersionId: string | null;
  changeSummary: string;
  views: TradingRoomViewSpec[];
  createdAt: string;
  status: "active" | "superseded" | "rolled_back" | "archived";
  changeLog: WorkspaceChangeLogEntry;
}
