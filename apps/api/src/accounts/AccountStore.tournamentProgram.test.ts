import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { describe, expect, it } from "vitest";
import { validateCreateTournament } from "../tournaments/rules/index.js";
import { AccountStore, type Account, type CreateTournamentRecord } from "./AccountStore.js";

// The creation surface end to end below the route: validate a CreateTournamentInput, persist the
// frozen ruleset and banlist snapshots, and read them back unchanged.

const CREATED_AT = Date.parse("2025-06-01T00:00:00Z");

function createStore(): AccountStore {
  const adapter = createMemoryDatabase().adapters.createPg();
  return new AccountStore(new adapter.Pool() as never);
}

async function organizer(store: AccountStore): Promise<Account> {
  return store.accountForIdentity("discord", "organizer", "Organizer");
}

function competitiveRecord(): CreateTournamentRecord {
  const validated = validateCreateTournament(
    {
      name: "Regional Qualifier",
      structure: "swiss",
      topCut: true,
      bestOf: 3,
      startsAt: CREATED_AT + 86_400_000,
      maxPlayers: 64,
      allowBots: false,
      banlist: { mode: "as_of_set", setId: "BT10" },
    },
    CREATED_AT,
  );
  if (!validated.ok) throw new Error(`fixture is invalid: ${JSON.stringify(validated.errors)}`);
  const { input, rules, banlistCards } = validated.value;
  return {
    name: input.name,
    block: "BT10",
    startsAt: input.startsAt,
    maxPlayers: input.maxPlayers,
    structure: input.structure,
    bestOf: input.bestOf,
    topCutEnabled: input.topCut,
    allowBots: input.allowBots,
    rules,
    banlistPolicy: input.banlist,
    banlistCards,
  };
}

describe("AccountStore tournament program columns", () => {
  it("persists and reads back the frozen ruleset and banlist of a competitive event", async () => {
    const store = createStore();
    const record = competitiveRecord();
    const created = await store.createTournament((await organizer(store)).id, record);

    const read = await store.tournament(created.id);
    expect(read).toBeDefined();
    expect(read).toMatchObject({
      structure: "swiss",
      bestOf: 3,
      topCutEnabled: true,
      allowBots: false,
      banlistPolicy: { mode: "as_of_set", setId: "BT10" },
    });
    expect(read?.rules?.match.swissDurationMs).toBe(2_700_000);
    expect(read?.banlistCards).toEqual(record.banlistCards);
    expect(read?.banlistCards.length).toBeGreaterThan(0);
  });

  it("leaves the Top Cut size unset at creation, because the cut is frozen when check-in closes", async () => {
    const store = createStore();
    const created = await store.createTournament((await organizer(store)).id, competitiveRecord());
    expect(created.topCutSize).toBeNull();
  });

  it("defaults the pre-program creation payload to the legacy single-elimination bracket", async () => {
    const store = createStore();
    const created = await store.createTournament((await organizer(store)).id, {
      name: "Legacy Cup",
      block: "BT10",
      startsAt: CREATED_AT,
      maxPlayers: 8,
    });
    expect(created).toMatchObject({
      structure: "single_elimination",
      bestOf: 1,
      topCutEnabled: false,
      topCutSize: null,
      allowBots: false,
      rules: null,
      banlistPolicy: { mode: "none" },
      banlistCards: [],
    });
  });

  it("carries the program columns through the list view as well as the detail view", async () => {
    const store = createStore();
    const created = await store.createTournament((await organizer(store)).id, competitiveRecord());
    const listed = (await store.tournaments()).find((tournament) => tournament.id === created.id);
    expect(listed?.banlistPolicy).toEqual({ mode: "as_of_set", setId: "BT10" });
    expect(listed?.banlistCards).toEqual(created.banlistCards);
  });
});
