import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT20-060.js";
import "../ST1/ST1-07.js";
import "../BT1/BT1-090.js";
import "../BT24/index.js";
import "../BT26/index.js";
import "../BT12/BT12-024.js";
import "../EX13/EX13-060.js";
import "#api/cards/BT22/BT22-042";
import "./index.js";
import "../ST21/ST21-11.js";

it("GitHub #5273: two red/black BT20 Ouryumon meet the printed DNA requirements", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT20-018", as: "first" },
          { card: "BT20-018", as: "second" },
        ],
        hand: [{ card: "BT20-060", as: "ace" }],
        deck: ["BT1-009", "BT1-009"],
      },
      1: { security: ["BT1-009", "BT1-009"] },
    },
    { autoSelectCards: true, autoOrderTriggers: true },
  );
  s.state.memory = 3;
  await s.ready();
  expect(s.inst("ace").dnaDigivolveRoutes).toHaveLength(1);
  expect(JSON.parse(s.inst("ace").dnaDigivolveRoutes[0]!.materialPermanentIdsJson)).toEqual([
    s.perm("first").permanentId,
    s.perm("second").permanentId,
  ]);
  expect(s.inst("ace").dnaDigivolveRoutes[0]!.projectedCost).toBe(0);
  expect(
    s.engine.applyIntent(0, {
      type: "dnaDigivolve",
      instanceId: s.inst("ace").instanceId,
      materialPermanentIds: [s.perm("first").permanentId, s.perm("second").permanentId],
    }),
  ).toEqual({ ok: true });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
  expect(s.state.players[0]!.battleArea).toHaveLength(1);
  expect(s.state.players[0]!.battleArea[0]!.stack.map((c) => c.cardId)).toEqual(["BT20-018", "BT20-018"]);
  expect(s.state.players[1]!.security).toHaveLength(1);
  expect(s.state.players[0]!.security).toHaveLength(1);
});

it("GitHub #5273: Blast DNA requires Alphamon plus Ouryumon, not two Ouryumon", async () => {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
      1: {
        battleArea: [{ card: "BT20-018", as: "ouryumon" }, { card: "ST21-09" }],
        hand: [{ card: "BT20-060", as: "ace" }, { card: "BT20-018", as: "partner" }, { card: "ST21-11" }],
        security: ["BT1-010"],
      },
    },
    { autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((e) => e.kind === "counterWindowOpened"));
  const opened = s.events.find((e) => e.kind === "counterWindowOpened");
  if (opened?.kind !== "counterWindowOpened") throw new Error("Counter did not open");
  expect(opened.eligibleCounters.some((c) => c.instanceId === s.inst("ace").instanceId)).toBe(false);
  expect(
    s.engine.applyIntent(1, {
      type: "respondCounter",
      sourceInstanceId: s.inst("ace").instanceId,
      effectKey: `blast-dna-digivolve:${JSON.stringify([s.perm("ouryumon").permanentId, s.inst("ouryumon").instanceId, s.inst("partner").instanceId, 0])}`,
    }),
  ).toEqual({ ok: false, reason: "illegal-target" });
  expect(s.engine.applyIntent(1, { type: "respondCounter" })).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking());
});

describe("BT20-060 Alphamon: Ouryuken", () => {
  it("Discord 1556343982546755625: Blast DNA against Lanamon consumes the selected copies from four legal combinations", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-060", as: "alphamon" }],
          hand: [
            { card: "BT20-060", as: "ace1" },
            { card: "BT20-060", as: "ace2" },
            { card: "BT20-018", as: "partner1" },
            { card: "BT20-018", as: "partner2" },
          ],
          deck: ["BT1-010", "BT1-010"],
          security: ["BT1-010"],
        },
        1: { battleArea: [{ card: "BT12-024", as: "lanamon" }], security: ["BT1-010", "BT1-010"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("lanamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("Counter did not open");
    expect(opened.eligibleCounters).toHaveLength(4);
    const effectKey = `blast-dna-digivolve:${JSON.stringify([
      s.perm("alphamon").permanentId,
      s.inst("alphamon").instanceId,
      s.inst("partner2").instanceId,
      0,
    ])}`;
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: s.inst("ace2").instanceId,
        effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("ace1").instanceId);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("partner1").instanceId);
    expect(s.state.players[0]!.battleArea[0]!.topCard.instanceId).toBe(s.inst("ace2").instanceId);
    expect(s.state.players[0]!.battleArea[0]!.stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("partner2").instanceId,
      s.inst("alphamon").instanceId,
    ]);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.some(({ kind }) => kind === "securityChecked")).toBe(false);
  });
  it("provides Blast DNA Digivolve from hand", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "Counter")).toMatchObject({
      isFromHand: true,
      keywords: [{ keyword: "BlastDNADigivolve" }],
    });
  });

  it("reduces one opposing Digimon by 15000 and, only on DNA digivolving, trashes the top security card and recovers one", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const actions = compiled.effects.find((effect) => effect.trigger === trigger)?.actions ?? [];
      expect(actions[0]).toMatchObject({ kind: "ModifyDP", amount: -15000, duration: "untilOpponentTurnEnd" });
      expect(actions[1]).toMatchObject({
        kind: "Trash",
        condition: { kind: "isDnaDigivolving" },
        target: { filter: { controller: "opponent", zone: "security", position: "top" }, count: 1 },
      });
      expect(actions[2]).toMatchObject({
        kind: "GainKeyword",
        keyword: { keyword: "Recovery", amount: 1 },
        condition: { kind: "isDnaDigivolving" },
      });
    }
  });

  it("gains 3 memory once per turn when security is removed", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")).toMatchObject({
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "any" },
          actions: [{ kind: "GainMemory", amount: 3 }],
        },
      ],
    });
  });

  it("publishes the ACE/Overflow and printed stat metadata", () => {
    expect(getCardDefinition("BT20-060")).toMatchObject({
      cardId: "BT20-060",
      nameEn: "Alphamon: Ouryuken",
      colors: ["Black", "Yellow", "Red"],
      kinds: ["Digimon"],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["NO DATA", "X Antibody", "Royal Knight", "Chronicle"],
      evoCosts: [
        { color: "Black", level: 6, memoryCost: 6 },
        { color: "Yellow", level: 6, memoryCost: 6 },
        { color: "Red", level: 6, memoryCost: 6 },
      ],
      isAce: true,
      overflowMemory: 5,
      playCost: 9,
      dp: 16000,
      level: 7,
      effectText: expect.stringContaining("trash your opponent's top security card"),
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("on normal play and evolution applies -15000 without trashing or recovering security", async () => {
    for (const mode of ["play", "digivolve"] as const) {
      const s = setupEngine(
        {
          0: {
            ...(mode === "play" ? {} : { battleArea: [{ card: "BT20-056", as: "base" }] }),
            hand: [{ card: "BT20-060", as: "ouryuken" }],
            deck: [
              { card: "BT20-047", as: "drawCard" },
              { card: "BT20-047", as: "deckTop" },
            ],
            security: ["BT20-047"],
          },
          1: {
            battleArea: [{ card: "BT20-057", dp: 20000, as: "target" }],
            security: ["BT20-047", "BT20-047"],
          },
        },
        { autoSelectCards: true },
      );
      s.state.memory = mode === "play" ? 9 : 6;
      const result =
        mode === "play"
          ? s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ouryuken").instanceId })
          : s.engine.applyIntent(0, {
              type: "digivolve",
              permanentId: s.perm("base").permanentId,
              instanceId: s.inst("ouryuken").instanceId,
            });
      expect(result).toEqual({ ok: true });
      await settle(() => s.perm("target").currentDP === 5000);
      expect(s.state.players[0]!.security).toHaveLength(1);
      expect(s.state.players[0]!.deck).toHaveLength(mode === "play" ? 2 : 1);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.state.memory).toBe(0);
    }
  });

  it("expires the -15000 reduction at the real end of the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT20-060", as: "ouryuken" }],
          deck: ["BT1-010", "BT1-010", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT20-057", dp: 20000, as: "target" }], deck: ["BT1-010", "BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 9;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ouryuken").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 5000);
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(s.perm("target").currentDP).toBe(20000);
  });

  it("Q4398 Blast DNA finishes security trash and Recovery before deleting a 0-DP target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-056", as: "alphamon" }],
          hand: [
            { card: "BT20-018", as: "ouryumon" },
            { card: "BT20-060", as: "ouryuken" },
          ],
          deck: [
            { card: "BT20-047", as: "drawn" },
            { card: "BT20-047", as: "recovered" },
          ],
          security: [{ card: "BT20-047", as: "ownSecurity" }],
        },
        1: {
          battleArea: [{ card: "BT20-057", dp: 15000, as: "target" }],
          security: [{ card: "BT20-047", as: "trashed" }, "BT20-047"],
          deck: ["BT20-001", "BT20-002"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const choice = opened.eligibleCounters.find((entry) => entry.instanceId === s.inst("ouryuken").instanceId);
    expect(choice).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: choice!.instanceId,
        effectKey: choice!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "counterResolved") &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-060") &&
        s.state.pendingDecision === undefined,
    );
    const recoveryIndex = s.events.findIndex((event) => event.kind === "securityRecovered" && event.seat === 0);
    const targetTrashIndex = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" && event.to === "trash" && event.instanceIds.includes(s.inst("target").instanceId),
    );
    expect(recoveryIndex).toBeGreaterThanOrEqual(0);
    expect(targetTrashIndex).toBeGreaterThan(recoveryIndex);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("trashed").instanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.security[0]!.instanceId).toBe(s.inst("recovered").instanceId);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("ouryuken").instanceId)).toBe(false);
    expect(
      s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT20-060")!.stack.map(
        (card) => card.cardId,
      ),
    ).toEqual(["BT20-018", "BT20-056"]);
  });

  it("does not offer Blast DNA when the Ouryumon material is missing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-056", as: "alphamon" }],
          hand: [{ card: "BT20-060", as: "ouryuken" }],
          security: ["BT20-047"],
        },
        1: {
          battleArea: [{ card: "BT20-009", as: "attacker" }],
          security: ["BT20-047"],
          deck: ["BT20-001", "BT20-002"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.events.some((event) => event.kind === "counterWindowOpened")).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("ouryuken").instanceId)).toBe(true);
  });

  it("gains 3 memory only once across two natural security removals", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT20-060", as: "ouryuken" }],
        security: ["BT1-090", "BT1-090"],
      },
      1: { battleArea: [{ card: "BT20-057", under: ["ST1-07"], as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0);
    expect(s.state.memory).toBe(-3);
  });

  it("charges Overflow -5 when the ACE leaves the field through battle", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT20-060", suspended: true, as: "ouryuken" }] },
      1: { battleArea: [{ card: "BT20-057", dp: 20000, as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("ouryuken").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("ouryuken").permanentId));
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT20-060");
  });
});

describe("BT20-060 Alphamon: Ouryuken — KB Q&A rulings", () => {
  it("resolves the checked card's [Security] effect before the security-removal memory gain (Q4399)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT20-060", as: "ouryuken" }] },
        1: { security: [{ card: "BT1-085", as: "securityTamer" }, "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 0;
    await s.ready();
    const baseline = s.events.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ouryuken").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.memory === 3 &&
        s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-085"),
    );
    const checkEvents = s.events.slice(baseline);
    const securityEffectResolved = checkEvents.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-085" && event.timing === "Security",
    );
    const removalWatcherTriggered = checkEvents.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-060",
    );
    const memoryGain = checkEvents.findIndex(
      (event) => event.kind === "memoryChanged" && event.reason === "gainMemory" && event.to - event.from === 3,
    );
    expect(securityEffectResolved).toBeGreaterThanOrEqual(0);
    expect(removalWatcherTriggered).toBeGreaterThan(securityEffectResolved);
    expect(memoryGain).toBeGreaterThan(removalWatcherTriggered);
    expect(s.state.memory).toBe(3);
  });

  it("keeps Rush granted for the turn while the security-removal memory gain continues the turn (Q4726)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT20-102", as: "omnimon" },
            { card: "BT20-060", as: "ouryuken" },
          ],
          deck: ["BT1-010", "BT1-010", "BT1-010"],
        },
        1: { security: ["BT1-010", "BT1-010", "BT1-010"], deck: ["BT1-010", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const omnimonId = s.perm("omnimon").permanentId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(
      () =>
        s.state.players[1]!.security.length === 2 &&
        s.state.turnSeat === 0 &&
        s.state.phase === Phase.Main &&
        s.state.pendingDecision === undefined,
    );

    expect(s.events).toContainEqual(
      expect.objectContaining({ kind: "attackDeclared", attackerPermanentId: omnimonId }),
    );
    expect(s.state.memory).toBe(0);
    expect(s.state.turnSeat).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("omnimon"), "Rush")).toBe(true);

    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.state.turnSeat === 1);
    expect(observe(s.engine).hasKeyword(s.perm("omnimon"), "Rush")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("Alphamon Ouryuken DNA clears the materials' pending DP reductions", () => {
  it("ends Nyabootmon's reduction when Alphamon becomes a DNA material", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-042", as: "nyabootmon" }, "BT22-032"],
          security: ["BT1-009"],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX13-060", as: "alphamon" },
            { card: "BT20-018", as: "ouryumon" },
          ],
          hand: [{ card: "BT20-060", as: "ace" }],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    const alphamonId = s.perm("alphamon").permanentId;
    preferred.push(alphamonId);
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("nyabootmon"));
    await settle();
    expect(s.perm("alphamon").currentDP).toBe(7000);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(1, {
        type: "dnaDigivolve",
        instanceId: s.inst("ace").instanceId,
        materialPermanentIds: [alphamonId, s.perm("ouryumon").permanentId],
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    const result = s.state.players[1]!.battleArea[0]!;
    expect(result.permanentId).not.toBe(alphamonId);
    expect(result.topCard.cardId).toBe("BT20-060");
    expect(result.currentDP).toBe(16000);
  });
});

describe("BT20-060 Alphamon: Ouryuken — blocked reduction resumes", () => {
  it("applies -15000 once the target's DP-reduction protection ends, through their turn (Discord 1555069212727185488)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-029", as: "holy", under: ["BT24-034"] },
            { card: "BT1-010", as: "protected", dp: 9000 },
          ],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016", "BT1-017"],
        },
        1: {
          hand: [{ card: "BT20-060", as: "alphamon" }],
          deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016", "BT1-017"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    const protectedId = s.perm("protected").permanentId;
    const protectedPermanent = () => s.state.players[0]!.battleArea.find((p) => p.permanentId === protectedId);
    preferred.push(s.perm("protected").topCard.instanceId);
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("holy"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).isRestricted(protectedPermanent()!, "dpImmune")).toBe(true);

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("alphamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT20-060") &&
        s.state.pendingDecision === undefined,
    );
    expect(protectedPermanent()?.currentDP).toBe(9000);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(protectedPermanent()).toBeUndefined();

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
