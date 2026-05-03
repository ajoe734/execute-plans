import { Outlet } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useLocaleSync } from "./hooks";

export const PlatformShell = () => {
  useLocaleSync();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex">
        <Outlet />
      </div>
    </div>
  );
};
