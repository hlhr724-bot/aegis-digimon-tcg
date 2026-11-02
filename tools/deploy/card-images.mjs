// Mirrors the card images the client requests into the gateway's shared assets directory,
// so production serves them from /assets/card-images instead of a third-party host.
// It never re-downloads an origin image; a clean or sample local scan replaces the mirror copy when it changes.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describeRegionalSync, hasCwebp, syncRegionalCardImages } from "./regional-card-images.mjs";

export const CARD_IMAGE_ORIGINS = [
  "https://web-garage.takaotaku.de",
  // The last upstream commit that still tracked the images in Git, for anything the bucket lacks.
  "https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/9f666f16501fb329b4e2fd9851e862afe2d7da05/src/assets/images/cards",
];

const TOKEN_ID_PREFIX = "TOKEN-";

export const LOCAL_CARD_IMAGES = "data/card-images";

export const LOCAL_CLEAN_CARD_IMAGES = `${LOCAL_CARD_IMAGES}/clean`;

/**
 * Each printing the client can show, with the image ids `cardImageUrls` in @aegis/shared tries
 * for it, read from the committed card data. An errata printing falls back to the pre-errata art.
 */
function listArtPrintings(arts) {
  if (!Array.isArray(arts.labels) || typeof arts.cards !== "object") {
    return Object.values(arts).flat();
  }
  return Object.entries(arts.cards).flatMap(([cardId, encoded]) =>
    encoded.map(([suffix, , imageId]) => ({ artId: `${cardId}${suffix}`, imageId: imageId ?? `${cardId}${suffix}` })),
  );
}

export function cardPrintings(source) {
  const data = `${source}/packages/shared/src/cards/data`;
  const cards = JSON.parse(readFileSync(`${data}/cards.json`, "utf8"));
  const arts = JSON.parse(readFileSync(`${data}/arts.json`, "utf8"));
  const printing = (id, imageId) => ({ id, imageIds: [...new Set([imageId, imageId.replace(/-Errata$/, "")])] });
  return [
    ...cards
      .filter((card) => !card.cardId.startsWith(TOKEN_ID_PREFIX))
      .map((card) => printing(card.cardId, card.imageId ?? card.cardId)),
    ...listArtPrintings(arts).map((art) => printing(art.artId, art.imageId)),
  ];
}

export function cardImageIds(source) {
  return [...new Set(cardPrintings(source).flatMap((printing) => printing.imageIds))].sort();
}

function isWebp(bytes) {
  return bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

async function download(fetch, name) {
  for (const origin of CARD_IMAGE_ORIGINS) {
    try {
      const response = await fetch(`${origin}/${name}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (isWebp(bytes)) return bytes;
    } catch {
      // Try the next origin; a missing image is retried on the next sync.
    }
  }
  return undefined;
}

/**
 * Stores each clean local scan as `<id>.webp`, replacing a watermarked origin copy. Downloads
 * `<id>.webp` for every other id. Without it, stores `<id>-Sample.webp` from the local scans
 * (rewritten whenever the committed scan changes) or, failing that, from an origin's sample scan.
 * A sample never blocks the real image: the next sync still looks for `<id>.webp`.
 */
export async function syncCardImages({ source, destination, fetch = globalThis.fetch, concurrency = 16 }) {
  const printings = cardPrintings(source);
  const ids = [...new Set(printings.flatMap((printing) => printing.imageIds))];
  const unavailable = new Set();
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  const result = { present: 0, downloaded: 0, missing: [] };
  const write = (name, bytes) => {
    const temporary = `${destination}/.${name}.partial`;
    writeFileSync(temporary, bytes, { mode: 0o644 });
    renameSync(temporary, `${destination}/${name}`);
  };
  const syncOne = async (id) => {
    const clean = `${source}/${LOCAL_CLEAN_CARD_IMAGES}/${id}.webp`;
    if (existsSync(clean)) {
      const scan = readFileSync(clean);
      const mirrored = `${destination}/${id}.webp`;
      rmSync(`${destination}/${id}-Sample.webp`, { force: true });
      if (existsSync(mirrored) && readFileSync(mirrored).equals(scan)) {
        result.present += 1;
        return;
      }
      write(`${id}.webp`, scan);
      result.downloaded += 1;
      return;
    }
    if (existsSync(`${destination}/${id}.webp`)) {
      result.present += 1;
      return;
    }
    const image = await download(fetch, `${id}.webp`);
    if (image) {
      write(`${id}.webp`, image);
      rmSync(`${destination}/${id}-Sample.webp`, { force: true });
      result.downloaded += 1;
      return;
    }
    const sample = `${destination}/${id}-Sample.webp`;
    const local = `${source}/${LOCAL_CARD_IMAGES}/${id}.webp`;
    if (existsSync(local)) {
      const scan = readFileSync(local);
      if (existsSync(sample) && readFileSync(sample).equals(scan)) {
        result.present += 1;
        return;
      }
      write(`${id}-Sample.webp`, scan);
      result.downloaded += 1;
      return;
    }
    if (existsSync(sample)) {
      result.present += 1;
      return;
    }
    const originSample = await download(fetch, `${id}-Sample.webp`);
    if (originSample) {
      write(`${id}-Sample.webp`, originSample);
      result.downloaded += 1;
      return;
    }
    unavailable.add(id);
  };
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) await syncOne(queue.shift());
    }),
  );
  result.missing = printings
    .filter((printing) => printing.imageIds.every((id) => unavailable.has(id)))
    .map((printing) => printing.id)
    .sort();
  return result;
}

export function describeSync({ present, downloaded, missing }) {
  const preview = missing.slice(0, 20).join(" ");
  return `card images: ${downloaded} downloaded, ${present} present, ${missing.length} printings without art${missing.length ? ` (${preview}${missing.length > 20 ? " ..." : ""})` : ""}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? fallback : args[index + 1];
  };
  const state = resolve(option("state", "/opt/aegis-rollout"));
  const source = resolve(option("source", "/source"));
  const destination = `${state}/assets/card-images`;
  const main = async () => {
    console.log(`[aegis/card-images] ${describeSync(await syncCardImages({ source, destination }))}`);
    if (!(await hasCwebp())) {
      console.warn("[aegis/card-images] regional card images skipped: cwebp is not installed");
      return;
    }
    console.log(`[aegis/card-images] ${describeRegionalSync(await syncRegionalCardImages({ source, destination }))}`);
  };
  main().catch((error) => {
    console.error(`[aegis/card-images] ${error.message}`);
    process.exitCode = 1;
  });
}
