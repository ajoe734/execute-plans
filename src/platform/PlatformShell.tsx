import { Outlet } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useLocaleSync, useLiveSseConnection } from "./hooks";
import { useMockRealtimeTicker } from "@/lib/useMockRealtime";
import { RightDrawer } from "./components/RightDrawer";
import { NotificationCenter } from "./components/NotificationCenter";
import { JobProgressDrawer } from "./components/JobProgressDrawer";
import { HandoffDrawer } from "./components/HandoffDrawer";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import { BulkResultDrawer } from "./components/BulkResultDrawer";
import { RollbackSagaDrawer } from "./components/RollbackSagaDrawer";
import { KeyboardShortcutsHelp, useGlobalShortcuts } from "./components/KeyboardShortcutsHelp";
import { useOverlay } from "./overlayStore";

export const PlatformShell = () => {
  useLocaleSync();
  useMockRealtimeTicker();
  useLiveSseConnection();
  const { helpOpen, setHelpOpen } = useGlobalShortcuts();
  const bulkResult = useOverlay((s) => s.bulkResult);
  const bulkResultTitle = useOverlay((s) => s.bulkResultTitle);
  const closeBulkResult = useOverlay((s) => s.closeBulkResult);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LiveStatusBanner />
      <TopBar />
      <div className="flex-1 flex pb-10">
        <Outlet />
      </div>
      <RightDrawer />
      <NotificationCenter />
      <JobProgressDrawer />
      <HandoffDrawer />
      <BulkResultDrawer
        open={!!bulkResult}
        onOpenChange={(o) => { if (!o) closeBulkResult(); }}
        title={bulkResultTitle}
        response={bulkResult}
      />
      <RollbackSagaDrawer />
      <KeyboardShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};
