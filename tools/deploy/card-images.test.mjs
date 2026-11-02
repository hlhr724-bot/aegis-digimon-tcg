import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  CARD_IMAGE_ORIGINS,
  LOCAL_CARD_IMAGES,
  LOCAL_CLEAN_CARD_IMAGES,
  cardImageIds,
  syncCardImages,
} from "./card-images.mjs";

const webp = (label) => Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP"), Buffer.from(label)]);

function fixture(t, cards, arts = {}) {
  const root = mkdtempSync(`${tmpdir()}/aegis-card-images-`);
  t.after(() => rmSync(root, { recursive: true }));
  const data = `${root}/source/packages/shared/src/cards/data`;
  mkdirSync(data, { recursive: true });
  writeFileSync(`${data}/cards.json`, JSON.stringify(cards));
  writeFileSync(`${data}/arts.json`, JSON.stringify(arts));
  return { source: `${root}/source`, destination: `${root}/state/assets/card-images` };
}

function fakeFetch(files) {
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    const body = files[url];
    return body ? new Response(body) : new Response("Not found", { status: 404 });
  };
  return { fetch, requests };
}

const [bucket, snapshot] = CARD_IMAGE_ORIGINS;

test("lists base, errata, and alternate art images but not tokens", (t) => {
  const { source } = fixture(
    t,
    [{ cardId: "BT1-001" }, { cardId: "BT16-077", imageId: "BT16-077-Errata" }, { cardId: "TOKEN-Familiar" }],
    { "BT1-001": [{ artId: "BT1-001_P1", imageId: "BT1-001_P1" }] },
  );
  assert.deepEqual(cardImageIds(source), ["BT1-001", "BT1-001_P1", "BT16-077", "BT16-077-Errata"]);
});

test("lists alternate art images from the compact art index", (t) => {
  const { source } = fixture(t, [{ cardId: "BT1-001" }], {
    labels: ["Promotion", "Japanese printing"],
    cards: {
      "BT1-001": [
        ["_P1", 0],
        ["-J", 1, "BT1-001-j"],
      ],
    },
  });
  assert.deepEqual(cardImageIds(source), ["BT1-001", "BT1-001-j", "BT1-001_P1"]);
});

test("downloads missing images, falling back across origins and to the sample scan", async (t) => {
  const paths = fixture(t, [
    { cardId: "BT1-001" },
    { cardId: "BT1-002" },
    { cardId: "BT1-003" },
    { cardId: "BT1-004" },
  ]);
  mkdirSync(paths.destination, { recursive: true });
  writeFileSync(`${paths.destination}/BT1-004.webp`, "kept");
  const { fetch, requests } = fakeFetch({
    [`${bucket}/BT1-001.webp`]: webp("bucket"),
    [`${bucket}/BT1-002.webp`]: "<html>not an image</html>",
    [`${snapshot}/BT1-002.webp`]: webp("snapshot"),
    [`${snapshot}/BT1-003-Sample.webp`]: webp("sample"),
  });

  const result = await syncCardImages({ ...paths, fetch });

  assert.deepEqual(result, { present: 1, downloaded: 3, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT1-001.webp`, "utf8").slice(12), "bucket");
  assert.equal(readFileSync(`${paths.destination}/BT1-002.webp`, "utf8").slice(12), "snapshot");
  assert.equal(readFileSync(`${paths.destination}/BT1-003-Sample.webp`, "utf8").slice(12), "sample");
  assert.equal(readFileSync(`${paths.destination}/BT1-004.webp`, "utf8"), "kept");
  assert.equal(
    requests.some((url) => url.includes("BT1-004")),
    false,
  );
  assert.deepEqual(
    readdirSync(paths.destination).filter((name) => name.startsWith(".")),
    [],
  );
});

test("keeps looking for the real image and replaces the sample once it is published", async (t) => {
  const paths = fixture(t, [{ cardId: "BT1-001" }, { cardId: "BT1-002" }]);
  mkdirSync(paths.destination, { recursive: true });
  writeFileSync(`${paths.destination}/BT1-001-Sample.webp`, "sample");

  const before = await syncCardImages({ ...paths, fetch: fakeFetch({}).fetch });
  assert.deepEqual(before, { present: 1, downloaded: 0, missing: ["BT1-002"] });

  const after = await syncCardImages({
    ...paths,
    fetch: fakeFetch({ [`${bucket}/BT1-001.webp`]: webp("real") }).fetch,
  });
  assert.deepEqual(after, { present: 0, downloaded: 1, missing: ["BT1-002"] });
  assert.equal(existsSync(`${paths.destination}/BT1-001.webp`), true);
  assert.equal(existsSync(`${paths.destination}/BT1-001-Sample.webp`), false);
});

test("reports only printings with no image under any fallback the client tries", async (t) => {
  const paths = fixture(
    t,
    [{ cardId: "BT16-077", imageId: "BT16-077-Errata" }, { cardId: "P-147" }, { cardId: "BT1-001" }],
    { "BT1-001": [{ artId: "BT1-001_P1", imageId: "BT1-001_P1" }] },
  );
  mkdirSync(`${paths.source}/${LOCAL_CARD_IMAGES}`, { recursive: true });
  writeFileSync(`${paths.source}/${LOCAL_CARD_IMAGES}/P-147.webp`, webp("local"));
  const { fetch } = fakeFetch({
    [`${bucket}/BT16-077-Errata.webp`]: webp("errata"),
    [`${bucket}/BT1-001.webp`]: webp("base"),
  });

  const result = await syncCardImages({ ...paths, fetch });

  assert.deepEqual(result.missing, ["BT1-001_P1"]);
});

test("stores a local scan as the sample until an origin publishes the real image", async (t) => {
  const paths = fixture(t, [{ cardId: "BT18-083" }], {
    "BT18-083": [{ artId: "BT18-083_P2", imageId: "BT18-083_P2" }],
  });
  mkdirSync(`${paths.source}/${LOCAL_CARD_IMAGES}`, { recursive: true });
  writeFileSync(`${paths.source}/${LOCAL_CARD_IMAGES}/BT18-083_P2.webp`, webp("local"));
  const origins = { [`${bucket}/BT18-083.webp`]: webp("base") };

  const before = await syncCardImages({ ...paths, fetch: fakeFetch(origins).fetch });
  assert.deepEqual(before, { present: 0, downloaded: 2, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT18-083_P2-Sample.webp`, "utf8").slice(12), "local");

  const after = await syncCardImages({
    ...paths,
    fetch: fakeFetch({ ...origins, [`${bucket}/BT18-083_P2.webp`]: webp("real") }).fetch,
  });
  assert.deepEqual(after, { present: 1, downloaded: 1, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT18-083_P2.webp`, "utf8").slice(12), "real");
  assert.equal(existsSync(`${paths.destination}/BT18-083_P2-Sample.webp`), false);
});

test("refreshes a sample when its local scan changes", async (t) => {
  const paths = fixture(t, [{ cardId: "BT27-040" }]);
  const scan = `${paths.source}/${LOCAL_CARD_IMAGES}/BT27-040.webp`;
  mkdirSync(`${paths.source}/${LOCAL_CARD_IMAGES}`, { recursive: true });
  writeFileSync(scan, webp("uncropped"));
  const { fetch } = fakeFetch({});

  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 0, downloaded: 1, missing: [] });
  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 1, downloaded: 0, missing: [] });

  writeFileSync(scan, webp("cropped"));
  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 0, downloaded: 1, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT27-040-Sample.webp`, "utf8").slice(12), "cropped");
});

test("replaces a watermarked mirror image and its sample with the clean local scan", async (t) => {
  const paths = fixture(t, [{ cardId: "BT22-029" }]);
  const scan = `${paths.source}/${LOCAL_CLEAN_CARD_IMAGES}/BT22-029.webp`;
  mkdirSync(`${paths.source}/${LOCAL_CLEAN_CARD_IMAGES}`, { recursive: true });
  mkdirSync(paths.destination, { recursive: true });
  writeFileSync(scan, webp("clean"));
  writeFileSync(`${paths.destination}/BT22-029.webp`, webp("watermarked"));
  writeFileSync(`${paths.destination}/BT22-029-Sample.webp`, webp("sample"));
  const { fetch, requests } = fakeFetch({ [`${bucket}/BT22-029.webp`]: webp("watermarked") });

  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 0, downloaded: 1, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT22-029.webp`, "utf8").slice(12), "clean");
  assert.equal(existsSync(`${paths.destination}/BT22-029-Sample.webp`), false);
  assert.deepEqual(requests, []);

  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 1, downloaded: 0, missing: [] });

  writeFileSync(scan, webp("recropped"));
  assert.deepEqual(await syncCardImages({ ...paths, fetch }), { present: 0, downloaded: 1, missing: [] });
  assert.equal(readFileSync(`${paths.destination}/BT22-029.webp`, "utf8").slice(12), "recropped");
});

for (const directory of [LOCAL_CARD_IMAGES, LOCAL_CLEAN_CARD_IMAGES]) {
  test(`keeps only ${directory} scans the card catalog still references`, () => {
    const root = new URL("../..", import.meta.url).pathname;
    const referenced = new Set(cardImageIds(root));
    const orphans = readdirSync(`${root}/${directory}`)
      .filter((name) => name.endsWith(".webp"))
      .filter((name) => !referenced.has(name.slice(0, -".webp".length)));
    assert.deepEqual(orphans, []);
  });
}

test("keeps no sample scan for a printing that has a clean scan", () => {
  const root = new URL("../..", import.meta.url).pathname;
  const clean = new Set(readdirSync(`${root}/${LOCAL_CLEAN_CARD_IMAGES}`));
  const superseded = readdirSync(`${root}/${LOCAL_CARD_IMAGES}`).filter((name) => clean.has(name));
  assert.deepEqual(superseded, []);
});
