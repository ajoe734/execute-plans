import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
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
}

export function ObjectDetailLayout<T extends BaseObject>({ object, subtitle, actions, tabs, defaultTab }: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title={object.name}
        subtitle={subtitle ?? object.id}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            {actions}
          </div>
        }
      />
      <PageBody>
        <div className="flex items-center gap-2">
          <StatusBadge state={object.state} />
          <RiskBadge level={object.risk} />
          <span className="text-xs text-muted-foreground">
            {t("common.owner")}: <span className="text-mono">{object.owner}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {t("common.updated")}: <span className="text-mono">{new Date(object.updatedAt).toLocaleString()}</span>
          </span>
        </div>

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
