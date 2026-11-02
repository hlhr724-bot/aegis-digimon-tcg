#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KOREAN_ORIGIN,
  describeRegionalSync,
  fetchWithRetry,
  hasCwebp,
  koreanChallengeCookie,
  koreanCookie,
  regionalArtSourcesPath,
  serializeRegionalArtSources,
  syncRegionalCardImages,
} from "./deploy/regional-card-images.mjs";
import { encodeCardArts, serializeCardArts } from "./lib/card-arts.mjs";
import {
  assignRegionalArtIds,
  chineseSourceArts,
  groupArtsByCard,
  hasKoreanCardListItems,
  koreanSourceArts,
  resolveSourceArts,
} from "./lib/regional-card-arts.mjs";

const CHINESE_CARD_LIST = "https://dtcgweb-api.digimoncard.cn/gamecard/gamecardmanager/weblist?page=1&limit=100000";
const KOREAN_PAGE_LIMIT = 1000;

const repository = fileURLToPath(new URL("..", import.meta.url));
const dataDirectory = `${repository}packages/shared/src/cards/data/`;
const artsPath = `${dataDirectory}regional-arts.json`;
const sourcesPath = regionalArtSourcesPath(repository);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

async function fetchText(url, headers = {}) {
  const response = await fetchWithRetry(fetch, url, headers);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function fetchChineseArts() {
  const body = JSON.parse(await fetchText(CHINESE_CARD_LIST));
  if (body.code !== 0 || !Array.isArray(body.page?.list)) throw new Error("Chinese card list has an unexpected shape");
  if (body.page.list.length < body.page.totalCount) throw new Error("Chinese card list was truncated");
  return chineseSourceArts(body.page.list);
}

async function fetchKoreanArts() {
  const cookie = await koreanCookie(fetch);
  const arts = [];
  for (let page = 1; page <= KOREAN_PAGE_LIMIT; page += 1) {
    const html = await fetchText(`${KOREAN_ORIGIN}/index.php?mid=cardlist&page=${page}`, { cookie });
    if (koreanChallengeCookie(html)) throw new Error(`Korean card list page ${page} answered with a new challenge`);
    if (!hasKoreanCardListItems(html)) return arts;
    arts.push(...koreanSourceArts(html, KOREAN_ORIGIN));
  }
  throw new Error(`Korean card list exceeded ${KOREAN_PAGE_LIMIT} pages`);
}

function summarize(region, { sourceArts, resolved, rejected, arts }) {
  const count = (list) => list.filter((art) => art.region === region).length;
  return `${region}: ${sourceArts[region].length} source printings, ${count(resolved)} matched, ${count(rejected)} rejected by stats, ${count(arts)} arts`;
}

const previewDirectory = option("images");
if (previewDirectory && !(await hasCwebp()))
  throw new Error("cwebp is required for --images (macOS: brew install webp)");

const cards = readJson(`${dataDirectory}cards.json`, []);
const sourceArts = { chinese: await fetchChineseArts(), korean: await fetchKoreanArts() };
const { resolved, rejected } = resolveSourceArts([...sourceArts.chinese, ...sourceArts.korean], cards);
const { arts, sources } = assignRegionalArtIds(resolved, readJson(sourcesPath, {}));
const previousLabels = readJson(artsPath, { labels: [] }).labels;

writeFileSync(sourcesPath, serializeRegionalArtSources(sources));
writeFileSync(artsPath, serializeCardArts(encodeCardArts(groupArtsByCard(arts), previousLabels)));

for (const region of Object.keys(sourceArts)) console.log(summarize(region, { sourceArts, resolved, rejected, arts }));
if (rejected.length) {
  const preview = rejected.slice(0, 20).map((art) => `${art.cardId} ${art.key}`);
  console.log(`rejected: ${preview.join(", ")}${rejected.length > 20 ? " ..." : ""}`);
}
if (previewDirectory) {
  const result = await syncRegionalCardImages({
    source: repository,
    destination: resolve(previewDirectory),
    concurrency: Number(option("concurrency", "6")),
    limit: Number(option("limit", "Infinity")),
  });
  console.log(describeRegionalSync(result));
}
