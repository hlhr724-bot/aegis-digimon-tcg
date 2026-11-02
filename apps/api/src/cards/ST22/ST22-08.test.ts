import { describe, it, expect } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

describe("ST22-08 [Security] delete the opponent's lowest-DP Digimon, then add this card to hand", () => {
  it("Main links to the chosen Digimon, then deletes an opponent Digimon within its DP", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "ST22-08", as: "option" }], battleArea: [{ card: "BT1-010", dp: 6000, as: "recipient" }] },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 4000, as: "lowDp" },
            { card: "BT1-010", dp: 8000, as: "highDp" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.every((perm) => perm.topCard?.cardId !== "BT1-009"));
    expect(s.perm("recipient").linked.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((perm) => perm.permanentId === s.perm("highDp").permanentId)).toBe(true);
  });

  it.each([
    { mine: [6000], deleted: "lowDp", kept: "highDp" },
    { mine: [9000, 3000], deleted: "highDp", kept: undefined },
  ])(
    "Main still deletes after declining the link, comparing to the first chosen Digimon ($mine)",
    async ({ mine, deleted, kept }) => {
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "ST22-08", as: "option" }],
            battleArea: mine.map((dp, index) => ({ card: "BT1-010", dp, as: `mine${index}` })),
          },
          1: {
            battleArea:
              kept === undefined
                ? [{ card: "BT1-010", dp: 8000, as: "highDp" }]
                : [
                    { card: "BT1-009", dp: 4000, as: "lowDp" },
                    { card: "BT1-010", dp: 8000, as: "highDp" },
                  ],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      const deletedId = s.perm(deleted).permanentId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.every((perm) => perm.permanentId !== deletedId));

      expect(s.state.players[0]!.battleArea.every((perm) => perm.linked.length === 0)).toBe(true);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
      expect(s.state.players[1]!.battleArea.map((perm) => perm.permanentId)).toEqual(
        kept === undefined ? [] : [s.perm(kept).permanentId],
      );
    },
  );

  it("deletes the lowest-DP opponent Digimon and moves the Option from security to hand", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "ST22-08", as: "option", faceUp: true }] },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 2000, as: "lowDp" },
            { card: "BT1-010", dp: 6000, as: "highDp" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const p0 = s.state.players[0]!;
    const optionId = s.inst("option").instanceId;
    const lowDpPermanentId = s.perm("lowDp").permanentId;
    const highDpPermanentId = s.perm("highDp").permanentId;
    const p1 = s.state.players[1]!;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("highDp").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.hand.some((c) => c.instanceId === optionId));

    expect(p1.battleArea.some((perm) => perm.permanentId === lowDpPermanentId)).toBe(false);
    expect(p1.battleArea.some((perm) => perm.permanentId === highDpPermanentId)).toBe(true);
    expect(p0.hand.some((c) => c.instanceId === optionId)).toBe(true);
    expect(p0.security.some((c) => c.instanceId === optionId)).toBe(false);
  });
});

describe("ST22-08 Offensive Plug-In V — KB Q&A rulings", () => {
  it("resolves its link effect as an effect of the Digimon it is linked to (Q5431)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST22-03", as: "host", linked: [{ card: "ST22-08", as: "linkCard" }] }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { security: ["ST1-02", "ST1-02"], deck: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    await advance(s.engine).runTurn(0);

    const linkEffect = s.events.find((event) => event.kind === "effectTriggered" && event.sourceCardId === "ST22-08");
    expect(linkEffect).toMatchObject({
      sourceInstanceId: s.inst("linkCard").instanceId,
      sourcePermanentId: hostId,
      printedTiming: "EndOfYourTurn",
    });
    expect(s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === hostId)).toBe(
      true,
    );
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("links by paying its link cost while Option use is prohibited (Q5432)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "ST22-07", as: "tamer" },
          { card: "ST22-03", as: "host" },
        ],
        hand: [{ card: "ST22-08", as: "option" }],
      },
      1: {
        battleArea: [{ card: "BT11-095", as: "whiteSource" }],
        hand: [{ card: "EX1-072", as: "shutdown" }],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 6;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("shutdown").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("shutdown").instanceId));
    s.state.turnSeat = 0;
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "play-prohibited",
    });
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("option").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.length === 1);
    expect(s.perm("host").linked.map((card) => card.instanceId)).toEqual([s.inst("option").instanceId]);
    expect(s.state.memory).toBe(3);
  });

  it.each([true, false])(
    "cannot go on top of security for [Sakuyamon: Maid Mode] after linking itself (linked=%s) (Q5451)",
    async (acceptLink) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "ST22-04", as: "host" }],
            hand: [
              { card: "BT10-041", as: "maidMode" },
              { card: "ST22-08", as: "plugIn" },
            ],
            security: [{ card: "BT1-090", as: "security" }],
          },
          1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 1000 }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: acceptLink ? [] : ["Link"] },
      );
      s.state.memory = 5;
      await s.ready();
      const plugInId = s.inst("plugIn").instanceId;

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("host").permanentId,
          instanceId: s.inst("maidMode").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.players[0]!.hand.some((card) => card.instanceId === plugInId));
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.perm("host").linked.some((card) => card.instanceId === plugInId)).toBe(acceptLink);
      expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(
        acceptLink ? [s.inst("security").instanceId] : [plugInId, s.inst("security").instanceId],
      );
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === plugInId)).toBe(false);
    },
  );
});
