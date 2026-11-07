import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/i18n";
import { LineageGraph, NODE_PAD_X, NODE_W, fitText, placeEdgeLabels, type LineageEdge, type LineageNode } from "./LineageGraph";

// Real shape: rooted graph for strategy-persona-fd1281847a3b1c6a9735 — 10 nodes, 16 edges,
// labels parent/source_strategy_spec/source_run/persona/capital_pool, ids up to 60 chars.
const SUFFIX = "fd1281847a3b1c6a9735";
const ids = {
  root: `strategy-persona-${SUFFIX}`,
  baseline: `persona-provisioning-baseline-artifact-${SUFFIX}`,
  spec: `strategy-spec-${SUFFIX}`,
  run: `research-run-${SUFFIX}`,
  persona: `persona-${SUFFIX}`,
  pool: `capital-pool-${SUFFIX}`,
  a1: `artifact-persona-paper-${SUFFIX}`,
  a2: `artifact-execution-bundle-${SUFFIX}`,
  a3: `artifact-research-output-${SUFFIX}`,
  a4: `artifact-persona-paper-parent-${SUFFIX}`,
};
const rooted = (Object.values(ids)).map<LineageNode>((id, i) => ({
  id,
  label: i === 1 ? "persona-provisioning-baseline-artifact" : id.slice(0, 40),
  type: i % 2 ? "Artifact" : "Strategy",
  state: "approved",
}));
const e = (from: string, to: string, label: string): LineageEdge => ({ from, to, label });
const rootedEdges: LineageEdge[] = [
  e(ids.root, ids.baseline, "parent"), e(ids.root, ids.spec, "source_strategy_spec"),
  e(ids.root, ids.run, "source_run"), e(ids.root, ids.persona, "persona"),
  e(ids.root, ids.pool, "capital_pool"), e(ids.baseline, ids.a1, "parent"),
  e(ids.baseline, ids.a2, "source_strategy_spec"), e(ids.baseline, ids.a3, "source_run"),
  e(ids.spec, ids.a1, "source_strategy_spec"), e(ids.spec, ids.a2, "parent"),
  e(ids.run, ids.a3, "source_run"), e(ids.run, ids.a4, "parent"),
  e(ids.persona, ids.a1, "persona"), e(ids.persona, ids.a4, "persona"),
  e(ids.pool, ids.a2, "capital_pool"), e(ids.pool, ids.a3, "capital_pool"),
];

const charPx = (el: Element) => (el.getAttribute("style") ?? "").includes("monospace") ? 6.2 : 7.2;

beforeEach(() => {
  // jsdom has no layout: estimate with a deliberately generous per-character width.
  (SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = function (this: SVGElement) {
    return { x: 0, y: 0, width: (this.textContent ?? "").length * charPx(this), height: 12 };
  };
});
afterEach(cleanup);

const renderGraph = (nodes: LineageNode[], edges: LineageEdge[]) =>
  render(<I18nextProvider i18n={i18n}><LineageGraph nodes={nodes} edges={edges} /></I18nextProvider>);

describe("LineageGraph legibility", () => {
  it("keeps each secondary id inside its node rectangle (rooted real shape, ids up to 60 chars)", () => {
    expect(Math.max(...Object.values(ids).map((i) => i.length))).toBeGreaterThanOrEqual(46);
    const { container } = renderGraph(rooted, rootedEdges);
    const texts = container.querySelectorAll<SVGTextElement>("[data-node-secondary-id]");
    expect(texts.length).toBe(10);
    texts.forEach((t) => {
      const box = (t as unknown as SVGGraphicsElement).getBBox();
      expect(NODE_PAD_X + box.width).toBeLessThanOrEqual(NODE_W - NODE_PAD_X);
      expect(t.getAttribute("data-full-id")!.length).toBeGreaterThan(0);
    });
  });

  it("keeps secondary ids inside nodes in a default-size graph and shows a localized notice", () => {
    const longId = "persona-provisioning-baseline-artifact-fd1281847a3b1c6a9735";
    const nodes = Array.from({ length: 240 }, (_, i) => ({ id: `${longId}-${i}`, label: `node-${i}`, type: "Artifact" }));
    const edges = nodes.slice(1, 201).map((n, i) => ({ from: nodes[i].id, to: n.id, label: "parent" }));
    const { container, getByRole } = renderGraph(nodes, edges);
    container.querySelectorAll<SVGTextElement>("[data-node-secondary-id]").forEach((t) => {
      expect(NODE_PAD_X + (t as unknown as SVGGraphicsElement).getBBox().width).toBeLessThanOrEqual(NODE_W - NODE_PAD_X);
    });
    const notice = getByRole("status").textContent ?? "";
    expect(notice).not.toMatch(/virtualized rendering recommended/);
    expect(notice).toContain("240");
  });

  it("does not overprint parallel edge labels in the rooted ten-node fixture", () => {
    const { container } = renderGraph(rooted, rootedEdges);
    const labels = [...container.querySelectorAll<SVGTextElement>("[data-edge-label-text]")].map((t) => ({
      x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")),
      w: (t.textContent ?? "").length * 6.2,
    }));
    expect(labels.length).toBe(16);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const overlapX = Math.abs(labels[i].x - labels[j].x) < (labels[i].w + labels[j].w) / 2;
        const overlapY = Math.abs(labels[i].y - labels[j].y) < 12;
        expect(overlapX && overlapY, `labels ${i}/${j} overprint`).toBe(false);
      }
    }
  });

  it("placeEdgeLabels separates identical midpoints and fitText bounds output", () => {
    const placed = placeEdgeLabels([
      { key: 0, cx: 100, cy: 50, label: "parent" },
      { key: 1, cx: 100, cy: 50, label: "parent" },
    ]);
    expect(Math.abs(placed.get(0)!.y - placed.get(1)!.y)).toBeGreaterThanOrEqual(12);
    expect(fitText("x".repeat(80), 100, 6.2, true).length).toBeLessThanOrEqual(16);
    expect(fitText("short", 100, 6.2)).toBe("short");
  });
});

describe("LineageGraph edge labels stay in column gaps", () => {
  afterEach(() => cleanup());
  it("places long and multi-column edge labels outside every node rectangle (x-range)", () => {
    const ns: LineageNode[] = ["a", "b", "c"].map((id) => ({ id, label: id, type: "T" }));
    const es: LineageEdge[] = [
      { from: "a", to: "b", label: "source_strategy_spec" },
      { from: "b", to: "c", label: "capital_pool" },
      { from: "a", to: "c", label: "source_strategy_spec" },
    ];
    const { container } = render(<I18nextProvider i18n={i18n}><LineageGraph nodes={ns} edges={es} /></I18nextProvider>);
    const rects = [...container.querySelectorAll("[data-node-id]")].map((g) => {
      const m = /translate\(([-\d.]+),/.exec(g.getAttribute("transform") ?? "")!;
      const x = Number(m[1]);
      return [x, x + NODE_W];
    });
    const texts = [...container.querySelectorAll("[data-edge-label-text]")];
    expect(texts.length).toBe(3);
    for (const t of texts) {
      const cx = Number(t.getAttribute("x"));
      const half = (t.getAttribute("data-edge-label-text")!.length * 6.2) / 2;
      for (const [l, r] of rects) expect(cx + half <= l || cx - half >= r).toBe(true);
    }
  });
});
