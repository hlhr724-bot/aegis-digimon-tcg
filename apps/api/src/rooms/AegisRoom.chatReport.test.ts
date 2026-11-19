import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { CHAT_COOLDOWN_MS } from "@aegis/shared/protocol/chat";
import { CHAT_REPORT_CHANNEL, type ChatReportUpdate } from "@aegis/shared/chat/ChatReportUpdate";

const EMPTY_DECK = { mainDeck: [], eggDeck: [] };
const SUMMARY = "Match chat abuse report";

type RoomInternals = {
  accountByClient: Map<string, string>;
  spectatorClients: Set<string>;
  handleChat: (client: Client, payload: unknown) => void;
  handleChatReport: (client: Client) => void;
};
type Evidence = {
  roomId: string;
  matchId: string;
  reporterId: string;
  reportedId: string | null;
  reportedAt: number;
  messages: { senderId: string | null; text: string; sentAt: number }[];
};
type ReportRow = {
  reporter_account_id: string;
  github_status: string;
  report: { summary: string; kind: string; matchId: string; description: string };
};

let accounts: AccountStore;
let reporter: Account;
let offender: Account;
let room: AegisRoom;
let clock: number;

class ReportRoom extends AegisRoom {
  protected override accounts(): AccountStore {
    return accounts;
  }
}

function internals(): RoomInternals {
  return room as unknown as RoomInternals;
}

function joinClient(sessionId: string): { client: Client; updates: ChatReportUpdate[] } {
  const updates: ChatReportUpdate[] = [];
  const client = {
    sessionId,
    send: vi.fn<Client["send"]>((type, message) => {
      if (type === CHAT_REPORT_CHANNEL) {
        updates.push(message as ChatReportUpdate);
      }
    }),
    view: undefined,
  } as unknown as Client;
  room.clients.push(client);
  return { client, updates };
}

function joinSeat(sessionId: string, accountId?: string) {
  const joined = joinClient(sessionId);
  room.onJoin(joined.client, { displayName: sessionId, deck: EMPTY_DECK });
  if (accountId) {
    internals().accountByClient.set(sessionId, accountId);
  }
  return joined;
}

function say(client: Client, text: string): void {
  clock += CHAT_COOLDOWN_MS;
  internals().handleChat(client, { kind: "text", text });
}

async function listReports(): Promise<ReportRow[]> {
  const { rows } = await accounts.pool.query<ReportRow>("SELECT * FROM feedback_reports ORDER BY id");
  return rows.filter((row) => row.report.summary === SUMMARY);
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  reporter = await accounts.accountForIdentity("email", "reporter@test.invalid", "Reporter");
  offender = await accounts.accountForIdentity("email", "offender@test.invalid", "Offender");
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  room = new ReportRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.onCreate({ seed: 1 });
});

afterEach(async () => {
  room.onDispose();
  vi.restoreAllMocks();
  await accounts.close();
});

describe("match chat abuse report", () => {
  it("stores the opponent's relayed messages, assembled by the server, in the private feedback inbox", async () => {
    const mine = joinSeat("reporter", reporter.id);
    const theirs = joinSeat("offender", offender.id);
    say(mine.client, "hello");
    say(theirs.client, "you are a fuck");
    say(theirs.client, "leave");
    expect(mine.updates).toEqual([{ status: "available" }, { status: "available" }]);
    expect(theirs.updates).toEqual([{ status: "available" }]);

    Reflect.apply(internals().handleChatReport, room, [mine.client, { messages: [{ text: "forged" }] }]);
    await vi.waitFor(() => expect(mine.updates.at(-1)).toEqual({ status: "reported" }));

    const [row, ...others] = await listReports();
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      reporter_account_id: reporter.id,
      github_status: "disabled",
      report: { kind: "other", matchId: room.state.matchLogId },
    });
    const evidence = JSON.parse(row!.report.description) as Evidence;
    expect(evidence).toEqual({
      roomId: room.roomId,
      matchId: room.state.matchLogId,
      reporterId: reporter.id,
      reportedId: offender.id,
      reportedAt: clock,
      messages: [
        { senderId: offender.id, text: "you are a ****", sentAt: clock - CHAT_COOLDOWN_MS },
        { senderId: offender.id, text: "leave", sentAt: clock },
      ],
    });
    expect(theirs.updates).toEqual([{ status: "available" }]);
  });

  it("answers a repeated report with the same confirmation without a second row", async () => {
    const mine = joinSeat("reporter", reporter.id);
    const theirs = joinSeat("offender", offender.id);
    say(theirs.client, "first");
    internals().handleChatReport(mine.client);
    internals().handleChatReport(mine.client);
    await vi.waitFor(() => expect(mine.updates.slice(-2)).toEqual([{ status: "reported" }, { status: "reported" }]));
    say(theirs.client, "second");
    internals().handleChatReport(mine.client);
    await vi.waitFor(() => expect(mine.updates.slice(-3).every(({ status }) => status === "reported")).toBe(true));
    expect(await listReports()).toHaveLength(1);
  });

  it("refuses a report while the opponent has written nothing", async () => {
    const mine = joinSeat("reporter", reporter.id);
    const theirs = joinSeat("offender", offender.id);
    say(mine.client, "anyone there?");
    internals().handleChat(theirs.client, { kind: "emote", emote: "scold" });
    internals().handleChatReport(mine.client);
    await vi.waitFor(() => expect(mine.updates).toEqual([{ status: "failed" }]));
    expect(await listReports()).toEqual([]);
  });

  it("ignores guests and spectators, and never offers them the report", async () => {
    const guest = joinSeat("guest");
    const theirs = joinSeat("offender", offender.id);
    const spectator = joinClient("spectator");
    internals().spectatorClients.add("spectator");
    internals().accountByClient.set("spectator", reporter.id);
    say(theirs.client, "rude");
    internals().handleChatReport(guest.client);
    internals().handleChatReport(spectator.client);
    await accounts.ensureReady();
    expect(guest.updates).toEqual([]);
    expect(spectator.updates).toEqual([]);
    expect(await listReports()).toEqual([]);
  });

  it("keeps only the opponent's last 20 messages and forgets them with the room", async () => {
    const mine = joinSeat("reporter", reporter.id);
    const theirs = joinSeat("offender", offender.id);
    for (let index = 1; index <= 25; index += 1) {
      say(theirs.client, `message ${index}`);
    }
    internals().handleChatReport(mine.client);
    await vi.waitFor(() => expect(mine.updates.at(-1)).toEqual({ status: "reported" }));
    const [row] = await listReports();
    const evidence = JSON.parse(row!.report.description) as Evidence;
    expect(evidence.messages.map(({ text }) => text)).toEqual(
      Array.from({ length: 20 }, (_, index) => `message ${index + 6}`),
    );

    room.onDispose();
    internals().handleChatReport(mine.client);
    await vi.waitFor(() => expect(mine.updates.at(-1)).toEqual({ status: "failed" }));
    expect(await listReports()).toHaveLength(1);
  });
});
