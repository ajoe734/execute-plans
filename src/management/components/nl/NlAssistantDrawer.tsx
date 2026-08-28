// 2026-05-20 PM-8 — Persistent NL shell components.

import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MessagesSquare } from "lucide-react";
import { askManagementNl, ManagementNlError, readManagementNlEnv } from "@/lib/bff-v1/managementNl";
import type { ManagementNlAnswer } from "@/lib/v5/management/nl";
import { useManagementNlContext } from "@/management/hooks/useManagementNlContext";

export const NlAssistantDrawer = () => {
  const { t } = useTranslation();
  const ctx = useManagementNlContext();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<ManagementNlAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAsk = useCallback(() => {
    setError(null);
    setAnswer(null);
    try {
      const env = readManagementNlEnv();
      const enriched = prompt.trim()
        || (ctx.pageLabel ? `Explain this page: ${ctx.pageLabel}` : "");
      if (!enriched) return;
      const a = askManagementNl({ prompt: enriched }, env);
      setAnswer(a);
    } catch (e) {
      if (e instanceof ManagementNlError) setError(`${e.code}: ${e.message}`);
      else setError(String(e));
    }
  }, [prompt, ctx.pageLabel]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label={t("mgmt.nl.drawerOpenAria")}>
          <MessagesSquare className="h-4 w-4" />
          <span className="hidden md:inline">{t("mgmt.actions.askManagement")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("mgmt.nl.drawerTitle")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            {t("mgmt.nl.currentPageFmt")} <span className="text-foreground">{ctx.pageLabel ?? ctx.routePath}</span>
            {ctx.selectedEntityId && (
              <> · {t("mgmt.nl.selectedFmt")} <Badge variant="outline">{ctx.selectedEntityKind}:{ctx.selectedEntityId}</Badge></>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); onAsk(); }}
          >
            <Input
              placeholder={t("mgmt.nl.drawerPlaceholder")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label={t("mgmt.nl.drawerInputAria")}
            />
            <Button type="submit" size="sm">{t("mgmt.actions.ask")}</Button>
          </form>
          {error && (
            <Card className="p-3 border-status-failed/40 bg-status-failed/5">
              <p className="text-xs text-status-failed">{error}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("mgmt.nl.strictModeWarning")}
              </p>
            </Card>
          )}
          {answer && (
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{answer.intent}</Badge>
                <Badge variant="outline">{answer.provider}</Badge>
                {answer.refused && (
                  <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">
                    {t("mgmt.nl.refused")}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-foreground">{answer.summary}</p>
              {answer.bullets && (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {answer.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              {answer.followups.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.followups.map((f) => (
                    <Button key={f.href} asChild size="sm" variant="outline">
                      <Link to={f.href}>{f.label}</Link>
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
