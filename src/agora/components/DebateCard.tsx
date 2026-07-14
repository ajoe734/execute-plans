import React from "react";
import {
  KeyValueGrid,
  Pill,
  Section,
} from "./WorkshopCardPrimitives";
import {
  formatLabel,
  recordList,
  stringValue,
  type UnknownRecord,
} from "./workshopCardUtils";
import { MessageSquare, Bot, ArrowRight } from "lucide-react";

export function DebateCard({ payload }: { payload: UnknownRecord }) {
  const exchanges = recordList(payload.exchanges ?? payload.rounds ?? payload.debate_exchanges);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Debate ID", value: payload.debate_id },
          { label: "Topic", value: payload.topic ?? payload.subject },
          { label: "Round Count", value: exchanges.length },
          { label: "Consensus Trend", value: payload.consensus_trend ?? payload.trend },
        ]}
      />

      {payload.summary && (
        <Section title="Debate Summary">
          <p className="text-xs leading-5 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-100">
            {stringValue(payload.summary)}
          </p>
        </Section>
      )}

      {exchanges.length > 0 && (
        <Section title="Exchanges">
          <div className="space-y-3 mt-2">
            {exchanges.map((ex, index) => {
              const personaId = stringValue(ex.persona_id ?? ex.speaker ?? ex.author);
              const personaName = stringValue(ex.persona_name ?? ex.name ?? personaId);
              const stance = stringValue(ex.stance ?? ex.action ?? "comment").toLowerCase();
              const message = stringValue(ex.message ?? ex.content ?? ex.argument);
              const confidence = ex.confidence !== undefined ? Math.round((ex.confidence as number) * 100) : null;
              
              const stanceColors = {
                approve: "bg-green-50 text-green-700 border-green-200",
                reject: "bg-red-50 text-red-700 border-red-200",
                challenge: "bg-amber-50 text-amber-700 border-amber-200",
                comment: "bg-slate-50 text-slate-600 border-slate-200",
                synthesis: "bg-blue-50 text-blue-700 border-blue-200",
              }[stance] || "bg-slate-50 text-slate-600 border-slate-200";

              return (
                <div 
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-50 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-800">
                        {personaName}
                      </span>
                      <span className="text-[10px] text-slate-400">({personaId})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${stanceColors}`}>
                        {formatLabel(stance)}
                      </span>
                      {confidence !== null && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {confidence}% conf
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {message}
                  </p>
                  {ex.evidence_citations && recordList(ex.evidence_citations).length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-medium mr-1">Citations:</span>
                      {recordList(ex.evidence_citations).map((cit, cIndex) => (
                        <span 
                          key={cIndex}
                          className="inline-flex items-center text-[9px] font-mono bg-blue-50/50 text-blue-600 border border-blue-100/50 px-1 py-0.2 rounded"
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
