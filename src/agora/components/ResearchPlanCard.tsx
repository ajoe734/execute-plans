import {
  KeyValueGrid,
  Pill,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import {
  asRecord,
  formatLabel,
  recordList,
  stringList,
  stringValue,
  workshopCopy,
  type UnknownRecord,
} from "./workshopCardUtils";

function DataRequirementList({ items }: { items: unknown }) {
  const requirements = recordList(items);
  const scalarRequirements = stringList(items);

  if (requirements.length === 0 && scalarRequirements.length === 0) return null;

  return (
    <Section title={workshopCopy("agora.workshop.cardLabels.data_requirements", "資料需求")}>
      <ul className="space-y-2">
        {requirements.map((requirement, index) => {
          const ref = stringValue(requirement.ref ?? requirement.dataset ?? requirement.source, `requirement-${index + 1}`);
          const kind = stringValue(requirement.kind ?? requirement.type);
          const description = stringValue(requirement.description ?? requirement.summary);
          return (
            <li className="text-xs text-foreground/85" key={`${ref}-${index}`}>
              <span className="font-medium text-foreground">{ref}</span>
              {kind ? <span className="ml-2 text-muted-foreground">{formatLabel(kind)}</span> : null}
              {description ? <p className="mt-0.5 leading-5">{description}</p> : null}
            </li>
          );
        })}
        {requirements.length === 0
          ? scalarRequirements.map((item) => (
              <li className="text-xs text-foreground/85" key={item}>
                {item}
              </li>
            ))
          : null}
      </ul>
    </Section>
  );
}

function StageList({ stages }: { stages: unknown }) {
  const rows = recordList(stages);
  if (rows.length === 0) return null;

  return (
    <Section title={workshopCopy("agora.workshop.cardLabels.stages", "階段")}>
      <ol className="space-y-2">
        {rows.map((stage, index) => {
          const routing = asRecord(stage.routing);
          const stageId = stringValue(stage.stage_id, `stage-${index + 1}`);
          const stageType = stringValue(stage.stage_type ?? stage.type, "stage");
          const preferredBackend = stringValue(stage.preferred_backend ?? routing.preferred_backend);
          const effectiveBackend = stringValue(routing.effective_backend);
          const dependencies = stringList(stage.dependencies);
          const purpose = stringValue(stage.purpose ?? routing.routing_reason);
          return (
            <li className="grid gap-1 border-l border-border pl-3" key={`${stageId}-${index}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{stageId}</span>
                <span className="text-xs font-semibold text-foreground">{formatLabel(stageType)}</span>
                {preferredBackend ? <Pill tone="blue">{preferredBackend}</Pill> : null}
                {effectiveBackend && effectiveBackend !== preferredBackend ? (
                  <Pill tone="slate">{effectiveBackend}</Pill>
                ) : null}
              </div>
              {purpose ? <p className="text-xs leading-5 text-foreground/85">{purpose}</p> : null}
              {dependencies.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {workshopCopy("agora.workshop.cardLabels.depends_on", "依賴於")} {dependencies.join(", ")}
                </p>
              ) : null}
              <TextList items={stage.blocking_reasons} tone="red" />
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function ObjectSummary({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  const record = asRecord(value);
  const entries = Object.entries(record);
  const scalarItems = stringList(value);
  if (entries.length === 0 && scalarItems.length === 0) return null;

  return (
    <Section title={title}>
      {entries.length > 0 ? (
        <KeyValueGrid
          items={entries.map(([label, entry]) => ({
            label: formatLabel(label),
            value: Array.isArray(entry) ? stringList(entry).join(", ") : entry,
          }))}
        />
      ) : (
        <TextList items={scalarItems} />
      )}
    </Section>
  );
}

export function ResearchPlanCard({ payload }: { payload: UnknownRecord }) {
  const approval = asRecord(payload.approval);
  const budget = asRecord(payload.budget);
  const approvalRequirement = stringValue(payload.approval_requirement ?? approval.state);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.plan", "計畫"), value: payload.plan_id },
          { label: workshopCopy("agora.workshop.cardLabels.status", "狀態"), value: payload.status },
          { label: workshopCopy("agora.workshop.cardLabels.approval", "核准度"), value: approvalRequirement },
          { label: workshopCopy("agora.workshop.cardLabels.no_order_proof", "無下單憑證"), value: payload.no_order_route_proof },
        ]}
      />

      <Section title={workshopCopy("agora.workshop.cardLabels.objectives", "目標")}>
        <TextList items={payload.objectives} />
      </Section>

      <DataRequirementList items={payload.data_requirements} />
      <StageList stages={payload.stages} />
      <ObjectSummary
        title={workshopCopy("agora.workshop.cardLabels.evaluation_criteria", "評估準則")}
        value={payload.evaluation_criteria}
      />
      <ObjectSummary
        title={workshopCopy("agora.workshop.cardLabels.budget", "預算")}
        value={budget}
      />

      <Section title={workshopCopy("agora.workshop.cardLabels.assumptions", "假設條件")}>
        <TextList items={payload.assumptions} />
      </Section>

      <Section title={workshopCopy("agora.workshop.cardLabels.warnings", "警告")}>
        <TextList items={payload.warnings} tone="amber" />
      </Section>
    </div>
  );
}
