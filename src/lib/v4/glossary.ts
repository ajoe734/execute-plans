// v4 / Pack C §C067 — Glossary.

export interface GlossaryTerm { term: string; definitionKey: string }

export const GLOSSARY: readonly GlossaryTerm[] = [
  "Strategy", "Alpha", "Persona", "Capital Pool", "Mandate", "Risk Budget",
  "Ranking Formula", "Quarterly Rebalance", "Evolution Program", "Experiment",
  "Artifact", "Review", "Approval", "Promotion", "Deployment", "Runtime",
  "Rollback", "Incident", "Handoff", "Insight", "Memory", "Training Example",
  "Tool", "MCP Server", "MCP Tool", "Skill", "Job", "Audit Event",
  "Confirm Token", "Idempotency Key", "Environment",
].map((t) => ({ term: t, definitionKey: `glossary.${t.toLowerCase().replace(/\s+/g, "_")}` }));
