#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { CARD_IMAGE_ORIGINS, LOCAL_CARD_IMAGES, LOCAL_CLEAN_CARD_IMAGES, cardImageIds } from "./deploy/card-images.mjs";

const run = promisify(execFile);

const SCAN_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

const FINGERPRINT_WIDTH = 24;

const FINGERPRINT_HEIGHT = 34;

const REFERENCE_CACHE = ".local/card-image-references";

const VALUE_OPTIONS = new Set(["--sets", "--map", "--report"]);

export const DEFAULT_THRESHOLDS = { minScore: 0.75, minMargin: 0.03 };

export function inferCardSets(folderNames) {
  const sets = folderNames
    .map((name) => name.trim().split(/\s+/)[0])
    .map((token) => (/^promo/i.test(token) ? "P" : token.toUpperCase()))
    .filter((token) => /^[A-Z]+\d*$/.test(token));
  return [...new Set(sets)].sort();
}

export function isCandidateImageId(imageId, sets) {
  return !/-J$/i.test(imageId) && sets.includes(imageId.split("-")[0]);
}

function similarity(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
  return total;
}

export function normalizeFingerprint(pixels) {
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const centered = Float64Array.from(pixels, (value) => value - mean);
  const norm = Math.sqrt(similarity(centered, centered));
  return norm ? centered.map((value) => value / norm) : centered;
}

export function matchScans(scans, references, { minScore, minMargin } = DEFAULT_THRESHOLDS) {
  return scans.map(({ file, fingerprint }) => {
    const ranked = references
      .map(({ id, fingerprint: reference }) => ({ id, score: similarity(fingerprint, reference) }))
      .sort((left, right) => right.score - left.score);
    const [best = { id: undefined, score: 0 }, second = { id: undefined, score: 0 }] = ranked;
    const reason =
      best.score < minScore ? "low score" : best.score - second.score < minMargin ? "close second match" : undefined;
    return { file, id: best.id, score: best.score, second: second.id, secondScore: second.score, reason };
  });
}

export function flagSharedMatches(matches) {
  const claims = new Map();
  for (const match of matches.filter((candidate) => !candidate.reason)) {
    claims.set(match.id, (claims.get(match.id) ?? 0) + 1);
  }
  return matches.map((match) =>
    !match.reason && claims.get(match.id) > 1 ? { ...match, reason: "matched by another scan" } : match,
  );
}

export function applyMapping(matches, mapping) {
  return matches.map((match) => {
    if (!(match.file in mapping)) return match;
    const id = mapping[match.file];
    return id === null
      ? { ...match, id: undefined, reason: "skipped by mapping" }
      : { ...match, id, reason: undefined };
  });
}

function listScans(folder) {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
    .sort();
}

async function encodeWebp(input, output) {
  await run("cwebp", ["-quiet", "-q", "90", "-metadata", "none", input, "-o", output]);
}

async function readFingerprint(webp) {
  const { stdout } = await run(
    "dwebp",
    ["-quiet", "-pgm", "-scale", `${FINGERPRINT_WIDTH}`, `${FINGERPRINT_HEIGHT}`, webp, "-o", "-"],
    { encoding: "buffer", maxBuffer: 1 << 20 },
  );
  const header = stdout.toString("latin1", 0, 64).match(/^P5\s+\d+\s+\d+\s+\d+\s/);
  if (!header) throw new Error(`dwebp returned no PGM image for ${webp}`);
  const luma = stdout.subarray(header[0].length, header[0].length + FINGERPRINT_WIDTH * FINGERPRINT_HEIGHT);
  return normalizeFingerprint(luma);
}

async function downloadReference(id) {
  for (const origin of CARD_IMAGE_ORIGINS) {
    for (const name of [`${id}.webp`, `${id}-Sample.webp`]) {
      try {
        const response = await fetch(`${origin}/${name}`, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.toString("ascii", 8, 12) === "WEBP") return bytes;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

async function referencePath(root, id) {
  const local = [`${LOCAL_CLEAN_CARD_IMAGES}/${id}.webp`, `${LOCAL_CARD_IMAGES}/${id}.webp`]
    .map((path) => `${root}/${path}`)
    .find((path) => existsSync(path));
  if (local) return local;
  const cached = `${root}/${REFERENCE_CACHE}/${id}.webp`;
  if (existsSync(cached)) return cached;
  const bytes = await downloadReference(id);
  if (!bytes) return undefined;
  mkdirSync(`${root}/${REFERENCE_CACHE}`, { recursive: true });
  writeFileSync(cached, bytes);
  return cached;
}

async function inParallel(items, work, concurrency = 8) {
  const queue = [...items];
  const results = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) results.push(await work(queue.shift()));
    }),
  );
  return results;
}

function readOptions(args) {
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? undefined : args[index + 1];
  };
  const folder = args.find((arg, index) => !arg.startsWith("--") && !VALUE_OPTIONS.has(args[index - 1]));
  if (!folder) {
    throw new Error(
      "usage: pnpm card-images:import <folder> [--sets BT22,EX10,P] [--map mapping.json] [--report report.json] [--dry-run]",
    );
  }
  return {
    folder: resolve(folder),
    sets: option("sets")?.split(","),
    mapping: option("map") ? JSON.parse(readFileSync(resolve(option("map")), "utf8")) : {},
    report: resolve(option("report") ?? ".local/card-image-import/report.json"),
    dryRun: args.includes("--dry-run"),
  };
}

function describeMatch(match) {
  const second = match.second ? `, next ${match.second} ${match.secondScore.toFixed(3)}` : "";
  return `${match.file} -> ${match.id ?? "-"} (${match.score.toFixed(3)}${second})`;
}

async function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const options = readOptions(process.argv.slice(2));
  const sets =
    options.sets ?? inferCardSets(readdirSync(options.folder, { withFileTypes: true }).map((entry) => entry.name));
  if (!sets.length) throw new Error("no card sets found in the folder names; pass --sets BT22,EX10,P");
  const knownIds = new Set(cardImageIds(root));
  const unknown = Object.values(options.mapping).filter((id) => id !== null && !knownIds.has(id));
  if (unknown.length) throw new Error(`the mapping names unknown image ids: ${unknown.join(", ")}`);
  const ids = [...knownIds].filter((id) => isCandidateImageId(id, sets));
  console.log(`${ids.length} candidate printings in ${sets.join(", ")}`);

  const references = (
    await inParallel(ids, async (id) => {
      const path = await referencePath(root, id);
      return path ? { id, fingerprint: await readFingerprint(path) } : undefined;
    })
  ).filter(Boolean);
  console.log(`${references.length} reference images, ${ids.length - references.length} printings without one`);

  const workspace = mkdtempSync(`${tmpdir()}/aegis-clean-card-images-`);
  try {
    const scans = await inParallel(listScans(options.folder), async (file) => {
      const webp = `${workspace}/${basename(file, extname(file))}-${Math.random().toString(36).slice(2)}.webp`;
      await encodeWebp(join(options.folder, file), webp);
      return { file, webp, fingerprint: await readFingerprint(webp) };
    });
    const webpByFile = new Map(scans.map((scan) => [scan.file, scan.webp]));
    const matches = flagSharedMatches(applyMapping(matchScans(scans, references), options.mapping)).sort(
      (left, right) => left.file.localeCompare(right.file),
    );
    const accepted = matches.filter((match) => !match.reason);
    const review = matches.filter((match) => match.reason);

    mkdirSync(resolve(options.report, ".."), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(matches, null, 2)}\n`);
    for (const match of review) console.log(`review: ${match.reason}: ${describeMatch(match)}`);

    if (!options.dryRun) {
      mkdirSync(`${root}/${LOCAL_CLEAN_CARD_IMAGES}`, { recursive: true });
      for (const match of accepted) {
        copyFileSync(webpByFile.get(match.file), `${root}/${LOCAL_CLEAN_CARD_IMAGES}/${match.id}.webp`);
        rmSync(`${root}/${LOCAL_CARD_IMAGES}/${match.id}.webp`, { force: true });
      }
    }
    console.log(
      `${accepted.length} scans ${options.dryRun ? "would be imported" : "imported"}, ${review.length} need review. Report: ${relative(root, options.report)}`,
    );
    if (review.length) {
      console.log('Resolve them in a mapping file ({"<file>": "<image id>" or null}) and rerun with --map <file>.');
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[aegis/card-images:import] ${error.message}`);
    process.exitCode = 1;
  });
}
