import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { Tool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";

export const ToolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [tool, setTool] = useState<Tool | undefined>();
  useEffect(() => { if (id) bff.tools.get(id).then(setTool); }, [id]);
  if (!tool) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <ObjectDetailLayout
      object={tool}
      subtitle={`${tool.category} · v${tool.version}`}
      tabs={[
        {
          value: "overview", label: "Overview",
          content: (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Category" value={tool.category.toUpperCase()} />
                <StatCard label="Version" value={tool.version} />
                <StatCard label="Inputs" value={tool.inputs} />
                <StatCard label="Used by" value={tool.usedBy} />
              </div>
              <Section title="Description">
                <p className="text-sm leading-relaxed">{tool.description}</p>
              </Section>
              <Section title="Schema">
                <Field label="Tool ID" value={tool.id} mono />
                <Field label="Owner" value={tool.owner} mono />
              </Section>
            </>
          ),
        },
        { value: "consumers", label: "Consumers", content: <Placeholder text="Strategies, personas, and skills using this tool." /> },
        { value: "audit", label: "Audit", content: <Placeholder text="Tool-level invocation audit log." /> },
      ]}
    />
  );
};
