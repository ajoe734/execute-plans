import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TradingDeskLayout } from "@/agora/TradingDeskLayout";
import { TradingRoomPage } from "@/agora/pages/trading-room/TradingRoomPage";
import { StrategyPerformancePage } from "@/agora/pages/strategy-performance/StrategyPerformancePage";
import {
  StrategyWorkshopPage,
  type TradingRoomReadinessHandoff,
  type WorkshopInteractionEntry,
  type WorkshopInteractionMode,
  type WorkshopParticipantPicker,
} from "@/agora/pages/strategy-workshop/StrategyWorkshopPage";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import { useLiveSseConnection } from "@/platform/hooks";

function tradingRoomHandoffQuery(handoff: TradingRoomReadinessHandoff): string {
  const params = new URLSearchParams({
    readinessAssessmentId: handoff.readinessAssessmentId,
    readinessGate: handoff.readinessGate,
    strategyVersion: handoff.strategyVersion,
    workshopId: handoff.workshopId,
  });
  if (handoff.workshopVersionId) params.set("workshopVersionId", handoff.workshopVersionId);
  if (handoff.assessedAt) params.set("assessedAt", handoff.assessedAt);
  return params.toString();
}

export function safeWorkshopReturnPath(value: string | null): string | undefined {
  const containsUnsafeCharacter = value
    ? Array.from(value).some((character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    : false;
  if (!value || !value.startsWith("/") || value.startsWith("//") || containsUnsafeCharacter) return undefined;
  try {
    const parsed = new URL(value, "https://pantheon.internal");
    if (parsed.origin !== "https://pantheon.internal") return undefined;
    if (!parsed.pathname.startsWith("/management/") && !parsed.pathname.startsWith("/agora/")) return undefined;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

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
    <div
      className="flex h-screen h-dvh min-h-0 flex-col overflow-hidden bg-background"
      data-testid="agora-standalone-shell"
    >
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
  const readinessGate = searchParams.get("readinessGate") ?? undefined;
  const readinessAssessmentId = searchParams.get("readinessAssessmentId") ?? undefined;
  const currentStrategySuffix = (() => {
    const params = new URLSearchParams();
    if (strategyVersion) params.set("strategyVersion", strategyVersion);
    if (readinessGate) params.set("readinessGate", readinessGate);
    if (readinessAssessmentId) params.set("readinessAssessmentId", readinessAssessmentId);
    const query = params.toString();
    return query ? `?${query}` : "";
  })();

  return (
    <TradingRoomPage
      onBackToWorkshop={() => navigate("/agora/strategy-workshop")}
      onOpenWorkshop={() => navigate("/agora/strategy-workshop")}
      onStrategySelect={(nextStrategyId) =>
        navigate(
          nextStrategyId
            ? `/agora/trading-room/${encodeURIComponent(nextStrategyId)}${
                nextStrategyId === strategyId ? currentStrategySuffix : ""
              }`
            : "/agora/trading-room",
        )
      }
      readinessAssessmentId={readinessAssessmentId}
      readinessGate={readinessGate}
      strategyId={strategyId}
      strategyVersion={strategyVersion}
    />
  );
}

export function AgoraStrategyWorkshopRoute() {
  const navigate = useNavigate();
  const { workshopId } = useParams<{ workshopId?: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const picker = searchParams.get("picker");
  const allowedModes = new Set<WorkshopInteractionMode>(["ask", "challenge", "consult", "propose_action", "reflect"]);
  const allowedPickers = new Set<WorkshopParticipantPicker>(["named", "recommended", "committee", "red-team", "same-style", "cross-style"]);
  const entry: WorkshopInteractionEntry = {
    mode: allowedModes.has(mode as WorkshopInteractionMode) ? mode as WorkshopInteractionMode : undefined,
    participantIds: searchParams.get("participants")?.split(",").map((item) => item.trim()).filter(Boolean),
    picker: allowedPickers.has(picker as WorkshopParticipantPicker) ? picker as WorkshopParticipantPicker : undefined,
    returnTo: safeWorkshopReturnPath(searchParams.get("return_to")),
    returnLabel: searchParams.get("return_label") ?? undefined,
  };

  return (
    <StrategyWorkshopPage
      entry={entry}
      onAddToTradingRoom={(handoff) =>
        navigate(
          `/agora/trading-room/${encodeURIComponent(handoff.strategyId)}?${tradingRoomHandoffQuery(handoff)}`,
        )
      }
      workshopId={workshopId}
    />
  );
}

export function AgoraStrategyPerformanceRoute() {
  return <StrategyPerformancePage />;
}

export function AgoraFallbackRoute() {
  return <Navigate to="/agora/trading-room" replace />;
}
