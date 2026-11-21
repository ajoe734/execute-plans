import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  detectReadability, readabilityResult, summarizeReadability, readabilityMarkdown,
} from "../lib/management-readability.mjs";

const fx = (name) => readFileSync(resolve("scripts/__tests__/fixtures/management-readability", name), "utf8");
const find = (text, detector) => detectReadability(text).find((f) => f.detector === detector);

test("human inbox: internal ids, snake_case codes, key=value dumps", () => {
  const text = fx("human-inbox.txt");
  assert.ok(find(text, "internal_id").samples.some((s) => s.startsWith("rb-")));
  assert.ok(find(text, "enum_code").samples.includes("worst_metric"));
  assert.ok(find(text, "key_value").samples.some((s) => s.startsWith("cluster=")));
});

test("persona intent: untranslated enum codes, mtg/persona ids, repeated long line", () => {
  const text = fx("persona-intent.txt");
  const ids = find(text, "internal_id").samples.join(" ");
  assert.match(ids, /persona-ee7112a829d38b9135ac/);
  assert.match(ids, /mtg-16d42d0b44df/);
  assert.ok(find(text, "enum_code").samples.includes("in_progress"));
  assert.ok(find(text, "repeated_long_line"));
});

test("persona-intent route name alone is not an internal id", () => {
  assert.equal(find("persona-intent\npersona-fleet", "internal_id"), undefined);
});

test("runtimes: pcb/rb/persona ids and nan cells", () => {
  const text = fx("runtimes.txt");
  assert.ok(find(text, "internal_id").samples.some((s) => s.startsWith("pcb-")));
  assert.ok(find(text, "nan").count >= 3);
});

test("nan detector ignores words containing nan", () => {
  assert.equal(find("finance banana nanosecond", "nan"), undefined);
  assert.ok(find("CPU\nNaN\n", "nan"));
});

test("tools: translation key leaked into UI", () => {
  const f = find(fx("tools.txt"), "translation_key");
  assert.deepEqual(f.samples, ["capabilities.actions.disabledReason"]);
});

test("translation key detector ignores file names and hosts", () => {
  assert.equal(find("see docs.bff.plan.md and app.dev.mvl-cap.tw", "translation_key"), undefined);
});

test("incidents: repeated long lines", () => {
  const f = find(fx("incidents.txt"), "repeated_long_line");
  assert.ok(f.count >= 3);
});

test("hex run of 16+ chars is an internal id; short hex is not", () => {
  assert.ok(find("id 0123456789abcdef01", "internal_id"));
  assert.equal(find("abc123def", "internal_id"), undefined);
});

test("clean text has no findings; result is advisory; summary/markdown render", () => {
  assert.deepEqual(detectReadability("人類收件匣\n12 種類型"), []);
  const results = [readabilityResult("/management/tools", fx("tools.txt")), readabilityResult("/management/x", "ok")];
  assert.equal(results[0].advisory, true);
  const summary = summarizeReadability(results);
  assert.equal(summary.pagesWithFindings, 1);
  assert.equal(summary.byDetector.translation_key.pages, 1);
  assert.match(readabilityMarkdown(results, summary), /never fails the gate/);
});
