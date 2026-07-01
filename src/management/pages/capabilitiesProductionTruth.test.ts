import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8");

describe("MGMT-GAP-005 capability production truth gates", () => {
  it("keeps studio runner output unavailable until governed runners exist", () => {
    const formulaStudio = readSource("src/management/pages/studios/FormulaStudio.tsx");
    const skillSandbox = readSource("src/management/pages/studios/SkillSandboxStudio.tsx");

    expect(existsSync(join(process.cwd(), "src/management/components/studios/FormulaBacktestChart.tsx"))).toBe(false);
    expect(formulaStudio).not.toContain("FormulaBacktestChart");
    expect(formulaStudio).toContain("Backtest runner unavailable");
    expect(skillSandbox).toContain("Skill runner unavailable");
    expect(skillSandbox).not.toContain("emptyTrace");
  });

  it("disables capability registry create actions and names live-empty registry states", () => {
    const source = readSource("src/management/pages/CapabilitiesLists.tsx");
    const createDisabledOccurrences = source.match(/createBehavior=\{capabilityCreateDisabled\}/g) ?? [];

    expect(createDisabledOccurrences).toHaveLength(3);
    expect(source).toContain("Live tool registry is empty");
    expect(source).toContain("Live MCP registry is empty");
    expect(source).toContain("Live skill registry is empty");
  });

  it("keeps capability detail writes and runners disabled instead of local-success paths", () => {
    const guardedFiles = [
      "src/management/pages/ToolDetail.tsx",
      "src/management/pages/McpDetail.tsx",
      "src/management/pages/SkillDetail.tsx",
      "src/management/components/detail/ToolSchemaPanel.tsx",
      "src/management/components/detail/McpRegistryPanel.tsx",
      "src/management/components/detail/McpSecretsPanel.tsx",
      "src/management/components/detail/SkillPromptEditor.tsx",
    ];

    for (const relPath of guardedFiles) {
      const source = readSource(relPath);
      expect(source, relPath).toContain("NonProductionActionButton");
      expect(source, relPath).not.toContain("runActionSafe");
      expect(source, relPath).not.toContain("HighRiskConfirm");
      expect(source, relPath).not.toContain("toast.success");
    }

    const toolSandbox = readSource("src/management/components/detail/ToolSchemaPanel.tsx");
    expect(toolSandbox).not.toContain("setTimeout");
    expect(toolSandbox).not.toContain("Math.random");

    const mcpSecrets = readSource("src/management/components/detail/McpSecretsPanel.tsx");
    expect(mcpSecrets).not.toContain("mutations.");
  });
});
