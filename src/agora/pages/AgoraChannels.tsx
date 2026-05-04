import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/platform/hooks";
import { bff } from "@/lib/bff/client";
import type { Channel } from "@/lib/bff/types";
import { Radio, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const kindTone = (k: string) =>
  k === "slack" ? "bg-status-success/15 text-status-success border-status-success/30"
  : k === "email" ? "bg-accent/15 text-accent border-accent/30"
  : k === "webhook" ? "bg-status-warning/15 text-status-warning border-status-warning/30"
  : "bg-status-paused/15 text-status-paused border-status-paused/30";

export const AgoraChannels = () => {
  const t = useT();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => { bff.channels.list().then(setChannels); }, []);

  return (
    <>
      <PageHeader title={t("nav.channels")} subtitle={t("page.channelsSubtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {channels.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`rounded-md p-2 border ${kindTone(c.kind)}`}>
                  <Radio className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm truncate">{c.name}</h4>
                    <Badge variant="outline" className={`text-[10px] uppercase ${kindTone(c.kind)}`}>{c.kind}</Badge>
                  </div>
                  <div className="text-mono text-xs text-muted-foreground truncate mt-0.5">{c.destination}</div>
                  <div className="text-mono text-[10px] text-muted-foreground mt-1">
                    {t("page.subscribersFmt", { n: c.subscribers, f: c.filters ?? t("common.all") })}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => toast.success(t("table_actions.sendTestSuccess"))}><Send className="h-3 w-3 mr-1" />{t("table_actions.sendTest")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/management/channels/${c.id}`)}><Settings2 className="h-3 w-3 mr-1" />{t("table_actions.configure")}</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {channels.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("page.noChannels")}</Card>}
        </div>
      </PageBody>
    </>
  );
};
