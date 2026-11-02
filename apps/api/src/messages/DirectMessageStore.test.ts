import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";
import { DirectMessageStore } from "#api/messages/DirectMessageStore";
import { CHAT_COOLDOWN_MS, CHAT_TEXT_MAX_LENGTH } from "@aegis/shared/protocol/chat";

let accounts: AccountStore;
let sender: Account;
let recipient: Account;
let stranger: Account;
let store: DirectMessageStore;
let now: number;
beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  sender = await accounts.accountForIdentity("email", "sender@test.invalid", "Sender");
  recipient = await accounts.accountForIdentity("email", "recipient@test.invalid", "Recipient");
  stranger = await accounts.accountForIdentity("email", "stranger@test.invalid", "Stranger");
  const friends = new FriendStore(accounts);
  await friends.request({ accountId: sender.id, displayName: recipient.displayName });
  await friends.accept({ accountId: recipient.id, otherId: sender.id });
  now = Date.now();
  store = new DirectMessageStore(accounts, () => now);
});
afterEach(async () => {
  await accounts.close();
});

describe("private friend conversations", () => {
  it("persists a message for both participants and tracks recipient read receipts", async () => {
    const message = await store.send({ accountId: sender.id, friendId: recipient.id, body: "Hello!" });
    expect(message).toMatchObject({ body: "Hello!", readAt: null });
    expect(await store.list({ accountId: recipient.id, friendId: sender.id })).toEqual([message]);
    expect(await store.conversations(recipient.id)).toEqual([{ friendId: sender.id, unread: 1, lastMessage: message }]);
    expect(await store.markRead({ accountId: recipient.id, friendId: sender.id })).toBe(now);
    expect(await store.conversations(recipient.id)).toMatchObject([{ friendId: sender.id, unread: 0 }]);
    expect(await store.conversations(sender.id)).toMatchObject([
      { friendId: recipient.id, unread: 0, lastMessage: { body: "Hello!", readAt: now } },
    ]);
    expect(await store.list({ accountId: sender.id, friendId: recipient.id })).toMatchObject([{ readAt: now }]);
  });
  it("denies strangers and revokes reads and writes after blocking in either direction", async () => {
    expect(await store.send({ accountId: stranger.id, friendId: recipient.id, body: "Hi" })).toBeUndefined();
    expect(await store.list({ accountId: stranger.id, friendId: sender.id })).toBeUndefined();
    await store.send({ accountId: sender.id, friendId: recipient.id, body: "Hi" });
    await new BlockStore(accounts).block({ accountId: recipient.id, otherId: sender.id });
    now += CHAT_COOLDOWN_MS;
    expect(await store.send({ accountId: sender.id, friendId: recipient.id, body: "Hi again" })).toBeUndefined();
    expect(await store.send({ accountId: recipient.id, friendId: sender.id, body: "Hi again" })).toBeUndefined();
    expect(await store.list({ accountId: recipient.id, friendId: sender.id })).toBeUndefined();
    expect(await store.conversations(recipient.id)).toEqual([]);
  });
  it("summarizes the latest message of each conversation", async () => {
    await store.send({ accountId: sender.id, friendId: recipient.id, body: "First" });
    now += CHAT_COOLDOWN_MS;
    await store.send({ accountId: sender.id, friendId: recipient.id, body: "Second" });
    now += CHAT_COOLDOWN_MS;
    const reply = await store.send({ accountId: recipient.id, friendId: sender.id, body: "Reply" });
    expect(await store.conversations(recipient.id)).toEqual([{ friendId: sender.id, unread: 2, lastMessage: reply }]);
    expect(await store.conversations(sender.id)).toEqual([{ friendId: recipient.id, unread: 1, lastMessage: reply }]);
  });
  it("normalizes text, bounds length and enforces sender cooldown across store instances", async () => {
    expect(await store.send({ accountId: sender.id, friendId: recipient.id, body: "   " })).toBeUndefined();
    expect(
      await store.send({
        accountId: sender.id,
        friendId: recipient.id,
        body: "x".repeat(CHAT_TEXT_MAX_LENGTH * 4 + 1),
      }),
    ).toBeUndefined();
    expect(await store.send({ accountId: sender.id, friendId: recipient.id, body: " Hello\nworld " })).toMatchObject({
      body: "Hello world",
    });
    expect(
      await new DirectMessageStore(accounts, () => now).send({
        accountId: sender.id,
        friendId: recipient.id,
        body: "Too fast",
      }),
    ).toBeUndefined();
    now += CHAT_COOLDOWN_MS;
    expect(
      await store.send({ accountId: sender.id, friendId: recipient.id, body: "x".repeat(CHAT_TEXT_MAX_LENGTH + 10) }),
    ).toMatchObject({ body: "x".repeat(CHAT_TEXT_MAX_LENGTH) });
  });
  it("masks blocked words before persistence", async () => {
    const message = await store.send({ accountId: sender.id, friendId: recipient.id, body: "fuck" });
    expect(message?.body).toBe("****");
    expect(await store.list({ accountId: recipient.id, friendId: sender.id })).toMatchObject([{ body: "****" }]);
  });
  it("expires history after 30 days and physically deletes expired rows", async () => {
    await store.send({ accountId: sender.id, friendId: recipient.id, body: "Old" });
    now += 30 * 24 * 60 * 60_000;
    expect(await store.list({ accountId: recipient.id, friendId: sender.id })).toEqual([]);
    await store.cleanup();
    expect((await accounts.pool.query("SELECT * FROM direct_messages")).rows).toEqual([]);
  });
  it("preserves a private moderation report for the recipient even after blocking", async () => {
    const message = await store.send({ accountId: sender.id, friendId: recipient.id, body: "Report me" });
    expect(await store.report({ accountId: stranger.id, messageId: message!.id })).toBeUndefined();
    expect(await store.report({ accountId: sender.id, messageId: message!.id })).toBeUndefined();
    await new BlockStore(accounts).block({ accountId: recipient.id, otherId: sender.id });
    const reportId = await store.report({ accountId: recipient.id, messageId: message!.id });
    const report = (await accounts.pool.query("SELECT * FROM feedback_reports WHERE id=$1", [reportId])).rows[0];
    expect(report).toMatchObject({ reporter_account_id: recipient.id, github_status: "disabled" });
    expect(JSON.parse(report.report.description)).toMatchObject({ messageId: message!.id, body: "Report me" });
  });
});
