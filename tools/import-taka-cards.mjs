#!/usr/bin/env node
/**
 * Card-data importer for sets missing from the committed snapshot, such as
 * EX12 and the newest promos. It maps records from the community card database
 * (TakaOtaku/Digimon-Card-App `DigimonCards.json`) into the same
 * `CardDefinition` shape and appends them to `cards.json`.
 *
 * It is deterministic and idempotent: re-running with the same source and
 * id-selection yields a byte-identical, cardId-sorted `cards.json`.
 *
 * Usage:
 *   node tools/import-taka-cards.mjs --source <path> --sets EX12 --ids P-226,P-239
 *   node tools/import-taka-cards.mjs --source <path> --validate EX11
 *     (reconstruct an already-imported set and diff against cards.json)
 *   node tools/import-taka-cards.mjs --source <path> --validate <label> --ids P-239,P-240
 *     (--ids narrows validation to an explicit cardId list instead of a whole set prefix,
 *     for batches that don't fill a set on their own)
 *   ... --validate <SET> --json
 *     (machine-readable, uncapped diff; see tools/import-taka-cards-validate.test.mjs)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeCardArts, encodeCardArts, serializeCardArts, sourceCardArts } from "./lib/card-arts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_PATH = resolve(ROOT, "packages/shared/src/cards/data/cards.json");

const NBSP = /\u00a0|&#160;|&nbsp;/gi;
const clean = (s) => (typeof s === "string" ? s.replace(NBSP, " ") : s);
const isBlank = (s) => s === undefined || s === null || s === "-" || s === "";
// Card names are single-line. A few community-DB rows wrap the Japanese name
// across lines at its interpuncts ("リバース\n・オブ\n・ザ\n・デッド"); newlines
// there are scrape artifacts, not part of the name.
const cleanName = (s) => (typeof s === "string" ? clean(s).replace(/\s*[\r\n]+\s*/g, "") : s);

const KIND_MAP = {
  Digimon: ["Digimon"],
  Tamer: ["Tamer"],
  Option: ["Option"],
  "Digi-Egg": ["DigiEgg"],
  "Digimon/Option": ["Digimon", "Option"],
};

function splitTraits(value) {
  if (isBlank(value)) return [];
  return clean(value)
    .split("/")
    .map((t) => t.trim())
    .filter((t) => t && t !== "-");
}

function parseLevel(cardLv) {
  if (isBlank(cardLv)) return undefined;
  const m = String(cardLv).match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/**
 * The community DB overloads `digivolveCondition` with rows that are not
 * digivolve costs: Assembly rows carry a form abbreviation as the level
 * ("Stnd.", "Sup.", "Ult.") and BT18's Tamer-digivolution rows carry "Tamer".
 * Those levels are not numeric, so they cannot be an EvoCost — keeping them
 * would put `level: NaN` into cards.json. The Assembly requirement itself is
 * preserved as text by `buildEffectText`.
 */
// The community DB writes a rainbow digivolve cost as one "All" row; the engine
// matches EvoCost colors against real card colors, so it becomes one row per color.
const ALL_EVO_COLORS = ["Red", "Blue", "Yellow", "Green", "Black", "Purple", "White"];

function parseEvoCosts(conds) {
  if (!Array.isArray(conds)) return [];
  return conds
    .filter((c) => Number.isFinite(Number(c.level)))
    .flatMap((c) =>
      (c.color === "All" ? ALL_EVO_COLORS : [c.color]).map((color) => ({
        color,
        level: Number(c.level),
        memoryCost: Number(c.cost),
      })),
    );
}

// Special-digivolution headers printed above the effect box, in card order.
const DIGIVOLVE_HEADER_FIELDS = ["specialDigivolve", "dnaDigivolve", "digiXros", "burstDigivolve", "assembly"];

function buildEffectText(t) {
  const parts = [];
  const headers = DIGIVOLVE_HEADER_FIELDS.filter((f) => !isBlank(t[f])).map((f) => clean(t[f]));
  if (headers.length) parts.push(headers.join("\n"));
  if (!isBlank(t.effect)) parts.push(clean(t.effect));
  let text = parts.length ? parts.join("\n\n") : undefined;
  // A [Rule] annotation (extra trait/name grants) is appended to effectText,
  // matching the convention in the imported records.
  if (!isBlank(t.rule)) text = text ? `${text}\n${clean(t.rule)}` : clean(t.rule);
  return text;
}

function parseOverflow(aceEffect) {
  if (isBlank(aceEffect)) return undefined;
  const m = clean(aceEffect).match(/Overflow\s*[＜<]\s*-?(\d+)\s*[＞>]/);
  return m ? Number(m[1]) : undefined;
}

function parseLinkDp(linkDp) {
  if (isBlank(linkDp)) return undefined;
  const match = clean(String(linkDp)).match(/\d+/);
  return match === null ? undefined : Number(match[0]);
}

function convert(t) {
  const cardId = t.cardNumber;
  const kinds = KIND_MAP[t.cardType];
  if (!kinds) throw new Error(`${cardId}: unknown cardType ${t.cardType}`);

  // A DUAL card prints two names, "<Digimon side>/<Option side>". The Digimon
  // name is `nameEn`; the Option name is `dualEffect`, matching the source-
  // extracted records. Split on the FIRST separator only — either side may
  // itself contain a colon-qualified name ("Rosemon: Burst Mode/Aguichant
  // Lèvres", "Murasamemon/Gonozan: Murashigure").
  const printedName = cleanName(t.name?.english) ?? cardId;
  const isDual = kinds.length > 1;
  const sep = isDual ? printedName.indexOf("/") : -1;

  const def = {
    cardId,
    set: cardId.split("-")[0],
    nameEn: sep > 0 ? printedName.slice(0, sep).trim() : printedName,
    colors: clean(t.color)
      .split("/")
      .map((c) => c.trim())
      .filter(Boolean),
    kinds,
    playCost: isBlank(t.playCost) ? -1 : Number(t.playCost),
    dp: isBlank(t.dp) ? 0 : Number(t.dp),
    evoCosts: parseEvoCosts(t.digivolveCondition),
    rarity: t.rarity,
    maxCountInDeck: 4,
    imageId: cardId,
  };

  const level = parseLevel(t.cardLv);
  if (level !== undefined) def.level = level;

  const forms = splitTraits(t.form);
  const attributes = splitTraits(t.attribute);
  const types = splitTraits(t.type);
  if (forms.length) def.forms = forms;
  if (attributes.length) def.attributes = attributes;
  if (types.length) def.types = types;

  const effectText = buildEffectText(t);
  if (effectText) def.effectText = effectText;
  if (!isBlank(t.digivolveEffect)) def.inheritedEffectText = clean(t.digivolveEffect);
  if (!isBlank(t.securityEffect)) def.securityEffectText = clean(t.securityEffect);

  const overflow = parseOverflow(t.aceEffect);
  if (overflow !== undefined) {
    def.isAce = true;
    def.overflowMemory = overflow;
  }

  if (!isBlank(t.linkRequirement)) def.linkRequirement = clean(t.linkRequirement);
  if (!isBlank(t.linkEffect)) def.linkEffect = clean(t.linkEffect);
  const linkDp = parseLinkDp(t.linkDP);
  if (linkDp !== undefined) def.linkDp = linkDp;

  if (isDual) {
    def.isDualCard = true;
    if (sep > 0) def.dualEffect = printedName.slice(sep + 1).trim();
    if (!isBlank(t.optionCardEffect)) def.optionEffect = clean(t.optionCardEffect);
    const optionColors = splitTraits(t.optionCardColourRequirement);
    if (optionColors.length) def.optionColorRequirements = optionColors;
  }

  const nameJp = cleanName(t.name?.japanese);
  if (!isBlank(nameJp)) def.nameJp = nameJp;

  return def;
}

// --- CLI ---
const argv = process.argv.slice(2);
const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const sourcePath = getOpt("--source");
if (!sourcePath) {
  console.error("error: --source <DigimonCards.json> required");
  process.exit(1);
}
const taka = JSON.parse(readFileSync(resolve(sourcePath), "utf8"));
const bySet = (cn) => cn.split("-")[0];

const validateSet = getOpt("--validate");
if (validateSet) {
  // `--ids` narrows validation to an explicit cardId list instead of a whole
  // set prefix — needed for batches that don't fill a set on their own (e.g.
  // the 6 promo cards P-239..P-244 imported alongside EX12).
  const validateIds = (getOpt("--ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const inScope = validateIds.length
    ? (cardId) => validateIds.includes(cardId)
    : (cardId) => bySet(cardId) === validateSet;

  const existing = JSON.parse(readFileSync(CARDS_PATH, "utf8"));
  const ours = new Map(existing.filter((c) => inScope(c.cardId)).map((c) => [c.cardId, c]));
  const src = taka.filter((t) => inScope(t.cardNumber));
  const diffs = [];
  for (const t of src) {
    const o = ours.get(t.cardNumber);
    if (!o) continue;
    const c = convert(t);
    const keys = new Set([...Object.keys(o), ...Object.keys(c)]);
    const fields = [];
    for (const k of keys) {
      if (JSON.stringify(o[k]) !== JSON.stringify(c[k])) fields.push({ field: k, ours: o[k], conv: c[k] });
    }
    if (fields.length) diffs.push({ cardId: t.cardNumber, fields });
  }

  // `console.log` on a piped stdout (e.g. a subprocess capturing output) writes
  // asynchronously; an immediately following `process.exit()` can truncate a large
  // payload before the write lands. Let the process exit naturally instead.
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ label: validateSet, sourceCount: src.length, oursCount: ours.size, diffs }, null, 2));
  } else {
    // Human-readable path stays capped at 12 detailed entries so a large drift
    // doesn't flood the terminal; use --json for a complete, uncapped diff.
    for (const d of diffs.slice(0, 12)) {
      console.log(`DIFF ${d.cardId}: ${d.fields.map((f) => f.field).join(", ")}`);
      for (const f of d.fields)
        console.log(`   ${f.field}: ours=${JSON.stringify(f.ours)} conv=${JSON.stringify(f.conv)}`);
    }
    console.log(`\n${validateSet}: ${src.length} source / ${ours.size} ours / ${diffs.length} cards differ`);
  }
} else {
  const sets = (getOpt("--sets") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = (getOpt("--ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const wanted = taka.filter((t) => sets.includes(bySet(t.cardNumber)) || ids.includes(t.cardNumber));
  // The community DB carries a few placeholder/non-card rows (empty cardType,
  // MediaWiki template names). Drop anything whose cardType we don't recognize.
  const skipped = wanted.filter((t) => !KIND_MAP[t.cardType]);
  const cards = wanted.filter((t) => KIND_MAP[t.cardType]);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} non-card rows: ${skipped.map((t) => t.cardNumber).join(", ")}`);
  }

  const existing = JSON.parse(readFileSync(CARDS_PATH, "utf8"));
  const haveIds = new Set(existing.map((c) => c.cardId));
  const added = [];
  for (const t of cards) {
    if (haveIds.has(t.cardNumber)) continue;
    existing.push(convert(t));
    haveIds.add(t.cardNumber);
    added.push(t.cardNumber);
  }
  existing.sort((a, b) => a.cardId.localeCompare(b.cardId, "en"));
  writeFileSync(CARDS_PATH, JSON.stringify(existing, null, 2) + "\n");
  // Refresh the selected cards' cosmetic printing inventory independently of rules data.
  const artsPath = resolve(ROOT, "packages/shared/src/cards/data/arts.json");
  const encodedArts = existsSync(artsPath) ? JSON.parse(readFileSync(artsPath, "utf8")) : { labels: [], cards: {} };
  const arts = decodeCardArts(encodedArts);
  for (const card of cards) {
    const variants = sourceCardArts(card);
    if (variants.length) arts[card.cardNumber] = variants;
    else delete arts[card.cardNumber];
  }
  writeFileSync(artsPath, serializeCardArts(encodeCardArts(arts, encodedArts.labels)));
  console.log(`Added ${added.length} cards: ${added.sort().join(", ")}`);
}
