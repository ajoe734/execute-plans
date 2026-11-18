// Management Meeting Detail Page (FE-MANAGEMENT-MEETINGS-20261115, SD_PERSONA_MEETINGS_2026-11-15 §11.3 & §12.9).
// Shows:
//   - Header (type, topic, status, outcome, chair, convened_by, participants with Agora/servant flags & trader identity)
//   - MT-4 Outlier Performance Attribution Record (above rounds when present)
//   - Agenda
//   - Shared Case-File Facts (never private memory)
//   - Pre-Read Interpretations (scope:committee, never private memory)
//   - Rounds (Round 1 independent positions with confidence & citations; Round 2 anonymised labels + operator-only reveal)
//   - Chair Synthesis & Dissent (non-binding tally, dissent memo)
//   - Proposals with live downstream links
//   - Per-Participant Memory Writeback IDs (never private memory text)
//   - Usage
// Renders an honest not-found on 404 and explicit unavailable with reason on consultation owner outage.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getMeetingDetail,
  stripPrivateMemory,
  type MeetingDetail,
  type MeetingPreReadInterpretation,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";

function extractPreReadList(
  preRead: MeetingDetail["pre_read"],
): MeetingPreReadInterpretation[] {
  if (!preRead) return [];
  if (Array.isArray(preRead)) return preRead;
  if (typeof preRead === "object") {
    if (Array.isArray(preRead.interpretations)) return preRead.interpretations;
    if (Array.isArray(preRead.items)) return preRead.items;
  }
  return [];
}

function formatAgenda(agenda: MeetingDetail["agenda"]): string[] {
  if (!agenda) return [];
  if (Array.isArray(agenda)) {
    return agenda.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  }
  if (typeof agenda === "string" && agenda.trim()) return [agenda.trim()];
  return [];
}

export const MeetingDetailPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [read, setRead] = useState<MeetingsRead<MeetingDetail> | null>(null);
  const [showReveal, setShowReveal] = useState(true);

  useEffect(() => {
    let live = true;
    setRead(null);
    if (!id) {
      setRead({ state: "not_found", reason: "missing_meeting_id" });
      return;
    }
    void getMeetingDetail(id).then((res) => {
      if (live) setRead(res);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (read === null) {
    return (
      <section className="p-6" data-testid="meeting-detail-loading">
        <p className="text-sm text-muted-foreground">
          {t("common.loading", { defaultValue: "Loading…" })}
        </p>
      </section>
    );
  }

  if (read.state === "not_found") {
    return (
      <section className="p-6 space-y-4" data-testid="meeting-detail-not-found">
        <Card className="p-6 space-y-3">
          <h1 className="text-lg font-semibold text-foreground">
            {t("meetingsCenter.detail.notFound", {
              id,
              defaultValue: `Meeting ${id} was not found.`,
            })}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            reason: {read.reason}
          </p>
          <div>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/meetings">
                {t("meetingsCenter.detail.backToCenter", {
                  defaultValue: "Back to Meetings Center",
                })}
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (read.state === "unavailable") {
    return (
      <section className="p-6 space-y-4" data-testid="meeting-detail-unavailable" role="status">
        <Card className="border-dashed p-6 space-y-2">
          <h1 className="text-lg font-semibold text-foreground">
            {t("meetingsCenter.unavailable", {
              defaultValue: "Consultation meetings surface is unavailable",
            })}
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            reason: <code>{read.reason}</code>
            {read.owner ? (
              <>
                {" · "}owner: <code>{read.owner}</code>
              </>
            ) : null}
          </p>
          <div>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/meetings">
                {t("meetingsCenter.detail.backToCenter", {
                  defaultValue: "Back to Meetings Center",
                })}
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  const m = stripPrivateMemory(read.data);
  const agendaItems = formatAgenda(m.agenda);
  const preReadItems = extractPreReadList(m.pre_read);
  const proposals =
    m.proposals && m.proposals.length > 0
      ? m.proposals
      : m.synthesis?.proposals ?? [];
  const labelReveal = m.label_reveal && typeof m.label_reveal === "object" ? m.label_reveal : null;
  const canRevealLabels = Boolean(m.anonymised_labels_revealed && labelReveal);
  const isReview =
    String(m.outcome ?? "").toUpperCase() === "REVIEW" ||
    String(m.status ?? "").toUpperCase() === "REVIEW";

  return (
    <section
      className="p-6 space-y-6"
      aria-label={`Meeting ${m.meeting_id}`}
      data-testid="meeting-detail-page"
    >
      {/* Back navigation */}
      <div>
        <Button asChild size="sm" variant="outline">
          <Link to="/management/meetings">
            ← {t("meetingsCenter.detail.backToCenter", { defaultValue: "Back to Meetings Center" })}
          </Link>
        </Button>
      </div>

      {/* 1. Header & Roster */}
      <Card className="p-5 space-y-3" data-testid="meeting-detail-header">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold font-mono text-foreground">{m.meeting_id}</h1>
            <Badge variant="outline">{m.meeting_type}</Badge>
            <Badge variant="outline">{m.status}</Badge>
            {m.outcome ? (
              <Badge variant={isReview ? "destructive" : "secondary"}>{m.outcome}</Badge>
            ) : null}
            <Badge variant="outline">paper · execution_authority: none</Badge>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            created: {m.created_at ?? "—"}
            {m.closed_at ? ` · closed: ${m.closed_at}` : ""}
          </div>
        </div>
        {m.topic ? <p className="text-base font-medium text-foreground">{m.topic}</p> : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            Chair / Sponsor:{" "}
            <code className="text-foreground">{m.chair_persona_id ?? "—"}</code>
          </div>
          <div>
            Convened By:{" "}
            <code className="text-foreground">
              {m.convened_by
                ? `${m.convened_by.kind}${m.convened_by.id ? `:${m.convened_by.id}` : ""}`
                : "—"}
            </code>
          </div>
          <div>
            Round: <code className="text-foreground">{m.round ?? m.rounds?.length ?? 1}</code>
          </div>
        </div>

        {/* Participants / Roster */}
        <div className="pt-2 border-t border-border space-y-2" data-testid="meeting-detail-participants">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Participants ({m.participants.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {m.participants.map((p) => (
              <div
                key={`${p.persona_id}-${p.role ?? ""}`}
                data-testid={`meeting-participant-${p.persona_id}`}
                className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-xs space-y-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold">{p.persona_id}</span>
                  {p.role ? <Badge variant="outline">{p.role}</Badge> : null}
                  {p.origin ? <Badge variant="secondary">{p.origin}</Badge> : null}
                  {p.servant || p.origin === "private_servant" ? (
                    <Badge variant="outline" data-testid={`servant-flag-${p.persona_id}`}>
                      servant
                    </Badge>
                  ) : null}
                </div>
                {p.agora_user_id || p.trader_id || p.account_id ? (
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {p.agora_user_id ?? p.trader_id ? `trader:${p.agora_user_id ?? p.trader_id}` : ""}
                    {p.account_id ? ` · account:${p.account_id}` : ""}
                    {Array.isArray(p.broker_ids) && p.broker_ids.length > 0
                      ? ` · brokers:${p.broker_ids.join(",")}`
                      : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. MT-4 Attribution Record (above rounds when present, per design §12.9) */}
      {m.attribution_record ? (
        <Card className="p-4 space-y-2" data-testid="meeting-detail-attribution">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {t("meetingsCenter.detail.attributionTitle", {
                defaultValue: "Outlier Performance Attribution Record (MT-4)",
              })}
            </h2>
            <Badge variant="outline" className="font-mono">
              {m.attribution_record.record_id}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <div>
              Subject: {m.attribution_record.subject_kind ?? "—"}:{" "}
              {m.attribution_record.subject_id ?? m.attribution_record.agora_user_id ?? "—"}
            </div>
            <div>Direction: {m.attribution_record.direction ?? "—"}</div>
            <div>Sample Size: {m.attribution_record.sample_size ?? "—"}</div>
            <div>
              Luck Interval:{" "}
              {Array.isArray(m.attribution_record.luck_interval)
                ? `[${m.attribution_record.luck_interval.join(", ")}]`
                : "—"}
            </div>
            {m.attribution_record.account_id ? (
              <div>Account: {m.attribution_record.account_id}</div>
            ) : null}
            {Array.isArray(m.attribution_record.broker_ids) &&
            m.attribution_record.broker_ids.length > 0 ? (
              <div>Brokers: {m.attribution_record.broker_ids.join(", ")}</div>
            ) : null}
          </div>
          {m.attribution_record.decomposition ? (
            <div className="text-xs font-mono text-muted-foreground pt-1">
              Decomposition:{" "}
              {Object.entries(m.attribution_record.decomposition)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ")}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* 3. Agenda */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-agenda">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.agendaTitle", { defaultValue: "Agenda" })}
        </h2>
        {agendaItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No agenda items recorded.</p>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {agendaItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        )}
      </Card>

      {/* 4. Case-File Items */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-case-file">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("meetingsCenter.detail.caseFileTitle", {
              defaultValue: "Shared Case-File Facts",
            })}
          </h2>
          {typeof m.private_items_withheld === "number" && m.private_items_withheld > 0 ? (
            <Badge variant="outline" data-testid="meeting-private-withheld-badge">
              {m.private_items_withheld} private item(s) withheld by protocol
            </Badge>
          ) : null}
        </div>
        {m.case_file_items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shared case-file items recorded.</p>
        ) : (
          <ul className="space-y-2">
            {m.case_file_items.map((cf) => (
              <li
                key={cf.item_id}
                data-testid={`case-file-item-${cf.item_id}`}
                className="rounded border border-border p-3 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{cf.item_id}</span>
                  {cf.kind ? <Badge variant="outline">{cf.kind}</Badge> : null}
                  {cf.source_owner ? <Badge variant="secondary">{cf.source_owner}</Badge> : null}
                  {cf.relevance_scope ? (
                    <span className="font-mono text-muted-foreground">
                      scope:{cf.relevance_scope}
                    </span>
                  ) : null}
                </div>
                {cf.excerpt ? <p className="text-sm text-foreground">{cf.excerpt}</p> : null}
                {cf.raw_text ? (
                  <p className="text-xs font-mono text-muted-foreground">{cf.raw_text}</p>
                ) : null}
                {cf.agora_user_id || cf.account_id ? (
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {cf.agora_user_id ? `trader:${cf.agora_user_id}` : ""}
                    {cf.account_id ? ` · account:${cf.account_id}` : ""}
                    {Array.isArray(cf.broker_ids) && cf.broker_ids.length > 0
                      ? ` · brokers:${cf.broker_ids.join(",")}`
                      : ""}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 5. Pre-Read Interpretations */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-pre-read">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.preReadTitle", {
            defaultValue: "Pre-Read Interpretations (scope:committee)",
          })}
        </h2>
        {preReadItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pre-read interpretations recorded.</p>
        ) : (
          <ul className="space-y-2">
            {preReadItems.map((interp, idx) => (
              <li
                key={`${interp.persona_id}-${idx}`}
                data-testid={`pre-read-item-${interp.persona_id}`}
                className="rounded border border-border p-3 text-xs space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{interp.persona_id}</span>
                  {interp.relevance_scope ? (
                    <Badge variant="outline">scope:{interp.relevance_scope}</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-foreground">
                  {interp.text ?? interp.summary ?? "—"}
                </p>
                {Array.isArray(interp.citations) && interp.citations.length > 0 ? (
                  <div className="font-mono text-muted-foreground">
                    citations: {interp.citations.join(", ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 6. Deliberation Rounds (Round 1 & Round 2 with anonymised labels + operator-only reveal) */}
      <Card className="p-4 space-y-4" data-testid="meeting-detail-rounds">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("meetingsCenter.detail.roundsTitle", { defaultValue: "Deliberation Rounds" })}
          </h2>
          {canRevealLabels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="meeting-label-reveal-toggle"
              onClick={() => setShowReveal((prev) => !prev)}
            >
              {showReveal ? "Hide Operator Label Reveal" : "Show Operator Label Reveal"}
            </Button>
          ) : null}
        </div>

        {/* Operator-only label reveal table */}
        {canRevealLabels && showReveal && labelReveal ? (
          <div
            className="rounded border border-primary/30 bg-primary/5 p-3 text-xs space-y-1"
            data-testid="meeting-label-reveal"
          >
            <div className="font-semibold text-foreground">
              {t("meetingsCenter.detail.operatorRevealTitle", {
                defaultValue: "Operator-Only Anonymised Label Reveal",
              })}
            </div>
            <ul className="space-y-0.5 font-mono">
              {Object.entries(labelReveal).map(([anonLabel, personaId]) => (
                <li key={anonLabel} data-testid={`label-reveal-${anonLabel}`}>
                  {anonLabel} → <span className="font-semibold text-foreground">{personaId}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {m.rounds.length === 0 ? (
          <p className="text-xs text-muted-foreground">No deliberation rounds recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {m.rounds.map((r) => (
              <div
                key={r.round}
                data-testid={`meeting-round-${r.round}`}
                className="rounded border border-border p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">
                    {t("meetingsCenter.detail.roundLabel", {
                      round: r.round,
                      defaultValue: `Round ${r.round}`,
                    })}
                    {r.round === 1
                      ? " — Independent Positions"
                      : r.round === 2
                        ? " — Anonymised Cross-Visibility & Devil's Advocate"
                        : " — Evidence Round"}
                  </h3>
                  {r.evidence_note ? (
                    <span className="text-xs font-mono text-muted-foreground">
                      {r.evidence_note}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {r.positions.map((pos, idx) => {
                    const revealedPersona =
                      canRevealLabels && showReveal
                        ? (pos.revealed_persona_id ??
                          pos.persona_id ??
                          (pos.label && labelReveal ? labelReveal[pos.label] : undefined))
                        : undefined;
                    return (
                      <div
                        key={`${r.round}-${pos.label}-${idx}`}
                        data-testid={`round-${r.round}-position-${pos.label}`}
                        className="rounded border border-border/70 bg-muted/10 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="font-mono font-semibold"
                              data-testid={`round-${r.round}-anon-label-${pos.label}`}
                            >
                              {pos.label}
                            </span>
                            {revealedPersona ? (
                              <Badge
                                variant="secondary"
                                className="font-mono"
                                data-testid={`round-${r.round}-revealed-${pos.label}`}
                              >
                                operator reveal: {revealedPersona}
                              </Badge>
                            ) : null}
                            {pos.role ? <Badge variant="outline">{pos.role}</Badge> : null}
                            {pos.style ? <Badge variant="outline">{pos.style}</Badge> : null}
                            {pos.changed !== undefined ? (
                              <Badge variant={pos.changed ? "default" : "outline"}>
                                {pos.changed ? "position changed" : "position unchanged"}
                              </Badge>
                            ) : null}
                          </div>
                          {typeof pos.confidence === "number" ? (
                            <span className="font-mono">
                              confidence: {(pos.confidence * 100).toFixed(0)}% ({pos.confidence})
                            </span>
                          ) : null}
                        </div>
                        {pos.stance ? (
                          <div className="text-sm text-foreground">
                            Stance: <span className="font-mono font-medium">{pos.stance}</span>
                          </div>
                        ) : null}
                        {pos.rationale || pos.summary ? (
                          <p className="text-muted-foreground">{pos.rationale ?? pos.summary}</p>
                        ) : null}
                        {Array.isArray(pos.citations) && pos.citations.length > 0 ? (
                          <div className="font-mono text-muted-foreground">
                            citations: {pos.citations.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 7. Chair Synthesis & Dissent */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-synthesis">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.synthesisTitle", {
            defaultValue: "Chair Synthesis & Dissent",
          })}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span>
            Outcome: <strong>{m.synthesis?.outcome ?? m.outcome ?? "—"}</strong>
          </span>
          {m.synthesis?.tally ? (
            <span data-testid="meeting-synthesis-tally">
              Tally (non-binding): support={m.synthesis.tally.support ?? "—"} · dissent=
              {m.synthesis.tally.dissent ?? "—"} · binding=
              {String(m.synthesis.tally.binding ?? false)}
            </span>
          ) : null}
          {m.synthesis?.dissent_memo_id ? (
            <span data-testid="meeting-dissent-memo">
              Dissent Memo: <code>{m.synthesis.dissent_memo_id}</code>
            </span>
          ) : null}
        </div>
        {m.synthesis?.summary ? (
          <p className="text-sm text-foreground">{m.synthesis.summary}</p>
        ) : null}
      </Card>

      {/* 8. Proposals with Live Downstream Links */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-proposals">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.proposalsTitle", {
            defaultValue: "Proposals & Live Downstream Status",
          })}
        </h2>
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No proposals issued in this meeting.</p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li
                key={p.proposal_id}
                data-testid={`detail-proposal-${p.proposal_id}`}
                className="rounded border border-border p-3 text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.proposal_id}</span>
                  {p.kind ? <Badge variant="outline">{p.kind}</Badge> : null}
                  <span>
                    Sponsor: <code className="text-foreground">{p.sponsor_persona_id ?? "—"}</code>
                  </span>
                  {p.downstream?.status ? (
                    <Badge variant="secondary">{p.downstream.status}</Badge>
                  ) : null}
                </div>
                {p.downstream?.href ? (
                  <Link
                    to={p.downstream.href}
                    className="font-mono underline text-primary"
                    data-testid={`proposal-downstream-link-${p.proposal_id}`}
                  >
                    {p.downstream.target ?? "downstream"}
                    {p.downstream.id ? ` (${p.downstream.id})` : ""} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 9. Per-Participant Memory Writeback IDs (never private memory text) */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-writebacks">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.writebacksTitle", {
            defaultValue: "Per-Participant Memory Writeback IDs",
          })}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("meetingsCenter.detail.noPrivateMemoryNote", {
            defaultValue:
              "Private memory text never enters a round or console view; only writeback IDs are recorded.",
          })}
        </p>
        {m.writebacks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No memory writeback IDs recorded.</p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {m.writebacks.map((wb) => (
              <li
                key={`${wb.persona_id}-${wb.entry_id}`}
                data-testid={`writeback-${wb.persona_id}-${wb.entry_id}`}
              >
                {wb.persona_id} → <code>{wb.entry_id}</code>
                {wb.status ? ` (${wb.status})` : ""}
                {wb.written_at ? ` · ${wb.written_at}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 10. Usage */}
      <Card className="p-4 space-y-1" data-testid="meeting-detail-usage">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.usageTitle", { defaultValue: "Meeting Usage & Budget" })}
        </h2>
        <div className="text-xs font-mono text-muted-foreground">
          participants: <strong className="text-foreground">{m.usage?.participants ?? m.participants.length}</strong>
          {" · "}rounds: <strong className="text-foreground">{m.usage?.rounds ?? m.rounds.length}</strong>
          {" · "}calls: <strong className="text-foreground">{m.usage?.calls ?? "—"}</strong>
        </div>
      </Card>
    </section>
  );
};
