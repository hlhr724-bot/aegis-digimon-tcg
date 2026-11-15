import { describe, it, expect } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT1/BT1-101.js";
import "../BT11/BT11-108.js";
import "../BT2/BT2-099.js";
import "../BT7/BT7-100.js";
import "../BT9/BT9-097.js";
import "../ST14/ST14-12.js";
import "./BT6-095.js";
import "./BT6-105.js";
import "./BT6-112.js";

describe("BT6-112 static play-cost reduction by trash [Three Musketeers] / cost-7 Option count", () => {
  it("returns a cost-7 Option from trash, then uses one from hand for free", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT6-112", as: "beelstarmon" }],
          trash: [
            { card: "BT6-095", as: "option" },
            { card: "BT6-098", as: "nonSevenOption" },
          ],
          battleArea: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT6-075", as: "target" }] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const optionId = s.inst("option").instanceId;
    const nonSevenOptionId = s.inst("nonSevenOption").instanceId;
    preferred.push(optionId, s.perm("target").permanentId);
    const targetInstanceId = s.perm("target").topCard.instanceId;
    s.state.memory = 12;
    await s.engine.recomputeContinuousEffects();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("beelstarmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[1]!.trash.some((card) => card.instanceId === targetInstanceId) &&
        s.state.players[0]!.trash.some((card) => card.instanceId === optionId),
    );

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === nonSevenOptionId)).toBe(true);
    expect(s.state.memory).toBe(1);
  });

  it("reduces the play cost by 1 with one Three Musketeers Digimon in trash", async () => {
    const s = setupEngine(
      {
        0: {
          trash: ["BT6-017"],
          hand: [{ card: "BT6-112", as: "beelstarmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const p0 = s.state.players[0]!;
    s.state.memory = 12;
    await s.engine.recomputeContinuousEffects();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("beelstarmon").instanceId })).toEqual({
      ok: true,
    });

    await settle(() => p0.battleArea.some((perm) => perm.topCard?.cardId === "BT6-112"));

    expect(p0.battleArea.some((perm) => perm.topCard?.cardId === "BT6-112")).toBe(true);
    expect(s.state.memory).toBe(1);
  });

  it("charges five for the logged two-copy hand play with seven trash reducers", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "BT6-112", as: "played" },
          { card: "BT6-112", as: "otherCopy" },
        ],
        trash: ["BT6-112", "BT6-095", "ST14-12", "ST14-12", "BT9-097", "BT9-097", "BT9-097"],
      },
    });
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard.cardId === "BT6-112"));

    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("otherCopy").instanceId)).toBe(true);
  });

  it("does not reduce another Three Musketeers card while BeelStarmon is in hand", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "BT6-112", as: "beelstarmon" },
          { card: "BT6-017", as: "magnaKidmon" },
        ],
        trash: Array.from({ length: 10 }, () => "BT6-095"),
      },
    });
    s.state.memory = 12;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("magnaKidmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT6-017"));

    expect(s.state.memory).toBe(0);
  });

  it("uses a black Three Musketeers Option through that Option's own color waiver", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT6-112", as: "beelstarmon" }],
          trash: [{ card: "BT6-105", as: "blackOption" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "deleted" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    const optionId = s.inst("blackOption").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("beelstarmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === optionId) &&
        s.state.players[1]!.battleArea.length === 0,
      5000,
    );

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
  });

  it("returns but cannot use an ordinary blue cost-7 Option without a blue source", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT6-112", as: "beelstarmon" }],
          trash: [{ card: "BT1-101", as: "blueOption" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    const optionId = s.inst("blueOption").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("beelstarmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === optionId));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(false);
  });

  it("does not offer Options whose cost only becomes 7 when they would be used", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT6-112", as: "beelstarmon" },
            { card: "BT7-100", as: "qualialiseBlast" },
            { card: "BT11-108", as: "dgDimension" },
          ],
          battleArea: ["BT3-095", "BT2-087"],
          security: 7,
        },
        1: { battleArea: [{ card: "BT1-014", as: "stacked", under: ["BT1-009"] }] },
      },
      { autoSelectCards: true, declineDigiXros: true },
    );
    const conditionalCostIds = [s.inst("qualialiseBlast").instanceId, s.inst("dgDimension").instanceId];
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("beelstarmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT6-112"));
    await settle();

    const offeredIds = s.decisions.flatMap(
      ({ req }) => (req.options?.candidateInstanceIds as string[] | undefined) ?? [],
    );
    for (const instanceId of conditionalCostIds) {
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === instanceId)).toBe(true);
      expect(offeredIds).not.toContain(instanceId);
    }
    expect(s.perm("stacked").stack).toHaveLength(1);
    expect(s.perm("stacked").currentDP).toBe(4000);
  });

  it("digivolves from a legal purple level-5 stack without triggering the hand-play effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT6-076", as: "base" }],
        hand: [{ card: "BT6-112", as: "beelstarmon" }],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("beelstarmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT6-112");

    expect(s.perm("base").topCard.cardId).toBe("BT6-112");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT6-076"]);
    expect(s.state.memory).toBe(0);
  });
});

describe("BT6-112 hand play-cost reduction stays off the battle area", () => {
  it("survives its own play-cost-7 sweep while another copy waits in hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT6-112", as: "fieldBeelstarmon" },
            { card: "BT1-009", as: "cheapAlly" },
          ],
          hand: [
            { card: "BT6-112", as: "handBeelstarmon" },
            { card: "BT6-105", as: "sweep" },
          ],
          trash: ["BT6-095", "BT6-095", "ST14-12", "ST14-12", "BT9-097", "BT9-097"],
        },
        1: { battleArea: [{ card: "BT1-014", as: "opponentDigimon" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    const fieldBeelstarmonId = s.perm("fieldBeelstarmon").permanentId;
    const cheapAllyInstanceId = s.perm("cheapAlly").topCard.instanceId;
    const opponentInstanceId = s.perm("opponentDigimon").topCard.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sweep").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === opponentInstanceId));
    await settle();

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([fieldBeelstarmonId]);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === cheapAllyInstanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("handBeelstarmon").instanceId)).toBe(
      true,
    );
    expect(s.state.memory).toBe(0);
  });

  it("survives the play-cost-7 sweep its On Play uses while another copy waits in hand", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT6-112", as: "playedBeelstarmon" },
            { card: "BT6-112", as: "handBeelstarmon" },
          ],
          trash: [{ card: "BT6-105", as: "sweep" }, "BT6-095", "ST14-12", "ST14-12", "BT9-097", "BT9-097"],
        },
        1: { battleArea: [{ card: "BT1-014", as: "opponentDigimon" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    const sweepId = s.inst("sweep").instanceId;
    const playedInstanceId = s.inst("playedBeelstarmon").instanceId;
    const opponentInstanceId = s.perm("opponentDigimon").topCard.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: playedInstanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.trash.some((card) => card.instanceId === opponentInstanceId) &&
        s.state.players[0]!.trash.some((card) => card.instanceId === sweepId),
    );
    await settle();

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([playedInstanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });
});

describe("BT6-112 BeelStarmon — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;
  const playBeelStarmon = async (s: Setup) => {
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("beelstarmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT6-112"));
    await settle();
  };
  const handHas = (s: Setup, instanceId: string) =>
    s.state.players[0]!.hand.some((card) => card.instanceId === instanceId);
  const trashHas = (s: Setup, seat: 0 | 1, instanceId: string) =>
    s.state.players[seat]!.trash.some((card) => card.instanceId === instanceId);
  const offeredInstanceIds = (s: Setup) =>
    s.decisions.flatMap(({ req }) => (req.options?.candidateInstanceIds as string[] | undefined) ?? []);

  it("cannot ignore a cost-7 Option's color requirement (Q1500)", async () => {
    const useHowlingCrusher = async (blueSource: boolean) => {
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "BT6-112", as: "beelstarmon" }],
            trash: [{ card: "BT1-101", as: "blueOption" }],
            battleArea: blueSource ? ["BT15-025"] : [],
          },
          1: { battleArea: [{ card: "BT1-014", as: "stacked", under: ["BT1-009"] }] },
        },
        { autoSelectCards: true, declineDigiXros: true },
      );
      await playBeelStarmon(s);
      return { s, optionId: s.inst("blueOption").instanceId };
    };

    const withoutBlue = await useHowlingCrusher(false);
    expect(handHas(withoutBlue.s, withoutBlue.optionId)).toBe(true);
    expect(withoutBlue.s.perm("stacked").stack).toHaveLength(1);

    const withBlue = await useHowlingCrusher(true);
    expect(trashHas(withBlue.s, 0, withBlue.optionId)).toBe(true);
    expect(withBlue.s.perm("stacked").stack).toHaveLength(0);
  });

  it("cannot use Options that only cost 7 when used, but can use Glorious Burst reduced to 7 in hand (Q1501)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT6-112", as: "beelstarmon" },
            { card: "BT7-100", as: "qualialiseBlast" },
            { card: "BT11-108", as: "dgDimension" },
          ],
          battleArea: ["BT3-095", "BT2-087"],
          security: 7,
        },
        1: { battleArea: [{ card: "BT1-014", as: "stacked", under: ["BT1-009"] }] },
      },
      { autoSelectCards: true, declineDigiXros: true },
    );
    const conditionalCostIds = [s.inst("qualialiseBlast").instanceId, s.inst("dgDimension").instanceId];
    await playBeelStarmon(s);

    for (const instanceId of conditionalCostIds) {
      expect(handHas(s, instanceId)).toBe(true);
      expect(offeredInstanceIds(s)).not.toContain(instanceId);
    }
    expect(s.perm("stacked").stack).toHaveLength(1);
    expect(s.perm("stacked").currentDP).toBe(4000);

    const glorious = setupEngine(
      {
        0: {
          hand: [
            { card: "BT6-112", as: "beelstarmon" },
            { card: "BT2-099", as: "gloriousBurst" },
          ],
          battleArea: ["BT2-087", "BT2-087"],
        },
        1: { battleArea: [{ card: "BT1-014", as: "target" }] },
      },
      { autoSelectCards: true, declineDigiXros: true },
    );
    const gloriousBurstId = glorious.inst("gloriousBurst").instanceId;
    const targetInstanceId = glorious.perm("target").topCard.instanceId;
    await playBeelStarmon(glorious);

    expect(trashHas(glorious, 0, gloriousBurstId)).toBe(true);
    expect(trashHas(glorious, 1, targetInstanceId)).toBe(true);
  });
});
