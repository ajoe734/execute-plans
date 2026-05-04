import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { RankingFormula } from "@/lib/bff/types";
import { CheckCircle2, Edit } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const RankingFormulaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [f, setF] = useState<RankingFormula | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.rankingFormulas.list().then((rows) => setF(rows.find((x) => x.id === id)));
  }, [id]);

  if (!f) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={f}
        subtitle={f.id}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Activate
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Applied to" value={`${f.appliedTo} strategies`} mono />
                  <Field label={t("table.state")} value={f.state} mono />
                  <Field label={t("table.owner")} value={f.owner} mono />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Expression</div>
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{f.expression}</pre>
                </div>
              </Section>
            ),
          },
          { value: "preview", label: "Preview Ranking", content: <Placeholder text="Run a preview ranking against current strategies." /> },
          { value: "history", label: "Version History", content: <Placeholder text="All versions, who edited, and impact." /> },
          { value: "audit", label: t("nav.audit"), content: <Placeholder text="Audit trail for activations and edits." /> },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Activate Ranking Formula — ${f.name}`}
        description="Activating this formula will replace the current production ranking and may rebalance allocations."
        confirmToken="ACTIVATE"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "RankingFormula", id: f.id, action: "activate", memo }); toast.success("Activation requested — pending approval"); }}
      />
    </>
  );
};
