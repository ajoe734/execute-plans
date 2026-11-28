// F13: surviving management reads after retirement of the legacy Agora clients.
import { expect, test, type Page } from "@playwright/test";
import { installContainedLoopbackAuth, installContainedLoopbackAuthAuthority } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

async function installReads(page: Page, journalFails = false) {
  await installContainedLoopbackAuth(page);
  await installQuietEventSource(page);
  const requests: string[] = [];
  await page.route(/\/(?:bff|api\/v1)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": request.headers().origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    requests.push(path);
    let status = 200;
    let data: unknown = [];
    if (path === "/bff/strategies/stg_f13") {
      data = { id: "stg_f13", name: "F13 strategy", alpha: "alpha_f13", state: "discovered", risk: "low", owner: "operator", personaIds: [], pnl30d: 0, sharpe: 0, drawdown: 0 };
    } else if (path === "/bff/agora/journal") {
      status = journalFails ? 503 : 200;
      data = [{ entry_id: "j-f13", subjectKind: "Strategy", subjectId: "stg_f13", title: "F13 retained decision", decidedBy: "operator" }];
    } else if (path.startsWith("/api/v1/postmortems")) {
      const record = { report_id: "pm-f13", incident_id: "inc-f13", title: "F13 persisted review", root_cause: "Persisted timeout diagnosis" };
      data = path === "/api/v1/postmortems" ? [record] : record;
    }
    await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  await installContainedLoopbackAuthAuthority(page);
  return requests;
}

test.describe("F13 retained Agora journal and canonical postmortems", () => {
  test("strategy renders the retained journal through management governance", async ({ page }) => {
    await installReads(page);
    await page.goto("/management/strategies/stg_f13");
    await expect(page.getByText("F13 strategy", { exact: true })).toBeVisible();
    await expect(page.getByText("F13 retained decision", { exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/agora/journal"], a[href^="/agora/memory"]')).toHaveCount(0);
  });

  test("a failed journal read leaves the strategy visible with an error", async ({ page }) => {
    await installReads(page, true);
    await page.goto("/management/strategies/stg_f13");
    await expect(page.getByText("F13 strategy", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Some strategy data could not be loaded: Decision journal" })).toBeVisible();
  });

  test("Postmortems lists API records and opens the matching detail", async ({ page }) => {
    const requests = await installReads(page);
    await page.goto("/management/postmortems");
    await page.getByText("F13 persisted review", { exact: true }).click();
    await expect(page.getByText("Persisted timeout diagnosis", { exact: true })).toBeVisible();
    expect(requests).toContain("/api/v1/postmortems");
    expect(requests).toContain("/api/v1/postmortems/pm-f13");
    expect(requests).not.toContain("/bff/agora/postmortems");
  });

  test("Agora dark theme contrast >= 4.5 and zh-TW empty states for trader with no workshop strategy (FE-AGORA-TRADER-PAGES-20261126)", async ({
    page,
  }) => {
    await installContainedLoopbackAuth(page);
    await installQuietEventSource(page);

    let committeeMode: "populated" | "empty" = "populated";

    await page.route(/\/(?:bff|api\/v1)\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

      const respond = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          headers,
          contentType: "application/json",
          body: JSON.stringify(body),
        });

      if (path === "/bff/agora/workshops") {
        return respond({
          data: {
            items: [
              {
                spec_version: "1.0",
                workshop_id: "ws-001",
                operator_id: "operator-001",
                status: "open",
                subject: {
                  kind: "free_form",
                  ref: "strategy-draft-001",
                  title: "Momentum draft",
                },
                created_at: "2026-11-26T10:00:00Z",
              },
            ],
            total: 1,
          },
        });
      }
      if (path === "/bff/agora/workshops/ws-001") {
        return respond({
          data: {
            spec_version: "1.0",
            workshop_id: "ws-001",
            operator_id: "operator-001",
            status: "open",
            subject: {
              kind: "free_form",
              ref: "strategy-draft-001",
              title: "Momentum draft",
            },
            created_at: "2026-11-26T10:00:00Z",
          },
        });
      }
      if (path === "/bff/agora/workshops/ws-001/completeness") {
        return respond({
          data: {
            snapshot_id: "snap-1",
            workshop_id: "ws-001",
            overall_score: 0.5,
            dimensions: [],
            updated_at: "2026-11-26T10:00:00Z",
          },
        });
      }
      if (path === "/bff/agora/workshops/ws-001/readiness") {
        return respond({
          data: {
            spec_version: "1.0",
            assessment_id: "ready-001",
            assessed_at: "2026-11-26T10:00:00Z",
            assessment_version: 1,
            gates: [{ gate: "trading_room", state: "blocked", requirements: [] }],
            highest_ready_gate: "full_validation",
            workshop_id: "ws-001",
          },
        });
      }
      if (path === "/bff/agora/workshops/ws-001/cards") {
        return respond({ data: { items: [] } });
      }
      if (path === "/bff/agora/workshops/ws-001/events") {
        return respond({ data: { items: [] } });
      }
      if (path === "/bff/agora/workshops/ws-001/versions") {
        return respond({
          data: { versions: [], selected_version_id: null, active_strategy_spec_registry_id: null },
        });
      }
      if (path === "/bff/agora/workshops/ws-001/daily-interactions") {
        return respond({ data: { items: [] } });
      }
      if (path === "/bff/agora/workshops/ws-001/research-plans") {
        return respond({ data: { items: [] } });
      }
      if (path === "/bff/agora/interaction/participants") {
        return respond({ data: { included: [], excluded: [] } });
      }
      if (path === "/bff/agora/interaction/resolve-context") {
        return respond({
          data: {
            workshop_id: "ws-001",
            context_refs: [],
            context_digest: "digest-1",
            environment: "paper",
            verified: true,
            resolved_at: "2026-11-26T10:00:00Z",
            context_binding: {
              binding_id: "binding-ws-001",
              workshop_id: "ws-001",
              tenant_id: "tenant-1",
              source_route: "/agora/strategy-workshop/ws-001",
              focused_object: { kind: "workshop", id: "ws-001" },
              context_refs: [],
              strategy_ref: null,
              decision_ref: null,
              journal_ref: null,
              position_risk_snapshot_refs: [],
              evidence_cutoff: "2026-11-26T10:00:00Z",
              selected_persona_ids: [],
              initial_mode: "ask",
              return_route: "/agora/strategy-workshop/ws-001",
              advice_environment: "paper",
              context_digest: "digest-1",
              resolved_at: "2026-11-26T10:00:00Z",
            },
          },
        });
      }
      if (path === "/bff/agora/committee/sessions") {
        if (committeeMode === "empty") {
          return respond({
            status: "unavailable",
            reason: "no_trader_meetings",
            owner: "consultation",
            data: [],
            fallback_used: false,
            environment_ceiling: "paper",
            execution_authority: "none",
          });
        }
        return respond({
          status: "ok",
          reason: null,
          owner: "consultation",
          data: [
            {
              session_id: "mtg-1",
              meeting_id: "mtg-1",
              request_id: "mtg-1",
              meeting_type: "MT-2",
              consultation_type: "persona_meeting",
              session_class: "deliberative_meeting",
              status: "closed",
              outcome: "completed",
              created_at: "2026-11-26T14:30:00Z",
              topic: "波動率門檻收斂檢討",
              chair_persona_id: "persona-inst-1",
              chair_display_name: "趨勢首席顧問",
              participants: [
                { persona_id: "persona-inst-1", display_name: "趨勢首席顧問", role: "chair" },
                {
                  persona_id: "agora-servant-admintest",
                  display_name: "Your servant",
                  is_caller_servant: true,
                  role: "servant",
                },
              ],
            },
          ],
          fallback_used: false,
          environment_ceiling: "paper",
          execution_authority: "none",
        });
      }
      if (path === "/bff/agora/trading-room") {
        return respond({
          data: {
            data_cutoff: "2026-11-26T15:00:00Z",
            queue_summary: { add: 0, entry: 0, exit: 0, reduce: 0, review: 0 },
            risk_summary: { alerts: [], state: "normal" },
            snapshot_at: "2026-11-26T15:00:00Z",
            spec_version: "1.0",
            strategies: [],
            user_scope_ref: "tenant:test",
            operational_readiness: {
              readiness: "not_configured",
              reason: "no_workshop_strategies",
            },
          },
          meta: {
            operational_readiness: {
              readiness: "not_configured",
              reason: "no_workshop_strategies",
            },
          },
        });
      }
      if (path.startsWith("/bff/agora/trading-room/performance-attribution")) {
        return respond({
          data: {
            dimensions: ["strategy"],
            id: "perf-empty",
            items: [],
            period: "latest",
            summary: {
              basis: "live_telemetry",
              dimensions: ["strategy"],
              holding_count: 0,
              period: "latest",
              returned_row_count: 0,
              row_count: 0,
              runtime_count: 0,
              supported_dimensions: ["strategy"],
              telemetry_runtime_count: 0,
              total_exposure: 0,
              total_notional: 0,
              total_pnl: 0,
              total_trades: 0,
              worst_drawdown: 0,
            },
          },
          meta: {
            composition_sources: ["strategy_directory", "telemetry", "trade_journeys"],
            policy: "read_only_performance_attribution",
            snapshot_at: "2026-11-26T15:00:00Z",
            surfaces: {
              strategy_directory: { status: "empty_fresh", reason: "no_workshop_strategies" },
              telemetry: { status: "empty_fresh", reason: "no_workshop_strategies" },
              trade_journeys: { status: "empty_fresh", reason: "no_workshop_strategies" },
            },
          },
          page_info: { next_page_token: null, page_size: 50, total: 0 },
        });
      }
      return respond({ data: [] });
    });

    await installContainedLoopbackAuthAuthority(page);

    const measureContrast = async (selector: string): Promise<number> => {
      return page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) throw new Error(`Element not found: ${sel}`);

        const parseRgba = (color: string): [number, number, number, number] => {
          const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return [0, 0, 0, 1];
          return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
        };

        const resolveBg = (node: HTMLElement | null): [number, number, number] => {
          let cur: HTMLElement | null = node;
          while (cur) {
            const bg = getComputedStyle(cur).backgroundColor;
            const [r, g, b, a] = parseRgba(bg);
            if (a > 0.05) return [r, g, b];
            cur = cur.parentElement;
          }
          return [17, 20, 23];
        };

        const lum = ([r, g, b]: [number, number, number]): number => {
          const channel = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        const fgRgba = parseRgba(getComputedStyle(el).color);
        const fg: [number, number, number] = [fgRgba[0], fgRgba[1], fgRgba[2]];
        const bg = resolveBg(el);
        const l1 = lum(fg);
        const l2 = lum(bg);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
      }, selector);
    };

    // 1. Strategy Workshop list header contrast >= 4.5
    await page.goto("/agora/strategy-workshop");
    await expect(page.getByTestId("workshop-list-header")).toBeVisible();
    const listHeaderContrast = await measureContrast('[data-testid="workshop-list-header"]');
    expect(listHeaderContrast).toBeGreaterThanOrEqual(4.5);

    // 2. Strategy Workshop session header contrast >= 4.5
    await page.goto("/agora/strategy-workshop/ws-001");
    await expect(page.getByTestId("strategy-workshop-runtime-header")).toBeVisible();
    const sessionHeaderContrast = await measureContrast('[data-testid="strategy-workshop-runtime-header"]');
    expect(sessionHeaderContrast).toBeGreaterThanOrEqual(4.5);

    // 3. Committee selected filter button and meeting code chip contrast >= 4.5
    await page.goto("/agora/committee");
    await expect(page.getByTestId("committee-filter-all")).toBeVisible();
    await expect(page.getByTestId("committee-meeting-type-mtg-1")).toBeVisible();
    const filterContrast = await measureContrast('[data-testid="committee-filter-all"]');
    const chipContrast = await measureContrast('[data-testid="committee-meeting-type-mtg-1"]');
    expect(filterContrast).toBeGreaterThanOrEqual(4.5);
    expect(chipContrast).toBeGreaterThanOrEqual(4.5);

    // 4. Committee empty state when trader has no meetings
    committeeMode = "empty";
    await page.goto("/agora/committee");
    await expect(page.getByTestId("committee-empty-state")).toContainText("你還沒有召開過會議");
    await expect(page.getByTestId("committee-open-workshop")).toContainText("前往策略工坊");

    // 5. Trading Room empty state when trader has no workshop strategies
    await page.goto("/agora/trading-room");
    await expect(page.getByTestId("trading-room-workshop-empty-entry")).toContainText("你還沒有工坊策略");
    await expect(page.getByTestId("trading-room-open-workshop")).toContainText("前往策略工坊");
    await expect(page.getByTestId("trading-room-operational-readiness")).toHaveCount(0);

    // 6. Strategy Performance empty state when trader has no workshop strategies
    await page.goto("/agora/strategy-performance");
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible();
    await expect(page.getByTestId("strategy-performance-workshop-empty")).toContainText("你還沒有工坊策略");
    await expect(page.getByTestId("strategy-performance-open-workshop")).toContainText("前往策略工坊");
    const perfText = await page.getByTestId("strategy-performance-page").innerText();
    expect(perfText).not.toContain("strategy_directory");
    expect(perfText).not.toContain("telemetry");
    expect(perfText).not.toContain("trade_journeys");
    expect(perfText).not.toContain("read_only_performance_attribution");
  });

  test("Agora original IA shell: three zh-TW tabs, trader header, persistent 交代僕人 command bar round trip, and IA 05 legacy redirects (FE-AGORA-SHELL-ORIGINAL-IA-20261127)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
    });
    await installContainedLoopbackAuth(page);
    await installQuietEventSource(page);

    const sessionCalls: Array<{ path: string; body: unknown }> = [];

    await page.route(/\/(?:bff|api\/v1)\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

      const respond = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          headers,
          contentType: "application/json",
          body: JSON.stringify(body),
        });

      if (path === "/bff/agora/me") {
        return respond({
          data: {
            spec_version: "1.0",
            scope_id: "scope-admintest",
            tenant_id: "pantheon-dev",
            user_id: "admintest",
            operator_id: "admintest",
            granted_capabilities: ["agora.identity.v1", "agora.session.v1", "agora.workshop.v1"],
            metadata: {
              trader_name: "admintest",
              trading_style: "主觀與策略交易",
              market_state: "模擬盤監控中",
            },
          },
        });
      }
      if (path === "/bff/agora/capabilities") {
        return respond({
          data: {
            capabilities: [
              { name: "agora.identity.v1" },
              { name: "agora.session.v1" },
              { name: "agora.workshop.v1" },
            ],
          },
        });
      }
      if (path === "/bff/agora/servant") {
        return respond({
          data: {
            persona_id: "agora-servant-799a3ce8c021b91cbb54",
            display_name: "Agora Servant",
            status: "paper_only",
            tenant_id: "pantheon-dev",
            agora_user_id: "admintest",
            capability_summary: { can_ask: true, can_research: true, can_workshop: true },
            policy: { execution_authority: "none" },
          },
        });
      }
      if (path === "/bff/agora/servant/sessions" && request.method() === "POST") {
        const body = request.postDataJSON();
        sessionCalls.push({ path, body });
        return respond(
          {
            data: {
              session_id: "sess-e2e-001",
              servant_persona_id: "agora-servant-799a3ce8c021b91cbb54",
              session_type: "interactive",
              status: "active",
              state: "active",
              metadata: body?.metadata ?? {},
            },
          },
          201,
        );
      }
      if (path === "/bff/agora/servant/sessions/sess-e2e-001/messages" && request.method() === "POST") {
        const body = request.postDataJSON();
        sessionCalls.push({ path, body });
        return respond(
          {
            status: "accepted",
            data: {
              message_id: "servant-msg-e2e-001",
              session_id: "sess-e2e-001",
              session_type: "interactive",
              servant_persona_id: "agora-servant-799a3ce8c021b91cbb54",
              provider: {
                status: "completed",
                answer: "僕人已替您完成目前交易操盤室的分點籌碼與進場條件檢查。",
                error: null,
              },
            },
          },
          202,
        );
      }
      if (path === "/bff/agora/trading-room") {
        return respond({
          data: {
            data_cutoff: "2026-11-27T01:00:00Z",
            queue_summary: { add: 0, entry: 0, exit: 0, reduce: 0, review: 0 },
            risk_summary: { alerts: [], state: "normal" },
            snapshot_at: "2026-11-27T01:00:00Z",
            spec_version: "1.0",
            strategies: [],
            user_scope_ref: "tenant:pantheon-dev",
            operational_readiness: {
              readiness: "not_configured",
              reason: "no_workshop_strategies",
            },
          },
        });
      }
      if (path === "/bff/agora/workshops") {
        return respond({ data: { items: [], total: 0 } });
      }
      return respond({ data: [] });
    });

    await installContainedLoopbackAuthAuthority(page);

    await page.goto("/agora/trading-room");
    const tabBar = page.getByTestId("trading-desk-tab-bar");
    await expect(tabBar).toBeVisible();
    const tabButtons = tabBar.locator("button");
    await expect(tabButtons).toHaveCount(3);
    await expect(tabButtons.nth(0)).toHaveText("交易操盤室");
    await expect(tabButtons.nth(1)).toHaveText("策略工坊");
    await expect(tabButtons.nth(2)).toHaveText("策略執行與績效");
    await expect(page.getByTestId("trading-desk-bottom-strip")).toHaveCount(0);

    // Header checks
    const commandBar = page.getByTestId("trading-desk-command-bar");
    await expect(page.getByTestId("trader-display-name")).toBeVisible();
    await expect(page.getByTestId("trader-style")).toContainText("主觀與策略交易");
    await expect(page.getByTestId("trading-desk-market-state")).toContainText("市場狀態：");
    await expect(page.getByTestId("servant-display-name")).toContainText("專屬僕人");
    await expect(commandBar).not.toContainText("Agora Servant");
    await expect(page.getByTestId("trading-desk-sign-out")).toHaveText("登出");

    // 10 quick tasks & command round trip
    const quickTasks = page.getByTestId("trading-desk-quick-tasks").locator("button");
    await expect(quickTasks).toHaveCount(10);
    await page.getByTestId("trading-desk-command-input").fill("分析分點並檢查進場條件");
    await page.getByTestId("trading-desk-command-submit").click();

    await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible();
    await expect(page.getByTestId("servant-command-reply")).toContainText(
      "僕人已替您完成目前交易操盤室的分點籌碼與進場條件檢查。",
    );
    expect(sessionCalls.length).toBe(2);

    // Legacy route redirects per IA 05
    await page.goto("/agora/daily");
    await expect(page).toHaveURL(/\/agora\/trading-room$/);

    await page.goto("/agora/watchlist");
    await expect(page).toHaveURL(/\/agora\/trading-room\?drawer=watchlist$/);

    await page.goto("/agora/signals");
    await expect(page).toHaveURL(/\/agora\/trading-room\?view=decision-queue$/);

    await page.goto("/agora/notebook");
    await expect(page).toHaveURL(/\/agora\/strategy-workshop$/);
    await expect(page.getByTestId("workshop-open-committee")).toBeVisible();
  });
});
