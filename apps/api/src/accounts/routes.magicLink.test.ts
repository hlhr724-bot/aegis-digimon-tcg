import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { EmailQuotaExceededError, type Mailer } from "../email/mailer.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";
import type { HumanVerifier } from "#api/accounts/turnstileVerifier";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
  vi.unstubAllEnvs();
});

async function startServer({
  mailer,
  humanVerifier,
}: {
  mailer?: Mailer;
  humanVerifier?: HumanVerifier;
}): Promise<{ store: AccountStore; url: string }> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(
    app,
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mailer,
    undefined,
    undefined,
    undefined,
    humanVerifier,
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  };
  return { store, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function requestMagicLink(mailer: Mailer): Promise<Response> {
  const { url } = await startServer({ mailer });
  return fetch(`${url}/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Tamer@Example.com" }),
  });
}

function postToken(url: string, token: string): Promise<Response> {
  return fetch(`${url}/auth/magic-link/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    redirect: "manual",
  });
}

describe("POST /auth/magic-link", () => {
  it("sends the sign-in link to the normalized address", async () => {
    const mailer = vi.fn<Mailer>(async () => undefined);

    const response = await requestMagicLink(mailer);

    expect(response.status).toBe(202);
    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tamer@example.com",
        html: expect.stringContaining("/auth/magic-link/consume?token="),
      }),
    );
  });

  it("tells the caller when every provider reached its daily limit", async () => {
    const response = await requestMagicLink(async () => {
      throw new EmailQuotaExceededError();
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "email_daily_limit" });
  });

  it("keeps delivery failures private", async () => {
    const response = await requestMagicLink(async () => {
      throw new Error("Resend responded 500");
    });

    expect(response.status).toBe(202);
  });
});

describe("magic link request throttling", () => {
  it("rejects repeated requests before creating a token or sending another email", async () => {
    const mailer = vi.fn<Mailer>(async () => undefined);
    const { store, url } = await startServer({ mailer });
    const tokenCreation = vi.spyOn(store, "createMagicLink");
    const request = () =>
      fetch(`${url}/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Tamer@Example.com" }),
      });
    for (let attempt = 0; attempt < 3; attempt++) expect((await request()).status).toBe(202);
    const rejected = await request();
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "too_many_requests" });
    expect(mailer).toHaveBeenCalledTimes(3);
    expect(tokenCreation).toHaveBeenCalledTimes(3);
    expect((await store.pool.query("SELECT token_hash FROM magic_links")).rowCount).toBe(3);
  });
});

describe("magic link human check", () => {
  it("refuses a request whose human check fails before sending any email", async () => {
    const mailer = vi.fn<Mailer>(async () => undefined);
    const humanVerifier = vi.fn<HumanVerifier>(async () => false);
    const { store, url } = await startServer({ mailer, humanVerifier });
    const tokenCreation = vi.spyOn(store, "createMagicLink");

    const response = await fetch(`${url}/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tamer@example.com", turnstileToken: "bot" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "human_check_failed" });
    expect(humanVerifier).toHaveBeenCalledWith({ token: "bot", ip: expect.any(String) });
    expect(mailer).not.toHaveBeenCalled();
    expect(tokenCreation).not.toHaveBeenCalled();
  });

  it("sends the link once the human check passes", async () => {
    const mailer = vi.fn<Mailer>(async () => undefined);
    const { url } = await startServer({ mailer, humanVerifier: async ({ token }) => token === "human" });

    const response = await fetch(`${url}/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tamer@example.com", turnstileToken: "human" }),
    });

    expect(response.status).toBe(202);
    expect(mailer).toHaveBeenCalledTimes(1);
  });
});

describe("magic link consumption", () => {
  it("allows the configured app origin when redirecting after confirmation", async () => {
    vi.stubEnv("AEGIS_WEB_URL", "http://localhost:5173/play");
    const { store, url } = await startServer({});
    const { token } = await store.createMagicLink("redirect@example.com");
    const opened = await fetch(`${url}/auth/magic-link/consume?token=${token}`);
    expect(opened.headers.get("content-security-policy")).toContain("form-action 'self' http://localhost:5173;");
    const confirmed = await postToken(url, token);
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("location")).toBe("http://localhost:5173/play");
    expect(confirmed.headers.get("content-security-policy")).toContain("form-action 'self' http://localhost:5173;");
  });

  it("keeps the link usable when an email scanner opens it", async () => {
    const { store, url } = await startServer({});
    const { token } = await store.createMagicLink("tamer@example.com");

    for (const method of ["GET", "HEAD", "GET"]) {
      const opened = await fetch(`${url}/auth/magic-link/consume?token=${token}`, { method });
      expect(opened.status).toBe(200);
      expect(opened.headers.get("set-cookie")).toBeNull();
    }

    const page = await (await fetch(`${url}/auth/magic-link/consume?token=${token}`)).text();
    expect(page).toContain(`name="token" value="${token}"`);
    expect(page).toContain('method="post"');
  });

  it("signs the player in when they confirm, then rejects the used link", async () => {
    const { store, url } = await startServer({});
    const { token } = await store.createMagicLink("tamer@example.com");

    const confirmed = await postToken(url, token);

    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("set-cookie")).toContain("aegis_session=");
    expect((await postToken(url, token)).status).toBe(410);
    const reopened = await fetch(`${url}/auth/magic-link/consume?token=${token}`);
    expect(reopened.status).toBe(410);
    expect(await reopened.text()).toContain("expired or was already used");
  });

  it("explains an unknown link instead of offering a sign-in button", async () => {
    const { url } = await startServer({});

    const response = await fetch(`${url}/auth/magic-link/consume?token=%22%3E%3Cscript%3E`);

    expect(response.status).toBe(410);
    const page = await response.text();
    expect(page).not.toContain("<script>");
    expect(page).not.toContain('method="post"');
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
