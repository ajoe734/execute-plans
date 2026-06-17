// Phase 11.2 — Route Policy Detail with Editor + Version Diff + Approval flow.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, GitCompare } from "lucide-react";
import { bff } from "@/lib/bff-v1";
import type { Persona, PolicyVersion, RoutePolicy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { RoutePolicyEditor } from "@/management/components/governance/RoutePolicyEditor";
import { PolicyVersionDiff } from "@/management/components/governance/PolicyVersionDiff";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";

export const RoutePolicyDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [policy, setPolicy] = useState<RoutePolicy | undefined>();
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [persona, setPersona] = useState<Persona | undefined>();
  const [leftV, setLeftV] = useState<string>("");
  const [rightV, setRightV] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    bff.routePolicies.get(id).then((p) => {
      setPolicy(p);
      if (p) bff.personas.get(p.personaId).then(setPersona);
    });
    bff.policyVersions.list(id).then((v) => {
      setVersions(v);
      if (v.length >= 2) {
        setLeftV(v[0].id);
        setRightV(v[v.length - 1].id);
      } else if (v.length === 1) {
        setLeftV(v[0].id);
        setRightV(v[0].id);
      }
    });
  }, [id]);

  const left = useMemo(() => versions.find((v) => v.id === leftV), [versions, leftV]);
  const right = useMemo(() => versions.find((v) => v.id === rightV), [versions, rightV]);

  if (!policy) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <PageHeader
        title={policy.name}
        subtitle={`${policy.version} · ${persona?.name ?? policy.personaId}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => nav("/management/governance/policies")}>
            <ArrowLeft className="h-4 w-4 mr-1" />{t("actions.back")}
          </Button>
        }
      />
      <PageBody>
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("table.state")}</div>
              <div className="mt-1"><StatusBadge state={policy.state} /></div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("table.risk")}</div>
              <div className="mt-1"><RiskBadge level={policy.risk} /></div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("table.owner")}</div>
              <div className="mt-1 text-mono text-xs">{policy.owner}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.policy.published")}</div>
              <div className="mt-1 text-xs">{policy.publishedAt ? safeDateTime(policy.publishedAt) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("table.version")}</div>
              <div className="mt-1"><Badge variant="outline" className="text-mono">{policy.version}</Badge></div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">{t("governance.policy.editor")}</TabsTrigger>
            <TabsTrigger value="versions">{t("governance.policy.versions")} ({versions.length})</TabsTrigger>
            <TabsTrigger value="diff"><GitCompare className="h-3.5 w-3.5 mr-1" />{t("governance.policy.diff.tab")}</TabsTrigger>
            <TabsTrigger value="approval">{t("governance.policy.approval")}</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="mt-4">
            <RoutePolicyEditor policy={policy} />
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.version")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("governance.policy.author")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.created")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("governance.policy.rules")}</th>
                    <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("governance.policy.diff.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="px-4 py-2 text-mono">{v.version}</td>
                      <td className="px-4 py-2 text-mono text-xs">{v.author}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{safeDateTime(v.createdAt)}</td>
                      <td className="px-4 py-2 text-mono text-xs">{v.rules.length}</td>
                      <td className="px-4 py-2 text-xs">{v.note ?? "—"}</td>
                    </tr>
                  ))}
                  {versions.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-xs text-muted-foreground py-6">{t("empty.none")}</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="diff" className="mt-4 space-y-3">
            {versions.length < 2 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">{t("governance.policy.diff.needTwo")}</Card>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground uppercase tracking-wider">{t("governance.policy.diff.compare")}:</span>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={leftV} onChange={(e) => setLeftV(e.target.value)}>
                    {versions.map((v) => <option key={v.id} value={v.id}>{v.version}</option>)}
                  </select>
                  <span>→</span>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={rightV} onChange={(e) => setRightV(e.target.value)}>
                    {versions.map((v) => <option key={v.id} value={v.id}>{v.version}</option>)}
                  </select>
                </div>
                {left && right && <PolicyVersionDiff left={left} right={right} />}
              </>
            )}
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <Card className="p-6 space-y-3">
              <div className="text-sm font-semibold">{t("governance.policy.approval")}</div>
              <p className="text-xs text-muted-foreground">{t("governance.policy.approvalHint")}</p>
              <ol className="space-y-2 mt-2">
                {["author", "ai_trainer", "risk_officer", "ops_lead"].map((stage, i) => (
                  <li key={stage} className="flex items-center gap-3 p-3 rounded-md border border-border">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border ${
                      i <= 1 ? "bg-status-success/20 text-status-success border-status-success/40"
                      : i === 2 ? "bg-accent text-accent-foreground border-accent"
                      : "bg-muted text-muted-foreground border-border"
                    }`}>{i + 1}</div>
                    <div className="flex-1 text-sm">{stage}</div>
                    {i <= 1 && <Badge variant="outline" className="text-[10px] uppercase border-status-success/40 text-status-success">{t("governance.policy.signedOff")}</Badge>}
                    {i === 2 && <Badge variant="outline" className="text-[10px] uppercase">{t("governance.policy.pending")}</Badge>}
                  </li>
                ))}
              </ol>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};
