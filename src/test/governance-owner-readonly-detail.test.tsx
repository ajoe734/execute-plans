import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ApprovalRequest } from "@/lib/bff-v1";
import { GovernanceReview } from "@/management/pages/GovernanceReview";

const mocks = vi.hoisted(() => ({
  approvalGet: vi.fn(),
  auditList: vi.fn(),
  decideApproval: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      approvals: { ...actual.bffV1.approvals, get: mocks.approvalGet },
      audit: { ...actual.bffV1.audit, list: mocks.auditList },
    },
  };
});

vi.mock("@/lib/bff-v1/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1/writes")>();
  return {
    ...actual,
    bffWrites: {
      ...actual.bffWrites,
      decideApproval: mocks.decideApproval,
    },
  };
});

void i18n.changeLanguage("en-US");

function renderReview(id: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/governance/${encodeURIComponent(id)}`]}>
        <Routes>
          <Route path="/management/governance/:id" element={<GovernanceReview />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("GovernanceReview owner-bound read-only detail", () => {
  beforeEach(() => {
    mocks.approvalGet.mockReset();
    mocks.auditList.mockReset();
    mocks.decideApproval.mockReset();
    mocks.auditList.mockResolvedValue([]);
  });

  it("renders genuine owner-bound case ID, version, canonical state, target_id, and target_version", async () => {
    const caseId = "approval-paper-human-quorum-closeout-20261010-v1";
    const targetId = "pool-paper-human-quorum-closeout-20261010-v1";
    const targetVersion = "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b";

    const genuineCase: ApprovalRequest = {
      id: caseId,
      kind: "Strategy",
      subject: "Paper approval human quorum closeout",
      requester: "operator-human-1",
      state: "pending",
      version: 1,
      targetId,
      targetVersion,
      targetConflict: false,
      riskLevel: "high",
      createdAt: "2026-10-10T12:00:00Z",
    };

    mocks.approvalGet.mockResolvedValue(genuineCase);
    renderReview(caseId);

    // Header and case identification
    expect(await screen.findByText("Paper approval human quorum closeout")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${caseId} · Strategy · v1`))).toBeInTheDocument();

    // Summary fields
    expect(screen.getByText("Case ID")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Canonical State")).toBeInTheDocument();
    expect(screen.getByText("Target ID")).toBeInTheDocument();
    expect(screen.getByText("Target Version")).toBeInTheDocument();

    // Field values
    expect(screen.getAllByText(caseId).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText(targetId)).toBeInTheDocument();
    expect(screen.getByText(targetVersion)).toBeInTheDocument();

    // Strictly zero write calls triggered
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });

  it("renders visibly Unavailable for missing version, target_id, and target_version without guessing or fabricating", async () => {
    const caseId = "approval-unversioned-case";
    const unversionedCase: ApprovalRequest = {
      id: caseId,
      kind: "Allocation",
      subject: "Unversioned Approval",
      requester: "operator-2",
      state: "pending",
      riskLevel: "medium",
      createdAt: "2026-10-10T12:00:00Z",
    };

    mocks.approvalGet.mockResolvedValue(unversionedCase);
    renderReview(caseId);

    expect(await screen.findByText("Unversioned Approval")).toBeInTheDocument();
    const unavailableElements = screen.getAllByText("Unavailable");
    // At least 3 fields (Version, Target ID, Target Version) must report Unavailable
    expect(unavailableElements.length).toBeGreaterThanOrEqual(3);

    // Ensure no invented version or fabricated hash appears
    expect(screen.queryByText(/v[0-9]+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/e9c7c073/)).not.toBeInTheDocument();
  });

  it("renders visibly Unavailable for conflicting canonical target fields without guessing", async () => {
    const caseId = "approval-conflict-case";
    const conflictCase: ApprovalRequest = {
      id: caseId,
      kind: "Strategy",
      subject: "Conflict Approval",
      requester: "operator-3",
      state: "pending",
      version: 2,
      targetConflict: true,
      riskLevel: "critical",
      createdAt: "2026-10-10T12:00:00Z",
    };

    mocks.approvalGet.mockResolvedValue(conflictCase);
    renderReview(caseId);

    expect(await screen.findByText("Conflict Approval")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    // Conflicting target fields are visibly unavailable
    const unavailableElements = screen.getAllByText("Unavailable");
    expect(unavailableElements.length).toBeGreaterThanOrEqual(2);
  });

  it("maintains strict read-only posture without automatic votes or product writes on navigation", async () => {
    const caseId = "approval-readonly-check";
    const pendingCase: ApprovalRequest = {
      id: caseId,
      kind: "Strategy",
      subject: "Read-only Check",
      requester: "operator-4",
      state: "pending",
      version: 3,
      targetId: "pool-safe",
      targetVersion: "ver-safe",
      riskLevel: "high",
      createdAt: "2026-10-10T12:00:00Z",
    };

    mocks.approvalGet.mockResolvedValue(pendingCase);
    renderReview(caseId);

    await waitFor(() => {
      expect(mocks.approvalGet).toHaveBeenCalledWith(caseId);
    });

    // Zero decision writes
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });
});
