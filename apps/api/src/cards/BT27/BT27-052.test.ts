import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { playByAssembly } from "#api/engine/testkit/assembly";
import "#api/cards/index";

describe("Atratusmon Assembly, battle and paid Glowing Dawn play", () => {
  it("assembles three Glowing Dawn levels for eight memory", async () => {
    const { s, result } = await playByAssembly("BT27-052", ["BT27-050", "BT27-046", "BT27-044"], 10);
    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && !s.state.pendingDecision);
    const host = s.state.players[0]!.battleArea[0]!;
    expect(host.stack.map((c) => c.cardId)).toEqual(["BT27-044", "BT27-046", "BT27-050"]);
    expect(host.currentDP).toBe(15000);
    expect([...host.keywords]).toEqual(expect.arrayContaining(["Reboot", "Blocker", "Piercing"]));
    expect(s.state.memory).toBe(2);
  });

  it("rejects Assembly with an unrelated level four", async () => {
    const { s, result } = await playByAssembly("BT27-052", ["BT27-050", "BT1-019", "BT27-044"], 10);
    expect(result.ok).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it.each([true, false])("may battle an opposing Digimon on evolution: %s", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-050", as: "host" }],
          hand: [{ card: "BT27-052", as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-060"] },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        useAlternateCost: true,
        alternateRequirementIndex: 0,
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-052" && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(accept ? 0 : 1);
    expect(s.state.memory).toBe(6);
  });

  it.each([0, 1, 2])("requires two face-down cards to play from hand with %i available", async (count) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-050", as: "host" },
            {
              card: "BT1-085",
              as: "tamer",
              under: Array.from({ length: count }, () => ({ card: "BT1-009", faceUp: false })),
            },
          ],
          hand: [{ card: "BT27-052", as: "evolution" }, "BT27-044"],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        useAlternateCost: true,
        alternateRequirementIndex: 0,
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-052" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-044")).toBe(count === 2);
    expect(s.perm("tamer").stack).toHaveLength(count === 2 ? 0 : count);
    expect(s.state.memory).toBe(6);
  });

  it.each(["Digimon", "Tamer"])("plays only from Digimon sources rather than %s sources", async (kind) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-052", as: "host" },
            { card: kind === "Digimon" ? "BT1-060" : "BT1-085", as: "container", under: ["BT27-044"] },
            { card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] },
            { card: "BT1-085", under: [{ card: "BT1-011", faceUp: false }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("host"));
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-044")).toBe(kind === "Digimon");
    expect(s.perm("container").stack).toHaveLength(kind === "Digimon" ? 0 : 1);
  });

  it.each(["BT27-050", "BT1-009", "BT27-044", "BT27-091", "BT25-043"])(
    "respects cost and trait boundaries for %s",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT27-052", as: "host" },
              {
                card: "BT1-085",
                under: [
                  { card: "BT1-009", faceUp: false },
                  { card: "BT1-011", faceUp: false },
                ],
              },
            ],
            hand: [{ card, as: "reward" }],
          },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("host"));
      expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("reward").instanceId)).toBe(
        card === "BT27-050" || card === "BT1-009",
      );
    },
  );

  it("shares the battle limit across entry and attacking", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-052", as: "host" }] }, 1: { battleArea: ["BT1-060", "BT1-060"] } },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("host"));
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it.each([
    ["ST23-09", true],
    ["BT27-052", false],
  ] as const)("requires an Atratusmon without play cost for the named route: %s", async (card, allowed) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card, as: "host" }], hand: [{ card: "BT27-052", as: "evolution" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("host").permanentId,
      instanceId: s.inst("evolution").instanceId,
      useAlternateCost: true,
      alternateRequirementIndex: 1,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) {
      await settle(() => s.perm("host").stack.length === 1 && !s.state.pendingDecision);
    }
    expect(s.state.memory).toBe(allowed ? 8 : 10);
  });

  it("digivolves normally from an unrelated black level five for five memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-064", as: "host" }],
          hand: [{ card: "BT27-052", as: "evolution" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-052" && !s.state.pendingDecision);
    expect(s.state.memory).toBe(5);
  });

  it("checks an extra security card with Security Attack plus one", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-052", as: "host" }] }, 1: { security: ["BT1-009", "BT1-009", "BT1-009"] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
  });
});
