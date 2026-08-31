import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";

const reportMd = `# Spec Gap Audit — Pack D

Historical audit reports are preserved in repository source under .lovable/audits/.
`;

const blockersMd = `# Spec Gap Audit — Pack D Blockers

Historical blocker tracking is preserved in repository source under .lovable/audits/.
`;

const summaryCsv = `ID,Category,Severity,Status
GAP-001,Governance,Medium,Resolved
`;

const packEQuestionsMd = `# Pack E Planner Questions

Historical planner questions and disposition records are preserved under .lovable/feedback/.
`;

const packEConflictMd = `# Pack E Spec Conflict Audit

Historical conflict resolution records are preserved in repository source under .lovable/audits/.
`;

const indexMd = `# Spec Gap Audit Index

Historical audit index content is intentionally not bundled into the dev
frontend because it contains obsolete deployment URLs from earlier BFF/Lovable
cutovers. Use the source file at .lovable/audits/INDEX.md when historical
evidence is needed.
`;

const MarkdownPre = ({ text }: { text: string }) => (
  <pre className="whitespace-pre-wrap text-sm leading-6 font-mono bg-card border border-border rounded-md p-4 overflow-auto max-h-[calc(100vh-220px)]">
    {text}
  </pre>
);

const CsvTable = ({ text }: { text: string }) => {
  const rows = text.trim().split("\n").map((l) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (const c of l) {
      if (c === '"') q = !q;
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  return (
    <div className="overflow-auto max-h-[calc(100vh-220px)] border border-border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-muted sticky top-0">
          <tr>{head.map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t border-border hover:bg-muted/40">
              {r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const AuditViewer = () => (
  <div className="flex-1">
    <PageHeader
      title="Spec Audits — Pack D & Pack E"
      subtitle="Pack D 63 second-order gaps · Pack E 19 v5 conflicts · 28 規劃團隊待回覆問題"
    />
    <PageBody>
      <Tabs defaultValue="pack-e-questions">
        <TabsList>
          <TabsTrigger value="pack-e-questions">Pack E 規劃團隊問題（28）</TabsTrigger>
          <TabsTrigger value="pack-e-conflict">Pack E 衝突盤點（19）</TabsTrigger>
          <TabsTrigger value="report">Pack D 主報告</TabsTrigger>
          <TabsTrigger value="blockers">Pack D Blockers</TabsTrigger>
          <TabsTrigger value="summary">Pack D 摘要 CSV</TabsTrigger>
          <TabsTrigger value="index">審計索引</TabsTrigger>
        </TabsList>
        <TabsContent value="pack-e-questions"><MarkdownPre text={packEQuestionsMd} /></TabsContent>
        <TabsContent value="pack-e-conflict"><MarkdownPre text={packEConflictMd} /></TabsContent>
        <TabsContent value="report"><MarkdownPre text={reportMd} /></TabsContent>
        <TabsContent value="blockers"><MarkdownPre text={blockersMd} /></TabsContent>
        <TabsContent value="summary"><CsvTable text={summaryCsv} /></TabsContent>
        <TabsContent value="index"><MarkdownPre text={indexMd} /></TabsContent>
      </Tabs>
    </PageBody>
  </div>
);

export default AuditViewer;
