import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-098.js";
import "../index.js";

describe("BT26-098 compiled fidelity", () => {
  it("encodes the face-down Tamer payment, literal materials, free Rosemon evolution, and Security mode", () => {
    const card = compiled;
    expect(getCardDefinition("BT26-098")).toMatchObject({
      nameEn: "Queen of Thorns",
      colors: ["Green"],
      kinds: ["Option"],
      playCost: 5,
      types: ["DATA SQUAD"],
    });
    expect(card?.coverage).toBe("full");
    expect(card?.residual).toEqual([]);
    expect(card?.effects?.find((effect) => effect.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          target: {
            filter: {
              kind: ["Digimon", "Tamer"],
              or: [
                { nameOrTrait: [{ tokens: ["Lalamon"], match: "nameExact" }] },
                { nameOrTrait: [{ tokens: ["Yoshino Fujieda"], match: "nameExact" }] },
              ],
            },
          },
        },
        { kind: "AddToHandSelf" },
      ],
    });

    const beforePayCost = card?.effects?.find((effect) => effect.trigger === "BeforePayCost")?.actions ?? [];
    expect(beforePayCost).toMatchObject([
      {
        kind: "ReducePlayCost",
        payment: {
          kind: "payCost",
          cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
        },
        amount: { kind: "fixed", value: 2 },
      },
    ]);

    const main = card?.effects?.find((effect) => effect.trigger === "Main")?.actions ?? [];
    expect(main[0]).toMatchObject({
      kind: "CostGatedBlock",
      optional: true,
      abortOnDecline: true,
      cost: {
        kind: "compound",
        costs: [
          {
            kind: "place",
            position: "bottom",
            bindHostAs: "lalamonHost",
            target: { filter: { nameOrTrait: [{ tokens: ["Sunflowmon"], match: "nameExact" }] } },
            host: { filter: { nameOrTrait: [{ tokens: ["Lalamon"], match: "nameExact" }] } },
          },
          {
            kind: "place",
            position: "bottom",
            target: { filter: { nameOrTrait: [{ tokens: ["Lilamon"], match: "nameExact" }] } },
            host: { filter: { boundRef: "lalamonHost" } },
          },
        ],
      },
      actions: [
        {
          kind: "Digivolve",
          target: { fromSelectionRef: "lalamonHost" },
          into: { filter: { nameOrTrait: [{ tokens: ["Rosemon"], match: "nameExact" }] } },
          from: ["hand"],
          payCost: false,
          ignoreRequirements: true,
          optional: true,
        },
      ],
    });
  });

  it("trashes and reveals only the bottom face-down Tamer card to reduce the use cost by 2", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-036", as: "greenSource" },
            {
              card: "BT26-089",
              as: "tamer",
              under: [
                { card: "BT1-009", as: "bottom", faceUp: false },
                { card: "BT1-010", as: "higher", faceUp: false },
              ],
            },
          ],
          hand: [{ card: "BT26-098", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    const memoryBefore = s.state.memory;
    const optionId = s.inst("option").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === optionId));

    expect(memoryBefore - s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("bottom").instanceId, faceUp: true }),
    );
    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("higher").instanceId]);
  });

  it("may decline the cost reduction and use the Option for its full cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-036", as: "greenSource" },
            {
              card: "BT26-089",
              as: "tamer",
              under: [{ card: "BT1-009", as: "bottom", faceUp: false }],
            },
          ],
          hand: [{ card: "BT26-098", as: "option" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    const memoryBefore = s.state.memory;
    const optionId = s.inst("option").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === optionId));

    expect(memoryBefore - s.state.memory).toBe(5);
    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("bottom").instanceId]);
  });

  it("publicly plays a Lalamon from hand and adds itself to hand from security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT26-098", as: "option", faceUp: true }],
          hand: [{ card: "BT26-036", as: "lalamon" }],
          battleArea: [{ card: "BT26-036", as: "existingLalamon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard?.cardId === "BT26-036")).toHaveLength(2);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-098");
  });

  it("plays Yoshino Fujieda from trash and then adds itself to hand from security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT26-098", as: "option", faceUp: true }],
          trash: [{ card: "BT26-091", as: "yoshino" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("yoshino").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-098");
  });

  it("offers only its owner's Lalamon or Yoshino Fujieda to the Security play", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT26-098", as: "option", faceUp: true }],
          hand: [
            { card: "BT1-009", as: "otherDigimon" },
            { card: "BT26-036", as: "lalamon" },
          ],
          trash: [{ card: "BT1-009", as: "otherTrashDigimon" }],
        },
        1: { trash: [{ card: "BT26-036", as: "opponentLalamon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("lalamon").instanceId),
    );

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offered).not.toContain(s.inst("otherDigimon").instanceId);
    expect(offered).not.toContain(s.inst("otherTrashDigimon").instanceId);
    expect(offered).not.toContain(s.inst("opponentLalamon").instanceId);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT26-036"]);
  });

  it("adds itself to hand when the optional Security play has no eligible card", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT26-098", as: "option", faceUp: true }],
        hand: [{ card: "BT25-093", as: "ineligibleOption" }],
      },
    });
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("option").instanceId, s.inst("ineligibleOption").instanceId]),
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("places both named materials under one Lalamon before the free evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-036", as: "lalamon" }],
          trash: [
            { card: "BT26-039", as: "sunflowmon" },
            { card: "BT26-044", as: "lilamon" },
          ],
          hand: [
            { card: "BT26-098", as: "option" },
            { card: "BT26-049", as: "rosemon" },
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
    await settle(() => s.perm("lalamon").topCard.cardId === "BT26-049");

    expect(s.perm("lalamon").topCard.cardId).toBe("BT26-049");
    expect(s.perm("lalamon").stack.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT26-039", "BT26-044"]),
    );
  });

  it("Q7173: with only one named material, moves neither card and does not digivolve", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-036", as: "lalamon" }],
          trash: [{ card: "BT26-039", as: "sunflowmon" }],
          hand: [
            { card: "BT26-098", as: "option" },
            { card: "BT26-049", as: "rosemon" },
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
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT26-098"));

    expect(s.perm("lalamon").topCard.cardId).toBe("BT26-036");
    expect(s.perm("lalamon").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-039");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-049");
  });
});
