// Planner Response §D04 (2026-05-07) — Shell-mounted drawer wrapping RollbackSagaStepper.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useOverlay } from "@/platform/overlayStore";
import { RollbackSagaStepper } from "./RollbackSagaStepper";

export function RollbackSagaDrawer() {
  const saga = useOverlay((s) => s.rollbackSaga);
  const close = useOverlay((s) => s.closeRollbackSaga);
  return (
    <Sheet open={!!saga} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
        <SheetHeader className="space-y-1.5">
          <SheetTitle className="text-base">Rollback saga</SheetTitle>
          {saga && (
            <SheetDescription className="text-xs text-mono">
              {saga.id} · target {saga.targetEntityType}/{saga.targetEntityId}
            </SheetDescription>
          )}
        </SheetHeader>
        {saga && <div className="mt-4"><RollbackSagaStepper saga={saga} /></div>}
      </SheetContent>
    </Sheet>
  );
}
