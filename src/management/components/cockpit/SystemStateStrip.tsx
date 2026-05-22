import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import type { SystemStateStripModel } from "@/lib/v5/management/cockpit";

const toneClass = (tone?: "ok" | "warn" | "bad") =>
  tone === "bad"  ? "text-status-failed" :
  tone === "warn" ? "text-status-warning" :
                    "text-foreground";

export const SystemStateStrip = ({ model }: { model: SystemStateStripModel }) => (
  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9" aria-label="System state">
    {model.fields.map((f) => {
      const body = (
        <>
          <div className="text-xs text-muted-foreground">{f.label}</div>
          <div className={"text-lg font-semibold " + toneClass(f.tone)}>{String(f.value)}</div>
        </>
      );
      return (
        <Card key={f.key} className="p-3">
          {f.href ? (
            <Link
              to={f.href}
              className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
              aria-label={`${f.label}: ${f.value}`}
            >
              {body}
            </Link>
          ) : body}
        </Card>
      );
    })}
  </div>
);
