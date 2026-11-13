// Case-file view (FE-DECISION-CASE-FILE-VIEWS-20261113).
// Shows the case file a decision/memo was made on (groups -> items with excerpt,
// source, retrieval mode), which items each claim/decision cites, and the reason
// uncited contributions were rejected. Renders only what the BFF returned; an
// unavailable view or group shows its recorded reason, never a blank area.

import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type {
  CaseFile, CaseFileCitations, CaseFileGroup, CaseFileRead, CaseFileView,
} from "@/lib/bff-v1/caseFile";
import { readCaseFileView } from "@/lib/bff-v1/caseFile";

const anchorId = (scope: string, itemId: string) => `cf-${scope}-${itemId}`;
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

function Unavailable({ reason, testId }: { reason?: string | null; testId: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" data-testid={testId}
         className="rounded border border-dashed border-border p-2 text-sm text-muted-foreground">
      {t("caseFile.unavailable")}
      <span className="ml-2 font-mono text-xs" data-testid={`${testId}-reason`}>
        ({reason || t("caseFile.reasonNotRecorded")})
      </span>
    </div>
  );
}

function Citations({ resolve, c, testId }: {
  /** Per-item scope lookup; null when the target case file / item is unavailable. */
  resolve: (id: string) => string | null; c: CaseFileCitations; testId: string;
}) {
  const { t } = useTranslation();
  const jump = (id: string) => {
    const sc = resolve(id);
    const el = sc === null ? null : document.getElementById(anchorId(sc, id));
    el?.scrollIntoView?.({ block: "nearest" });
    el?.focus?.();
  };
  if (c.cited_item_ids.length === 0 && c.unresolved_item_ids.length === 0) {
    return <span data-testid={`${testId}-uncited`} className="text-xs text-destructive">{t("caseFile.uncited")}</span>;
  }
  return (
    <span data-testid={`${testId}-cites`} className="inline-flex flex-wrap gap-1 text-xs">
      {c.cited_item_ids.map((id) => resolve(id) === null ? (
        <span key={id} data-testid={`${testId}-unavailable-${id}`}
              className="rounded border border-destructive px-1 font-mono text-destructive"
              title={t("caseFile.unresolvedHint")}>
          {id} · {t("caseFile.unresolved")}
        </span>
      ) : (
        <button key={id} type="button" onClick={() => jump(id)} data-testid={`${testId}-cite-${id}`}
                className="rounded border border-border px-1 font-mono underline">
          {id}
        </button>
      ))}
      {c.unresolved_item_ids.map((id) => (
        <span key={id} data-testid={`${testId}-unresolved-${id}`}
              className="rounded border border-destructive px-1 font-mono text-destructive"
              title={t("caseFile.unresolvedHint")}>
          {id} · {t("caseFile.unresolved")}
        </span>
      ))}
    </span>
  );
}

function Group({ scope, name, group }: { scope: string; name: string; group: CaseFileGroup }) {
  const { t } = useTranslation();
  const tid = `case-file-group-${scope}-${name}`;
  const unavailable = group.unavailable.map((u) => (typeof u === "string" ? u : JSON.stringify(u)));
  return (
    <section data-testid={tid} className="space-y-1">
      <div className="flex items-center gap-2">
        <h5 className="text-sm font-medium">{name}</h5>
        {group.status ? <Badge variant="outline" data-testid={`${tid}-status`}>{group.status}</Badge> : null}
        {group.truncated ? <Badge variant="outline">{t("caseFile.truncated")}</Badge> : null}
      </div>
      {group.items.length === 0 ? (
        <Unavailable testId={`${tid}-empty`} reason={group.reason ?? group.status} />
      ) : (
        <ul className="space-y-1">
          {group.items.map((i) => (
            <li key={i.item_id} id={anchorId(scope, i.item_id)} tabIndex={-1}
                data-testid={`case-file-item-${scope}-${i.item_id}`}
                className="rounded border border-border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <code>{i.item_id}</code>
                <Badge variant="outline">{dash(i.kind)}</Badge>
                <span data-testid={`case-file-item-${scope}-${i.item_id}-mode`}>
                  {t("caseFile.retrieval")}: {dash(i.retrieval_mode)}
                  {i.retrieval_score != null ? ` (${i.retrieval_score})` : ""}
                </span>
                <span data-testid={`case-file-item-${scope}-${i.item_id}-source`}>
                  {t("caseFile.source")}: {dash(i.source_owner)} / {dash(i.source_id)}
                </span>
              </div>
              <p className="mt-1">{dash(i.excerpt)}</p>
            </li>
          ))}
        </ul>
      )}
      {group.items.length > 0 && group.reason ? (
        <p className="text-xs text-muted-foreground">{t("caseFile.groupReason")}: {group.reason}</p>
      ) : null}
      {unavailable.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${tid}-unavailable`}>
          {t("caseFile.unavailableParts")}: {unavailable.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function Case({ scope, c }: { scope: string; c: CaseFile }) {
  const { t } = useTranslation();
  return (
    <div data-testid={`case-file-${scope}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <code data-testid={`case-file-${scope}-id`}>{c.case_file_id}</code>
        <span>{dash(c.decision_type)}</span>
        <span>{dash(c.composed_at)}</span>
        {c.private_items_withheld ? (
          <Badge variant="outline" data-testid={`case-file-${scope}-withheld`}>
            {t("caseFile.privateWithheld", { count: c.private_items_withheld })}
          </Badge>
        ) : null}
      </div>
      {Object.entries(c.groups).map(([name, g]) => <Group key={name} scope={scope} name={name} group={g} />)}
    </div>
  );
}

export function CaseFileViewPanel({
  view, read, scope, testId = "case-file-view",
}: {
  /** Raw `case_file_view` value as returned by the BFF (memo/session). */
  view?: unknown;
  /** Alternatively an already-read result (packet detail). */
  read?: CaseFileRead;
  /** Unique scope for DOM ids so several views can coexist on one page. */
  scope: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const result = read ?? readCaseFileView(view);
  if (result.state === "unavailable") return <Unavailable testId={`${testId}-unavailable`} reason={result.reason} />;
  const v: CaseFileView = result.view;
  const cases = Array.isArray(v.case_files) ? v.case_files : v.case_file ? [v.case_file] : [];
  const citeScope = (c: CaseFile) => (cases.length > 1 ? `${scope}-${c.case_file_id}` : scope);
  // Each cited item resolves separately. A decision bound to a case_file_id only
  // resolves inside that case file; unbound claims use the first case holding the item.
  const hasItem = (c: CaseFile, id: string) =>
    Object.values(c.groups).some((g) => g.items.some((i) => i.item_id === id));
  const resolverFor = (boundId?: string | null) => (id: string): string | null => {
    const pool = boundId ? cases.filter((c) => c.case_file_id === boundId) : cases;
    const hit = pool.find((c) => hasItem(c, id));
    return hit ? citeScope(hit) : null;
  };
  const cite = (c: CaseFileCitations, tid: string, boundId?: string | null) => (
    <Citations resolve={resolverFor(boundId)} c={c} testId={tid} />
  );
  return (
    <div data-testid={testId} className="space-y-3">
      <h4 className="text-sm font-medium">{t("caseFile.title")}</h4>
      {cases.map((c) => <Case key={c.case_file_id} scope={citeScope(c)} c={c} />)}

      {v.decisions && v.decisions.length > 0 ? (
        <section data-testid={`${testId}-decisions`}>
          <h5 className="text-sm font-medium">{t("caseFile.decisions")}</h5>
          <ul className="space-y-1">
            {v.decisions.map((d, n) => (
              <li key={n} data-testid={`${testId}-decision-${n}`} className="text-sm">
                {dash(d.kind)} · {dash(d.status)} {cite(d, `${testId}-decision-${n}`, d.case_file_id)}
                {d.none_applicable_reason ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("caseFile.noneApplicable")}: {d.none_applicable_reason}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {v.contributions && v.contributions.length > 0 ? (
        <section data-testid={`${testId}-contributions`}>
          <h5 className="text-sm font-medium">{t("caseFile.contributions")}</h5>
          <ul className="space-y-2">
            {v.contributions.map((c, n) => (
              <li key={c.event_id ?? n} data-testid={`${testId}-contribution-${n}`} className="text-sm">
                <p className="text-xs">
                  <code>{dash(c.persona_id)}</code> · {dash(c.role)} · {dash(c.recommendation)}
                </p>
                <ul className="ml-3 list-disc space-y-1">
                  {c.claims.map((cl, k) => (
                    <li key={k} data-testid={`${testId}-contribution-${n}-claim-${k}`}>
                      {dash(cl.claim)} {cite(cl, `${testId}-contribution-${n}-claim-${k}`)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {v.rejected_contributions && v.rejected_contributions.length > 0 ? (
        <section data-testid={`${testId}-rejected`}>
          <h5 className="text-sm font-medium">{t("caseFile.rejected")}</h5>
          <ul className="space-y-1">
            {v.rejected_contributions.map((r, n) => (
              <li key={`${r.contribution_id}-${n}`} data-testid={`${testId}-rejected-${n}`}
                  className="text-sm text-destructive">
                <code>{dash(r.persona_id)}</code> / <code>{dash(r.contribution_id)}</code>
                {" · "}{t("caseFile.rejectionReason")}: <span data-testid={`${testId}-rejected-${n}-reason`}>{dash(r.reason)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
