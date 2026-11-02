import { EffectDuration, EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import {
  drainMicrotasks,
  setupEngine,
  settle,
  type BoardSpec,
  type SetupEngineOptions,
} from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT25-093.js";

const CARD_ID = "BT25-093";

describe("BT25-093 Ignition Flare", () => {
  it("maps the printed TS use requirement, placed-Option ruling, and Link requirement", () => {
    expect(compiled.linkRequirement).toEqual([{ traits: ["TS"], cost: 3 }]);
    expect(compiled.effects.find((effect) => effect.trigger === "Static")).toMatchObject({
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: { zone: ["battleArea", "breeding"], kind: ["Digimon", "Tamer"] },
          },
        },
      ],
    });
    const trash = compiled.effects
      ?.find((effect) => effect.trigger === "Main")
      ?.actions.find((action) => action.kind === "Trash");
    expect(trash).toMatchObject({
      target: {
        filter: {
          zone: "battleArea",
          controller: "opponent",
          kind: ["Option"],
          placedInBattleAreaByEffect: true,
        },
      },
    });
  });

  it("is enabled by a breeding TS Digimon but not by a TS Option in the battle area", async () => {
    const breeding = setupEngine(
      {
        0: {
          breeding: { card: "BT25-034", as: "breedingTs" },
          hand: [{ card: CARD_ID, as: "flare" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    breeding.state.memory = 5;
    await breeding.ready();
    expect(
      breeding.engine.applyIntent(0, {
        type: "playCard",
        instanceId: breeding.inst("flare").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });

    const optionOnly = setupEngine({
      0: {
        battleArea: [{ card: "BT25-094", as: "tsOption" }],
        hand: [{ card: CARD_ID, as: "flare" }],
      },
    });
    optionOnly.state.memory = 5;
    await optionOnly.ready();
    expect(
      optionOnly.engine.applyIntent(0, {
        type: "playCard",
        instanceId: optionOnly.inst("flare").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
    expect(optionOnly.state.players[0]!.hand.map((card) => card.cardId)).toContain(CARD_ID);
  });

  it("cannot be used without the printed color requirement or an effective TS permanent", async () => {
    const s = setupEngine({ 0: { hand: [{ card: CARD_ID, as: "flare" }] } });
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("flare").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain(CARD_ID);
  });

  it("uses a runtime TS trait, observes failed mandatory deletion, trashes only a placed Option, then links to breeding", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT24-019", as: "breedingHost" },
          battleArea: [{ card: "BT1-051", as: "runtimeTs" }],
          hand: [{ card: CARD_ID, as: "flare" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 2000, as: "protectedLowest" },
            { card: "AD1-001", dp: 5000, as: "higher" },
            { card: "BT25-098", as: "placedOption" },
            { card: "BT26-014", as: "dualDigimonOption" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.perm("placedOption").placedByEffect = true;
    s.perm("dualDigimonOption").placedByEffect = true;
    await s.ready();
    advance(s.engine).ledgers.continuous.addNameTraitGrant(
      s.perm("runtimeTs").permanentId,
      "trait",
      ["TS"],
      EffectDuration.UntilEachTurnEnd,
    );
    advance(s.engine).ledgers.continuous.addRestriction(
      s.perm("protectedLowest").permanentId,
      "beDeleted",
      EffectDuration.UntilEachTurnEnd,
    );
    await advance(s.engine).recompute();
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("flare").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("breedingHost").linked.some((card) => card.cardId === CARD_ID));

    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === s.perm("protectedLowest").permanentId)).toBe(
      true,
    );
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === s.perm("higher").permanentId)).toBe(true);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT25-098");
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === "BT26-014")).toBe(true);
  });

  it("mandatorily deletes every tied lowest-DP Digimon and therefore does not trash a placed Option", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-019", as: "ts" }], hand: [{ card: CARD_ID, as: "flare" }] },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 3000, as: "lowOne" },
            { card: "BT1-019", dp: 3000, as: "lowTwo" },
            { card: "AD1-001", dp: 5000, as: "high" },
            { card: "BT25-098", as: "placedOption" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    s.perm("placedOption").placedByEffect = true;
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("flare").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.filter((p) => p.topCard.cardId !== "BT25-098").length === 1);

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT1-009", "BT1-019"]),
    );
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === "BT25-098")).toBe(true);
  });

  it("Security activates the same Main flow", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: CARD_ID, as: "securityFlare", faceUp: true }],
          battleArea: [{ card: "AD1-001", as: "host" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoDeclineOptional: true },
    );
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityFlare"));
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("Security still offers the self-link when its controller has a Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: CARD_ID, as: "securityFlare", faceUp: true }],
          battleArea: [{ card: "BT24-019", as: "host" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityFlare"));
    await settle(() => s.perm("host").linked.length > 0);

    expect(s.perm("host").linked.map((card) => card.cardId)).toEqual([CARD_ID]);
  });

  it("linked When Attacking deletes at host DP, is a physical OPT, and ignores the over-DP boundary", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-019", dp: 5000, linked: [{ card: CARD_ID, as: "linkedFlare" }], as: "host" }],
        },
        1: {
          security: ["BT1-085", "BT1-085"],
          battleArea: [
            { card: "BT1-009", dp: 5000, as: "equalOne" },
            { card: "BT1-019", dp: 5000, as: "equalTwo" },
            { card: "AD1-001", dp: 6000, as: "over" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("equalOne").permanentId);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").isSuspended && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.battleArea.filter((p) => p.currentDP === 5000)).toHaveLength(1);
    preferred.splice(0, preferred.length, s.perm("equalTwo").permanentId);
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("host"), {
      attackerPermanentId: s.perm("host").permanentId,
    });
    expect(s.state.players[1]!.battleArea.filter((p) => p.currentDP === 5000)).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.some((p) => p.currentDP === 6000)).toBe(true);
  });

  it("Q6439 treats the linked attack deletion as a Digimon effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-019", linked: [{ card: CARD_ID }], as: "host" }],
      },
      1: {
        security: ["BT1-085"],
        battleArea: [{ card: "BT1-009", dp: 3000, as: "protected" }],
      },
    });
    await s.ready();
    advance(s.engine).ledgers.continuous.addRestriction(
      s.perm("protected").permanentId,
      "beAffected",
      EffectDuration.UntilOpponentTurnEnd,
      { fromSourceKind: ["Digimon"], byOpponentEffectsOnly: true },
    );
    await advance(s.engine).recompute();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").isSuspended && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === s.perm("protected").permanentId)).toBe(true);
  });
});

describe("BT25-093 Ignition Flare — KB Q&A rulings", () => {
  const onBattleArea = (s: ReturnType<typeof setupEngine>, seat: 0 | 1, cardId: string) =>
    s.state.players[seat]!.battleArea.some((permanent) => permanent.topCard.cardId === cardId);

  /** Use Ignition Flare from hand with a TS Digimon out, after `arrange` shapes the board. */
  async function useFlare(
    board: BoardSpec,
    arrange: (s: ReturnType<typeof setupEngine>) => void = () => {},
    options: SetupEngineOptions = { autoDeclineOptional: true, autoSelectCards: true },
  ) {
    const s = setupEngine(board, options);
    await s.ready();
    arrange(s);
    await advance(s.engine).recompute();
    s.state.memory = 5;
    const flareId = s.inst("flare").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: flareId, useAs: "option" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.every((card) => card.instanceId !== flareId));
    await settle(() => s.state.pendingDecision === undefined);
    await drainMicrotasks();
    return s;
  }

  function protectedLowestBoard(): BoardSpec {
    return {
      0: { battleArea: [{ card: "BT24-019", as: "ts" }], hand: [{ card: CARD_ID, as: "flare" }] },
      1: {
        battleArea: [
          { card: "BT1-009", dp: 2000, as: "protectedLowest" },
          { card: "BT25-085", as: "dualDigimon" },
          { card: "BT25-098", as: "placedOption" },
        ],
      },
    };
  }

  const protectLowest = (s: ReturnType<typeof setupEngine>) =>
    advance(s.engine).ledgers.continuous.addRestriction(
      s.perm("protectedLowest").permanentId,
      "beDeleted",
      EffectDuration.UntilEachTurnEnd,
    );

  it("trashes only an Option placed by its own effect, never a DUAL card that is a Digimon (Q6436)", async () => {
    const s = await useFlare(protectedLowestBoard(), protectLowest);

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT25-098"]);
    expect(onBattleArea(s, 1, "BT25-085")).toBe(true);
  });

  it("must delete the lowest-DP Digimon when it can, so it then trashes no Option (Q6437)", async () => {
    const s = await useFlare({
      0: { battleArea: [{ card: "BT24-019", as: "ts" }], hand: [{ card: CARD_ID, as: "flare" }] },
      1: {
        battleArea: [
          { card: "BT1-009", dp: 2000, as: "lowest" },
          { card: "BT25-098", as: "placedOption" },
        ],
      },
    });

    expect(onBattleArea(s, 1, "BT1-009")).toBe(false);
    expect(onBattleArea(s, 1, "BT25-098")).toBe(true);
  });

  it("meets the did-not-delete condition when the lowest-DP Digimon can't be deleted (Q6438)", async () => {
    const s = await useFlare(protectedLowestBoard(), protectLowest);

    expect(onBattleArea(s, 1, "BT1-009")).toBe(true);
    expect(onBattleArea(s, 1, "BT25-098")).toBe(false);
  });

  it("can pay its link cost and link while its controller can't use Option cards (Q6440)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT24-019", as: "host" }], hand: [{ card: CARD_ID, as: "flare" }] },
    });
    s.state.memory = 5;
    await s.ready();
    advance(s.engine).ledgers.continuous.addPlayProhibition(
      0,
      1,
      { kinds: ["Option"] },
      "play",
      EffectDuration.UntilOpponentTurnEnd,
    );
    const flareId = s.inst("flare").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: flareId, useAs: "option" })).toEqual({
      ok: false,
      reason: "play-prohibited",
    });
    expect(
      s.engine.applyIntent(0, { type: "linkCard", instanceId: flareId, targetPermanentId: s.perm("host").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.some((card) => card.instanceId === flareId));

    expect(s.state.memory).toBe(2);
  });

  it("links itself to a Digimon in the breeding area (Q6441)", async () => {
    const preferred: string[] = [];
    const s = await useFlare(
      {
        0: {
          breeding: { card: "BT24-019", as: "breedingHost" },
          battleArea: [{ card: "BT25-008", as: "battleHost" }],
          hand: [{ card: CARD_ID, as: "flare" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      (setup) => preferred.push(setup.perm("breedingHost").permanentId),
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );

    expect(s.perm("breedingHost").linked.map((card) => card.cardId)).toEqual([CARD_ID]);
    expect(s.perm("battleHost").linked).toHaveLength(0);
  });

  it("links to a breeding Digi-Egg without DP, which gains no DP from its link DP (Q6443)", async () => {
    const preferred: string[] = [];
    const s = await useFlare(
      {
        0: {
          breeding: { card: "BT25-005", as: "egg" },
          battleArea: [{ card: "BT24-019", as: "ts" }],
          hand: [{ card: CARD_ID, as: "flare" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      (setup) => preferred.push(setup.perm("egg").permanentId),
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );

    expect(s.perm("egg").linked.map((card) => card.cardId)).toEqual([CARD_ID]);
    expect(s.perm("egg").currentDP).toBe(0);
    expect(s.perm("ts").linked).toHaveLength(0);
  });

  it("activates its link effect when Dan Yuki & Kanan Yuki's attack follows the link (Q6442)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-085", as: "dan" },
            { card: "BT24-014", as: "host" },
          ],
          hand: [{ card: CARD_ID, as: "flare" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 1000, as: "lowest" },
            { card: "BT1-019", dp: 9000, as: "linkVictim" },
            { card: "AD1-001", dp: 20000, as: "survivor" },
          ],
          security: ["BT1-085", "BT1-085"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("host").permanentId, s.perm("linkVictim").permanentId);
    s.state.memory = -5;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnEndTurn, s.perm("dan"));
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

    expect(s.perm("host").linked.map((card) => card.cardId)).toEqual([CARD_ID]);
    expect(s.perm("host").isSuspended).toBe(true);
    expect(onBattleArea(s, 1, "BT1-009")).toBe(false);
    expect(onBattleArea(s, 1, "BT1-019")).toBe(false);
    expect(onBattleArea(s, 1, "AD1-001")).toBe(true);
  });
});
