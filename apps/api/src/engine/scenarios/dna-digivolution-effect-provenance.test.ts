import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/dna-digivolution-effect-provenance.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, drainMicrotasks, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("DNA digivolution effect provenance", () => {
  it.each([false, true])("Bacchusmon deletes only for effect DNA (effect=%s)", async (byEffect) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    const lowestId = s.inst("lowest").instanceId;
    const higherId = s.inst("higher").instanceId;
    const resultId = s.inst("paildramon").instanceId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(
          0,
          byEffect
            ? { type: "endPhase" }
            : {
                type: "dnaDigivolve",
                instanceId: resultId,
                materialPermanentIds: [s.perm("blue").permanentId, s.perm("green").permanentId],
              },
        ),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === resultId) && !s.state.pendingDecision,
      );
      if (byEffect) {
        await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Main && !s.state.pendingDecision);
      }
      await drainMicrotasks();
      const result = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === resultId)!;
      expect(result.stack.map((card) => card.cardId)).toEqual(["BT1-073", "ST9-08", "BT1-037"]);
      expect(s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === lowestId)).toBe(!byEffect);
      expect(s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === higherId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === lowestId)).toBe(byEffect);
      expect(s.perm("bacchusmon").isSuspended).toBe(true);
      expect(result.enteredByEffect).toBe(byEffect);
      expect(s.state.pendingDecision).toBeUndefined();
      assertNoLoudGap(s);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });
});

it("preserves DNA-only When Digivolving effects on a manual DNA", async () => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        1: {
          battleArea: [{ card: "BT1-009", as: "returnable" }],
          deck: Array.from({ length: 10 }, () => "BT1-010"),
          security: 5,
        },
      },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  const targetId = s.inst("returnable").instanceId;
  const resultId = s.inst("paildramon").instanceId;
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        instanceId: resultId,
        materialPermanentIds: [s.perm("blue").permanentId, s.perm("green").permanentId],
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[1]!.deck.some((card) => card.instanceId === targetId) && !s.state.pendingDecision,
    );
    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(targetId);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === targetId)).toBe(false);
    expect(s.perm("bacchusmon").isSuspended).toBe(false);
    assertNoLoudGap(s);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
