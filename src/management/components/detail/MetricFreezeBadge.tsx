import { Badge } from "@/components/ui/badge";
import { Lock, Unlock } from "lucide-react";
import { useT } from "@/platform/hooks";

export const MetricFreezeBadge = ({ frozen }: { frozen: boolean }) => {
  const t = useT();
  return frozen ? (
    <Badge variant="outline" className="border-status-warning/40 text-status-warning bg-status-warning/10 text-[10px] gap-1">
      <Lock className="h-3 w-3" />{t("studios.freeze.frozen")}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] gap-1">
      <Unlock className="h-3 w-3" />{t("studios.freeze.liquid")}
    </Badge>
  );
};
