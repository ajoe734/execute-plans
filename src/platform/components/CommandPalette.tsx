import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { bff } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { SearchResult } from "@/lib/bff/types";

const entityRoute: Record<string, (id: string) => string> = {
  Strategy: (id) => `/management/strategies/${encodeURIComponent(id)}`,
  Persona: (id) => `/management/personas/${encodeURIComponent(id)}`,
  CapitalPool: (id) => `/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(id)}`,
  RankingFormula: (id) => `/management/promotion-allocation?tab=formula-policy&formula_id=${encodeURIComponent(id)}`,
  Rebalance: (id) => `/management/promotion-allocation?tab=quarterly-capital&rebalance_id=${encodeURIComponent(id)}`,
  Deployment: (id) => `/management/deployments/${encodeURIComponent(id)}`,
  ResearchExperiment: (id) => `/management/experiments/${encodeURIComponent(id)}`,
  Experiment: (id) => `/management/experiments/${encodeURIComponent(id)}`,
  Artifact: (id) => `/management/artifacts/${encodeURIComponent(id)}`,
  Loop: (id) => `/management/loops?run=${encodeURIComponent(id)}`,
  Oversight: () => "/management/cockpit",
};

const TYPE_ORDER = [
  "Strategy",
  "Persona",
  "CapitalPool",
  "RankingFormula",
  "Rebalance",
  "Deployment",
  "ResearchExperiment",
  "Experiment",
  "Artifact",
  "Loop",
  "Oversight",
];

export const CommandPalette = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    // Don't fire on mount with an empty query, and never let a failed/aborted
    // search bubble as an unhandled rejection (strict-mode transport throws).
    if (!q.trim()) {
      setResults([]);
      return;
    }
    bff.search(q)
      .then((r) => { if (active) setResults(r as SearchResult[]); })
      .catch(() => { if (active) setResults([]); });
    return () => { active = false; };
  }, [q]);

  const grouped = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    for (const r of results) (g[r.type] ||= []).push(r);
    return TYPE_ORDER.filter((k) => g[k]?.length).map((k) => [k, g[k]] as const);
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("topbar.search")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            {grouped.map(([type, items], idx) => (
              <div key={type}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={type}>
                  {items.map((r) => (
                    <CommandItem
                      key={r.id}
                      onSelect={() => {
                        onOpenChange(false);
                        const route = entityRoute[r.type];
                        if (route) navigate(route(r.id));
                      }}
                    >
                      <span className="text-muted-foreground text-mono text-[10px] uppercase mr-3 w-20">{r.id}</span>
                      <span className="flex-1">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.owner}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
