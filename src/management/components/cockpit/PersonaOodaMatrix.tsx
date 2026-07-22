import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import type { PersonaOodaMatrixModel, PersonaOodaCell } from "@/lib/v5/management/cockpit";

const cellTone = (s: PersonaOodaCell["state"]) =>
  s === "alerting" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "blocked"  ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "active"   ? "bg-status-success/15 text-status-success border-status-success/30" :
                     "bg-muted/40 text-muted-foreground border-border";

export const PersonaOodaMatrix = ({ model }: { model: PersonaOodaMatrixModel }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("mgmt.cockpit.personaOoda")}
      </h2>
      <ManagementTableScroll className="mt-3" minScrollWidth={720}>
      <table className="w-full min-w-[720px] text-sm" aria-label={t("mgmt.cockpit.personaOoda")}>
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left">{t("mgmt.fleet.persona")}</th>
            {model.phases.map((p) => <th key={p} className="px-2 py-1 text-left">{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {model.personas.map((pid) => (
            <tr key={pid} className="border-t border-border/60">
              <td className="px-2 py-2 font-mono text-xs">{pid}</td>
              {model.phases.map((phase) => {
                const cell = model.cells.find((c) => c.personaId === pid && c.phase === phase)!;
                const inner = (
                  <span className={"inline-block rounded-md border px-2 py-1 text-xs " + cellTone(cell.state)}>
                    {cell.state}
                  </span>
                );
                return (
                  <td key={phase} className="px-2 py-2">
                    {cell.href ? (
                      <Link to={cell.href} aria-label={`${pid} ${phase} ${cell.state}`}>{inner}</Link>
                    ) : inner}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </ManagementTableScroll>
    </Card>
  );
};
