import type {
  ManagementDataSource,
  ManagementPersonaFleetRow,
  ManagementResearchProject,
  ManagementResearchStatus,
} from "@/lib/bff-v1/management";

const UNAVAILABLE_TOKENS = new Set([
  "",
  "#",
  "nan",
  "null",
  "undefined",
  "none",
  "n/a",
  "na",
  "unavailable",
  "not declared",
  "not_declared",
]);

function isUsableToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return !UNAVAILABLE_TOKENS.has(value.trim().toLowerCase());
}

function normalizeManagementHref(value: unknown): string | null {
  if (!isUsableToken(value)) return null;
  const href = value.trim();
  if (href.startsWith("/management/") || href === "/management") return href;
  if (href.startsWith("management/")) return `/${href}`;
  if (href.startsWith("/bff/management/")) return href.replace(/^\/bff/, "");
  if (href.startsWith("bff/management/")) return `/${href.replace(/^bff\//, "")}`;
  if (href.startsWith("/personas/")) return `/management${href}`;
  if (href.startsWith("personas/")) return `/management/${href}`;
  return null;
}

function sourceProviderKey(source?: ManagementDataSource): string | null {
  const raw = source as RawDataSource | undefined;
  const key = raw?.providerKey ?? raw?.provider_key;
  return isUsableToken(key) ? key.trim() : null;
}

function rowPersonaId(r: ManagementPersonaFleetRow): string | null {
  const raw = r as RawPersonaFleetRow;
  const id = r.personaId ?? raw.persona_id ?? raw.id;
  return isUsableToken(id) ? id.trim() : null;
}

function dataSourceFocusHref(r: ManagementPersonaFleetRow, providerKey?: string | null): string | null {
  const personaId = rowPersonaId(r);
  if (!personaId) return null;
  const href = `/management/data-sources?persona=${encodeURIComponent(personaId)}`;
  return providerKey && isUsableToken(providerKey)
    ? `${href}&source=${encodeURIComponent(providerKey.trim())}`
    : href;
}

type RawLinkRecord = Record<string, unknown>;

type RawResearchStatus = ManagementResearchStatus & {
  framework_count?: number;
  experiment_id?: string;
  strategy_id?: string;
  strategy_spec_id?: string;
  artifact_id?: string;
  artifact_state?: string;
  deployment_stage?: string;
  dataset_ref?: string;
  registry_admission_status?: string;
  pending_task_ids?: string[];
  can_deploy?: boolean;
};

type RawResearchProject = ManagementResearchProject & {
  project_id?: string;
  dataset_ref?: string;
  artifact_id?: string;
  experiment_id?: string;
  blocked_by_task_ids?: string[];
  can_deploy?: boolean;
  linkTargets?: RawLinkRecord;
  link_targets?: RawLinkRecord;
};

type RawPersonaFleetRow = ManagementPersonaFleetRow & {
  id?: string;
  persona_id?: string;
  current_work?: string;
  research_status?: RawResearchStatus;
  current_research_projects?: RawResearchProject[];
  humanGateId?: string;
  human_gate_id?: string;
  inboxId?: string;
  inbox_id?: string;
  decisionId?: string;
  decision_id?: string;
  approvalId?: string;
  approval_id?: string;
  promotionReviewId?: string;
  promotion_review_id?: string;
  requiredHumanReview?: string;
  required_human_review?: string;
  runtimeId?: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  bindingId?: string;
  binding_id?: string;
  capitalPoolId?: string;
  capital_pool_id?: string;
  capitalPool?: { id?: unknown };
  capital_pool?: { id?: unknown };
  links?: RawLinkRecord;
  review?: RawLinkRecord;
  linkTargets?: RawLinkRecord;
  link_targets?: RawLinkRecord;
};

type RawDataSource = ManagementDataSource & {
  provider_key?: string;
  linkTargets?: RawLinkRecord;
  link_targets?: RawLinkRecord;
};

export type PersonaFleetResearchItem = {
  key: string;
  title: string;
  stage?: string;
  status?: string;
  frameworks: string[];
  frameworkCount?: number;
  projectId?: string;
  experimentId?: string;
  artifactId?: string;
  datasetRef?: string;
  canDeploy?: boolean;
  href?: string | null;
};

const HREF_FIELDS = [
  "href",
  "routeHref",
  "route_href",
  "managementHref",
  "management_href",
  "manageHref",
  "manage_href",
  "detailHref",
  "detail_href",
  "primaryObjectHref",
  "primary_object_href",
  "recommendedActionHref",
  "recommended_action_href",
] as const;

function linkTargetUnavailable(record: RawLinkRecord): boolean {
  if (record.available === false || record.enabled === false || record.disabled === true || record.unavailable === true) {
    return true;
  }
  const status = String(record.status ?? record.state ?? record.availability ?? "").trim().toLowerCase();
  return ["unavailable", "disabled", "missing", "none", "nan"].includes(status);
}

function hrefFromTarget(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  const direct = normalizeManagementHref(value);
  if (direct) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as RawLinkRecord;
  if (linkTargetUnavailable(record)) return null;

  for (const field of HREF_FIELDS) {
    const href = normalizeManagementHref(record[field]);
    if (href) return href;
  }

  return hrefFromTarget(record.target, depth + 1)
    ?? hrefFromTarget(record.link, depth + 1)
    ?? hrefFromTarget(record.canonical, depth + 1);
}

function valueAtPath(record: RawLinkRecord | undefined, path: string): unknown {
  if (!record) return undefined;
  const parts = path.split(".");
  let cursor: unknown = record;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as RawLinkRecord)[part];
  }
  return cursor;
}

function firstCanonicalHref(
  records: Array<RawLinkRecord | undefined>,
  keys: string[],
  predicate?: (href: string) => boolean,
): string | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const href = hrefFromTarget(valueAtPath(record, key));
      if (href && (!predicate || predicate(href))) return href;
    }
  }
  return null;
}

function rowLinkRecords(r: ManagementPersonaFleetRow): Array<RawLinkRecord | undefined> {
  const raw = r as RawPersonaFleetRow;
  return [raw.linkTargets, raw.link_targets, raw.links];
}

function sourceLinkRecords(source?: ManagementDataSource): Array<RawLinkRecord | undefined> {
  const raw = source as RawDataSource | undefined;
  return [raw?.linkTargets, raw?.link_targets];
}

function researchLinkRecords(item?: PersonaFleetResearchItem, project?: RawResearchProject): Array<RawLinkRecord | undefined> {
  return [
    project?.linkTargets,
    project?.link_targets,
    item?.href ? { href: item.href } : undefined,
  ];
}

function currentWork(r: ManagementPersonaFleetRow): string | undefined {
  return r.currentWork ?? (r as RawPersonaFleetRow).current_work;
}

function encodedPersonaId(r: ManagementPersonaFleetRow): string | null {
  const personaId = rowPersonaId(r);
  return personaId ? encodeURIComponent(personaId) : null;
}

function capitalPoolId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const id = raw.capitalPoolId ?? raw.capital_pool_id ?? raw.capitalPool?.id ?? raw.capital_pool?.id;
  return isUsableToken(id) ? id.trim() : undefined;
}

function runtimeId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const id = r.runtimeId ?? raw.runtime_id;
  return isUsableToken(id) ? id : undefined;
}

function runtimeBindingId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const id = r.runtimeBindingId ?? raw.runtime_binding_id ?? raw.bindingId ?? raw.binding_id;
  return isUsableToken(id) ? id : undefined;
}

function humanInboxId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const review = raw.review;
  const id = review?.inboxId ?? review?.inbox_id;
  return isUsableToken(id) ? id : undefined;
}

function runtimeHrefFromParts(r: ManagementPersonaFleetRow): string | null {
  const personaId = encodedPersonaId(r);
  const rt = runtimeId(r);
  if (!personaId || !rt) return null;
  let href = `/management/runtimes?persona=${personaId}&runtime=${encodeURIComponent(rt)}`;
  const binding = runtimeBindingId(r);
  if (binding) href += `&binding=${encodeURIComponent(binding)}`;
  return href;
}

function normalizeRuntimeHref(r: ManagementPersonaFleetRow, href: string | null): string | null {
  if (!href) return null;
  const runtimeDetailMatch = href.match(/^\/management\/runtimes\/([^/?#]+)$/);
  if (runtimeDetailMatch) {
    const personaId = encodedPersonaId(r);
    const runtime = decodeURIComponent(runtimeDetailMatch[1]);
    if (!personaId || !isUsableToken(runtime) || runtimeId(r) !== runtime) return null;
    let next = `/management/runtimes?persona=${personaId}&runtime=${encodeURIComponent(runtime)}`;
    const binding = runtimeBindingId(r);
    if (binding) next += `&binding=${encodeURIComponent(binding)}`;
    return next;
  }
  return href.startsWith("/management/runtimes") ? href : null;
}

function humanInboxHrefFromRow(r: ManagementPersonaFleetRow): string | null {
  const raw = r as RawPersonaFleetRow;
  const route = normalizeManagementHref(raw.review?.route);
  if (route?.startsWith("/management/human-inbox?")) return route;
  const id = humanInboxId(r);
  if (!id && !route?.startsWith("/management/human-inbox")) return null;
  const personaId = encodedPersonaId(r);
  return personaId ? `/management/human-inbox?persona=${personaId}` : "/management/human-inbox";
}

function researchStatus(r: ManagementPersonaFleetRow): RawResearchStatus | undefined {
  return r.researchStatus ?? (r as RawPersonaFleetRow).research_status;
}

function currentResearchProjects(r: ManagementPersonaFleetRow): RawResearchProject[] {
  return r.currentResearchProjects ?? (r as RawPersonaFleetRow).current_research_projects ?? [];
}

function firstResearchProject(r: ManagementPersonaFleetRow): RawResearchProject | undefined {
  return currentResearchProjects(r)[0];
}

function projectId(project?: RawResearchProject): string | undefined {
  const id = project?.projectId ?? project?.project_id;
  return isUsableToken(id) ? id : undefined;
}

function experimentId(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  const id = project?.experimentId ?? project?.experiment_id ?? status?.experimentId ?? status?.experiment_id;
  return isUsableToken(id) ? id : undefined;
}

function artifactId(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  const id = project?.artifactId ?? project?.artifact_id ?? status?.artifactId ?? status?.artifact_id;
  return isUsableToken(id) ? id : undefined;
}

function datasetRef(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  const id = project?.datasetRef ?? project?.dataset_ref ?? status?.datasetRef ?? status?.dataset_ref;
  return isUsableToken(id) ? id : undefined;
}

function canDeploy(status?: RawResearchStatus, project?: RawResearchProject): boolean | undefined {
  return project?.canDeploy ?? project?.can_deploy ?? status?.canDeploy ?? status?.can_deploy;
}

function frameworks(status?: RawResearchStatus, project?: RawResearchProject): string[] {
  if (project?.frameworks?.length) return project.frameworks;
  if (status?.frameworks?.length) return status.frameworks;
  return status?.framework ? [status.framework] : [];
}

function frameworkCount(status?: RawResearchStatus, project?: RawResearchProject): number | undefined {
  const declared = status?.frameworkCount ?? status?.framework_count;
  const visible = frameworks(status, project).length;
  return declared && declared > visible ? declared : visible || undefined;
}

function researchProjectHref(project?: RawResearchProject): string | null {
  return firstCanonicalHref(researchLinkRecords(undefined, project), [
    "research",
    "researchHref",
    "research_href",
    "orient",
  ]);
}

export function personaFleetResearchItems(r: ManagementPersonaFleetRow): PersonaFleetResearchItem[] {
  const status = researchStatus(r);
  const projects = currentResearchProjects(r);
  if (projects.length > 0) {
    return projects.map((project, index) => {
      const id = projectId(project);
      const expId = experimentId(status, project);
      const artId = artifactId(status, project);
      return {
        key: id ?? expId ?? artId ?? `${r.personaId}-research-${index}`,
        title: project.title || currentWork(r) || status?.summary || "nan",
        stage: project.stage ?? status?.stage,
        status: project.status,
        frameworks: frameworks(status, project),
        frameworkCount: frameworkCount(status, project),
        projectId: id,
        experimentId: expId,
        artifactId: artId,
        datasetRef: datasetRef(status, project),
        canDeploy: canDeploy(status, project),
        href: researchProjectHref(project),
      };
    });
  }

  const expId = experimentId(status);
  const artId = artifactId(status);
  const title = currentWork(r) || status?.summary || artId || expId || status?.stage;
  if (!title && !status?.stage && !expId && !artId && frameworks(status).length === 0) return [];
  return [{
    key: expId ?? artId ?? `${r.personaId}-research-status`,
    title: title ?? "nan",
    stage: status?.stage,
    frameworks: frameworks(status),
    frameworkCount: frameworkCount(status),
    experimentId: expId,
    artifactId: artId,
    datasetRef: datasetRef(status),
    canDeploy: canDeploy(status),
  }];
}

export function personaFleetPersonaHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "persona",
    "personaHref",
    "persona_href",
    "detail",
    "detailHref",
    "detail_href",
    "manageHref",
    "manage_href",
    "primaryObjectHref",
    "primary_object_href",
  ]);
  if (canonical) return canonical;
  const personaId = encodedPersonaId(r);
  return personaId ? `/management/personas/${personaId}` : null;
}

export function personaFleetResearchHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string | null {
  const project = firstResearchProject(r);
  const canonical = firstCanonicalHref([
    ...researchLinkRecords(item, project),
    ...rowLinkRecords(r),
  ], [
    "research",
    "researchProject",
    "research_project",
    "researchHref",
    "research_href",
    "orient",
    "orientHref",
    "orient_href",
  ]);
  if (canonical) return canonical;
  const id = item?.experimentId ?? experimentId(researchStatus(r), project);
  if (id && isUsableToken(id)) return `/management/experiments/${encodeURIComponent(id)}`;
  const personaId = encodedPersonaId(r);
  if (!personaId) return null;
  const projectFocus = item?.projectId ?? projectId(project);
  return `/management/loops/research?persona=${personaId}${
    projectFocus && isUsableToken(projectFocus) ? `&project=${encodeURIComponent(projectFocus)}` : ""
  }`;
}

export function personaFleetArtifactHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string | null {
  const canonical = firstCanonicalHref([
    ...researchLinkRecords(item, firstResearchProject(r)),
    ...rowLinkRecords(r),
  ], [
    "artifact",
    "artifactHref",
    "artifact_href",
  ]);
  return canonical;
}

export function personaFleetDataSourcesHref(
  r: ManagementPersonaFleetRow,
  source?: ManagementDataSource,
): string | null {
  if (!rowPersonaId(r)) return null;
  const providerKey = sourceProviderKey(source);
  const sourceKeys = isUsableToken(providerKey)
    ? [
      `dataSources.${providerKey}`,
      `data_sources.${providerKey}`,
      `dataSource.${providerKey}`,
      `data_source.${providerKey}`,
      `sources.${providerKey}`,
      `providers.${providerKey}`,
      `source:${providerKey}`,
      `provider:${providerKey}`,
    ]
    : [];
  if (source) {
    return firstCanonicalHref(sourceLinkRecords(source), [
      "dataSource",
      "data_source",
      "dataSources",
      "data_sources",
      "href",
      "detailHref",
      "detail_href",
      "manageHref",
      "manage_href",
      "observe",
      "observeHref",
      "observe_href",
    ])
      ?? firstCanonicalHref(rowLinkRecords(r), sourceKeys)
      ?? dataSourceFocusHref(r, providerKey);
  }

  const personaScopedHref = dataSourceFocusHref(r);
  if (personaScopedHref) return personaScopedHref;

  return firstCanonicalHref([
    ...rowLinkRecords(r),
  ], [
    "dataSources",
    "data_sources",
    "dataSource",
    "data_source",
    "dataSourcesHref",
    "data_sources_href",
    "observe",
    "observeHref",
    "observe_href",
  ]);
}

export function personaFleetPerformanceHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "performance",
    "performanceAttribution",
    "performance_attribution",
    "performanceHref",
    "performance_href",
  ]);
  if (canonical) return canonical;
  const personaId = encodedPersonaId(r);
  return personaId ? `/management/performance-attribution?dimension=persona&persona=${personaId}` : null;
}

export function personaFleetMutationHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "mutation",
    "mutationHref",
    "mutation_href",
    "evolution",
    "evolutionJournal",
    "evolution_journal",
    "learn",
    "learnHref",
    "learn_href",
  ]);
  if (canonical) return canonical;
  const personaId = encodedPersonaId(r);
  return personaId ? `/management/evolution-journal?persona=${personaId}` : null;
}

export function personaFleetCapitalHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "capital",
    "capitalHref",
    "capital_href",
    "capitalPool",
    "capital_pool",
    "capitalPoolHref",
    "capital_pool_href",
  ]);
  if (canonical?.startsWith("/management/capital/")) {
    const id = decodeURIComponent(canonical.replace(/^\/management\/capital\//, "").split(/[?#]/, 1)[0] ?? "");
    return isUsableToken(id) ? `/management/capital?pool=${encodeURIComponent(id)}` : "/management/capital";
  }
  if (canonical) return canonical;
  const id = capitalPoolId(r);
  return id ? `/management/capital?pool=${encodeURIComponent(id)}` : null;
}

export function personaFleetHumanGateHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "humanGate",
    "human_gate",
    "human",
    "humanInbox",
    "human_inbox",
    "readinessBlocker",
    "readiness_blocker",
    "decide",
    "decideHref",
    "decide_href",
    "recommendedActionHref",
    "recommended_action_href",
  ], (href) => href.startsWith("/management/human-inbox") || href.startsWith("/management/readiness"));
  return canonical ?? humanInboxHrefFromRow(r);
}

export function personaFleetOnboardingHref(r: ManagementPersonaFleetRow): string | null {
  return firstCanonicalHref(rowLinkRecords(r), [
    "onboarding",
    "onboardingHref",
    "onboarding_href",
  ]);
}

export function personaFleetRuntimeHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "runtime",
    "runtimeHref",
    "runtime_href",
    "runtimeAction",
    "runtime_action",
    "action",
    "act",
    "actHref",
    "act_href",
  ]);
  return normalizeRuntimeHref(r, canonical) ?? runtimeHrefFromParts(r);
}

export function personaFleetOodaHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string | null {
  switch (String(r.ooda ?? "").toLowerCase()) {
    case "observe":
      return personaFleetDataSourcesHref(r);
    case "orient":
      return personaFleetResearchHref(r, item);
    case "decide":
      return personaFleetHumanGateHref(r);
    case "act":
      return personaFleetRuntimeHref(r);
    case "learn":
      return personaFleetMutationHref(r);
    default:
      return null;
  }
}
