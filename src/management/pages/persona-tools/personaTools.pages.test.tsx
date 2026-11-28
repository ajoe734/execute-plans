import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import "@/i18n";
import { setMockResolver, type MockHandler } from "@/lib/bff-v1/client";
import { makeBffError } from "@/lib/bff-v1/errors";
import type { Persona } from "@/lib/bff-v1";
import { MANAGEMENT_SIDEBAR_GROUPS } from "@/management/navigation/managementRouteManifest";
import { MemoryReviewPage } from "./MemoryReviewPage";
import { PersonaLabPage } from "./PersonaLabPage";
import { FeedbackPage } from "./FeedbackPage";

const access = vi.hoisted(() => ({ value: { loading: false, writeAllowed: true, writeDisabledReason: null as string | null } }));
vi.mock("@/agora/useAgoraWriteAccess", () => ({ useAgoraWriteAccess: () => access.value }));

// FE-MGMT-PERSONA-TOOLS-FROM-AGORA-20261127: the persona picker reads the
// persona registry; tests control it directly instead of the live list call.
const registry = vi.hoisted(() => ({ list: (async () => []) as () => Promise<Array<Partial<Persona>>> }));
vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return { ...actual, bffV1: { ...actual.bffV1, personas: { ...actual.bffV1.personas, list: () => registry.list() } } };
});

type Route = { method: string; path: string; handler: MockHandler };
let routes: Route[] = [];
let calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }> = [];

const json = (body: unknown, status = 200) => ({ kind: "json" as const, status, body });
function on(method: string, path: string, handler: MockHandler | unknown) {
  routes.push({ method, path, handler: typeof handler === "function" ? (handler as MockHandler) : () => json(handler) });
}

beforeEach(() => {
  routes = [];
  calls = [];
  access.value = { loading: false, writeAllowed: true, writeDisabledReason: null };
  registry.list = async () => [];
  setMockResolver((method, path) => {
    const hit = routes.find((r) => r.method === method && r.path === path);
    if (!hit) return undefined;
    return async (req) => {
      calls.push({ method, path, body: req.body, headers: req.headers });
      // Real reads are not instant: a refresh must not tear down mounted receipts.
      if (method === "GET") await new Promise((resolve) => setTimeout(resolve, 50));
      return hit.handler(req);
    };
  });
});
afterEach(() => {
  cleanup();
  setMockResolver(undefined);
});

const renderAt = (ui: React.ReactElement, url = "/") => render(<MemoryRouter initialEntries={[url]}>{ui}<LocationProbe /></MemoryRouter>);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

// Shapes mirror the restored BFF routers (committee/owner.envelope, AgoraEnvelope).
const ownerEnvelope = (owner: string, data: unknown) => ({
  status: "ok", reason: null, owner, data, fallback_used: false, environment_ceiling: "paper", execution_authority: "none",
});
const labEnvelope = (data: unknown) => ({ data, meta: { snapshot_at: "2026-11-13T03:00:00Z", capability: "agora.persona_lab.v1", audience: "tenant:t1:user:u1" } });

describe("memory review page", () => {
  const review = {
    entries: [{ type: "persona", entry: { memory_id: "m-1", tenant_id: "t1", persona_id: "p1" } }],
    lesson_candidates: [{ lesson_candidate_id: "lc-1", persona_id: "p1", proposed_change: "avoid gap entries", review_state: "proposed", target_env: "paper" }],
    authz: { allowed: true },
  };

  it("lists entries and candidates and shows the quarantine receipt", async () => {
    on("GET", "/bff/agora/memory", ownerEnvelope("memory", review));
    on("POST", "/bff/agora/memory/lc-1/actions/quarantine", ownerEnvelope("memory", { lesson_candidate_id: "lc-1", tenant_id: "t1", review_state: "quarantined" }));
    renderAt(<MemoryReviewPage />, "/?personaId=p1");
    const candidate = await screen.findByTestId("candidate-lc-1");
    fireEvent.change(within(candidate).getByLabelText(/Reason|原因/), { target: { value: "stale" } });
    fireEvent.change(within(candidate).getByLabelText(/Audit receipt|稽核回條/), { target: { value: "aud-1" } });
    fireEvent.click(within(candidate).getByRole("button", { name: /Quarantine|隔離/ }));
    await waitFor(() => expect(screen.getByTestId("learning-receipt").textContent).toContain('"review_state": "quarantined"'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("learning-receipt").textContent).toContain('"review_state": "quarantined"');
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ reason: "stale", audit_receipt_id: "aud-1", kind: "lesson_candidate" });
    expect(post?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("shows persona_id_required as unavailable", async () => {
    on("GET", "/bff/agora/memory", { status: "unavailable", reason: "no_memory_records", owner: "memory", data: { entries: [], lesson_candidates: [] } });
    renderAt(<MemoryReviewPage />, "/?personaId=p1");
    expect((await screen.findByTestId("learning-unavailable")).textContent).toContain("no_memory_records");
  });
});

describe("persona lab page", () => {
  const harness = {
    active_version: 2,
    versions: [{ version: 2, patch_id: "patch-2" }, { version: 1, patch_id: "patch-1" }],
    patches: {
      "patch-1": { status: "adopted", proposal: { evidence_refs: ["ev-1"] }, comparisons: [] },
      "patch-2": { status: "adopted", proposal: { evidence_refs: ["ev-9", "ev-10"] }, comparisons: [{}], experience: null },
    },
  };
  const changeLog = (experience: unknown = null) => labEnvelope({
    active_version: 2,
    entries: [{ version: 2, patch_id: "patch-2", status: "adopted", evidence_refs: ["ev-9", "ev-10"], active: true, experience, operator_feedback: null, actions: ["accept", "undo", "never_again", "tell_why"] }],
  });
  const base = "/bff/agora/persona-lab/p1";

  function stubReads(log: () => unknown = () => changeLog()) {
    on("GET", `${base}/harness`, labEnvelope(harness));
    on("GET", `${base}/change-log`, () => json(log()));
    on("GET", `${base}/evaluation/suites`, labEnvelope([{ suite_id: "patch-2", runs: 1 }]));
    on("GET", `${base}/evaluation/runs`, labEnvelope([{ run_id: "patch-2:0", suite_id: "patch-2", patch_id: "patch-2", status: "complete", decision: "adopt", reasons: ["better_pnl"], criteria: null, bundle_count: 3 }]));
  }

  it("asks for a persona id instead of reading anything", () => {
    renderAt(<PersonaLabPage />);
    expect(screen.getByTestId("learning-persona-required")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("renders evidence-cited change log and evaluation runs", async () => {
    stubReads();
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    expect(entry.textContent).toContain("ev-9, ev-10");
    expect(await screen.findByText(/patch-2:0/)).toBeTruthy();
  });

  it("undo shows the owner receipt and refreshes the recorded effect", async () => {
    let rolledBack = false;
    stubReads(() => (rolledBack
      ? labEnvelope({ active_version: 1, entries: [{ version: 2, patch_id: "patch-2", status: "rolled_back", evidence_refs: [], active: false, experience: null, operator_feedback: null, actions: ["accept", "undo", "never_again", "tell_why"] }] })
      : changeLog()));
    on("POST", `${base}/change-log/patch-2/undo`, () => { rolledBack = true; return json(labEnvelope({ active_version: 1, rolled_back_patch_id: "patch-2" })); });
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Undo|復原/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "worse fills" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    // Status renders in words; the owner code stays on the element's data-state.
    await waitFor(() => expect(screen.getByTestId("change-patch-2").querySelector('[data-state="rolled_back"]')?.textContent).toMatch(/Rolled back|已復原/));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("change-patch-2").querySelector('[data-state="rolled_back"]')?.textContent).toMatch(/Rolled back|已復原/);
    expect(screen.getByTestId("change-patch-2").textContent).toContain('"rolled_back_patch_id": "patch-2"');
    expect(calls.find((c) => c.path.endsWith("/undo"))?.body).toEqual({ reason: "worse fills" });
  });

  it("never-again shows the recorded negative experience on the entry", async () => {
    let recorded = false;
    stubReads(() => changeLog(recorded ? { kind: "negative", reason: "chases gaps" } : null));
    on("POST", `${base}/change-log/patch-2/never-again`, () => { recorded = true; return json(labEnvelope({ negative_experience_id: "ne-1", patch_id: "patch-2" }), 201); });
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Never do this again|不要再這樣/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "chases gaps" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    expect(await screen.findByTestId("effect-experience-patch-2")).toBeTruthy();
    expect(screen.getByTestId("effect-experience-patch-2").textContent).toContain("chases gaps");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("change-patch-2").textContent).toContain("ne-1");
    expect(screen.getByTestId("effect-experience-patch-2").textContent).toContain("chases gaps");
  });

  it("an owner refusal on accept is shown as unavailable with the reason, not as success", async () => {
    stubReads();
    on("POST", `${base}/change-log/patch-2/accept`, () => ({ kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "persona_owner_service_token_unconfigured" }) }));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Accept|接受/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "adopt-1" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    await waitFor(() => expect(within(screen.getByTestId("change-patch-2")).getByTestId("learning-unavailable").textContent).toContain("persona_owner_service_token_unconfigured"));
    expect(screen.queryByTestId("learning-receipt")).toBeNull();
  });

  it("shadow comparison renders arms and a missing record as unavailable", async () => {
    stubReads();
    on("GET", `${base}/patches/patch-2/shadow-comparison`, labEnvelope({
      patch_id: "patch-2", status: "complete", decision: "adopt", reasons: [], arms: ["base", "candidate"],
      rows: [{ decision_time: "pkt-1", base: "hold", candidate: "enter", decisions_differ: true, virtual_book_delta: null }],
    }));
    on("GET", `${base}/patches/patch-9/shadow-comparison`, () => ({ kind: "error", error: makeBffError({ code: "RESOURCE_NOT_FOUND", cause: "shadow_comparison_not_recorded" }) }));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const panel = await screen.findByTestId("lab-shadow");
    const compare = async (id: string) => {
      fireEvent.change(within(panel).getByRole("textbox"), { target: { value: id } });
      fireEvent.click(within(panel).getByRole("button", { name: /Compare|比對/ }));
    };
    await compare("patch-2");
    expect(await within(panel).findByText("enter")).toBeTruthy();
    expect(within(panel).getByText("hold")).toBeTruthy();
    await compare("patch-9");
    expect((await within(panel).findByTestId("learning-unavailable")).textContent).toContain("shadow_comparison_not_recorded");
  });

  it("skill coaching drafts post to the skill route and reject non-JSON locally", async () => {
    stubReads();
    on("POST", `${base}/skill-coaching/patches`, () => json(labEnvelope({ patch_id: "patch-3", status: "draft" }), 201));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const form = await screen.findByTestId("skill-coaching-form");
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "not json" } });
    fireEvent.click(within(form).getByRole("button"));
    expect(within(form).getByRole("alert")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: '{"skill":"gap-fade"}' } });
    fireEvent.click(within(form).getByRole("button"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ skill: "gap-fade" }));
  });
});

describe("feedback page", () => {
  it("submits evidence with an idempotency key, consent and paper ceiling, and shows the receipt", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "unavailable", reason: "no_new_human_evidence", items: [], total: 0 });
    on("POST", "/bff/agora/notes", () => json({ status: "created", idempotent: false, data: { evidence_id: "ev-x", evidence_type: "note" } }, 201));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-notes");
    const submit = within(form).getByRole("button") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: "trade:42" } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: "entry was late" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(() => expect(within(form).getByTestId("learning-receipt").textContent).toContain("ev-x"));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.headers["Idempotency-Key"]).toBeTruthy();
    expect(post?.body).toMatchObject({ persona_id: "p1", subject_ref: "trade:42", content: { note: "entry was late" }, consent_granted: true, environment_ceiling: "paper" });
    await waitFor(() => expect(screen.getByTestId("feedback-observed").textContent).toContain("no_new_human_evidence"));
  });

  it("surfaces consent refusal from the owner without a receipt", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "ok", reason: null, items: [{ evidence_id: "ev-1", evidence_type: "note" }], total: 1 });
    on("POST", "/bff/agora/insights", () => ({ kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "agora_evidence_durable_owner_unconfigured" }) }));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-insights");
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: "s" } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: "c" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(within(form).getByRole("button"));
    expect((await within(form).findByTestId("learning-unavailable")).textContent).toContain("agora_evidence_durable_owner_unconfigured");
    expect(await screen.findByText(/ev-1/)).toBeTruthy();
  });

  async function fillNote(form: HTMLElement, subject: string, content: string) {
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: subject } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: content } });
    if (!(within(form).getByRole("checkbox") as HTMLInputElement).checked) fireEvent.click(within(form).getByRole("checkbox"));
  }

  it("retries replay the exact frozen payload and key; edited content rotates both ids", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "ok", items: [], total: 0 });
    let n = 0;
    // First attempt: owner answers 409 (digest conflict shape), then 201 on retry.
    on("POST", "/bff/agora/notes", () => (++n === 1
      ? { kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "evidence_idempotency_conflict" }) }
      : json({ status: "created", idempotent: false, data: { evidence_id: "ev-x" } }, 201)));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-notes");
    await fillNote(form, "trade:42", "entry was late");
    fireEvent.click(within(form).getByRole("button"));
    expect((await within(form).findByTestId("learning-unavailable")).textContent).toContain("evidence_idempotency_conflict");
    await new Promise((resolve) => setTimeout(resolve, 25)); // clock moves between attempts
    fireEvent.click(within(form).getByRole("button"));
    await within(form).findByTestId("learning-receipt");
    const [a, b] = calls.filter((c) => c.method === "POST");
    expect(b.headers["Idempotency-Key"]).toBe(a.headers["Idempotency-Key"]);
    expect(b.body).toEqual(a.body);

    await fillNote(form, "trade:42", "entry was very late");
    fireEvent.click(within(form).getByRole("button"));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(3));
    const c3 = calls.filter((c) => c.method === "POST")[2];
    expect(c3.headers["Idempotency-Key"]).not.toBe(a.headers["Idempotency-Key"]);
    expect((c3.body as { evidence_id: string }).evidence_id).not.toBe((a.body as { evidence_id: string }).evidence_id);
    expect((c3.body as { content: unknown }).content).toEqual({ note: "entry was very late" });
  });
});

describe("persona picker (Management persona tools)", () => {
  it.each([
    ["memory", MemoryReviewPage],
    ["lab", PersonaLabPage],
    ["feedback", FeedbackPage],
  ] as const)("lists only current-scope personas on %s, including missing scope without name heuristics", async (_name, Page) => {
    const list = vi.fn(async () => [
      { id: "probe-current", name: "Pantheon Dev Paper Release", listScope: "current" },
      { id: "p-test", name: "Trading persona", listScope: "test" },
      { id: "p-retired", name: "Retired persona", listScope: "retired" },
      { id: "p-research", name: "Research persona", listScope: "research" },
      { id: "p-missing", name: "Legacy persona" },
      { id: "p-unknown", name: "Unknown scope persona", listScope: "unknown" },
    ]);
    registry.list = list;
    renderAt(<Page />);
    const select = screen.getByRole("combobox", { name: /Persona|人格/ }) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["", "probe-current", "p-missing", "p-unknown"]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it.each(["test", "retired", "research"])("accepts a manually entered %s persona as an unlisted selection", async (listScope) => {
    registry.list = async () => [{ id: "p-hidden", name: "Hidden persona", listScope }];
    renderAt(<PersonaLabPage />);
    const select = screen.getByRole("combobox", { name: /Persona|人格/ }) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(within(select).queryByRole("option", { name: "Hidden persona" })).toBeNull();
    const manual = screen.getByTestId("persona-tools-manual-id");
    fireEvent.change(within(manual).getByRole("textbox"), { target: { value: "p-hidden" } });
    fireEvent.submit(within(manual).getByTestId("learning-persona-form"));
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?personaId=p-hidden"));
    expect(select.value).toBe("p-hidden");
    expect(select.selectedOptions[0].textContent).toMatch(/not in the registry|未列/i);
  });

  it("selects a persona by name and writes the persona id into the URL", async () => {
    registry.list = async () => [{ id: "p1", name: "Gap Fader", archetype: "momentum" }, { id: "p2", name: "Mean Reverter" }];
    renderAt(<FeedbackPage />);
    expect(screen.getByTestId("learning-persona-required")).toBeTruthy();
    const select = await screen.findByRole("combobox", { name: /Persona|人格/ });
    await waitFor(() => expect(within(select).getByRole("option", { name: /Gap Fader/ })).toBeTruthy());
    fireEvent.change(select, { target: { value: "p1" } });
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?personaId=p1"));
    expect(await screen.findByTestId("feedback-form-notes")).toBeTruthy();
  });

  it("keeps a deep-linked persona id that is not in the registry selectable instead of dropping it", async () => {
    registry.list = async () => [{ id: "p2", name: "Mean Reverter" }];
    renderAt(<PersonaLabPage />, "/?personaId=p-unlisted");
    const select = await screen.findByRole("combobox", { name: /Persona|人格/ });
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("p-unlisted"));
    expect(screen.queryByTestId("learning-persona-required")).toBeNull();
  });

  it("still lets operators type an id under the advanced disclosure when the registry is unavailable", async () => {
    registry.list = async () => { throw new Error("registry down"); };
    renderAt(<MemoryReviewPage />);
    const select = await screen.findByRole("combobox", { name: /Persona|人格/ });
    await waitFor(() => expect(within(select).getByRole("option", { name: /unavailable|無法讀取/i })).toBeTruthy());
    const manual = screen.getByTestId("persona-tools-manual-id");
    fireEvent.change(within(manual).getByRole("textbox"), { target: { value: "p9" } });
    fireEvent.submit(within(manual).getByTestId("learning-persona-form"));
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?personaId=p9"));
  });

  it("renders memory scope and candidate states in words", async () => {
    on("GET", "/bff/agora/memory", { status: "ok", reason: null, owner: "memory", data: {
      entries: [{ type: "institutional", entry: { memory_id: "m-7", summary: "Fade opening gaps on low volume" } }],
      lesson_candidates: [{ lesson_candidate_id: "lc-9", proposed_change: "avoid gap entries", review_state: "pending_review" }],
    }, fallback_used: false, environment_ceiling: "paper", execution_authority: "none" });
    renderAt(<MemoryReviewPage />);
    const scope = screen.getByRole("combobox", { name: /Scope|範圍/ }) as HTMLSelectElement;
    expect(scope.value).toBe("institutional");
    expect(Array.from(scope.options).map((o) => o.textContent)).not.toContain("institutional");
    const entries = await screen.findByTestId("memory-entries");
    expect(entries.textContent).toContain("Fade opening gaps on low volume");
    const candidate = screen.getByTestId("candidate-lc-9");
    expect(candidate.querySelector('[data-state="pending_review"]')?.textContent).not.toContain("_");
  });
});

describe("persona tools navigation (Management)", () => {
  it("lists the three persona operator tools under Research and Evolution and no Agora target in the sidebar", () => {
    const group = MANAGEMENT_SIDEBAR_GROUPS.find((g) => g.id === "research-and-evolution");
    const byId = new Map((group?.items ?? []).map((i) => [i.id, i]));
    expect(byId.get("persona-memory-review")?.to).toBe("/management/persona-tools/memory");
    expect(byId.get("persona-lab")?.to).toBe("/management/persona-tools/lab");
    expect(byId.get("persona-feedback")?.to).toBe("/management/persona-tools/feedback");
    const allTargets = MANAGEMENT_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(allTargets.some((to) => to.startsWith("/agora/"))).toBe(false);
  });
});
