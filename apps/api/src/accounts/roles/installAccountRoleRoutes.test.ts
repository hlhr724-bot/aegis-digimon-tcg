import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountRole } from "@aegis/shared/account/AccountRole";
import type { RoleHolder } from "@aegis/shared/account/RoleHolder";
import { AccountStore } from "#api/accounts/AccountStore";
import { AccountRoleStore } from "#api/accounts/roles/AccountRoleStore";
import { installAccountRoleRoutes } from "#api/accounts/roles/installAccountRoleRoutes";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

type SignInParams = { name: string; roles?: AccountRole[] };
type CallParams = { method?: string; cookie?: string; body?: unknown };
type RoleResponse = { accounts: RoleHolder[]; account: RoleHolder; error: string };

let accounts: AccountStore;
let server: Server;
let url: string;

async function signIn({ name, roles = [] }: SignInParams) {
  const account = await accounts.accountForIdentity("discord", name, name);
  await accounts.pool.query("UPDATE accounts SET roles=$2 WHERE id=$1", [account.id, roles]);
  return { id: account.id, cookie: `aegis_session=${(await accounts.issueSession(account)).id}` };
}

async function call(path: string, { method = "GET", cookie, body }: CallParams = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as RoleResponse };
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoleRoutes({
    app,
    store: new AccountRoleStore(accounts),
    session: (req) => accounts.session(/aegis_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]),
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await accounts.close();
});

describe("account role administration", () => {
  it("lets only admins search and change roles", async () => {
    const judge = await signIn({ name: "Judge", roles: [AccountRole.JUDGE.value] });
    const player = await signIn({ name: "Player" });
    expect((await call("/account/admin/roles")).status).toBe(401);
    for (const cookie of [judge.cookie, player.cookie]) {
      expect((await call("/account/admin/roles", { cookie })).status).toBe(403);
      const update = await call(`/account/admin/roles/${player.id}`, {
        method: "PUT",
        cookie,
        body: { roles: [AccountRole.ADMIN.value] },
      });
      expect(update.status).toBe(403);
    }
  });

  it("lists role holders by default and finds any account by display name", async () => {
    const admin = await signIn({ name: "Admin", roles: [AccountRole.ADMIN.value] });
    await signIn({ name: "Judge Ana", roles: [AccountRole.JUDGE.value] });
    await signIn({ name: "Player_one" });
    await signIn({ name: "Playerxone" });
    const holders = await call("/account/admin/roles", { cookie: admin.cookie });
    expect(holders.body.accounts.map((holder) => holder.displayName)).toEqual(["Admin", "Judge Ana"]);
    const search = await call("/account/admin/roles?query=player_", { cookie: admin.cookie });
    expect(search.body.accounts).toEqual([expect.objectContaining({ displayName: "Player_one", roles: [] })]);
  });

  it("replaces an account's roles and reflects them in its session", async () => {
    const admin = await signIn({ name: "Admin", roles: [AccountRole.ADMIN.value] });
    const player = await signIn({ name: "Player" });
    const roles = [AccountRole.JUDGE.value, AccountRole.ORGANIZER.value, AccountRole.JUDGE.value];
    const updated = await call(`/account/admin/roles/${player.id}`, {
      method: "PUT",
      cookie: admin.cookie,
      body: { roles },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.account.roles).toEqual([AccountRole.JUDGE.value, AccountRole.ORGANIZER.value]);
    const session = await accounts.session(/aegis_session=(.+)/.exec(player.cookie)?.[1]);
    expect(session?.account.roles).toEqual([AccountRole.JUDGE.value, AccountRole.ORGANIZER.value]);
    expect(session?.account.isAdmin).toBe(false);
  });

  it("refuses unknown roles, unknown accounts and removing your own admin role", async () => {
    const admin = await signIn({ name: "Admin", roles: [AccountRole.ADMIN.value] });
    for (const roles of [["constructor"], "judge", [1], null]) {
      const response = await call(`/account/admin/roles/${admin.id}`, {
        method: "PUT",
        cookie: admin.cookie,
        body: { roles },
      });
      expect(response.status).toBe(400);
    }
    const missing = await call("/account/admin/roles/00000000-0000-4000-8000-000000000009", {
      method: "PUT",
      cookie: admin.cookie,
      body: { roles: [] },
    });
    expect(missing.status).toBe(404);
    const demoted = await call(`/account/admin/roles/${admin.id}`, {
      method: "PUT",
      cookie: admin.cookie,
      body: { roles: [AccountRole.JUDGE.value] },
    });
    expect(demoted.status).toBe(409);
    expect((await accounts.account(admin.id))?.roles).toEqual([AccountRole.ADMIN.value]);
  });
});
