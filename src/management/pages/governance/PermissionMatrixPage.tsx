// Phase 11.3 — Permission Matrix surface across 4 instances (persona × tool/mcp/skill/lifecycle).
import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { managementConsoleReads } from "@/lib/bff-v1";
import type { PermissionInstance, PermissionMatrix as Matrix } from "@/lib/bff/types";
import { PermissionMatrix } from "@/management/components/governance/PermissionMatrix";
import { useT } from "@/platform/hooks";

const TABS: PermissionInstance[] = ["persona-tool", "persona-mcp", "persona-skill", "persona-lifecycle"];

export const PermissionMatrixPage = () => {
  const t = useT();
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    managementConsoleReads.permissions()
      .then((envelope) => { if (alive) setMatrices(envelope.items); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageHeader
        title={t("governance.permissions.title")}
        subtitle={t("governance.permissions.subtitle")}
      />
      <PageBody>
        <Tabs defaultValue={TABS[0]}>
          <TabsList>
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k}>{t(`governance.permission.instance.${k}`)}</TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((k) => {
            const m = matrices.find((x) => x.instance === k);
            return (
              <TabsContent key={k} value={k} className="mt-4">
                {m ? (
                  <PermissionMatrix matrix={m} />
                ) : (
                  <Card className="p-8 text-center text-sm text-muted-foreground">
                    {loading ? t("common.loading") : t("empty.none")}
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </PageBody>
    </>
  );
};
