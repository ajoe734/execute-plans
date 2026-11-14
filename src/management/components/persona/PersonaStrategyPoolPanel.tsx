// Persona strategy pool view (FE-PERSONA-POOL-VIEWS-20261112).
// Renders only what the BFF persona detail read returned. A null section or a
// non-"ok" surface is shown as unavailable with the owner's reason; nothing is
// derived, defaulted or synthesised here.

import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import type {
  PersonaManagementEnvelope,
  PoolMemberBookRow,
  PoolMemberRecord,
  PoolHealthMeasure,
} from "@/lib/bff-v1/personas";

interface Props {
  management: PersonaManagementEnvelope | null | undefined;
  /** True when the management read itself failed or returned no body. */
  managementUnavailable?: boolean;
}

const RUNNING_STATES = new Set(["running", "paper_running", "live_running"]);

const fmt = (value: unknown, digits = 3): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const pct = (value: unknown): string =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";

function Unavailable({ reason, testId }: { reason?: string | null; testId: string }) {
  const t = useT();
  return (
    <div
      role="status"
      data-testid={testId}
      className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground"
    >
      {t("persona.pool.unavailable", { defaultValue: "無法讀取" })}
      {reason ? <span className="ml-2 font-mono text-xs">({reason})</span> : null}
    </div>
  );
}

function sectionReady(
  management: PersonaManagementEnvelope | null | undefined,
  surface: string,
  value: unknown,
): boolean {
  const status = management?.meta?.surfaces?.[surface]?.status;
  return value !== null && value !== undefined && (status === undefined || status === "ok");
}

function reasonOf(management: PersonaManagementEnvelope | null | undefined, surface: string): string | null {
  return management?.meta?.surfaces?.[surface]?.reason ?? null;
}

function Measure({ label, m }: { label: string; m?: PoolHealthMeasure }) {
  const t = useT();
  return (
    <div className="rounded border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {m?.status === "known" ? (
        <div className="font-mono text-lg">{fmt(m.value)}</div>
      ) : (
        <div className="text-sm text-muted-foreground">
          {t("persona.pool.measureUnknown", { defaultValue: "未知" })}
          {m?.reason ? <span className="ml-1 font-mono text-xs">({m.reason})</span> : null}
        </div>
      )}
    </div>
  );
}

export function PersonaStrategyPoolPanel({ management, managementUnavailable }: Props) {
  const t = useT();
  if (managementUnavailable || !management?.data) {
    return <Unavailable testId="pool-unavailable-all" />;
  }
  const data = management.data;
  const pool = data.strategyPool;
  if (!pool) return <Unavailable testId="pool-unavailable-all" />;

  const persona = data.persona;
  const lifecycle = String(
    persona?.lifecycle_state ?? persona?.lifecycleState ?? persona?.state ?? "",
  );
  const running = RUNNING_STATES.has(lifecycle);

  const poolOk = sectionReady(management, "strategy_pool", pool.current);
  const booksOk = sectionReady(management, "member_virtual_books", pool.memberVirtualBooks);
  const healthOk = sectionReady(management, "pool_health", pool.health);
  const versionsOk = sectionReady(management, "strategy_pool_versions", pool.versions);
  const cyclesOk = sectionReady(management, "autonomy_cycles", pool.cycles);
  const demandsOk = sectionReady(management, "open_demands", pool.openDemands);

  const bookByRef = new Map<string, PoolMemberBookRow>();
  // Partial book data is shown row by row; a surface-level "unavailable" status only
  // marks the section, while individually "ok" rows remain real owner values.
  for (const row of pool.memberVirtualBooks ?? []) bookByRef.set(row.artifact_ref, row);

  const renderMember = (m: PoolMemberRecord) => {
    const row = bookByRef.get(m.artifact_ref);
    const ok = row?.status === "ok" && row.book;
    const net = ok ? row.book?.net_of_costs : undefined;
    const cmp = ok ? row.book?.baseline_comparison : undefined;
    return (
      <tr key={`${m.artifact_ref}:${m.checksum}`} data-testid={`pool-member-${m.artifact_ref}`}
          className="border-t border-border">
        <td className="p-2 font-mono text-xs">{m.artifact_ref}</td>
        <td className="p-2"><Badge variant="outline">{m.stage}</Badge></td>
        <td className="p-2 font-mono">{fmt(m.risk_weight, 2)}</td>
        <td className="p-2 font-mono text-xs">{m.baseline_ref ?? "—"}</td>
        {ok ? (
          <>
            <td className="p-2 font-mono">{pct(net?.total_return)}</td>
            <td className="p-2 font-mono">{fmt(net?.sharpe_ratio, 2)}</td>
            <td className="p-2 font-mono">{pct(net?.max_drawdown)}</td>
            <td className="p-2 text-xs">
              {cmp
                ? cmp.status === "compared"
                  ? `ΔSharpe ${fmt(cmp.sharpe_delta, 2)} · ΔDD ${pct(cmp.drawdown_delta)}`
                  : `${cmp.status}${cmp.reason ? ` (${cmp.reason})` : ""}`
                : "—"}
            </td>
          </>
        ) : (
          <td className="p-2 text-sm text-muted-foreground" colSpan={4}
              data-testid={`pool-member-book-unavailable-${m.artifact_ref}`}>
            {t("persona.pool.unavailable", { defaultValue: "無法讀取" })}
            {row?.reason ? <span className="ml-2 font-mono text-xs">({row.reason})</span> : null}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-6" data-testid="persona-strategy-pool">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{t("persona.pool.title", { defaultValue: "策略池" })}</h3>
        {lifecycle ? (
          <Badge data-testid="pool-persona-state" variant={running ? "default" : "outline"}>
            {running
              ? t("persona.pool.running", { defaultValue: "運行中" })
              : lifecycle}
          </Badge>
        ) : null}
        {poolOk ? (
          <span className="text-xs text-muted-foreground font-mono">
            v{pool.current!.pool_version} · {pool.current!.digest}
          </span>
        ) : null}
      </div>

      <section>
        <h4 className="text-sm font-medium mb-2">{t("persona.pool.members", { defaultValue: "成員與虛擬帳成績（對基準）" })}</h4>
        {!poolOk ? (
          <Unavailable testId="pool-current-unavailable" reason={reasonOf(management, "strategy_pool")} />
        ) : (
          <>
            {!booksOk ? (
              <Unavailable testId="pool-books-unavailable" reason={reasonOf(management, "member_virtual_books")} />
            ) : null}
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">{t("persona.pool.col.member", { defaultValue: "成員" })}</th>
                  <th className="p-2">{t("persona.pool.col.stage", { defaultValue: "階段" })}</th>
                  <th className="p-2">{t("persona.pool.col.weight", { defaultValue: "權重" })}</th>
                  <th className="p-2">{t("persona.pool.col.baseline", { defaultValue: "基準" })}</th>
                  <th className="p-2">{t("persona.pool.col.return", { defaultValue: "淨報酬" })}</th>
                  <th className="p-2">Sharpe</th>
                  <th className="p-2">{t("persona.pool.col.drawdown", { defaultValue: "最大回撤" })}</th>
                  <th className="p-2">{t("persona.pool.col.vsBaseline", { defaultValue: "對基準" })}</th>
                </tr>
              </thead>
              <tbody>{pool.current!.members.map(renderMember)}</tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h4 className="text-sm font-medium mb-2">{t("persona.pool.health", { defaultValue: "池子健康" })}</h4>
        {!healthOk ? (
          <Unavailable testId="pool-health-unavailable" reason={reasonOf(management, "pool_health")} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="pool-health">
            <Measure label={t("persona.pool.h.gross", { defaultValue: "總曝險使用率" })} m={pool.health!.gross_utilisation} />
            <Measure label={t("persona.pool.h.drawdown", { defaultValue: "回撤使用率" })} m={pool.health!.drawdown_utilisation} />
            <Measure label={t("persona.pool.h.bets", { defaultValue: "有效賭注數" })} m={pool.health!.effective_bets} />
            <Measure label={t("persona.pool.h.idle", { defaultValue: "閒置日比例" })} m={pool.health!.idle_day_share} />
          </div>
        )}
      </section>

      <section>
        <h4 className="text-sm font-medium mb-2">{t("persona.pool.history", { defaultValue: "池版本歷史（含已移除成員）" })}</h4>
        {!versionsOk ? (
          <Unavailable testId="pool-versions-unavailable" reason={reasonOf(management, "strategy_pool_versions")} />
        ) : (
          <ul className="space-y-2" data-testid="pool-versions">
            {[...pool.versions!].sort((a, b) => b.pool_version - a.pool_version).map((v) => (
              <li key={v.pool_version} className="rounded border border-border p-2 text-sm">
                <div className="font-mono text-xs">v{v.pool_version} · {v.digest}{v.change_reason ? ` · ${v.change_reason}` : ""}</div>
                <ul className="mt-1 text-xs">
                  {v.members.map((m) => (
                    <li key={`${m.artifact_ref}:${m.checksum}`}
                        data-testid={m.stage === "removed" ? `pool-removed-${v.pool_version}-${m.artifact_ref}` : undefined}>
                      <span className="font-mono">{m.artifact_ref}</span> · {m.stage} · {fmt(m.risk_weight, 2)}
                      {m.stage === "removed" && m.removal_reason ? ` · ${m.removal_reason}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-sm font-medium mb-2">{t("persona.pool.cycles", { defaultValue: "每日自主循環紀錄" })}</h4>
        {!cyclesOk ? (
          <Unavailable testId="pool-cycles-unavailable" reason={reasonOf(management, "autonomy_cycles")} />
        ) : pool.cycles!.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="pool-cycles-empty">
            {t("persona.pool.noCycles", { defaultValue: "尚無循環紀錄" })}
          </div>
        ) : (
          <ul className="space-y-1" data-testid="pool-cycles">
            {pool.cycles!.map((c) => (
              <li key={c.packet_id} className="text-sm font-mono">
                {c.packet_id} · {c.updated_at ?? "—"} · {c.status ?? "—"} · {c.phase ?? "—"}
                {c.failure_reason ? ` · ${c.failure_reason}` : ""}
                {(c.decisions ?? []).map((d) => ` · ${String(d.kind ?? "")}:${String(d.status ?? "")}`).join("")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-sm font-medium mb-2">{t("persona.pool.demands", { defaultValue: "未結需求單" })}</h4>
        {!demandsOk ? (
          <Unavailable testId="pool-demands-unavailable" reason={reasonOf(management, "open_demands")} />
        ) : pool.openDemands!.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="pool-demands-empty">
            {t("persona.pool.noDemands", { defaultValue: "沒有未結需求單" })}
          </div>
        ) : (
          <ul className="space-y-1" data-testid="pool-demands">
            {pool.openDemands!.map((d) => (
              <li key={d.demand_id} className="text-sm">
                <span className="font-mono text-xs">{d.demand_id}</span> · {d.mandate ?? "—"} · {d.short_measure ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
