// Phase 11.4 — Persona memory governance: queue + per-persona drilldown + conflict resolver.
import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitMerge, AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { bff, managementConsoleReads } from "@/lib/bff-v1";
import type { MemoryUpdate, Persona } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";

const stateTone: Record<MemoryUpdate["state"], string> = {
  queued: "border-accent/40 text-accent",
  approved: "border-status-success/40 text-status-success",
  rejected: "border-status-failed/40 text-status-failed",
  merged: "border-status-success/40 text-status-success",
  conflict: "border-risk-high/40 text-risk-high",
};

export const MemoryGovernancePage = () => {
  const t = useT();
  const [items, setItems] = useState<MemoryUpdate[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    managementConsoleReads.memoryGovernance().then((envelope) => setItems(envelope.items));
    bff.personas.list().then(setPersonas);
  }, []);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  const queued = items.filter((m) => m.state === "queued");
  const conflicts = items.filter((m) => m.state === "conflict");
  const decided = items.filter((m) => m.state === "approved" || m.state === "rejected" || m.state === "merged");

  const conflictPairs = useMemo(() => {
    const pairs: [MemoryUpdate, MemoryUpdate | undefined][] = [];
    const seen = new Set<string>();
    conflicts.forEach((c) => {
      if (seen.has(c.id)) return;
      const peer = conflicts.find((x) => x.id === c.conflictWith);
      pairs.push([c, peer]);
      seen.add(c.id);
      if (peer) seen.add(peer.id);
    });
    return pairs;
  }, [conflicts]);

  const action = (id: string, kind: "approve" | "reject" | "merge") => {
    setItems((prev) => prev.map((m) => m.id === id ? {
      ...m,
      state: kind === "approve" ? "approved" : kind === "reject" ? "rejected" : "merged",
    } : m));
    toast.success(t(`governance.memory.${kind}d`));
  };

  return (
    <>
      <PageHeader
        title={t("governance.memory.title")}
        subtitle={t("governance.memory.subtitle")}
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.memory.queued")}</div>
            <div className="text-2xl font-semibold mt-1">{queued.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.memory.conflicts")}</div>
            <div className="text-2xl font-semibold mt-1 text-risk-high">{conflicts.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.memory.decided")}</div>
            <div className="text-2xl font-semibold mt-1">{decided.length}</div>
          </Card>
        </div>

        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">{t("governance.memory.queue")} ({queued.length})</TabsTrigger>
            <TabsTrigger value="conflicts"><AlertTriangle className="h-3.5 w-3.5 mr-1" />{t("governance.memory.conflicts")} ({conflictPairs.length})</TabsTrigger>
            <TabsTrigger value="history">{t("governance.memory.history")} ({decided.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4 space-y-2">
            {queued.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("empty.none")}</Card>}
            {queued.map((m) => (
              <Card key={m.id} className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] uppercase">{personaName(m.personaId)}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{m.kind}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{m.source}</Badge>
                  <span className="text-mono text-[10px] text-muted-foreground ml-auto">{m.proposedBy} · {safeDateTime(m.proposedAt)}</span>
                </div>
                {m.before && <div className="text-xs text-muted-foreground line-through">{m.before}</div>}
                <div className="text-sm">{m.after}</div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => action(m.id, "reject")}><X className="h-3.5 w-3.5 mr-1" />{t("actions.reject")}</Button>
                  <Button size="sm" onClick={() => action(m.id, "approve")}><Check className="h-3.5 w-3.5 mr-1" />{t("actions.approve")}</Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="conflicts" className="mt-4 space-y-3">
            {conflictPairs.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("empty.none")}</Card>}
            {conflictPairs.map(([a, b]) => (
              <Card key={a.id} className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-risk-high" />
                  <span className="text-sm font-medium">{t("governance.memory.conflictTitle")}</span>
                  <Badge variant="outline" className="text-[10px] uppercase ml-auto">{personaName(a.personaId)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[a, b].filter(Boolean).map((m) => (
                    <div key={m!.id} className="p-3 rounded-md border border-border bg-muted/20 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="text-mono">{m!.id}</span>
                        <span className="ml-auto">{m!.proposedBy}</span>
                      </div>
                      <div className="text-sm">{m!.after}</div>
                      <div className="flex justify-end gap-1 pt-1">
                        <Button size="sm" variant="outline" onClick={() => action(m!.id, "reject")}>{t("actions.reject")}</Button>
                        <Button size="sm" onClick={() => action(m!.id, "approve")}>{t("governance.memory.keep")}</Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => { action(a.id, "merge"); if (b) action(b.id, "merge"); }}>
                    <GitMerge className="h-3.5 w-3.5 mr-1" />{t("governance.memory.merge")}
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.persona")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.kind")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.state")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("governance.memory.content")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-4 py-2">{personaName(m.personaId)}</td>
                      <td className="px-4 py-2 text-xs"><Badge variant="outline" className="text-[10px] uppercase">{m.kind}</Badge></td>
                      <td className="px-4 py-2"><Badge variant="outline" className={`text-[10px] uppercase ${stateTone[m.state]}`}>{m.state}</Badge></td>
                      <td className="px-4 py-2 text-xs truncate max-w-md">{m.after}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{safeDateTime(m.proposedAt)}</td>
                    </tr>
                  ))}
                  {decided.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-muted-foreground py-6">{t("empty.none")}</td></tr>}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};
