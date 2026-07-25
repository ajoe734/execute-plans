#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const typesOutFile = path.join(repoRoot, "src/lib/bff-v1/agora/types.ts");
const snapshotOutFile = path.join(repoRoot, "src/lib/bff-v1/agora/contract-snapshot.json");

const schemaRootRel = "services/control-plane/specs/agora";
const openapiRootRel = "services/control-plane/openapi";
const defaultBundleIndexRel = `${schemaRootRel}/bundle_index.v1_13.json`;

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const summaryMode = args.has("--summary");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Json(value) {
  return sha256Bytes(stableJson(value));
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(message) {
  console.error(`[contract-drift] ${message}`);
  process.exit(1);
}

function bundleRelFromEnv() {
  const requested = process.env.AGORA_CONTRACT_BUNDLE || defaultBundleIndexRel;
  if (requested.startsWith("services/control-plane/")) return requested;
  if (requested.startsWith("specs/agora/")) return `services/control-plane/${requested}`;
  if (requested.startsWith("bundle_index")) return `${schemaRootRel}/${requested}`;
  return requested;
}

function findPantheonRoot() {
  const explicit = process.env.PANTHEON_CONTRACT_ROOT || process.env.PANTHEON_REPO_ROOT;
  const bundleIndexRel = bundleRelFromEnv();
  const candidates = [
    explicit,
    path.join(repoRoot, "pantheon-contract"),
    path.join(repoRoot, "..", "pantheon"),
    path.join(repoRoot, "..", "..", "pantheon"),
    "/home/lupin/pantheon",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;
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

function controlPlanePath(pantheonRoot, rel) {
  return path.join(pantheonRoot, "services/control-plane", rel);
}

function verifyFileHash(pantheonRoot, rel, expected, mismatches) {
  const actualPath = controlPlanePath(pantheonRoot, rel);
  if (!fs.existsSync(actualPath)) {
    mismatches.push(`${rel}: missing`);
    return;
  }
  const actual = sha256File(actualPath);
  if (actual !== expected) {
    mismatches.push(`${rel}: expected ${expected}, actual ${actual}`);
  }
}

function openapiRelFromBundlePath(bundleOpenapiPath) {
  return String(bundleOpenapiPath || "").replace(/^services\/control-plane\//, "");
}

function readBundleChain(pantheonRoot, bundleRel, seen = new Set()) {
  if (seen.has(bundleRel)) fail(`Cycle in Agora bundle extension chain at ${bundleRel}`);
  seen.add(bundleRel);

  const bundlePath = path.join(pantheonRoot, bundleRel);
  const bundle = readJson(bundlePath);
  const chain = [];
  const parent = bundle.extends?.bundle_path;
  if (parent) {
    const parentRel = parent.startsWith("services/control-plane/")
      ? parent
      : `services/control-plane/${parent}`;
    chain.push(...readBundleChain(pantheonRoot, parentRel, seen));
  }
  chain.push({ rel: bundleRel, bundle });
  return chain;
}

function loadBundle(pantheonRoot) {
  const requestedBundleRel = bundleRelFromEnv();
  const chain = readBundleChain(pantheonRoot, requestedBundleRel);
  const latest = chain[chain.length - 1];
  const mismatches = [];
  const files = {};
  const openapiFiles = {};

  for (const item of chain) {
    for (const [rel, expected] of Object.entries(item.bundle.files || {})) {
      verifyFileHash(pantheonRoot, rel, expected, mismatches);
      files[rel] = expected;
    }
    if (item.bundle.openapi?.path && item.bundle.openapi?.sha256) {
      const rel = openapiRelFromBundlePath(item.bundle.openapi.path);
      verifyFileHash(pantheonRoot, rel, item.bundle.openapi.sha256, mismatches);
      files[rel] = item.bundle.openapi.sha256;
      openapiFiles[rel] = item.bundle.openapi.sha256;
    }
  }

  if (mismatches.length > 0) {
    fail(`Pantheon Agora bundle is not reproducible:\n${mismatches.join("\n")}`);
  }

  const handoffPath = path.join(pantheonRoot, "docs/contracts/agora/backend-generation-input.v1_13.json");
  if (!fs.existsSync(handoffPath)) {
    fail(`Backend generation handoff file missing at ${handoffPath}`);
  }
  const handoff = readJson(handoffPath);
  const expectedContractCommit = "9e909de182f9f2379d23e8e6b81eefec29ffbce7";
  if (handoff.backend?.contract_commit !== expectedContractCommit) {
    fail(`Backend handoff contract_commit mismatch: expected ${expectedContractCommit}, actual ${handoff.backend?.contract_commit}`);
  }

  // Validate bundle_index sha256 against handoff
  const handoffBundleSha = handoff.contract?.bundle_index?.sha256;
  const actualBundleSha = latest.bundle.bundle_index_sha256 || files[requestedBundleRel] || sha256File(path.join(pantheonRoot, requestedBundleRel));
  if (handoffBundleSha && actualBundleSha !== handoffBundleSha) {
    fail(`Handoff bundle_index sha256 mismatch: expected ${handoffBundleSha}, actual ${actualBundleSha}`);
  }

  // Validate openapi sha256 against handoff
  const handoffOpenApiSha = handoff.contract?.openapi?.sha256;
  const openapiRel = openapiRelFromBundlePath(latest.bundle.openapi?.path);
  const actualOpenApiSha = files[openapiRel] || (fs.existsSync(controlPlanePath(pantheonRoot, openapiRel)) ? sha256File(controlPlanePath(pantheonRoot, openapiRel)) : null);
  if (handoffOpenApiSha && actualOpenApiSha !== handoffOpenApiSha) {
    fail(`Handoff openapi sha256 mismatch: expected ${handoffOpenApiSha}, actual ${actualOpenApiSha}`);
  }

  // Validate required files from handoff
  for (const reqPath of handoff.frontend_generation?.required_files || []) {
    const fullReqPath = path.join(pantheonRoot, reqPath);
    if (!fs.existsSync(fullReqPath)) {
      fail(`Handoff required file missing: ${reqPath}`);
    }
  }

  // Validate hash algorithms from handoff
  if (handoff.frontend_generation?.file_hash_algorithm !== "sha256-exact-git-bytes-v1") {
    fail(`Unsupported handoff file_hash_algorithm: ${handoff.frontend_generation?.file_hash_algorithm}`);
  }
  if (handoff.frontend_generation?.generated_types_hash_algorithm !== "sha256-path-tab-filehash-lf-v1") {
    fail(`Unsupported handoff generated_types_hash_algorithm: ${handoff.frontend_generation?.generated_types_hash_algorithm}`);
  }

  // Validate expected output paths from handoff
  const expectedOutputPaths = handoff.frontend_generation?.expected_output_paths || [];
  const actualOutputRelPaths = [
    path.relative(repoRoot, snapshotOutFile),
    path.relative(repoRoot, typesOutFile),
  ].sort();
  if (JSON.stringify(expectedOutputPaths.slice().sort()) !== JSON.stringify(actualOutputRelPaths)) {
    fail(`Handoff expected_output_paths mismatch: expected ${JSON.stringify(expectedOutputPaths)}, actual ${JSON.stringify(actualOutputRelPaths)}`);
  }

  // Validate frontend generation output handoff artifact
  const feHandoffPath = path.join(repoRoot, "docs/contracts/agora/frontend-generation-output.v1_13.json");
  if (!fs.existsSync(feHandoffPath)) {
    fail(`Frontend generation output handoff file missing at ${feHandoffPath}`);
  }
  const feHandoff = readJson(feHandoffPath);
  if (feHandoff.frontend?.runtime_commit !== "c76a838342b08331849f994d8f756155d2e3b961") {
    fail(`Frontend handoff runtime_commit mismatch: expected c76a838342b08331849f994d8f756155d2e3b961, actual ${feHandoff.frontend?.runtime_commit}`);
  }
  if (feHandoff.frontend?.generated_from_contract_commit !== expectedContractCommit) {
    fail(`Frontend handoff generated_from_contract_commit mismatch: expected ${expectedContractCommit}, actual ${feHandoff.frontend?.generated_from_contract_commit}`);
  }
  if (feHandoff.frontend?.bundle_index_sha256 !== actualBundleSha) {
    fail(`Frontend handoff bundle_index_sha256 mismatch: expected ${actualBundleSha}, actual ${feHandoff.frontend?.bundle_index_sha256}`);
  }
  if (feHandoff.frontend?.openapi_sha256 !== actualOpenApiSha) {
    fail(`Frontend handoff openapi_sha256 mismatch: expected ${actualOpenApiSha}, actual ${feHandoff.frontend?.openapi_sha256}`);
  }

  // Calculate actual generated types sha256 using sha256-path-tab-filehash-lf-v1
  const sortedOutputPaths = [snapshotOutFile, typesOutFile].sort();
  const manifestLines = sortedOutputPaths.map((fullPath) => {
    const relPath = path.relative(repoRoot, fullPath);
    const fileHash = sha256File(fullPath);
    return `${relPath}\t${fileHash}\n`;
  });
  const calculatedTypesSha = sha256Bytes(Buffer.from(manifestLines.join(""), "utf8"));
  if (feHandoff.frontend?.generated_types_sha256 !== calculatedTypesSha) {
    fail(`Frontend handoff generated_types_sha256 mismatch: expected ${calculatedTypesSha}, actual ${feHandoff.frontend?.generated_types_sha256}`);
  }

  const schemaEntries = Object.keys(files)
    .filter((rel) => rel.startsWith("specs/agora/") && rel.endsWith(".schema.json"))
    .sort();
  const schemas = schemaEntries.map((rel) => ({
    rel,
    fileName: path.basename(rel),
    schema: readJson(controlPlanePath(pantheonRoot, rel)),
  }));

  const schemaNameByRel = new Map();
  const schemaNameByBasename = new Map();
  for (const entry of schemas) {
    const name = typeNameFromSchema(entry.schema, entry.fileName);
    schemaNameByRel.set(entry.rel, name);
    schemaNameByBasename.set(entry.fileName, name);
  }

  const capabilityManifests = Object.keys(files)
    .filter((rel) => rel.startsWith("specs/agora/") && rel.endsWith(".json") && rel.includes("capability_manifest"))
    .sort()
    .map((rel) => readJson(controlPlanePath(pantheonRoot, rel)));

  const routePaths = [];
  const seenRoutes = new Set();
  const openapiRels = Object.keys(files)
    .filter((rel) => rel.startsWith("openapi/") && rel.endsWith(".yaml"))
    .sort();
  for (const rel of openapiRels) {
    for (const route of extractOpenApiPaths(readText(controlPlanePath(pantheonRoot, rel)))) {
      if (!seenRoutes.has(route)) {
        seenRoutes.add(route);
        routePaths.push(route);
      }
    }
  }

  const requiredDefinitionChecksums = latest.bundle.required_definition_checksums || {};
  const computedRequiredDefinitionChecksums = computeDefinitionChecksums(schemas, requiredDefinitionChecksums);
  for (const [name, expected] of Object.entries(requiredDefinitionChecksums)) {
    const actual = computedRequiredDefinitionChecksums[name];
    if (actual !== expected) {
      fail(`Definition checksum mismatch for ${name}: expected ${expected}, actual ${actual || "missing"}`);
    }
  }

  return {
    requestedBundleRel,
    latestBundle: latest.bundle,
    files,
    openapiFiles,
    schemas,
    schemaNameByRel,
    schemaNameByBasename,
    capabilityManifests,
    routePaths,
    requiredDefinitionChecksums,
  };
}

function computeDefinitionChecksums(schemas, requiredDefinitionChecksums) {
  const wanted = new Set(Object.keys(requiredDefinitionChecksums || {}));
  const result = {};
  if (wanted.size === 0) return result;
  for (const entry of schemas) {
    for (const [name, definition] of Object.entries(entry.schema.definitions || {})) {
      const fullKey = `services/control-plane/${entry.rel}#/definitions/${name}`;
      if (wanted.has(name)) {
        result[name] = sha256Json(definition);
      }
      if (wanted.has(fullKey)) {
        result[fullKey] = sha256Json(definition);
      }
    }
  }
  return result;
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
  return cleanTypeName(raw);
}

function cleanTypeName(raw) {
  const cleaned = String(raw).replace(/[^A-Za-z0-9_]/g, "");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Agora${cleaned}`;
}

function refToType(ref, context) {
  if (typeof ref !== "string") return "unknown";
  const [refPath, fragment] = ref.split("#");
  if (fragment?.startsWith("/$defs/")) {
    return cleanTypeName(decodeURIComponent(fragment.slice("/$defs/".length)));
  }
  if (fragment?.startsWith("/definitions/")) {
    return cleanTypeName(decodeURIComponent(fragment.slice("/definitions/".length)));
  }
  if (!refPath || refPath === "") {
    return "unknown";
  }
  const basename = path.basename(refPath);
  return context.schemaNameByBasename.get(basename) || cleanTypeName(basename.replace(/\.schema\.json$/, ""));
}

function schemaToType(schema, context, indent = 0) {
  if (!schema || typeof schema !== "object") return "unknown";

  if (schema.$ref) {
    return refToType(schema.$ref, context);
  }

  const compositionBase = ({ oneOf, anyOf, allOf, ...base }) => base;
  const hasCompositionBase = (base) => (
    Object.prototype.hasOwnProperty.call(base, "$ref")
    || Object.prototype.hasOwnProperty.call(base, "type")
    || Object.prototype.hasOwnProperty.call(base, "enum")
    || Object.prototype.hasOwnProperty.call(base, "const")
    || Object.prototype.hasOwnProperty.call(base, "properties")
    || Object.prototype.hasOwnProperty.call(base, "additionalProperties")
    || Object.prototype.hasOwnProperty.call(base, "items")
  );
  const composeWithBase = (members, operator) => {
    const memberType = members
      .map((item) => schemaToType(item, context, indent))
      .join(` ${operator} `);
    const base = compositionBase(schema);
    if (!hasCompositionBase(base)) return memberType;
    return `${schemaToType(base, context, indent)} & (${memberType})`;
  };

  if (Array.isArray(schema.oneOf)) {
    return composeWithBase(schema.oneOf, "|");
  }
  if (Array.isArray(schema.anyOf)) {
    return composeWithBase(schema.anyOf, "|");
  }
  if (Array.isArray(schema.allOf)) {
    return composeWithBase(schema.allOf, "&");
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((item) => literal(item)).join(" | ");
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return literal(schema.const);
  }

  if (Array.isArray(schema.type)) {
    return schema.type.map((item) => schemaToType({ ...schema, type: item }, context, indent)).join(" | ");
  }

  switch (schema.type) {
    case "null":
      return "null";
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `Array<${schemaToType(schema.items || {}, context, indent)}>`;
    case "object":
      return objectToType(schema, context, indent);
    default:
      if (schema.properties || schema.additionalProperties) {
        return objectToType(schema, context, indent);
      }
      return "unknown";
  }
}

function objectToType(schema, context, indent = 0) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const entries = Object.entries(properties);
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);

  if (entries.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `Record<string, ${schemaToType(schema.additionalProperties, context, indent)}>`;
    }
    if (schema.additionalProperties === true) {
      return "Record<string, unknown>";
    }
    return "Record<string, never>";
  }

  const lines = ["{"];
  for (const [name, propSchema] of entries) {
    const optional = required.has(name) ? "" : "?";
    lines.push(`${childPad}${literal(name)}${optional}: ${schemaToType(propSchema, context, indent + 2)};`);
  }
  if (schema.additionalProperties === true) {
    lines.push(`${childPad}[key: string]: unknown;`);
  } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    lines.push(`${childPad}[key: string]: ${schemaToType(schema.additionalProperties, context, indent + 2)};`);
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
}

function emitDeclaration(name, schema, context) {
  const body = schemaToType(schema, context, 0);
  const hasComposition = Array.isArray(schema?.oneOf)
    || Array.isArray(schema?.anyOf)
    || Array.isArray(schema?.allOf);
  if (body.startsWith("{\n") && !hasComposition && !body.includes("} | {")) {
    return {
      name,
      text: `export interface ${name} ${body}\n`,
    };
  }
  return {
    name,
    text: `export type ${name} = ${body};\n`,
  };
}

function collectDeclarations(bundle) {
  const declarations = [];
  const seenNames = new Set();
  const context = {
    schemaNameByBasename: bundle.schemaNameByBasename,
  };

  function addDeclaration(name, schema) {
    const safeName = cleanTypeName(name);
    if (seenNames.has(safeName)) return;
    seenNames.add(safeName);
    declarations.push(emitDeclaration(safeName, schema, context));
  }

  for (const entry of bundle.schemas) {
    addDeclaration(typeNameFromSchema(entry.schema, entry.fileName), entry.schema);
    for (const [definitionName, definition] of Object.entries(entry.schema.definitions || {})) {
      addDeclaration(definitionName, definition);
    }
    for (const [defName, defSchema] of Object.entries(entry.schema.$defs || {})) {
      addDeclaration(defName, defSchema);
    }
  }

  return declarations;
}

function stableCapability(capability) {
  const name = capability.name || capability.id;
  return {
    name,
    version: capability.version,
    schemas: capability.schemas || [],
    bffRouteFamilies: capability.bff_route_families || [],
    bffPathPrefixes: capability.bff_path_prefixes || [],
    routes: capability.routes || [],
    authLevel: capability.auth_level,
  };
}

function collectCapabilities(bundle) {
  const capabilities = [];
  const seen = new Set();
  for (const manifest of bundle.capabilityManifests) {
    for (const capability of manifest.capabilities || []) {
      const stable = stableCapability(capability);
      if (!stable.name || seen.has(stable.name)) continue;
      seen.add(stable.name);
      capabilities.push(stable);
    }
  }
  return capabilities;
}

function buildSnapshot(bundle, capabilities, declarations) {
  return {
    contract_name: "pantheon-agora-v1",
    contract_version: bundle.latestBundle.bundle_version,
    source_bundle: bundle.requestedBundleRel,
    extends: bundle.latestBundle.extends || null,
    files: bundle.files,
    required_definition_checksums: bundle.requiredDefinitionChecksums,
    schema_count: bundle.schemas.length,
    capability_count: capabilities.length,
    operation_count: bundle.routePaths.length,
    generated_type_count: declarations.length,
  };
}

function generateTypes(bundle) {
  const declarations = collectDeclarations(bundle);
  const capabilities = collectCapabilities(bundle);
  const schemaFiles = bundle.schemas.map((entry) => entry.rel);
  const snapshot = buildSnapshot(bundle, capabilities, declarations);

  const sourceLine = `// Source: Pantheon ${bundle.requestedBundleRel}.`;
  const text = [
    "// Generated by scripts/contract-drift-check.mjs --write.",
    sourceLine,
    "// Do not edit by hand; update the Pantheon bundle, then regenerate.",
    "",
    `export const AGORA_CONTRACT_SNAPSHOT = ${JSON.stringify(
      {
        bundleVersion: snapshot.contract_version,
        sourceBundle: snapshot.source_bundle,
        extends: snapshot.extends,
        files: snapshot.files,
        requiredDefinitionChecksums: snapshot.required_definition_checksums,
      },
      null,
      2,
    )} as const;`,
    "",
    `export const AGORA_SCHEMA_FILES = ${JSON.stringify(schemaFiles, null, 2)} as const;`,
    "",
    `export const AGORA_SCHEMA_DEFINITION_CHECKSUMS = ${JSON.stringify(
      bundle.requiredDefinitionChecksums,
      null,
      2,
    )} as const;`,
    "",
    `export const AGORA_CAPABILITIES = ${JSON.stringify(capabilities, null, 2)} as const;`,
    "",
    `export const AGORA_ROUTE_PATHS = ${JSON.stringify(bundle.routePaths, null, 2)} as const;`,
    "",
    "export type AgoraContractFile = keyof typeof AGORA_CONTRACT_SNAPSHOT.files;",
    "export type AgoraSchemaFile = (typeof AGORA_SCHEMA_FILES)[number];",
    "export type AgoraRequiredDefinitionName = keyof typeof AGORA_SCHEMA_DEFINITION_CHECKSUMS;",
    "export type AgoraCapabilityName = (typeof AGORA_CAPABILITIES)[number][\"name\"];",
    "export type AgoraRoutePath = (typeof AGORA_ROUTE_PATHS)[number];",
    "",
    ...declarations.map((item) => item.text),
    `export type AgoraSchema = ${declarations.map((item) => item.name).join(" | ")};`,
    "",
    "export interface AgoraSchemaByTitle {",
    ...declarations.map((item) => `  ${item.name}: ${item.name};`),
    "}",
    "",
  ].join("\n");

  return { text, snapshot };
}

function writeGenerated(generated) {
  fs.mkdirSync(path.dirname(typesOutFile), { recursive: true });
  fs.writeFileSync(typesOutFile, generated.text, "utf8");
  fs.writeFileSync(snapshotOutFile, `${JSON.stringify(generated.snapshot, null, 2)}\n`, "utf8");
  console.log(`[contract-drift] wrote ${path.relative(repoRoot, typesOutFile)}`);
  console.log(`[contract-drift] wrote ${path.relative(repoRoot, snapshotOutFile)}`);
}

function assertGeneratedFile(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    fail(`${path.relative(repoRoot, filePath)} is missing. Run npm run contract:drift:update.`);
  }
  const existing = readText(filePath);
  if (existing !== expected) {
    fail(
      `${path.relative(repoRoot, filePath)} is stale against the Pantheon Agora bundle. ` +
        "Run PANTHEON_CONTRACT_ROOT=<pantheon> npm run contract:drift:update and commit the result.",
    );
  }
}

function main() {
  const pantheonRoot = findPantheonRoot();
  const bundle = loadBundle(pantheonRoot);
  const generated = generateTypes(bundle);

  if (summaryMode) {
    console.log(`Pantheon root: ${pantheonRoot}`);
    console.log(`Bundle: ${bundle.requestedBundleRel}`);
    console.log(`Schemas: ${bundle.schemas.length}`);
    console.log(`Capabilities: ${collectCapabilities(bundle).length}`);
    console.log(`OpenAPI routes: ${bundle.routePaths.length}`);
    console.log(`Generated types: ${generated.snapshot.generated_type_count}`);
  }

  if (writeMode) {
    writeGenerated(generated);
    return;
  }

  assertGeneratedFile(typesOutFile, generated.text);
  assertGeneratedFile(snapshotOutFile, `${JSON.stringify(generated.snapshot, null, 2)}\n`);

  console.log(
    `[contract-drift] Agora bundle aligned: ${bundle.schemas.length} schemas, ` +
      `${bundle.routePaths.length} routes, ${Object.keys(bundle.files || {}).length} sha256 entries.`,
  );
}

main();
