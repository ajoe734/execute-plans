import { describe, expect, it } from "vitest";

import { PANEL_EDGE, normalizePanelState } from "./useAgentPanel";

describe("normalizePanelState", () => {
  it("clamps stale oversized saved panels into the viewport", () => {
    const panel = normalizePanelState(
      { mode: "normal", x: -420, y: 900, w: 1800, h: 1100 },
      { width: 1200, height: 800 },
    );

    expect(panel).toEqual({
      mode: "normal",
      x: PANEL_EDGE,
      y: 160,
      w: 864,
      h: 624,
    });
  });

  it("lowers the minimum size when the viewport is narrow", () => {
    const panel = normalizePanelState(
      { mode: "normal", x: 999, y: -100, w: 100, h: 100 },
      { width: 300, height: 420 },
    );

    expect(panel).toEqual({
      mode: "normal",
      x: PANEL_EDGE,
      y: PANEL_EDGE,
      w: 268,
      h: 360,
    });
  });

  it("keeps the panel inside extremely small viewports", () => {
    const panel = normalizePanelState(
      { mode: "normal", x: 0, y: 0, w: 900, h: 900 },
      { width: 220, height: 260 },
    );

    expect(panel).toEqual({
      mode: "normal",
      x: PANEL_EDGE,
      y: PANEL_EDGE,
      w: 188,
      h: 228,
    });
  });
});
