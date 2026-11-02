import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("Arts Digivolve rule entry", () => {
  it("still lets Imperialdramon return a Digimon that digivolved through an attack effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "base" }],
          deck: ["BT1-083", "BT1-010", "BT1-010", "BT1-010"],
        },
        1: { battleArea: [{ card: "AD1-024", as: "fighter", suspended: true }], security: ["BT1-010"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, autoChooseOption: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "digivolved" && event.cardId === "BT1-083"));
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.deck.at(-1)?.cardId).toBe("BT1-083");
    expect(s.perm("fighter").isSuspended).toBe(false);
  });

  it.each([true, false])(
    "preserves Imperialdramon's suspend response without an effect-entry return (Arts: %s)",
    async (arts) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX13-051", as: "base" }],
            hand: [
              { card: "BT26-056", as: "dual" },
              { card: "BT1-010", as: "discard" },
            ],
            deck: ["BT1-010", "BT1-010", "BT1-010"],
          },
          1: { battleArea: [{ card: "AD1-024", as: "fighter", suspended: true }] },
        },
        { autoSelectCards: true, autoAcceptOptional: true, autoChooseOption: true },
      );
      s.state.memory = 10;
      await s.ready();
      const deckBefore = s.state.players[0]!.deck.length;
      const intent = arts
        ? { type: "playCard" as const, instanceId: s.inst("dual").instanceId, useAs: "option" as const }
        : {
            type: "digivolve" as const,
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("dual").instanceId,
          };
      expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "digivolved" && event.cardId === "BT26-056"));
      await settle(() => !s.perm("fighter").isSuspended && s.state.pendingDecision === undefined);
      await settle();

      expect(s.state.players[0]!.battleArea).toHaveLength(1);
      expect(s.perm("base").topCard.cardId).toBe("BT26-056");
      expect(s.perm("base").isSuspended).toBe(true);
      expect(s.perm("base").enteredByEffect).toBe(false);
      expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 1);
      expect(s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("dual").instanceId)).toBe(false);
      expect(
        s.decisions.some(({ req }) => req.sourceCardId === "AD1-024" && req.promptText?.includes("Then, if")),
      ).toBe(false);
    },
  );
});
