import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Agora Workspace Cleanup & Import Graph Integrity", () => {
  const agoraDir = path.resolve(__dirname);
  const srcDir = path.resolve(__dirname, "..");

  it("proves obsolete AgoraApp M0 shell is removed from filesystem", () => {
    const agoraAppPath = path.join(agoraDir, "AgoraApp.tsx");
    expect(fs.existsSync(agoraAppPath)).toBe(false);
  });

  it("proves obsolete dashboard/ island directory is removed from filesystem", () => {
    const dashboardDir = path.join(agoraDir, "dashboard");
    expect(fs.existsSync(dashboardDir)).toBe(false);
  });

  it("proves legacy WidgetRenderer and old WidgetRevisionDrawer are removed", () => {
    const oldWidgetRendererPath = path.join(agoraDir, "widgets", "WidgetRenderer.tsx");
    const oldWidgetRevisionDrawerPath = path.join(agoraDir, "widgets", "WidgetRevisionDrawer.tsx");
    expect(fs.existsSync(oldWidgetRendererPath)).toBe(false);
    expect(fs.existsSync(oldWidgetRevisionDrawerPath)).toBe(false);
  });

  it("proves import graph contains zero references to deleted legacy islands", () => {
    function scanFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
            files.push(...scanFiles(fullPath));
          }
        } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allSourceFiles = scanFiles(srcDir);
    const forbiddenImportPatterns = [
      /@\/agora\/dashboard/u,
      /@\/agora\/AgoraApp/u,
      /@\/agora\/widgets\/WidgetRenderer/u,
      /@\/agora\/widgets\/WidgetRevisionDrawer/u,
      /\.\.?\/dashboard\//u,
      /\.\.?\/widgets\/WidgetRenderer/u,
      /\.\.?\/widgets\/WidgetRevisionDrawer/u,
    ];

    for (const file of allSourceFiles) {
      // skip this test file itself
      if (file.endsWith("agoraWorkspaceCleanup.test.ts")) continue;
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of forbiddenImportPatterns) {
        expect(
          pattern.test(content),
          `Found forbidden import matching ${pattern} in ${path.relative(srcDir, file)}`,
        ).toBe(false);
      }
    }
  });

  it("proves ChartSpecRenderer does not contain fake mock data generator or sample data switches", () => {
    const chartSpecRendererFile = path.join(agoraDir, "widgets", "ChartSpecRenderer.tsx");
    const content = fs.readFileSync(chartSpecRendererFile, "utf-8");
    expect(content.includes("generateMockData")).toBe(false);
    expect(content.includes("isSampleData")).toBe(false);
    expect(content.includes("SAMPLE DATA")).toBe(false);
  });

  it("proves WorkspaceWidgetRevisionDrawer does not contain client regex servant simulation", () => {
    const revisionDrawerFile = path.join(agoraDir, "trading-room", "WorkspaceWidgetRevisionDrawer.tsx");
    const content = fs.readFileSync(revisionDrawerFile, "utf-8");
    expect(content.includes("requestedChartKind")).toBe(false);
    expect(content.includes("buildRevisionDraft")).toBe(false);
  });

  it("proves WorkspaceGridEditor does not contain client keyword prompt parser or local mock mode toast handlers", () => {
    const gridEditorFile = path.join(agoraDir, "trading-room", "WorkspaceGridEditor.tsx");
    const content = fs.readFileSync(gridEditorFile, "utf-8");
    expect(content.includes("parseNewWidgetPrompt")).toBe(false);
    expect(content.includes("Mock Mode")).toBe(false);
    expect(content.includes("handleMarkUseful")).toBe(false);
    expect(content.includes("handleMarkNotUseful")).toBe(false);
  });
});
