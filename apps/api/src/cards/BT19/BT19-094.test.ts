import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { assertNoLoudGap, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";

const FILLER = ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"];
const boardCardIds = (s: EngineSetup, seat: 0 | 1): (string | undefined)[] => s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard?.cardId);

describe("BT19-094 Seventh Divine Cruz — catalog and IR", () => {
  it("matches the printed catalog record", () => {
    expect(getCardDefinition("BT19-094")).toMatchObject({ cardId: "BT19-094", nameEn: "Seventh Divine Cruz", colors: ["Yellow", "Purple"], kinds: ["Option"], playCost: 7, dp: 0, evoCosts: [], types: ["Seven Great Demon Lords"], maxCountInDeck: 4 });
    const printed = getCardDefinition("BT19-094")!;
    expect(printed.effectText).toContain("[Trash] [Your Turn] When any of your Digimon digivolve into [Lucemon (X Antibody)], by returning this card to the bottom of the deck, your opponent may trash their top security card. If this effect didn't trash, ＜Recovery +1 (Deck)＞");
    expect(printed.effectText).toContain("[Main] Delete your opponent's Digimon until they have as many as the number of your security cards. If this effect deleted, ＜Recovery +1 (Deck)＞.");
    expect(printed.securityEffectText).toBe("[Security] You may play 1 [Lucemon] from your trash without paying the cost.");
  });
  it("compiles the three printed clauses to the intended IR shape", () => {
    const card = runtimeCompiledCard("BT19-094");
    expect(card).toMatchObject({ coverage: "full", residual: [] });
    expect(card?.effects).toMatchObject([{ trigger: "YourTurn", optional: true, isFromTrash: true, actions: [{ kind: "SubTrigger", optional: true, event: "whenOneOfYoursDigivolves", sourceFilter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Lucemon (X Antibody)"], match: "nameExact" }] }, actions: [{ kind: "SecurityManipulation", op: "trashTop", controller: "opponent", optionalFor: "opponent", amount: 1, bindResultAs: "opponentSecurityTrashedBySeventh", cost: { kind: "return", target: { filter: { zone: "trash", controller: "mine", isSelfRef: true }, count: 1, isSelf: true } } }, { kind: "SecurityManipulation", op: "addTop", controller: "mine", source: "deck", amount: 1, condition: { kind: "bindingEmpty", ref: "opponentSecurityTrashedBySeventh" } }] }] }, { trigger: "Main" }, { trigger: "Security" }]);
  });
});

describe("BT19-094 Seventh Divine Cruz — optional trash effect regression", () => {
  it("does not return the card or trash security when I decline", async () => {
    const cruz = { card: "BT19-094", as: "cruz" };
    const s = setupEngine({ 0: { battleArea: [{ card: "BT7-111", as: "source" }], hand: [{ card: "BT19-043", as: "lucemonX" }], trash: [cruz], deck: [{ card: "BT1-012", as: "bonusDraw" }, { card: "BT1-013", as: "deckTop" }, ...FILLER], security: ["BT1-009", "BT1-010"] }, 1: { deck: [...FILLER], security: [{ card: "BT1-009", as: "oppSecTop" }, "BT1-010", "BT1-011"] } }, { autoDeclineOptional: true, autoSelectCards: true });
    s.state.memory = 10;
    await s.ready();
    const cruzId = s.inst("cruz").instanceId;
    expect(s.engine.applyIntent(0, { type: "digivolve", permanentId: s.perm("source").permanentId, instanceId: s.inst("lucemonX").instanceId, useAlternateCost: true })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT19-043"));
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(cruzId);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).not.toContain(cruzId);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security).toHaveLength(2);
    assertNoLoudGap(s);
  });
});

describe("BT19-094 Seventh Divine Cruz — [Main] and [Security]", () => {
  it("keeps the printed main and security effects registered", () => {
    const card = runtimeCompiledCard("BT19-094");
    expect(card?.effects.map((effect) => effect.trigger)).toEqual(["YourTurn", "Main", "Security"]);
    expect(card?.effects[2]?.isSecurity).toBe(true);
  });
});
