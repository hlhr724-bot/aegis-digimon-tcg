import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const opponentStack = { card: "BT2-064", as: "target", under: ["BT2-052", "BT10-062", "BT10-064"] };

describe("Artiomon protection, Option activation and Doom Buster", () => {
  it.each([
    ["BT26-057", true, 3],
    ["ST5-10", false, 4],
  ])("digivolves from %s (alternate: %s) for %i", async (base, useAlternateCost, cost) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-067", as: "card" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-067" && !s.state.pendingDecision);
    expect(s.state.memory).toBe(10 - cost);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Raid", "Piercing", "Engage"]));
  });

  it("rejects the alternate evolution from a level 5 without Glowing Dawn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-058", as: "base" }], hand: [{ card: "BT27-067", as: "card" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it.each([
    ["BT1-009", false],
    ["ST5-10", true],
    ["BT27-077", true],
  ])("can't be played and can be used as an Option with %s only when black or Glowing Dawn", async (ally, usable) => {
    const s = setupEngine(
      { 0: { battleArea: [ally], hand: [{ card: "BT27-067", as: "card" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }).ok,
    ).toBe(usable);
  });

  it("de-digivolves 2, then unsuspends and buffs the same chosen Digimon until the turn ends", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-077", as: "other", suspended: true },
            { card: "BT27-058", as: "chosen", suspended: true },
          ],
          hand: [{ card: "BT27-067", as: "card" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [opponentStack], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        declinePrompts: ["Arts Digivolve"],
      },
    );
    preferred.push(s.perm("chosen").permanentId, s.perm("chosen").topCard.instanceId);
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("other").permanentId, s.perm("chosen").permanentId]);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-067") && !s.state.pendingDecision);
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.perm("chosen").isSuspended).toBe(false);
    expect(s.perm("chosen").currentDP).toBe(10000);
    expect(s.perm("other").isSuspended).toBe(true);
    expect(s.perm("other").currentDP).toBe(5000);
    expect(s.state.memory).toBe(5);
    expect(
      s.decisions.filter(({ req }) => req.sourceCardId === "BT27-067" && req.kind === "chooseTargets"),
    ).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("chosen").currentDP).toBe(5000);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Arts Digivolves a Glowing Dawn level 5 into itself after use", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-057", as: "base" }],
          hand: [{ card: "BT27-067", as: "card" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [opponentStack] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.resolvingOption && !s.state.pendingDecision);
    expect(s.perm("base").topCard.cardId).toBe("BT27-067");
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.state.memory).toBe(5);
  });

  it("stays by trashing 2 face-down Tamer cards, which then lets it activate Doom Buster", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-067", as: "source", suspended: true },
            {
              card: "BT1-089",
              as: "tamer",
              under: [
                { card: "BT1-009", faceUp: false },
                { card: "BT1-009", faceUp: false },
              ],
            },
          ],
        },
        1: { battleArea: [opponentStack] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(0);
    await settle(() => s.perm("target").stack.length === 1 && !s.state.pendingDecision);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.perm("source").isSuspended).toBe(false);
    expect(s.perm("source").currentDP).toBe(17000);
  });

  it("leaves when only 1 face-down Tamer card is available", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-067", as: "source" },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(1);
    expect(s.perm("tamer").stack).toHaveLength(1);
  });

  it("prevents leaving only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-067", as: "source" },
            {
              card: "BT1-089",
              as: "tamer",
              under: Array.from({ length: 4 }, () => ({ card: "BT1-009", faceUp: false })),
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(0);
    await settle(() => !s.state.pendingDecision);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId], "byEffect")).toBe(1);
    expect(s.perm("tamer").stack).toHaveLength(2);
  });

  it.each([true, false])(
    "may activate Doom Buster when an effect trashes Tamer sources (accept: %s)",
    async (accept) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT27-067", as: "source", suspended: true },
              { card: "BT1-089", as: "tamer", under: [{ card: "BT1-009", as: "under", faceUp: false }] },
            ],
          },
          1: { battleArea: [opponentStack] },
        },
        { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
      );
      await s.ready();
      await advance(s.engine).verb.trashDigivolutionCards(s.perm("tamer").permanentId, [s.inst("under").instanceId], 0);
      await settle(() => !s.state.pendingDecision);
      expect(s.perm("target").stack).toHaveLength(accept ? 1 : 3);
      expect(s.perm("source").isSuspended).toBe(!accept);
    },
  );

  it("activates Doom Buster on its opponent's attacker after a block switches the target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-067", as: "source" },
            { card: "ST6-08", as: "blocker" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT2-064", as: "attacker", under: ["BT10-062", "BT10-064"] }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Attack with this Digimon"] },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "combatResolved") && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash.map((c) => c.cardId)).toEqual(expect.arrayContaining(["BT2-064", "BT10-064"]));
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
