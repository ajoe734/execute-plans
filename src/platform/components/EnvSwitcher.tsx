import { usePlatform, type Environment } from "@/platform/store";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";
import { Activity, FlaskConical, Zap } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const config: Record<Environment, { icon: typeof Activity; cls: string }> = {
  research: { icon: FlaskConical, cls: "bg-env-research-bg text-env-research border-env-research/30" },
  paper: { icon: Activity, cls: "bg-env-paper-bg text-env-paper border-env-paper/40" },
  live: { icon: Zap, cls: "bg-env-live-bg text-env-live border-env-live/40 ring-1 ring-env-live-accent/30" },
};

export const EnvSwitcher = () => {
  const env = usePlatform((s) => s.env);
  const setEnv = usePlatform((s) => s.setEnv);
  const t = useT();
  const C = config[env];
  const Icon = C.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
          C.cls,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {t(`env.${env}`)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["research", "paper", "live"] as const).map((e) => (
          <DropdownMenuItem key={e} onClick={() => setEnv(e)}>
            {t(`env.${e}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
