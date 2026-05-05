// Phase 11.1 — Route Policy Editor: visual rule list with priority reorder, env scope toggles,
// guard text, and add/remove. JSON view toggle for power users.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { RoutePolicy, RoutePolicyRule, RouteTargetKind } from "@/lib/bff/types";
import { bff } from "@/lib/bff/client";
import { runActionSafe } from "@/lib/bff/runAction";
import { useT } from "@/platform/hooks";

const ENVS: ("research" | "paper" | "live")[] = ["research", "paper", "live"];
const KINDS: RouteTargetKind[] = ["tool", "mcp", "skill"];

const kindTone: Record<RouteTargetKind, string> = {
  tool: "border-accent/40 text-accent",
  mcp: "border-status-warning/40 text-status-warning",
  skill: "border-status-success/40 text-status-success",
};

interface Props {
  policy: RoutePolicy;
  readOnly?: boolean;
}

export const RoutePolicyEditor = ({ policy, readOnly }: Props) => {
  const t = useT();
  const [rules, setRules] = useState<RoutePolicyRule[]>([...policy.rules].sort((a, b) => a.priority - b.priority));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"visual" | "json">("visual");

  const update = (next: RoutePolicyRule[]) => {
    // re-number priorities by index*10
    const renum = next.map((r, i) => ({ ...r, priority: (i + 1) * 10 }));
    setRules(renum);
    setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  const add = () => {
    update([...rules, {
      id: `r_${Date.now()}`, intent: "new_intent", targetKind: "tool", targetId: "tl_unknown",
      envScope: ["research"], priority: 999,
    }]);
  };

  const remove = (id: string) => update(rules.filter((r) => r.id !== id));

  const patch = (id: string, p: Partial<RoutePolicyRule>) =>
    update(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const toggleEnv = (id: string, env: "research" | "paper" | "live") => {
    const r = rules.find((x) => x.id === id);
    if (!r) return;
    const has = r.envScope.includes(env);
    patch(id, { envScope: has ? r.envScope.filter((e) => e !== env) : [...r.envScope, env] });
  };

  const submit = async () => {
    await bff.mutations.publishRoutePolicy(policy.id, rules, `Edited rules: ${rules.length}`);
    toast.success(t("governance.policy.submitted"));
    setDirty(false);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <div className="text-sm font-semibold">{policy.name}</div>
          <div className="text-mono text-[10px] text-muted-foreground mt-0.5">
            {policy.id} · {policy.version} · {rules.length} {t("governance.policy.rules")}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRules([...policy.rules].sort((a, b) => a.priority - b.priority)); setDirty(false); }} disabled={!dirty}>
              {t("actions.reset")}
            </Button>
            <Button size="sm" onClick={submit} disabled={!dirty}>{t("actions.submitForReview")}</Button>
          </div>
        )}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "visual" | "json")}>
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="visual">{t("governance.policy.visual")}</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="visual" className="p-4 space-y-2 mt-0">
          {rules.map((r, i) => (
            <div key={r.id} className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/20">
              <div className="flex flex-col gap-1 pt-1">
                <button onClick={() => move(i, -1)} disabled={readOnly || i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <span className="text-mono text-[10px] text-muted-foreground text-center">#{r.priority}</span>
                <button onClick={() => move(i, 1)} disabled={readOnly || i === rules.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.policy.intent")}</label>
                  <Input className="h-7 text-xs mt-0.5" value={r.intent} onChange={(e) => patch(r.id, { intent: e.target.value })} disabled={readOnly} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.policy.kind")}</label>
                  <select
                    className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                    value={r.targetKind}
                    onChange={(e) => patch(r.id, { targetKind: e.target.value as RouteTargetKind })}
                    disabled={readOnly}
                  >
                    {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.policy.target")}</label>
                  <Input className="h-7 text-xs mt-0.5 text-mono" value={r.targetId} onChange={(e) => patch(r.id, { targetId: e.target.value })} disabled={readOnly} />
                </div>
                <div className="col-span-4">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.policy.env")}</label>
                  <div className="flex gap-1 mt-1">
                    {ENVS.map((e) => {
                      const on = r.envScope.includes(e);
                      return (
                        <button key={e} onClick={() => toggleEnv(r.id, e)} disabled={readOnly}
                          className={`px-2 py-0.5 rounded text-[10px] uppercase border ${on ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground"}`}>
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="col-span-12">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.policy.guard")}</label>
                  <Input className="h-7 text-xs mt-0.5" value={r.guard ?? ""} placeholder={t("governance.policy.guardPlaceholder")} onChange={(e) => patch(r.id, { guard: e.target.value || undefined })} disabled={readOnly} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={`text-[10px] uppercase ${kindTone[r.targetKind]}`}>{r.targetKind}</Badge>
                {!readOnly && (
                  <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
                )}
              </div>
            </div>
          ))}
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={add} className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1" />{t("governance.policy.addRule")}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="json" className="p-4 mt-0">
          <pre className="text-mono text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[480px]">
            {JSON.stringify(rules, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </Card>
  );
};
