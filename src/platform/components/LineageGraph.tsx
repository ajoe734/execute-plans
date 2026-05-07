// Lightweight DAG renderer for lineage — Part 7 §LineageGraph.
// Auto-layouts nodes by depth (BFS layer) and renders SVG. No external deps.
import { useMemo } from "react";
import type { RiskLevel } from "@/lib/bff/types";

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

const NODE_W = 168;
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
  edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1));

  const depth = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => { if ((incoming.get(n.id) ?? 0) === 0) { depth.set(n.id, 0); queue.push(n.id); } });

  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  });

  while (queue.length) {
    const u = queue.shift()!;
    const du = depth.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      depth.set(v, Math.max(depth.get(v) ?? 0, du + 1));
      queue.push(v);
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

  if (nodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No lineage available.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 overflow-auto">
      <svg width={Math.max(width, 600)} height={h} className="block">
        <defs>
          <marker id="lin-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = positions.get(e.from); const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2;
          const x2 = b.x; const y2 = b.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.25" markerEnd="url(#lin-arrow)" opacity={0.6} />
              {e.label && (
                <text x={cx} y={(y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle"
                  className="fill-muted-foreground" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id); if (!p) return null;
          const fill = n.risk ? riskFill[n.risk] : "hsl(var(--card))";
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}
               className={onSelect ? "cursor-pointer" : ""}
               onClick={() => onSelect?.(n)}>
              <rect width={NODE_W} height={NODE_H} rx={6}
                fill={fill}
                stroke={n.highlight ? "hsl(var(--primary))" : "hsl(var(--border))"}
                strokeWidth={n.highlight ? 1.6 : 1} />
              <text x={10} y={18} fontSize="10" className="fill-muted-foreground"
                style={{ fontFamily: "ui-monospace, monospace" }}>{n.type}{n.state ? ` · ${n.state}` : ""}</text>
              <text x={10} y={36} fontSize="12" className="fill-foreground" fontWeight={500}>
                {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
              </text>
              <text x={10} y={50} fontSize="10" className="fill-muted-foreground"
                style={{ fontFamily: "ui-monospace, monospace" }}>{n.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
