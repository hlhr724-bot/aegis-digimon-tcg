import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-090";
import "#api/cards/index";

const cardId = "BT27-090";

type Setup = ReturnType<typeof setupEngine>;

const spencerInBattleArea = (s: Setup) =>
  s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId);

const bottomCardOf = (s: Setup, alias: string) => s.perm(alias).stack[0]?.cardId;

async function playFromHand(
  played: string,
  options: { accept: boolean; protect?: string; extraBattleArea?: { card: string; as: string }[] },
) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: cardId, as: "spencer" }, ...(options.extraBattleArea ?? [])],
        hand: [{ card: played, as: "played" }],
      },
      1: { deck: ["BT1-009"] },
    },
    {
      autoSelectCards: true,
      declineDigiXros: true,
      preferInstanceIds,
      ...(options.accept ? { autoAcceptOptional: true } : { autoDeclineOptional: true }),
    },
  );
  s.state.memory = 15;
  await s.ready();
  if (options.protect !== undefined) preferInstanceIds.push(s.inst(options.protect).instanceId);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({ ok: true });
  await settle(
    () =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("played").instanceId) &&
      s.state.pendingDecision === undefined,
  );
  return s;
}

describe("BT27-090 Spencer Damon", () => {
  it("matches the printed catalog entry and IR contract", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Spencer Damon",
      nameJp: "大門英",
      colors: ["Yellow", "Green"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["DATA SQUAD"],
      rarity: "U",
    });
    expect(compiled.effects.map(({ trigger, isInherited }) => [trigger, isInherited ?? false])).toEqual([
      ["StartOfYourTurn", false],
      ["AllTurns", false],
      ["AllTurns", true],
      ["Security", false],
    ]);
    expect(compiled.effects[1]?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenPlayed",
      optional: true,
      cost: { kind: "place", targetIsPermanent: true, host: "triggerSource", position: "bottom" },
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it.each([
    ["a Leomon-named Digimon", "BT1-042", 10000],
    ["a Boss trait Digimon", "BT4-073", 11000],
    ["a DATA SQUAD trait Digimon", "BT25-021", 2000],
  ] as const)("places itself under %s and protects it", async (_label, played, printedDp) => {
    const s = await playFromHand(played, { accept: true, protect: "played" });

    expect(spencerInBattleArea(s)).toBe(false);
    const host = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("played").instanceId,
    )!;
    expect(host.stack.map(({ cardId: id }) => id)).toEqual([cardId]);
    expect(host.currentDP).toBe(printedDp + 3000);
    expect(observe(s.engine).hasRestriction(host, "beReturned")).toBe(true);
  });

  it("does not trigger for a Digimon without Leomon in its name or the Boss or DATA SQUAD trait", async () => {
    const s = await playFromHand("BT1-009", { accept: true });

    expect(spencerInBattleArea(s)).toBe(true);
    expect(s.decisions.some(({ req }) => req.kind === "optional")).toBe(false);
  });

  it("keeps the Tamer in the battle area when the placement is declined", async () => {
    const s = await playFromHand("BT1-042", { accept: false });

    expect(spencerInBattleArea(s)).toBe(true);
    const host = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("played").instanceId,
    )!;
    expect(host.stack.length).toBe(0);
    expect(observe(s.engine).hasRestriction(host, "beReturned")).toBe(false);
  });

  it("can protect a different Digimon of yours than the one played", async () => {
    const s = await playFromHand("BT1-042", {
      accept: true,
      protect: "bystander",
      extraBattleArea: [{ card: "BT1-009", as: "bystander" }],
    });

    expect(bottomCardOf(s, "played")).toBe(cardId);
    expect(observe(s.engine).hasRestriction(s.perm("bystander"), "beReturned")).toBe(true);
    const host = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("played").instanceId,
    )!;
    expect(observe(s.engine).hasRestriction(host, "beReturned")).toBe(false);
  });

  it.each([
    ["stops", true],
    ["without the placement does not stop", false],
  ])("%s an opponent's effect returning the Digimon to the hand", async (_label, accept) => {
    const s = await playFromHand("BT1-042", { accept, protect: "played" });
    s.putOnBoard(1, { card: "BT1-027", as: "blue" });
    s.give(1, "hand", { card: "BT13-105", as: "bounce" });
    s.state.turnSeat = 1;
    s.state.memory = 10;

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("bounce").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[1]!.trash.some(({ cardId: id }) => id === "BT13-105") && !s.state.pendingDecision,
    );

    const returned = s.state.players[0]!.hand.map(({ cardId: id }) => id);
    expect(returned.includes("BT1-042")).toBe(!accept);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-042")).toBe(accept);
  });

  it("stops only the opponent's effects from trashing the protected Digimon's stacked cards", async () => {
    const s = await playFromHand("BT1-042", { accept: true, protect: "played" });
    const hostId = () =>
      s.state.players[0]!.battleArea.find(({ topCard }) => topCard.instanceId === s.inst("played").instanceId)!
        .permanentId;
    const spencerCard = s.inst("spencer").instanceId;

    await advance(s.engine).verb.trashDigivolutionCards(hostId(), [spencerCard], 1);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([]);

    await advance(s.engine).verb.trashDigivolutionCards(hostId(), [spencerCard], 0);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
  });

  it("ends both protections when the opponent's turn ends", async () => {
    const s = await playFromHand("BT1-042", { accept: true, protect: "played" });
    const host = () =>
      s.state.players[0]!.battleArea.find(({ topCard }) => topCard.instanceId === s.inst("played").instanceId)!;
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);

    expect(observe(s.engine).hasRestriction(host(), "beReturned")).toBe(false);
    await advance(s.engine).verb.trashDigivolutionCards(host().permanentId, [s.inst("spencer").instanceId], 1);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
  });

  it.each([
    ["Leomon-named", "BT1-042", 13000],
    ["Boss trait", "BT4-073", 14000],
    ["DATA SQUAD trait", "BT26-049", 15000],
    ["non-matching", "BT1-009", 3000],
  ] as const)("gives a %s Digimon the inherited DP bonus only when it matches", async (_label, top, expected) => {
    const s = setupEngine({ 0: { battleArea: [{ card: top, as: "host", under: [cardId] }] } });
    await s.ready();

    expect(s.perm("host").currentDP).toBe(expected);
  });

  it.each([
    [0, 3],
    [2, 3],
    [3, 3],
    [5, 5],
  ])("at the start of your turn turns %i memory into %i", async (start, expected) => {
    const s = setupEngine({
      0: { battleArea: [{ card: cardId, as: "spencer" }], deck: ["BT1-009"] },
      1: { deck: ["BT1-010"] },
    });
    s.state.memory = start;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(expected);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("plays itself from Security without paying the cost", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: cardId, as: "spencer" }] }, 1: { battleArea: [{ card: "BT1-009", as: "attacker" }] } },
      { autoAcceptOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("spencer"));
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.memory).toBe(0);
  });
});
