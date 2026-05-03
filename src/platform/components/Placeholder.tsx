import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";

export const Placeholder = ({ title, hint }: { title: string; hint?: string }) => (
  <>
    <PageHeader title={title} />
    <PageBody>
      <Card className="p-8 text-center text-muted-foreground">
        <div className="text-sm">{hint ?? "This page is scheduled in a later phase."}</div>
      </Card>
    </PageBody>
  </>
);
