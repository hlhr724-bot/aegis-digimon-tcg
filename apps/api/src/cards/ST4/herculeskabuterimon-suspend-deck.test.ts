import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./ST4-01.js";
import "./ST4-04.js";
import "./ST4-11.js";
import "./ST4-13.js";
import "./ST4-14.js";

describe("ST4 HerculesKabuterimon suspend deck gauntlet", () => {
  it("chains Digi-Burst, Izzy, battle rewards, and Piercing without checking trashed security", async () => {
    const chosenSources: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "ST4-13",
              as: "hercules",
              under: ["ST4-01", "ST4-04", "ST4-11", "ST4-03", "ST4-08"],
            },
            { card: "ST4-14", as: "izzy" },
          ],
        },
        1: {
          battleArea: [{ card: "ST4-13", as: "opponentMega" }],
          security: [{ card: "BT1-001", as: "trashedSecurity" }, { card: "BT1-002", as: "checkedSecurity" }, "BT1-003"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: chosenSources },
    );
    await s.ready();
    const hercules = s.perm("hercules");
    chosenSources.push(
      ...hercules.stack
        .filter((card) => card.cardId === "ST4-03" || card.cardId === "ST4-08")
        .map((card) => card.instanceId),
    );
    const activation = (
      observe(s.engine).activatableEffects(hercules) as Array<{
        effectKey: string;
        description: string;
      }>
    ).find((entry) => /digi.?burst/i.test(entry.description));

    expect(activation).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: hercules.topCard.instanceId,
        effectKey: activation!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("opponentMega").isSuspended && s.perm("izzy").isSuspended && s.state.memory === 1, 1500);

    expect(s.state.memory).toBe(1);
    expect(hercules.stack.map((card) => card.cardId)).toEqual(["ST4-01", "ST4-04", "ST4-11"]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: hercules.permanentId,
        target: { kind: "permanent", permanentId: s.perm("opponentMega").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.players[1]!.battleArea.length === 0 &&
        s.state.players[1]!.security.length === 1 &&
        hercules.currentDP === getCardDefinition("ST4-13")!.dp + 3000,
      3000,
    );

    expect(hercules.currentDP).toBe(getCardDefinition("ST4-13")!.dp + 3000);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("trashedSecurity").instanceId)).toBe(
      true,
    );
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("checkedSecurity").instanceId)).toBe(
      true,
    );
    expect(
      s.events.filter((event) => event.kind === "securityChecked"),
      "MegaKabuterimon trashes one security without activating it (Q652); only Piercing checks",
    ).toHaveLength(1);
  });
});
