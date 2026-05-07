// spec-conflict-G G03/G08/G10/G11 — UI hygiene tests.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { EntityCreateDrawer } from "@/management/components/write/EntityCreateDrawer";
import { ROUTE_LABELS, lookupRouteLabel, buildBreadcrumb } from "@/lib/v4/routeLabels";
import enUS from "@/i18n/locales/en-US";

void i18n.changeLanguage("en-US");

const W = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("spec-conflict-G G10 — entityCreate.* keys exist in en-US", () => {
  it("has all required namespaces", () => {
    const e = (enUS as Record<string, unknown>).entityCreate as Record<string, unknown>;
    expect(e).toBeTruthy();
    for (const k of ["entity", "field", "select", "error", "hint", "placeholder", "footerNote"]) {
      expect(e[k]).toBeDefined();
    }
  });
});

describe("spec-conflict-G G03/G11 — drawer renders + a11y", () => {
  it("capitalPool renders Slider + Select + aria-invalid on error", async () => {
    render(
      <W>
        <EntityCreateDrawer entity="capitalPool" open={true} onOpenChange={() => {}} />
      </W>,
    );
    // Slider role exists for riskBudget (G03)
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
    // Currency select trigger exists (G03)
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);

    // Submitting empty form triggers validation: name required.
    const createBtns = screen.getAllByRole("button", { name: /^Create$/ });
    fireEvent.click(createBtns[createBtns.length - 1]);
    // role="alert" surfaces field errors (G11)
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("strategy renders multi-tag input (G03)", () => {
    render(
      <W>
        <EntityCreateDrawer entity="strategy" open={true} onOpenChange={() => {}} />
      </W>,
    );
    // The multi-tag uses entityCreate.field.personaIds label
    expect(screen.getByText(/Persona IDs/i)).toBeInTheDocument();
  });
});

describe("spec-conflict-G G08 — route label registry single source", () => {
  it("every entry has a non-empty i18n key", () => {
    for (const r of ROUTE_LABELS) {
      expect(r.path.startsWith("/")).toBe(true);
      expect(r.i18nKey.length).toBeGreaterThan(0);
    }
  });
  it("longest-prefix lookup", () => {
    expect(lookupRouteLabel("/management/loops/execution?focus=personas")?.i18nKey)
      .toBe("nav.loopExecution");
    expect(lookupRouteLabel("/management/governance/policies/foo")?.i18nKey)
      .toBe("nav.routePolicies");
  });
  it("breadcrumb chain composes parents", () => {
    const chain = buildBreadcrumb("/management/governance/policies");
    expect(chain.map((c) => c.i18nKey)).toEqual([
      "app.management", "nav.governance", "nav.routePolicies",
    ]);
  });
});
