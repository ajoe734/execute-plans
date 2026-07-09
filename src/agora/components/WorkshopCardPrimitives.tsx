import type { ReactNode } from "react";
import {
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileText,
  FlaskConical,
  HelpCircle,
  PenLine,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  WorkshopAllowedActions,
  WorkshopCard,
  WorkshopCardStatus,
  WorkshopEvidenceRef,
} from "@/lib/bff-v1/agora/workshops";
import {
  cardTypeLabel,
  formatLabel,
  formatScalar,
  optionalString,
  stringList,
  stringValue,
} from "./workshopCardUtils";

const STATUS_CLASS: Record<WorkshopCardStatus, string> = {
  informational: "border-slate-200 bg-slate-50 text-slate-600",
  action_required: "border-amber-200 bg-amber-50 text-amber-700",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-green-200 bg-green-50 text-green-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  stale: "border-slate-300 bg-slate-100 text-slate-500",
};

const CARD_ACCENT: Record<WorkshopCardStatus, string> = {
  informational: "border-slate-200",
  action_required: "border-amber-300",
  running: "border-blue-300",
  completed: "border-green-300",
  failed: "border-red-300",
  stale: "border-slate-300",
};

function cardSequence(card: WorkshopCard): number | string {
  return card.sequence_no ?? card.sequence ?? "-";
}

export function StatusPill({ status }: { status: WorkshopCardStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_CLASS[status])}>
      {formatLabel(status)}
    </span>
  );
}

export function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass)}>
      {children}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

export function KeyValueGrid({
  items,
}: {
  items: Array<{ label: string; value: unknown; tone?: "slate" | "blue" | "green" | "amber" | "red" }>;
}) {
  const visible = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== "");
  if (visible.length === 0) return null;

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {visible.map((item) => (
        <div className="min-w-0" key={item.label}>
          <dt className="text-[11px] uppercase text-slate-400">{item.label}</dt>
          <dd className="break-words text-xs font-medium text-slate-700">{formatScalar(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TextList({
  items,
  tone = "slate",
}: {
  items: unknown;
  tone?: "slate" | "amber" | "red";
}) {
  const values = stringList(items);
  if (values.length === 0) return null;
  const toneClass = {
    slate: "text-slate-600 marker:text-slate-300",
    amber: "text-amber-700 marker:text-amber-300",
    red: "text-red-700 marker:text-red-300",
  }[tone];

  return (
    <ul className={cn("list-disc space-y-1 pl-4 text-xs", toneClass)}>
      {values.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{label ?? "Progress"}</span>
        <span className="font-mono">{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function EvidenceRefs({ refs }: { refs?: WorkshopEvidenceRef[] }) {
  if (!refs || refs.length === 0) return null;

  return (
    <Section title="Evidence">
      <ul className="space-y-1">
        {refs.map((ref) => (
          <li className="flex min-w-0 items-start gap-2 text-xs text-slate-600" key={`${ref.ref_type}:${ref.ref_id}`}>
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words">
              <span className="font-medium">{formatLabel(ref.ref_type)}</span>
              <span className="text-slate-400"> · </span>
              <span className="font-mono text-[11px]">{ref.ref_id}</span>
              {ref.summary ? <span className="ml-1">{ref.summary}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    approve: "Approve",
    edit: "Edit",
    reject: "Reject",
    cancel: "Cancel",
    request_explanation: "Explain",
    open_detail: "Open detail",
    validate: "Validate",
    accept: "Accept",
    open_diff: "Open diff",
  };
  return labels[action] ?? formatLabel(action);
}

function ActionIcon({ action }: { action: string }) {
  if (["approve", "accept", "validate"].includes(action)) return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (["reject", "cancel"].includes(action)) return <XCircle className="h-3.5 w-3.5" />;
  if (action === "edit") return <PenLine className="h-3.5 w-3.5" />;
  if (action === "request_explanation") return <HelpCircle className="h-3.5 w-3.5" />;
  if (action === "open_detail" || action === "open_diff") return <ExternalLink className="h-3.5 w-3.5" />;
  return <CircleHelp className="h-3.5 w-3.5" />;
}

export function ActionBar({ actions }: { actions?: WorkshopAllowedActions }) {
  const enabled = Object.entries(actions ?? {}).filter(([, allowed]) => allowed);
  if (enabled.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      {enabled.map(([action]) => (
        <button
          aria-disabled="true"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600"
          disabled
          key={action}
          title={actionLabel(action)}
          type="button"
        >
          <ActionIcon action={action} />
          <span>{actionLabel(action)}</span>
        </button>
      ))}
    </div>
  );
}

export function BackendModeBadge({ mode }: { mode?: unknown }) {
  const value = stringValue(mode, "unknown");
  const tone = value === "real" ? "green" : value === "fixture" || value === "stub" ? "amber" : "slate";
  return (
    <span className="inline-flex items-center gap-1">
      <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
      <Pill tone={tone}>{formatLabel(value)}</Pill>
    </span>
  );
}

export function NoOrderRouteBadge({ value }: { value?: unknown }) {
  const proof = optionalString(value);
  if (!proof) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
      {formatLabel(proof)}
    </span>
  );
}

export function CardShell({
  card,
  children,
  onContinueDiscussion,
}: {
  card: WorkshopCard;
  children: ReactNode;
  onContinueDiscussion?: (cardId: string) => void;
}) {
  const isUser = card.emitted_by === "user" || card.card_type === "user_strategy_description";
  const status = card.status ?? "informational";

  return (
    <article
      className={cn(
        "space-y-3 rounded-lg border p-3 text-sm shadow-sm",
        isUser ? "ml-auto max-w-[78%] border-blue-200 bg-blue-50" : "mr-auto max-w-[92%] bg-white",
        !isUser && CARD_ACCENT[status],
      )}
      data-testid={`workshop-card-${card.card_id}`}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase text-slate-500">
            {cardTypeLabel(card.card_type)}
          </span>
          <StatusPill status={status} />
          <span className="font-mono text-[11px] text-slate-300">#{cardSequence(card)}</span>
        </div>
        <h3 className="break-words text-sm font-semibold text-slate-900">
          {card.title || cardTypeLabel(card.card_type)}
        </h3>
        {card.summary ? <p className="break-words text-xs leading-5 text-slate-600">{card.summary}</p> : null}
      </header>
      {children}
      <EvidenceRefs refs={card.evidence_refs} />
      {onContinueDiscussion ? (
        <div className="flex border-t border-slate-100 pt-3">
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700"
            data-testid={`workshop-card-${card.card_id}-discuss`}
            onClick={() => onContinueDiscussion(card.card_id)}
            type="button"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Ask Servant</span>
          </button>
        </div>
      ) : null}
      <ActionBar actions={card.allowed_actions} />
    </article>
  );
}
