import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { TournamentReportStore } from "#api/tournaments/reports/TournamentReportStore";
import type { TournamentReportTarget } from "#api/tournaments/reports/TournamentReportStore";
import { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";
import { TournamentReportReason } from "@aegis/shared/tournaments/TournamentReportReason";

let accounts: AccountStore;
let store: TournamentReportStore;
let tournament: TournamentReportTarget;
let admin: string;

async function createAccount(name: string): Promise<string> {
  return (await accounts.accountForIdentity("discord", name, name)).id;
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  store = new TournamentReportStore(accounts);
  const organizer = await createAccount("Organizer");
  admin = await createAccount("Admin");
  const created = await accounts.createTournament(organizer, {
    name: "Rude event",
    block: "BT10",
    startsAt: 1_800_000_000_000,
    maxPlayers: 8,
  });
  tournament = (await store.findReportTarget(created.id))!;
});

describe("tournament reports", () => {
  it("keeps one open report per reporter and tournament, replacing the older one", async () => {
    const reporter = await createAccount("Reporter");
    await store.recordReport({
      reporterAccountId: reporter,
      tournament,
      input: { reason: TournamentReportReason.OTHER.value },
      at: 1_000,
    });
    await store.recordReport({
      reporterAccountId: reporter,
      tournament,
      input: { reason: TournamentReportReason.FAKE_EVENT.value, details: "No prizes exist" },
      at: 2_000,
    });

    expect(await store.listOpenReports()).toEqual([
      expect.objectContaining({
        tournamentId: tournament.id,
        tournamentName: "Rude event",
        organizerName: "Organizer",
        canDeleteTournament: true,
        reason: TournamentReportReason.FAKE_EVENT.value,
        details: "No prizes exist",
        reporterName: "Reporter",
        createdAt: 2_000,
        openReportsForTournament: 1,
      }),
    ]);
  });

  it("counts distinct reporters and closes every open report of the tournament on resolution", async () => {
    for (const name of ["First", "Second"]) {
      await store.recordReport({
        reporterAccountId: await createAccount(name),
        tournament,
        input: { reason: TournamentReportReason.ORGANIZER_ABUSE.value },
      });
    }
    const reports = await store.listOpenReports();
    expect(reports.map((report) => report.openReportsForTournament)).toEqual([2, 2]);

    const resolved = await store.resolveReports({
      tournamentId: tournament.id,
      action: TournamentReportAction.DISMISS.value,
      adminAccountId: admin,
    });

    expect(resolved).toBe(2);
    expect(await store.listOpenReports()).toEqual([]);
    expect(await store.findOpenReport(reports[0]!.id)).toBeUndefined();
  });

  it("offers deletion only before the tournament starts", async () => {
    await store.recordReport({
      reporterAccountId: await createAccount("Reporter"),
      tournament,
      input: { reason: TournamentReportReason.OFFENSIVE_CONTENT.value },
    });
    await accounts.pool.query("UPDATE tournaments SET status='running' WHERE id=$1", [tournament.id]);

    expect((await store.listOpenReports())[0]?.canDeleteTournament).toBe(false);
  });
});
