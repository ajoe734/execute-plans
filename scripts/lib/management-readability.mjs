// FE-GATE-READABILITY-PROBE-20261120 (RC6 WP6.5): advisory readability
// detectors for rendered management page text. Pure functions, no I/O.
// Findings are advisory: callers must never use them to fail a gate.

const INTERNAL_ID_PREFIX = /\b(?:persona|strategy|rb|pcb|mtg)-(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{5,}/g;
const HEX_RUN = /\b[0-9a-f]{16,}\b/g;
const SNAKE_CODE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const UPPER_CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const NAN_TOKEN = /(?:^|[\s\t:：(（])nan(?=$|[\s\t,;)）%])/gim;
const TRANSLATION_KEY = /(?<![\w./-])[a-z][a-z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9_]*){2,}(?![\w/-])/g;
const KEY_VALUE = /\b[a-z][a-z0-9_]{2,}=[^\s;,]+/g;
const FILE_SUFFIX = /\.(?:md|mjs|js|ts|tsx|json|txt|yaml|yml|com|tw|io|org|net|py|sh)$/i;

export const REPEATED_LINE_MIN_LENGTH = 40;
export const REPEATED_LINE_MIN_COUNT = 3;
export const READABILITY_DETECTORS = Object.freeze([
  "internal_id", "enum_code", "nan", "translation_key", "key_value", "repeated_long_line",
]);

function collect(text, regex, filter = () => true) {
  const out = new Map();
  for (const match of text.matchAll(regex)) {
    const value = match[0].trim().replace(/^[\s:：(（]+/, "");
    if (!filter(value)) continue;
    out.set(value, (out.get(value) || 0) + 1);
  }
  return out;
}

function toFinding(detector, map, limit = 5) {
  if (!map.size) return null;
  const entries = [...map.entries()];
  return {
    detector,
    count: entries.reduce((sum, [, n]) => sum + n, 0),
    distinct: entries.length,
    samples: entries.slice(0, limit).map(([value]) => value.slice(0, 120)),
  };
}

export function detectReadability(rawText) {
  const text = String(rawText ?? "");
  const findings = [];

  const ids = collect(text, INTERNAL_ID_PREFIX);
  for (const [v, n] of collect(text, HEX_RUN)) ids.set(v, (ids.get(v) || 0) + n);
  findings.push(toFinding("internal_id", ids));

  const codes = collect(text, SNAKE_CODE);
  for (const [v, n] of collect(text, UPPER_CODE)) codes.set(v, (codes.get(v) || 0) + n);
  findings.push(toFinding("enum_code", codes));

  findings.push(toFinding("nan", collect(text, NAN_TOKEN, () => true)));
  findings.push(toFinding("translation_key", collect(text, TRANSLATION_KEY, (v) => !FILE_SUFFIX.test(v))));
  findings.push(toFinding("key_value", collect(text, KEY_VALUE)));

  const lineCounts = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length >= REPEATED_LINE_MIN_LENGTH) lineCounts.set(t, (lineCounts.get(t) || 0) + 1);
  }
  const repeated = new Map([...lineCounts].filter(([, n]) => n >= REPEATED_LINE_MIN_COUNT));
  findings.push(toFinding("repeated_long_line", repeated));

  return findings.filter(Boolean);
}

export function readabilityResult(path, text) {
  const findings = detectReadability(text);
  return {
    path,
    advisory: true,
    textLength: String(text ?? "").length,
    findingCount: findings.reduce((s, f) => s + f.count, 0),
    findings,
  };
}

export function summarizeReadability(results) {
  const byDetector = Object.fromEntries(READABILITY_DETECTORS.map((d) => [d, { pages: 0, count: 0 }]));
  let pagesWithFindings = 0;
  for (const r of results) {
    if (r.findings.length) pagesWithFindings += 1;
    for (const f of r.findings) {
      byDetector[f.detector].pages += 1;
      byDetector[f.detector].count += f.count;
    }
  }
  return { advisory: true, pages: results.length, pagesWithFindings, byDetector };
}

export function readabilityMarkdown(results, summary = summarizeReadability(results)) {
  const lines = [
    `Advisory only; never fails the gate. ${summary.pagesWithFindings}/${summary.pages} pages have findings.`,
    ``,
    `| Detector | Pages | Occurrences |`,
    `|---|---:|---:|`,
    ...READABILITY_DETECTORS.map((d) => `| ${d} | ${summary.byDetector[d].pages} | ${summary.byDetector[d].count} |`),
  ];
  const worst = [...results].filter((r) => r.findingCount).sort((a, b) => b.findingCount - a.findingCount).slice(0, 15);
  if (worst.length) {
    lines.push(``, `Top pages:`, ``);
    for (const r of worst) lines.push(`- \`${r.path}\`: ${r.findingCount} (${r.findings.map((f) => f.detector).join(", ")})`);
  }
  return lines.join("\n");
}
