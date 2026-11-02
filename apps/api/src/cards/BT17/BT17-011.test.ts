import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./index.js";
import "../BT3/BT3-109.js";
import "../BT12/BT12-088.js";
import "../BT13/BT13-007.js";
import "../BT16/BT16-084.js";
import "../BT18/BT18-088.js";
import "../ST22/ST22-11.js";
import { compiled } from "./BT17-011.js";

const TAKUYA = "BT12-088";
const TAKUYA_AND_KOJI = "BT18-088";
const BURNING_GREYMON = "BT17-012";
const ANCIENT_GREYMON = "BT17-017";
const RED_TAMER = "BT1-085";
const BLUE_TAMER = "BT1-086";
const INERT_RED_LV3 = "BT1-009";
const YOLEI_AND_KARI = "BT16-084";
const KING_DRASIL = "BT13-007";
const DEFENSE_PLUG_IN_F = "ST22-11";
const BACK_FOR_REVENGE = "BT3-109";

describe("BT17-011 Agunimon", () => {
  it("matches the catalog and carries the printed contract", () => {
    expect(getCardDefinition("BT17-011")).toMatchObject({
      cardId: "BT17-011",
      nameEn: "Agunimon",
      colors: ["Red", "Purple"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 6,
      dp: 5000,
      forms: ["Hybrid"],
      inheritedEffectText: "[Your Turn] This Digimon gets +2000 DP.",
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Takuya Kanbara"], cost: 2, isAlternate: true, baseIsTamer: true },
      { namesExact: ["BurningGreymon"], cost: 1, isAlternate: true },
    ]);
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "Static",
      actions: [
        {
          kind: "Digivolve",
          asLevel: 3,
          from: ["hand"],
          payCost: true,
          target: { filter: { controller: "mine", kind: ["Tamer"], colors: ["Red"] }, count: 1 },
          onto: { filter: { controller: "mine", kind: ["Tamer"], colors: ["Red"] }, count: 1 },
        },
      ],
    });
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Digivolve",
          from: ["hand"],
          costOverride: 3,
          ignoreRequirements: true,
          optional: true,
          into: { nameOrTrait: [{ tokens: ["AncientGreymon"], match: "nameExact" }] },
          condition: {
            kind: "anyOf",
            conditions: [
              { kind: "selfDigivolutionStackHasTrait" },
              { kind: "youHave", filter: { kind: ["Digimon", "Tamer"], colors: ["Blue", "Green"] } },
            ],
          },
        },
        { kind: "DelayedDelete", condition: { kind: "ifThisEffectDigivolved" } },
      ],
    });
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "YourTurn",
      isInherited: true,
      actions: [{ kind: "ModifyDP", amount: 2000, duration: "permanent" }],
    });
  });

  it("gates both printed alternate routes on the exact name", () => {
    expect(matchingAlternateDigivolutionRequirement("BT17-011", TAKUYA)).toMatchObject({
      cost: 2,
      baseIsTamer: true,
    });
    expect(matchingAlternateDigivolutionRequirement("BT17-011", BURNING_GREYMON)).toMatchObject({ cost: 1 });
    expect(matchingAlternateDigivolutionRequirement("BT17-011", RED_TAMER)).toMatchObject({ cost: 3 });
    expect(matchingAlternateDigivolutionRequirement("BT17-011", BLUE_TAMER)).toBeUndefined();
  });

  it("accepts an official Takuya Kanbara alias on the exact route", () => {
    expect(matchingAlternateDigivolutionRequirement("BT17-011", TAKUYA_AND_KOJI)).toMatchObject({
      cost: 2,
      baseIsTamer: true,
    });
  });

  it("digivolves from Takuya Kanbara for cost 2, keeps the Tamer as a digivolution card and draws the bonus (Q2725, Q2727)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: TAKUYA, as: "takuya" }],
        hand: [{ card: "BT17-011", as: "agunimon" }],
        deck: [INERT_RED_LV3, "BT1-012"],
      },
    });
    s.state.memory = 10;
    const takuyaInstanceId = s.perm("takuya").topCard!.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("takuya").permanentId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard?.cardId === "BT17-011");

    expect(s.state.memory).toBe(8);
    expect(s.perm("takuya").stack.map(({ instanceId }) => instanceId)).toEqual([takuyaInstanceId]);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("uses the level-3 red catalog cost when the red Tamer is not a printed route", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: RED_TAMER, as: "tai" }],
        hand: [{ card: "BT17-011", as: "agunimon" }],
        deck: [INERT_RED_LV3],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("tai").permanentId,
        instanceId: s.inst("agunimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tai").topCard?.cardId === "BT17-011");

    expect(s.state.memory).toBe(7);
  });

  it("refuses a non-red Tamer as the digivolution source", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: BLUE_TAMER, as: "matt" }],
        hand: [{ card: "BT17-011", as: "agunimon" }],
        deck: [INERT_RED_LV3],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("matt").permanentId,
        instanceId: s.inst("agunimon").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.perm("matt").topCard?.cardId).toBe(BLUE_TAMER);
    expect(s.state.memory).toBe(10);
  });

  it("digivolves into AncientGreymon for 3 off the BurningGreymon stack and deletes it at end of turn (Q2728 baseline)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BURNING_GREYMON, as: "burning" }],
          hand: [
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
            { card: INERT_RED_LV3, as: "spare" },
          ],
          deck: [INERT_RED_LV3, "BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    const stackId = s.perm("burning").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: stackId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.permanentId === stackId && p.topCard?.cardId === ANCIENT_GREYMON),
    );

    expect(s.state.memory).toBe(6);
    const stack = s.state.players[0]!.battleArea.find((p) => p.permanentId === stackId)!;
    expect(stack.stack.map(({ cardId }) => cardId)).toEqual([BURNING_GREYMON, "BT17-011"]);

    await advance(s.engine).runTurn(0);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === stackId)).toBe(false);
  });

  it("satisfies the condition through a blue Tamer with no BurningGreymon in the stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: TAKUYA, as: "takuya" },
            { card: BLUE_TAMER, as: "matt" },
          ],
          hand: [
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
            { card: INERT_RED_LV3, as: "spare" },
          ],
          deck: [INERT_RED_LV3, "BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    const stackId = s.perm("takuya").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: stackId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.permanentId === stackId && p.topCard?.cardId === ANCIENT_GREYMON),
    );

    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).not.toContain(ANCIENT_GREYMON);
  });

  it("does not offer the digivolve when neither branch of the condition holds", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: TAKUYA, as: "takuya" }],
          hand: [
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
            { card: INERT_RED_LV3, as: "spare" },
          ],
          deck: [INERT_RED_LV3, "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    const stackId = s.perm("takuya").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: stackId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard?.cardId === "BT17-011");

    expect(s.perm("takuya").topCard?.cardId).toBe("BT17-011");
    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain(ANCIENT_GREYMON);
  });

  it("survives the turn when the optional digivolve is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BURNING_GREYMON, as: "burning" }],
          hand: [
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
            { card: INERT_RED_LV3, as: "spare" },
          ],
          deck: [INERT_RED_LV3, "BT1-012", "BT1-013"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    const stackId = s.perm("burning").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: stackId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("burning").topCard?.cardId === "BT17-011");

    expect(s.state.memory).toBe(9);
    await advance(s.engine).runTurn(0);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === stackId)).toBe(true);
  });

  it("grants its inherited +2000 DP only on its controller's turn (Q6555 shape)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-014", under: ["BT17-011"], as: "carrier" }] },
    });

    s.state.turnSeat = 0;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("carrier").currentDP).toBe(6000);

    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("carrier").currentDP).toBe(4000);
  });
});

function digivolveIntoAgunimon(s: EngineSetup, baseAlias: string, useAlternateCost: boolean) {
  return s.engine.applyIntent(0, {
    type: "digivolve",
    permanentId: s.perm(baseAlias).permanentId,
    instanceId: s.inst("agunimon").instanceId,
    useAlternateCost,
  });
}

function permanentWithTop(s: EngineSetup, instanceId: string) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.instanceId === instanceId);
}

describe("BT17-011 Agunimon — KB Q&A rulings", () => {
  async function digivolveBesideYoleiAndKari(
    base: string,
    { useAlternateCost, kingDrasilLock }: { useAlternateCost: boolean; kingDrasilLock: boolean },
  ) {
    const s = setupEngine(
      {
        0: {
          ...(kingDrasilLock ? { breeding: { card: KING_DRASIL, as: "drasil" } } : {}),
          battleArea: [
            { card: base, as: "base" },
            { card: YOLEI_AND_KARI, as: "yoleiAndKari" },
          ],
          hand: [{ card: "BT17-011", as: "agunimon" }],
          deck: [INERT_RED_LV3, INERT_RED_LV3],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    const accepted = digivolveIntoAgunimon(s, "base", useAlternateCost).ok;
    if (accepted) await settle(() => s.perm("base").topCard?.cardId === "BT17-011");
    await drainMicrotasks();
    return {
      accepted,
      top: s.perm("base").topCard?.cardId,
      watcherFired: s.perm("yoleiAndKari").isSuspended,
      memory: s.state.memory,
    };
  }

  it("treats a red Tamer digivolved as a level 3 Digimon as a digivolving Digimon: watchers fire and a can't-digivolve lock blocks it (Q2723)", async () => {
    const unlocked = { useAlternateCost: false, kingDrasilLock: false };
    const locked = { useAlternateCost: false, kingDrasilLock: true };
    expect({
      digimonControl: await digivolveBesideYoleiAndKari(BURNING_GREYMON, { ...unlocked, useAlternateCost: true }),
      digimonUnderLockControl: await digivolveBesideYoleiAndKari(BURNING_GREYMON, {
        ...locked,
        useAlternateCost: true,
      }),
      redTamer: await digivolveBesideYoleiAndKari(RED_TAMER, unlocked),
      redTamerUnderLock: await digivolveBesideYoleiAndKari(RED_TAMER, locked),
    }).toEqual({
      digimonControl: { accepted: true, top: "BT17-011", watcherFired: true, memory: 5 - 1 + 1 },
      digimonUnderLockControl: { accepted: false, top: BURNING_GREYMON, watcherFired: false, memory: 5 },
      redTamer: { accepted: true, top: "BT17-011", watcherFired: true, memory: 5 - 3 + 1 },
      redTamerUnderLock: { accepted: false, top: RED_TAMER, watcherFired: false, memory: 5 },
    });
  });

  // Unlike Q2723, the [Takuya Kanbara] route is a Tamer digivolution on its own: a "Digimon can't
  // digivolve" lock only removes the option to treat Takuya as a Digimon, not the digivolution.
  it("lets [Takuya Kanbara] on the cost-2 route digivolve as a Digimon, but only as a Tamer under a can't-digivolve lock (Q2724)", async () => {
    expect({
      digimonControl: await digivolveBesideYoleiAndKari(BURNING_GREYMON, {
        useAlternateCost: true,
        kingDrasilLock: false,
      }),
      takuyaAsDigimon: await digivolveBesideYoleiAndKari(TAKUYA, { useAlternateCost: true, kingDrasilLock: false }),
      takuyaUnderLock: await digivolveBesideYoleiAndKari(TAKUYA, { useAlternateCost: true, kingDrasilLock: true }),
    }).toEqual({
      digimonControl: { accepted: true, top: "BT17-011", watcherFired: true, memory: 5 - 1 + 1 },
      takuyaAsDigimon: { accepted: true, top: "BT17-011", watcherFired: true, memory: 5 - 2 + 1 },
      takuyaUnderLock: { accepted: true, top: "BT17-011", watcherFired: false, memory: 5 - 2 },
    });
  });

  it("cannot attack the turn it digivolves from a Tamer played that same turn (Q2726)", async () => {
    const attackPlayer = (s: EngineSetup) =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("takuya").permanentId,
        target: { kind: "player" },
      });

    const played = setupEngine({
      0: {
        hand: [
          { card: TAKUYA, as: "takuyaCard" },
          { card: "BT17-011", as: "agunimon" },
        ],
        deck: [INERT_RED_LV3, INERT_RED_LV3],
      },
      1: { security: [INERT_RED_LV3, INERT_RED_LV3], deck: [INERT_RED_LV3] },
    });
    played.state.memory = 10;
    await played.ready();
    expect(
      played.engine.applyIntent(0, { type: "playCard", instanceId: played.inst("takuyaCard").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => played.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === TAKUYA));
    const takuyaPermanentId = played.state.players[0]!.battleArea.find(
      (p) => p.topCard?.cardId === TAKUYA,
    )!.permanentId;
    expect(
      played.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: takuyaPermanentId,
        instanceId: played.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => permanentWithTop(played, played.inst("agunimon").instanceId) !== undefined);

    const agunimonStack = permanentWithTop(played, played.inst("agunimon").instanceId)!;
    expect(agunimonStack.permanentId).toBe(takuyaPermanentId);
    expect(agunimonStack.isSuspended).toBe(false);
    expect(
      played.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: takuyaPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(played.state.players[1]!.security).toHaveLength(2);

    const established = setupEngine({
      0: {
        battleArea: [{ card: TAKUYA, as: "takuya" }],
        hand: [{ card: "BT17-011", as: "agunimon" }],
        deck: [INERT_RED_LV3, INERT_RED_LV3],
      },
      1: { security: [INERT_RED_LV3, INERT_RED_LV3], deck: [INERT_RED_LV3] },
    });
    established.state.memory = 10;
    await established.ready();
    expect(digivolveIntoAgunimon(established, "takuya", true)).toEqual({ ok: true });
    await settle(() => established.perm("takuya").topCard?.cardId === "BT17-011");
    expect(attackPlayer(established)).toEqual({ ok: true });
  });

  it("does not delete the stack at end of turn once De-Digivolve leaves the Tamer on top (Q2729)", async () => {
    const survivesTurn = async (opponentSecurity: string) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: TAKUYA, as: "takuya" },
              { card: BLUE_TAMER, as: "matt" },
            ],
            hand: [
              { card: "BT17-011", as: "agunimon" },
              { card: ANCIENT_GREYMON, as: "ancient" },
            ],
            deck: [INERT_RED_LV3, INERT_RED_LV3, INERT_RED_LV3],
          },
          1: { security: [opponentSecurity], deck: [INERT_RED_LV3, INERT_RED_LV3] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      const stackId = s.perm("takuya").permanentId;

      expect(digivolveIntoAgunimon(s, "takuya", true)).toEqual({ ok: true });
      await settle(() => s.perm("takuya").topCard?.cardId === ANCIENT_GREYMON);
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: stackId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await advance(s.engine).finishAttack();

      const topAfterAttack = s.state.players[0]!.battleArea.find((p) => p.permanentId === stackId)?.topCard?.cardId;
      await advance(s.engine).runTurn(0);
      const survivor = s.state.players[0]!.battleArea.find((p) => p.permanentId === stackId);
      return { topAfterAttack, survivorTop: survivor?.topCard?.cardId };
    };

    expect(await survivesTurn(DEFENSE_PLUG_IN_F)).toEqual({ topAfterAttack: TAKUYA, survivorTop: TAKUYA });
    expect(await survivesTurn(INERT_RED_LV3)).toEqual({ topAfterAttack: ANCIENT_GREYMON, survivorTop: undefined });
  });

  it("replays [AncientGreymon], not this card, through [Back for Revenge!] after the end-of-turn deletion (Q2730)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BURNING_GREYMON, as: "burning" }],
          hand: [
            { card: BACK_FOR_REVENGE, as: "revenge" },
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
          ],
          deck: [INERT_RED_LV3, INERT_RED_LV3, INERT_RED_LV3],
        },
        1: { deck: [INERT_RED_LV3, INERT_RED_LV3] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        preferTriggerKeys: [BACK_FOR_REVENGE, "OnDeletionPlaySelf"],
      },
    );
    s.state.memory = 10;
    await s.ready();
    const stackId = s.perm("burning").permanentId;
    preferred.push(s.perm("burning").topCard!.instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("revenge").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === BACK_FOR_REVENGE));
    expect(digivolveIntoAgunimon(s, "burning", true)).toEqual({ ok: true });
    await settle(() => s.perm("burning").topCard?.cardId === ANCIENT_GREYMON);

    await advance(s.engine).runTurn(0);

    const ancientId = s.inst("ancient").instanceId;
    const replayed = permanentWithTop(s, ancientId);
    expect(replayed).toBeDefined();
    expect(replayed!.permanentId).not.toBe(stackId);
    expect(permanentWithTop(s, s.inst("agunimon").instanceId)).toBeUndefined();
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === stackId)).toBe(false);
  });

  it("does not delete [AncientGreymon] when it digivolves after the end-of-turn timing has passed (Q2731)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BURNING_GREYMON, as: "burning", under: [TAKUYA_AND_KOJI] }],
          hand: [
            { card: "BT17-011", as: "agunimon" },
            { card: ANCIENT_GREYMON, as: "ancient" },
          ],
          deck: [INERT_RED_LV3, INERT_RED_LV3, INERT_RED_LV3],
        },
        1: {
          security: [INERT_RED_LV3, INERT_RED_LV3, INERT_RED_LV3],
          deck: [INERT_RED_LV3, INERT_RED_LV3, INERT_RED_LV3],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 5;
    await s.ready();
    const stackId = s.perm("burning").permanentId;
    preferred.push(s.inst("agunimon").instanceId, s.inst("ancient").instanceId);

    await advance(s.engine).runTurn(0);

    const stackAfterTurn = s.state.players[0]!.battleArea.find((p) => p.permanentId === stackId);
    expect({
      opponentSecurity: s.state.players[1]!.security.length,
      handIds: s.state.players[0]!.hand.map(({ cardId }) => cardId),
      top: stackAfterTurn?.topCard?.cardId,
      digivolutionCards: stackAfterTurn?.stack.map(({ cardId }) => cardId),
    }).toEqual({
      opponentSecurity: 1,
      handIds: [INERT_RED_LV3, INERT_RED_LV3],
      top: ANCIENT_GREYMON,
      digivolutionCards: [TAKUYA_AND_KOJI, BURNING_GREYMON, "BT17-011"],
    });

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === stackId)?.topCard?.cardId).toBe(
      ANCIENT_GREYMON,
    );
  });
  it("cannot back out of a declared red-Tamer digivolution, and cannot declare one without a valid base (Q4657)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: RED_TAMER, as: "tai" }],
          hand: [{ card: "BT17-011", as: "agunimon" }],
          deck: [INERT_RED_LV3],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(digivolveIntoAgunimon(s, "tai", false)).toEqual({ ok: true });
    await settle(() => s.perm("tai").topCard?.cardId === "BT17-011");
    await drainMicrotasks();
    expect(s.perm("tai").topCard?.cardId).toBe("BT17-011");
    expect(s.perm("tai").stack.map(({ cardId }) => cardId)).toEqual([RED_TAMER]);
    expect(s.state.memory).toBe(7);
    expect(
      s.decisions.filter(
        ({ req }) =>
          req.kind === "optional" ||
          req.options?.declineIndex !== undefined ||
          ((req.kind === "selectCards" || req.kind === "chooseTargets") && (req.options?.min ?? 0) === 0),
      ),
    ).toEqual([]);

    const noValidBase = setupEngine({
      0: {
        battleArea: [{ card: BLUE_TAMER, as: "matt" }],
        hand: [{ card: "BT17-011", as: "agunimon" }],
        deck: [INERT_RED_LV3],
      },
    });
    noValidBase.state.memory = 10;
    await noValidBase.ready();
    expect(digivolveIntoAgunimon(noValidBase, "matt", false).ok).toBe(false);
    expect(noValidBase.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT17-011"]);
    expect(noValidBase.perm("matt").topCard?.cardId).toBe(BLUE_TAMER);
    expect(noValidBase.state.memory).toBe(10);
  });

  it("does not gain the [Security] effect of a Tamer in its digivolution cards, only its inherited effect (Q6554)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT17-011", as: "agunimon", under: [TAKUYA] }],
        security: [{ card: TAKUYA, as: "securityTakuya", faceUp: true }],
      },
    });
    s.state.turnSeat = 0;
    await s.ready();
    await s.engine.recomputeContinuousEffects();
    const buriedTakuya = s.perm("agunimon").stack[0]!;

    expect(s.perm("agunimon").currentDP).toBe(5000 + 2000);
    expect(observe(s.engine).canUseInheritedEffect(s.perm("agunimon"), TAKUYA)).toBe(true);

    const securityEffectTriggeredFrom = (instanceId: string) =>
      s.events.some(
        (event) =>
          event.kind === "effectTriggered" && event.sourceInstanceId === instanceId && event.timing === "SecuritySkill",
      );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, buriedTakuya);
    await drainMicrotasks();
    expect(securityEffectTriggeredFrom(buriedTakuya.instanceId)).toBe(false);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("agunimon").stack.map(({ instanceId }) => instanceId)).toEqual([buriedTakuya.instanceId]);

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityTakuya"));
    await drainMicrotasks();
    expect(securityEffectTriggeredFrom(s.inst("securityTakuya").instanceId)).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("securityTakuya").instanceId),
    ).toBe(true);
  });
});
