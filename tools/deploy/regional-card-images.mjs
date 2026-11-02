import { execFile } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const KOREAN_ORIGIN = "https://digimoncard.co.kr";
export const USER_AGENT = "Mozilla/5.0 (compatible; AegisCardArtSync/1.0)";
const IMAGE_WIDTH = "430";
const IMAGE_QUALITY = "82";

const run = promisify(execFile);

export function regionalArtSourcesPath(source) {
  return `${source}/packages/shared/src/cards/data/regional-art-sources.json`;
}

export function koreanChallengeCookie(html) {
  const values = [...html.matchAll(/toNumbers\("([0-9a-f]+)"\)/g)].map((match) => Buffer.from(match[1], "hex"));
  if (values.length !== 3) return undefined;
  const [key, iv, cipherText] = values;
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  return `CUPID=${Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("hex")}`;
}

export async function fetchWithRetry(fetch, url, headers = {}, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok || response.status < 500 || attempt === attempts) return response;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    await delay(attempt * 2_000);
  }
}

export async function koreanCookie(fetch) {
  const response = await fetchWithRetry(fetch, `${KOREAN_ORIGIN}/index.php?mid=cardlist&page=1`);
  return koreanChallengeCookie(await response.text()) ?? "";
}

export function serializeRegionalArtSources(sources) {
  const entries = Object.entries(sources).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  if (!entries.length) return "{}\n";
  const lines = entries.map(([artId, source]) => `  ${JSON.stringify(artId)}: ${JSON.stringify(source)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

export function regionalPrintings(source) {
  const path = regionalArtSourcesPath(source);
  if (!existsSync(path)) return [];
  return Object.entries(JSON.parse(readFileSync(path, "utf8"))).map(([imageId, [, url]]) => ({ imageId, url }));
}

async function convertWithCwebp(input, output) {
  await run("cwebp", ["-quiet", "-q", IMAGE_QUALITY, "-resize", IMAGE_WIDTH, "0", input, "-o", output]);
}

export async function hasCwebp() {
  try {
    await run("cwebp", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function syncRegionalCardImages({
  source,
  destination,
  fetch = globalThis.fetch,
  convert = convertWithCwebp,
  concurrency = 2,
  deadline = Number.POSITIVE_INFINITY,
  limit = Number.POSITIVE_INFINITY,
}) {
  const printings = regionalPrintings(source);
  const result = { present: 0, downloaded: 0, failed: [], deferred: 0 };
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  const missing = printings.filter((printing) => {
    const present = existsSync(`${destination}/${printing.imageId}.webp`);
    if (present) result.present += 1;
    return !present;
  });
  const queue = missing.slice(0, limit);
  result.deferred = missing.length - queue.length;
  if (!queue.length) return result;
  const cookie = queue.some((printing) => printing.url.startsWith(KOREAN_ORIGIN)) ? await koreanCookie(fetch) : "";
  const workspace = mkdtempSync(`${tmpdir()}/aegis-regional-art-`);
  const mirrorOne = async ({ imageId, url }) => {
    const response = await fetchWithRetry(fetch, url, url.startsWith(KOREAN_ORIGIN) ? { cookie } : {});
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
      throw new Error(`answered ${response.status}`);
    }
    const input = `${workspace}/${imageId}.source`;
    const output = `${workspace}/${imageId}.webp`;
    writeFileSync(input, Buffer.from(await response.arrayBuffer()));
    try {
      await convert(input, output);
      writeFileSync(`${destination}/.${imageId}.webp.partial`, readFileSync(output), { mode: 0o644 });
      renameSync(`${destination}/.${imageId}.webp.partial`, `${destination}/${imageId}.webp`);
    } finally {
      rmSync(input, { force: true });
      rmSync(output, { force: true });
    }
  };
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          if (Date.now() >= deadline) {
            result.deferred += queue.length;
            queue.length = 0;
            return;
          }
          const printing = queue.shift();
          try {
            await mirrorOne(printing);
            result.downloaded += 1;
          } catch {
            result.failed.push(printing.imageId);
          }
        }
      }),
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  result.failed.sort();
  return result;
}

export function describeRegionalSync({ present, downloaded, failed, deferred }) {
  const preview = failed.slice(0, 20).join(" ");
  return `regional card images: ${downloaded} converted, ${present} present, ${deferred} deferred, ${failed.length} failed${failed.length ? ` (${preview}${failed.length > 20 ? " ..." : ""})` : ""}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? fallback : args[index + 1];
  };
  const state = resolve(option("state", "/opt/aegis-rollout"));
  const destination = resolve(option("destination", `${state}/assets/card-images`));
  const main = async () => {
    if (!(await hasCwebp())) throw new Error("cwebp is not installed (alpine: apk add libwebp-tools)");
    return syncRegionalCardImages({
      source: resolve(option("source", "/source")),
      destination,
      concurrency: Number(option("concurrency", "2")),
      limit: Number(option("limit", "Infinity")),
    });
  };
  main()
    .then((result) => console.log(`[aegis/regional-card-images] ${describeRegionalSync(result)}`))
    .catch((error) => {
      console.error(`[aegis/regional-card-images] ${error.message}`);
      process.exitCode = 1;
    });
}
