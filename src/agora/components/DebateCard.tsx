import React from "react";
import {
  KeyValueGrid,
  Section,
} from "./WorkshopCardPrimitives";
import {
  formatLabel,
  recordList,
  stringValue,
  workshopCopy,
  type UnknownRecord,
} from "./workshopCardUtils";
import { Bot } from "lucide-react";

export function DebateCard({ payload }: { payload: UnknownRecord }) {
  const exchanges = recordList(payload.exchanges ?? payload.rounds ?? payload.debate_exchanges);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.debate_id", "辯論編號"), value: payload.debate_id },
          { label: workshopCopy("agora.workshop.cardLabels.topic", "討論主題"), value: payload.topic ?? payload.subject },
          { label: workshopCopy("agora.workshop.cardLabels.round_count", "回合數"), value: exchanges.length },
          { label: workshopCopy("agora.workshop.cardLabels.consensus_trend", "共識趨勢"), value: payload.consensus_trend ?? payload.trend },
        ]}
      />

      {payload.summary && (
        <Section title={workshopCopy("agora.workshop.cardLabels.debate_summary", "辯論與比較摘要")}>
          <p className="text-xs leading-5 text-foreground/90 bg-muted/30 p-2.5 rounded border border-border/70">
            {stringValue(payload.summary)}
          </p>
        </Section>
      )}

      {exchanges.length > 0 && (
        <Section title={workshopCopy("agora.workshop.cardLabels.exchanges", "交鋒紀錄")}>
          <div className="space-y-3 mt-2">
            {exchanges.map((ex, index) => {
              const personaId = stringValue(ex.persona_id ?? ex.speaker ?? ex.author);
              const personaName = stringValue(ex.persona_name ?? ex.name ?? personaId);
              const stance = stringValue(ex.stance ?? ex.action ?? "comment").toLowerCase();
              const message = stringValue(ex.message ?? ex.content ?? ex.argument);
              const confidence = ex.confidence !== undefined ? Math.round((ex.confidence as number) * 100) : null;

              const stanceColors = {
                approve: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                reject: "bg-rose-500/15 text-rose-300 border-rose-500/30",
                challenge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                comment: "bg-muted/50 text-muted-foreground border-border",
                synthesis: "bg-sky-500/15 text-sky-300 border-sky-500/30",
              }[stance] || "bg-muted/50 text-muted-foreground border-border";

              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border/50 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">
                        {personaName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">({personaId})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${stanceColors}`}>
                        {formatLabel(stance)}
                      </span>
                      {confidence !== null && (
                        <span className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">
                          {confidence}%
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                    {message}
                  </p>
                  {ex.evidence_citations && recordList(ex.evidence_citations).length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted-foreground font-medium mr-1">
                        {workshopCopy("agora.workshop.cardLabels.citations", "引用憑證")}:
                      </span>
                      {recordList(ex.evidence_citations).map((cit, cIndex) => (
                        <span
                          key={cIndex}
                          className="inline-flex items-center text-[9px] font-mono bg-primary/15 text-primary border border-primary/30 px-1 py-0.5 rounded"
                        >
                          {stringValue(cit.ref_id ?? cit.id ?? cit)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
