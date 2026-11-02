import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  koreanChallengeCookie,
  regionalArtSourcesPath,
  serializeRegionalArtSources,
  syncRegionalCardImages,
} from "./regional-card-images.mjs";

const KOREAN_CHALLENGE =
  'var a=toNumbers("e5a05fc4a5a04242c74d86420901f62c"),b=toNumbers("dfdb06f64f0707a6e4c8a2805018c364"),c=toNumbers("255729d185621112a192391bdf79d67c");';

function fixture(sources) {
  const root = mkdtempSync(`${tmpdir()}/aegis-regional-images-`);
  const source = `${root}/source`;
  mkdirSync(`${source}/packages/shared/src/cards/data`, { recursive: true });
  writeFileSync(regionalArtSourcesPath(source), serializeRegionalArtSources(sources));
  return { source, destination: `${root}/state/assets/card-images` };
}

function imageResponse(body) {
  return new Response(body, { status: 200, headers: { "content-type": "image/png" } });
}

const copyConvert = async (input, output) => copyFileSync(input, output);

test("solves the Korean site's cookie challenge", () => {
  assert.equal(koreanChallengeCookie(KOREAN_CHALLENGE), "CUPID=fd6d94282aca90ff10c67e1ffbf53265");
  assert.equal(koreanChallengeCookie("<html>card list</html>"), undefined);
});

test("writes the art sources one printing per line, sorted by art id", () => {
  assert.equal(
    serializeRegionalArtSources({ "BT1-010_P10-K": ["kr:b", "u2"], "BT1-010_P2-K": ["kr:a", "u1"] }),
    '{\n  "BT1-010_P2-K": ["kr:a","u1"],\n  "BT1-010_P10-K": ["kr:b","u2"]\n}\n',
  );
  assert.equal(serializeRegionalArtSources({}), "{}\n");
});

test("converts only missing printings and sends the Korean cookie only to the Korean site", async () => {
  const paths = fixture({
    "BT1-010-C": ["cn:1", "https://cdn.example/BT1-010.png"],
    "BT1-010-K": ["kr:/a.png", "https://digimoncard.co.kr/files/attach/a.png"],
    "BT1-011-C": ["cn:2", "https://cdn.example/BT1-011.png"],
  });
  mkdirSync(paths.destination, { recursive: true });
  writeFileSync(`${paths.destination}/BT1-011-C.webp`, "existing");
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, cookie: init.headers.cookie });
    if (url.includes("mid=cardlist")) return new Response(KOREAN_CHALLENGE, { status: 200 });
    return imageResponse(`image of ${url}`);
  };
  const result = await syncRegionalCardImages({ ...paths, fetch, convert: copyConvert });
  assert.deepEqual(result, { present: 1, downloaded: 2, failed: [], deferred: 0 });
  assert.equal(readFileSync(`${paths.destination}/BT1-010-C.webp`, "utf8"), "image of https://cdn.example/BT1-010.png");
  assert.equal(readFileSync(`${paths.destination}/BT1-011-C.webp`, "utf8"), "existing");
  assert.equal(
    requests.find((request) => request.url.endsWith("a.png")).cookie,
    "CUPID=fd6d94282aca90ff10c67e1ffbf53265",
  );
  assert.equal(requests.find((request) => request.url.endsWith("BT1-010.png")).cookie, undefined);
});

test("reports a source that answers with a page instead of an image, and keeps going", async () => {
  const paths = fixture({
    "BT1-010-C": ["cn:1", "https://cdn.example/missing.png"],
    "BT1-011-C": ["cn:2", "https://cdn.example/BT1-011.png"],
  });
  const fetch = async (url) =>
    url.includes("missing")
      ? new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })
      : imageResponse("ok");
  const result = await syncRegionalCardImages({ ...paths, fetch, convert: copyConvert });
  assert.deepEqual(result, { present: 0, downloaded: 1, failed: ["BT1-010-C"], deferred: 0 });
  assert.equal(existsSync(`${paths.destination}/BT1-010-C.webp`), false);
});

test("defers the rest of the queue past its limit or deadline", async () => {
  const paths = fixture({
    "BT1-010-C": ["cn:1", "https://cdn.example/1.png"],
    "BT1-011-C": ["cn:2", "https://cdn.example/2.png"],
    "BT1-012-C": ["cn:3", "https://cdn.example/3.png"],
  });
  const fetch = async () => imageResponse("ok");
  const limited = await syncRegionalCardImages({ ...paths, fetch, convert: copyConvert, concurrency: 1, limit: 1 });
  assert.deepEqual(limited, { present: 0, downloaded: 1, failed: [], deferred: 2 });
  const expired = await syncRegionalCardImages({ ...paths, fetch, convert: copyConvert, deadline: Date.now() - 1 });
  assert.deepEqual(expired, { present: 1, downloaded: 0, failed: [], deferred: 2 });
});

test("does nothing without an art source list", async () => {
  const root = mkdtempSync(`${tmpdir()}/aegis-regional-images-`);
  const result = await syncRegionalCardImages({
    source: root,
    destination: `${root}/out`,
    fetch: async () => assert.fail("no request expected"),
  });
  assert.deepEqual(result, { present: 0, downloaded: 0, failed: [], deferred: 0 });
});
