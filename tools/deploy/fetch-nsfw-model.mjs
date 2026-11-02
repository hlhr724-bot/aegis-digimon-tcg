#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPOSITORY = "ICIJ/nsfw-image-detection-384-onnx";
const REVISION = "4f63fac119fb24a9d98393e57549b1427530ca52";
const FILE = "marqo-nsfw-384.onnx";
const SHA256 = "50256dde930a4ceeb8953246ba7345158e02cc0a201a173402ab3e6e3a76f40a";

const destination = resolve(process.argv[2] ?? "/models/nsfw.onnx");
const url = `https://huggingface.co/${REPOSITORY}/resolve/${REVISION}/${FILE}`;

async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const existing = await stat(destination).catch(() => undefined);
if (existing?.isFile()) {
  if ((await digest(destination)) === SHA256) {
    console.log(`[nsfw-model] already present: ${destination}`);
    process.exit(0);
  }
  console.warn(`[nsfw-model] digest mismatch on ${destination}; fetching again`);
}

await mkdir(dirname(destination), { recursive: true });
const partial = `${destination}.partial`;
console.log(`[nsfw-model] downloading ${url}`);
const response = await fetch(url, { redirect: "follow" });
if (!response.ok || !response.body) throw new Error(`[nsfw-model] download failed: HTTP ${response.status}`);
await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));

const fetched = await digest(partial);
if (fetched !== SHA256) {
  await rm(partial, { force: true });
  throw new Error(`[nsfw-model] digest mismatch: expected ${SHA256}, got ${fetched}`);
}
await rename(partial, destination);
console.log(`[nsfw-model] ready: ${destination} (${SHA256.slice(0, 12)})`);
