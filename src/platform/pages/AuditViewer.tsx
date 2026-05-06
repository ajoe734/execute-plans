import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";

import reportMd from "../../../.lovable/audits/spec-gap-2026-05-06-D.md?raw";
import blockersMd from "../../../.lovable/audits/spec-gap-2026-05-06-D-blockers.md?raw";
import summaryCsv from "../../../.lovable/audits/spec-gap-2026-05-06-D-summary.csv?raw";
import indexMd from "../../../.lovable/audits/INDEX.md?raw";

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
      title="Spec Gap Audit D — 2026-05-06"
      subtitle="63 second-order gaps（21 High / 28 Medium / 14 Low）— 待 Pack D 規範回應"
    />
    <PageBody>
      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">主報告</TabsTrigger>
          <TabsTrigger value="blockers">Blockers</TabsTrigger>
          <TabsTrigger value="summary">摘要 CSV</TabsTrigger>
          <TabsTrigger value="index">審計索引</TabsTrigger>
        </TabsList>
        <TabsContent value="report"><MarkdownPre text={reportMd} /></TabsContent>
        <TabsContent value="blockers"><MarkdownPre text={blockersMd} /></TabsContent>
        <TabsContent value="summary"><CsvTable text={summaryCsv} /></TabsContent>
        <TabsContent value="index"><MarkdownPre text={indexMd} /></TabsContent>
      </Tabs>
    </PageBody>
  </div>
);

export default AuditViewer;
