import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/i18n";
import { LineageGraph, NODE_PAD_X, NODE_W, estimateTextPx, fitText, placeEdgeLabels, type LineageEdge, type LineageNode } from "./LineageGraph";

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

  it("localizes lineage edge types, node types, and node states via enumLabels while keeping raw type in data-node-type", async () => {
    await i18n.changeLanguage("zh-TW");
    const ns: LineageNode[] = [
      { id: "a", label: "Spec A", type: "Artifact", state: "approved" },
      { id: "b", label: "Strategy B", type: "Strategy", state: "deployed" },
    ];
    const es: LineageEdge[] = [{ from: "a", to: "b", label: "source_strategy_spec" }];
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <LineageGraph nodes={ns} edges={es} />
      </I18nextProvider>,
    );
    const edgeText = container.querySelector("[data-edge-label-text]");
    expect(edgeText?.textContent).toBe("來源策略規格");
    expect(container.querySelector('[data-testid="lineage-node-a"]')?.getAttribute("data-node-type")).toBe("Artifact");
    expect(container.querySelector('[data-testid="lineage-node-b"]')?.getAttribute("data-node-type")).toBe("Strategy");
    expect(container.textContent).toContain("產出物 · 已核准");
    expect(container.textContent).toContain("策略 · 已部署");
  });

  it("renders display_name with id as secondary text, falls back to plain kind plus short id when name_missing, translates node type headers, bounds CJK labels, and translates empty state", async () => {
    const LIVE_TOKEN = "a81b4fd15944698341aa";
    const LIVE_PERSONA_ID = "persona-ee7112a829d38b9135ac";
    const LIVE_STRATEGY_ID = `strategy-persona-${LIVE_TOKEN}`;
    const LIVE_ARTIFACT_ID = `artifact-persona-pool-${LIVE_TOKEN}-v2`;
    const LIVE_POOL_ID = `pool-persona-paper-${LIVE_TOKEN}`;
    const LIVE_STRATEGY_TITLE = "衡岳｜0050 台股 Paper 學習 R2";

    await i18n.changeLanguage("zh-TW");
    const ns: LineageNode[] = [
      {
        id: LIVE_PERSONA_ID,
        label: LIVE_PERSONA_ID,
        type: "Persona",
        display_name: "衡岳",
        name_missing: false,
      },
      {
        id: LIVE_ARTIFACT_ID,
        label: LIVE_ARTIFACT_ID,
        type: "Artifact",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.2.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
        highlight: true,
      },
      {
        id: LIVE_POOL_ID,
        label: LIVE_POOL_ID,
        type: "CapitalPool",
        display_name: null,
        name_missing: true,
      },
      {
        id: `persona-provisioning-forward-${LIVE_TOKEN}`,
        label: `persona-provisioning-forward-${LIVE_TOKEN}`,
        type: "Experiment",
        display_name: `${LIVE_STRATEGY_TITLE} (Experiment)`,
        name_missing: false,
      },
    ];
    const es: LineageEdge[] = [
      { from: LIVE_ARTIFACT_ID, to: LIVE_PERSONA_ID, label: "persona" },
      { from: LIVE_ARTIFACT_ID, to: LIVE_POOL_ID, label: "capital_pool" },
      { from: `persona-provisioning-forward-${LIVE_TOKEN}`, to: LIVE_ARTIFACT_ID, label: "source_run" },
    ];

    const { container, unmount } = renderGraph(ns, es);
    const personaNode = container.querySelector(`[data-testid="lineage-node-${LIVE_PERSONA_ID}"]`)!;
    expect(personaNode.querySelector("[data-node-label]")?.textContent).toBe("衡岳");
    expect(personaNode.querySelector("[data-node-secondary-id]")?.getAttribute("data-full-id")).toBe(LIVE_PERSONA_ID);

    const artNode = container.querySelector(`[data-testid="lineage-node-${LIVE_ARTIFACT_ID}"]`)!;
    expect(artNode.getAttribute("data-node-highlight")).toBe("true");
    expect(artNode.getAttribute("data-node-type")).toBe("Artifact");
    expect(artNode.querySelector("[data-node-type-header]")?.textContent).toBe("產出物 · 已核准");
    expect(artNode.querySelector("[data-node-label]")?.textContent).toContain("衡岳｜0050");

    const poolNode = container.querySelector(`[data-testid="lineage-node-${LIVE_POOL_ID}"]`)!;
    expect(poolNode.getAttribute("data-node-type")).toBe("CapitalPool");
    expect(poolNode.querySelector("[data-node-type-header]")?.textContent).toBe("資金池");
    expect(poolNode.querySelector("[data-node-label]")?.textContent).toBe("資金池 a81b4fd1");
    expect(poolNode.querySelector("[data-node-secondary-id]")?.getAttribute("data-full-id")).toBe(LIVE_POOL_ID);

    const expNode = container.querySelector(`[data-testid="lineage-node-persona-provisioning-forward-${LIVE_TOKEN}"]`)!;
    expect(expNode.getAttribute("data-node-type")).toBe("Experiment");
    expect(expNode.querySelector("[data-node-type-header]")?.textContent).toBe("實驗");

    // Every CJK primary label stays within the node width budget
    container.querySelectorAll<SVGTextElement>("[data-node-label]").forEach((el) => {
      expect(NODE_PAD_X + estimateTextPx(el.textContent ?? "", 7.2)).toBeLessThanOrEqual(NODE_W - NODE_PAD_X);
    });
    unmount();

    // Empty state translated in zh-TW and en-US
    const emptyZh = renderGraph([], []);
    expect(emptyZh.getByTestId("lineage-empty").textContent).toBe("尚無血緣資料。");
    emptyZh.unmount();

    await i18n.changeLanguage("en-US");
    const enGraph = renderGraph(ns, es);
    const enPoolNode = enGraph.container.querySelector(`[data-testid="lineage-node-${LIVE_POOL_ID}"]`)!;
    expect(enPoolNode.getAttribute("data-node-type")).toBe("CapitalPool");
    expect(enPoolNode.querySelector("[data-node-type-header]")?.textContent).toBe("Capital Pool");
    expect(enPoolNode.querySelector("[data-node-label]")?.textContent).toBe("Capital Pool a81b4fd1");
    enGraph.unmount();

    const emptyEn = renderGraph([], []);
    expect(emptyEn.getByTestId("lineage-empty").textContent).toBe("No lineage available.");
    emptyEn.unmount();
    await i18n.changeLanguage("zh-TW");
  });
});
