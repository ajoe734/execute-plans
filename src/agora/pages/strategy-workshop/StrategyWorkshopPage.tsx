import React from "react";
import { WorkshopListView } from "./WorkshopListView";
import {
  WorkshopSessionView,
  type WorkshopInteractionMode,
  type WorkshopInteractionEntry,
  type ResolvedInteractionContext,
  resolvedInteractionContext,
  selectCompareParticipants,
} from "./WorkshopSessionView";

export interface TradingRoomReadinessHandoff {
  strategyId: string;
  strategyVersion: string;
  readinessGate: "trading_room";
  readinessAssessmentId: string;
  workshopId: string;
  workshopVersionId?: string;
  assessedAt?: string;
}

export type {
  WorkshopInteractionMode,
  WorkshopInteractionEntry,
  ResolvedInteractionContext,
};

export {
  WorkshopListView,
  WorkshopSessionView,
  resolvedInteractionContext,
  selectCompareParticipants,
};

export interface StrategyWorkshopPageProps {
  governedProposalId?: string;
  workshopId?: string;
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
  entry?: WorkshopInteractionEntry;
}

export function StrategyWorkshopPage({
  governedProposalId,
  workshopId,
  onAddToTradingRoom,
  entry,
}: StrategyWorkshopPageProps): JSX.Element {
  if (workshopId) {
    return (
      <WorkshopSessionView
        governedProposalId={governedProposalId}
        key={workshopId}
        workshopId={workshopId}
        onAddToTradingRoom={onAddToTradingRoom}
        entry={entry}
      />
    );
  }
  return <WorkshopListView onAddToTradingRoom={onAddToTradingRoom} />;
}

export default StrategyWorkshopPage;
