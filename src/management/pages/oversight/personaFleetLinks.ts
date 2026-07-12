import type {
  ManagementDataSource,
  ManagementPersonaFleetRow,
  ManagementResearchProject,
  ManagementResearchStatus,
} from "@/lib/bff-v1/management";

const UNAVAILABLE_TOKENS = new Set([
  "",
  "#",
  "—",
  "nan",
  "null",
  "undefined",
  "none",
  "n/a",
  "na",
  "unknown",
  "unavailable",
  "not declared",
  "not_declared",
]);

function isUsableToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return !UNAVAILABLE_TOKENS.has(value.trim().toLowerCase());
}

export function cleanQueryParameters(href: string): string {
  try {
    const [beforeHash, hash = ""] = href.split("#", 2);
    const [pathPart, queryPart] = beforeHash.split("?", 2);
    if (!queryPart) return href;
    const params = new URLSearchParams(queryPart);
    const keysToDelete: string[] = [];
    params.forEach((value, key) => {
      const cleanVal = value.trim().toLowerCase();
      const cleanKey = key.trim().toLowerCase();
      if (UNAVAILABLE_TOKENS.has(cleanVal) || UNAVAILABLE_TOKENS.has(cleanKey)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => params.delete(key));
    const newQuery = params.toString().replace(/\+/g, "%20");
    const cleaned = newQuery ? `${pathPart}?${newQuery}` : pathPart;
    return hash ? `${cleaned}#${hash}` : cleaned;
  } catch {
    return href;
  }
}

function normalizeManagementHref(value: unknown): string | null {
  if (!isUsableToken(value)) return null;
  const href = value.trim();
  let normalized: string | null = null;
  if (href.startsWith("/management/") || href === "/management") normalized = normalizeRetiredPromotionHref(href);
  else if (href.startsWith("management/")) normalized = normalizeRetiredPromotionHref(`/${href}`);
  else if (href.startsWith("/bff/management/")) normalized = normalizeRetiredPromotionHref(href.replace(/^\/bff/, ""));
  else if (href.startsWith("bff/management/")) normalized = normalizeRetiredPromotionHref(`/${href.replace(/^bff\//, "")}`);
  else if (href.startsWith("/personas/")) normalized = `/management${href}`;
  else if (href.startsWith("personas/")) normalized = `/management/${href}`;

  if (normalized) {
    return cleanQueryParameters(normalized);
  }
  return null;
}

function normalizeRetiredPromotionHref(href: string): string {
  if (href.startsWith("/management/rebalances") || href.startsWith("/management/rebalance")) {
    return promotionAllocationHref(
      href,
      "quarterly-capital",
      "rebalance_id",
      detailIdFromRetiredHref(href, ["/management/rebalances", "/management/rebalance"])
        ?? queryIdFromHref(href, ["rebalance_id", "rebalanceId", "rebalance", "id"]),
    );
  }
  if (href.startsWith("/management/capital") || href.startsWith("/management/capital-pools")) {
    return promotionAllocationHref(
      href,
      "quarterly-capital",
      "capital_id",
      detailIdFromRetiredHref(href, ["/management/capital-pools", "/management/capital"])
        ?? queryIdFromHref(href, ["capital_id", "capitalPoolId", "capital_pool_id", "pool_id", "pool", "id"]),
    );
  }
  if (href.startsWith("/management/ranking") || href.startsWith("/management/ranking-formulas")) {
    return promotionAllocationHref(
      href,
      "formula-policy",
      "formula_id",
      detailIdFromRetiredHref(href, ["/management/ranking/formulas", "/management/ranking-formulas"])
        ?? queryIdFromHref(href, ["formula_id", "formulaId", "formula", "id"]),
    );
  }
  return href;
}

function detailIdFromRetiredHref(href: string, prefixes: string[]): string | null {
  const [path = ""] = href.split(/[?#]/, 1);
  for (const prefix of prefixes) {
    const detailPrefix = `${prefix}/`;
    if (!path.startsWith(detailPrefix)) continue;
    const [encodedId = ""] = path.slice(detailPrefix.length).split("/", 1);
    try {
      const id = decodeURIComponent(encodedId);
      return isUsableToken(id) ? id : null;
    } catch {
      return isUsableToken(encodedId) ? encodedId : null;
    }
  }
  return null;
}

function queryIdFromHref(href: string, keys: string[]): string | null {
  const [beforeHash] = href.split("#", 1);
  const [, query = ""] = beforeHash.split("?", 2);
  if (!query) return null;
  const params = new URLSearchParams(query);
  for (const key of keys) {
    const value = params.get(key);
    if (isUsableToken(value)) return value.trim();
  }
  return null;
}

function promotionAllocationHref(href: string, tab: string, idParamName?: string, id?: string | null): string {
  const [beforeHash, hash = ""] = href.split("#", 2);
  const [, query = ""] = beforeHash.split("?", 2);
  const params = new URLSearchParams(query);
  const targetTab = params.get("tab") || tab;

  if (targetTab === "emergency-actions" || targetTab === "emergency" || targetTab === "containment") {
    params.set("tab", targetTab);
    if (idParamName && isUsableToken(id)) params.set(idParamName, id);
    const suffix = params.toString();
    return `/management/promotion-allocation${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (targetTab === "real-ranking" || targetTab === "league" || targetTab === "persona-league") {
    params.set("tab", "rolling");
    if (idParamName && isUsableToken(id)) params.set(idParamName, id);
    const suffix = params.toString();
    return `/management/rankings${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
  }
  if (targetTab === "paper-candidates") {
    params.set("tab", "quarterly");
    if (idParamName && isUsableToken(id)) params.set(idParamName, id);
    const suffix = params.toString();
    return `/management/rankings${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
  }
  if (targetTab === "quarterly-capital" || targetTab === "rebalance" || targetTab === "quarterly-rebalance") {
    params.set("tab", "capital");
    if (idParamName && isUsableToken(id)) params.set(idParamName, id);
    const suffix = params.toString();
    return `/management/governance-decisions${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
  }
  if (targetTab === "formula-policy" || targetTab === "ranking-formulas" || targetTab === "formula") {
    params.set("tab", "policy");
    if (idParamName && isUsableToken(id)) params.set(idParamName, id);
    const suffix = params.toString();
    return `/management/governance-decisions${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
  }

  params.set("tab", targetTab);
  if (idParamName && isUsableToken(id)) params.set(idParamName, id);
  const suffix = params.toString();
  return `/management/governance-decisions${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
}

function promotionAllocationCapitalHref(href: string): string | null {
  if (!href.startsWith("/management/promotion-allocation") && !href.startsWith("/management/governance-decisions")) return null;
  const [beforeHash, hash = ""] = href.split("#", 2);
  const [, query = ""] = beforeHash.split("?", 2);
  const params = new URLSearchParams(query);
  if (!isUsableToken(params.get("capital_id"))) return null;
  params.set("tab", "capital");
  const suffix = params.toString();
  return `/management/governance-decisions${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
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
  capitalMode?: string;
  capital_mode?: string;
  deploymentStage?: string;
  deployment_stage?: string;
  state?: string;
  status?: string;
  capitalPoolId?: string;
  capital_pool_id?: string;
  capitalPool?: { id?: unknown; mode?: unknown; paperCapitalPoolId?: unknown; paper_capital_pool_id?: unknown };
  capital_pool?: { id?: unknown; mode?: unknown; paperCapitalPoolId?: unknown; paper_capital_pool_id?: unknown };
  paperCapitalPoolId?: string;
  paper_capital_pool_id?: string;
  legacyPaperCapitalPoolId?: string;
  legacy_paper_capital_pool_id?: string;
  paperLedgerId?: string;
  paper_ledger_id?: string;
  paperLedger?: { id?: unknown };
  paper_ledger?: { id?: unknown };
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

function pathPartFromHref(href: string): string {
  return href.split(/[?#]/, 1)[0] ?? "";
}

function detailIdFromManagementHref(href: string, prefixes: string[]): string | null {
  const path = pathPartFromHref(href);
  for (const prefix of prefixes) {
    if (!path.startsWith(prefix)) continue;
    const [encodedId = ""] = path.slice(prefix.length).split("/", 1);
    try {
      const id = decodeURIComponent(encodedId);
      return isUsableToken(id) ? id : null;
    } catch {
      return isUsableToken(encodedId) ? encodedId : null;
    }
  }
  return null;
}

function researchDetailIdFromHref(href: string): string | null {
  return detailIdFromManagementHref(href, [
    "/management/experiments/",
    "/management/research/",
  ]);
}

function canonicalResearchDetailHref(href: string): string | null {
  const id = researchDetailIdFromHref(href);
  return id ? `/management/experiments/${encodeURIComponent(id)}` : null;
}

function isResearchDetailHref(href: string): boolean {
  return Boolean(researchDetailIdFromHref(href));
}

function isResearchLoopHref(href: string): boolean {
  return pathPartFromHref(href) === "/management/loops/research";
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
    item?.href ? { href: item.href } : undefined,
    project?.linkTargets,
    project?.link_targets,
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

function paperCapitalPoolId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const id = raw.paperCapitalPoolId
    ?? raw.paper_capital_pool_id
    ?? raw.legacyPaperCapitalPoolId
    ?? raw.legacy_paper_capital_pool_id
    ?? raw.capitalPool?.paperCapitalPoolId
    ?? raw.capitalPool?.paper_capital_pool_id
    ?? raw.capital_pool?.paperCapitalPoolId
    ?? raw.capital_pool?.paper_capital_pool_id;
  return isUsableToken(id) ? String(id).trim() : undefined;
}

function paperLedgerId(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const id = raw.paperLedgerId ?? raw.paper_ledger_id ?? raw.paperLedger?.id ?? raw.paper_ledger?.id;
  return isUsableToken(id) ? id.trim() : undefined;
}

function capitalMode(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as RawPersonaFleetRow;
  const mode = raw.capitalMode
    ?? raw.capital_mode
    ?? raw.capitalPool?.mode
    ?? raw.capital_pool?.mode
    ?? raw.deploymentStage
    ?? raw.deployment_stage
    ?? raw.state
    ?? raw.status;
  return isUsableToken(mode) ? String(mode).trim().toLowerCase() : undefined;
}

function isPaperCapitalRow(r: ManagementPersonaFleetRow): boolean {
  const mode = capitalMode(r);
  if (["live", "live_running", "canary", "canary_running", "real", "real_running"].includes(mode ?? "")) return false;
  return Boolean(
    (mode && (mode === "paper" || mode === "paper_running" || mode === "paper_challenger"))
    || paperLedgerId(r),
  );
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
  ], isResearchDetailHref);
}

function researchProjectForItem(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): RawResearchProject | undefined {
  if (!item) return firstResearchProject(r);
  return currentResearchProjects(r).find((project) => {
    const id = projectId(project);
    if (item.projectId && id === item.projectId) return true;
    const expId = project?.experimentId ?? project?.experiment_id;
    if (item.experimentId && isUsableToken(expId) && expId === item.experimentId) return true;
    const artId = project?.artifactId ?? project?.artifact_id;
    return Boolean(item.artifactId && isUsableToken(artId) && artId === item.artifactId);
  });
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
        title: project.title || currentWork(r) || status?.summary || "—",
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
    title: title ?? "—",
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
  const project = researchProjectForItem(r, item);
  const rowRecords = item && currentResearchProjects(r).length > 1 ? [] : rowLinkRecords(r);
  const canonical = firstCanonicalHref([
    ...researchLinkRecords(item, project),
    ...rowRecords,
  ], [
    "research",
    "researchProject",
    "research_project",
    "researchHref",
    "research_href",
    "orient",
    "orientHref",
    "orient_href",
  ], isResearchDetailHref);
  if (canonical) return canonicalResearchDetailHref(canonical);
  const id = item?.experimentId ?? experimentId(researchStatus(r), project);
  if (id && isUsableToken(id)) return `/management/experiments/${encodeURIComponent(id)}`;
  return null;
}

export function personaFleetResearchLoopHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string | null {
  const project = researchProjectForItem(r, item);
  const rowRecords = item && currentResearchProjects(r).length > 1 ? [] : rowLinkRecords(r);
  const canonical = firstCanonicalHref([
    ...researchLinkRecords(undefined, project),
    ...rowRecords,
  ], [
    "research",
    "researchProject",
    "research_project",
    "researchHref",
    "research_href",
    "orient",
    "orientHref",
    "orient_href",
  ], isResearchLoopHref);
  if (canonical) return cleanQueryParameters(canonical);

  const personaId = encodedPersonaId(r);
  if (!personaId) return null;
  const projectFocus = item?.projectId ?? projectId(project);
  const cleanProject = projectFocus && isUsableToken(projectFocus)
    ? `&project=${encodeURIComponent(projectFocus)}`
    : "";
  return `/management/loops/research?persona=${personaId}${cleanProject}`;
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
  if (canonical) {
    if (canonical.startsWith("/management/performance-attribution")) {
      const rest = canonical.slice("/management/performance-attribution".length);
      const prefix = "/management/performance?tab=attribution";
      return rest.startsWith("?") ? `${prefix}&${rest.slice(1)}` : `${prefix}${rest}`;
    }
    return canonical;
  }
  const personaId = encodedPersonaId(r);
  return personaId ? `/management/performance?tab=attribution&dimension=persona&persona=${personaId}` : null;
}

export function personaFleetRankHref(r: ManagementPersonaFleetRow): string | null {
  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "rank",
    "rankHref",
    "rank_href",
    "league",
    "leagueHref",
    "league_href",
    "personaLeague",
    "persona_league",
    "personaLeagueHref",
    "persona_league_href",
    "ranking",
    "rankingHref",
    "ranking_href",
  ], (href) => (
    href.startsWith("/management/persona-league")
    || href.startsWith("/management/quarterly-ranking")
    || href.startsWith("/management/rankings")
  ));
  if (canonical) {
    if (canonical.startsWith("/management/persona-league")) {
      return canonical.replace("/management/persona-league", "/management/rankings?tab=rolling");
    }
    if (canonical.startsWith("/management/quarterly-ranking")) {
      return canonical.replace("/management/quarterly-ranking", "/management/rankings?tab=quarterly");
    }
    return canonical;
  }
  const personaId = encodedPersonaId(r);
  if (!personaId) return null;
  return isPaperCapitalRow(r)
    ? `/management/rankings?tab=quarterly&persona=${personaId}`
    : `/management/rankings?tab=rolling&persona=${personaId}`;
}

export function personaFleetMutationHref(r: ManagementPersonaFleetRow): string | null {
  const personaId = rowPersonaId(r);
  if (!personaId || personaId === "nan" || personaId === "undefined") return null;

  const raw = r as RawPersonaFleetRow;
  const mId = r.mutationEntryId ?? raw.mutation_entry_id;
  const eId = r.evolutionEntryId ?? raw.evolution_entry_id;
  const evoHref = r.evolutionHref ?? raw.evolution_href;

  const isValidId = (id: unknown): id is string => {
    if (typeof id !== "string") return false;
    const trimmed = id.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (UNAVAILABLE_TOKENS.has(lower)) return false;
    if (lower === "nan" || lower === "undefined" || lower === "null") return false;
    // 檢查是否為日期格式 YYYY-MM-DD
    if (/^\d{4}[-/]\d{2}[-/]\d{2}(?:T|\s|$)/.test(trimmed)) return false;
    return true;
  };

  const encodedPersona = encodeURIComponent(personaId);

  // 1. prefer formal mutation_entry_id / evolution_entry_id link targets;
  if (isValidId(mId)) {
    return `/management/evolution-journal?persona=${encodedPersona}&mutation_review=${encodeURIComponent(mId)}`;
  }
  if (isValidId(eId)) {
    return `/management/evolution-journal?persona=${encodedPersona}&mutation_review=${encodeURIComponent(eId)}`;
  }

  // 2. check linkTargets / links for canonical learn/mutation URL
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
  if (canonical && typeof canonical === "string") {
    const cleaned = cleanQueryParameters(canonical);
    if (cleaned && !cleaned.includes("=nan") && !cleaned.includes("=undefined")) {
      return cleaned;
    }
  }

  // 3. use evolutionHref if it is a valid non-nan url
  if (evoHref && typeof evoHref === "string") {
    const cleaned = cleanQueryParameters(evoHref);
    if (cleaned && !cleaned.includes("=nan") && !cleaned.includes("=undefined")) {
      return cleaned;
    }
  }

  // 4. use persona-scoped fallback links only when formal ids are absent
  // 規格：keep the row hyperlink when fallback context is useful.
  // 也就是有 lastMutationKind === "fleet_summary" 或是 lastMutationAt 存在且有效
  const lastAt = r.lastMutationAt ?? raw.last_mutation_at ?? r.lastMutation ?? raw.last_mutation;
  const isFallbackUseful = (r.lastMutationKind === "fleet_summary") || isUsableToken(lastAt);
  if (isFallbackUseful) {
    return `/management/evolution-journal?persona=${encodedPersona}&source=fleet_summary`;
  }

  // 5. no useful data -> no link
  return null;
}

export function personaFleetCapitalHref(r: ManagementPersonaFleetRow): string | null {
  if (isPaperCapitalRow(r)) {
    const personaId = encodedPersonaId(r);
    return personaId ? `/management/rankings?tab=quarterly&persona=${personaId}` : null;
  }

  const canonical = firstCanonicalHref(rowLinkRecords(r), [
    "capital",
    "capitalHref",
    "capital_href",
    "capitalPool",
    "capital_pool",
    "capitalPoolHref",
    "capital_pool_href",
  ]);
  const promotionCapital = canonical ? promotionAllocationCapitalHref(canonical) : null;
  if (promotionCapital) return promotionCapital;
  if (canonical?.startsWith("/management/capital/")) {
    const id = decodeURIComponent(canonical.replace(/^\/management\/capital\//, "").split(/[?#]/, 1)[0] ?? "");
    return isUsableToken(id)
      ? `/management/governance-decisions?tab=capital&capital_id=${encodeURIComponent(id)}`
      : "/management/governance-decisions?tab=capital";
  }
  if (canonical?.startsWith("/management/capital")) return normalizeRetiredPromotionHref(canonical);
  const id = capitalPoolId(r) ?? paperLedgerId(r);
  return id ? `/management/governance-decisions?tab=capital&capital_id=${encodeURIComponent(id)}` : null;
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
