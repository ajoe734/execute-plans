/**
 * FE-AGORA-SERVANT-CORE-20261127 — Agora UI for cited data, clarification,
 * habits, paper book, imitation ("僕人模仿您"), and trader reports.
 *
 * Covers:
 *   AC1: All new text is zh-TW; citations (source, as_of, freshness) shown under each servant answer
 *   AC2: Clarification options are clickable and the choice is sent back
 *   AC3: A habits view lets the trader read and correct the profile
 *   AC4: Paper fills and positions are shown with no order action
 *   AC5: 「僕人模仿您」 is shown with its 1,000-resample bootstrap intervals and the luck label (可能是運氣)
 *   AC6: A report history is shown and a report can be requested
 *   AC7: The persona consult control is optional and never blocks the default flow (SD §10)
 *   AC8: Browser proof with screenshots in docs/deployment/evidence/FE-AGORA-SERVANT-CORE-20261127/
 */

import { mkdirSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const TASK_ID = "FE-AGORA-SERVANT-CORE-20261127";
const EVIDENCE_DIR = `docs/deployment/evidence/${TASK_ID}/screenshots`;
const AS_OF = "2026-11-27T08:00:00Z";
const STRATEGY_ID = "strat-core";
const REGISTRY_ID = "registry-core";

const FE_BASE_URL = (
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  ""
).replace(/\/+$/, "");
const IS_HOSTED_FE = Boolean(
  FE_BASE_URL && targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL }),
);
const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);
const TENANT_ID =
  process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";

type Json = Record<string, unknown>;

function json(
  route: Route,
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: false });
}

const WORKSPACE = {
  id: "workspace-core",
  userId: "admintest",
  strategyId: STRATEGY_ID,
  strategyVersion: REGISTRY_ID,
  dashboardVersion: 1,
  activeViewId: "strategy-overview",
  views: [
    {
      id: "strategy-overview",
      title: "策略總覽",
      purpose: "決策佇列與狀態",
      order: 1,
      layoutTemplate: "overview-grid",
      widgetCount: 1,
      dataAvailability: "complete",
      widgets: [
        {
          id: "w-status",
          widgetType: "strategy_status_summary",
          title: "策略狀態摘要",
          purpose: "策略狀態摘要",
          whyIncluded: "V11 View A",
          dataSource: "agora.strategy.summary",
          dataAvailability: "complete",
          query: { filters: { strategy_id: STRATEGY_ID }, limit: 50 },
          chartSpec: {
            spec_version: "1.0",
            kind: "metric",
            encodings: { value: { field: "status", type: "nominal" } },
          },
          interactions: [{ kind: "request_widget_revision" }],
          placement: { x: 0, y: 0, width: 6, height: 3, minWidth: 2, minHeight: 2 },
          minSize: { width: 2, height: 2 },
          maxSize: { width: 12, height: 8 },
          sensitivity: "user_private",
          visible: true,
        },
      ],
    },
  ],
  status: "active",
  generatedBy: "trading_servant",
  createdAt: AS_OF,
  updatedAt: AS_OF,
};

const PAPER_BOOK = {
  agora_user_id: "admintest",
  as_of: AS_OF,
  settlement_source: "pantheon_paper_proxy",
  execution_authority: "none",
  no_order_route_proof: "agora_paper_book_readback_only",
  summary: {
    open_position_count: 1,
    fill_count: 2,
    realized_pnl: 3200,
    unrealized_pnl: 15000,
  },
  positions: [
    {
      position_id: "pos-2330",
      symbol: "2330.TW",
      side: "long",
      quantity: 1000,
      avg_entry_price: 940,
      mark_price: 955,
      unrealized_pnl: 15000,
      strategy_id: STRATEGY_ID,
      settlement_source: "pantheon_paper_proxy",
      updated_at: AS_OF,
    },
  ],
  fills: [
    {
      fill_id: "fill-2330-01",
      symbol: "2330.TW",
      side: "buy",
      quantity: 1000,
      price: 940,
      filled_at: "2026-11-27T01:30:00Z",
      strategy_id: STRATEGY_ID,
      settlement_source: "pantheon_paper_proxy",
    },
    {
      fill_id: "fill-2317-01",
      symbol: "2317.TW",
      side: "sell",
      quantity: 2000,
      price: 210,
      filled_at: "2026-11-26T05:10:00Z",
      strategy_id: STRATEGY_ID,
      settlement_source: "pantheon_paper_proxy",
    },
  ],
};

const IMITATION_COMPARISON = {
  agora_user_id: "admintest",
  strategy_id: STRATEGY_ID,
  title_zh_tw: "僕人模仿您",
  as_of: AS_OF,
  settlement_source: "pantheon_paper_proxy",
  execution_authority: "none",
  sample_size: 12,
  agreement_rate: {
    point_estimate: 0.75,
    ci_lower: 0.5,
    ci_upper: 0.917,
    confidence_level: 0.95,
    resamples: 1000,
    sample_size: 12,
    contains_zero: false,
    luck_label_zh_tw: null,
    status: "ready",
  },
  outcome_gap_vs_trader: {
    point_estimate: 0.014,
    ci_lower: -0.009,
    ci_upper: 0.036,
    confidence_level: 0.95,
    resamples: 1000,
    sample_size: 12,
    contains_zero: true,
    luck_label_zh_tw: "可能是運氣",
    status: "ready",
  },
  differences: [
    {
      decision_id: "dec-im-001",
      symbol: "2330.TW",
      trader_choice: "approve",
      servant_choice: "modify",
      rule_choice: "approve",
      trader_return: 0.018,
      servant_return: 0.032,
      rule_return: 0.018,
      outcome_gap: 0.014,
      settled_at: "2026-11-27T06:00:00Z",
    },
  ],
};

interface ServantCoreFixtureState {
  clarificationChoices: Json[];
  habitCorrections: Json[];
  reportRequests: Json[];
  personaOpinionCalls: string[];
  managementCalls: string[];
}

async function installServantCoreFixture(page: Page): Promise<ServantCoreFixtureState> {
  const state: ServantCoreFixtureState = {
    clarificationChoices: [],
    habitCorrections: [],
    reportRequests: [],
    personaOpinionCalls: [],
    managementCalls: [],
  };

  let currentHabits = {
    agora_user_id: "admintest",
    persona_id: "per_servant_admintest",
    visibility: "persona_private",
    habit_profile: {
      window: "90d",
      min_sample: 5,
      as_of: AS_OF,
      features: [
        {
          key: "holding_horizon",
          label_zh_tw: "持有週期偏好",
          status: "ready",
          sample_size: 12,
          min_sample: 5,
          value: 7.5,
          unit: "days",
        },
        {
          key: "entry_timing",
          label_zh_tw: "進場時機偏好",
          status: "ready",
          sample_size: 10,
          min_sample: 5,
          value: "pullback_to_5ma",
          unit: null,
        },
        {
          key: "size_discipline",
          label_zh_tw: "部位規模紀律",
          status: "ready",
          sample_size: 9,
          min_sample: 5,
          value: 0.88,
          unit: "ratio",
        },
        {
          key: "stop_loss_discipline",
          label_zh_tw: "停損紀律",
          status: "insufficient_sample",
          sample_size: 2,
          min_sample: 5,
          value: null,
          unit: null,
        },
        {
          key: "rule_override_rate",
          label_zh_tw: "規則干預率",
          status: "ready",
          sample_size: 12,
          min_sample: 5,
          value: 0.25,
          unit: "ratio",
        },
        {
          key: "sector_concentration",
          label_zh_tw: "產業集中度偏好",
          status: "ready",
          sample_size: 11,
          min_sample: 5,
          value: "半導體與AI伺服器",
          unit: null,
        },
        {
          key: "workspace_inspection_focus",
          label_zh_tw: "工作區檢視焦點",
          status: "ready",
          sample_size: 15,
          min_sample: 5,
          value: "winner_branch_intelligence",
          unit: null,
        },
      ],
    },
    servant_interpretations: [
      {
        interpretation_id: "hab-int-01",
        feature_key: "holding_horizon",
        statement: "交易員偏好波段持有約 7 至 8 個交易日，不常隔日沖銷。",
        status: "active",
        visibility: "persona_private",
        updated_at: AS_OF,
      },
    ],
  };

  let currentReports = [
    {
      report_id: "rep-weekly-001",
      report_kind: "scheduled_weekly",
      agora_user_id: "admintest",
      persona_id: "per_servant_admintest",
      strategy_id: STRATEGY_ID,
      title: "每週交易員執行與偏離報告",
      generated_at: "2026-11-27T07:00:00Z",
      period_start: "2026-11-20T00:00:00Z",
      period_end: "2026-11-27T07:00:00Z",
      narrative:
        "本週共執行 17 筆模擬交易，僕人模仿一致率 75%，結果差距區間跨零屬可能是運氣。",
      citations: [
        {
          fact_id: "fact-01",
          owner: "performance_attribution",
          source: "agora_performance",
          as_of: "2026-11-27T07:00:00Z",
          statement: "累積模擬損益 +$1,250（共 17 筆成交）",
        },
      ],
      suggested_next_steps: [
        {
          suggestion_id: "sug-01",
          label: "維持五日均量過濾規則並觀察下一週樣本",
        },
      ],
      execution_authority: "none",
    },
  ];

  await page.route(
    (url) => url.pathname.startsWith("/bff/"),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path.startsWith("/bff/management")) {
        state.managementCalls.push(path);
      }
      if (
        path.includes("/interaction/participants") ||
        path.includes("/interaction/submit") ||
        path.includes("/meetings")
      ) {
        state.personaOpinionCalls.push(`${method} ${path}`);
      }

      if (path === "/bff/me") {
        return json(route, {
          data: {
            user: {
              id: "admintest",
              displayName: "admintest",
              email: "admintest@pantheon.local",
            },
            tenant: {
              id: "tenant-dev",
              name: "Pantheon Dev",
              tz: "Asia/Taipei",
              locale: "zh-TW",
              baseCurrency: "TWD",
            },
            session: {
              authenticated: true,
              session_kind: "cookie",
            },
            roles: ["operator", "viewer", "admin"],
            capabilities: [
              "agora.read",
              "agora.write",
              "agora.workshop.v1",
              "agora.persona.interaction.v1",
            ],
            env: "dev",
            featureFlags: {},
            serverTime: AS_OF,
            sessionExpiresAt: "2026-11-28T08:00:00Z",
            permissionsVersion: "core-v1",
          },
        });
      }

      if (path === "/bff/agora/capabilities") {
        return json(route, {
          data: {
            capabilities: [
              "agora.identity.v1",
              "agora.session.v1",
              "agora.workshop.v1",
              "agora.persona.interaction.v1",
              "agora.research.v1",
              "agora.trading.v1",
              "agora.dashboard.v1",
              "agora.personalization.v1",
            ],
          },
        });
      }

      if (path === "/bff/agora/me") {
        return json(route, {
          data: {
            agora_user_id: "admintest",
            display_name: "admintest",
            tenant_id: "tenant-dev",
          },
        });
      }

      if (path === "/bff/agora/servant") {
        return json(route, {
          data: {
            persona_id: "per_servant_admintest",
            display_name: "admintest 的交易僕人",
            status: "paper_only",
            tenant_id: "tenant-dev",
            agora_user_id: "admintest",
            owner_scope: "user_private",
            capability_summary: {
              can_ask: true,
              can_research: true,
              can_workshop: true,
              can_shadow: true,
            },
            policy: {
              advisory_only: true,
              execution_authority: "none",
              can_place_orders: false,
              can_allocate_capital: false,
            },
            created_at: AS_OF,
            last_active_at: AS_OF,
          },
        });
      }

      if (path === "/bff/agora/servant/sessions" && method === "POST") {
        return json(
          route,
          {
            data: {
              session_id: "sess-core-01",
              state: "active",
              tenant_id: "tenant-dev",
              agora_user_id: "admintest",
              persona_id: "per_servant_admintest",
            },
          },
          {},
          201,
        );
      }

      if (
        path === "/bff/agora/servant/sessions/sess-core-01/messages" &&
        method === "POST"
      ) {
        const body = JSON.parse(route.request().postData() || "{}") as Json;
        if (body.clarification_choice) {
          state.clarificationChoices.push(body.clarification_choice as Json);
          return json(
            route,
            {
              data: {
                session_id: "sess-core-01",
                message_id: "msg-core-02",
                turn_id: "turn-core-02",
                turn_status: "completed",
                provider: {
                  status: "completed",
                  answer:
                    "已收錄您的釐清選擇「先試單三分之一部位」，並同步更新進場風控假設。",
                },
                citations: [
                  {
                    source: "workshop_reconstruction",
                    as_of: "2026-11-27T08:02:00Z",
                    freshness: "fresh",
                    detail: "進場規則修訂記錄",
                  },
                ],
                stated_assumptions: ["已採用您確認的三分之一試單規則"],
              },
            },
            {},
            202,
          );
        }

        return json(
          route,
          {
            data: {
              session_id: "sess-core-01",
              message_id: "msg-core-01",
              turn_id: "turn-core-01",
              turn_status: "completed",
              provider: {
                status: "completed",
                answer:
                  "2330.TW 近五日主力分點買超集中於凱基台北，模擬帳本目前持有 1,000 股（未實現損益 +15,000）。",
              },
              citations: [
                {
                  source: "trading_room_readiness",
                  as_of: AS_OF,
                  freshness: "fresh",
                  detail: "贏家分點日級快照",
                },
                {
                  source: "paper_execution_book",
                  as_of: AS_OF,
                  freshness: "fresh",
                  detail: "模擬帳本即時部位",
                },
              ],
              stated_assumptions: ["預設先以五日均量作為流動性門檻"],
              clarification: {
                kind: "clarification_question",
                decision_id: "dec-entry-01",
                question_id: "q-entry-timing",
                question: "當贏家分點連續買超但量能未放大時，您希望如何進場？",
                why_it_matters: "決定首次建倉比例與滑價容忍度",
                options: [
                  {
                    option_id: "wait_breakout",
                    label: "等待帶量突破再建倉",
                    description: "突破五日高點且量增 1.5 倍",
                  },
                  {
                    option_id: "scale_in_early",
                    label: "先試單三分之一部位",
                    description: "分批進場降低追高風險",
                  },
                ],
                servant_default: "先試單三分之一部位",
                resolves: ["entry_rules"],
              },
            },
          },
          {},
          202,
        );
      }

      if (path === "/bff/agora/servant/habits" && method === "GET") {
        return json(route, { data: currentHabits });
      }

      if (path === "/bff/agora/servant/habits" && method === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}") as Json;
        state.habitCorrections.push(body);
        if (body.action === "reject") {
          currentHabits = {
            ...currentHabits,
            servant_interpretations: currentHabits.servant_interpretations.map((item) =>
              item.interpretation_id === body.interpretation_id
                ? { ...item, status: "rejected" }
                : item,
            ),
          };
        } else if (body.action === "add") {
          currentHabits = {
            ...currentHabits,
            servant_interpretations: [
              ...currentHabits.servant_interpretations,
              {
                interpretation_id: "hab-int-02",
                feature_key: String(body.feature_key || "holding_horizon"),
                statement: String(body.statement || ""),
                status: "active",
                visibility: "persona_private",
                updated_at: "2026-11-27T08:05:00Z",
              },
            ],
          };
        }
        return json(route, {
          data: {
            ...currentHabits,
            training_example: {
              id: "te-hab-001",
              visibility: "persona_private",
            },
            correction_receipt: {
              correction_id: "corr-hab-001",
              action: String(body.action || "reject"),
            },
          },
        });
      }

      if (path === "/bff/agora/servant/reports" && method === "GET") {
        return json(route, {
          data: {
            items: currentReports,
            total: currentReports.length,
            quota: {
              daily_limit: 5,
              used_today: currentReports.length,
              remaining_today: Math.max(0, 5 - currentReports.length),
            },
          },
        });
      }

      if (path === "/bff/agora/servant/reports" && method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}") as Json;
        state.reportRequests.push(body);
        const created = {
          report_id: "rep-ondemand-002",
          report_kind: "on_demand",
          agora_user_id: "admintest",
          persona_id: "per_servant_admintest",
          strategy_id: STRATEGY_ID,
          title: "即時申請交易員重點報告",
          generated_at: "2026-11-27T08:15:00Z",
          period_start: "2026-11-20T00:00:00Z",
          period_end: "2026-11-27T08:15:00Z",
          narrative:
            "即時整理完成：最新模擬部位 2330.TW 持有 1,000 股，未實現損益 +$15,000；僕人模仿一致率 75%。",
          citations: [
            {
              fact_id: "fact-02",
              owner: "paper_execution_book",
              source: "pantheon_paper_proxy",
              as_of: "2026-11-27T08:15:00Z",
              statement: "2330.TW 模擬部位 1,000 股（均價 940，現價 955）",
            },
          ],
          suggested_next_steps: [
            {
              suggestion_id: "sug-02",
              label: "檢視停利條件是否需於策略工坊微調",
            },
          ],
          execution_authority: "none",
        };
        currentReports = [created, ...currentReports];
        return json(route, { data: created }, {}, 201);
      }

      if (path === "/bff/agora/trading-room/paper-book") {
        return json(route, { data: PAPER_BOOK });
      }

      if (path === "/bff/agora/trading-room/imitation-comparison") {
        return json(route, { data: IMITATION_COMPARISON });
      }

      if (path === "/bff/agora/trading-room") {
        return json(route, {
          data: {
            spec_version: "1.0",
            user_scope_ref: "core-scope",
            strategies: [
              {
                strategy_id: STRATEGY_ID,
                strategy_spec_registry_id: REGISTRY_ID,
                title: "贏家分點核心策略",
                readiness_state: "ready",
                monitoring_state: "monitoring",
                pending_event_counts: { entry: 1, add: 0, reduce: 0, exit: 0, review: 0 },
                dashboard_recipe_id: "recipe-core",
              },
            ],
            queue_summary: { entry: 1, add: 0, reduce: 0, exit: 0, review: 0 },
            risk_summary: { state: "normal" },
            snapshot_at: AS_OF,
            data_cutoff: AS_OF,
          },
        });
      }

      if (path === "/bff/agora/trading-room/decision-events") {
        return json(
          route,
          { data: { items: [] }, page_info: { total: 0, page_size: 20 } },
          { ETag: '"events-core-v1"' },
        );
      }

      if (path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/workspace`) {
        return json(route, { data: WORKSPACE }, { ETag: '"ws-core-v1"' });
      }

      if (path === "/bff/agora/trading-room/workspaces/workspace-core/versions") {
        return json(route, {
          data: [
            {
              id: "ver-001",
              workspaceId: "workspace-core",
              dashboardVersion: 1,
              generatedBy: "trading_servant",
              changeSummary: "初版操盤室版面",
              createdAt: AS_OF,
            },
          ],
        });
      }

      if (path === `/bff/agora/trading-room/strategies/${STRATEGY_ID}/performance`) {
        return json(route, {
          data: {
            strategy_id: STRATEGY_ID,
            period: "latest",
            environment: "paper",
            no_order_route_proof: "agora_performance_read_only",
            freshness: {
              snapshot_at: AS_OF,
              as_of: AS_OF,
              projection_revision: 1,
              projection_generation: 1,
              unavailable_sources: [],
            },
            compliance: {
              availability: {
                status: "available",
                reason: null,
                source_ids: ["compliance"],
                as_of: AS_OF,
              },
              metrics: [],
            },
            interventions: {
              availability: {
                status: "available",
                reason: null,
                source_ids: ["interventions"],
                as_of: AS_OF,
              },
              aggregate: { total: 0, by_status: {} },
              items: [],
            },
            execution_history: {
              availability: {
                status: "available",
                reason: null,
                source_ids: ["journeys"],
                as_of: AS_OF,
              },
              items: [],
            },
            warnings: {
              availability: {
                status: "available",
                reason: null,
                source_ids: ["warnings"],
                as_of: AS_OF,
              },
              items: [],
            },
            adjustment_suggestions: {
              availability: {
                status: "available",
                reason: null,
                source_ids: ["suggestions"],
                as_of: AS_OF,
              },
              items: [],
            },
          },
          meta: { snapshot_at: AS_OF },
        });
      }

      if (path === "/bff/agora/trading-room/performance-attribution/by-strategy") {
        return json(route, {
          data: {
            dimensions: ["strategy"],
            id: "perf",
            period: "latest",
            summary: {
              basis: "live_telemetry",
              dimensions: ["strategy"],
              holding_count: 1,
              period: "latest",
              returned_row_count: 1,
              row_count: 1,
              runtime_count: 1,
              supported_dimensions: ["strategy"],
              telemetry_runtime_count: 1,
              total_trades: 17,
            },
            items: [
              {
                id: "row-core",
                dimension: "strategy",
                dimension_key: STRATEGY_ID,
                label: "贏家分點核心策略",
                holding_count: 1,
                runtime_count: 1,
                pnl_contribution_pct: 1.0,
                rank: 1,
                metrics: {
                  total_pnl: 1250,
                  total_trades: 17,
                  worst_drawdown: -0.032,
                  holding_count: 1,
                  runtime_count: 1,
                  telemetry_runtime_count: 1,
                  latest_telemetry_at: AS_OF,
                },
                source_refs: { strategy_ids: [STRATEGY_ID] },
              },
            ],
          },
          meta: { policy: "read_only_performance_attribution", snapshot_at: AS_OF },
          page_info: { next_page_token: null, page_size: 50, total: 1 },
        });
      }

      if (path === "/bff/agora/operational-readiness") {
        return json(route, {
          data: {
            status: "healthy",
            source: {
              freshness: "fresh",
              source_instance_id: "src-1",
              snapshot_id: "snap-1",
            },
            signal_producer: { producer_id: "producer-1", status: "healthy" },
            surfaces: {},
          },
        });
      }

      return json(route, { data: { items: [], entries: [] } });
    },
  );

  await page.addInitScript(() => {
    window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
  });
  await installOidcDevLogin(page, {
    goto: false,
    roles: ["operator", "viewer", "admin"],
    tenantId: "tenant-dev",
  });
  await installQuietEventSource(page);
  return state;
}

test.describe("FE-AGORA-SERVANT-CORE-20261127 recorded-fixture proof", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("AC1, AC2, AC3, AC4, AC5, AC6, AC7: citations, clarification card, habits profile & corrections, read-only paper book, 僕人模仿您 bootstrap intervals & luck label, report history & request, and optional persona consult", async ({
    page,
  }) => {
    const state = await installServantCoreFixture(page);

    // 1. Open Trading Room workspace -> verify AC4 (Paper Book positions & fills, no order button)
    await page.goto(`/agora/trading-room/${STRATEGY_ID}?strategyVersion=${REGISTRY_ID}`);
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({
      timeout: 30_000,
    });

    const positionQueue = page.getByTestId("position-action-queue");
    await expect(positionQueue).toBeVisible();
    await expect(page.getByTestId("paper-book-proxy-badge")).toContainText(
      "pantheon_paper_proxy",
    );
    await expect(page.getByTestId("paper-book-no-order-action")).toContainText(
      "僅供唯讀檢視 · 無任何下單按鈕",
    );
    await expect(page.getByTestId("paper-book-positions-list")).toContainText("2330.TW");
    await expect(page.getByTestId("paper-book-fills-list")).toContainText("fill-2330-01");
    await expect(positionQueue.locator("button")).toHaveCount(0);
    await shot(page, "01-trading-room-paper-book-read-only");

    // 2. Ask Servant in 交代僕人 -> verify AC1 (zh-TW citations), AC2 (clickable clarification), AC7 (optional persona consult)
    await page
      .getByTestId("trading-desk-command-input")
      .fill("查詢 2330.TW 分點集中度與加碼條件");
    await page.getByTestId("trading-desk-command-submit").click();

    await expect(page.getByTestId("servant-answer-citations")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("servant-answer-citations")).toContainText(
      "資料出處與新鮮度",
    );
    await expect(page.getByTestId("servant-answer-citations")).toContainText(
      "trading_room_readiness",
    );
    await expect(page.getByTestId("servant-answer-citations")).toContainText(AS_OF);
    await expect(page.getByTestId("servant-answer-citations")).toContainText("fresh");

    const clarificationCard = page.getByTestId("servant-clarification-card");
    await expect(clarificationCard).toBeVisible();
    await expect(clarificationCard).toContainText(
      "當贏家分點連續買超但量能未放大時，您希望如何進場？",
    );
    await shot(page, "02-servant-answer-citations-and-clarification-card");

    await page.getByTestId("servant-clarification-option-scale_in_early").click();
    await expect(page.getByTestId("servant-clarification-selected")).toContainText(
      "先試單三分之一部位",
    );
    expect(state.clarificationChoices.length).toBe(1);
    expect(state.clarificationChoices[0]).toMatchObject({
      decision_id: "dec-entry-01",
      question_id: "q-entry-timing",
      option_id: "scale_in_early",
      option_label: "先試單三分之一部位",
    });
    await expect(
      page.getByTestId("servant-optional-persona-consult-control"),
    ).toBeVisible();
    await shot(page, "03-servant-clarification-choice-sent");

    // 3. Open 個人化紀錄 drawer -> verify AC3 (trader habits profile + reject & add corrections)
    await page.getByTestId("global-drawer-trigger-personalization").click();
    const habitsSection = page.getByTestId("personalization-servant-habits-section");
    await expect(habitsSection).toBeVisible({ timeout: 15_000 });
    await expect(habitsSection).toContainText("交易員習慣側寫與修正");
    await expect(
      page.getByTestId("servant-habit-feature-holding_horizon"),
    ).toContainText("持有週期偏好");
    await expect(
      page.getByTestId("servant-habit-feature-stop_loss_discipline"),
    ).toContainText("樣本不足");

    await page.getByTestId("servant-habit-reject-hab-int-01").click();
    await expect(page.getByTestId("servant-habit-correction-saved")).toContainText(
      "te-hab-001",
    );

    await page
      .getByTestId("servant-habit-statement-input")
      .fill("我偏好在五日線拉回量縮時分兩批進場，跌破月線先減碼一半");
    await page.getByTestId("servant-habit-submit-btn").click();
    expect(state.habitCorrections.length).toBe(2);
    await shot(page, "04-personalization-habits-profile-and-correction");

    // Close drawer before navigating to Strategy Performance
    await page.getByTestId("trading-desk-personalization-drawer-close").click();

    // 4. Navigate to 策略執行與績效 -> verify AC5 (「僕人模仿您」 intervals + 可能是運氣) & AC6 (Report history + on-demand request)
    await page.getByTestId("trading-desk-tab-strategy-performance").click();
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
      timeout: 30_000,
    });

    const imitationSection = page.getByTestId("performance-servant-imitation-section");
    await expect(imitationSection).toBeVisible();
    await expect(imitationSection).toContainText("僕人模仿您");
    await expect(page.getByTestId("imitation-outcome-gap-luck-label")).toHaveText(
      "可能是運氣",
    );
    await expect(page.getByTestId("imitation-outcome-gap-interval")).toContainText(
      "[-0.90%, 3.60%]",
    );
    await expect(page.getByTestId("imitation-outcome-gap-interval")).toContainText(
      "1000 次重抽樣",
    );
    await shot(page, "05-performance-servant-imitation-bootstrap-luck");

    const reportsSection = page.getByTestId("performance-trader-reports-section");
    await expect(reportsSection).toBeVisible();
    await expect(page.getByTestId("trader-report-narrative")).toContainText(
      "本週共執行 17 筆模擬交易",
    );
    await page.getByTestId("request-trader-report-btn").click();
    await expect(page.getByTestId("trader-report-narrative")).toContainText(
      "即時整理完成：最新模擬部位 2330.TW 持有 1,000 股",
    );
    expect(state.reportRequests.length).toBe(1);
    await shot(page, "06-performance-trader-reports-and-paper-book");

    // AC7 / SD §10: Zero persona_opinion calls and zero /bff/management calls during the entire default flow
    expect(state.personaOpinionCalls).toEqual([]);
    expect(state.managementCalls).toEqual([]);
  });
});

test.describe("FE-AGORA-SERVANT-CORE-20261127 hosted dev proof", () => {
  test.skip(
    !IS_HOSTED_FE || !AUTH_TOKEN,
    "Set PANTHEON_FE_BASE_URL and BFF_AUTH_TOKEN to run against hosted Pantheon dev.",
  );
  test.setTimeout(120_000);

  test("hosted dev trader walkthrough across Agora servant drawer, personalization habits, trading room paper book, and strategy performance asserting AC1-AC7 testids", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const personaOpinionCalls: string[] = [];
    const managementCalls: string[] = [];

    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/bff/management")) {
        managementCalls.push(`${req.method()} ${u}`);
      }
      if (
        u.includes("/interaction/participants") ||
        u.includes("/interaction/submit") ||
        u.includes("/meetings")
      ) {
        personaOpinionCalls.push(`${req.method()} ${u}`);
      }
    });

    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    // 1. Open Strategy Performance first to inspect AC5 (僕人模仿您), AC6 (reports), AC4 (read-only paper book)
    await page.goto(`${FE_BASE_URL}/agora/strategy-performance`);
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
      timeout: 30_000,
    });

    // AC5: 僕人模仿您 bootstrap intervals & luck label
    const imitationSection = page.getByTestId("performance-servant-imitation-section");
    await expect(imitationSection).toBeVisible({ timeout: 30_000 });
    await expect(imitationSection).toContainText("僕人模仿您");
    await expect(page.getByTestId("imitation-agreement-rate-card")).toBeVisible();
    await expect(page.getByTestId("imitation-agreement-rate-luck-label")).toContainText(
      "可能是運氣",
    );
    await expect(page.getByTestId("imitation-agreement-rate-interval")).toContainText(
      "1000 次重抽樣",
    );
    await expect(page.getByTestId("imitation-outcome-gap-card")).toBeVisible();
    await expect(page.getByTestId("imitation-outcome-gap-luck-label")).toContainText(
      "可能是運氣",
    );
    await expect(page.getByTestId("imitation-outcome-gap-interval")).toContainText(
      "1000 次重抽樣",
    );
    await shot(page, "hosted-01-strategy-performance-imitation");

    // AC6: Report history & request button
    const reportsSection = page.getByTestId("performance-trader-reports-section");
    await expect(reportsSection).toBeVisible();
    await expect(reportsSection).toContainText("交易員定期與即時報告歷史");
    await expect(page.getByTestId("request-trader-report-btn")).toBeVisible();
    await expect(
      page
        .getByTestId("trader-report-history-list")
        .or(page.getByTestId("trader-reports-empty")),
    ).toBeVisible();

    // AC4 (Strategy Performance paper book read-only summary with no order buttons)
    const perfPaperBook = page.getByTestId("performance-paper-book-section");
    await expect(perfPaperBook).toBeVisible();
    await expect(page.getByTestId("performance-paper-book-proxy-badge")).toContainText(
      "pantheon_paper_proxy",
    );
    await expect(page.getByTestId("performance-paper-book-no-order-action")).toContainText(
      "僅供唯讀檢視 · 無任何下單按鈕",
    );
    await expect(perfPaperBook.locator("button")).toHaveCount(0);
    await shot(page, "hosted-02-strategy-performance-reports-and-paper-book");

    // 2. Open 交易僕人任務 drawer -> verify AC1 (citations surface), AC2 (clarification card surface), AC6 (drawer report card), AC7 (optional persona consult control)
    await page.getByTestId("global-drawer-trigger-servant").click();
    const servantDrawer = page.getByTestId("trading-desk-servant-drawer");
    await expect(servantDrawer).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("servant-command-history")).toBeVisible();
    await expect(page.getByTestId("servant-answer-citations")).toBeVisible();
    await expect(page.getByTestId("servant-answer-citations")).toContainText(
      "資料出處與新鮮度",
    );
    await expect(page.getByTestId("servant-clarification-card")).toBeVisible();
    await expect(page.getByTestId("servant-clarification-card")).toContainText(
      "需要您釐清的單一問題",
    );
    await expect(
      page.getByTestId("servant-optional-persona-consult-control"),
    ).toBeVisible();
    await expect(
      page.getByTestId("servant-open-optional-persona-consult"),
    ).toBeVisible();
    await expect(page.getByTestId("servant-drawer-report-card")).toBeVisible();
    await expect(page.getByTestId("servant-drawer-request-report")).toBeVisible();
    await shot(page, "hosted-03-servant-drawer-citations-clarification-optional-consult");

    // 3. Open 個人化紀錄 drawer -> verify AC3 (trader habits profile features & correction form)
    await page.getByTestId("global-drawer-trigger-personalization").click();
    await expect(page.getByTestId("trading-desk-personalization-drawer")).toBeVisible({
      timeout: 15_000,
    });
    const habitsSection = page.getByTestId("personalization-servant-habits-section");
    await expect(habitsSection).toBeVisible({ timeout: 15_000 });
    await expect(habitsSection).toContainText("交易員習慣側寫與修正");
    await expect(page.getByTestId("servant-habits-features-list")).toBeVisible();
    await expect(
      page.locator('[data-testid^="servant-habit-feature-"]').first(),
    ).toBeVisible();
    await expect(page.getByTestId("servant-habit-correction-form")).toBeVisible();
    await expect(page.getByTestId("servant-habit-feature-select")).toBeVisible();
    await expect(page.getByTestId("servant-habit-statement-input")).toBeVisible();
    await expect(page.getByTestId("servant-habit-submit-btn")).toBeVisible();
    await shot(page, "hosted-04-personalization-habits");
    await page.getByTestId("trading-desk-personalization-drawer-close").click();

    // 4. Open Trading Room Workspace -> verify AC4 (PositionActionQueue paper book read-only with 0 order buttons)
    await page.goto(
      `${FE_BASE_URL}/agora/trading-room/26037823-b24e-43c5-ab67-90098c555a6c`,
    );
    const positionQueue = page.getByTestId("position-action-queue");
    await expect(positionQueue).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("paper-book-proxy-badge")).toContainText(
      "pantheon_paper_proxy",
    );
    await expect(page.getByTestId("paper-book-no-order-action")).toContainText(
      "僅供唯讀檢視 · 無任何下單按鈕",
    );
    await expect(
      page
        .getByTestId("paper-book-fills-list")
        .or(page.getByTestId("paper-book-fills-empty")),
    ).toBeVisible();
    await expect(positionQueue.locator("button")).toHaveCount(0);
    await shot(page, "hosted-05-trading-room-paper-book-read-only");

    // AC7 / SD §10: Zero persona_opinion calls and zero /bff/management calls
    expect(personaOpinionCalls).toEqual([]);
    expect(managementCalls).toEqual([]);
  });
});
