// Persona daily-cycle view (FE-PERSONA-CYCLE-VIEWS-20261112).
// Renders only what the BFF persona detail read returned in data.personaCycle.
// A null section or a non-"ok" surface is shown as unavailable with the owner's
// reason; nothing is derived, defaulted or synthesised here.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { getPacketCaseFileView, type CaseFileRead } from "@/lib/bff-v1/caseFile";
import { CaseFileViewPanel } from "@/management/components/case-file/CaseFileViewPanel";
import { useT } from "@/platform/hooks";
import type { PersonaManagementEnvelope } from "@/lib/bff-v1/personas";

interface Props {
  management: PersonaManagementEnvelope | null | undefined;
  managementUnavailable?: boolean;
}

function Unavailable({ reason, testId }: { reason?: string | null; testId: string }) {
  const t = useT();
  return (
    <div role="status" data-testid={testId}
         className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
      {t("persona.cycle.unavailable", { defaultValue: "無法讀取" })}
      {reason ? <span className="ml-2 font-mono text-xs">({reason})</span> : null}
    </div>
  );
}

function ready(m: PersonaManagementEnvelope | null | undefined, surface: string, value: unknown): boolean {
  const status = m?.meta?.surfaces?.[surface]?.status;
  return value !== null && value !== undefined && (status === undefined || status === "ok");
}
const reasonOf = (m: PersonaManagementEnvelope | null | undefined, surface: string) =>
  m?.meta?.surfaces?.[surface]?.reason ?? null;
const text = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v);

/** Loads the packet's case file on demand through the existing OODA packet detail read. */
function PacketCaseFile({ packetId }: { packetId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<CaseFileRead | "loading" | null>(null);
  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (read === null) {
      setRead("loading");
      void getPacketCaseFileView(packetId).then(setRead);
    }
  };
  return (
    <div className="ml-4">
      <button type="button" onClick={toggle} aria-expanded={open} data-testid={`cycle-casefile-toggle-${packetId}`}
              className="text-xs underline">
        {open ? t("caseFile.close") : t("caseFile.open")}
      </button>
      {open ? (
        read === "loading" || read === null ? (
          <p role="status" className="text-xs text-muted-foreground">{t("caseFile.loading")}</p>
        ) : (
          <CaseFileViewPanel read={read} scope={`packet-${packetId}`} testId={`cycle-casefile-${packetId}`} />
        )
      ) : null}
    </div>
  );
}

export function PersonaCyclePanel({ management, managementUnavailable }: Props) {
  const t = useT();
  const view = management?.data?.personaCycle;
  if (managementUnavailable || !management?.data || !view) {
    return <Unavailable testId="cycle-unavailable-all" />;
  }
  const cycleOk = ready(management, "persona_cycles", view.cycle);
  const memOk = ready(management, "persona_memory_summary", view.memorySummary);
  const memoOk = ready(management, "persona_consultation_memos", view.consultationMemos);
  const harnessOk = ready(management, "persona_harness", view.harness);
  const expOk = ready(management, "harness_experiences", view.harnessExperiences);

  return (
    <div className="space-y-6" data-testid="persona-cycle">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-sm font-medium">{t("persona.cycle.title", { defaultValue: "每日循環紀錄" })}</h4>
          {cycleOk ? (
            <Badge variant="outline" data-testid="cycle-health-status">{view.cycle!.health.status}</Badge>
          ) : null}
        </div>
        {!cycleOk ? (
          <Unavailable testId="cycle-packets-unavailable" reason={reasonOf(management, "persona_cycles")} />
        ) : (
          <ul className="space-y-1" data-testid="cycle-packets">
            {view.cycle!.packets.map((p) => (
              <li key={p.packet_id} data-testid={`cycle-packet-${p.packet_id}`} className="text-sm font-mono">
                {p.packet_id} · {text(p.updated_at)} · {t("persona.cycle.stage", { defaultValue: "階段" })} {text(p.stage)}
                {" · "}{text(p.phase)}
                {p.harness_version != null ? ` · harness v${p.harness_version}` : ""}
                {p.failure_reason ? (
                  <span className="text-destructive" data-testid={`cycle-failure-${p.packet_id}`}>
                    {" · "}{t("persona.cycle.failure", { defaultValue: "失敗原因" })}: {p.failure_reason}
                  </span>
                ) : null}
                <PacketCaseFile packetId={p.packet_id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium">{t("persona.cycle.memory", { defaultValue: "記憶摘要" })}</h4>
        {!memOk ? (
          <Unavailable testId="cycle-memory-unavailable" reason={reasonOf(management, "persona_memory_summary")} />
        ) : (
          <ul className="space-y-1" data-testid="cycle-memory">
            {view.memorySummary!.entries.map((e) => (
              <li key={e.memory_id} className="text-sm">
                <span className="font-mono text-xs">{e.memory_id}</span> · {text(e.memory_type)} · {text(e.written_at)} · {text(e.summary)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium">{t("persona.cycle.memos", { defaultValue: "會診結論" })}</h4>
        {!memoOk ? (
          <Unavailable testId="cycle-memos-unavailable" reason={reasonOf(management, "persona_consultation_memos")} />
        ) : (
          <ul className="space-y-1" data-testid="cycle-memos">
            {view.consultationMemos!.map((m) => (
              <li key={m.memo_id} className="text-sm">
                <span className="font-mono text-xs">{m.memo_id}</span> · {text(m.status)} · {text(m.recommendation)} · {text(m.summary)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium">{t("persona.cycle.harness", { defaultValue: "Harness 版本" })}</h4>
        {!harnessOk ? (
          <Unavailable testId="cycle-harness-unavailable" reason={reasonOf(management, "persona_harness")} />
        ) : (
          <ul className="space-y-1" data-testid="cycle-harness">
            {[...view.harness!.versions].sort((a, b) => b.version - a.version).map((v) => (
              <li key={v.version} data-testid={`cycle-harness-v${v.version}`} className="text-sm font-mono">
                v{v.version}{v.version === view.harness!.active_version ? ` (${t("persona.cycle.active", { defaultValue: "使用中" })})` : ""}
                {" · "}{text(v.created_at)} · {text(v.created_by)} · {text(v.patch_id)} · {text(v.content_digest)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium">{t("persona.cycle.experiences", { defaultValue: "Harness 經驗" })}</h4>
        {!expOk ? (
          <Unavailable testId="cycle-experiences-unavailable" reason={reasonOf(management, "harness_experiences")} />
        ) : (
          <ul className="space-y-1" data-testid="cycle-experiences">
            {view.harnessExperiences!.map((e) => (
              <li key={e.memory_id} className="text-sm">
                <span className="font-mono text-xs">{e.memory_id}</span> · {text(e.summary)}
                {e.experience ? ` · ${text(e.experience.lesson)} · ${text(e.experience.outcome)}` : ""}
                {e.experience?.harness_version != null ? ` · v${e.experience.harness_version}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
