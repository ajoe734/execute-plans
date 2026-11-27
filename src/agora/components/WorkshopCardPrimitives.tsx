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
  workshopCopy,
} from "./workshopCardUtils";

const STATUS_CLASS: Record<WorkshopCardStatus, string> = {
  informational: "border-border bg-muted/50 text-muted-foreground",
  action_required: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  running: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  failed: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  stale: "border-border bg-muted/30 text-muted-foreground",
};

const CARD_ACCENT: Record<WorkshopCardStatus, string> = {
  informational: "border-border",
  action_required: "border-amber-500/40",
  running: "border-sky-500/40",
  completed: "border-emerald-500/40",
  failed: "border-rose-500/40",
  stale: "border-border",
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
    slate: "border-border bg-muted/50 text-muted-foreground",
    blue: "border-sky-500/30 bg-sky-500/15 text-sky-300",
    green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    red: "border-rose-500/30 bg-rose-500/15 text-rose-300",
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
      <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</h4>
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
          <dt className="text-[11px] uppercase text-muted-foreground">{item.label}</dt>
          <dd className="break-words text-xs font-medium text-foreground/90">{formatScalar(item.value)}</dd>
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
    slate: "text-foreground/85 marker:text-muted-foreground",
    amber: "text-amber-300 marker:text-amber-400",
    red: "text-rose-300 marker:text-rose-400",
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
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label ?? workshopCopy("agora.workshop.cardLabels.progress", "進度")}</span>
        <span className="font-mono">{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function EvidenceRefs({ refs }: { refs?: WorkshopEvidenceRef[] }) {
  if (!refs || refs.length === 0) return null;

  return (
    <Section title={workshopCopy("agora.workshop.cardLabels.evidence", "證據")}>
      <ul className="space-y-1">
        {refs.map((ref) => (
          <li className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground" key={`${ref.ref_type}:${ref.ref_id}`}>
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">
              <span className="font-medium text-foreground/90">{formatLabel(ref.ref_type)}</span>
              <span className="text-muted-foreground"> · </span>
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
  return workshopCopy(`agora.workshop.actions.${action}`, formatLabel(action));
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
    <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
      {enabled.map(([action]) => (
        <button
          aria-disabled="true"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 text-xs font-medium text-secondary-foreground"
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
      <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
      <Pill tone={tone}>{formatLabel(value)}</Pill>
    </span>
  );
}

export function NoOrderRouteBadge({ value }: { value?: unknown }) {
  const proof = optionalString(value);
  if (!proof) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
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
  const status = card.status ?? "informational";

  let authorLabel = workshopCopy("agora.workshop.cardLabels.authorServant", "策略工坊助理");
  let bgClass = "mr-auto max-w-[92%] border-border bg-card text-card-foreground";
  let accentBorder = "";
  let authorBadgeColor = "bg-muted/60 text-foreground/90 border-border";

  const isUser = card.emitted_by === "user" || card.card_type === "user_strategy_description" || card.persona_id === "human";
  const isPersona = card.card_type === "persona_opinion" || card.card_type === "opinion" || (card.persona_id !== undefined && card.persona_id !== "servant" && card.persona_id !== "human");
  const isSynthesis = card.card_type === "consult_result";
  const isTool = ["research_result", "research_progress", "research_plan_proposal"].includes(card.card_type);

  if (isUser) {
    authorLabel = workshopCopy("agora.workshop.cardLabels.authorHuman", "交易員（操作者）");
    bgClass = "ml-auto max-w-[78%] border-primary/40 bg-primary/10 text-foreground";
    authorBadgeColor = "bg-primary/20 text-primary border-primary/30";
  } else if (isPersona) {
    authorLabel = workshopCopy("agora.workshop.cardLabels.authorPersona", `Persona：${formatLabel(card.persona_id || "Bot")}`, {
      name: formatLabel(card.persona_id || "Bot"),
    });
    bgClass = "mr-auto max-w-[92%] border-purple-500/30 bg-purple-500/10 text-card-foreground";
    accentBorder = "border-l-4 border-l-purple-500";
    authorBadgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/30";
  } else if (isSynthesis) {
    authorLabel = workshopCopy("agora.workshop.cardLabels.authorSynthesis", "委員會綜合共識");
    bgClass = "mr-auto max-w-[92%] border-indigo-500/30 bg-indigo-500/10 text-card-foreground";
    accentBorder = "border-l-4 border-l-indigo-500";
    authorBadgeColor = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  } else if (isTool) {
    authorLabel = workshopCopy("agora.workshop.cardLabels.authorTool", "研究工具執行");
    bgClass = "mr-auto max-w-[92%] border-emerald-500/30 bg-emerald-500/10 text-card-foreground";
    accentBorder = "border-l-4 border-l-emerald-500";
    authorBadgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  } else {
    authorLabel = workshopCopy("agora.workshop.cardLabels.authorServant", "策略工坊助理");
    bgClass = "mr-auto max-w-[92%] border-border bg-card text-card-foreground";
    authorBadgeColor = "bg-muted/60 text-foreground/90 border-border";
  }

  return (
    <article
      className={cn(
        "space-y-3 rounded-lg border p-3 text-sm shadow-sm transition-all duration-200 hover:shadow-md",
        bgClass,
        accentBorder,
        !isUser && !isPersona && !isSynthesis && !isTool && CARD_ACCENT[status],
      )}
      data-card-type={card.card_type}
      data-testid={`workshop-card-${card.card_id}`}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            {cardTypeLabel(card.card_type)}
          </span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", authorBadgeColor)}>
            {authorLabel}
          </span>
          <StatusPill status={status} />
          <span className="font-mono text-[11px] text-muted-foreground">#{cardSequence(card)}</span>
        </div>
        <h3 className="break-words text-sm font-semibold text-foreground">
          {card.title || cardTypeLabel(card.card_type)}
        </h3>
        {card.summary ? <p className="break-words text-xs leading-5 text-muted-foreground">{card.summary}</p> : null}
      </header>
      {children}
      <EvidenceRefs refs={card.evidence_refs} />
      {onContinueDiscussion ? (
        <div className="flex border-t border-border/70 pt-3">
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/15 px-2.5 text-xs font-medium text-primary hover:bg-primary/25"
            data-testid={`workshop-card-${card.card_id}-discuss`}
            onClick={() => onContinueDiscussion(card.card_id)}
            type="button"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>{workshopCopy("agora.workshop.actions.ask_servant", "詢問助理")}</span>
          </button>
        </div>
      ) : null}
      <ActionBar actions={card.allowed_actions} />
    </article>
  );
}
