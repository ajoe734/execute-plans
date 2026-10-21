import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { mgmt } from "@/lib/bff-v1/management";
import { LiveReadinessPage } from "@/management/pages/oversight/LiveReadinessPage";

import ep5Fixture from "./fixtures/hosted-20261020/readiness-ep5.json";
import brokerLiveFixture from "./fixtures/hosted-20261020/readiness-broker-live.json";
import bffHaFixture from "./fixtures/hosted-20261020/readiness-bff-ha.json";
import strictPublishFixture from "./fixtures/hosted-20261020/readiness-strict-publish.json";

void i18n.changeLanguage("en-US");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readiness BFF contract adapter (hosted-20261020 fixtures)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("adapts ep5, broker-live, bff-ha, and strict-publish BFF readiness payloads", async () => {
    const cases = [
      {
        name: "ep5",
        fixture: ep5Fixture,
        call: () => mgmt.readiness.ep5LiveOnly(),
        expectedTitle: "EP5 Readiness",
        expectedCheckCount: 6,
        expectedBlockerCount: 6,
        expectedPacketCount: 7,
        sampleCheckLabel: "EP5 prerequisite evidence bundle",
        sampleBlockerId: "broker-live-readiness",
      },
      {
        name: "broker-live",
        fixture: brokerLiveFixture,
        call: () => mgmt.readiness.brokerLiveOnly(),
        expectedTitle: "Broker Live Readiness",
        expectedCheckCount: 3,
        expectedBlockerCount: 1,
        expectedPacketCount: 2,
        sampleCheckLabel: "Live broker gate",
        sampleBlockerId: "live_broker_gate",
      },
      {
        name: "bff-ha",
        fixture: bffHaFixture,
        call: () => mgmt.readiness.bffHaLiveOnly(),
        expectedTitle: "BFF HA Readiness",
        expectedCheckCount: 4,
        expectedBlockerCount: 4,
        expectedPacketCount: 2,
        sampleCheckLabel: "Dev failover demo packet recorded",
        sampleBlockerId: "dev_failover_demo_packet",
      },
      {
        name: "strict-publish",
        fixture: strictPublishFixture,
        call: () => mgmt.readiness.strictPublishLiveOnly(),
        expectedTitle: "Strict Publish Audit",
        expectedCheckCount: 4,
        expectedBlockerCount: 4,
        expectedPacketCount: 2,
        sampleCheckLabel: "Browser health and /bff/me probe",
        sampleBlockerId: "browser_probe",
      },
    ];

    for (const c of cases) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(c.fixture));
      const model = await c.call();
      expect(model, `${c.name} should not return undefined`).toBeDefined();
      expect(model?.header.title).toBe(c.expectedTitle);
      expect(model?.header.status).toBe("blocked");
      expect(model?.header.canProceed).toBe(false);
      expect(model?.checklist).toHaveLength(c.expectedCheckCount);
      expect(model?.checklist.map((item) => item.label)).toContain(c.sampleCheckLabel);
      expect(model?.blockers).toHaveLength(c.expectedBlockerCount);
      expect(model?.blockers.map((b) => b.id)).toContain(c.sampleBlockerId);
      expect(model?.packets).toHaveLength(c.expectedPacketCount);
    }
  });

  it("renders checks, blockers, and evidence refs on LiveReadinessPage instead of Live readiness data unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(ep5Fixture));

    render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(LiveReadinessPage, {
            title: "EP5 Readiness",
            ariaLabel: "ep5-readiness-test",
            load: () => mgmt.readiness.ep5LiveOnly(),
          }),
        ),
      ),
    );

    expect(await screen.findByText("EP5 prerequisite evidence bundle")).toBeInTheDocument();
    expect(screen.getByText("broker-live-readiness")).toBeInTheDocument();
    expect(screen.getByText("broker-live must be ready before EP5 can proceed.")).toBeInTheDocument();
    expect(screen.getByText("PromotionReadinessPacket schema closeout")).toBeInTheDocument();
    expect(screen.queryByText("Live readiness data unavailable")).not.toBeInTheDocument();
  });
});
