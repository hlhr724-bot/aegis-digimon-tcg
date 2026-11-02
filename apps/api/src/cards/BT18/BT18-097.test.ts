import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import { setupScenario } from "#api/engine/testkit/scenario";
import boundaryFixture from "#api/engine/scenarios/magna-requires-five-tamer-sources.fixture";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT18-097.js";

describe("BT18-097 Dark to Light, Thunder to Gunfire", () => {
  it("covers the five-card Hybrid placement and MagnaGarurumon alternative", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "PlaceUnder",
          target: {
            count: 5,
            upTo: true,
            from: ["hand", "trash"],
            filter: { distinctNames: true },
          },
          underFilter: { kind: ["Tamer"] },
        },
        {
          kind: "Digivolve",
          target: { filter: { kind: ["Tamer"], digivolutionCardsAtLeast: 5 } },
          payCost: false,
          from: ["hand", "trash"],
          ignoreRequirements: true,
          into: { nameOrTrait: [{ tokens: ["MagnaGarurumon"], match: "nameExact" }] },
        },
      ],
    });
  });

  it("naturally executes Main by placing distinct Hybrid names and freely evolving a five-card Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-088", as: "tamer" }, "BT2-052", "BT2-067"],
          hand: [
            { card: "BT18-097", as: "option" },
            { card: "BT18-063", as: "beetle" },
            { card: "BT18-064", as: "mercury" },
            { card: "BT18-066", as: "sephiroth" },
            { card: "BT18-067", as: "metal" },
            { card: "BT18-070", as: "wise" },
            { card: "BT18-042", as: "magna" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").topCard?.cardId === "BT18-042");

    expect(s.perm("tamer").topCard?.cardId).toBe("BT18-042");
    expect(s.perm("tamer").stack.filter((card) => card.cardId.startsWith("BT18-0")).length).toBeGreaterThanOrEqual(5);
    expect(s.state.memory).toBe(7);
  });

  it("does not treat duplicate Hybrid names as distinct", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-088", as: "tamer", under: ["BT18-063", "BT18-064", "BT18-066"] },
            "BT2-052",
            "BT2-067",
          ],
          hand: [
            { card: "BT18-097", as: "option" },
            { card: "BT18-063", as: "duplicateA" },
            { card: "BT18-063", as: "duplicateB" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));

    // Only one of the two Beetlemon copies is a distinct name, so the Tamer gains exactly one
    // card and the other copy stays in hand.
    expect(s.perm("tamer").stack.filter((card) => card.cardId === "BT18-063")).toHaveLength(2);
    expect(s.perm("tamer").stack).toHaveLength(4);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT18-063")).toBe(true);
  });

  it.each([4, 5])("requires five sources before the Option evolves a Tamer with %i cards", async (sourceCount) => {
    const s = setupScenario(
      {
        ...boundaryFixture,
        board: {
          ...boundaryFixture.board,
          0: {
            ...boundaryFixture.board[0],
            battleArea: [{ card: "AD1-023", as: "tamer", under: Array(sourceCount).fill("BT18-037") }],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Place"] },
    );
    await s.ready();
    s.state.phase = Phase.Main;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));

    expect(s.perm("tamer").topCard?.cardId).toBe(sourceCount === 5 ? "BT18-042" : "AD1-023");
    expect(s.perm("tamer").stack).toHaveLength(sourceCount);
    expect(s.state.players[0]!.security).toHaveLength(sourceCount === 5 ? 4 : 3);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("magna").instanceId)).toBe(
      sourceCount === 4,
    );
  });

  it("executes Security by playing an inherited-effect Tamer and returning this Option to hand through a real security check", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT18-097", as: "option" }], hand: [{ card: "BT18-088", as: "tamer" }] },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
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
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("tamer").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("tamer").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(true);
  });
});
