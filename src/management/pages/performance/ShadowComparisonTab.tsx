// Shadow comparison (design §12.9): the four arms of one decision side by side with
// settlement source labels. A paper proxy is never labelled as an actual fill.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getShadowComparison,
  settlementLabelKind,
  type AttributionRead,
  type ShadowComparisonData,
} from "@/lib/bff-v1/attribution";

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export const ShadowComparisonTab = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const decisionId = (params.get("decision") ?? "").trim();
  const [draft, setDraft] = useState(decisionId);
  const [read, setRead] = useState<AttributionRead<ShadowComparisonData> | null>(null);

  useEffect(() => {
    setDraft(decisionId);
    if (!decisionId) {
      setRead(null);
      return;
    }
    let live = true;
    setRead(null);
    void getShadowComparison(decisionId).then((r) => {
      if (live) setRead(r);
    });
    return () => {
      live = false;
    };
  }, [decisionId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (draft.trim()) next.set("decision", draft.trim());
    else next.delete("decision");
    setParams(next, { replace: true });
  };

  const label = (source: string | null) => {
    const kind = settlementLabelKind(source);
    if (kind === "actual_fill") return t("performanceCenter.shadow.actualFill", { defaultValue: "Actual fill" });
    if (kind === "paper_proxy") return t("performanceCenter.shadow.paperProxy", { defaultValue: "Paper proxy (not an actual fill)" });
    return t("performanceCenter.shadow.sourceUnknown", { defaultValue: "Settlement source unknown" });
  };

  let body: React.ReactNode;
  if (!decisionId) {
    body = (
      <Card className="p-4 text-sm text-muted-foreground" data-testid="shadow-prompt">
        {t("performanceCenter.shadow.prompt", { defaultValue: "Enter a decision id to compare its four arms." })}
      </Card>
    );
  } else if (read === null) {
    body = (
      <p className="text-sm text-muted-foreground" data-testid="shadow-loading" aria-busy="true">
        {t("common.loading", { defaultValue: "Loading…" })}
      </p>
    );
  } else if (read.state === "not_found") {
    body = (
      <Card className="p-4 text-sm space-y-1" data-testid="shadow-not-found">
        <p>{t("performanceCenter.shadow.notFound", { id: decisionId, defaultValue: `Decision ${decisionId} was not found.` })}</p>
        <p className="font-mono text-muted-foreground">reason: {read.reason}</p>
      </Card>
    );
  } else if (read.state === "unavailable" || read.state === "empty") {
    body = (
      <Card className="p-4 text-sm space-y-1" data-testid="shadow-unavailable" role="status">
        <p>{t("performanceCenter.shadow.unavailable", { defaultValue: "Shadow comparison is unavailable." })}</p>
        <p className="font-mono text-muted-foreground">reason: {read.state === "unavailable" ? read.reason : (read.reason ?? "empty")}</p>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-3" data-testid="shadow-arms">
        {read.degraded ? (
          <p className="text-sm text-amber-600" role="status" data-testid="shadow-degraded">
            {t("performanceCenter.shadow.degraded", { defaultValue: "Partial data" })}:{" "}
            {Object.entries(read.degraded).map(([k, v]) => `${k}=${v}`).join(", ")}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          {read.data.arms.map((a) => {
            const detail = a.decision_detail ?? {};
            const reason = a.unavailable_reason ?? (detail.available === false ? detail.unavailable_reason : null);
            return (
              <Card key={a.arm} className="p-3 space-y-2" data-testid={`shadow-arm-${a.arm}`}>
                <h3 className="font-semibold text-sm">{a.arm}</h3>
                <Badge variant="outline" data-testid="shadow-source">{label(a.settlement_source)}</Badge>
                <div className="text-sm">
                  {t("performanceCenter.shadow.outcome", { defaultValue: "Outcome" })}: {show(a.outcome)}
                </div>
                <div className="text-xs text-muted-foreground">settled_at: {show(a.settled_at)}</div>
                <ul className="text-xs">
                  {Object.entries(detail)
                    .filter(([k]) => k !== "available" && k !== "unavailable_reason")
                    .map(([k, v]) => (
                      <li key={k}>
                        {k}: {show(v)}
                      </li>
                    ))}
                </ul>
                {reason ? <p className="text-xs font-mono text-muted-foreground">reason: {reason}</p> : null}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3" data-testid="shadow-comparison">
      <h2 className="text-lg font-semibold text-foreground">
        {t("performanceCenter.shadow.title", { defaultValue: "Shadow comparison" })}
      </h2>
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="border rounded px-2 py-1 text-sm bg-background"
          aria-label={t("performanceCenter.shadow.decisionId", { defaultValue: "Decision id" })}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline">
          {t("performanceCenter.shadow.load", { defaultValue: "Load" })}
        </Button>
      </form>
      {body}
    </section>
  );
};
