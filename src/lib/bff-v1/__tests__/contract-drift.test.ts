import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { paths } from "../paths";
import { ERROR_CODES } from "@/lib/v4/errorCodes";
import { ACTION_COMMAND_STATUSES, EVIDENCE_CAPABILITY_MAP } from "../dto";
import { SSE_CHANNELS } from "../sse/channels";
import {
  AGORA_CAPABILITIES,
  AGORA_CONTRACT_SNAPSHOT,
  AGORA_ROUTE_PATHS,
  AGORA_SCHEMA_FILES,
  AGORA_SCHEMA_DEFINITION_CHECKSUMS,
} from "../agora/types";
import contractSnapshot from "../agora/contract-snapshot.json";
import type {
  TradingRoomWidgetSpec,
  TradingRoomWorkspaceProposal,
  WidgetRevisionProposal,
} from "../agora/types";

const repoRoot = process.cwd();

function readIfExists(rel: string): string {
  const p = path.join(repoRoot, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const openApi = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml");
const asyncApi = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_AsyncAPI_SSE.md")
  || readIfExists(".lovable/spec/bff/2026-05-07-H/Pantheon_BFF_AsyncAPI_SSE.md");

describe("BFF v1 contract drift", () => {
  it("canonical frontend path builders are reflected in OpenAPI text", () => {
    expect(openApi.length, "OpenAPI artifact must be present").toBeGreaterThan(1000);

    const canonicalPaths = [
      paths.me(),
      paths.authRefresh(),
      paths.logout(),
      paths.strategies(),
      paths.personas(),
      paths.capitalPools(),
      paths.rebalances(),
      paths.deployments(),
      paths.evolutionPrograms(),
      paths.researchExperiments(),
      paths.artifacts(),
      paths.jobs(),
      paths.approvals(),
      paths.approvalDecide("{id}").replace("%7Bid%7D", "{id}"),
      paths.alerts(),
      paths.incidents(),
      paths.audit(),
      paths.runtimes(),
      paths.mcpServers(),
      paths.mcpServerImportTools("{id}").replace("%7Bid%7D", "{id}"),
      paths.mcpTools(),
      paths.skills(),
      paths.channels(),
      paths.tools(),
      paths.rankingFormulas(),
      paths.sse(),
      paths.agoraSignals(),
      paths.agoraInbox(),
      paths.agoraJournal(),
      paths.agoraPostmortems(),
      paths.agoraAskSessions(),
      paths.v5LoopRuns(),
      paths.v5SentinelFindings(),
      paths.v5Interventions(),
      paths.v5InterventionDecide("{id}").replace("%7Bid%7D", "{id}"),
      paths.v5ExecutionPersonaHealth(),
    ];

    for (const p of canonicalPaths) {
      expect(openApi, `OpenAPI must include ${p}`).toContain(p);
    }
  });

  it("ActionCommandStatus is a named schema and does not contain requires_* success states", () => {
    expect(ACTION_COMMAND_STATUSES).toEqual(["accepted", "queued", "completed"]);
    expect(openApi).toMatch(/ActionCommandStatus:/);
    expect(openApi).not.toMatch(/requires_confirm_token.*enum|requires_approval.*enum|requires_two_man.*enum/s);
  });

  it("ErrorCode runtime list is represented in OpenAPI or final docs", () => {
    const finalDoc = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md");
    const corpus = `${openApi}\n${finalDoc}`;
    for (const code of ERROR_CODES) {
      expect(corpus, `contract docs must include ErrorCode ${code}`).toContain(code);
    }
  });

  it("SSE channel runtime list is represented in AsyncAPI or final docs", () => {
    const finalDoc = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md");
    const corpus = `${asyncApi}\n${finalDoc}`;
    for (const channel of SSE_CHANNELS) {
      expect(corpus, `SSE contract docs must include channel ${channel}`).toContain(channel);
    }
  });

  it("Evidence capability map has a capability for every accepted evidence kind", () => {
    for (const [kind, cap] of Object.entries(EVIDENCE_CAPABILITY_MAP)) {
      expect(kind.length).toBeGreaterThan(0);
      expect(cap.length).toBeGreaterThan(0);
      expect(cap).toMatch(/^([a-z0-9_]+|\*)(\.[a-z0-9_*]+)*$/);
    }
  });

  it("Agora generated types carry the v1.13 dynamic Trading Room bundle snapshot", () => {
    expect(AGORA_CONTRACT_SNAPSHOT.bundleVersion).toBe("1.13");
    expect(AGORA_CONTRACT_SNAPSHOT.sourceBundle).toBe(
      "services/control-plane/specs/agora/bundle_index.v1_13.json",
    );
    expect(AGORA_SCHEMA_FILES).toContain("specs/agora/trading_room_workspace.schema.json");
    expect(AGORA_CAPABILITIES.map((capability) => capability.name)).toEqual(
      expect.arrayContaining([
        "agora.trading_room.workspace_proposal.v1",
        "agora.trading_room.workspace_editing.v1",
        "agora.trading_room.widget_revision.v1",
        "agora.trading_room.workspace_versions.v1",
      ]),
    );
    expect(AGORA_ROUTE_PATHS).toContain("/bff/agora/strategies/{strategy_id}/trading-room/proposals");
    expect(AGORA_ROUTE_PATHS).toContain(
      "/bff/agora/trading-room/workspaces/{workspace_id}/widgets/{widget_id}/revision-proposals",
    );
    expect(AGORA_ROUTE_PATHS).toContain(
      "/bff/agora/trading-room/workspaces/{workspace_id}/versions/{version_id}/rollback",
    );
    expect(AGORA_CONTRACT_SNAPSHOT.files["openapi/agora_v1_13.openapi.yaml"]).toMatch(/^[0-9a-f]{64}$/);
    expect(AGORA_CONTRACT_SNAPSHOT.files["specs/agora/trading_room_workspace.schema.json"]).toMatch(/^[0-9a-f]{64}$/);
    expect(contractSnapshot.contract_version).toBe("1.13");
    expect(contractSnapshot.source_bundle).toBe(AGORA_CONTRACT_SNAPSHOT.sourceBundle);
    expect(contractSnapshot.required_definition_checksums).toEqual(AGORA_SCHEMA_DEFINITION_CHECKSUMS);
  });

  it("dynamic Trading Room generated types are usable by frontend clients", () => {
    const widget: TradingRoomWidgetSpec = {
      id: "w-score",
      widgetType: "winner_branch_score",
      title: "Winner Branch Score",
      purpose: "Rank candidates by branch score.",
      whyIncluded: "Core V11 Winner Branch view widget.",
      dataSource: "winner_branch_score",
      query: { filters: {} },
      chartSpec: { spec_version: "1.0", kind: "table", encodings: {} },
      interactions: [],
      placement: { x: 0, y: 0, width: 6, height: 4, minWidth: 3, minHeight: 2 },
      minSize: { width: 3, height: 2 },
      maxSize: { width: 12, height: 8 },
      sensitivity: "public_market",
    };
    const workspaceProposal: TradingRoomWorkspaceProposal = {
      strategyId: "strategy-winner-branch",
      strategyVersion: "v4",
      proposalId: "trp-1",
      generatedAt: "2026-06-29T00:00:00Z",
      status: "preview",
      views: [
        {
          id: "strategy_overview",
          title: "Strategy Overview",
          purpose: "Summarize Winner Branch strategy readiness.",
          order: 1,
          layoutTemplate: "overview",
          widgetCount: 1,
          widgets: [widget],
        },
      ],
      rationale: "Trading servant generated the complete V11 workspace preview.",
      dataAvailability: { status: "complete", sources: [{ dataSource: "winner_branch_score", status: "complete" }] },
      warnings: [],
      personalizationApplied: { status: "not_applied", items: [] },
    };
    const revision: WidgetRevisionProposal = {
      id: "wrp-1",
      workspaceId: "trw-1",
      viewId: "strategy_overview",
      widgetId: widget.id,
      instruction: "Show score as a heatmap.",
      beforeSpec: widget,
      proposedSpec: { ...widget, title: "Winner Branch Score Heatmap" },
      rationale: "The heatmap improves comparison across branches.",
      warnings: [],
      dataAvailability: "complete",
      status: "preview",
    };

    expect(workspaceProposal.views[0].widgets[0].id).toBe(widget.id);
    expect(revision.proposedSpec.title).toBe("Winner Branch Score Heatmap");
  });
});
