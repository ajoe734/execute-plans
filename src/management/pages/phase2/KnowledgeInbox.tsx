// Knowledge Inbox — Spec Part 3 §19.6.
// Insight triage queue, can be promoted to Artifact / Postmortem.
import { useEffect, useState } from "react";
import { managementConsoleReads, type KnowledgeInsightRecord } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

export const KnowledgeInboxPage = () => {
  const t = useT();
  const { data: live } = useV5Live(
    () => managementConsoleReads.knowledgeInbox().then((envelope) => envelope.items),
    [],
  );
  const [items, setItems] = useState<KnowledgeInsightRecord[]>([]);
  const [active, setActive] = useState<KnowledgeInsightRecord | null>(null);
  useEffect(() => {
    if (!live) return;
    setItems(live);
    setActive((prev) => prev && live.some((item) => item.id === prev.id) ? prev : live[0] ?? null);
  }, [live]);

  return (
    <>
      <PageHeader title={t("nav.knowledge")} subtitle={t("knowledge.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <Card className="p-2">
            {items.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">{t("knowledge.empty")}</div>}
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id}>
                  <button onClick={() => setActive(i)} className={`w-full text-left p-3 hover:bg-muted/40 ${active?.id === i.id ? "bg-muted/60" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RiskBadge level={i.risk} />
                      <Badge variant="outline" className="text-[10px] uppercase">{i.kind}</Badge>
                    </div>
                    <div className="text-sm font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground text-mono mt-0.5">{i.source}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-4">
            {active ? (
              <>
                <div className="flex items-center gap-2"><RiskBadge level={active.risk} /><Badge variant="outline">{active.kind}</Badge><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <h2 className="text-lg font-semibold">{active.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{active.body}</p>
                <div className="text-xs text-muted-foreground text-mono">{active.source} · {safeDateTime(active.ts)}</div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <NonProductionActionButton size="sm">{t("knowledge.promoteArtifact")}</NonProductionActionButton>
                  <NonProductionActionButton size="sm" variant="outline">{t("knowledge.promotePostmortem")}</NonProductionActionButton>
                  <NonProductionActionButton size="sm" variant="outline">{t("knowledge.promoteResearch")}</NonProductionActionButton>
                  <NonProductionActionButton size="sm" variant="ghost">{t("knowledge.dismiss")}</NonProductionActionButton>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-12">{t("knowledge.selectHint")}</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
