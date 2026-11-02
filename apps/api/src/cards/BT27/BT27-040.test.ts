import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { getCardArts } from "@aegis/shared/cards/arts";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const ETEMON = "BT27-040";
const SUKAMON = "BT3-063";
const CHUUMON = "BT3-061";
const KING_SUKAMON = "BT13-069";
const PLAIN_ROOKIE = "BT1-027";
const OTHER_ROOKIE = "BT1-009";
const TAMER = "BT12-092";
const MEGA = "BT1-084";

describe("Etemon", () => {
  it("offers the Japanese art under the canonical card", () => {
    expect(getCardArts(ETEMON).map((art) => art.artId)).toEqual(["BT27-040", "BT27-040-J"]);
  });

  it("On Play gives -3000 DP for each of your Digimon with [Chuumon], [Sukamon] or [Etemon] in their names", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: SUKAMON }, { card: CHUUMON }, { card: PLAIN_ROOKIE }],
          hand: [{ card: ETEMON, as: "etemon" }],
        },
        1: { battleArea: [{ card: PLAIN_ROOKIE, dp: 12000, as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("etemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 3000);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
    expect(s.perm("target").currentDP).toBe(3000);
    assertNoLoudGap(s);
  });

  it("digivolves from a Lv.4 with [Sukamon] in its name for 3 and reduces DP on digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: SUKAMON, as: "base" }, { card: PLAIN_ROOKIE }],
          hand: [{ card: ETEMON, as: "etemon" }],
          deck: [OTHER_ROOKIE, OTHER_ROOKIE],
        },
        1: { battleArea: [{ card: PLAIN_ROOKIE, dp: 12000, as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("etemon").instanceId,
        useAlternateCost: false,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === ETEMON);
    await settle(() => s.perm("target").currentDP === 9000);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(s.perm("target").currentDP).toBe(9000);
  });

  it("plays by Assembly for 3 less with one Lv.4 [Sukamon]-named Digimon card", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: ETEMON, as: "etemon" }], trash: [{ card: SUKAMON, as: "material" }] },
        1: {},
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("etemon").instanceId,
        assembly: { materialInstanceIds: [s.inst("material").instanceId] },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === ETEMON));
    await settle(() => s.state.pendingDecision === undefined);

    const etemon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === ETEMON)!;
    expect(s.state.memory).toBe(0);
    expect(etemon.stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("material").instanceId]);
  });

  it("refuses Assembly with a [Sukamon]-named material above Lv.4", async () => {
    const s = setupEngine({
      0: { hand: [{ card: ETEMON, as: "etemon" }], trash: [{ card: KING_SUKAMON, as: "material" }] },
      1: {},
    });
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("etemon").instanceId,
        assembly: { materialInstanceIds: [s.inst("material").instanceId] },
      } as never).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("Security counts only your Digimon in play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: SUKAMON }, { card: KING_SUKAMON }, { card: PLAIN_ROOKIE }],
          security: [{ card: ETEMON, as: "etemon" }],
        },
        1: { battleArea: [{ card: PLAIN_ROOKIE, dp: 12000, as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("etemon"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("target").currentDP).toBe(6000);
  });

  it("Overclock deletes another [Chuumon]-named Digimon to attack a player without suspending", async () => {
    const s = setupEngine(
      {
        0: {
          deck: [OTHER_ROOKIE, OTHER_ROOKIE],
          battleArea: [
            { card: ETEMON, as: "etemon" },
            { card: CHUUMON, as: "fodder" },
          ],
        },
        1: { deck: [OTHER_ROOKIE, OTHER_ROOKIE], security: [TAMER, TAMER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const fodderId = s.perm("fodder").permanentId;

    await advance(s.engine).runTurn(0);

    expect(s.events.find((event) => event.kind === "attackDeclared")).toMatchObject({
      attackerPermanentId: s.perm("etemon").permanentId,
      target: { kind: "player" },
    });
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === fodderId)).toBe(false);
    expect(s.perm("etemon").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("Overclock cannot delete a Digimon without [Chuumon] or [Sukamon] in its name", async () => {
    const s = setupEngine(
      {
        0: {
          deck: [OTHER_ROOKIE, OTHER_ROOKIE],
          battleArea: [
            { card: ETEMON, as: "etemon" },
            { card: PLAIN_ROOKIE, as: "bystander" },
          ],
        },
        1: { deck: [OTHER_ROOKIE, OTHER_ROOKIE], security: [TAMER, TAMER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();

    await advance(s.engine).runTurn(0);

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.perm("bystander")).toBeDefined();
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("inherited effect de-digivolves once per turn when another [Sukamon]-named Digimon is played", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PLAIN_ROOKIE, under: [ETEMON], as: "host" }],
          hand: [
            { card: SUKAMON, as: "first" },
            { card: SUKAMON, as: "second" },
          ],
        },
        1: { battleArea: [{ card: MEGA, under: [MEGA, MEGA], as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("victim").stack.length === 1);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("victim").stack).toHaveLength(1);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("victim").stack).toHaveLength(1);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual([MEGA]);
  });

  it("inherited effect ignores a played Digimon without a matching name", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PLAIN_ROOKIE, under: [ETEMON] }],
          hand: [{ card: PLAIN_ROOKIE, as: "played" }],
        },
        1: { battleArea: [{ card: MEGA, under: [MEGA], as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("victim").stack).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });
});
