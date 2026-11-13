import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@/i18n";
import { CaseFileViewPanel } from "./CaseFileViewPanel";
import { packetView, panelView } from "./__tests__/fixtures";

afterEach(cleanup);

describe("CaseFileViewPanel", () => {
  it("shows groups with excerpt, source and retrieval mode", () => {
    render(<CaseFileViewPanel view={panelView} scope="m" testId="v" />);
    const g = screen.getByTestId("case-file-group-m-similar_history");
    expect(g.textContent).toContain("similar drawdown in Q3");
    expect(screen.getByTestId("case-file-item-m-history:1-mode").textContent).toContain("semantic");
    expect(screen.getByTestId("case-file-item-m-history:1-source").textContent).toContain("src-history:1");
    expect(screen.getByTestId("case-file-m-withheld")).toBeInTheDocument();
  });

  it("shows the recorded reason for an unavailable group instead of a blank area", () => {
    render(<CaseFileViewPanel view={panelView} scope="m" testId="v" />);
    expect(screen.getByTestId("case-file-group-m-evidence-empty-reason").textContent).toContain("evidence_owner_unconfigured");
  });

  it("links each claim to the cited items and flags uncited/unresolved ones", () => {
    render(<CaseFileViewPanel view={panelView} scope="m" testId="v" />);
    const claim0 = screen.getByTestId("v-contribution-0-claim-0");
    fireEvent.click(within(claim0).getByTestId("v-contribution-0-claim-0-cite-lessons:1"));
    expect(document.activeElement?.id).toBe("cf-m-lessons:1");
    const claim1 = screen.getByTestId("v-contribution-0-claim-1");
    expect(within(claim1).getByTestId("v-contribution-0-claim-1-unresolved-lessons:ghost")).toBeInTheDocument();
  });

  it("shows the reason of a rejected uncited contribution", () => {
    render(<CaseFileViewPanel view={panelView} scope="m" testId="v" />);
    expect(screen.getByTestId("v-rejected-0-reason").textContent).toBe("claim_uncited");
  });

  it("shows packet decisions with their citations", () => {
    render(<CaseFileViewPanel view={packetView} scope="p" testId="v" />);
    expect(screen.getByTestId("v-decision-0-cite-facts:1")).toBeInTheDocument();
  });

  it("fails closed with the recorded reason when the view is unavailable or missing", () => {
    const { rerender } = render(<CaseFileViewPanel view={{ status: "unavailable", reason: "no_case_file_recorded", case_file: null }} scope="m" testId="v" />);
    expect(screen.getByTestId("v-unavailable-reason").textContent).toContain("no_case_file_recorded");
    rerender(<CaseFileViewPanel view={undefined} scope="m" testId="v" />);
    expect(screen.getByTestId("v-unavailable-reason").textContent).toContain("case_file_view_not_returned");
  });
});
