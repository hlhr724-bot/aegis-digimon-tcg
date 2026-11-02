import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT24-003.js";
import "../index.js";

describe("BT24-003 Tsunomon", () => {
  it.each([1, 4])(
    "Discord 1556821976922849360: discounts Jupitermon's variable cost with %s security remaining",
    async (securityCount) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "P-213", as: "host", under: ["BT24-003", "P-194"] },
              { card: "BT24-022", as: "attacker", under: ["BT24-031"] },
            ],
            hand: [{ card: "BT24-101", as: "jupitermon" }],
            security: Array.from({ length: securityCount + 1 }, () => "BT1-009"),
            deck: ["BT1-010", "BT1-011", "BT1-012"],
          },
          1: { security: ["BT1-009", "BT1-010", "BT1-011"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("host").topCard.cardId === "BT24-101");
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(s.perm("host").topCard.instanceId).toBe(s.inst("jupitermon").instanceId);
      expect(s.state.memory).toBe(10 - Math.max(0, securityCount - 1));
    },
  );

  it("matches the catalog identity", () => {
    expect(getCardDefinition("BT24-003")).toMatchObject({
      cardId: "BT24-003",
      nameEn: "Tsunomon",
      colors: ["Yellow"],
      kinds: ["DigiEgg"],
      level: 2,
      types: ["Lesser", "Iliad", "TS"],
    });
  });

  it("digivolves this Digimon into a Shaman from hand when your security is removed", () => {
    const inherited = compiled.effects.find((effect) => effect.isInherited);
    expect(inherited).toBeDefined();
    if (inherited === undefined) throw new Error("missing inherited effect");
    expect(inherited.frequency).toBe("OncePerTurn");
    const subTrigger = inherited.actions[0];
    if (subTrigger === undefined || subTrigger.kind !== "SubTrigger") throw new Error("missing security subtrigger");
    expect(subTrigger).toMatchObject({
      kind: "SubTrigger",
      event: "whenSecurityRemoved",
      fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
    });
    expect(subTrigger.actions[0]).toMatchObject({
      kind: "Digivolve",
      from: ["hand"],
      payCost: true,
      useAlternateCost: true,
      reduceCost: 1,
      optional: true,
      preserveOncePerTurnOnDecline: true,
      target: { filter: { isSelfRef: true } },
    });
  });

  it("digivolves its real stack into a hand Shaman for 1 less when own security is removed", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [{ card: "BT24-014", as: "shaman" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    expect(s.perm("host").topCard.cardId).toBe("P-194");
    expect(s.state.memory).toBe(5);

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await settle(() => s.perm("host").topCard.cardId === "BT24-014");

    expect(s.perm("host").topCard.instanceId).toBe(s.inst("shaman").instanceId);
    expect(s.state.memory).toBe(3);
  });

  it("may decline the reduced digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [{ card: "BT24-014", as: "shaman" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });

    expect(s.perm("host").topCard.cardId).toBe("P-194");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("shaman").instanceId);
    expect(s.state.memory).toBe(5);
  });

  it("does not evolve from natural own security removal when hand has no Shaman", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [
            { card: "BT1-060", as: "nonShaman" },
            { card: "BT24-093", as: "temple" },
          ],
          security: [{ card: "BT1-009", as: "originalSecurity" }],
          deck: [{ card: "BT1-010", as: "replacementSecurity" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("temple").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("originalSecurity").instanceId),
    );
    expect(s.perm("host").topCard.cardId).toBe("P-194");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("nonShaman").instanceId);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("replacementSecurity").instanceId,
    ]);
  });

  it("ignores a natural opponent security removal even with an eligible Shaman", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] },
            { card: "BT1-009", as: "attacker" },
          ],
          hand: [{ card: "BT24-014", as: "shaman" }],
          security: ["BT1-009"],
        },
        1: {
          security: [{ card: "BT1-009", as: "opponentSecurity" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("opponentSecurity").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.perm("host").topCard.cardId).toBe("P-194");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("shaman").instanceId);
  });

  it("handles own security removal through the production trash primitive", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [{ card: "BT24-014", as: "shaman" }],
          security: [{ card: "BT1-009", as: "removed" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).verb.trashFromSecurity(0, 1);
    await settle(() => s.perm("host").topCard.instanceId === s.inst("shaman").instanceId);

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(3);
  });

  it("triggers from a public Temple of Beginnings play removing your security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [
            { card: "BT24-014", as: "shaman" },
            { card: "BT24-093", as: "temple" },
          ],
          security: ["BT1-009"],
          deck: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("temple").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("host").topCard.instanceId === s.inst("shaman").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(6);
  });

  it("declines the optional evolution after a public Temple security removal", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [
            { card: "BT24-014", as: "shaman" },
            { card: "BT24-093", as: "temple" },
          ],
          security: [{ card: "BT1-009", as: "originalSecurity" }],
          deck: [{ card: "BT1-010", as: "replacementSecurity" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("temple").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("originalSecurity").instanceId),
    );
    expect(s.perm("host").topCard.cardId).toBe("P-194");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("shaman").instanceId);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("replacementSecurity").instanceId,
    ]);
    expect(s.state.memory).toBe(8);
  });

  it("survives a losing security battle with Barrier, then evolves and checks the extra security (Q5576/Q5585)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
          hand: [{ card: "BT24-014", as: "shaman" }],
          security: [{ card: "BT1-009", as: "barrierCost" }],
        },
        1: {
          security: [
            { card: "ST1-10", as: "strong" },
            { card: "BT1-009", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("shaman").instanceId);
    s.state.memory = 5;
    await s.ready();
    const hostId = s.perm("host").permanentId;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "barrierPrompt"));
    expect(s.events).toContainEqual({ kind: "barrierPrompt", permanentId: hostId });
    expect(s.engine.applyIntent(0, { type: "respondBarrier", permanentId: hostId, accept: true })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "barrierResolved"));
    await settle(() => s.perm("host").topCard.instanceId === s.inst("shaman").instanceId);
    await settle(() => s.events.filter((event) => event.kind === "securityChecked").length === 2);
    expect(s.perm("host").topCard.cardId).toBe("BT24-014");
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("barrierCost").instanceId)).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("strong").instanceId)).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("second").instanceId)).toBe(true);
    expect(
      s.events
        .filter((event) => event.kind === "securityChecked")
        .map((event) => (event.kind === "securityChecked" ? event.revealedCardId : undefined)),
    ).toEqual(["ST1-10", "BT1-009"]);
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT24-003", "BT24-033", "P-194"]);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === hostId)).toBe(true);
  });

  it("can be reached through two public legal TS evolution steps from the egg", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT24-003", as: "egg" },
        hand: [
          { card: "BT24-019", as: "level3" },
          { card: "BT24-034", as: "level4" },
        ],
        deck: [
          { card: "BT1-009", as: "drawAfterLevel3" },
          { card: "BT1-010", as: "drawAfterLevel4" },
        ],
      },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("level3").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.instanceId === s.inst("level3").instanceId);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawAfterLevel3").instanceId);
    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual(["BT24-003"]);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("level4").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.instanceId === s.inst("level4").instanceId);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawAfterLevel4").instanceId);
    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual(["BT24-003", "BT24-019"]);
  });

  it("activates while its inherited source is deeper in the evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-014", as: "host", under: ["BT24-003", "BT24-033", "P-194"] }],
          hand: [{ card: "BT24-101", as: "jupitermon" }],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await settle(() => s.perm("host").topCard.cardId === "BT24-101");

    expect(s.perm("host").topCard.cardId).toBe("BT24-101");
  });

  it("suppresses a second public security-removal attack and re-arms on the later owner turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] },
            { card: "BT24-022", as: "attacker1", under: ["BT24-031"] },
            { card: "BT24-022", as: "attacker2", under: ["BT24-031"] },
            { card: "BT24-022", as: "attacker3", under: ["BT24-031"] },
          ],
          hand: [
            { card: "BT24-014", as: "aegiochusmon" },
            { card: "BT24-101", as: "jupitermon" },
          ],
          security: ["BT1-009", "BT1-010", "BT1-011"],
          deck: ["BT1-012", "BT1-013", "BT1-014", "BT1-015"],
        },
        1: {
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker1").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT24-014");
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker2").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("host").topCard.cardId).toBe("BT24-014");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("jupitermon").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const laterTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker3").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT24-101");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT24-003", "BT24-033", "P-194", "BT24-014"]);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("jupitermon").instanceId)).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await laterTurn;
  });
});
