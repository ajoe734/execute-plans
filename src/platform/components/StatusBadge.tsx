import { Badge } from "@/components/ui/badge";
import { sanitizeRawText, statusBadgeClass, statusLabel } from "@/lib/enumLabels";
import { useT } from "@/platform/hooks";

export const StatusBadge = ({ state, label, className }: { state?: string; label?: string; className?: string }) => {
  const t = useT();
  const cleanState = sanitizeRawText(state);
  if (!cleanState) {
    return (
      <Badge
        variant="outline"
        className={`whitespace-nowrap font-medium border-dashed bg-muted/40 text-muted-foreground ${className || ""}`}
      >
        {label ?? "—"}
      </Badge>
    );
  }
  const text = label ?? statusLabel(cleanState, t);
  return (
    <Badge
      variant="outline"
      className={`whitespace-nowrap font-medium ${statusBadgeClass(cleanState)} ${className || ""}`}
    >
      {text}
    </Badge>
  );
};
