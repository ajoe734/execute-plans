// 2026-05-20 revamp §8 — Management NL Console.
// Phase 1: fixed_mock only. NO network. NO Lovable AI Gateway.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { askManagementNl, readManagementNlEnv, ManagementNlError } from "@/lib/bff-v1/managementNl";
import type { ManagementNlAnswer } from "@/lib/v5/management/nl";

export const ManagementNlConsole = () => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<ManagementNlAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const env = readManagementNlEnv();

  const suggestions = [
    t("mgmt.nl.suggestions.whoNeedsMe"),
    t("mgmt.nl.suggestions.fleetHealth"),
    t("mgmt.nl.suggestions.pulseSummary"),
    t("mgmt.nl.suggestions.evolutionRecent"),
  ];

  const ask = (text: string) => {
    setError(null); setAnswer(null);
    try {
      const a = askManagementNl({ prompt: text }, env);
      setAnswer(a);
    } catch (e) {
      if (e instanceof ManagementNlError) setError(`${e.code}: ${e.message}`);
      else setError(String(e));
    }
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.nl.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.nl.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.nl.subtitle")}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">provider: {env.provider}</Badge>
          <Badge variant="outline">gatewayEnabled: {String(env.gatewayEnabled)}</Badge>
          <Badge variant="outline">strict: {String(env.strict)}</Badge>
        </div>
      </header>

      <Card className="p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) ask(prompt.trim()); }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label className="sr-only" htmlFor="nl-prompt">{t("mgmt.nl.question")}</label>
          <input
            id="nl-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("mgmt.nl.placeholder")}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit">{t("mgmt.actions.ask")}</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => { setPrompt(s); ask(s); }}>
              {s}
            </Button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-status-failed/40">
          <p className="text-sm text-status-failed">{error}</p>
        </Card>
      )}

      {answer && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">intent: {answer.intent}</Badge>
            <Badge variant="outline">provider: {answer.provider}</Badge>
            {answer.refused && <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">{t("mgmt.nl.refused")}</Badge>}
          </div>
          <p className="text-sm text-foreground">{answer.summary}</p>
          {answer.bullets && answer.bullets.length > 0 && (
            <ul className="ml-5 list-disc text-sm text-muted-foreground">
              {answer.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          {answer.followups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {answer.followups.map((f) => (
                <Button key={f.href} asChild variant="outline" size="sm">
                  <Link to={f.href}>{f.label}</Link>
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}
    </section>
  );
};
