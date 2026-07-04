import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TradingDeskLayout } from "@/agora/TradingDeskLayout";
import { TradingRoomPage } from "@/agora/pages/trading-room/TradingRoomPage";
import { StrategyWorkshopPage } from "@/agora/pages/strategy-workshop/StrategyWorkshopPage";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import { useLiveSseConnection } from "@/platform/hooks";

// Agora is an intentional standalone workbench shell (not a Management
// PlatformShell tab). It preserves live/auth status through the same
// LiveStatusBanner + SSE substrate PlatformShell uses, without pulling in
// Management-only chrome (TopBar, NotificationCenter, JobProgressDrawer,
// HandoffDrawer, RollbackSagaDrawer).
export function AgoraLayoutRoute() {
  useLiveSseConnection();
  // useParams() resolves against the full matched route branch in React
  // Router v6, so `workshopId` is populated here even though this component
  // renders at the parent `/agora` layout route, not the
  // `/agora/strategy-workshop/:workshopId` leaf route.
  const { workshopId } = useParams<{ workshopId?: string }>();
  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="agora-standalone-shell">
      <LiveStatusBanner />
      <TradingDeskLayout workshopId={workshopId} />
    </div>
  );
}

export function AgoraTradingRoomRoute() {
  const navigate = useNavigate();
  const { strategyId } = useParams<{ strategyId?: string }>();
  const [searchParams] = useSearchParams();
  const strategyVersion = searchParams.get("strategyVersion") ?? undefined;
  const suffix = strategyVersion ? `?strategyVersion=${encodeURIComponent(strategyVersion)}` : "";

  return (
    <TradingRoomPage
      onBackToWorkshop={() => navigate("/agora/strategy-workshop")}
      onOpenWorkshop={() => navigate("/agora/strategy-workshop")}
      onStrategySelect={(nextStrategyId) =>
        navigate(nextStrategyId ? `/agora/trading-room/${encodeURIComponent(nextStrategyId)}${suffix}` : "/agora/trading-room")
      }
      strategyId={strategyId}
      strategyVersion={strategyVersion}
    />
  );
}

export function AgoraStrategyWorkshopRoute() {
  return <StrategyWorkshopPage />;
}

export function AgoraStrategyPerformanceRoute() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
      策略執行與績效 - 即將推出
    </div>
  );
}

export function AgoraFallbackRoute() {
  return <Navigate to="/agora/trading-room" replace />;
}
