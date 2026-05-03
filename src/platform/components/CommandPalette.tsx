import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { bff } from "@/lib/bff/client";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("topbar.search")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup heading="Results">
              {results.map((r) => (
                <CommandItem
                  key={r.id}
                  onSelect={() => {
                    onOpenChange(false);
                    const route = typeRoute[r.type];
                    if (route) navigate(`${route}/${r.id}`);
                  }}
                >
                  <span className="text-muted-foreground text-xs uppercase mr-3 w-28">{r.type}</span>
                  <span className="flex-1">{r.name}</span>
                  <span className="text-xs text-muted-foreground">{r.owner}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
