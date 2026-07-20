import { useEffect, useState } from "react";

import { GovernedProposalCard } from "./GovernedProposalCard";
import {
  getGovernedProposal,
  type ProposalSnapshot,
} from "@/lib/bff-v1/agora/governance";

export interface ConnectedGovernedProposalCardProps {
  proposalId: string;
}

function loadErrorMessage(error: unknown): string {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
  if (status === 401 || status === 403) return "You do not have permission to review this governed proposal.";
  if (status === 404) return "This governed proposal was not found or is outside your tenant scope.";
  return "The governed proposal could not be loaded. No decision controls are available.";
}

export function ConnectedGovernedProposalCard({ proposalId }: ConnectedGovernedProposalCardProps) {
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getGovernedProposal(proposalId)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(loadErrorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        data-testid="governed-proposal-load-error"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500"
        data-testid="governed-proposal-loading"
        role="status"
      >
        Loading governed proposal…
      </div>
    );
  }

  return (
    <GovernedProposalCard
      initialEtag={snapshot.etag}
      initialProposal={snapshot.proposal}
      onUpdated={(proposal, etag) => setSnapshot({ proposal, etag })}
    />
  );
}
