import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { legacyBff as bff } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { SearchResult } from "@/lib/bff/types";

const typeRoute: Record<string, string> = {
  Strategy: "/management/strategies",
  Persona: "/management/personas",
  CapitalPool: "/management/capital-pools",
  RankingFormula: "/management/ranking-formulas",
  Rebalance: "/management/rebalances",
  Deployment: "/management/deployments",
};

const TYPE_ORDER = ["Strategy", "Persona", "CapitalPool", "RankingFormula", "Rebalance", "Deployment"];

export const CommandPalette = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void bff.search(q).then((r) => active && setResults(r as SearchResult[]));
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
                        const route = typeRoute[r.type];
                        if (route) navigate(`${route}/${r.id}`);
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
