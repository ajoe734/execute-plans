// Outliers & attribution (design §12.9): trader/persona outliers, decomposition,
// luck interval, linked MT-4 meeting and hypothesis validation status.
// Read-only from the BFF attribution routes; no number is computed here.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getAttributionOutliers,
  type AttributionRead,
  type AttributionRecordItem,
  type AttributionRecordsData,
} from "@/lib/bff-v1/attribution";

function hypothesisRows(h: AttributionRecordItem["hypothesis_validation"]): Array<{ text: string; status: string }> {
  if (!h) return [];
  const list = Array.isArray(h) ? h : Array.isArray(h.items) ? h.items : [];
  return list.map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return { text: String(r.hypothesis ?? r.text ?? r.id ?? ""), status: String(r.status ?? "unknown") };
  });
}

function hypothesisStatus(h: AttributionRecordItem["hypothesis_validation"]): { status: string; reason?: string } {
  if (!h) return { status: "unavailable", reason: "no_hypothesis_recorded" };
  if (!Array.isArray(h) && typeof h.status === "string") return { status: h.status, reason: h.reason };
  return { status: hypothesisRows(h).length ? "recorded" : "unavailable", reason: hypothesisRows(h).length ? undefined : "no_hypothesis_recorded" };
}

export const OutliersAttributionTab = () => {
  const { t } = useTranslation();
  const [read, setRead] = useState<AttributionRead<AttributionRecordsData> | null>(null);

  useEffect(() => {
    let live = true;
    void getAttributionOutliers({ limit: 50 }).then((r) => {
      if (live) setRead(r);
    });
    return () => {
      live = false;
    };
  }, []);

  const title = (
    <h2 className="text-lg font-semibold text-foreground">
      {t("performanceCenter.outliers.title", { defaultValue: "Outliers & attribution" })}
    </h2>
  );

  if (read === null) {
    return (
      <section className="space-y-3 mt-6" data-testid="outliers-loading" aria-busy="true">
        {title}
        <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
      </section>
    );
  }
  if (read.state === "unavailable") {
    return (
      <section className="space-y-3 mt-6" data-testid="outliers-unavailable" role="status">
        {title}
        <Card className="p-4 text-sm">
          <p>{t("performanceCenter.outliers.unavailable", { defaultValue: "Attribution surface is unavailable." })}</p>
          <p className="font-mono text-muted-foreground">reason: {read.reason}</p>
        </Card>
      </section>
    );
  }
  if (read.state === "empty" || read.state === "not_found") {
    return (
      <section className="space-y-3 mt-6" data-testid="outliers-empty">
        {title}
        <Card className="p-4 text-sm text-muted-foreground">
          {t("performanceCenter.outliers.empty", { defaultValue: "No outliers recorded for this period." })}
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3 mt-6" data-testid="outliers-list">
      {title}
      {read.data.items.map((r) => {
        const hs = hypothesisStatus(r.hypothesis_validation);
        const rows = hypothesisRows(r.hypothesis_validation);
        const luck = Array.isArray(r.luck_interval) ? r.luck_interval : null;
        return (
          <Card key={r.record_id} className="p-4 space-y-2" data-testid={`outlier-${r.record_id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{r.record_id}</span>
              <Badge variant="outline">{r.subject_kind ?? "—"}</Badge>
              <span className="text-sm">{r.subject_id ?? "—"}</span>
              <Badge variant={r.direction === "outstanding" ? "default" : "secondary"}>{r.direction ?? "—"}</Badge>
            </div>
            <div className="text-sm" data-testid="outlier-luck">
              {t("performanceCenter.outliers.luckInterval", { defaultValue: "Luck interval" })}:{" "}
              {luck ? `[${luck.join(", ")}]` : "—"} · {t("performanceCenter.outliers.sample", { defaultValue: "Sample" })}:{" "}
              {r.sample_size ?? "—"}
            </div>
            <ul className="text-sm grid grid-cols-2 gap-x-4" data-testid="outlier-decomposition">
              {Object.entries(r.decomposition).map(([k, v]) => (
                <li key={k}>
                  {k}: {v ?? "—"}
                </li>
              ))}
              {Object.keys(r.decomposition).length === 0 ? <li>—</li> : null}
            </ul>
            <div className="text-sm" data-testid="outlier-meeting">
              {t("performanceCenter.outliers.meeting", { defaultValue: "MT-4 meeting" })}:{" "}
              {r.meeting ? (
                <>
                  <Link className="underline" to={`/management/meetings/${encodeURIComponent(r.meeting.meeting_id)}`}>
                    {r.meeting.meeting_id}
                  </Link>
                  {r.meeting.status ? ` (${r.meeting.status})` : null}
                  {r.meeting.unavailable_reason ? ` — ${r.meeting.unavailable_reason}` : null}
                </>
              ) : (
                t("performanceCenter.outliers.noMeeting", { defaultValue: "none convened" })
              )}
            </div>
            <div className="text-sm" data-testid="outlier-hypothesis">
              {t("performanceCenter.outliers.hypothesis", { defaultValue: "Hypothesis validation" })}: {hs.status}
              {hs.reason ? ` (${hs.reason})` : null}
              {rows.length > 0 ? (
                <ul className="list-disc pl-5">
                  {rows.map((h, i) => (
                    <li key={i}>
                      {h.text} — {h.status}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        );
      })}
    </section>
  );
};
