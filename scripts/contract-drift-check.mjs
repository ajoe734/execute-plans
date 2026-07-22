#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const outFile = path.join(repoRoot, "src/lib/bff-v1/agora/types.ts");

const schemaRootRel = "services/control-plane/specs/agora";
const openapiRootRel = "services/control-plane/openapi";
const bundleIndexRel = `${schemaRootRel}/bundle_index.json`;

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const summaryMode = args.has("--summary");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fail(message) {
  console.error(`[contract-drift] ${message}`);
  process.exit(1);
}

function findPantheonRoot() {
  const explicit = process.env.PANTHEON_CONTRACT_ROOT || process.env.PANTHEON_REPO_ROOT;
  const candidates = [
    explicit,
    path.join(repoRoot, "pantheon-contract"),
    path.join(repoRoot, "..", "pantheon"),
    path.join(repoRoot, "..", "..", "pantheon"),
    "/home/lupin/code/pantheon",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, bundleIndexRel))) {
      return resolved;
    }
  }

  fail(
    "Pantheon Agora bundle not found. Set PANTHEON_CONTRACT_ROOT to a pantheon checkout containing " +
      bundleIndexRel,
  );
}

function loadBundle(pantheonRoot) {
  const bundleIndex = readJson(path.join(pantheonRoot, bundleIndexRel));
  const files = bundleIndex.files || {};
  const mismatches = [];

  for (const [rel, expected] of Object.entries(files)) {
    const actualPath = path.join(pantheonRoot, "services/control-plane", rel);
    if (!fs.existsSync(actualPath)) {
      mismatches.push(`${rel}: missing`);
      continue;
    }
    const actual = sha256File(actualPath);
    if (actual !== expected) {
      mismatches.push(`${rel}: expected ${expected}, actual ${actual}`);
    }
  }

  if (mismatches.length > 0) {
    fail(`Pantheon bundle_index.json is not reproducible:\n${mismatches.join("\n")}`);
  }

  const schemaEntries = Object.keys(files)
    .filter((rel) => rel.startsWith("specs/agora/") && rel.endsWith(".schema.json"));
  const schemas = schemaEntries.map((rel) => {
    const fileName = path.basename(rel);
    return {
      rel,
      fileName,
      schema: readJson(path.join(pantheonRoot, schemaRootRel, fileName)),
    };
  });
  const capabilityManifest = readJson(path.join(pantheonRoot, schemaRootRel, "capability_manifest.json"));
  const openapiText = readText(path.join(pantheonRoot, openapiRootRel, "agora_v1.openapi.yaml"));

  return {
    bundleIndex,
    schemas,
    capabilityManifest,
    routePaths: extractOpenApiPaths(openapiText),
  };
}

function extractOpenApiPaths(openapiText) {
  const paths = [];
  let inPaths = false;
  for (const line of openapiText.split(/\r?\n/)) {
    if (line === "paths:") {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^[A-Za-z0-9_-]+:/.test(line)) break;
    const match = line.match(/^  (\/[^:]+):\s*$/);
    if (match) paths.push(match[1]);
  }
  return paths;
}

function literal(value) {
  return JSON.stringify(value);
}

function typeNameFromSchema(schema, fallback) {
  const raw = String(schema.title || fallback || "AgoraSchema");
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Agora${cleaned}`;
}

function schemaToType(schema, indent = 0) {
  if (!schema || typeof schema !== "object") return "unknown";

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((item) => literal(item)).join(" | ");
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return literal(schema.const);
  }

  if (Array.isArray(schema.type)) {
    return schema.type.map((item) => schemaToType({ ...schema, type: item }, indent)).join(" | ");
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `Array<${schemaToType(schema.items || {}, indent)}>`;
    case "object":
      return objectToType(schema, indent);
    default:
      if (schema.properties || schema.additionalProperties) {
        return objectToType(schema, indent);
      }
      return "unknown";
  }
}

function objectToType(schema, indent = 0) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const entries = Object.entries(properties);
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);

  if (entries.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `Record<string, ${schemaToType(schema.additionalProperties, indent)}>`;
    }
    if (schema.additionalProperties === true) {
      return "Record<string, unknown>";
    }
    return "Record<string, never>";
  }

  const lines = ["{"];
  for (const [name, propSchema] of entries) {
    const optional = required.has(name) ? "" : "?";
    lines.push(`${childPad}${literal(name)}${optional}: ${schemaToType(propSchema, indent + 2)};`);
  }
  if (schema.additionalProperties === true) {
    lines.push(`${childPad}[key: string]: unknown;`);
  } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    lines.push(`${childPad}[key: string]: ${schemaToType(schema.additionalProperties, indent + 2)};`);
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
}

function emitInterface(entry) {
  const name = typeNameFromSchema(entry.schema, entry.fileName);
  const body = objectToType(entry.schema, 0);
  const lines = [
    `export interface ${name} ${body}`,
    "",
  ];
  return { name, text: lines.join("\n") };
}

function stableCapability(capability) {
  return {
    name: capability.name,
    schemas: capability.schemas || [],
    bffRouteFamilies: capability.bff_route_families || [],
    bffPathPrefixes: capability.bff_path_prefixes || [],
    authLevel: capability.auth_level,
  };
}

function generateTypes(bundle) {
  const interfaces = bundle.schemas.map(emitInterface);
  const capabilitySummary = (bundle.capabilityManifest.capabilities || []).map(stableCapability);
  const schemaFiles = bundle.schemas.map((entry) => entry.fileName);

  return [
    "// Generated by scripts/contract-drift-check.mjs --write.",
    "// Source: Pantheon AG-XR-001 Agora v1 schema/OpenAPI bundle.",
    "// Do not edit by hand; update the Pantheon bundle, then regenerate.",
    "",
    `export const AGORA_CONTRACT_SNAPSHOT = ${JSON.stringify(
      {
        bundleVersion: bundle.bundleIndex.bundle_version,
        frozenBy: bundle.bundleIndex.frozen_by,
        schemaBundleIndex: bundle.capabilityManifest.schema_bundle_index,
        openapiRef: bundle.capabilityManifest.openapi_ref,
        files: bundle.bundleIndex.files,
      },
      null,
      2,
    )} as const;`,
    "",
    `export const AGORA_SCHEMA_FILES = ${JSON.stringify(schemaFiles, null, 2)} as const;`,
    "",
    `export const AGORA_CAPABILITIES = ${JSON.stringify(capabilitySummary, null, 2)} as const;`,
    "",
    `export const AGORA_ROUTE_PATHS = ${JSON.stringify(bundle.routePaths, null, 2)} as const;`,
    "",
    "export type AgoraContractFile = keyof typeof AGORA_CONTRACT_SNAPSHOT.files;",
    "export type AgoraSchemaFile = (typeof AGORA_SCHEMA_FILES)[number];",
    "export type AgoraCapabilityName = (typeof AGORA_CAPABILITIES)[number][\"name\"];",
    "export type AgoraRoutePath = (typeof AGORA_ROUTE_PATHS)[number];",
    "",
    ...interfaces.map((item) => item.text),
    `export type AgoraSchema = ${interfaces.map((item) => item.name).join(" | ")};`,
    "",
    "export interface AgoraSchemaByTitle {",
    ...interfaces.map((item) => `  ${item.name}: ${item.name};`),
    "}",
    "",
  ].join("\n");
}

function main() {
  const pantheonRoot = findPantheonRoot();
  const bundle = loadBundle(pantheonRoot);
  const generated = generateTypes(bundle);

  if (summaryMode) {
    console.log(`Pantheon root: ${pantheonRoot}`);
    console.log(`Schemas: ${bundle.schemas.length}`);
    console.log(`Capabilities: ${(bundle.capabilityManifest.capabilities || []).length}`);
    console.log(`OpenAPI routes: ${bundle.routePaths.length}`);
  }

  if (writeMode) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, generated, "utf8");
    console.log(`[contract-drift] wrote ${path.relative(repoRoot, outFile)}`);
    return;
  }

  if (!fs.existsSync(outFile)) {
    fail(`${path.relative(repoRoot, outFile)} is missing. Run npm run contract:drift:update.`);
  }

  const existing = readText(outFile);
  if (existing !== generated) {
    fail(
      `${path.relative(repoRoot, outFile)} is stale against the Pantheon Agora bundle. ` +
        "Run PANTHEON_CONTRACT_ROOT=<pantheon> npm run contract:drift:update and commit the result.",
    );
  }

  console.log(
    `[contract-drift] Agora bundle aligned: ${bundle.schemas.length} schemas, ` +
      `${bundle.routePaths.length} routes, ${Object.keys(bundle.bundleIndex.files || {}).length} sha256 entries.`,
  );
}

main();
