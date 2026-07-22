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
  type UnknownRecord,
} from "./workshopCardUtils";

function DataRequirementList({ items }: { items: unknown }) {
  const requirements = recordList(items);
  const scalarRequirements = stringList(items);

  if (requirements.length === 0 && scalarRequirements.length === 0) return null;

  return (
    <Section title="Data Requirements">
      <ul className="space-y-2">
        {requirements.map((requirement, index) => {
          const ref = stringValue(requirement.ref ?? requirement.dataset ?? requirement.source, `requirement-${index + 1}`);
          const kind = stringValue(requirement.kind ?? requirement.type);
          const description = stringValue(requirement.description ?? requirement.summary);
          return (
            <li className="text-xs text-slate-600" key={`${ref}-${index}`}>
              <span className="font-medium text-slate-800">{ref}</span>
              {kind ? <span className="ml-2 text-slate-400">{formatLabel(kind)}</span> : null}
              {description ? <p className="mt-0.5 leading-5">{description}</p> : null}
            </li>
          );
        })}
        {requirements.length === 0
          ? scalarRequirements.map((item) => (
              <li className="text-xs text-slate-600" key={item}>
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
    <Section title="Stages">
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
            <li className="grid gap-1 border-l border-slate-200 pl-3" key={`${stageId}-${index}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-slate-400">{stageId}</span>
                <span className="text-xs font-semibold text-slate-800">{formatLabel(stageType)}</span>
                {preferredBackend ? <Pill tone="blue">{preferredBackend}</Pill> : null}
                {effectiveBackend && effectiveBackend !== preferredBackend ? (
                  <Pill tone="slate">{effectiveBackend}</Pill>
                ) : null}
              </div>
              {purpose ? <p className="text-xs leading-5 text-slate-600">{purpose}</p> : null}
              {dependencies.length > 0 ? (
                <p className="text-[11px] text-slate-400">Depends on {dependencies.join(", ")}</p>
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
  if (entries.length === 0) return null;

  return (
    <Section title={title}>
      <KeyValueGrid
        items={entries.map(([label, entry]) => ({
          label: formatLabel(label),
          value: Array.isArray(entry) ? stringList(entry).join(", ") : entry,
        }))}
      />
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
          { label: "Plan", value: payload.plan_id },
          { label: "Status", value: payload.status },
          { label: "Approval", value: approvalRequirement },
          { label: "No-order proof", value: payload.no_order_route_proof },
        ]}
      />

      <Section title="Objectives">
        <TextList items={payload.objectives} />
      </Section>

      <DataRequirementList items={payload.data_requirements} />
      <StageList stages={payload.stages} />
      <ObjectSummary title="Evaluation Criteria" value={payload.evaluation_criteria} />
      <ObjectSummary title="Budget" value={budget} />

      <Section title="Assumptions">
        <TextList items={payload.assumptions} />
      </Section>

      <Section title="Warnings">
        <TextList items={payload.warnings} tone="amber" />
      </Section>
    </div>
  );
}
