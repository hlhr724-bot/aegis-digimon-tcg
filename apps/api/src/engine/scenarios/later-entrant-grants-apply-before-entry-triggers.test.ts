import "../../cards/index.js";
import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

describe("later-entrant grants apply before the entrant's own triggers", () => {
  it("gives a played Digimon JetMervamon's Blocker before its On Play triggers", async () => {
    const blockerWhenOnPlayTriggers: boolean[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-084", as: "jet", under: ["BT10-060"] }],
          hand: [{ card: "BT24-035", as: "entrant" }],
        },
        1: { battleArea: ["BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: (event) => {
          if (event.kind !== "effectTriggered" || event.sourceCardId !== "BT24-035") return;
          const entrant = s.state.players[0]!.battleArea.find(
            ({ topCard }) => topCard.instanceId === s.inst("entrant").instanceId,
          );
          if (entrant !== undefined) blockerWhenOnPlayTriggers.push(observe(s.engine).hasKeyword(entrant, "Blocker"));
        },
      },
    );
    s.state.memory = 10;
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jet"));

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("entrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => blockerWhenOnPlayTriggers.length > 0);

    expect(blockerWhenOnPlayTriggers).toEqual([true]);
  });

  it("gives an opponent's Digimon played afterwards Ice Wall's aura before its On Play triggers, without an order prompt", async () => {
    const auraWhenOnPlayTriggers: boolean[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX1-068", as: "iceWall" }],
          battleArea: [{ card: "AD1-006", as: "blueSource" }],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          hand: [{ card: "BT24-035", as: "entrant" }],
          battleArea: ["BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: (event) => {
          if (event.kind !== "effectTriggered" || event.sourceCardId !== "BT24-035") return;
          const entrantInstanceId = s.inst("entrant").instanceId;
          auraWhenOnPlayTriggers.push(
            advance(s.engine)
              .ledgers.continuous.listCustomEffectGrants()
              .some((grant) => grant.instanceId === entrantInstanceId),
          );
        },
      },
    );
    s.state.memory = 20;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("iceWall").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX1-068"));
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("entrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => auraWhenOnPlayTriggers.length > 0);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    expect(auraWhenOnPlayTriggers).toEqual([true]);
    expect(
      s.events.some(
        (event) => event.kind === "effectTriggered" && event.effectKey.includes("later entrant from EX1-068"),
      ),
    ).toBe(false);
  });
});
