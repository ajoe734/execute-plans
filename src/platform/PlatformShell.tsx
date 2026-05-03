import { Outlet } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useLocaleSync } from "./hooks";
import { useMockRealtimeTicker } from "@/lib/useMockRealtime";
import { RightDrawer } from "./components/RightDrawer";
import { NotificationCenter } from "./components/NotificationCenter";
import { JobProgressDrawer } from "./components/JobProgressDrawer";
import { HandoffDrawer } from "./components/HandoffDrawer";

export const PlatformShell = () => {
  useLocaleSync();
  useMockRealtimeTicker();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex">
        <Outlet />
      </div>
      <RightDrawer />
      <NotificationCenter />
      <JobProgressDrawer />
    </div>
  );
};
