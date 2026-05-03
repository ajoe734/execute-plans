import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { Channel } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";

export const ChannelDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [c, setC] = useState<Channel | undefined>();
  useEffect(() => { if (id) bff.channels.get(id).then(setC); }, [id]);
  if (!c) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <ObjectDetailLayout
      object={c}
      subtitle={`${c.kind.toUpperCase()} · ${c.subscribers} subscribers`}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Test message sent")}>
          <Send className="h-4 w-4 mr-1" />Send test
        </Button>
      }
      tabs={[
        {
          value: "overview", label: "Overview",
          content: (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Kind" value={c.kind.toUpperCase()} />
                <StatCard label="Subscribers" value={c.subscribers} />
                <StatCard label="Owner" value={c.owner} />
                <StatCard label="State" value={c.state} />
              </div>
              <Section title="Routing">
                <Field label="Destination" value={c.destination} mono />
                <Field label="Filters" value={c.filters ?? "—"} mono />
              </Section>
            </>
          ),
        },
        { value: "history", label: "Recent Messages", content: <Placeholder text="Last 100 messages routed through this channel." /> },
        { value: "audit", label: "Audit", content: <Placeholder text="Channel configuration history." /> },
      ]}
    />
  );
};
