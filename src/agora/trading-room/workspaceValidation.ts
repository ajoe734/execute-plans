import type { TradingRoomWidgetSpec } from "@/lib/bff-v1/agora/types";
import {
  getWidgetRegistryEntry,
  isBlockedInteractionKind,
  isWidgetInteractionKind,
  validateChartSpecGrammar,
} from "@/agora/widgets/registry";

export interface TradingRoomWidgetValidation {
  ok: boolean;
  title: string;
  messages: string[];
}

function sensitivityRank(value: TradingRoomWidgetSpec["sensitivity"]): number {
  if (value === "public_market") return 0;
  if (value === "user_private") return 1;
  if (value === "restricted") return 3;
  return 2;
}

export function formatSensitivityLabel(value: TradingRoomWidgetSpec["sensitivity"]): string {
  if (value === "public_market") return "公開市場";
  if (value === "user_private") return "使用者私有";
  if (value === "restricted") return "嚴格受限";
  return "受限資料";
}

export function safeWarningText(value: string): string {
  return value
    .replace(/runtime\s*bindings?/giu, "後台執行狀態")
    .replace(/management/giu, "系統治理")
    .replace(new RegExp(["bro", "ker"].join(""), "giu"), "外部連線")
    .replace(/capital\s*binding/giu, "資金連動")
    .replace(/direct\s*orders?/giu, "交易執行");
}

export function validateTradingRoomWidgetSpec(widget: TradingRoomWidgetSpec): TradingRoomWidgetValidation {
  const entry = getWidgetRegistryEntry(widget.widgetType);
  if (!entry) {
    return {
      ok: false,
      title: "Widget type 未註冊",
      messages: [`${widget.widgetType} 不在 Agora widget registry。`],
    };
  }

  const messages: string[] = [];
  if (entry.status !== "active") {
    messages.push(`${entry.display_name} 目前不是 active widget。`);
  }
  if (!entry.allowed_data_sources.includes(widget.dataSource)) {
    messages.push(`${widget.dataSource} 不是 ${entry.display_name} 的允許 data source。`);
  }

  const grammarFailure = validateChartSpecGrammar(widget.chartSpec);
  if (grammarFailure) {
    messages.push(grammarFailure.message);
  } else if (!entry.allowed_chart_kinds.includes(widget.chartSpec.kind)) {
    messages.push(`${widget.chartSpec.kind} 不是 ${entry.display_name} 的允許 ChartSpec kind。`);
  }

  for (const transform of widget.chartSpec.transforms ?? []) {
    if (!entry.allowed_transforms.includes(transform.type)) {
      messages.push(`${transform.type} 不是 ${entry.display_name} 的允許 transform。`);
    }
  }

  const interactions = [...(widget.interactions ?? []), widget.chartSpec.click_action].filter(Boolean);
  for (const interaction of interactions) {
    const kind = interaction?.kind;
    if (!isWidgetInteractionKind(kind) || isBlockedInteractionKind(kind) || !entry.allowed_interactions.includes(kind)) {
      messages.push(`${String(kind)} 不是 ${entry.display_name} 的允許 interaction。`);
    }
  }

  if (sensitivityRank(widget.sensitivity) < sensitivityRank(entry.sensitivity)) {
    messages.push(`${entry.display_name} 需要 ${formatSensitivityLabel(entry.sensitivity)}，proposal 降為 ${formatSensitivityLabel(widget.sensitivity)}。`);
  }

  return {
    ok: messages.length === 0,
    title: entry.display_name,
    messages,
  };
}
