// Lightweight Route Policy preview embedded in PersonaDetail.
// Phase 11 will replace this with a full RoutePolicyEditor + version diff UI.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff-v1";
import type { PolicyVersion, RoutePolicy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";

const kindTone: Record<string, string> = {
  tool: "border-accent/40 text-accent",
  mcp: "border-status-warning/40 text-status-warning",
  skill: "border-status-success/40 text-status-success",
};

export const RoutePolicyPreview = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [policy, setPolicy] = useState<RoutePolicy | undefined>();
  const [versions, setVersions] = useState<PolicyVersion[]>([]);

  useEffect(() => {
    bff.routePolicies.forPersona(personaId).then((p) => {
      setPolicy(p);
      if (p) bff.policyVersions.list(p.id).then(setVersions);
    });
  }, [personaId]);

  if (!policy) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {t("persona.routePolicy.empty")}
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{policy.name}</div>
          <div className="text-mono text-[10px] text-muted-foreground">
            {policy.id} · {policy.version} · {policy.publishedAt ? safeDateTime(policy.publishedAt, "date") : "—"}
          </div>
        </div>
        <Button size="sm" variant="outline" disabled>{t("persona.routePolicy.editStub")}</Button>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">{t("persona.routePolicy.rules")}</TabsTrigger>
          <TabsTrigger value="versions">{t("persona.routePolicy.versions")} ({versions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-3 space-y-2">
          {policy.rules.sort((a, b) => a.priority - b.priority).map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30">
              <span className="text-mono text-[10px] text-muted-foreground w-8">#{r.priority}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{r.intent}</div>
                <div className="text-mono text-[10px] text-muted-foreground">{r.targetId} · {r.envScope.join("/")}{r.guard ? ` · ${r.guard}` : ""}</div>
              </div>
              <Badge variant="outline" className={`text-[10px] uppercase ${kindTone[r.targetKind]}`}>{r.targetKind}</Badge>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="versions" className="mt-3 space-y-2">
          {versions.length === 0 && <div className="text-xs text-muted-foreground">{t("empty.none")}</div>}
          {versions.map((v) => (
            <div key={v.id} className="p-3 rounded-md border border-border">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{v.version}</span>
                <span className="text-mono text-[10px] text-muted-foreground">{safeDateTime(v.createdAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{v.note} · {v.rules.length} rules</div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </Card>
  );
};
