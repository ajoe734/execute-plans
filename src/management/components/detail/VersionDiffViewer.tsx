import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/platform/hooks";

export interface VersionEntry {
  id: string;
  version: string;
  author: string;
  createdAt: string;
  note?: string;
  spec: Record<string, unknown> | string;
}

interface Props {
  versions: VersionEntry[];
  defaultLeftId?: string;
  defaultRightId?: string;
}

const fmt = (v: unknown) =>
  typeof v === "string" ? v : JSON.stringify(v, null, 2);

export const VersionDiffViewer = ({ versions, defaultLeftId, defaultRightId }: Props) => {
  const t = useT();
  const sorted = useMemo(() => [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [versions]);
  const [leftId, setLeftId] = useState<string>(defaultLeftId ?? sorted[Math.max(0, sorted.length - 2)]?.id ?? "");
  const [rightId, setRightId] = useState<string>(defaultRightId ?? sorted[sorted.length - 1]?.id ?? "");
  const left = sorted.find((v) => v.id === leftId);
  const right = sorted.find((v) => v.id === rightId);

  if (sorted.length < 2) {
    return <div className="text-sm text-muted-foreground p-4">{t("governance.policy.diff.needTwo")}</div>;
  }

  const leftLines = fmt(left?.spec ?? "").split("\n");
  const rightLines = fmt(right?.spec ?? "").split("\n");
  const max = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("governance.policy.versions")} A</div>
          <Select value={leftId} onValueChange={setLeftId}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sorted.map((v) => <SelectItem key={v.id} value={v.id}>{v.version} · {v.author}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("governance.policy.versions")} B</div>
          <Select value={rightId} onValueChange={setRightId}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sorted.map((v) => <SelectItem key={v.id} value={v.id}>{v.version} · {v.author}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 text-xs font-mono">
          <div className="border-r border-border">
            <div className="px-3 py-2 bg-muted/40 text-muted-foreground flex items-center justify-between">
              <span>{left?.version}</span>
              <Badge variant="outline" className="text-[10px]">{left?.author}</Badge>
            </div>
            <pre className="p-3 whitespace-pre-wrap leading-5">
              {Array.from({ length: max }).map((_, i) => {
                const l = leftLines[i] ?? "";
                const r = rightLines[i] ?? "";
                const cls = l === r ? "" : "bg-status-failed/10 text-status-failed";
                return <div key={i} className={cls}>{l || " "}</div>;
              })}
            </pre>
          </div>
          <div>
            <div className="px-3 py-2 bg-muted/40 text-muted-foreground flex items-center justify-between">
              <span>{right?.version}</span>
              <Badge variant="outline" className="text-[10px]">{right?.author}</Badge>
            </div>
            <pre className="p-3 whitespace-pre-wrap leading-5">
              {Array.from({ length: max }).map((_, i) => {
                const l = leftLines[i] ?? "";
                const r = rightLines[i] ?? "";
                const cls = l === r ? "" : "bg-status-success/10 text-status-success";
                return <div key={i} className={cls}>{r || " "}</div>;
              })}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
};
