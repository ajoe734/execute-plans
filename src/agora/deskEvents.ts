export const AGORA_LAYOUT_PROPOSAL_REQUEST_EVENT = "agora:layout-proposal-request";
export const AGORA_LAYOUT_PROPOSAL_STATUS_EVENT = "agora:layout-proposal-status";

export type AgoraLayoutProposalSource =
  | "command"
  | "servant_drawer"
  | "proposal_preview"
  | "workspace";

export interface AgoraLayoutProposalRequestDetail {
  instruction: string;
  source: AgoraLayoutProposalSource;
  taskId?: string;
}

export interface AgoraLayoutProposalStatusDetail {
  status: "preview" | "applied" | "rejected" | "error";
  taskId?: string;
  dashboardVersion?: number;
  message?: string;
}

export function requestAgoraLayoutProposal(detail: AgoraLayoutProposalRequestDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AgoraLayoutProposalRequestDetail>(AGORA_LAYOUT_PROPOSAL_REQUEST_EVENT, {
      detail,
    }),
  );
}

export function reportAgoraLayoutProposalStatus(detail: AgoraLayoutProposalStatusDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AgoraLayoutProposalStatusDetail>(AGORA_LAYOUT_PROPOSAL_STATUS_EVENT, {
      detail,
    }),
  );
}
