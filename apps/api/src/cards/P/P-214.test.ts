import { describe, it, expect } from "vitest";
import { digivolutionRequirementsFor, type PlayerState } from "@aegis/shared";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

const protectionCases = [
  {
    label: "with a same-level pair",
    under: [
      { card: "BT15-022", as: "originalBetamon" },
      { card: "BT1-036", as: "sourceLevel4" },
      { card: "BT1-038", as: "sourceLevel5" },
    ],
    expectedProtection: true,
  },
  {
    label: "without a same-level pair",
    under: [
      { card: "BT1-036", as: "sourceLevel4" },
      { card: "BT1-038", as: "sourceLevel5" },
    ],
    expectedProtection: false,
  },
] as const;

describe("P-214 [On Play] tuck under a friendly [Seadramon], return a level-bounded opponent Digimon", () => {
  it.each(["play", "evolve"] as const)(
    "fires the public %s hook, pays its printed cost, tucks P-214, and returns a bounded opponent Digimon",
    async (route) => {
      const isEvolution = route === "evolve";
      const board = {
        0: {
          battleArea: [
            ...(isEvolution ? [{ card: "BT15-022", as: "base" }] : []),
            { card: "BT15-031", as: "seadramon", dp: 12000 },
          ],
          hand: [{ card: "P-214", as: "betamon" }],
        },
        1: {
          battleArea: [{ card: "BT1-009", dp: 3000, as: "oppDigimon" }],
        },
      };
      const s = setupEngine(board, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
      const p1 = s.state.players[1] as PlayerState;
      const oppDigimonId = s.perm("oppDigimon").permanentId;
      const oppTopId = s.perm("oppDigimon").topCard!.instanceId;
      const host = s.perm("seadramon");
      const hostStackBefore = Array.from(host.stack, (card) => card.instanceId);
      const evolutionBaseId = isEvolution ? s.inst("base").instanceId : undefined;
      const oppDeckBefore = p1.deck.length;

      s.state.memory = isEvolution ? 2 : 4;
      await s.ready();
      expect(digivolutionRequirementsFor("P-214")).toContainEqual({
        namesExact: ["Betamon", "ModokiBetamon"],
        cost: 0,
        isAlternate: true,
      });

      expect(
        s.engine.applyIntent(
          0,
          isEvolution
            ? {
                type: "digivolve",
                permanentId: s.perm("base").permanentId,
                instanceId: s.inst("betamon").instanceId,
                useAlternateCost: true,
              }
            : { type: "playCard", instanceId: s.inst("betamon").instanceId },
        ),
      ).toEqual({ ok: true });

      await settle(() => p1.deck.some((card) => card.instanceId === oppTopId));

      expect(s.state.memory).toBe(isEvolution ? 2 : 0);
      expect(p1.deck.length).toBe(oppDeckBefore + 1);
      expect(p1.deck.some((card) => card.instanceId === oppTopId)).toBe(true);
      expect(p1.battleArea.some((perm) => perm.permanentId === oppDigimonId)).toBe(false);
      expect(s.state.players[0]!.battleArea.some((perm) => perm.permanentId === host.permanentId)).toBe(true);
      expect(s.perm("seadramon").stack[0]?.instanceId).toBe(s.inst("betamon").instanceId);
      expect(Array.from(s.perm("seadramon").stack.slice(0, hostStackBefore.length), (card) => card.instanceId)).toEqual(
        hostStackBefore,
      );

      expect(s.state.players[0]!.trash.some((card) => card.instanceId === evolutionBaseId)).toBe(false);
      expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === evolutionBaseId)).toBe(
        isEvolution,
      );
      expect(
        s.events.some(
          (event) =>
            event.kind === "cardsMoved" &&
            evolutionBaseId !== undefined &&
            event.instanceIds?.includes(evolutionBaseId) &&
            event.from === "digivolutionCards" &&
            event.fromSeat === 0 &&
            event.to === "battleArea",
        ),
      ).toBe(isEvolution);
      expect(
        s.events.some(
          (event) => event.kind === "effectResolved" && event.sourceCardId === "BT15-022" && event.timing === "OnPlay",
        ),
      ).toBe(isEvolution);
    },
  );

  it.each(protectionCases)(
    "tucks itself under Seadramon on public play and resolves Gaia Force $label",
    async ({ under, expectedProtection }) => {
      const sourceIds: string[] = [];
      let hostPermanentId: string | undefined;
      const s = setupEngine(
        {
          0: {
            battleArea: [
              {
                card: "BT2-030",
                as: "seadramon",
                dp: 10000,
                under: [...under],
              },
            ],
            hand: [{ card: "P-214", as: "betamon" }],
            deck: Array(20).fill("BT1-009"),
          },
          1: {
            battleArea: [
              { card: "BT1-009", as: "opponent" },
              { card: "BT1-085", as: "redTamer" },
            ],
            hand: [{ card: "ST1-16", as: "gaiaForce" }],
            deck: Array(20).fill("BT1-009"),
            security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          autoChooseOption: true,
        },
      );
      const baseId = s.perm("seadramon").topCard.instanceId;
      hostPermanentId = s.perm("seadramon").permanentId;
      const stackSourceIds = under.map(({ as }) => s.inst(as).instanceId);
      sourceIds.push(...(expectedProtection ? [stackSourceIds[0]!] : stackSourceIds), s.inst("betamon").instanceId);
      s.state.memory = 10;
      await s.ready();
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("betamon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.perm("seadramon").stack.some((card) => card.instanceId === s.inst("betamon").instanceId));
      expect(s.perm("seadramon").topCard.instanceId).toBe(baseId);
      expect(s.perm("seadramon").stack[0]?.instanceId).toBe(s.inst("betamon").instanceId);
      expect(s.perm("seadramon").stack.some((card) => card.instanceId === s.inst("betamon").instanceId)).toBe(true);
      expect(s.state.memory).toBe(6);

      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.turnSeat).toBe(1);
      expect(s.state.memory).toBe(3);
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.state.pendingDecision === undefined &&
          sourceIds.every((instanceId) => s.state.players[0]!.trash.some((card) => card.instanceId === instanceId)) &&
          (expectedProtection
            ? s.state.players[0]!.battleArea.some((p) => p.permanentId === hostPermanentId)
            : !s.state.players[0]!.battleArea.some((p) => p.permanentId === hostPermanentId)),
      );
      expect(s.events).toContainEqual({ kind: "memoryChanged", from: 3, to: -5, reason: "playCard" });
      const handoffIndex = s.events.findIndex((event) => event.kind === "turnEnded" && event.endingSeat === 1);
      const paymentIndex = s.events.findIndex(
        (event) => event.kind === "memoryChanged" && event.from === 3 && event.to === -5 && event.reason === "playCard",
      );
      expect(paymentIndex).toBeGreaterThanOrEqual(0);
      expect(handoffIndex).toBeGreaterThan(paymentIndex);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(sourceIds));
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === hostPermanentId)).toBe(expectedProtection);
      expect(s.state.pendingDecision).toBeUndefined();

      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );

  it("encodes Decode as a non-battle leave replacement with exact source names", () => {
    const replacement = runtimeCompiledCard("P-214")!.effects.find((effect) => effect.trigger === "Static")!.actions[0];
    expect(replacement).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "instead",
      leaveCause: "otherThanBattle",
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["digivolutionCards"],
          payCost: false,
          optional: true,
          playedByDecode: true,
          target: {
            filter: {
              nameOrTrait: [{ tokens: ["Betamon", "ModokiBetamon"], match: "nameExact" }],
            },
          },
        },
      ],
    });
    expect(runtimeCompiledCard("P-214")!.effects.find((effect) => effect.trigger === "AllTurns")?.isInherited).toBe(
      true,
    );
  });
});

describe("P-214 Decode engine behavior", () => {
  it("plays a Betamon from its digivolution cards when it leaves play", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "P-214", under: [{ card: "BT15-022", as: "decoded" }], as: "betamon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("betamon").permanentId]);
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("decoded").instanceId)).toBe(
      true,
    );
  });

  it("does not play a non-matching card when Decode leaves play", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "P-214", as: "betamon", under: ["BT1-004"] }] } });
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("betamon").permanentId]);
    await settle();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-004")).toBe(true);
  });
});

describe("P-214 Betamon (X Antibody) — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;

  function idsOf(s: Setup, alias: string): string[] {
    return [s.perm(alias).permanentId, s.perm(alias).topCard.instanceId];
  }

  async function answerSelection(s: Setup, alias: string): Promise<string[]> {
    await settle(
      () => s.state.pendingDecision?.kind === "selectCards" || s.state.pendingDecision?.kind === "chooseTargets",
    );
    const req = s.state.pendingDecision!;
    const candidates: string[] = JSON.parse(req.payloadJson ?? "{}").candidateInstanceIds ?? [];
    const chosen = candidates.filter((id) => idsOf(s, alias).includes(id));
    expect(chosen).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: req.decisionId,
        response: { kind: req.kind as "selectCards" | "chooseTargets", instanceIds: chosen },
      }),
    ).toEqual({ ok: true });
    return candidates;
  }

  it("counts a card whose name or effect text contains [Seadramon] as having [Seadramon] in its text (Q5960)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-026", as: "effectText" },
            { card: "BT11-085", as: "nameSubstring" },
            { card: "BT1-010", as: "unrelated" },
          ],
          hand: [{ card: "P-214", as: "betamon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("betamon").instanceId })).toEqual({
      ok: true,
    });

    const hosts = await answerSelection(s, "effectText");
    const offered = (alias: string) => hosts.some((id) => idsOf(s, alias).includes(id));
    expect(offered("effectText")).toBe(true);
    expect(offered("nameSubstring")).toBe(true);
    expect(offered("unrelated")).toBe(false);
    await settle(() => s.perm("effectText").stack.some((card) => card.instanceId === s.inst("betamon").instanceId));
  });

  it("tucks under 1 [Seadramon] Digimon and measures the return by another one's level (Q5961)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT2-024", as: "lowHost" },
            { card: "BT2-030", as: "highReference" },
          ],
          hand: [{ card: "P-214", as: "betamon" }],
        },
        1: {
          battleArea: [
            { card: "BT15-031", as: "levelSix" },
            { card: "BT1-009", as: "levelThree" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 4;
    await s.ready();
    const levelSixTopId = s.perm("levelSix").topCard.instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("betamon").instanceId })).toEqual({
      ok: true,
    });

    await answerSelection(s, "lowHost");
    await answerSelection(s, "highReference");
    const returnable = await answerSelection(s, "levelSix");
    expect(returnable).toEqual(expect.arrayContaining([idsOf(s, "levelThree")[0]]));
    await settle(() => s.state.players[1]!.deck.some((card) => card.instanceId === levelSixTopId));

    expect(s.perm("lowHost").stack[0]?.instanceId).toBe(s.inst("betamon").instanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(levelSixTopId);
  });
});
