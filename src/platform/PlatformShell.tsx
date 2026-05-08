import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useLocaleSync } from "./hooks";
import { useMockRealtimeTicker } from "@/lib/useMockRealtime";
import { RightDrawer } from "./components/RightDrawer";
import { NotificationCenter } from "./components/NotificationCenter";
import { JobProgressDrawer } from "./components/JobProgressDrawer";
import { HandoffDrawer } from "./components/HandoffDrawer";
import { LiveBffBanner } from "./components/LiveBffBanner";
import { BulkResultDrawer } from "./components/BulkResultDrawer";
import { RollbackSagaDrawer } from "./components/RollbackSagaDrawer";
import { KeyboardShortcutsHelp, useGlobalShortcuts } from "./components/KeyboardShortcutsHelp";
import { useOverlay } from "./overlayStore";
import { connectLiveSse, disconnectLiveSse } from "@/lib/bff-v1";

export const PlatformShell = () => {
  useLocaleSync();
  useMockRealtimeTicker();
  const { helpOpen, setHelpOpen } = useGlobalShortcuts();
  const bulkResult = useOverlay((s) => s.bulkResult);
  const bulkResultTitle = useOverlay((s) => s.bulkResultTitle);
  const closeBulkResult = useOverlay((s) => s.closeBulkResult);

  useEffect(() => {
    connectLiveSse();
    return () => { disconnectLiveSse(); };
  }, []);
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LiveBffBanner />
      <TopBar />
      <div className="flex-1 flex">
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
