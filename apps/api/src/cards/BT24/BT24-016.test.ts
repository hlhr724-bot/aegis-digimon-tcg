import { EffectTiming, type CardInstance } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { effectsOf } from "../../engine/effects/collect.js";
import type { CardSource } from "../../engine/effects/CardSource.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT24-016.js";
import "../index.js";

function handMainEffectKey(s: ReturnType<typeof setupEngine>, instanceId: string): string | undefined {
  const card = s.state.players[0]!.hand.find((entry) => entry.instanceId === instanceId);
  if (!card) return undefined;
  const source = (s.engine as unknown as { cardSourceOf(card: CardInstance): CardSource }).cardSourceOf(card);
  return effectsOf(EffectTiming.OnDeclaration, source).find((effect) => effect.effectKey.startsWith("BT24-016/"))
    ?.effectKey;
}

describe("BT24-016 Lamiamon", () => {
  it("uses the Dimetromon placement cost to digivolve an Elizamon host", () => {
    const main = compiled.effects.find((effect) => effect.trigger === "Main")?.actions?.[0] as unknown as {
      cost: { target: { filter: { nameOrTrait: unknown } }; bindHostAs: string; position: string; kind: string };
      target: { fromSelectionRef: string };
    };
    expect(main).toMatchObject({
      kind: "Digivolve",
      from: ["hand"],
      payCost: true,
      costOverride: 3,
      ignoreRequirements: true,
    });
    expect(main.cost).toMatchObject({ kind: "place", bindHostAs: "bt24_016_elizamon", position: "bottom" });
    expect(main.cost.target.filter.nameOrTrait).toEqual([{ tokens: ["Dimetromon"], match: "name" }]);
    expect(main.target.fromSelectionRef).toBe("bt24_016_elizamon");
  });

  it("shares the once-per-turn opponent security manipulation", () => {
    const digivolving = compiled.effects.find((effect) => effect.trigger === "WhenDigivolving") as unknown as {
      sharedUseKey: string;
      frequency: string;
      actions: unknown;
    };
    const attacking = compiled.effects.find((effect) => effect.trigger === "WhenAttacking") as unknown as {
      sharedUseKey: string;
    };
    expect(digivolving.sharedUseKey).toBe(attacking.sharedUseKey);
    expect(digivolving.frequency).toBe("OncePerTurn");
    expect(digivolving.actions).toMatchObject([
      { kind: "SecurityManipulation", op: "addBottom", controller: "opponent", source: "hand" },
      { kind: "SecurityManipulation", op: "trashTop", controller: "opponent" },
    ]);
  });

  it("scopes its inherited play trigger to the opponent security stack", () => {
    const inherited = compiled.effects.find((effect) => effect.isInherited) as unknown as { actions: unknown[] };
    expect(inherited.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenSecurityRemoved",
      sourceFilter: { controller: "opponent" },
    });
  });

  it("places Dimetromon under Elizamon and digivolves for cost 2 after Elizamon's reduction (Q5586)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-016", as: "lamiamon" }],
          trash: [{ card: "BT24-012", as: "dimetromon" }],
          battleArea: [
            { card: "BT23-005", as: "elizamon" },
            { card: "BT24-082", as: "owen" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    const effectKey = handMainEffectKey(s, s.inst("lamiamon").instanceId);
    expect(effectKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("lamiamon").instanceId,
        effectKey: effectKey!,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("elizamon").topCard.instanceId === s.inst("lamiamon").instanceId);

    expect(s.perm("elizamon").stack.map((card) => card.instanceId)).toContain(s.inst("dimetromon").instanceId);
    expect(s.state.memory).toBe(3);
  });

  it("does not allow declining evolution after paying the Dimetromon placement cost", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-016", as: "lamiamon" }],
          trash: [{ card: "BT24-012", as: "dimetromon" }],
          battleArea: [
            { card: "BT23-005", as: "elizamon" },
            { card: "BT24-082", as: "owen" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    const effectKey = handMainEffectKey(s, s.inst("lamiamon").instanceId)!;
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("lamiamon").instanceId, effectKey }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("elizamon").topCard.instanceId).toBe(s.inst("lamiamon").instanceId);
    expect(s.state.memory).toBe(3);
  });

  it("cannot use the hand evolution without Owen Dreadnought", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-016", as: "lamiamon" }],
          trash: [{ card: "BT24-012", as: "dimetromon" }],
          battleArea: [{ card: "BT23-005", as: "elizamon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;

    await advance(s.engine).fireForInstance(EffectTiming.OnDeclaration, s.inst("lamiamon"));

    expect(s.perm("elizamon").topCard.cardId).toBe("BT23-005");
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("dimetromon").instanceId);
    expect(s.state.memory).toBe(5);
  });

  it("places an opponent hand card as bottom security, then trashes their top security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-016", as: "lamiamon" }] },
        1: {
          hand: [{ card: "BT4-022", as: "placed" }],
          security: [{ card: "BT4-022", as: "trashed" }],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("lamiamon"));

    expect(s.state.players[1]!.hand).toHaveLength(0);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("placed").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("trashed").instanceId);
  });

  it("lets the opponent choose which of their hand cards becomes their bottom security", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT24-016", as: "lamiamon" }] },
      1: {
        hand: [
          { card: "BT4-022", as: "kept" },
          { card: "BT4-022", as: "placed" },
        ],
        security: [{ card: "BT4-022", as: "trashed" }],
      },
    });
    await s.ready();

    const resolution = advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("lamiamon"));
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.state.pendingDecision!;
    expect(decision.seat).toBe(1);
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("placed").instanceId] },
      }),
    ).toEqual({ ok: true });
    await resolution;

    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("placed").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("trashed").instanceId]);
    expect(s.events).toContainEqual({
      kind: "cardsMoved",
      instanceIds: [s.inst("placed").instanceId],
      from: "hand",
      fromSeat: 1,
      to: "security",
      seat: 1,
    });
  });

  it("publicly attacks and places one opponent hand card under Security before trashing its top card", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-016", as: "lamiamon" }] },
        1: {
          hand: [
            { card: "BT4-022", as: "placed" },
            { card: "BT4-022", as: "kept" },
          ],
          security: [
            { card: "BT4-022", as: "trashed" },
            { card: "BT4-022", as: "remaining1" },
            { card: "BT4-022", as: "remaining2" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("lamiamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.perm("lamiamon").isSuspended).toBe(true);
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("remaining2").instanceId,
      s.inst("placed").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("trashed").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("shares one security-manipulation use between digivolving and attacking", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-016", as: "lamiamon" }] },
        1: {
          hand: [
            { card: "BT4-022", as: "first" },
            { card: "BT4-022", as: "second" },
          ],
          security: ["BT4-022", "BT4-022"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("lamiamon"));
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("lamiamon"));

    expect(s.state.players[1]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.players[1]!.trash).toHaveLength(1);
  });

  it("plays one 5000-DP Reptile from hand when opposing security is removed, once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST1-10", as: "host", under: ["BT24-016"] }],
          hand: [
            { card: "BT24-012", as: "eligible" },
            { card: "BT24-016", as: "tooLarge" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("host"));

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-012"));
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("eligible").instanceId,
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("tooLarge").instanceId);
  });

  it("plays the inherited Reptile from a public attack removing opponent security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST1-10", as: "host", under: ["BT24-016"] }],
          hand: [{ card: "BT24-012", as: "eligible" }],
        },
        1: { security: [{ card: "BT1-009", as: "security" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const securityId = s.inst("security").instanceId;
    const playedId = s.inst("eligible").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId));
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(securityId);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId)).toBe(true);
    expect(s.perm("host").stack.map((card) => card.cardId)).toContain("BT24-016");
  });
});

describe("BT24-016 Lamiamon — KB Q&A rulings", () => {
  async function activateOffenseTrainingDelay(s: ReturnType<typeof setupEngine>) {
    const [delay] = observe(s.engine).activatableEffects(s.perm("offenseTraining"));
    expect(delay).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("offenseTraining").topCard.instanceId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "P-103"));
    await settle(() => s.state.pendingDecision === undefined);
  }

  it("cannot fold its {Hand} [Main] digivolution into P-103 Offense Training's digivolve effect (Q5587)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-016", as: "lamiamon" }],
          trash: [{ card: "BT24-012", as: "dimetromonInTrash" }],
          battleArea: [
            { card: "P-103", as: "offenseTraining" },
            { card: "BT23-005", as: "elizamon" },
            { card: "BT24-082", as: "owen" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    await activateOffenseTrainingDelay(s);

    expect(s.perm("elizamon").topCard.cardId).toBe("BT23-005");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("lamiamon").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("dimetromonInTrash").instanceId);
    expect(s.state.memory).toBe(10);
  });

  it("digivolves through Offense Training only by its printed requirements, with no Dimetromon placed (Q5587)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-016", as: "lamiamon" }],
          trash: [{ card: "BT24-012", as: "dimetromonInTrash" }],
          battleArea: [
            { card: "P-103", as: "offenseTraining" },
            { card: "BT24-012", as: "levelFour" },
            { card: "BT24-082", as: "owen" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    await activateOffenseTrainingDelay(s);

    expect(s.perm("levelFour").topCard.instanceId).toBe(s.inst("lamiamon").instanceId);
    expect(s.perm("levelFour").stack.map((card) => card.instanceId)).not.toContain(
      s.inst("dimetromonInTrash").instanceId,
    );
    expect(s.state.memory).toBe(9);
  });

  it("resolves a [Security] effect before its inherited play on the same security check (Q5588)", async () => {
    let s: ReturnType<typeof setupEngine> | undefined;
    let opponentHandWhenPlayed: number | undefined;
    s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST1-10", as: "host", under: ["BT24-016"] }],
          hand: [{ card: "BT24-012", as: "reptile" }],
        },
        1: { security: [{ card: "BT1-097", as: "boringStorm" }], deck: ["BT1-010", "BT1-011"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent() {
          if (s === undefined || opponentHandWhenPlayed !== undefined) return;
          if (s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-012")) {
            opponentHandWhenPlayed = s.state.players[1]!.hand.length;
          }
        },
      },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s!.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s!.inst("reptile").instanceId,
      ),
    );

    expect(opponentHandWhenPlayed).toBe(2);
  });
});
