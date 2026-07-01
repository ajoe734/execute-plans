import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { PageBody } from "@/platform/components/PageHeader";
import { EntityHeader } from "@/platform/components/EntityHeader";
import { EmptyState } from "@/components/ui/empty-state";
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
    <div className={`mt-0.5 text-sm ${mono ? "text-mono" : ""}`}>{value === undefined || value === null || value === "" ? "—" : value}</div>
  </div>
);

export const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
  <Card className="p-4 space-y-3">
    {title && <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
    {children}
  </Card>
);

/** Detail-page equivalent of ObjectListPage's degraded EmptyState — used when a
 *  detail id resolves to no live record (e.g. an empty capability registry)
 *  instead of leaving the page stuck on a permanent loading spinner. */
export const DetailNotFound = ({ title, description }: { title: string; description: string }) => (
  <PageBody>
    <EmptyState icon={<Inbox className="h-8 w-8" />} title={title} description={description} />
  </PageBody>
);

// useT preserved for future tab-level helpers; intentional named re-export.
export { useT };

