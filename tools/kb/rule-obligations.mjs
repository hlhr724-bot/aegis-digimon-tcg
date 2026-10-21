#!/usr/bin/env node
/**
 * Auditable obligation inventory for numbered rules, Card Q&A, and errata.
 *
 * `--refresh` reconciles source clauses while retaining human review only when
 * both the source version and the exact clause text are unchanged. `--check`
 * rejects stale or malformed inventory records. No citation is used as proof.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRouteMatrix } from "./effect-play-route-matrix.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const INDEX_PATH = resolve(ROOT, "data/kb/rules-index.json");
export const INVENTORY_PATH = resolve(ROOT, "data/kb/rule-obligations.json");
export const QA_PATH = resolve(ROOT, "data/kb/qa.json");
export const ERRATA_PATH = resolve(ROOT, "data/kb/errata.json");
export const MANIFEST_PATH = resolve(ROOT, "data/kb/manifest.json");
const DEFAULT_OWNER = "engine-rules";

const FAMILIES = {
  1: "game-overview-and-victory",
  2: "card-information",
  3: "zones-and-visibility",
  4: "terminology-and-identity",
  5: "setup",
  6: "turn-flow",
  7: "play-and-costs",
  8: "digivolution-and-costs",
  9: "card-use-and-costs",
  10: "link",
  11: "attack-and-timing",
  12: "blocking",
  13: "security",
  14: "battle",
  15: "effects-and-ordering",
  16: "keywords",
  17: "rule-checks",
  18: "other-information",
};

// These are review targets, not assertions that the interactions are implemented.
const INTERACTIONS = [
  {
    id: "interaction:attack-block-security",
    sections: ["11-4", "12-1", "13-1"],
    mechanisms: ["attack-and-timing", "blocking", "security"],
  },
  {
    id: "interaction:trigger-order-source-departure",
    sections: ["15-4-3", "15-4-2"],
    mechanisms: ["effects-and-ordering", "zones-and-visibility"],
  },
  {
    id: "interaction:digivolution-cost-effects",
    sections: ["8-1", "15-4"],
    mechanisms: ["digivolution-and-costs", "effects-and-ordering"],
  },
  {
    id: "interaction:security-battle-rule-check",
    sections: ["13-1", "14-1", "17-1"],
    mechanisms: ["security", "battle", "rule-checks"],
  },
];

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sourceVersion(index) {
  const header = index.chunks.find((chunk) => chunk.id === "comprehensive-0000")?.text ?? "";
  const match = header.match(/\bVer\.\s*(\d+\.\d+)\b/i);
  if (!match) throw new Error("Comprehensive source version is missing from rules-index.json");
  return match[1];
}

export function extractNumberedRules(index) {
  const source = index.sources.find((entry) => entry.id === "comprehensive");
  if (!source?.url) throw new Error("Comprehensive source URL is missing");
  const version = sourceVersion(index);
  const rules = [];
  const seen = new Set();
  for (const chunk of index.chunks.filter((entry) => entry.source === "comprehensive")) {
    const matches = [...chunk.text.matchAll(/(?:^|\n)(\d+(?:-\d+)+)\.\s/g)];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const section = match[1];
      if (seen.has(section)) throw new Error(`Duplicate comprehensive rule ${section}`);
      seen.add(section);
      const start = match.index + match[0].length;
      const end = matches[i + 1]?.index ?? chunk.text.length;
      const text = chunk.text.slice(start, end).replace(/\s+/g, " ").trim();
      if (!text) throw new Error(`Empty comprehensive rule ${section}`);
      const family = FAMILIES[Number(section.split("-")[0])];
      if (!family) throw new Error(`Unclassified comprehensive chapter for ${section}`);
      rules.push({
        id: `comprehensive:${section}`,
        kind: "rule",
        source: { url: source.url, version, section, chunkId: chunk.id, fingerprint: sha256(text) },
        text,
        branch: "applies",
        mechanisms: [family],
        cardIds: [],
        precondition: null,
        expectedResult: null,
        testPath: null,
        status: "gap",
        reason: "Behavioral branch and independent executable assertion have not been reviewed.",
        owner: DEFAULT_OWNER,
      });
    }
  }
  if (rules.length === 0) throw new Error("No numbered comprehensive rules extracted");
  return rules;
}

function sourceCurrency(kind, manifest) {
  const fetchedAt = manifest[kind]?.fetchedAt;
  if (!fetchedAt) throw new Error(`${kind} full-corpus fetch date is missing from manifest`);
  return fetchedAt;
}

export function extractCardQa(qa, manifest) {
  const fetchedAt = sourceCurrency("qa", manifest);
  const groups = new Map();
  for (const [cardId, rulings] of Object.entries(qa)) {
    if (!Array.isArray(rulings)) throw new Error(`Q&A entry for ${cardId} is not an array`);
    for (const ruling of rulings) {
      if (!/^Q\d+$/.test(ruling.qno) || !ruling.question || !ruling.answer || !ruling.date)
        throw new Error(`Incomplete Q&A entry for ${cardId}`);
      const fingerprint = sha256(JSON.stringify([ruling.question, ruling.answer, ruling.date]));
      const id = `qa:${ruling.qno}:${fingerprint.slice(0, 12)}`;
      const existing = groups.get(id);
      if (existing && existing.fingerprint !== fingerprint)
        throw new Error(`Q&A fingerprint collision for ${ruling.qno}`);
      if (existing) existing.cardIds.add(cardId);
      else groups.set(id, { ruling, fingerprint, cardIds: new Set([cardId]) });
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, group]) => {
      const cardIds = [...group.cardIds].sort();
      const { ruling, fingerprint } = group;
      return {
        id,
        kind: "card-qa",
        source: {
          url: `https://world.digimoncard.com/rule/?card_no=${encodeURIComponent(cardIds[0])}`,
          qno: ruling.qno,
          date: ruling.date,
          fingerprint,
          corpusFullCrawlAt: fetchedAt,
          currency: "unverified",
        },
        text: `${ruling.question}\n${ruling.answer}`,
        branch: "applies",
        mechanisms: ["card-rulings"],
        cardIds,
        precondition: null,
        expectedResult: null,
        testPath: null,
        status: "gap",
        reason: `Behavioral branches have not been reviewed. Local Card Q&A full crawl: ${fetchedAt}; later scoped corrections do not establish September 2026 corpus freshness.`,
        owner: "card-rulings",
      };
    });
}

export function extractErrata(errata, manifest) {
  const fetchedAt = sourceCurrency("errata", manifest);
  const records = [];
  for (const [cardId, entry] of Object.entries(errata).sort(([a], [b]) => a.localeCompare(b))) {
    if (
      entry.cardId !== cardId ||
      !entry.date ||
      !entry.source ||
      !Array.isArray(entry.changes) ||
      !entry.changes.length
    )
      throw new Error(`Incomplete errata entry for ${cardId}`);
    for (const [index, change] of entry.changes.entries()) {
      if (typeof change.before !== "string" || typeof change.after !== "string")
        throw new Error(`Incomplete errata change for ${cardId}:${index + 1}`);
      const text = `Before: ${change.before}\nAfter: ${change.after}${entry.notes ? `\nNotes: ${entry.notes}` : ""}`;
      records.push({
        id: `errata:${cardId}:${index + 1}`,
        kind: "errata",
        source: {
          url: entry.source,
          date: entry.date,
          changeIndex: index + 1,
          fingerprint: sha256(text),
          corpusFullCrawlAt: fetchedAt,
          currency: "unverified",
        },
        text,
        branch: "boundary",
        mechanisms: ["card-text-and-errata"],
        cardIds: [cardId],
        precondition: null,
        expectedResult: null,
        testPath: null,
        status: "gap",
        reason: `Corrected card text and affected behaviors have not been reviewed. Local errata crawl: ${fetchedAt}; current official errata coverage is unverified.`,
        owner: "card-errata",
      });
    }
  }
  return records;
}

export function buildInventory(
  index,
  prior = null,
  {
    qa = JSON.parse(readFileSync(QA_PATH, "utf8")),
    errata = JSON.parse(readFileSync(ERRATA_PATH, "utf8")),
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")),
  } = {},
) {
  const rules = extractNumberedRules(index);
  const bySection = new Map(rules.map((record) => [record.source.section, record]));
  const version = sourceVersion(index);
  const url = index.sources.find((entry) => entry.id === "comprehensive").url;
  const interactionRecords = INTERACTIONS.map((entry) => {
    const sourceRules = entry.sections.map((section) => {
      const record = bySection.get(section);
      if (!record) throw new Error(`Interaction ${entry.id} refers to absent rule ${section}`);
      return record;
    });
    return {
      id: entry.id,
      kind: "interaction",
      source: {
        url,
        version,
        sections: entry.sections,
        chunkIds: sourceRules.map((record) => record.source.chunkId),
        fingerprint: sha256(sourceRules.map((record) => record.source.fingerprint).join("|")),
      },
      text: `Review interaction of rules ${entry.sections.join(", ")}.`,
      branch: "ordering",
      mechanisms: entry.mechanisms,
      cardIds: [],
      precondition: null,
      expectedResult: null,
      testPath: null,
      status: "gap",
      reason: "Combined behavior and independent executable assertion have not been reviewed.",
      owner: DEFAULT_OWNER,
    };
  });
  const old = new Map((prior?.obligations ?? []).map((record) => [record.id, record]));
  const obligations = [
    ...rules,
    ...interactionRecords,
    ...extractCardQa(qa, manifest),
    ...extractErrata(errata, manifest),
  ].map((record) => {
    const previous = old.get(record.id);
    if (
      previous?.source?.version !== record.source.version ||
      previous?.source?.url !== record.source.url ||
      previous?.source?.fingerprint !== record.source.fingerprint ||
      JSON.stringify(previous?.source) !== JSON.stringify(record.source) ||
      JSON.stringify(previous?.cardIds) !== JSON.stringify(record.cardIds)
    ) {
      if (Array.isArray(previous?.scenarios)) {
        const reason = "Source changed; each scenario requires renewed review and executable proof.";
        return {
          ...record,
          scope: previous.scope,
          scenarios: previous.scenarios.map((scenario) => ({ ...scenario, status: "gap", reason })),
          status: "gap",
          reason,
        };
      }
      return record;
    }
    return { ...record, ...previous, source: record.source, text: record.text, cardIds: record.cardIds };
  });
  return {
    schemaVersion: 1,
    ...(prior?.scenarioScopes === undefined ? {} : { scenarioScopes: structuredClone(prior.scenarioScopes) }),
    ...(prior?.scenarioGroups === undefined ? {} : { scenarioGroups: structuredClone(prior.scenarioGroups) }),
    ...(prior?.effectPlayRouteMatrix === undefined
      ? {}
      : { effectPlayRouteMatrix: structuredClone(prior.effectPlayRouteMatrix) }),
    source: { url, version, indexSha256: sha256(JSON.stringify(index)) },
    corpora: {
      qa: {
        localSha256: sha256(JSON.stringify(qa)),
        fullCrawlAt: sourceCurrency("qa", manifest),
        failedCards: manifest.qa.failed?.length ?? 0,
        currency: "unverified",
      },
      errata: {
        localSha256: sha256(JSON.stringify(errata)),
        fullCrawlAt: sourceCurrency("errata", manifest),
        currency: "unverified",
      },
    },
    obligations,
  };
}

export function validateInventory(inventory, index, { root = ROOT } = {}) {
  const errors = [];
  const expected = buildInventory(index, inventory);
  if (inventory.schemaVersion !== 1) errors.push("Unsupported inventory schemaVersion");
  if (JSON.stringify(inventory.source) !== JSON.stringify(expected.source))
    errors.push("Inventory source/index is stale");
  if (JSON.stringify(inventory.corpora) !== JSON.stringify(expected.corpora))
    errors.push("Inventory Q&A/errata corpus is stale");
  const derivedById = new Map(expected.obligations.map((record) => [record.id, record]));
  const actualIds = new Set();
  const scenarioIds = new Set();
  const scopes = inventory.scenarioScopes ?? {};
  const groups = inventory.scenarioGroups ?? {};
  const recordsById = new Map(inventory.obligations.map((record) => [record.id, record]));
  if (scopes === null || typeof scopes !== "object" || Array.isArray(scopes)) {
    errors.push("Invalid scenario scope manifest");
  } else {
    for (const [scope, ids] of Object.entries(scopes)) {
      if (!scope.trim() || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) {
        errors.push(`Invalid scenario scope manifest: ${scope}`);
        continue;
      }
      for (const id of ids) {
        const record = recordsById.get(id);
        if (!record)
          errors.push(`Scenario scope ${scope}: missing obligation ${id}; review source removal or renumbering`);
        else if (record.scope !== scope || !Array.isArray(record.scenarios))
          errors.push(`Scenario scope manifest mismatch: ${scope}/${id}`);
      }
    }
  }
  if (groups === null || typeof groups !== "object" || Array.isArray(groups))
    errors.push("Invalid scenario scope groups");
  else
    for (const [group, members] of Object.entries(groups)) {
      if (
        !group.trim() ||
        Object.hasOwn(scopes ?? {}, group) ||
        !Array.isArray(members) ||
        !members.length ||
        new Set(members).size !== members.length
      ) {
        errors.push(`Invalid scenario scope group: ${group}`);
        continue;
      }
      for (const member of members)
        if (!Object.hasOwn(scopes ?? {}, member)) errors.push(`Scenario scope group ${group}: missing scope ${member}`);
    }
  const rootPath = realpathSync(root);
  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const isConfinedTestFile = (testPath, workspace) => {
    if (!hasText(testPath) || isAbsolute(testPath)) return false;
    const path = resolve(rootPath, testPath);
    const fromRoot = relative(rootPath, path).replace(/\\/g, "/");
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) return false;
    if (!fromRoot.startsWith(`apps/${workspace}/`)) return false;
    try {
      const actualPath = realpathSync(path);
      const actualFromRoot = relative(rootPath, actualPath).replace(/\\/g, "/");
      return actualFromRoot.startsWith(`apps/${workspace}/`) && statSync(actualPath).isFile();
    } catch {
      return false;
    }
  };
  for (const record of inventory.obligations ?? []) {
    if (actualIds.has(record.id)) errors.push(`Duplicate obligation ${record.id}`);
    actualIds.add(record.id);
    const derived = derivedById.get(record.id);
    if (!derived) {
      errors.push(`Unknown obligation ${record.id}`);
      continue;
    }
    if (JSON.stringify(record.source) !== JSON.stringify(derived.source) || record.text !== derived.text) {
      errors.push(`Stale source text for ${record.id}`);
    }
    if (JSON.stringify(record.cardIds) !== JSON.stringify(derived.cardIds))
      errors.push(`Stale card IDs for ${record.id}`);
    if (!Array.isArray(record.mechanisms) || record.mechanisms.length === 0)
      errors.push(`Missing mechanisms for ${record.id}`);
    if (!Array.isArray(record.cardIds)) errors.push(`Missing cardIds array for ${record.id}`);
    if (!["applies", "does-not-apply", "choice", "boundary", "ordering"].includes(record.branch))
      errors.push(`Invalid branch for ${record.id}`);
    if (!["proven", "gap", "not-testable"].includes(record.status)) errors.push(`Invalid status for ${record.id}`);
    const hasScenarios = Object.hasOwn(record, "scenarios");
    if (record.scope !== undefined && !hasScenarios) errors.push(`Scenario scope lacks scenarios: ${record.id}`);
    if (hasScenarios) {
      if (!hasText(record.scope)) errors.push(`Scenario obligation lacks scope: ${record.id}`);
      if (!Array.isArray(scopes?.[record.scope]) || !scopes[record.scope].includes(record.id))
        errors.push(`Scenario scope manifest omits ${record.id}`);
      if (!Array.isArray(record.scenarios) || record.scenarios.length === 0) {
        errors.push(`Scenario obligation lacks nonempty scenarios: ${record.id}`);
      } else {
        for (const [scenarioIndex, scenario] of record.scenarios.entries()) {
          const label = `${record.id} scenario ${scenarioIndex + 1}`;
          if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
            errors.push(`Invalid scenario: ${label}`);
            continue;
          }
          for (const field of ["id", "precondition", "decisions", "expectedResult"])
            if (!hasText(scenario[field])) errors.push(`Scenario ${field} is missing: ${label}`);
          if (!["engine", "ui"].includes(scenario.layer)) errors.push(`Invalid scenario layer: ${label}`);
          if (hasText(scenario.id)) {
            if (scenarioIds.has(scenario.id)) errors.push(`Duplicate scenario ID ${scenario.id}`);
            scenarioIds.add(scenario.id);
          }
          if (scenario.status === "proven") {
            const workspace = scenario.layer === "engine" ? "api" : scenario.layer === "ui" ? "web" : "";
            if (!isConfinedTestFile(scenario.testPath, workspace))
              errors.push(`Scenario layer test path is missing or outside its workspace: ${label}`);
            if (!hasText(scenario.testName)) errors.push(`Scenario testName is missing: ${label}`);
            if (scenario.reason !== null) errors.push(`Proven scenario must have null reason: ${label}`);
          } else if (scenario.status === "gap") {
            if (!hasText(scenario.reason)) errors.push(`Gap scenario lacks reason: ${label}`);
          } else {
            errors.push(`Invalid scenario status: ${label}`);
          }
        }
        const expectedStatus = record.scenarios.every((scenario) => scenario?.status === "proven") ? "proven" : "gap";
        if (record.status !== expectedStatus)
          errors.push(`Scenario obligation status must be ${expectedStatus}: ${record.id}`);
      }
    }
    if (record.status === "proven") {
      if (!hasScenarios) {
        if (!record.precondition || !record.expectedResult)
          errors.push(`Proven obligation lacks observable scenario: ${record.id}`);
        if (!record.testPath || !existsSync(resolve(root, record.testPath)))
          errors.push(`Proven obligation lacks existing test path: ${record.id}`);
      }
      if (record.reason) errors.push(`Proven obligation has gap reason: ${record.id}`);
    } else if (!record.reason?.trim() || !record.owner?.trim()) {
      errors.push(`${record.status} obligation lacks reason/owner: ${record.id}`);
    }
    if (record.status === "not-testable" && !/non.normative|heading|definition|metadata/i.test(record.reason ?? "")) {
      errors.push(`Not-testable reason must identify non-normative content: ${record.id}`);
    }
  }
  for (const record of expected.obligations)
    if (!actualIds.has(record.id)) errors.push(`Missing obligation ${record.id}`);
  errors.push(...validateRouteMatrix(inventory, root));
  return errors;
}

function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--refresh"].includes(mode))
    throw new Error("Usage: node tools/kb/rule-obligations.mjs [--check|--refresh]");
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const prior = existsSync(INVENTORY_PATH) ? JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) : null;
  if (mode === "--refresh") {
    const result = buildInventory(index, prior);
    const formatted = spawnSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "oxfmt", `--stdin-filepath=${INVENTORY_PATH}`, "--threads=1"],
      {
        cwd: ROOT,
        encoding: "utf8",
        input: `${JSON.stringify(result, null, 2)}\n`,
        timeout: 30_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (formatted.error || formatted.status !== 0)
      throw new Error(`Could not format obligation inventory: ${formatted.error?.message ?? formatted.stderr}`);
    writeFileSync(INVENTORY_PATH, formatted.stdout);
    console.log(`Refreshed ${result.obligations.length} obligations in ${INVENTORY_PATH}`);
    return;
  }
  if (!prior) throw new Error("Inventory missing; run --refresh");
  const errors = validateInventory(prior, index);
  const counts = Object.fromEntries(
    ["proven", "gap", "not-testable"].map((status) => [
      status,
      prior.obligations.filter((record) => record.status === status).length,
    ]),
  );
  console.log(`Rule obligations (${prior.source.version}): ${JSON.stringify(counts)}`);
  if (errors.length) throw new Error(`${errors.length} inventory errors:\n${errors.join("\n")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
