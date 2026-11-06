// Lightweight DAG renderer for lineage — Part 7 §LineageGraph.
// Auto-layouts nodes by depth (BFS layer) and renders SVG. No external deps.
import { useMemo } from "react";
import type { RiskLevel } from "@/lib/bff-v1";
import { LINEAGE_NODE_LIMITS } from "@/lib/v4/uiBudgets";
import { useT } from "@/platform/hooks";

export interface LineageNode {
  id: string;
  label: string;
  type: string;          // e.g. "Strategy"
  state?: string;
  risk?: RiskLevel;
  highlight?: boolean;
}
export interface LineageEdge {
  from: string;
  to: string;
  label?: string;
}

interface Props {
  nodes: LineageNode[];
  edges: LineageEdge[];
  height?: number;
  onSelect?: (n: LineageNode) => void;
}

export const NODE_W = 248;
/** Horizontal padding inside a node; text must fit within NODE_W - 2 * NODE_PAD_X. */
export const NODE_PAD_X = 10;
const LABEL_CHAR_PX = 7.2;   // 12px proportional/CJK-safe upper bound
const MONO_CHAR_PX = 6.2;    // 10px monospace upper bound
const EDGE_LABEL_H = 12;
const EDGE_LABEL_CHAR_PX = 6.2;

/** Truncate with a trailing ellipsis so estimated width fits `maxPx`. */
export function fitText(text: string, maxPx: number, charPx: number, middle = false): string {
  const max = Math.max(4, Math.floor(maxPx / charPx));
  if (text.length <= max) return text;
  if (!middle) return text.slice(0, max - 1) + "…";
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return text.slice(0, head) + "…" + text.slice(text.length - tail);
}

/** Place edge labels at curve midpoints, nudging vertically until no two overlap. */
export function placeEdgeLabels(
  items: { key: number; cx: number; cy: number; label: string }[],
): Map<number, { x: number; y: number }> {
  const placed: { x: number; y: number; w: number }[] = [];
  const out = new Map<number, { x: number; y: number }>();
  for (const it of items) {
    const w = it.label.length * EDGE_LABEL_CHAR_PX;
    let y = it.cy - 4;
    for (let step = 0; step < 200; step++) {
      const hit = placed.some((q) => Math.abs(q.x - it.cx) < (q.w + w) / 2 + 2 && Math.abs(q.y - y) < EDGE_LABEL_H);
      if (!hit) break;
      // alternate below/above: +h, -h, +2h, -2h ...
      const k = Math.floor(step / 2) + 1;
      y = it.cy - 4 + (step % 2 === 0 ? 1 : -1) * k * EDGE_LABEL_H;
    }
    placed.push({ x: it.cx, y, w });
    out.set(it.key, { x: it.cx, y });
  }
  return out;
}
const NODE_H = 56;
const COL_GAP = 64;
const ROW_GAP = 24;

const riskFill: Record<RiskLevel, string> = {
  info: "hsl(var(--muted) / 0.30)",
  low: "hsl(var(--status-success) / 0.10)",
  medium: "hsl(var(--status-warning) / 0.12)",
  high: "hsl(var(--status-failed) / 0.10)",
  critical: "hsl(var(--destructive) / 0.14)",
};

function layout(nodes: LineageNode[], edges: LineageEdge[]) {
  // Compute depth = longest path from a root to this node.
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => {
    if (incoming.has(e.from) && incoming.has(e.to)) {
      incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    }
  });

  const depth = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => { if ((incoming.get(n.id) ?? 0) === 0) { depth.set(n.id, 0); queue.push(n.id); } });

  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  });

  const maxDepth = Math.max(nodes.length, 1);
  while (queue.length) {
    const u = queue.shift()!;
    const du = depth.get(u) ?? 0;
    if (du >= maxDepth) continue;
    for (const v of adj.get(u) ?? []) {
      if (!incoming.has(v)) continue;
      if (du + 1 > (depth.get(v) ?? -1)) {
        depth.set(v, du + 1);
        queue.push(v);
      }
    }
  }
  // Fallback for cycles / disconnected
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });

  // Group by depth
  const layers = new Map<number, LineageNode[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(n);
  });

  const positions = new Map<string, { x: number; y: number }>();
  let width = 0, height = 0;
  [...layers.keys()].sort((a, b) => a - b).forEach((d) => {
    const col = layers.get(d)!;
    const x = d * (NODE_W + COL_GAP) + 16;
    col.forEach((n, i) => {
      const y = i * (NODE_H + ROW_GAP) + 16;
      positions.set(n.id, { x, y });
      width = Math.max(width, x + NODE_W + 16);
      height = Math.max(height, y + NODE_H + 16);
    });
  });
  return { positions, width, height };
}

export const LineageGraph = ({ nodes, edges, height: minH = 280, onSelect }: Props) => {
  const { positions, width, height } = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const h = Math.max(minH, height);
  const t = useT();
  const textMaxPx = NODE_W - 2 * NODE_PAD_X;

  const labelPos = useMemo(() => {
    const items: { key: number; cx: number; cy: number; label: string }[] = [];
    edges.forEach((e, i) => {
      const a = positions.get(e.from); const b = positions.get(e.to);
      if (!a || !b || !e.label) return;
      items.push({
        key: i,
        cx: (a.x + NODE_W + b.x) / 2,
        cy: (a.y + b.y) / 2 + NODE_H / 2,
        label: e.label,
      });
    });
    return placeEdgeLabels(items);
  }, [edges, positions]);

  if (nodes.length === 0) {
    return (
      <div
        data-testid="lineage-empty"
        className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
      >
        No lineage available.
      </div>
    );
  }

  // Planner Response §E15 — node-limit budget warnings.
  const overClient = nodes.length > LINEAGE_NODE_LIMITS.clientLayoutMax;
  const overServer = nodes.length > LINEAGE_NODE_LIMITS.serverLayoutThreshold;

  return (
    <div data-testid="lineage-graph" className="rounded-md border border-border bg-muted/20 overflow-auto">
      {(overClient || overServer) && (
        <div
          role="status"
          className={`px-3 py-2 text-xs border-b ${overServer
            ? "bg-status-failed/10 text-status-failed border-status-failed/30"
            : "bg-status-warning/10 text-status-warning border-status-warning/30"}`}
        >
          {overServer
            ? t("lineage.overServerNotice", {
                count: nodes.length,
                limit: LINEAGE_NODE_LIMITS.serverLayoutThreshold,
                defaultValue: "This lineage has {{count}} nodes (more than {{limit}}). Use the server-side clustered summary view instead.",
              })
            : t("lineage.overClientNotice", {
                count: nodes.length,
                limit: LINEAGE_NODE_LIMITS.clientLayoutMax,
                defaultValue: "This lineage has {{count}} nodes (more than {{limit}}) and may render slowly. Narrow the scope or pick a root node.",
              })}
        </div>
      )}
      <svg width={Math.max(width, 600)} height={h} className="block">
        <defs>
          <marker id="lin-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = positions.get(e.from); const b = positions.get(e.to);
          if (!a || !b) return null;
          const lp = labelPos.get(i);
          const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2;
          const x2 = b.x; const y2 = b.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
          return (
            <g
              key={i}
              data-testid={`lineage-edge-${e.from}-${e.to}`}
              data-edge-from={e.from}
              data-edge-to={e.to}
              data-edge-label={e.label ?? ""}
            >
              <path d={d} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.25" markerEnd="url(#lin-arrow)" opacity={0.6} />
              {e.label && (
                <text x={lp?.x ?? cx} y={lp?.y ?? (y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle"
                  data-edge-label-text={e.label}
                  stroke="hsl(var(--background))" strokeWidth={3} paintOrder="stroke"
                  className="fill-muted-foreground" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id); if (!p) return null;
          const fill = n.risk ? (riskFill[n.risk] ?? "hsl(var(--card))") : "hsl(var(--card))";
          const typeLabel = n.type || "unknown";
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}
               data-testid={`lineage-node-${n.id}`}
               data-node-id={n.id}
               data-node-type={typeLabel}
               data-node-state={n.state ?? ""}
               data-node-risk={n.risk ?? ""}
               className={onSelect ? "cursor-pointer" : ""}
               onClick={() => onSelect?.(n)}>
              <rect width={NODE_W} height={NODE_H} rx={6}
                fill={fill}
                stroke={n.highlight ? "hsl(var(--primary))" : "hsl(var(--border))"}
                strokeWidth={n.highlight ? 1.6 : 1} />
              <title>{`${n.label}\n${n.id}`}</title>
              <text x={NODE_PAD_X} y={18} fontSize="10" className="fill-muted-foreground"
                style={{ fontFamily: "ui-monospace, monospace" }}>{fitText(`${typeLabel}${n.state ? ` · ${n.state}` : ""}`, textMaxPx, MONO_CHAR_PX)}</text>
              <text x={NODE_PAD_X} y={36} fontSize="12" className="fill-foreground" fontWeight={500}
                data-node-label>
                {fitText(n.label, textMaxPx, LABEL_CHAR_PX)}
              </text>
              <text x={NODE_PAD_X} y={50} fontSize="10" className="fill-muted-foreground"
                data-node-secondary-id data-full-id={n.id}
                style={{ fontFamily: "ui-monospace, monospace" }}>{fitText(n.id, textMaxPx, MONO_CHAR_PX, true)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
