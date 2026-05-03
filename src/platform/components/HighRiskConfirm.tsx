import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/platform/hooks";
import { usePlatform } from "@/platform/store";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmToken: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const HighRiskConfirm = ({ open, onOpenChange, title, description, confirmToken, destructive, onConfirm }: Props) => {
  const t = useT();
  const env = usePlatform((s) => s.env);
  const [typed, setTyped] = useState("");
  const requireExtra = env === "live";
  const ok = typed === confirmToken;

  return (
    <Dialog open={open} onOpenChange={(o) => { setTyped(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={destructive ? "text-destructive h-5 w-5" : "text-status-warning h-5 w-5"} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireExtra && (
          <div className="rounded-md border border-env-live-accent/40 bg-env-live-bg/30 px-3 py-2 text-sm text-env-live-accent font-medium">
            {t("confirm.liveWarning")}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">{t("confirm.typeToConfirm", { token: confirmToken })}</Label>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="text-mono" autoFocus />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ok}
            onClick={async () => { await onConfirm(); onOpenChange(false); }}
          >
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
