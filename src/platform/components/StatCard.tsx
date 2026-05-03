import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export const StatCard = ({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "warning" | "danger" | "success" }) => {
  const toneCls = {
    default: "text-foreground",
    warning: "text-status-warning",
    danger: "text-status-failed",
    success: "text-status-success",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold text-mono ${toneCls}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
};
