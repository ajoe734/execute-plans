import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { PageBody } from "@/platform/components/PageHeader";
import { EntityHeader } from "@/platform/components/EntityHeader";
import { useT } from "@/platform/hooks";
import type { BaseObject } from "@/lib/bff/types";

export interface DetailTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface Props<T extends BaseObject> {
  object: T;
  subtitle?: string;
  actions?: ReactNode;
  tabs: DetailTab[];
  defaultTab?: string;
  env?: "research" | "paper" | "live";
}

export function ObjectDetailLayout<T extends BaseObject>({ object, subtitle, actions, tabs, defaultTab, env }: Props<T>) {
  return (
    <>
      <EntityHeader object={object} subtitle={subtitle} actions={actions} env={env} />
      <PageBody>
        <Tabs defaultValue={defaultTab ?? tabs[0].value}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">{tab.content}</TabsContent>
          ))}
        </Tabs>
      </PageBody>
    </>
  );
}

export const Field = ({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-sm ${mono ? "text-mono" : ""}`}>{value}</div>
  </div>
);

export const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
  <Card className="p-4 space-y-3">
    {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
    {children}
  </Card>
);

export const Placeholder = ({ text }: { text: string }) => (
  <Card className="p-6 text-sm text-muted-foreground text-center">{text}</Card>
);
// useT preserved for future tab-level helpers; intentional named re-export.
export { useT };


export const Field = ({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-sm ${mono ? "text-mono" : ""}`}>{value}</div>
  </div>
);

export const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
  <Card className="p-4 space-y-3">
    {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
    {children}
  </Card>
);

export const Placeholder = ({ text }: { text: string }) => (
  <Card className="p-6 text-sm text-muted-foreground text-center">{text}</Card>
);
