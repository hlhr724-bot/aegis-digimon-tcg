import costHostFixture from "#api/engine/scenarios/cost-host-selection-does-not-delete.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-072.js";
import "../index.js";
import { identityVisibility, stackIds, trashBottomTamerCardWithFalcomon } from "./tamerStack.testSupport.js";

describe("BT26-072 Peckmon", () => {
  it("models both printed alternate costs", () => {
    expect(getCardDefinition("BT26-072")).toMatchObject({
      nameEn: "Peckmon",
      colors: ["Purple"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 5000,
      types: ["Avian", "DATA SQUAD"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 3, traits: ["DATA SQUAD"], cost: 2, isAlternate: true },
    ]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({ trigger: "Static", keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] }),
    );
    expect(compiled.effects.find((effect) => effect.trigger === "OnPlay")).toMatchObject({
      trigger: "OnPlay",
      actions: [
        {
          kind: "Modal",
          choose: 1,
          optional: true,
          abortOnDecline: true,
          options: [
            [
              expect.objectContaining({
                kind: "Delete",
                cost: expect.objectContaining({ kind: "trash" }),
                allowCostWithoutTarget: true,
              }),
            ],
            [
              expect.objectContaining({
                kind: "Delete",
                allowCostWithoutTarget: true,
                cost: expect.objectContaining({
                  kind: "place",
                  faceDown: true,
                  position: "bottom",
                  underFilter: expect.objectContaining({
                    nameOrTrait: [{ tokens: ["Keenan Crier"], match: "nameExact" }],
                  }),
                }),
              }),
            ],
          ],
        },
      ],
    });
    expect(compiled.effects.some((effect) => effect.trigger === "WhenDigivolving")).toBe(true);
  });

  it("uses the cost-2 DATA SQUAD evolution path from a green level 3", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT26-036", as: "greenDataSquadBase" }],
        hand: [{ card: "BT26-072", as: "peckmon" }],
        deck: ["BT1-009"],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("greenDataSquadBase").permanentId,
        instanceId: s.inst("peckmon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("greenDataSquadBase").topCard.cardId === "BT26-072");

    expect(s.state.memory).toBe(0);
  });

  it("publicly pays the hand-trash alternative to delete an opponent's level 4 or lower Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT1-009", as: "cost" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-014", as: "victim" },
            { card: "BT26-060", as: "level5OrHigher" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("level5OrHigher").permanentId,
    ]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
  });

  it("publicly pays the hand-trash alternative when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-036", as: "base" }],
          hand: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT1-009", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT1-014", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("peckmon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("base").topCard.cardId).toBe("BT26-072");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
    expect(s.state.memory).toBe(0);
  });

  it("may decline both alternative costs without trashing or deleting", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT1-009", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT1-014", as: "victim" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT1-009");
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("may instead place the hand card face down under Keenan Crier before deleting", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT26-094",
              as: "keenan",
              under: [
                { card: "BT1-010", as: "oldBottom", faceUp: false },
                { card: "BT1-011", as: "oldTop", faceUp: false },
              ],
            },
          ],
          hand: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT1-009", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("keenan").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("cost").instanceId,
      s.inst("oldBottom").instanceId,
      s.inst("oldTop").instanceId,
    ]);
    expect(s.perm("keenan").stack[0]).toMatchObject({ cardId: "BT1-009", faceUp: false });

    await advance(s.engine).verb.trashDigivolutionCards(s.perm("keenan").permanentId, [s.inst("cost").instanceId], 0);
    expect(s.state.players[0]!.trash.find(({ cardId }) => cardId === "BT1-009")?.faceUp).toBe(true);
  });

  it("places a cost card under a chosen Keenan without presenting its host as a deletion target", async () => {
    const s = setupScenario(costHostFixture, { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 });
    s.state.memory = 4;
    await s.ready();
    s.state.phase = Phase.Main;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("firstKeenan").stack.length === 1 && s.state.pendingDecision === undefined);
    const hostChoice = s.decisions.find(({ req }) => req.kind === "chooseTargets")?.req;
    expect(hostChoice?.options?.candidateInstanceIds).toEqual([
      s.perm("firstKeenan").permanentId,
      s.perm("secondKeenan").permanentId,
    ]);
    expect(hostChoice?.options?.purpose).toBe("cost");
    expect(hostChoice?.options?.targetFate).toBeUndefined();
    expect(s.perm("firstKeenan").stack[0]?.instanceId).toBe(s.inst("cost").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });

  it("executes Blocker and prevents the security check", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-072", as: "peckmon" }], security: ["BT1-009"], deck: ["BT1-010"] },
        1: { battleArea: [{ card: "BT26-060", as: "attacker" }], deck: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("peckmon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("makes the opponent choose the inherited On Deletion hand trash", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-074", as: "host", under: ["BT26-072"] }] },
        1: {
          hand: [
            { card: "BT1-009", as: "chosen" },
            { card: "BT1-010", as: "kept" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("chosen").instanceId);
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("chosen").instanceId);
    expect(s.state.players[1]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("kept").instanceId);
    expect(s.decisions.filter(({ seat, req }) => seat === 1 && req.kind === "selectCards")).toHaveLength(1);
  });

  it("names each alternative cost on its own button rather than repeating the payload", () => {
    const modals = compiled.effects.flatMap(({ actions }) => actions).filter((action) => action.kind === "Modal");
    expect(modals.length).toBeGreaterThan(0);
    for (const modal of modals)
      expect(modal).toMatchObject({
        optional: true,
        labels: ["Trash 1 card in your hand", "Place 1 card from your hand face down under 1 of your [Keenan Crier]s"],
      });
  });
});

describe("BT26-072 Peckmon — KB Q&A rulings", () => {
  async function placeUnderKeenan() {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT26-094",
              as: "keenan",
              under: [
                { card: "BT1-010", as: "priorBottom", faceUp: false },
                { card: "BT1-011", as: "priorTop", faceUp: false },
              ],
            },
          ],
          hand: [
            { card: "BT26-072", as: "peckmon" },
            { card: "BT1-009", as: "placed" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await settle(() => s.state.pendingDecision === undefined);
    return {
      s,
      placedId: s.inst("placed").instanceId,
      priorIds: [s.inst("priorBottom").instanceId, s.inst("priorTop").instanceId],
    };
  }

  it("places the paid card at the bottom of the cards already under Keenan Crier (Q7094)", async () => {
    const { s, placedId, priorIds } = await placeUnderKeenan();

    expect(stackIds(s.perm("keenan"))).toEqual([placedId, ...priorIds]);
    expect(s.perm("keenan").stack[0]).toMatchObject({ instanceId: placedId, faceUp: false });
  });

  it("offers no reorder of the face-down cards, so a bottom-card cost trashes the placed card (Q7095)", async () => {
    const { s, placedId, priorIds } = await placeUnderKeenan();
    expect(s.decisions.some(({ req }) => req.kind === "orderCards")).toBe(false);

    const { trashed } = await trashBottomTamerCardWithFalcomon(s);

    expect(trashed?.instanceId).toBe(placedId);
    expect(stackIds(s.perm("keenan"))).toEqual(priorIds);
  });

  it("lets only Keenan Crier's owner look at the face-down card (Q7096)", async () => {
    const { s } = await placeUnderKeenan();

    expect(identityVisibility(s, s.inst("placed"))).toEqual({ owner: true, opponent: false });
  });

  it("puts a trashed face-down card from under Keenan Crier face up in the trash (Q7097)", async () => {
    const { s, placedId } = await placeUnderKeenan();

    const { trashed } = await trashBottomTamerCardWithFalcomon(s);

    expect(trashed).toMatchObject({ instanceId: placedId, faceUp: true });
    expect(identityVisibility(s, trashed!)).toEqual({ owner: true, opponent: true });
  });
});
