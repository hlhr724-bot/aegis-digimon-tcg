import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { matchNameOrTrait } from "../../engine/effects/interpreter/matching/definition.js";
import { compiled } from "./BT20-093.js";
import "./index.js";
import "../ST2/ST2-16.js";
import "../EX3/EX3-074.js";
import "../EX3/EX3-037.js";
import "../BT9/BT9-047.js";

const DECK_FILLER = ["BT1-010", "BT1-010", "BT1-010", "BT1-010", "BT1-010"];

describe("BT20-093 Unleash the Dragon Gene", () => {
  it("matches the catalog and keeps the optional reduced play and mandatory placement sequence", () => {
    expect(getCardDefinition("BT20-093")).toMatchObject({
      cardId: "BT20-093",
      nameEn: "Unleash the Dragon Gene",
      colors: ["Red"],
      kinds: ["Option"],
      playCost: 2,
      types: ["Option"],
      effectText: expect.stringContaining("Dracomon"),
      securityEffectText: expect.stringContaining("in its name"),
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.find((entry) => entry.trigger === "Main")).toMatchObject({
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand"],
          payCost: true,
          reduceCostBy: 3,
          optional: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Dracomon", "Examon"], match: "text" }],
            },
            count: 1,
          },
        },
        { kind: "PlaceInBattleAreaSelf" },
      ],
    });
    expect(compiled.effects.find((entry) => entry.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Dracomon"], match: "name" }] },
            count: 1,
          },
        },
        { kind: "PlaceInBattleAreaSelf" },
      ],
    });
  });

  it("resolves reactive Delay DNA before the qualifying Digimon leaves", () => {
    expect(compiled.effects.find((entry) => entry.trigger === "AllTurns")).toMatchObject({
      keywords: [{ keyword: "Delay" }],
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            zone: "battleArea",
            nameOrTrait: [{ tokens: ["Dracomon", "Examon"], match: "text" }],
          },
          actions: [
            {
              kind: "DnaDigivolve",
              payCost: true,
              optional: true,
              materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Examon"], match: "nameExact" }],
                zone: "hand",
              },
            },
          ],
        },
      ],
    });
    expect(compiled.effects.find((entry) => entry.trigger === "AllTurns")?.actions[0]).not.toHaveProperty(
      "mode",
      "prevent",
    );
  });

  it("naturally plays Dracomon- and Examon-text Digimon at the reduced cost, then places itself", async () => {
    for (const [candidate, memory] of [
      ["BT20-023", 4],
      ["EX3-074", 14],
    ] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-009", as: "redSource" },
              { card: "BT1-027", as: "blueSource" },
            ],
            hand: [
              { card: "BT20-093", as: "option" },
              { card: candidate, as: "candidate" },
            ],
            deck: DECK_FILLER,
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = memory;
      await s.ready();

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-093"));

      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
        expect.arrayContaining([candidate, "BT20-093"]),
      );
      const printedPlayCost = getCardDefinition(candidate)?.playCost;
      if (printedPlayCost === undefined) throw new Error(`catalog play cost missing for ${candidate}`);
      expect(printedPlayCost).toBe(candidate === "BT20-023" ? 5 : 15);
      const memoryEvents = s.events.filter((event) => event.kind === "memoryChanged" && event.reason === "playCard");
      expect(memoryEvents).toHaveLength(2);
      const candidatePlay = memoryEvents[1];
      if (candidatePlay?.kind !== "memoryChanged") throw new Error("candidate play did not emit memory change");
      expect(candidatePlay.to - candidatePlay.from).toBe(-(printedPlayCost - 3));
      expect(s.events.some((event) => event.kind === "memoryChanged" && event.reason === "payCost")).toBe(true);
    }
  });

  it("public Security plays a Dracomon-name card from hand or trash for free", async () => {
    for (const zone of ["hand", "trash"] as const) {
      const s = setupEngine(
        {
          0: {
            security: [{ card: "BT20-093", as: "option" }],
            ...(zone === "hand"
              ? { hand: [{ card: "BT20-007", as: "dracomon" }] }
              : { trash: [{ card: "BT20-007", as: "dracomon" }] }),
            deck: DECK_FILLER,
          },
          1: { battleArea: [{ card: "BT20-047", as: "attacker" }], deck: DECK_FILLER },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
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
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-007")).toBe(true);
      expect(s.state.players[0]!.security).toHaveLength(0);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    }

    const nearName = setupEngine(
      {
        0: {
          security: [{ card: "BT20-093", as: "option" }],
          hand: [{ card: "BT20-023", as: "coredramon" }],
          deck: DECK_FILLER,
        },
        1: { battleArea: [{ card: "BT20-047", as: "attacker" }], deck: DECK_FILLER },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const optionId = nearName.inst("option").instanceId;
    await nearName.ready();
    const loop = nearName.engine.startTurnLoop();
    await advance(nearName.engine).waitForMainPhase(0);
    advance(nearName.engine).endMainPhaseIfOpen(0);
    await advance(nearName.engine).waitForMainPhase(1);
    expect(
      nearName.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: nearName.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      nearName.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId),
    );
    expect(nearName.state.players[0]!.hand.some((card) => card.cardId === "BT20-023")).toBe(true);
    expect(nearName.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-093")).toBe(
      true,
    );
    expect(nearName.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each(["decline", "no-target"] as const)(
    "Discord 1557553612228665396: Security still places the Option after %s",
    async (route) => {
      const s = setupEngine(
        {
          0: {
            security: [{ card: "BT20-093", as: "option" }],
            hand: [{ card: route === "decline" ? "BT20-007" : "BT1-010", as: "candidate" }],
            deck: DECK_FILLER,
          },
          1: { battleArea: [{ card: "BT1-010", as: "attacker" }], deck: DECK_FILLER },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
      const candidateId = s.inst("candidate").instanceId;
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
      await settle(() => s.events.some((event) => event.kind === "securityChecked"));
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
      expect(s.state.players[0]!.hand.some((c) => c.instanceId === candidateId)).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );

  it.each(["hand", "trash"] as const)(
    "Discord 1557553612228665396: Security waits for explicit consent to play from %s",
    async (zone) => {
      const s = setupEngine({
        0: { battleArea: [{ card: "BT1-010", as: "attacker" }], deck: DECK_FILLER },
        1: {
          security: [{ card: "BT20-093", as: "option" }],
          [zone]: [{ card: "EX3-037", as: "dracomon" }],
          deck: DECK_FILLER,
        },
      });
      const optionId = s.inst("option").instanceId;
      const dracomonId = s.inst("dracomon").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision !== undefined);
      const consent = s.decisions.at(-1)!.req;
      expect(consent).toMatchObject({ kind: "optional", sourceCardId: "BT20-093" });
      expect(s.decisions.at(-1)!.seat).toBe(1);
      expect(s.state.players[1]![zone].some((card) => card.instanceId === dracomonId)).toBe(true);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      const memoryBefore = s.state.memory;
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: consent.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      if (zone === "hand") {
        await settle(() => s.state.pendingDecision?.kind === "selectCards");
        const handPick = s.decisions.at(-1)!.req;
        expect(handPick.options?.candidateInstanceIds).toEqual([dracomonId]);
        expect(
          s.engine.applyIntent(1, {
            type: "respondDecision",
            decisionId: handPick.decisionId,
            response: { kind: "selectCards", instanceIds: [dracomonId] },
          }),
        ).toEqual({ ok: true });
      }
      await settle(
        () => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toEqual(
        expect.arrayContaining([dracomonId, optionId]),
      );
      expect(s.state.players[1]![zone].some((card) => card.instanceId === dracomonId)).toBe(false);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === optionId)).toBe(false);
      expect(s.state.memory).toBe(memoryBefore);
      expect(
        s.events.some(
          (event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-037" && event.timing === "OnPlay",
        ),
      ).toBe(true);
    },
  );

  it.each(["hand", "trash"] as const)(
    "Discord 1557553612228665396: Pomumon blocks the %s play but Security still places the Option",
    async (zone) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT1-010", as: "attacker" }, { card: "BT9-047" }],
            deck: DECK_FILLER,
          },
          1: {
            security: [{ card: "BT20-093", as: "option" }],
            [zone]: [{ card: "BT20-007", as: "dracomon" }],
            deck: DECK_FILLER,
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
      const dracomonId = s.inst("dracomon").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]![zone].some((card) => card.instanceId === dracomonId)).toBe(true);
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toEqual([optionId]);
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(
        s.decisions.some(
          ({ req }) => req.kind === "selectCards" && req.options?.candidateInstanceIds?.includes(dracomonId),
        ),
      ).toBe(false);
    },
  );

  it.each(["accept", "decline"] as const)(
    "resolves printed reactive Delay on %s through a public departure",
    async (route) => {
      const preferred: string[] = [];
      const options = {
        autoAcceptOptional: false,
        autoDeclineOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      };
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT20-027", suspended: true, as: "slayer" },
              { card: "BT20-044", as: "breaker" },
            ],
            hand: [
              { card: "BT20-093", as: "option" },
              { card: "EX3-074", as: "examon" },
            ],
            deck: ["BT1-010", "BT1-010", "BT1-010"],
          },
          1: {
            battleArea: [{ card: "BT1-027", dp: 16000, as: "opponent" }],
            hand: [{ card: "ST2-16", as: "return" }],
            deck: ["BT1-010", "BT1-010"],
          },
        },
        options,
      );
      const optionId = s.inst("option").instanceId;
      const slayerId = s.perm("slayer").permanentId;
      const slayerCardId = s.perm("slayer").topCard.instanceId;
      preferred.push(slayerId, slayerCardId);
      s.state.memory = 10;
      await s.ready();
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
      expect(s.state.players[0]!.hand.some((card) => card.cardId === "EX3-074")).toBe(true);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      s.state.memory = 7;
      options.autoDeclineOptional = route === "decline";
      options.autoAcceptOptional = route !== "decline";
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("return").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST2-16"));
      const examon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX3-074");
      const accepted = route === "accept";
      expect(examon !== undefined).toBe(accepted);
      expect(examon?.stack.map((card) => card.cardId).sort() ?? []).toEqual(accepted ? ["BT20-027", "BT20-044"] : []);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(accepted);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === slayerCardId)).toBe(!accepted);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId)).toBe(
        !accepted,
      );
      expect(s.state.memory).toBe(0);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );

  it("does not arm Delay when a qualifying suspended Digimon leaves through battle", async () => {
    const options = { autoAcceptOptional: false, autoDeclineOptional: true, autoSelectCards: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT20-027", as: "slayer" },
            { card: "BT20-044", as: "breaker" },
          ],
          hand: [
            { card: "BT20-093", as: "option" },
            { card: "EX3-074", as: "examon" },
          ],
          security: ["BT1-010"],
          deck: ["BT1-010", "BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT1-027", dp: 16000, as: "opponent" }],
          security: ["BT1-010", "BT1-010"],
          deck: ["BT1-010", "BT1-010"],
        },
      },
      options,
    );
    const optionId = s.inst("option").instanceId;
    const slayer = s.perm("slayer");
    const slayerId = slayer.permanentId;
    const slayerCardId = slayer.topCard.instanceId;
    const breakerId = s.perm("breaker").permanentId;
    s.state.memory = 10;
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "EX3-074")).toBe(true);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: breakerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    expect(s.perm("breaker").isSuspended).toBe(true);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: slayerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === slayerId)?.isSuspended).toBe(
      true,
    );
    advance(s.engine).endMainPhaseIfOpen(0);

    options.autoAcceptOptional = true;
    options.autoDeclineOptional = false;
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("opponent").permanentId,
        target: { kind: "permanent", permanentId: slayerId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === slayerCardId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === slayerCardId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === breakerId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "EX3-074")).toBe(true);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("declines the optional Main play for a nonmatching Digimon and still places the Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [
            { card: "BT20-093", as: "option" },
            { card: "BT20-010", as: "nonmatching" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-093"));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("nonmatching").instanceId)).toBe(true);
    expect(s.state.memory).toBe(2);
  });
});

describe("BT20-093 Unleash the Dragon Gene — KB Q&A rulings", () => {
  async function offeredMainCandidates(handCards: string[]) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [{ card: "BT20-093", as: "option" }, ...handCards.map((card) => ({ card, as: card }))],
          deck: DECK_FILLER,
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.decisions.some(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT20-093"));
    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT20-093");
    if (selection === undefined) throw new Error("the [Main] play selection was not raised");
    const offered = selection.req.options?.candidateInstanceIds ?? [];
    return { s, selection: selection.req, isOffered: (card: string) => offered.includes(s.inst(card).instanceId) };
  }

  it("plays a Digimon with [Dracomon] or [Examon] in its text, and nothing else (Q4433)", async () => {
    const { s, selection, isOffered } = await offeredMainCandidates(["BT20-023", "EX3-074", "BT20-010"]);

    expect(isOffered("BT20-023")).toBe(true);
    expect(isOffered("EX3-074")).toBe(true);
    expect(isOffered("BT20-010")).toBe(false);

    const coredramonId = s.inst("BT20-023").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [coredramonId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-093"));
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === coredramonId)).toBe(
      true,
    );
    expect(s.state.memory).toBe(10 - 2 - (5 - 3));
  });

  it("lets the player pick no card after accepting the optional [Main] play (Discord 1555073882145423380)", async () => {
    const { s, selection, isOffered } = await offeredMainCandidates(["BT20-023", "EX3-074"]);
    expect(isOffered("BT20-023")).toBe(true);
    expect(isOffered("EX3-074")).toBe(true);
    expect(selection.options?.min).toBe(0);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-093"));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("BT20-023").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("EX3-074").instanceId)).toBe(true);
    expect(s.state.memory).toBe(10 - 2);
  });

  it("triggers <Delay> only when one of your Digimon with [Dracomon]/[Examon] in its text would leave (Q4434)", async () => {
    const qualifying = await runDelayDeparture("BT20-027");
    expect(qualifying.examon?.stack.map((card) => card.cardId)).toContain("BT20-027");
    expect(qualifying.optionTrashed).toBe(true);

    const nonQualifying = await runDelayDeparture("BT1-043");
    expect(nonQualifying.examon).toBeUndefined();
    expect(nonQualifying.optionTrashed).toBe(false);
    expect(nonQualifying.departedCardInHand).toBe(true);
    expect(nonQualifying.examonInHand).toBe(true);
  });

  it("counts the name, inherited effect, and digivolution requirement as the card's text (Q4435)", async () => {
    const coredramon = getCardDefinition("EX3-018");
    const ryudamon = getCardDefinition("BT20-010");
    if (coredramon === undefined || ryudamon === undefined) throw new Error("catalog cards are missing");
    expect(getCardDefinition("BT21-046")?.nameEn).toBe("Dracomon (X Antibody)");
    expect(coredramon.effectText).toContain("if name contains [Dracomon]");
    expect(coredramon.effectText).not.toContain("Examon");
    expect(coredramon.inheritedEffectText).toContain("[Examon]");
    expect(coredramon.inheritedEffectText).not.toContain("Dracomon");
    expect(matchNameOrTrait(coredramon, { tokens: ["Dracomon"], match: "text" })).toBe(true);
    expect(matchNameOrTrait(coredramon, { tokens: ["Examon"], match: "text" })).toBe(true);
    expect(matchNameOrTrait(ryudamon, { tokens: ["Dracomon", "Examon"], match: "text" })).toBe(false);

    const { isOffered } = await offeredMainCandidates(["BT21-046", "EX3-018", "BT20-010"]);
    expect(isOffered("BT21-046")).toBe(true);
    expect(isOffered("EX3-018")).toBe(true);
    expect(isOffered("BT20-010")).toBe(false);
  });

  it("keeps the DNA digivolved Digimon on the battle area when one of its materials was leaving (Q4436)", async () => {
    const result = await runDelayDeparture("BT20-027");
    if (result.examon === undefined) throw new Error("the <Delay> DNA digivolution did not happen");
    expect(result.examon.permanentId).not.toBe(result.departingPermanentId);
    expect(result.examon.stack.map((card) => card.instanceId)).toContain(result.departingCardId);
    expect(result.departedCardInHand).toBe(false);
    expect(result.examonInHand).toBe(false);
  });

  it("offers <Delay> and trashes the Option even with no legal DNA digivolution (Discord 1557483604253212703)", async () => {
    const result = await runDelayDeparture("BT20-027", { examonInHand: false });
    expect(result.optionTrashed).toBe(true);
    expect(result.departedCardInHand).toBe(true);
  });
});

async function runDelayDeparture(departingCard: string, { examonInHand = true } = {}) {
  const preferred: string[] = [];
  const options = {
    autoAcceptOptional: false,
    autoDeclineOptional: true,
    autoSelectCards: true,
    preferInstanceIds: preferred,
  };
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: departingCard, suspended: true, as: "departing" },
          { card: "BT20-044", as: "breaker" },
        ],
        hand: [{ card: "BT20-093", as: "option" }, ...(examonInHand ? [{ card: "EX3-074", as: "examon" }] : [])],
        deck: ["BT1-010", "BT1-010", "BT1-010"],
      },
      1: {
        battleArea: [{ card: "BT1-027", dp: 16000, as: "opponent" }],
        hand: [{ card: "ST2-16", as: "return" }],
        deck: ["BT1-010", "BT1-010"],
      },
    },
    options,
  );
  const optionId = s.inst("option").instanceId;
  const examonCardId = examonInHand ? s.inst("examon").instanceId : undefined;
  const departingPermanentId = s.perm("departing").permanentId;
  const departingCardId = s.perm("departing").topCard.instanceId;
  preferred.push(departingPermanentId, departingCardId);
  s.state.memory = 10;
  await s.ready();
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
  advance(s.engine).endMainPhaseIfOpen(0);
  await advance(s.engine).waitForMainPhase(1);
  s.state.memory = 7;
  options.autoDeclineOptional = false;
  options.autoAcceptOptional = true;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("return").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST2-16"));
  const me = s.state.players[0]!;
  const result = {
    examon: me.battleArea.find((permanent) => permanent.topCard.instanceId === examonCardId),
    examonInHand: me.hand.some((card) => card.instanceId === examonCardId),
    departedCardInHand: me.hand.some((card) => card.instanceId === departingCardId),
    optionTrashed: me.trash.some((card) => card.instanceId === optionId),
    departingPermanentId,
    departingCardId,
  };
  expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
  await loop;
  return result;
}
