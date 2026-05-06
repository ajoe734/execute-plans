// v4 / Pack C §C052–C055 — Component specs.

// C052 — Skeleton specs
export const SKELETON_SPECS = {
  table: { defaultRows: 10, defaultColumns: 6 },
  cardGrid: { defaultCards: 6 },
  chart: { types: ["line", "bar", "heatmap"] as const },
  drawer: { defaultSections: 4 },
} as const;

// C053 — LineageGraph
export const LINEAGE_GRAPH = {
  maxVisibleNodes: 200,
  layout: "dagre_LR" as const,
  collapseStrategy: "by_entity_type" as const,
  panZoom: true,
  minimap: "optional" as const,
} as const;

// C054 — RightDrawer
export const RIGHT_DRAWER = {
  maxStackDepth: 2,
  escClosesTopmost: true,
  routeChangeClosesNonPinned: true,
} as const;

// C055 — CommandPalette ranking weights
export const COMMAND_PALETTE_WEIGHTS = {
  exactMatch: 100,
  prefix: 80,
  recentlyViewed: 15,
  pinned: 20,
  currentProductScope: 10,
  archived: -30,
} as const;
