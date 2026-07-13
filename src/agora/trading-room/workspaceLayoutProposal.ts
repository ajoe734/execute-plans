import type {
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  WidgetPlacement,
  WorkspaceLayoutOperation,
} from "@/lib/bff-v1/agora/tradingRoomTypes";

const GRID_COLUMNS = 12;

export type WorkspaceLayoutIntentKind =
  | "risk_first"
  | "single_column"
  | "hide_technical_indicators";

export interface WorkspaceLayoutQuickIntent {
  kind: WorkspaceLayoutIntentKind;
  instruction: string;
  label: string;
}

export const WORKSPACE_LAYOUT_QUICK_INTENTS: readonly WorkspaceLayoutQuickIntent[] = [
  {
    kind: "risk_first",
    instruction: "Put risk and exposure widgets first in every view",
    label: "Risk first",
  },
  {
    kind: "single_column",
    instruction: "Stack every view in a single column",
    label: "Single column",
  },
  {
    kind: "hide_technical_indicators",
    instruction: "Hide technical indicator widgets",
    label: "Hide technical indicators",
  },
] as const;

// Kept as a descriptive alias for command surfaces that render these as text chips.
export const WORKSPACE_LAYOUT_QUICK_INSTRUCTIONS = WORKSPACE_LAYOUT_QUICK_INTENTS;

export interface WorkspaceLayoutProposalIntent {
  kind: WorkspaceLayoutIntentKind;
  summary: string;
}

export type WorkspaceLayoutProposalIssueCode =
  | "INSTRUCTION_REQUIRED"
  | "UNSUPPORTED_INTENT"
  | "AMBIGUOUS_INTENT"
  | "NO_VIEWS"
  | "DUPLICATE_VIEW_ID"
  | "DUPLICATE_WIDGET_ID"
  | "INVALID_PLACEMENT"
  | "OUT_OF_BOUNDS"
  | "OVERLAPPING_WIDGETS"
  | "NO_CHANGES";

export interface WorkspaceLayoutProposalValidationIssue {
  code: WorkspaceLayoutProposalIssueCode;
  message: string;
  viewId?: string;
  widgetId?: string;
}

export interface WorkspaceLayoutProposalValidation {
  valid: boolean;
  errors: WorkspaceLayoutProposalValidationIssue[];
  warnings: WorkspaceLayoutProposalValidationIssue[];
}

export interface WorkspaceLayoutProposalWidgetState {
  placement: WidgetPlacement;
  visible: boolean;
}

export type WorkspaceLayoutProposalChangeKind = "move" | "resize" | "hide" | "show";

export interface WorkspaceLayoutProposalChange {
  id: string;
  kind: WorkspaceLayoutProposalChangeKind;
  viewId: string;
  viewTitle: string;
  widgetId: string;
  widgetTitle: string;
  before: WorkspaceLayoutProposalWidgetState;
  after: WorkspaceLayoutProposalWidgetState;
  operation: WorkspaceLayoutOperation;
  summary: string;
}

export interface WorkspaceLayoutProposal {
  id: string;
  instruction: string;
  intent: WorkspaceLayoutProposalIntent | null;
  beforeViews: TradingRoomViewSpec[];
  afterViews: TradingRoomViewSpec[];
  changes: WorkspaceLayoutProposalChange[];
  operations: WorkspaceLayoutOperation[];
  validation: WorkspaceLayoutProposalValidation;
}

export interface BuildWorkspaceLayoutProposalInput {
  views: readonly TradingRoomViewSpec[];
  instruction: string;
  proposalId?: string;
}

interface IntentDefinition {
  intent: WorkspaceLayoutProposalIntent;
  matches: (instruction: string) => boolean;
  transform: (views: TradingRoomViewSpec[]) => TradingRoomViewSpec[];
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function proposalId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `layout-proposal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isVisible(widget: TradingRoomWidgetSpec): boolean {
  return widget.visible !== false;
}

function widgetSearchText(widget: TradingRoomWidgetSpec): string {
  return [widget.widgetType, widget.title, widget.purpose, widget.whyIncluded]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function isRiskWidget(widget: TradingRoomWidgetSpec): boolean {
  return /(risk|drawdown|exposure|position|alert|limit|風險|回撤|曝險|部位|警示|失效|上限)/iu.test(
    widgetSearchText(widget),
  );
}

function isTechnicalIndicatorWidget(widget: TradingRoomWidgetSpec): boolean {
  return /(technical|indicator|rsi|macd|moving.?average|momentum|技術|指標|均線|動能)/iu.test(
    widgetSearchText(widget),
  );
}

function sortedVisibleWidgets(view: TradingRoomViewSpec): TradingRoomWidgetSpec[] {
  const sourceOrder = new Map(view.widgets.map((widget, index) => [widget.id, index]));
  return view.widgets
    .filter(isVisible)
    .slice()
    .sort((left, right) => (
      left.placement.y - right.placement.y
      || left.placement.x - right.placement.x
      || (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0)
    ));
}

function packWidgets(widgets: readonly TradingRoomWidgetSpec[]): Map<string, Pick<WidgetPlacement, "x" | "y">> {
  const placements = new Map<string, Pick<WidgetPlacement, "x" | "y">>();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const widget of widgets) {
    const { width, height } = widget.placement;
    if (cursorX > 0 && cursorX + width > GRID_COLUMNS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    placements.set(widget.id, { x: cursorX, y: cursorY });
    cursorX += width;
    rowHeight = Math.max(rowHeight, height);
  }
  return placements;
}

function riskFirstViews(views: TradingRoomViewSpec[]): TradingRoomViewSpec[] {
  return views.map((view) => {
    const ordered = sortedVisibleWidgets(view);
    const riskWidgets = ordered.filter(isRiskWidget);
    const otherWidgets = ordered.filter((widget) => !isRiskWidget(widget));
    if (!riskWidgets.length || !otherWidgets.length) return view;

    const desiredOrder = [...riskWidgets, ...otherWidgets];
    const alreadyRiskFirst = desiredOrder.every((widget, index) => widget.id === ordered[index]?.id);
    if (alreadyRiskFirst) return view;

    const packed = packWidgets(desiredOrder);
    return {
      ...view,
      widgets: view.widgets.map((widget) => {
        const next = packed.get(widget.id);
        if (!next) return widget;
        return { ...widget, placement: { ...widget.placement, ...next } };
      }),
    };
  });
}

function singleColumnViews(views: TradingRoomViewSpec[]): TradingRoomViewSpec[] {
  return views.map((view) => {
    const placements = new Map<string, WidgetPlacement>();
    let cursorY = 0;
    for (const widget of sortedVisibleWidgets(view)) {
      const minimumWidth = Math.max(
        1,
        widget.placement.minWidth,
        widget.minSize?.width ?? 1,
      );
      const maximumWidth = Math.min(
        GRID_COLUMNS,
        widget.placement.maxWidth ?? GRID_COLUMNS,
        widget.maxSize?.width ?? GRID_COLUMNS,
      );
      const width = Math.max(minimumWidth, maximumWidth);
      placements.set(widget.id, {
        ...widget.placement,
        width,
        x: 0,
        y: cursorY,
      });
      cursorY += widget.placement.height;
    }
    return {
      ...view,
      widgets: view.widgets.map((widget) => {
        const placement = placements.get(widget.id);
        return placement ? { ...widget, placement } : widget;
      }),
    };
  });
}

function hideTechnicalIndicatorViews(views: TradingRoomViewSpec[]): TradingRoomViewSpec[] {
  return views.map((view) => ({
    ...view,
    widgets: view.widgets.map((widget) => (
      isVisible(widget) && isTechnicalIndicatorWidget(widget)
        ? { ...widget, visible: false }
        : widget
    )),
  }));
}

const INTENT_DEFINITIONS: readonly IntentDefinition[] = [
  {
    intent: {
      kind: "risk_first",
      summary: "Prioritize risk and exposure widgets in each view.",
    },
    matches: (instruction) => (
      /(?:risk|exposure|drawdown|風險|曝險|回撤).{0,28}(?:first|top|priority|prioriti[sz]e|優先|最前|置頂|上方)/iu.test(instruction)
      || /(?:first|top|priority|prioriti[sz]e|優先|最前|置頂|上方).{0,28}(?:risk|exposure|drawdown|風險|曝險|回撤)/iu.test(instruction)
    ),
    transform: riskFirstViews,
  },
  {
    intent: {
      kind: "single_column",
      summary: "Stack visible widgets into one column in every view.",
    },
    matches: (instruction) => (
      /single[\s-]?column|one[\s-]?column|stack(?:ed)?\s+vertically|單欄|單一欄|垂直(?:排列|堆疊)/iu.test(instruction)
    ),
    transform: singleColumnViews,
  },
  {
    intent: {
      kind: "hide_technical_indicators",
      summary: "Hide visible technical-indicator widgets in every view.",
    },
    matches: (instruction) => (
      /(?:hide|remove|隱藏|移除|拿掉).{0,28}(?:technical|indicator|rsi|macd|技術|指標|均線)/iu.test(instruction)
      || /(?:technical|indicator|rsi|macd|技術|指標|均線).{0,28}(?:hide|remove|隱藏|移除|拿掉)/iu.test(instruction)
    ),
    transform: hideTechnicalIndicatorViews,
  },
];

function placementIssue(
  code: WorkspaceLayoutProposalIssueCode,
  message: string,
  viewId: string,
  widgetId: string,
): WorkspaceLayoutProposalValidationIssue {
  return { code, message, viewId, widgetId };
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validatePlacement(
  view: TradingRoomViewSpec,
  widget: TradingRoomWidgetSpec,
): WorkspaceLayoutProposalValidationIssue[] {
  const placement = widget.placement;
  if (!placement || !nonNegativeInteger(placement.x) || !nonNegativeInteger(placement.y)) {
    return [placementIssue(
      "INVALID_PLACEMENT",
      `Widget ${widget.id} must have non-negative integer x/y coordinates.`,
      view.id,
      widget.id,
    )];
  }

  const requiredSizes = [
    placement.width,
    placement.height,
    placement.minWidth,
    placement.minHeight,
    widget.minSize?.width,
    widget.minSize?.height,
    widget.maxSize?.width,
    widget.maxSize?.height,
  ];
  const optionalSizes = [placement.maxWidth, placement.maxHeight].filter((value) => value !== undefined);
  if (![...requiredSizes, ...optionalSizes].every(positiveInteger)) {
    return [placementIssue(
      "INVALID_PLACEMENT",
      `Widget ${widget.id} must have positive integer size constraints.`,
      view.id,
      widget.id,
    )];
  }

  const widgetMinimumWidth = widget.minSize?.width;
  const widgetMinimumHeight = widget.minSize?.height;
  const widgetMaximumWidth = widget.maxSize?.width;
  const widgetMaximumHeight = widget.maxSize?.height;
  if (
    !positiveInteger(widgetMinimumWidth)
    || !positiveInteger(widgetMinimumHeight)
    || !positiveInteger(widgetMaximumWidth)
    || !positiveInteger(widgetMaximumHeight)
  ) {
    return [placementIssue(
      "INVALID_PLACEMENT",
      `Widget ${widget.id} must declare complete minimum and maximum sizes.`,
      view.id,
      widget.id,
    )];
  }

  const minimumWidth = Math.max(placement.minWidth, widgetMinimumWidth as number);
  const minimumHeight = Math.max(placement.minHeight, widgetMinimumHeight as number);
  const maximumWidth = Math.min(placement.maxWidth ?? GRID_COLUMNS, widgetMaximumWidth as number, GRID_COLUMNS);
  const maximumHeight = Math.min(placement.maxHeight ?? (widgetMaximumHeight as number), widgetMaximumHeight as number);

  if (
    minimumWidth > maximumWidth
    || minimumHeight > maximumHeight
    || placement.width < minimumWidth
    || placement.width > maximumWidth
    || placement.height < minimumHeight
    || placement.height > maximumHeight
  ) {
    return [placementIssue(
      "INVALID_PLACEMENT",
      `Widget ${widget.id} placement violates its minimum or maximum size.`,
      view.id,
      widget.id,
    )];
  }

  if (placement.x + placement.width > GRID_COLUMNS) {
    return [placementIssue(
      "OUT_OF_BOUNDS",
      `Widget ${widget.id} exceeds the ${GRID_COLUMNS}-column workspace boundary.`,
      view.id,
      widget.id,
    )];
  }
  return [];
}

function overlaps(left: WidgetPlacement, right: WidgetPlacement): boolean {
  return (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  );
}

function validateViews(views: readonly TradingRoomViewSpec[]): WorkspaceLayoutProposalValidationIssue[] {
  const errors: WorkspaceLayoutProposalValidationIssue[] = [];
  if (!views.length) {
    errors.push({ code: "NO_VIEWS", message: "A workspace layout proposal requires at least one view." });
    return errors;
  }

  const seenViews = new Set<string>();
  const seenWidgets = new Set<string>();
  for (const view of views) {
    if (!view || typeof view !== "object") {
      errors.push({ code: "INVALID_PLACEMENT", message: "Every workspace view must be a complete object." });
      continue;
    }
    if (!view.id || seenViews.has(view.id)) {
      errors.push({
        code: "DUPLICATE_VIEW_ID",
        message: `View id ${view.id || "(empty)"} must be unique.`,
        viewId: view.id,
      });
    }
    seenViews.add(view.id);

    if (!Array.isArray(view.widgets)) {
      errors.push({
        code: "INVALID_PLACEMENT",
        message: `View ${view.id || "(empty)"} must contain a widgets array.`,
        viewId: view.id,
      });
      continue;
    }

    for (const widget of view.widgets) {
      if (!widget || typeof widget !== "object") {
        errors.push({
          code: "INVALID_PLACEMENT",
          message: `View ${view.id || "(empty)"} contains an incomplete widget.`,
          viewId: view.id,
        });
        continue;
      }
      if (!widget.id || seenWidgets.has(widget.id)) {
        errors.push({
          code: "DUPLICATE_WIDGET_ID",
          message: `Widget id ${widget.id || "(empty)"} must be unique across the whole workspace.`,
          viewId: view.id,
          widgetId: widget.id,
        });
      }
      seenWidgets.add(widget.id);
      errors.push(...validatePlacement(view, widget));
    }

    const visibleWidgets = view.widgets.filter((widget): widget is TradingRoomWidgetSpec => Boolean(widget && typeof widget === "object")).filter(isVisible);
    for (let leftIndex = 0; leftIndex < visibleWidgets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleWidgets.length; rightIndex += 1) {
        const left = visibleWidgets[leftIndex];
        const right = visibleWidgets[rightIndex];
        if (left.placement && right.placement && overlaps(left.placement, right.placement)) {
          errors.push({
            code: "OVERLAPPING_WIDGETS",
            message: `Widgets ${left.id} and ${right.id} overlap in view ${view.id}.`,
            viewId: view.id,
            widgetId: right.id,
          });
        }
      }
    }
  }
  return errors;
}

function widgetState(widget: TradingRoomWidgetSpec): WorkspaceLayoutProposalWidgetState {
  return {
    placement: cloneValue(widget.placement),
    visible: isVisible(widget),
  };
}

function deriveChanges(
  beforeViews: readonly TradingRoomViewSpec[],
  afterViews: readonly TradingRoomViewSpec[],
): WorkspaceLayoutProposalChange[] {
  const afterWidgets = new Map<string, { view: TradingRoomViewSpec; widget: TradingRoomWidgetSpec }>();
  for (const view of afterViews) {
    for (const widget of view.widgets) afterWidgets.set(widget.id, { view, widget });
  }

  const changes: WorkspaceLayoutProposalChange[] = [];
  for (const beforeView of beforeViews) {
    for (const beforeWidget of beforeView.widgets) {
      const match = afterWidgets.get(beforeWidget.id);
      if (!match) continue;
      const afterWidget = match.widget;
      const before = widgetState(beforeWidget);
      const after = widgetState(afterWidget);
      const moved = before.placement.x !== after.placement.x || before.placement.y !== after.placement.y;
      const resized = before.placement.width !== after.placement.width || before.placement.height !== after.placement.height;

      if (before.visible !== after.visible) {
        const kind: WorkspaceLayoutProposalChangeKind = after.visible ? "show" : "hide";
        const operation: WorkspaceLayoutOperation = after.visible
          ? { kind: "add_registered_widget", payload: { widgetId: beforeWidget.id } }
          : { kind: "remove_widget", widgetId: beforeWidget.id, payload: {} };
        changes.push({
          id: `${beforeView.id}:${beforeWidget.id}:${kind}`,
          kind,
          viewId: beforeView.id,
          viewTitle: beforeView.title,
          widgetId: beforeWidget.id,
          widgetTitle: beforeWidget.title,
          before,
          after,
          operation,
          summary: `${after.visible ? "Show" : "Hide"} ${beforeWidget.title} in ${beforeView.title}.`,
        });
      }
      if (moved) {
        const operation: WorkspaceLayoutOperation = {
          kind: "move_widget",
          widgetId: beforeWidget.id,
          payload: { x: after.placement.x, y: after.placement.y },
        };
        changes.push({
          id: `${beforeView.id}:${beforeWidget.id}:move`,
          kind: "move",
          viewId: beforeView.id,
          viewTitle: beforeView.title,
          widgetId: beforeWidget.id,
          widgetTitle: beforeWidget.title,
          before,
          after,
          operation,
          summary: `Move ${beforeWidget.title} from (${before.placement.x}, ${before.placement.y}) to (${after.placement.x}, ${after.placement.y}).`,
        });
      }
      if (resized) {
        const operation: WorkspaceLayoutOperation = {
          kind: "resize_widget",
          widgetId: beforeWidget.id,
          payload: { width: after.placement.width, height: after.placement.height },
        };
        changes.push({
          id: `${beforeView.id}:${beforeWidget.id}:resize`,
          kind: "resize",
          viewId: beforeView.id,
          viewTitle: beforeView.title,
          widgetId: beforeWidget.id,
          widgetTitle: beforeWidget.title,
          before,
          after,
          operation,
          summary: `Resize ${beforeWidget.title} from ${before.placement.width}×${before.placement.height} to ${after.placement.width}×${after.placement.height}.`,
        });
      }
    }
  }
  return changes;
}

function invalidProposal(
  id: string,
  instruction: string,
  intent: WorkspaceLayoutProposalIntent | null,
  beforeViews: TradingRoomViewSpec[],
  errors: WorkspaceLayoutProposalValidationIssue[],
): WorkspaceLayoutProposal {
  return {
    id,
    instruction,
    intent,
    beforeViews,
    afterViews: cloneValue(beforeViews),
    changes: [],
    operations: [],
    validation: { valid: false, errors, warnings: [] },
  };
}

export function buildWorkspaceLayoutProposal({
  instruction,
  proposalId: requestedProposalId,
  views,
}: BuildWorkspaceLayoutProposalInput): WorkspaceLayoutProposal {
  const id = requestedProposalId ?? proposalId();
  const normalizedInstruction = typeof instruction === "string" ? instruction.trim() : "";
  const beforeViews = cloneValue(Array.isArray(views) ? views : []);

  if (!normalizedInstruction) {
    return invalidProposal(id, normalizedInstruction, null, beforeViews, [{
      code: "INSTRUCTION_REQUIRED",
      message: "Describe a supported workspace layout change before generating a proposal.",
    }]);
  }

  const matches = INTENT_DEFINITIONS.filter((definition) => definition.matches(normalizedInstruction));
  if (!matches.length) {
    return invalidProposal(id, normalizedInstruction, null, beforeViews, [{
      code: "UNSUPPORTED_INTENT",
      message: "The instruction is outside the allowlisted workspace layout intents.",
    }]);
  }
  if (matches.length > 1) {
    return invalidProposal(id, normalizedInstruction, null, beforeViews, [{
      code: "AMBIGUOUS_INTENT",
      message: "The instruction matches multiple layout intents; request one layout change at a time.",
    }]);
  }

  const definition = matches[0];
  const beforeErrors = validateViews(beforeViews);
  if (beforeErrors.length) {
    return invalidProposal(id, normalizedInstruction, definition.intent, beforeViews, beforeErrors);
  }

  const afterViews = definition.transform(cloneValue(beforeViews));
  const changes = deriveChanges(beforeViews, afterViews);
  if (!changes.length) {
    return invalidProposal(id, normalizedInstruction, definition.intent, beforeViews, [{
      code: "NO_CHANGES",
      message: "The requested layout is already satisfied or has no matching widgets.",
    }]);
  }

  const afterErrors = validateViews(afterViews);
  const valid = afterErrors.length === 0;
  return {
    id,
    instruction: normalizedInstruction,
    intent: definition.intent,
    beforeViews,
    afterViews,
    changes,
    operations: valid ? changes.map((change) => cloneValue(change.operation)) : [],
    validation: {
      valid,
      errors: afterErrors,
      warnings: [],
    },
  };
}
