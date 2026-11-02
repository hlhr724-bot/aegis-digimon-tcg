import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT19/BT19-077.js";
import { compiled } from "./EX5-045.js";
import "../index.js";

describe("EX5-045 Chuumon", () => {
  it("matches the catalog and encodes the opponent-turn reveal and inherited revival", () => {
    expect(getCardDefinition("EX5-045")).toMatchObject({
      cardId: "EX5-045",
      nameEn: "Chuumon",
      colors: ["Black", "Yellow"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [
        { color: "Black", level: 2, memoryCost: 1 },
        { color: "Yellow", level: 2, memoryCost: 1 },
      ],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Beast"],
      effectText: expect.stringContaining("If it's your opponent's turn"),
      inheritedEffectText: expect.stringContaining("If this Digimon had [Sukamon]/[Etemon]"),
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects?.find((entry) => entry.trigger === "OnPlay")?.actions).toEqual([
      {
        kind: "RevealAdd",
        revealCount: 3,
        add: [
          {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Sukamon"], match: "name" }],
            },
            count: 1,
            to: "play",
            optional: true,
          },
        ],
        rest: "trash",
        condition: { kind: "isOpponentsTurn", raw: "it's your opponent's turn" },
      },
    ]);
    expect(compiled.effects?.find((entry) => entry.isInherited)).toMatchObject({
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Chuumon"], match: "nameExact" }],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          suspended: true,
          condition: { kind: "selfHasNameContaining", names: ["Sukamon", "Etemon"] },
          optional: true,
        },
      ],
      isInherited: true,
    });
  });

  it("publicly plays during the opponent's turn and accepts the Sukamon play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX5-045", as: "source" }],
          deck: [
            { card: "BT11-040", as: "sukamon" },
            { card: "BT1-009", as: "firstTrash" },
            { card: "BT1-010", as: "secondTrash" },
            ...Array.from({ length: 10 }, () => "BT1-009"),
          ],
          security: [{ card: "BT19-077", as: "security" }],
        },
        1: {
          battleArea: [{ card: "BT1-010", as: "attacker" }],
          security: ["BT1-009"],
          deck: Array.from({ length: 40 }, () => "BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    const drive = advance(s.engine);
    await drive.waitForMainPhase(0);
    drive.endMainPhaseIfOpen(0);
    await drive.waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard?.instanceId === s.inst("source").instanceId,
        ) &&
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard?.instanceId === s.inst("sukamon").instanceId,
        ),
    );
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId)).toEqual([
      s.inst("source").instanceId,
      s.inst("sukamon").instanceId,
    ]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("security").instanceId,
        s.inst("firstTrash").instanceId,
        s.inst("secondTrash").instanceId,
      ]),
    );
    expect(s.state.pendingDecision).toBeUndefined();
    await settle(() => !observe(s.engine).isAttacking());
    drive.endMainPhaseIfOpen(1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("publicly declines the optional Sukamon play after accepting the opponent-turn play", async () => {
    const options = { autoSelectCards: false, autoDeclineOptional: false, preferInstanceIds: [] as string[] };
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX5-045", as: "source" }],
          deck: [
            { card: "BT11-040", as: "sukamon" },
            { card: "BT1-009", as: "firstTrash" },
            { card: "BT1-010", as: "secondTrash" },
            ...Array.from({ length: 10 }, () => "BT1-009"),
          ],
          security: [{ card: "BT19-077", as: "security" }],
        },
        1: {
          battleArea: [{ card: "BT1-010", as: "attacker" }],
          security: ["BT1-009"],
          deck: Array.from({ length: 40 }, () => "BT1-009"),
        },
      },
      options,
    );
    options.preferInstanceIds.push(s.inst("source").instanceId);
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const securityPlay = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: securityPlay.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX5-045"));
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const revealPlay = s.state.pendingDecision!;
    expect(revealPlay.decisionId).not.toBe(securityPlay.decisionId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: revealPlay.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX5-045"]);
    expect(s.state.players[0]!.deck).toHaveLength(10);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("security").instanceId,
        s.inst("sukamon").instanceId,
        s.inst("firstTrash").instanceId,
        s.inst("secondTrash").instanceId,
      ]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("does not reveal or play on your own turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX5-045", as: "source" }],
          deck: [
            { card: "BT11-040", as: "sukamon" },
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX5-045"]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("sukamon").instanceId,
      s.inst("first").instanceId,
      s.inst("second").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([
    { label: "yellow level-2", base: "BT1-005", legal: true, cost: 1 },
    { label: "wrong-color green level-2", base: "BT1-007", legal: false, cost: 1 },
  ])("checks the public $label evolution route", async ({ base, legal, cost }) => {
    const s = setupEngine({
      0: {
        breeding: { card: base, as: "base" },
        hand: [{ card: "EX5-045", as: "evo" }],
        deck: [{ card: "BT1-009", as: "bonusDraw" }],
      },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evo").instanceId,
      }).ok,
    ).toBe(legal);
    await settle();
    expect(s.perm("base").topCard?.cardId).toBe(legal ? "EX5-045" : base);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(legal ? [base] : []);
    expect(s.state.memory).toBe(legal ? 5 - cost : 5);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      legal ? [s.inst("bonusDraw").instanceId] : [s.inst("evo").instanceId],
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("offers inherited revival alongside Sukamon's own deletion effect after a battle trade", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-028", as: "host", under: [{ card: "EX5-045", as: "inherited" }], suspended: true },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 2000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle();
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("inherited").instanceId,
    );
  });

  it("revives one Chuumon suspended from trash after public battle deletion of a Sukamon-name host", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX1-052", as: "host", under: ["EX5-045"], suspended: true }],
          trash: [{ card: "EX5-045", as: "candidate" }],
        },
        1: { battleArea: [{ card: "BT1-014", as: "attacker", dp: 20000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("candidate").instanceId);
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX5-045"));
    const revived = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "EX5-045");
    expect(revived?.isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("candidate").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("GitHub #5106: replays its own newly trashed inherited Chuumon after public battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX1-052", as: "host", under: [{ card: "EX5-045", as: "inherited" }], suspended: true }],
        },
        1: { battleArea: [{ card: "BT1-014", as: "attacker", dp: 20000 }] },
      },
      { autoAcceptOptional: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("inherited").instanceId),
    );
    expect(s.events).toContainEqual(
      expect.objectContaining({
        kind: "cardPlayed",
        fromZone: "trash",
        cardId: "EX5-045",
        instanceId: s.inst("inherited").instanceId,
      }),
    );
    const revived = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("inherited").instanceId,
    )!;
    expect(revived.isSuspended).toBe(true);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["EX1-052"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("feedback #27: does not reveal when another effect plays it on your own turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX13-035", as: "kingEtemon" },
            { card: "EX5-045", as: "source" },
          ],
          deck: [
            { card: "BT11-040", as: "sukamon" },
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 20;
    await s.ready();
    const deckBefore = s.state.players[0]!.deck.map((card) => card.instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kingEtemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const kingEtemonPlay = s.state.pendingDecision!;
    expect(JSON.parse(kingEtemonPlay.payloadJson).candidateInstanceIds).toEqual([s.inst("source").instanceId]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: kingEtemonPlay.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("source").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId).sort()).toEqual(
      [s.inst("kingEtemon").instanceId, s.inst("source").instanceId].sort(),
    );
    expect(s.events.some((event) => event.kind === "cardRevealed" && event.sourceCardId === "EX5-045")).toBe(false);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(deckBefore);
  });
});
