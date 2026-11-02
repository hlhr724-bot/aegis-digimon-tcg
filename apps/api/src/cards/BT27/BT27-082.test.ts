import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Nosferamon removal and Rampage Bullet", () => {
  it.each([true, false])("deletes only the lowest level on deletion, accepting Ascension: %s", async (ascend) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-082", as: "source", under: ["BT1-009"] }] },
        1: { battleArea: ["BT1-009", "BT1-060"], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: ascend, autoDeclineOptional: !ascend },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(
      ascend ? ["BT1-009", "BT1-060"] : ["BT1-060"],
    );
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security.some((c) => c.cardId === "BT27-082")).toBe(ascend);
    expect(s.state.players[0]!.trash.some((c) => c.cardId === "BT1-009")).toBe(true);
  });

  it("trashes security when the deletion effect has no target", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-082", as: "source" }] }, 1: { security: ["BT1-009", "BT1-060"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
  });

  it("resolves the printed Security removal before security battle", async () => {
    const s = setupEngine(
      {
        0: { security: ["BT27-082"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }, "BT1-060"], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-082") && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-060"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it.each(["BT27-077", "BT26-095", "BT27-080", "BT1-009"])(
    "revives only BEATBREAK cards costing at most four: %s",
    async (revival) => {
      const s = setupEngine(
        {
          0: { battleArea: ["ST6-08"], hand: [{ card: "BT27-082", as: "option" }], trash: [revival] },
          1: { battleArea: ["BT1-083", "BT1-060"] },
        },
        { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
      );
      await s.ready();
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.players[0]!.resolvingOption && !s.state.pendingDecision);
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-060"]);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === revival)).toBe(
        ["BT27-077", "BT26-095"].includes(revival),
      );
      expect(s.state.memory).toBe(5);
    },
  );

  it.each(["BT27-080", "BT2-077"])("checks ordinary and alternate evolution requirements from %s", async (base) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base", under: ["BT27-077", "BT27-073"] }],
          hand: [{ card: "BT27-082", as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("card").instanceId,
    });
    expect(result.ok).toBe(true);
    await settle(() => s.perm("base").topCard.cardId === "BT27-082" && !s.state.pendingDecision);
    expect(s.state.memory).toBe(7);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-077", "BT27-073", base]);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Execute", "Ascension", "Retaliation"]));
  });

  it("uses Arts Digivolve on an off-color Glowing Dawn stack after reviving a Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-057", as: "base" }],
          hand: [{ card: "BT27-082", as: "option" }],
          trash: ["BT26-095"],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.resolvingOption && !s.state.pendingDecision);
    expect(s.perm("base").topCard.cardId).toBe("BT27-082");
    expect(s.state.memory).toBe(5);
  });

  it.each([0, 1, 2])("activates Option Main only with two payable bottom cards: %i", async (count) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-080", as: "base" },
            {
              card: "BT1-085",
              as: "tamer",
              under: Array.from({ length: count }, () => ({ card: "BT1-009", faceUp: false })),
            },
          ],
          hand: [{ card: "BT27-082", as: "card" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-083"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-082" && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(count === 2 ? 0 : 1);
    expect(s.perm("tamer").stack).toHaveLength(count === 2 ? 0 : count);
    expect(s.state.memory).toBe(7);
  });
  it.each([
    [6, true],
    [4, false],
  ])(
    "treats its directly activated Main as an Option effect against the protection granted at opponent memory %s",
    async (opponentMemory, deleted) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT27-080", as: "base" },
              {
                card: "BT1-085",
                as: "tamer",
                under: [
                  { card: "BT1-009", faceUp: false },
                  { card: "BT1-010", faceUp: false },
                ],
              },
            ],
            hand: [{ card: "BT27-082", as: "nosferamon" }],
            deck: Array<string>(12).fill("BT1-009"),
            security: 3,
          },
          1: {
            battleArea: [{ card: "BT25-019", as: "protected" }],
            deck: Array<string>(12).fill("BT1-009"),
            security: 3,
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = 1;
      s.state.memory = 10;
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(1);
        s.state.memory = -opponentMemory;
        expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("nosferamon").instanceId,
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.perm("base").topCard.cardId === "BT27-082" &&
            s.perm("tamer").stack.length === 0 &&
            s.state.pendingDecision === undefined,
        );
        expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-019")).toBe(
          !deleted,
        );
        expect(
          s.events.filter(
            (event) =>
              event.kind === "cardsMoved" &&
              event.optionUsed === true &&
              event.instanceIds.includes(s.inst("nosferamon").instanceId),
          ),
        ).toHaveLength(0);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );

  it("shares the paid activation between evolution and attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-080", as: "base" },
            {
              card: "BT1-085",
              as: "tamer",
              under: Array.from({ length: 4 }, () => ({ card: "BT1-009", faceUp: false })),
            },
          ],
          hand: [{ card: "BT27-082", as: "card" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: ["BT1-083"], security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && !s.state.pendingDecision);
    expect(s.perm("tamer").stack).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.perm("tamer").stack).toHaveLength(2);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("can refuse the two-card payment without consuming Tamer cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-080", as: "base" },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-009", faceUp: false },
                { card: "BT1-009", faceUp: false },
              ],
            },
          ],
          hand: [{ card: "BT27-082", as: "card" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-083"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-082" && !s.state.pendingDecision);
    expect(s.perm("tamer").stack).toHaveLength(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("refuses direct play and the Option without a matching color or Glowing Dawn", async () => {
    const s = setupEngine({ 0: { battleArea: ["BT1-009"], hand: [{ card: "BT27-082", as: "card" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });
  it("rejects evolution from a yellow level five without Glowing Dawn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-058", as: "base" }], hand: [{ card: "BT27-082", as: "card" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.perm("base").topCard.cardId).toBe("BT1-058");
    expect(s.state.memory).toBe(10);
  });
  it("highlights the Then revival clause separately from Option deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["ST6-08"],
          hand: [{ card: "BT27-082", as: "option" }],
          trash: ["BT27-077", "BT26-095"],
        },
        1: { battleArea: ["BT1-083", "BT1-084"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-082") && !s.state.pendingDecision);
    const options = s.decisions.filter((d) => d.req.sourceCardId === "BT27-082").map((d) => d.req.options);
    expect(options).toContainEqual(
      expect.objectContaining({
        timing: "Main",
        effectTextEmphasis: "[Main] Delete 1 of your opponent's level 6 or higher Digimon.",
      }),
    );
    expect(options).toContainEqual(
      expect.objectContaining({
        timing: "Main",
        effectTextEmphasis:
          "Then, you may play 1 play cost 4 or lower [BEATBREAK] trait card from your trash without paying the cost.",
      }),
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-077")).toBe(true);
  });
});
