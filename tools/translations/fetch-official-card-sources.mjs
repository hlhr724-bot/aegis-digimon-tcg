import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchWithRetry, koreanCookie } from "../deploy/regional-card-images.mjs";

const directory = resolve(process.argv[2] ?? ".local/card-language/sources");
await mkdir(directory, { recursive: true });
async function fetchPage({ name, url, headers = {} }) {
  const path = resolve(directory, name);
  try {
    return await readFile(path, "utf8");
  } catch {}
  const response = await fetchWithRetry(fetch, url, headers);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes("image_lists")) {
    throw new Error(`Unexpected card list: ${url}`);
  }
  await writeFile(path, html);
  return html;
}
const japanese = await fetchPage({ name: "ja-categories.html", url: "https://digimoncard.com/cards/?search=true" });
const categoryOptions = japanese.match(/<select name="category">([\s\S]*?)<\/select>/)?.[1];
if (!categoryOptions) {
  throw new Error("Japanese categories missing");
}
const categories = [...categoryOptions.matchAll(/value="(\d+)"/g)].map((match) => match[1]);
const cookie = await koreanCookie(fetch);
const korean = await fetchPage({
  name: "ko-page-1.html",
  url: "https://digimoncard.co.kr/index.php?mid=cardlist&page=1",
  headers: { cookie },
});
const lastPage = Math.max(...[...korean.matchAll(/page=(\d+)/g)].map((match) => Number(match[1])));
const requests = [
  ...categories.map((category) => ({
    name: `ja-category-${category}.html`,
    url: `https://digimoncard.com/cards/?search=true&category=${category}`,
  })),
  ...Array.from({ length: lastPage - 1 }, (_, index) => ({
    name: `ko-page-${index + 2}.html`,
    url: `https://digimoncard.co.kr/index.php?mid=cardlist&page=${index + 2}`,
    headers: { cookie },
  })),
];
let completed = 0;
async function runWorker() {
  while (requests.length) {
    const request = requests.shift();
    await fetchPage(request);
    completed += 1;
    if (completed % 20 === 0) {
      console.log(`Downloaded ${completed} pages; ${requests.length} remain`);
    }
  }
}
await Promise.all(Array.from({ length: 3 }, () => runWorker()));
await writeFile(
  resolve(directory, "sources.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), categories, koreanPages: lastPage }, null, 2) + "\n",
);
console.log(`Ready: ${categories.length} Japanese categories, ${lastPage} Korean pages`);
