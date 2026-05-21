import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import type { ReadinessPacket } from "@/lib/v5/management/readiness";

const tone = (s: ReadinessPacket["status"]) =>
  s === "verified" ? "bg-status-success/15 text-status-success border-status-success/30" :
  s === "stale" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "missing" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  "bg-muted text-muted-foreground border-border";

export const EvidencePacketList = ({ packets }: { packets: ReadinessPacket[] }) => (
  <Card className="p-4">
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Evidence Packets</h2>
    {packets.length === 0 ? (
      <p className="mt-3 text-xs text-muted-foreground">No packets attached.</p>
    ) : (
      <ul className="mt-3 space-y-2" role="list">
        {packets.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{p.packetType}</div>
              <div className="text-xs text-muted-foreground">
                id: <span className="font-mono">{p.id}</span>
                {p.hash && <> · hash: <span className="font-mono">{p.hash.slice(0, 12)}…</span></>}
                {p.linkedObject && <> · linked: <span className="font-mono">{p.linkedObject}</span></>}
                {" · "}<time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleString()}</time>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={tone(p.status)}>{p.status}</Badge>
              {p.href && (
                <Link to={p.href} className="text-xs text-primary underline-offset-4 hover:underline">
                  View
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
