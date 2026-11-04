import fixtureLordknightmonBt22EffectAttackReveal from "./lordknightmon-bt22-effect-attack-reveal.fixture.js";
import fixtureLordknightmonBt22OpponentAttackReveal from "./lordknightmon-bt22-opponent-attack-reveal.fixture.js";
import fixtureLordknightmonEx13DarkknightmonDigixros from "./lordknightmon-ex13-darkknightmon-digixros.fixture.js";
import { fixturePermanentId, fixtureInstanceId } from "../scenario/references.js";
import { Phase, type Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture, type ScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

// Discord 1558289910425985055 (BT22-067) and 1558289219074654299 (EX13-064), re-checked on
// boards the first investigation did not cover: the reveal inside LordKnightmon's own effect
// attack, the reveal on the opponent's attack, and DarkKnightmon played from the trash with its
// DigiXros materials in hand.

type Setup = ReturnType<typeof setupEngine>;
type Request = Setup["decisions"][number]["req"];

const RIZEGREYMON = fixturePermanentId("own-lk-effect-attack-rizegreymon");
const EFFECT_ATTACK_LORDKNIGHTMON = fixtureInstanceId("lk-effect-attack-hand-lordknightmon-card");
const EFFECT_ATTACK_SKULLKNIGHTMON = fixtureInstanceId("lk-effect-attack-deck-0-2-card");
const OPPONENT_ATTACKER = fixturePermanentId("opponent-lk-opponent-attack-agumon");
const OPPONENT_ATTACK_SKULLKNIGHTMON = fixtureInstanceId("lk-opponent-attack-deck-0-0-card");
const DIGIXROS_KNIGHTMON = fixturePermanentId("own-lk-digixros-knightmon");
const DIGIXROS_LORDKNIGHTMON = fixtureInstanceId("lk-digixros-hand-lordknightmon-card");
const DIGIXROS_SKULLKNIGHTMON = fixtureInstanceId("lk-digixros-hand-skullknightmon-card");
const DIGIXROS_DEADLYAXEMON = fixtureInstanceId("lk-digixros-hand-deadlyaxemon-card");
const DIGIXROS_DARKKNIGHTMON = fixtureInstanceId("lk-digixros-trash-darkknightmon-card");

async function openScenario(id: ScenarioFixture): Promise<Setup> {
  const s = setupEngine({ 0: {}, 1: {} });
  layScenarioFixture(s.state, id, [BLUE_DECK, RED_DECK], true);
  void s.engine.startTurnLoop();
  await settle(() => s.state.phase === Phase.Breeding);
  const turnSeat = s.state.turnSeat as Seat;
  expect(s.engine.applyIntent(turnSeat, { type: "endPhase" })).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(turnSeat);
  return s;
}

function openRequest(s: Setup): Request | undefined {
  const latest = s.decisions.at(-1)?.req;
  return latest !== undefined && latest.decisionId === s.state.pendingDecision?.decisionId ? latest : undefined;
}

/**
 * Answer every decision until the board is quiet. `answer` returns the response for a request it
 * recognizes; anything else declines what can be declined and otherwise takes the first candidate.
 */
async function resolveAll(s: Setup, answer: (request: Request) => Record<string, unknown> | undefined) {
  const seen: Request[] = [];
  for (let round = 0; round < 30; round += 1) {
    await settle(
      () =>
        (openRequest(s) !== undefined && !seen.includes(openRequest(s)!)) ||
        (s.state.pendingDecision === undefined && !observe(s.engine).isAttacking()),
    );
    const request = openRequest(s);
    if (request === undefined || seen.includes(request)) return seen;
    seen.push(request);
    const candidates = request.options?.candidateInstanceIds ?? [];
    const response =
      answer(request) ??
      (request.kind === "optional"
        ? { kind: "optional", accept: false }
        : (request.options?.min ?? 1) === 0
          ? { kind: request.kind, instanceIds: [] }
          : { kind: request.kind, instanceIds: candidates.slice(0, request.options?.min ?? 1) });
    expect(
      s.engine.applyIntent(request.seat, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response,
      } as never),
    ).toEqual({ ok: true });
  }
  throw new Error("too many decisions");
}

const topCardIds = (s: Setup, seat: Seat) =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard.instanceId);
const trashCardIds = (s: Setup, seat: Seat) => s.state.players[seat]!.trash.map((card) => card.cardId).sort();

function isRevealPick(request: Request): boolean {
  return request.sourceCardId === "BT22-067" && request.kind === "selectCards" && request.options?.min === 0;
}

describe("LordKnightmon re-check", () => {
  it("BT22-067 offers SkullKnightmon when its own [When Digivolving] attack reaches the player", async () => {
    const s = await openScenario(fixtureLordknightmonBt22EffectAttackReveal);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: RIZEGREYMON,
        instanceId: EFFECT_ATTACK_LORDKNIGHTMON,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });

    const offers: string[][] = [];
    await resolveAll(s, (request) => {
      if (request.kind === "optional" && request.sourceCardId === "BT22-067") return { kind: "optional", accept: true };
      if (request.options?.selectionContext === "attackTarget") {
        expect(request.options).toMatchObject({ min: 0, max: 1, candidateInstanceIds: ["player"] });
        return { kind: request.kind, instanceIds: ["player"] };
      }
      if (isRevealPick(request)) {
        offers.push([...(request.options?.candidateInstanceIds ?? [])]);
        return { kind: "selectCards", instanceIds: [EFFECT_ATTACK_SKULLKNIGHTMON] };
      }
      return undefined;
    });

    expect(offers).toEqual([[EFFECT_ATTACK_SKULLKNIGHTMON]]);
    expect(s.state.memory).toBe(0);
    expect(topCardIds(s, 0)).toEqual([EFFECT_ATTACK_LORDKNIGHTMON, EFFECT_ATTACK_SKULLKNIGHTMON]);
    expect(trashCardIds(s, 0)).toEqual(["BT5-042", "EX13-058"]);
    // RizeGreymon's inherited ＜Security A. +1＞ makes the attack check 2 of the 4 cards.
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("BT22-067 offers SkullKnightmon to its owner when the opponent's Digimon attacks the player", async () => {
    const s = await openScenario(fixtureLordknightmonBt22OpponentAttackReveal);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: OPPONENT_ATTACKER,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    const offers: { seat: Seat; candidates: string[] }[] = [];
    await resolveAll(s, (request) => {
      if (isRevealPick(request)) {
        offers.push({ seat: request.seat, candidates: [...(request.options?.candidateInstanceIds ?? [])] });
        return { kind: "selectCards", instanceIds: [OPPONENT_ATTACK_SKULLKNIGHTMON] };
      }
      return undefined;
    });

    expect(offers).toEqual([{ seat: 0, candidates: [OPPONENT_ATTACK_SKULLKNIGHTMON] }]);
    expect(topCardIds(s, 0)).toContain(OPPONENT_ATTACK_SKULLKNIGHTMON);
    expect(trashCardIds(s, 0)).toEqual(expect.arrayContaining(["BT5-042", "EX13-058"]));
    expect(s.state.players[0]!.security).toHaveLength(3);
  });

  it("EX13-064 plays DarkKnightmon from the trash and offers its DigiXros materials from hand", async () => {
    const s = await openScenario(fixtureLordknightmonEx13DarkknightmonDigixros);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: DIGIXROS_KNIGHTMON,
        instanceId: DIGIXROS_LORDKNIGHTMON,
      }),
    ).toEqual({ ok: true });

    const playOffers: string[][] = [];
    const materialOffers: string[][] = [];
    await resolveAll(s, (request) => {
      const digiXrosCardId = (request.options as { digiXrosCardId?: string } | undefined)?.digiXrosCardId;
      if (request.sourceCardId === "EX13-064" && request.kind === "selectCards" && digiXrosCardId === undefined) {
        playOffers.push([...(request.options?.candidateInstanceIds ?? [])].sort());
        return { kind: "selectCards", instanceIds: [DIGIXROS_DARKKNIGHTMON] };
      }
      if (digiXrosCardId === "EX10-031") {
        materialOffers.push([...(request.options?.candidateInstanceIds ?? [])].sort());
        return { kind: "selectCards", instanceIds: [DIGIXROS_SKULLKNIGHTMON, DIGIXROS_DEADLYAXEMON] };
      }
      return undefined;
    });

    expect(playOffers).toEqual([[DIGIXROS_DARKKNIGHTMON, DIGIXROS_DEADLYAXEMON, DIGIXROS_SKULLKNIGHTMON].sort()]);
    expect(materialOffers).toEqual([[DIGIXROS_DEADLYAXEMON, DIGIXROS_SKULLKNIGHTMON].sort()]);
    expect(s.state.memory).toBe(0);
    const darkKnightmon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === DIGIXROS_DARKKNIGHTMON,
    );
    expect(darkKnightmon?.stack.map((card) => card.instanceId).sort()).toEqual(
      [DIGIXROS_DEADLYAXEMON, DIGIXROS_SKULLKNIGHTMON].sort(),
    );
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010", "BT1-010"]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });
});
