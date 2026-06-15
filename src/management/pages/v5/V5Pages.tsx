// Pack E E1 — Loops list surface.
// Wires the bff.v5 facade for real KPIs/lists. The Control Room / Sentinel / HIQ
// placeholder versions that once lived here were dead code (App.tsx uses the full
// implementations in v5/Sentinel.tsx and v5/Interventions.tsx, and the Control Room
// was folded into the Cockpit console), so they were removed 2026-06-15.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { LoopRun } from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";

function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T>();
  useEffect(() => {
    let alive = true;
    load().then((r) => alive && setV(r));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

// ---------- Loops ----------

export const LoopsPage = () => {
  const t = useT();
  const params = useParams<{ kind?: LoopKind }>();
  const kind = params.kind;
  const data = useAsync(() => v5.loops.list(kind), [kind]);
  return (
    <>
      <PageHeader
        title={kind ? t(`v5.loops.${kind}.title`) : t("nav.loops")}
        subtitle={t("v5.loops.subtitle")}
      />
      <PageBody>
        {!data ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">{t("v5.col.subject")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.kind")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.status")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.next")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r: LoopRun) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.subjectName ?? r.id}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.loopKind}</Badge></td>
                    <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nextAction?.label ?? r.nextAction?.kind ?? "—"}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("v5.col.total")}: {data.totalCount} · exact={String(data.totalCountExact)}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
};
