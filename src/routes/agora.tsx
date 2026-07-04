import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TradingDeskLayout } from "@/agora/TradingDeskLayout";
import { TradingRoomPage } from "@/agora/pages/trading-room/TradingRoomPage";
import { StrategyWorkshopPage } from "@/agora/pages/strategy-workshop/StrategyWorkshopPage";

export function AgoraLayoutRoute() {
  return <TradingDeskLayout />;
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
