import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarModeration } from "#api/accounts/avatarClassifier";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

const moderation = vi.hoisted(() => ({ verdict: "unscreened" as AvatarModeration }));
vi.mock("#api/accounts/moderateAvatarImage", () => ({
  moderateAvatarImage: vi.fn<() => Promise<AvatarModeration>>(async () => moderation.verdict),
}));

type Harness = { url: string; cookie: string; accountId: string; store: AccountStore; close: () => Promise<void> };

let harness: Harness;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function png(size = 64): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.alloc(8)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function startHarness(): Promise<Harness> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const account = await store.accountForIdentity("discord", "uploader", "Tamer", null);
  const session = await store.issueSession(account);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    accountId: account.id,
    store,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function upload(body: Buffer, { authenticated = true, type = "image/png" } = {}): Promise<Response> {
  return fetch(`${harness.url}/account/profile/avatar/image`, {
    method: "PUT",
    headers: { "Content-Type": type, ...(authenticated ? { cookie: harness.cookie } : {}) },
    body: new Uint8Array(body),
  });
}

beforeEach(async () => {
  harness = await startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("uploaded profile pictures", () => {
  beforeEach(() => {
    moderation.verdict = "unscreened";
  });

  it("refuses a picture the classifier flags, and stores nothing", async () => {
    moderation.verdict = "nsfw";
    const response = await upload(png());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "nsfw_image" });
    await expect(harness.store.avatarImage(harness.accountId)).resolves.toBeUndefined();
  });

  it("refuses a picture nothing could screen, and stores nothing", async () => {
    moderation.verdict = "unavailable";
    const response = await upload(png());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "moderation_unavailable" });
    await expect(harness.store.avatarImage(harness.accountId)).resolves.toBeUndefined();
  });

  it("stores a picture the classifier passes", async () => {
    moderation.verdict = "safe";
    const response = await upload(png());
    expect(response.status).toBe(200);
    await expect(harness.store.avatarImage(harness.accountId)).resolves.toMatchObject({ contentType: "image/png" });
  });

  it("requires a session", async () => {
    const response = await upload(png(), { authenticated: false });
    expect(response.status).toBe(401);
  });

  it("stores the picture, points the account at it, and serves it with hardened headers", async () => {
    const response = await upload(png());
    expect(response.status).toBe(200);
    const account = (await response.json()) as { avatarSource: string; avatarUrl: string; avatarImageVersion: number };
    expect(account.avatarSource).toBe("upload");
    expect(account.avatarImageVersion).toBe(1);
    expect(account.avatarUrl).toBe(`/account/avatar/${harness.accountId}/image?v=1`);

    const image = await fetch(`${harness.url}${account.avatarUrl}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(image.headers.get("content-security-policy")).toContain("sandbox");
    expect(image.headers.get("cache-control")).toContain("immutable");
    // pg-mem round-trips bytea through text, so byte equality is asserted in avatarImage.test.ts.
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("never lets a versionless URL pin a picture in caches", async () => {
    await upload(png());
    const image = await fetch(`${harness.url}/account/avatar/${harness.accountId}/image`);
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a scriptable or unknown payload by content, not by its declared type", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const response = await upload(svg, { type: "image/png" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("unsupported");
  });

  it("removes the picture on request and falls back to initials", async () => {
    await upload(png());
    const cleared = await fetch(`${harness.url}/account/profile/avatar/image`, {
      method: "DELETE",
      headers: { cookie: harness.cookie },
    });
    expect(((await cleared.json()) as { avatarSource: string }).avatarSource).toBe("initials");
    expect((await fetch(`${harness.url}/account/avatar/${harness.accountId}/image`)).status).toBe(404);
  });

  it("retires the upload when the player picks a preset instead", async () => {
    await upload(png());
    const preset = await fetch(`${harness.url}/account/profile/avatar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: harness.cookie },
      body: JSON.stringify({ avatarId: "greymon" }),
    });
    const account = (await preset.json()) as { avatarSource: string };
    expect(account.avatarSource).toBe("digimon");
    expect((await fetch(`${harness.url}/account/avatar/${harness.accountId}/image`)).status).toBe(404);
  });
});
