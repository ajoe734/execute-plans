// Phase 13.G — MCP server-level secrets panel with rotate confirm.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";
import type { McpSecret, McpServer } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import {
  MockDataEmptyState,
} from "@/components/data/MockDataBadge";
import { getMockDataBadgeModel } from "@/components/data/mockDataBadgeModel";
import { useLiveStatusSnapshot } from "@/lib/bff/liveTransport";

const fmtAge = (iso: string) => {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400_000);
  return `${days}d ago`;
};

export const McpSecretsPanel = ({ server }: { server: McpServer }) => {
  const t = useT();
  const liveStatus = useLiveStatusSnapshot();
  const secretsGate = getMockDataBadgeModel("bff.mcpSecrets.forServer", liveStatus);
  const [secrets, setSecrets] = useState<McpSecret[]>([]);
  const [rotate, setRotate] = useState<McpSecret | null>(null);
  useEffect(() => { bff.mcpSecrets.forServer(server.id).then(setSecrets); }, [server.id]);

  return (
    <>
      <Card className="p-0 divide-y divide-border">
        {secrets.length === 0 && secretsGate ? (
          <MockDataEmptyState helperName="bff.mcpSecrets.forServer" className="border-0" />
        ) : secrets.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">{t("empty.none")}</div>
        ) : null}
        {secrets.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-mono text-sm">{s.name}</div>
              <div className="text-mono text-[11px] text-muted-foreground">{t("phase13.mcp.secrets.masked")}</div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground shrink-0">
              <div className="uppercase tracking-wider">{t("phase13.mcp.secrets.lastRotated")}</div>
              <div className="text-mono text-foreground">{fmtAge(s.lastRotatedAt)} · {s.rotatedBy}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setRotate(s)}>
              {t("phase13.mcp.secrets.rotate")}
            </Button>
          </div>
        ))}
      </Card>
      <HighRiskConfirm
        open={!!rotate}
        onOpenChange={(o) => !o && setRotate(null)}
        title={`${t("phase13.mcp.secrets.rotate")} — ${rotate?.name ?? ""}`}
        description={t("detail.confirm.rotateSecret")}
        confirmToken="ROTATE"
        destructive
        onConfirm={async (memo) => {
          await bff.mutations.rotateMcpSecret(rotate!.id, memo);
          setSecrets((ss) => ss.map((x) => x.id === rotate!.id ? { ...x, lastRotatedAt: new Date().toISOString(), rotatedBy: "you" } : x));
          toast.success(t("phase13.mcp.secrets.queued"));
          setRotate(null);
        }}
      />
    </>
  );
};
