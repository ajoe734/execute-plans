import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PublicBffSurface = typeof import("@/lib/bff-v1");
type RequiredLiveClient =
  | "askManagementAi"
  | "bffFetch"
  | "bffV1"
  | "commandReceiptDescription"
  | "fetchAssistantModeStatus"
  | "listTradeJourneys"
  | "normalizeAlertTimestampFields"
  | "readBffEnv"
  | "strictLiveRead";
type MissingLiveClient = Exclude<RequiredLiveClient, keyof PublicBffSurface>;
type Assert<T extends true> = T;
type CompleteLiveClient = Assert<[MissingLiveClient] extends [never] ? true : false>;

const completeLiveClient: CompleteLiveClient = true;
void completeLiveClient;

const COMPLETE_BFF_PUBLIC_MODULES = [
  "./dto",
  "./errors",
  "./headers",
  "./paths",
  "./client",
  "./sse/channels",
  "./sse/protocol",
  "./sse/bridge",
  "./sse/liveSse",
  "./lists",
  "./degradation",
  "./useLiveListV1",
  "./writes",
  "./me",
  "./writeGate",
  "./personas",
  "./liveStatus",
  "./liveTransport",
  "./seedTaxonomy",
  "./capitalPools",
  "./strategies",
  "./rankingFormulas",
  "./rebalances",
  "./deployments",
  "./evolution",
  "./research",
  "./artifacts",
  "./capabilities",
  "./operations",
  "./governance",
  "./search",
  "./writeOverlay",
  "./evidenceOperations",
  "./agora/agoraReads",
  "./v5",
  "./management",
  "./managementConsoleReads",
  "./shellSummary",
  "./agora/types",
  "./agora/governance",
  "./tradeJournal",
  "./agora/interaction",
  "./managementDataSources",
  "./managementAi",
  "./loopTruthTypes",
  "./tradeJourneys",
  "./commandReceipt",
  "./eventTimestamps",
  "./domainReads",
  "./runtimeEnv",
  "./bffV1",
] as const;

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

function publicExportSources(index: string): string[] {
  return Array.from(index.matchAll(/^export \* from "([^"]+)";$/gm), ([, module]) => module);
}

describe("full production operation assembly", () => {
  it("keeps the desktop route graph on protected production route modules", () => {
    const app = source("App.tsx");

    expect(app).toContain("<Route element={<ProtectedRoute><PlatformShellRoute /></ProtectedRoute>}>");
    expect(app).toContain('<Route path="/management" element={<ManagementLayoutRoute />}>');
    expect(app).toContain('<Route path="cockpit" element={<CockpitRoute />} />');
    expect(app).toContain('<Route path="personas" element={<PersonasListRoute />} />');
    expect(app).toContain('<Route path="postmortems" element={<PostmortemLibraryRoute />} />');
    expect(app).toContain('<Route path="/agora" element={<ProtectedRoute><AgoraLayoutRoute /></ProtectedRoute>}>');
    expect(app).not.toMatch(/(?:from|import\()\s*["'][^"']*(?:\/mocks?\/|mock[A-Z_a-z-]*)/i);
  });

  it("keeps the Management shell projected from its typed production manifest", () => {
    const layout = source("management/ManagementLayout.tsx");

    expect(layout).toContain('import { MANAGEMENT_SIDEBAR_GROUPS } from "@/management/navigation/managementRouteManifest";');
    expect(layout).toContain("const groups: NavGroup[] = MANAGEMENT_SIDEBAR_GROUPS.map");
    expect(layout).toContain("<SideNav groups={groups} />");
    expect(layout).toContain('<ErrorBoundary key={useLocation().pathname} scope="Management page">');
    expect(layout).toContain("<Outlet />");
    expect(layout).not.toMatch(/(?:from|import\()\s*["'][^"']*(?:\/mocks?\/|mock[A-Z_a-z-]*)/i);
  });

  it("exports the complete typed live BFF client set without a mock public export", () => {
    const index = source("lib/bff-v1/index.ts");
    const exports = publicExportSources(index);

    expect(exports).toEqual(COMPLETE_BFF_PUBLIC_MODULES);
    expect(exports).not.toContain("./mocks/adapters");
    expect(exports).not.toContain("./mocks/registry");
    expect(index).toContain('export { runActionSafe, type RunActionSafeOpts } from "./runActionSafe";');
    expect(index).toContain('export { useLiveList, useRealtimeStatus } from "./useLiveList";');
  });
});
