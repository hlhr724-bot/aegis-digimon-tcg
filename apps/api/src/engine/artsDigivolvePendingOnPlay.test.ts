import { describe, expect, it } from "vitest";
import { settle, setupEngine } from "./testkit/harness.js";
import "../cards/index.js";

describe("Arts Digivolve pending On Play source residency", () => {
  it("Q7430/Q7434: buries the played source before draining its pending On Play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-082", as: "whiteSource" }],
          hand: [
            { card: "EX13-065", as: "dualOption" },
            { card: "BT6-082", as: "sistermon" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: { battleArea: [{ card: "BT1-080", as: "target", dp: 20_000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: false, autoOrderTriggers: true, preferInstanceIds: preferred },
    );
    s.state.memory = 6;
    await s.ready();
    const deckBefore = s.state.players[0]!.deck.length;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("dualOption").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const handSelection = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: handSelection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("sistermon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" &&
        s.state.pendingDecision.decisionId !== handSelection.decisionId,
    );
    const decision = s.state.pendingDecision!;
    expect(decision.promptText).toContain("Arts Digivolve");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("sistermon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("sistermon").topCard.cardId === "EX13-065");
    await settle();

    expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 1);
    expect(
      s.events.some(
        (event) => event.kind === "effectResolved" && event.sourceCardId === "BT6-082" && event.timing === "OnPlay",
      ),
    ).toBe(false);
  });
});
