import { createRequire } from "node:module";
import { createServer, get as httpGet } from "node:http";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGateway, isApiPath } from "./gateway.mjs";
import gameMessageLimits from "../../packages/shared/src/protocol/gameMessageLimits.json" with { type: "json" };

const { WebSocketServer, WebSocket } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("ws");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

test("cutover retains established sockets, routes reconnect to the old owner, and keeps old assets", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  const servers = [];
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
    rmSync(state, { recursive: true });
  });
  for (const directory of ["routing", "assets", "releases/v1/web", "releases/v2/web", "releases/web-v3/web"])
    mkdirSync(`${state}/${directory}`, { recursive: true });
  writeFileSync(`${state}/releases/v1/web/index.html`, "old web");
  writeFileSync(`${state}/releases/v2/web/index.html`, "new web");
  writeFileSync(`${state}/releases/web-v3/web/index.html`, "independent web");
  writeFileSync(`${state}/assets/old-abc123.js`, "old chunk");
  writeFileSync(`${state}/admin-token`, "private secret");
  const publish = (active, draining, webRevision) => {
    writeFileSync(
      `${state}/routing/next.json`,
      JSON.stringify({ version: 1, active, draining, ...(webRevision ? { webRevision } : {}) }),
    );
    renameSync(`${state}/routing/next.json`, `${state}/routing/manifest.json`);
  };
  const origins = new Map();
  for (const slot of ["blue", "green", "g-333333333333", "red"]) {
    for (const index of [1, 2, 3]) {
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/ready") return response.end(JSON.stringify({ status: "ready" }));
        if (request.url === "/matchmake/reconnect/message-limit") {
          let bytes = 0;
          request.on("data", (chunk) => {
            bytes += chunk.length;
          });
          request.on("end", () => response.end(JSON.stringify({ bytes })));
          return;
        }
        if (request.url === "/matchmake/reconnect/old-room" && slot === "green") {
          response.statusCode = 400;
          return response.end(JSON.stringify({ code: 4212 }));
        }
        response.end(JSON.stringify({ slot, index, path: request.url, forwarded: request.headers["x-forwarded-for"] }));
      });
      const wss = new WebSocketServer({ server });
      wss.on("connection", (socket, request) => {
        sockets.push(socket);
        socket.on("message", (message) => socket.send(`${slot}:${index}:${request.url}:${message}`));
      });
      servers.push(server);
      origins.set(`${slot}:${index}`, await listen(server));
    }
  }
  publish({ slot: "blue", revision: "v1" }, []);
  const gateway = createGateway({ state, upstreamFor: (slot, index) => origins.get(`${slot}:${index}`) });
  servers.push(gateway);
  const origin = await listen(gateway);
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/api/blue/p2/process/old-room?sessionId=one");
  sockets.push(socket);
  await once(socket, "open");
  const echo = async (message) => {
    const receipt = once(socket, "message");
    socket.send(message);
    return String((await receipt)[0]);
  };
  assert.match(await echo("before"), /^blue:2:.*:before$/);
  publish({ slot: "green", revision: "v2" }, [{ slot: "blue", revision: "v1" }]);
  assert.match(await echo("after"), /^blue:2:.*:after$/);
  assert.equal(socket.readyState, WebSocket.OPEN);
  assert.equal(await (await fetch(origin)).text(), "new web");
  assert.equal(await (await fetch(`${origin}/assets/old-abc123.js`)).text(), "old chunk");
  const reconnected = new WebSocket(
    origin.replace("http:", "ws:") + "/api/blue/p2/process/old-room?sessionId=reconnect",
  );
  sockets.push(reconnected);
  await once(reconnected, "open");
  const receipt = once(reconnected, "message");
  reconnected.send("resumed");
  assert.match(String((await receipt)[0]), /^blue:2:.*:resumed$/);
  assert.equal((await fetch(`${origin}/api/blue/matchmake/create/aegis`, { method: "POST" })).status, 503);
  assert.equal((await fetch(`${origin}/api/blue/p1/matchmake/joinOrCreate/aegis`, { method: "POST" })).status, 503);
  const oldJoin = await (await fetch(`${origin}/api/blue/matchmake/joinById/old-room`, { method: "POST" })).json();
  assert.equal(oldJoin.slot, "blue");
  const created = await (await fetch(`${origin}/api/green/matchmake/create/aegis`, { method: "POST" })).json();
  assert.equal(created.slot, "green");
  const legacy = await (await fetch(`${origin}/matchmake/reconnect/old-room`, { method: "POST", body: "{}" })).json();
  assert.equal(legacy.slot, "blue");
  const largeBody = JSON.stringify({ text: "x".repeat(gameMessageLimits.maxMessageBytes - 11) });
  const acceptedLarge = await fetch(`${origin}/matchmake/reconnect/message-limit`, { method: "POST", body: largeBody });
  assert.equal(acceptedLarge.status, 200);
  assert.equal((await acceptedLarge.json()).bytes, gameMessageLimits.maxMessageBytes);
  const rejectedLarge = await fetch(`${origin}/matchmake/reconnect/message-limit`, {
    method: "POST",
    body: `${largeBody} `,
  });
  assert.equal(rejectedLarge.status, 413);
  assert.equal((await rejectedLarge.json()).maxMessageBytes, gameMessageLimits.maxMessageBytes);
  const failedActive = servers[3];
  await new Promise((done) => failedActive.close(done));
  const legacyDuringRestart = await (
    await fetch(`${origin}/matchmake/reconnect/old-room`, { method: "POST", body: "{}" })
  ).json();
  assert.equal(legacyDuringRestart.slot, "blue");
  assert.equal((await fetch(`${origin}/api/blue/p1/deployment/status`)).status, 404);
  assert.equal((await fetch(`${origin}/deployment/status`)).status, 404);
  assert.equal((await fetch(`${origin}/assets/%2e%2e%2fadmin-token`)).status, 404);
  // A double slash in a stripped path must never replace the configured upstream host.
  const doubled = await (await fetch(`${origin}/api/green//evil.example/health`)).json();
  assert.equal(doubled.slot, "green");
  assert.equal(doubled.path, "//evil.example/health");
  const manifest = await fetch(`${origin}/deployment/manifest.json`);
  assert.equal(manifest.headers.get("cache-control"), "no-store");
  assert.equal((await manifest.json()).active.slot, "green");
  await Promise.all([servers[4], servers[5]].map((server) => new Promise((done) => server.close(done))));
  await new Promise((done) => setTimeout(done, 2100));
  const legacyDuringOutage = await (
    await fetch(`${origin}/matchmake/reconnect/old-room`, { method: "POST", body: "{}" })
  ).json();
  assert.equal(legacyDuringOutage.slot, "blue");
  publish(
    { slot: "g-333333333333", revision: "v3" },
    [
      { slot: "green", revision: "v2" },
      { slot: "blue", revision: "v1" },
    ],
    "web-v3",
  );
  await new Promise((done) => setTimeout(done, 2100));
  const dynamic = await fetch(`${origin}/api/g-333333333333/matchmake/create/aegis`, { method: "POST" });
  assert.equal(dynamic.status, 200);
  assert.equal((await dynamic.json()).slot, "g-333333333333");
  assert.equal(await (await fetch(origin)).text(), "independent web");
  const currentManifest = await (await fetch(`${origin}/deployment/manifest.json`)).json();
  assert.equal(currentManifest.active.slot, "g-333333333333");
  const legacyBundleManifest = await (
    await fetch(`${origin}/deployment/manifest.json`, { headers: { "x-aegis-web-revision": "v2" } })
  ).json();
  assert.deepEqual(legacyBundleManifest, {
    version: 1,
    active: { slot: "green", revision: "web-v3" },
    draining: [],
  });
  publish(
    { slot: "red", revision: "v4" },
    [
      { slot: "g-333333333333", revision: "v3" },
      { slot: "green", revision: "v2" },
      { slot: "blue", revision: "v1" },
    ],
    "web-v4",
  );
  await new Promise((done) => setTimeout(done, 2100));
  const red = await (await fetch(`${origin}/api/red/matchmake/create/aegis`, { method: "POST" })).json();
  assert.equal(red.slot, "red");
  const oldGeneration = await (await fetch(`${origin}/api/g-333333333333/p2/health`)).json();
  assert.equal(oldGeneration.slot, "g-333333333333");
  const migratedManifest = await (await fetch(`${origin}/deployment/manifest.json`)).json();
  assert.equal(migratedManifest.active.slot, "red");
  assert.equal(migratedManifest.draining[0].slot, "g-333333333333");
  const providerPath = "/deck-providers/digilab/meta?format=EX13&perPage=25";
  const providerResponse = await fetch(`${origin}${providerPath}`);
  assert.match(providerResponse.headers.get("content-type"), /application\/json/);
  const providerResult = await providerResponse.json();
  assert.equal(providerResult.slot, "red");
  assert.equal(providerResult.path, providerPath);
});

test("community API calls reach the API while page navigation gets the web app", () => {
  const api = { accept: "application/json" };
  assert.equal(isApiPath("/community/decks", api), true);
  assert.equal(isApiPath("/community/publications/deck-1", {}), true);
  assert.equal(isApiPath("/community", { accept: "text/html,application/xhtml+xml" }), false);
  assert.equal(isApiPath("/communityish", api), false);
  assert.equal(isApiPath("/roadmap/7", api), true);
  assert.equal(isApiPath("/roadmap", { accept: "text/html,application/xhtml+xml" }), false);
});

test("tournament circuit API calls reach the API even when the browser accepts HTML", () => {
  assert.equal(isApiPath("/tournament-circuits", { accept: "application/json" }), true);
  assert.equal(isApiPath("/tournament-circuits/circuit-1/leaderboard", { accept: "text/html" }), true);
  assert.equal(isApiPath("/tournament-circuitsish", {}), false);
  assert.equal(isApiPath("/tournaments/circuits/circuit-1", { accept: "text/html,application/xhtml+xml" }), false);
});

test("feedback API reaches the API while the admin screen reaches the web app", () => {
  assert.equal(isApiPath("/account/feedback", { accept: "*/*" }), true);
  assert.equal(isApiPath("/admin/feedback", { accept: "text/html" }), false);
});

test("static guides coexist with replay API routing and missing guides do not become SPA pages", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-guide-gateway-`);
  mkdirSync(`${state}/routing`, { recursive: true });
  const web = `${state}/releases/web-v1/web`;
  mkdirSync(`${web}/strategy-guides/glowing-dawn`, { recursive: true });
  writeFileSync(`${web}/index.html`, "React application");
  writeFileSync(`${web}/strategy-guides/index.html`, "Guide catalog");
  writeFileSync(`${web}/strategy-guides/glowing-dawn/index.html`, "Glowing Dawn guide");
  writeFileSync(`${web}/strategy-guides/guides.css`, "body { color: black; }");
  writeFileSync(`${web}/strategy-guides/sitemap.xml`, "<urlset />");
  writeFileSync(`${web}/robots.txt`, "Sitemap: https://aegis-digi.online/strategy-guides/sitemap.xml\n");
  writeFileSync(`${web}/strategy-guides/evidence.json`, '{"simulations":256}');
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({
      version: 1,
      active: { slot: "blue", revision: "api-v1" },
      draining: [],
      webRevision: "web-v1",
    }),
  );
  const upstream = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ path: request.url }));
  });
  const upstreamOrigin = await listen(upstream);
  const gateway = createGateway({ state, upstreamFor: () => upstreamOrigin });
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    await new Promise((done) => upstream.close(done));
    rmSync(state, { recursive: true });
  });
  const origin = await listen(gateway);
  for (const path of ["/strategy-guides", "/strategy-guides/"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await response.text(), "Guide catalog");
  }
  const guide = await fetch(`${origin}/strategy-guides/glowing-dawn/?utm_source=home`);
  assert.equal(await guide.text(), "Glowing Dawn guide");
  const head = await fetch(`${origin}/strategy-guides/glowing-dawn/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(Buffer.byteLength("Glowing Dawn guide")));
  assert.equal(await head.text(), "");
  assert.equal((await fetch(`${origin}/strategy-guides/missing/`)).status, 404);
  assert.equal(await (await fetch(`${origin}/play?utm_source=strategy-guides`)).text(), "React application");
  const replay = await fetch(`${origin}/replays/example`, { headers: { accept: "application/json" } });
  assert.deepEqual(await replay.json(), { path: "/replays/example" });
  assert.equal(
    await (await fetch(`${origin}/replays/example`, { headers: { accept: "text/html" } })).text(),
    "React application",
  );
  const css = await fetch(`${origin}/strategy-guides/guides.css`);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  const sitemap = await fetch(`${origin}/strategy-guides/sitemap.xml`);
  assert.equal(sitemap.headers.get("content-type"), "application/xml; charset=utf-8");
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.match(await robots.text(), /^Sitemap: https:\/\/aegis-digi\.online\/strategy-guides\/sitemap\.xml\n$/);
  assert.deepEqual(await (await fetch(`${origin}/strategy-guides/evidence.json`)).json(), { simulations: 256 });
});

test("story progress reaches the API while the story screen reaches the web app", () => {
  assert.equal(isApiPath("/story/progress", { accept: "*/*" }), true);
  assert.equal(isApiPath("/play/story", { accept: "text/html" }), false);
});

test("shared replay API calls reach the API while page navigation gets the web app", () => {
  assert.equal(isApiPath("/replays/replay-1", { accept: "application/json" }), true);
  assert.equal(isApiPath("/replays/replay-1/file", {}), true);
  assert.equal(isApiPath("/replays/replay-1", { accept: "text/html,application/xhtml+xml" }), false);
});

test("ranked API calls reach the API while the ranked screen reaches the web app", () => {
  assert.equal(isApiPath("/ranked/leaderboard", { accept: "application/json" }), true);
  assert.equal(isApiPath("/ranked/reports", {}), true);
  assert.equal(isApiPath("/ranked", { accept: "text/html,application/xhtml+xml" }), false);
  assert.equal(isApiPath("/play/ranked", { accept: "text/html" }), false);
  assert.equal(isApiPath("/rankedish", { accept: "application/json" }), false);
});

test("achievement API calls reach the API", () => {
  assert.equal(isApiPath("/achievements/trophies", { accept: "*/*" }), true);
  assert.equal(isApiPath("/achievementsish", { accept: "*/*" }), false);
});

test("trophy images reach the web app", () => {
  assert.equal(isApiPath("/trophies/trophy-gold-128.webp", { accept: "image/webp" }), false);
});

test("friends API calls reach the API while friends navigation gets the web app", () => {
  for (const path of ["/friends", "/friends/requests", "/friends/account-1/detail", "/friends/account-1/replays"]) {
    assert.equal(isApiPath(path, { accept: "application/json" }), true);
    assert.equal(isApiPath(path, { accept: "*/*" }), true);
    assert.equal(isApiPath(path, {}), true);
  }
  assert.equal(isApiPath("/friends", { accept: "text/html,application/xhtml+xml" }), false);
  assert.equal(isApiPath("/friendship", {}), false);
});

test("social presence and direct messages always reach the API", () => {
  for (const path of [
    "/social/join",
    "/messages/account-1",
    "/messages/message-1/report",
    "/spectate/friend",
    "/account/blocks",
  ]) {
    assert.equal(isApiPath(path, {}), true);
    assert.equal(isApiPath(path, { accept: "text/html" }), true);
  }
  assert.equal(isApiPath("/socialize", {}), false);
  assert.equal(isApiPath("/messages-page", {}), false);
});

test("static files use the best precompressed variant the client accepts", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  const gateway = createGateway({ state, upstreamFor: () => undefined });
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    rmSync(state, { recursive: true });
  });
  for (const directory of ["routing", "assets", "releases/v1/web"]) {
    mkdirSync(`${state}/${directory}`, { recursive: true });
  }
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "blue", revision: "v1" }, draining: [] }),
  );
  writeFileSync(`${state}/releases/v1/web/index.html`, "web");
  writeFileSync(`${state}/assets/chunk.js`, "plain");
  writeFileSync(`${state}/assets/chunk.js.br`, "brotli");
  writeFileSync(`${state}/assets/chunk.js.gz`, "gzipped");
  const origin = await listen(gateway);
  const fetchRaw = (acceptEncoding) =>
    new Promise((done, fail) => {
      const headers = acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding };
      httpGet(`${origin}/assets/chunk.js`, { headers }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => done({ body, headers: response.headers }));
      }).on("error", fail);
    });

  const brotli = await fetchRaw("gzip, deflate, br");
  assert.equal(brotli.body, "brotli");
  assert.equal(brotli.headers["content-encoding"], "br");
  assert.equal(brotli.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(brotli.headers.vary, "accept-encoding");

  const gzip = await fetchRaw("gzip, br;q=0");
  assert.equal(gzip.body, "gzipped");
  assert.equal(gzip.headers["content-encoding"], "gzip");

  const plain = await fetchRaw(undefined);
  assert.equal(plain.body, "plain");
  assert.equal(plain.headers["content-encoding"], undefined);
});

test("client error reports reach the API through the bug report route", () => {
  assert.equal(isApiPath("/bug-reports/client-errors", { accept: "*/*" }), true);
});

test("source maps are never served even when one reaches a served directory", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  const gateway = createGateway({ state, upstreamFor: () => undefined });
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    rmSync(state, { recursive: true });
  });
  for (const directory of ["routing", "assets", "releases/v1/web"]) {
    mkdirSync(`${state}/${directory}`, { recursive: true });
  }
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "blue", revision: "v1" }, draining: [] }),
  );
  writeFileSync(`${state}/releases/v1/web/index.html`, "web");
  writeFileSync(`${state}/assets/chunk.js.map`, "{}");
  const origin = await listen(gateway);
  const response = await fetch(`${origin}/assets/chunk.js.map`);
  assert.equal(response.status, 404);
});

test("static files are cached by content version and media revalidates without a body", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  const gateway = createGateway({ state, upstreamFor: () => undefined });
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    rmSync(state, { recursive: true });
  });
  for (const directory of ["routing", "assets", "releases/v1/web/sleeves", "releases/v1/web/audio"]) {
    mkdirSync(`${state}/${directory}`, { recursive: true });
  }
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "blue", revision: "v1" }, draining: [] }),
  );
  writeFileSync(`${state}/releases/v1/web/index.html`, "web");
  writeFileSync(`${state}/releases/v1/web/sleeves/standard.webp`, "sleeve");
  writeFileSync(`${state}/releases/v1/web/audio/bank.flac`, "bank");
  writeFileSync(`${state}/releases/v1/web/data.json`, "{}");
  writeFileSync(`${state}/assets/chunk.js`, "chunk");
  const origin = await listen(gateway);

  const page = await fetch(`${origin}/?v=1`);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("etag"), null);
  assert.equal((await fetch(`${origin}/deck/1`)).headers.get("cache-control"), "no-store");

  const versioned = await fetch(`${origin}/audio/bank.flac?v=abc123`);
  assert.equal(versioned.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(versioned.headers.get("content-type"), "audio/flac");
  assert.equal(
    (await fetch(`${origin}/assets/chunk.js`)).headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal((await fetch(`${origin}/data.json`)).headers.get("cache-control"), "no-cache");

  const sleeve = await fetch(`${origin}/sleeves/standard.webp`);
  const entityTag = sleeve.headers.get("etag");
  const modified = sleeve.headers.get("last-modified");
  assert.equal(sleeve.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(await sleeve.text(), "sleeve");
  assert.match(entityTag, /^W\/".+"$/);

  const unchanged = await fetch(`${origin}/sleeves/standard.webp`, { headers: { "if-none-match": entityTag } });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("etag"), entityTag);
  assert.equal(await unchanged.text(), "");
  const unchangedSince = await fetch(`${origin}/sleeves/standard.webp`, { headers: { "if-modified-since": modified } });
  assert.equal(unchangedSince.status, 304);

  const stale = await fetch(`${origin}/sleeves/standard.webp`, {
    headers: { "if-none-match": 'W/"other"', "if-modified-since": modified },
  });
  assert.equal(stale.status, 200);
  assert.equal(await stale.text(), "sleeve");
});

test("page reload floods from one client are throttled without affecting other clients or assets", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  let time = 0;
  const gateway = createGateway({
    state,
    upstreamFor: () => undefined,
    pageLoadLimit: { requests: 2, windowMs: 10_000 },
    now: () => time,
  });
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    rmSync(state, { recursive: true });
  });
  for (const directory of ["routing", "assets", "releases/v1/web"]) {
    mkdirSync(`${state}/${directory}`, { recursive: true });
  }
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "blue", revision: "v1" }, draining: [] }),
  );
  writeFileSync(`${state}/releases/v1/web/index.html`, "web");
  writeFileSync(`${state}/assets/chunk.js`, "chunk");
  const origin = await listen(gateway);
  const loadPage = (client) =>
    fetch(`${origin}/decks`, { headers: { "sec-fetch-dest": "document", "x-forwarded-for": client } });

  assert.equal((await loadPage("203.0.113.7")).status, 200);
  assert.equal((await loadPage("203.0.113.7")).status, 200);
  time = 4_000;
  const throttled = await loadPage("203.0.113.7");
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get("retry-after"), "6");
  assert.equal(throttled.headers.get("cache-control"), "no-store");

  assert.equal((await loadPage("198.51.100.4")).status, 200);
  const asset = await fetch(`${origin}/assets/chunk.js`, { headers: { "x-forwarded-for": "203.0.113.7" } });
  assert.equal(asset.status, 200);

  time = 10_000;
  assert.equal((await loadPage("203.0.113.7")).status, 200);
});

async function waitForLine(lines, matches, description) {
  const deadline = Date.now() + 2000;
  while (!lines.some(matches)) {
    assert.ok(Date.now() < deadline, `${description}: ${JSON.stringify(lines.slice(-3))}`);
    await new Promise((done) => setTimeout(done, 20));
  }
  return lines.find(matches);
}

test("health report logs event loop lag, open game sockets, and CPU throttling", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-gateway-`);
  mkdirSync(`${state}/routing`, { recursive: true });
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "blue", revision: "v1" }, draining: [] }),
  );
  const cpuStatPath = `${state}/cpu.stat`;
  writeFileSync(cpuStatPath, "usage_usec 10\nnr_periods 5\nnr_throttled 2\nthrottled_usec 3000\n");
  const upstream = createServer((request, response) => response.end("{}"));
  const wss = new WebSocketServer({ server: upstream });
  const upstreamOrigin = await listen(upstream);
  const lines = [];
  const gateway = createGateway({
    state,
    upstreamFor: () => upstreamOrigin,
    healthReport: { intervalMs: 50, cpuStatPath, log: (line) => lines.push(JSON.parse(line)) },
  });
  const origin = await listen(gateway);
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/api/blue/p1/room?sessionId=one");
  t.after(async () => {
    socket.terminate();
    for (const client of wss.clients) client.terminate();
    await Promise.all([gateway, upstream].map((server) => new Promise((done) => server.close(done))));
    rmSync(state, { recursive: true });
  });
  await once(socket, "open");

  const connected = await waitForLine(lines, (line) => line.webSockets === 1, "open socket not counted");
  assert.equal(connected.event, "gateway.health");
  assert.ok(Number.isInteger(connected.loopMaxMs) && connected.loopMaxMs >= 0);
  assert.ok(Number.isInteger(connected.loopP99Ms) && Number.isInteger(connected.loopMeanMs));

  writeFileSync(cpuStatPath, "usage_usec 20\nnr_periods 9\nnr_throttled 6\nthrottled_usec 9500\n");
  const throttled = await waitForLine(lines, (line) => line.throttledPeriods === 4, "throttling delta missing");
  assert.equal(throttled.throttledMs, 7);

  socket.close();
  await once(socket, "close");
  const closedAt = lines.length;
  await waitForLine(lines, (line, index) => index >= closedAt && line.webSockets === 0, "closed socket counted");
});

test("tournament game authorization always reaches the API", () => {
  assert.equal(isApiPath("/series/game-series/authorize-game", {}), true);
  assert.equal(isApiPath("/series/game-series/authorize-game", { accept: "text/html" }), true);
});

test("tournament authorization forwards to the API instead of returning the site HTML", async (t) => {
  const state = mkdtempSync(`${tmpdir()}/aegis-tournament-gateway-`);
  mkdirSync(`${state}/routing`, { recursive: true });
  mkdirSync(`${state}/releases/v1/web`, { recursive: true });
  writeFileSync(`${state}/releases/v1/web/index.html`, "<html>game site</html>");
  writeFileSync(
    `${state}/routing/manifest.json`,
    JSON.stringify({ version: 1, active: { slot: "green", revision: "v1" }, draining: [] }),
  );
  const api = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.statusCode = request.url === "/ready" ? 200 : 401;
    response.end(JSON.stringify({ error: "unauthorized", path: request.url }));
  });
  const apiOrigin = await listen(api);
  const gateway = createGateway({ state, upstreamFor: () => apiOrigin });
  const origin = await listen(gateway);
  t.after(async () => {
    await new Promise((done) => gateway.close(done));
    await new Promise((done) => api.close(done));
    rmSync(state, { recursive: true });
  });
  const response = await fetch(`${origin}/series/test-series/authorize-game`, { method: "POST" });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal((await response.json()).path, "/series/test-series/authorize-game");
});
