import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "./BT27-020.js";
import "#api/cards/index";

const deck = [{ card: "BT1-010", as: "drawn" }, "BT1-011", "BT1-012"];

function playKamemon(s: ReturnType<typeof setupEngine>) {
  s.state.memory = 5;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kamemon").instanceId })).toEqual({ ok: true });
}

function placementCandidates(s: ReturnType<typeof setupEngine>, instanceId: string): string[] {
  const request = s.decisions.find(
    ({ req }) => req.kind === "selectCards" && (req.options?.candidateInstanceIds ?? []).includes(instanceId),
  );
  return [...(request?.req.options?.candidateInstanceIds ?? [])].sort();
}

describe("BT27-020 Kamemon", () => {
  it("compiles the alternate evolution, placement draw, Aquatic rule, and inherited trash", () => {
    expect(digivolutionRequirementsFor("BT27-020")).toContainEqual({
      level: 2,
      traits: ["DATA SQUAD"],
      cost: 0,
      isAlternate: true,
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["OnPlay", "Rule", "WhenAttacking"]);
    expect(compiled.effects[2]).toMatchObject({ isInherited: true, frequency: "OncePerTurn" });
    expect(effectiveStaticTraits(getCardDefinition("BT27-020")!)).toEqual(
      expect.arrayContaining(["Aquatic", "DATA SQUAD"]),
    );
  });

  it("offers only level 4 or lower Aquatic or DATA SQUAD Digimon cards from hand", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT27-020", as: "kamemon" },
            { card: "EX12-026", as: "ruleAquatic" },
            { card: "BT24-019", as: "typedAquatic" },
            { card: "BT26-039", as: "dataSquad" },
            { card: "BT1-016", as: "nonmatching" },
            { card: "BT25-027", as: "levelFive" },
          ],
          deck,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    playKamemon(s);
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));

    expect(placementCandidates(s, s.inst("ruleAquatic").instanceId)).toEqual(
      [s.inst("ruleAquatic").instanceId, s.inst("typedAquatic").instanceId, s.inst("dataSquad").instanceId].sort(),
    );
  });

  it("places the card face up as the bottom digivolution card of a chosen Digimon, then draws", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "host", under: [{ card: "BT1-010", as: "existing" }] }],
          hand: [
            { card: "BT27-020", as: "kamemon" },
            { card: "EX12-026", as: "aquatic" },
          ],
          deck,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("aquatic").instanceId, s.perm("host").permanentId);
    playKamemon(s);
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));

    const host = s.perm("host");
    expect(host.stack[0]?.instanceId).toBe(s.inst("aquatic").instanceId);
    expect(host.stack[0]?.faceUp).toBe(true);
    expect(host.stack.at(-1)?.instanceId).toBe(s.inst("existing").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
  });

  it("places the card face down under a DATA SQUAD Tamer and never offers another Tamer", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-091", as: "dataSquadTamer" },
            { card: "BT1-085", as: "otherTamer" },
          ],
          hand: [
            { card: "BT27-020", as: "kamemon" },
            { card: "BT26-039", as: "dataSquad" },
          ],
          deck,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("dataSquad").instanceId, s.perm("dataSquadTamer").permanentId);
    playKamemon(s);
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));

    const hostRequest = s.decisions.find(
      ({ req }) =>
        req.kind === "chooseTargets" &&
        (req.options?.candidateInstanceIds ?? []).includes(s.perm("dataSquadTamer").permanentId),
    );
    expect([...(hostRequest?.req.options?.candidateInstanceIds ?? [])].sort()).toEqual(
      [s.perm("dataSquadTamer").permanentId, s.perm("kamemon").permanentId].sort(),
    );
    expect(s.perm("dataSquadTamer").stack.map((card) => [card.instanceId, card.faceUp])).toEqual([
      [s.inst("dataSquad").instanceId, false],
    ]);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
  });

  it.each([
    ["declined", "BT26-039", true],
    ["level 5", "BT25-027", false],
  ] as const)("keeps the hand and does not draw when the placement is %s", async (_label, card, decline) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "host" }],
          hand: [
            { card: "BT27-020", as: "kamemon" },
            { card, as: "candidate" },
          ],
          deck,
        },
      },
      decline
        ? { autoDeclineOptional: true, autoSelectCards: true }
        : { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    playKamemon(s);
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT27-020") &&
        s.state.pendingDecision === undefined,
    );

    expect(s.state.players[0]!.hand.map((handCard) => handCard.instanceId)).toEqual([s.inst("candidate").instanceId]);
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("digivolves from a DATA SQUAD level 2 for 0 through the alternate requirement only", () => {
    const legal = setupEngine({
      0: { breeding: { card: "BT25-002", as: "egg" }, hand: [{ card: "BT27-020", as: "kamemon" }] },
    });
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("egg").permanentId,
        instanceId: legal.inst("kamemon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });

    const invalid = setupEngine({
      0: { breeding: { card: "BT26-001", as: "egg" }, hand: [{ card: "BT27-020", as: "kamemon" }] },
    });
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("egg").permanentId,
        instanceId: invalid.inst("kamemon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it.each([
    ["top", 0],
    ["bottom", 1],
  ] as const)(
    "inherited When Attacking trashes the chosen %s digivolution card once per turn",
    async (position, optionIndex) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT1-016", as: "attacker", under: [{ card: "BT27-020" }] }] },
          1: {
            battleArea: [
              {
                card: "BT1-020",
                as: "target",
                under: [
                  { card: "BT1-009", as: "first" },
                  { card: "BT1-010", as: "second" },
                  { card: "BT1-011", as: "third" },
                ],
              },
              { card: "BT1-016", as: "bystander", under: [{ card: "BT1-012", as: "bystanderSource" }] },
            ],
            security: ["BT1-009", "BT1-010", "BT1-011"],
            deck: ["BT1-009", "BT1-010"],
          },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          preferInstanceIds: preferred,
          preferOptionIndex: optionIndex,
        },
      );
      await s.ready();
      preferred.push(s.perm("target").permanentId);
      const before = s.perm("target").stack.map((card) => card.instanceId);
      const expected = position === "top" ? before.at(-1)! : before[0]!;

      for (let attack = 0; attack < 2; attack++) {
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
        await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId]);
      }

      expect(s.perm("target").stack.map((card) => card.instanceId)).toEqual(before.filter((id) => id !== expected));
      expect(s.state.players[1]!.trash.map((card) => card.instanceId).filter((id) => before.includes(id))).toEqual([
        expected,
      ]);
      expect(s.perm("bystander").stack.map((card) => card.instanceId)).toEqual([s.inst("bystanderSource").instanceId]);
    },
  );
});
