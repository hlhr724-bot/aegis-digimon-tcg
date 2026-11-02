import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { hasRegisteredCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX7-072.js";
import "../index.js";

async function stopLoop(s: ReturnType<typeof setupEngine>, loop: Promise<void>, seat: 0 | 1): Promise<void> {
  if (!s.state.gameOver && !s.engine.applyIntent(seat, { type: "surrender" }).ok)
    throw new Error("failed to stop turn loop");
  await loop;
}

describe("EX7-072 Seventh Fascination", () => {
  it("matches the catalog and fully registered IR", () => {
    expect(getCardDefinition("EX7-072")).toMatchObject({
      cardId: "EX7-072",
      nameEn: "Seventh Fascination",
      colors: ["Purple"],
      kinds: ["Option"],
      playCost: 7,
      types: ["Seven Great Demon Lords"],
      securityEffectText: "[Security] Delete 1 of your opponent's unsuspended Digimon.",
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(hasRegisteredCompiledCard("EX7-072")).toBe(true);
  });

  it("maps the Trash trigger/cost, global delayed grant, and Security deletion", () => {
    expect(compiled.effects?.find((entry) => entry.isFromTrash)?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenOneOfYoursDigivolves",
      actions: [{ kind: "ActivateMain", cost: { kind: "return", to: "deckBottom" } }],
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "Main")?.actions[0]).toMatchObject({
      kind: "GainTriggeredEffect",
      target: { count: "all" },
      gainedTrigger: "EndOfYourTurn",
      gainedActions: [{ kind: "Delete", target: { filter: { controller: "mine" }, count: 1 } }],
      duration: "untilOpponentTurnEnd",
    });
    expect(compiled.effects?.find((entry) => entry.isSecurity)?.actions[0]).toMatchObject({
      kind: "Delete",
      target: { filter: { unsuspended: true } },
    });
  });

  it("publicly grants every opposing Digimon its end-turn self-side deletion", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-072", as: "option" }],
          battleArea: [{ card: "EX7-061", as: "purple" }],
          deck: ["BT1-009", "BT1-010"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
          deck: ["BT1-011", "BT1-012"],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 2);
    expect([...s.perm("first").grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);
    expect([...s.perm("second").grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("first").instanceId, s.inst("second").instanceId]),
    );
    await stopLoop(s, loop, 0);
  });

  it("CR 15-11-2-2: also grants the end-turn deletion to an opposing Digimon that enters afterwards", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX7-072", as: "option" }], battleArea: [{ card: "EX7-061", as: "purple" }] },
        1: { battleArea: [{ card: "BT1-009", as: "first" }], hand: [{ card: "BT1-010", as: "late" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 1);

    await advance(s.engine).verb.playInstances([s.inst("late").instanceId]);
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 2);

    const late = s.state.players[1]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("late").instanceId,
    )!;
    expect([...late.grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);
  });

  it("Q5728/Q5729: pays the trash cost on exact Lilithmon X evolution and activates Main", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-083", as: "base" }],
          trash: [{ card: "EX7-072", as: "option" }],
          hand: [{ card: "EX7-061", as: "lilithmonXa" }],
          deck: ["BT1-009", "BT1-010"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponent" }],
          deck: ["BT1-010", "BT1-011"],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lilithmonXa").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.deck.at(-1)?.instanceId === s.inst("option").instanceId);
    expect(s.perm("base").topCard?.instanceId).toBe(s.inst("lilithmonXa").instanceId);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toContain("BT11-083");
    expect(observe(s.engine).subscriptions("endOfTurn")).toHaveLength(1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
      s.inst("opponent").instanceId,
    );
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("opponent").instanceId);
    await stopLoop(s, loop, 0);
  });

  it("does not trigger from trash for near-name Lilithmon without X Antibody", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-083", as: "base" }],
          trash: [{ card: "EX7-072", as: "option" }],
          hand: [{ card: "BT11-087", as: "lilithmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lilithmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.instanceId === s.inst("lilithmon").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("option").instanceId);
  });

  it("allows the optional trash activation cost to be refused", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-083", as: "base" }],
          trash: [{ card: "EX7-072", as: "option" }],
          hand: [{ card: "EX7-061", as: "lilithmonXa" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lilithmonXa").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.instanceId === s.inst("lilithmonXa").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("option").instanceId);
    expect(observe(s.engine).subscriptions("endOfTurn")).toHaveLength(0);
  });

  it("Q3871: grants an immune Digimon the effect but does not trigger it while immunity applies", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-072", as: "option" }],
          battleArea: [{ card: "EX7-061", as: "purple" }],
          deck: ["BT1-009", "BT1-010"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX2-007", as: "immune", suspended: true },
            { card: "BT1-009", as: "ordinary" },
          ],
          deck: ["BT1-010", "BT1-011"],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("ordinary").instanceId);
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 2);
    expect([...s.perm("immune").grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);
    expect([...s.perm("ordinary").grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
      s.inst("immune").instanceId,
    );
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("ordinary").instanceId);
    expect([...s.perm("immune").grantedEffectTexts]).toEqual([]);
    await stopLoop(s, loop, 0);
  });

  it("Q3872: deletion from the gained effect does not trigger Partition", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-072", as: "option" }],
          battleArea: [{ card: "EX7-061", as: "purple" }],
          deck: ["BT1-009", "BT1-010"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "AD1-011", as: "partition", under: ["BT12-021", "BT12-047"] }],
          deck: ["BT1-010", "BT1-011"],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["AD1-011", "BT12-021", "BT12-047"]),
    );
    await stopLoop(s, loop, 0);
  });

  it("Security deletes an unsuspended Digimon but preserves the suspended attacker", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "EX7-072", as: "option" }, "BT1-009"] },
        1: {
          battleArea: [
            { card: "EX7-037", as: "attacker" },
            { card: "BT1-009", as: "victim" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
      s.inst("attacker").instanceId,
    );
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("victim").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });
});
