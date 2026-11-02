import { describe, expect, it } from "vitest";
import { GameState, Permanent, PlayerState, Phase, getCardDefinition, type Seat } from "@aegis/shared";
import { enumerateMainPhaseCandidates } from "./candidates.js";
import { appraiseBlock, memoryPenalty, scoreCandidate } from "./evaluate.js";
import { createEvaluationPolicy } from "./policy.js";
import { BOT_PROFILES } from "./profiles.js";
import type { BotHandCard, BotUnit, BotView } from "./view.js";
import { buildBotView } from "./view.js";

/**
 * The competence checklist, asserted directly against the evaluation.
 *
 * Each test states a position and the judgement a competent player would make in it, so
 * a weight change that breaks the judgement fails here rather than silently degrading
 * the benchmark winrate.
 */

function unit(overrides: Partial<BotUnit> & { permanentId: string }): BotUnit {
  return {
    cardId: "BT1-010",
    definition: undefined,
    dp: 4_000,
    level: 4,
    suspended: false,
    inBreeding: false,
    cannotDigivolve: false,
    keywords: [],
    canAttackPlayer: false,
    attackablePermanentIds: [],
    activatableEffects: [],
    ...overrides,
  };
}

function view(overrides: Partial<BotView> = {}): BotView {
  const board = overrides.board ?? [];
  return {
    seat: 1 as Seat,
    opponentSeat: 0 as Seat,
    phase: Phase.Main,
    turnSeat: 1 as Seat,
    gameOver: false,
    memory: 3,
    maxAffordable: 13,
    freeMemory: 3,
    hand: [],
    board,
    breeding: undefined,
    opponentBoard: [],
    securityCount: 5,
    opponentSecurityCount: 5,
    deckCount: 40,
    eggDeckCount: 4,
    trashCount: 0,
    readyAttackers: board.filter((candidate) => !candidate.suspended),
    ownFieldColors: new Set(["Red"]),
    ...overrides,
  };
}

function handCard(cardId: string, definition: BotHandCard["definition"]): BotHandCard {
  return { instanceId: `i-${cardId}`, cardId, definition, activatableEffects: [] };
}

const balanced = BOT_PROFILES.balanced;

it("uses an affordable removal Option against a large threat instead of passing", () => {
  const threat = unit({
    permanentId: "threat",
    cardId: "BT1-025",
    definition: getCardDefinition("BT1-025"),
    level: 6,
    dp: 12_000,
  });
  const state = view({
    hand: [handCard("ST1-16", getCardDefinition("ST1-16"))],
    opponentBoard: [threat],
  });

  expect(createEvaluationPolicy().chooseMainAction(state)).toEqual({
    type: "playCard",
    instanceId: "i-ST1-16",
  });
});

it("saves expensive removal when it has no target or only a small body", () => {
  const small = unit({
    permanentId: "small",
    definition: getCardDefinition("BT1-009"),
    level: 3,
    dp: 2_000,
  });
  for (const opponentBoard of [[], [small]]) {
    expect(
      createEvaluationPolicy().chooseMainAction(
        view({
          hand: [handCard("ST1-16", getCardDefinition("ST1-16"))],
          opponentBoard,
        }),
      ),
    ).toEqual({ type: "endPhase" });
  }
});

it("classifies a Dual hand action as Option use, not Digimon development", () => {
  const state = view({
    hand: [handCard("BT25-043", getCardDefinition("BT25-043"))],
    ownFieldColors: new Set(["Yellow"]),
  });
  expect(enumerateMainPhaseCandidates(state).find((entry) => entry.key === "play:i-BT25-043")?.kind).toBe("playOption");
  expect(
    enumerateMainPhaseCandidates({ ...state, ownFieldColors: new Set() }).some(
      (entry) => entry.key === "play:i-BT25-043",
    ),
  ).toBe(false);
});

function scoreOf(state: BotView, key: string, profile = balanced): number {
  const candidate = enumerateMainPhaseCandidates(state).find((entry) => entry.key === key);
  if (candidate === undefined)
    throw new Error(
      `no candidate ${key}; had ${enumerateMainPhaseCandidates(state)
        .map((entry) => entry.key)
        .join(", ")}`,
    );
  return scoreCandidate(state, candidate, profile);
}

describe("attack evaluation", () => {
  it("uses live public security-check projections, preserving explicit zero", () => {
    const state = new GameState();
    const player = new PlayerState();
    const attacker = new Permanent();
    attacker.permanentId = "projected";
    player.battleArea.push(attacker);
    state.players.push(player);

    for (const checks of [0, 1, 3]) {
      attacker.securityAttack = checks;
      expect(buildBotView(state, 0)?.board[0]?.securityAttack).toBe(checks);
    }
  });

  it("prioritizes multiple projected security checks over a larger single-check body", () => {
    const multi = unit({ permanentId: "multi", dp: 8_000, securityAttack: 3, canAttackPlayer: true });
    const big = unit({ permanentId: "big", dp: 12_000, securityAttack: 1, canAttackPlayer: true });
    const state = view({ board: [big, multi] });

    expect(createEvaluationPolicy().chooseMainAction(state)).toMatchObject({
      type: "attack",
      attackerPermanentId: "multi",
    });
  });

  it("gives zero checks no security value or direct lethal credit", () => {
    const attacker = unit({ permanentId: "zero", securityAttack: 0, canAttackPlayer: true });
    const state = view({ board: [attacker] });

    expect(scoreOf(state, "attackPlayer:zero")).toBe(0);
    expect(scoreOf(view({ board: [attacker], opponentSecurityCount: 0 }), "attackPlayer:zero")).toBe(0);
  });

  it("caps security-check value at the remaining security stack", () => {
    const attacker = unit({ permanentId: "multi", dp: 8_000, securityAttack: 3, canAttackPlayer: true });
    const single = { ...attacker, securityAttack: 1 };
    expect(scoreOf(view({ board: [attacker], opponentSecurityCount: 1 }), "attackPlayer:multi")).toBeCloseTo(
      scoreOf(view({ board: [single], opponentSecurityCount: 1 }), "attackPlayer:multi"),
    );
  });

  it("treats an attack into an empty security stack as lethal", () => {
    const attacker = unit({ permanentId: "p1", canAttackPlayer: true });
    const empty = view({ board: [attacker], opponentSecurityCount: 0 });
    const guarded = view({ board: [attacker], opponentSecurityCount: 3 });

    expect(scoreOf(empty, "attackPlayer:p1")).toBeGreaterThan(100);
    expect(scoreOf(guarded, "attackPlayer:p1")).toBeLessThan(100);
  });

  it("refuses to attack into a Blocker that beats the attacker", () => {
    const attacker = unit({ permanentId: "p1", dp: 4_000, canAttackPlayer: true });
    const blocker = unit({ permanentId: "e1", dp: 9_000, level: 5, keywords: ["Blocker"] });
    const state = view({ board: [attacker], opponentBoard: [blocker] });

    expect(scoreOf(state, "attackPlayer:p1")).toBeLessThan(0);
  });

  it("prefers the biggest attacker, which survives security and blockers best", () => {
    const big = unit({ permanentId: "big", dp: 9_000, level: 5, canAttackPlayer: true });
    const small = unit({ permanentId: "small", dp: 2_000, level: 3, canAttackPlayer: true });
    const state = view({ board: [big, small] });

    expect(scoreOf(state, "attackPlayer:big")).toBeGreaterThan(scoreOf(state, "attackPlayer:small"));
  });

  it("does not claim lethal when any unsuspended Blocker can intercept", () => {
    // The blocker LOSES the battle, but it still steps in front, and a blocked attack
    // never checks security — so this cannot be the winning swing.
    const attacker = unit({ permanentId: "p1", dp: 4_000, canAttackPlayer: true });
    const chump = unit({ permanentId: "e1", dp: 3_000, level: 3, keywords: ["Blocker"] });
    const state = view({ board: [attacker], opponentBoard: [chump], opponentSecurityCount: 0 });

    expect(scoreOf(state, "attackPlayer:p1")).toBeLessThan(100);
  });

  it("claims lethal once enough attackers exist to exhaust the blockers", () => {
    const first = unit({ permanentId: "p1", dp: 4_000, canAttackPlayer: true });
    const second = unit({ permanentId: "p2", dp: 4_000, canAttackPlayer: true });
    const chump = unit({ permanentId: "e1", dp: 3_000, level: 3, keywords: ["Blocker"] });
    const state = view({
      board: [first, second],
      opponentBoard: [chump],
      opponentSecurityCount: 0,
    });

    expect(scoreOf(state, "attackPlayer:p1")).toBeGreaterThan(100);
  });

  it("ranks lethal attacks rather than leaving the choice to tie-break jitter", () => {
    const big = unit({ permanentId: "big", dp: 9_000, level: 5, canAttackPlayer: true });
    const small = unit({ permanentId: "small", dp: 2_000, level: 3, canAttackPlayer: true });
    const state = view({ board: [big, small], opponentSecurityCount: 0 });

    const gap = scoreOf(state, "attackPlayer:big") - scoreOf(state, "attackPlayer:small");
    // The jitter is +-0.01, so the ranking must separate the two by more than that.
    expect(gap).toBeGreaterThan(0.5);
  });

  it("prices the chump block into a normal security attack", () => {
    const attacker = unit({ permanentId: "p1", dp: 6_000, level: 5, canAttackPlayer: true });
    const chump = unit({ permanentId: "e1", dp: 3_000, level: 3, keywords: ["Blocker"] });
    const open = view({ board: [attacker] });
    const guarded = view({ board: [attacker], opponentBoard: [chump] });

    // A blocker that dies to the attacker is not a deterrent, but it does deny the
    // security check, so the attack cannot be worth exactly as much as an unopposed one.
    expect(scoreOf(guarded, "attackPlayer:p1")).not.toBeCloseTo(scoreOf(open, "attackPlayer:p1"), 5);
  });

  it("keeps bigger attackers preferable at every size", () => {
    // A floored risk factor would make the product risk x value start rising again past
    // some DP, flipping the preference back to the smallest body.
    const sizes = [2_000, 5_000, 9_000, 13_000, 17_000];
    const scores = sizes.map((dp) => {
      const attacker = unit({ permanentId: "p1", dp, level: 6, canAttackPlayer: true });
      return scoreOf(view({ board: [attacker] }), "attackPlayer:p1");
    });
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]!).toBeGreaterThan(scores[index - 1]!);
    }
  });

  it("never suicides an attacker into a bigger Digimon", () => {
    const attacker = unit({ permanentId: "p1", dp: 3_000, attackablePermanentIds: ["e1"] });
    const target = unit({ permanentId: "e1", dp: 8_000, level: 5 });
    const state = view({ board: [attacker], opponentBoard: [target] });

    expect(scoreOf(state, "attackDigimon:p1:e1")).toBeLessThan(0);
  });

  it("takes a favourable Digimon trade it wins outright", () => {
    const attacker = unit({ permanentId: "p1", dp: 9_000, level: 5, attackablePermanentIds: ["e1"] });
    const target = unit({ permanentId: "e1", dp: 4_000, level: 4 });
    const state = view({ board: [attacker], opponentBoard: [target] });

    expect(scoreOf(state, "attackDigimon:p1:e1")).toBeGreaterThan(0);
  });
});

describe("development evaluation", () => {
  const greymon = {
    cardId: "BT1-015",
    set: "BT1",
    nameEn: "Greymon",
    kinds: ["Digimon"],
    colors: ["Red"],
    level: 4,
    playCost: 4,
    dp: 4_000,
    evoCosts: [],
    maxCountInDeck: 4,
  } as unknown as BotHandCard["definition"];

  it("digivolves for a real gain in level and DP", () => {
    const base = unit({ permanentId: "p1", cardId: "BT1-010", dp: 2_000, level: 3 });
    const state = view({ board: [base], hand: [handCard("BT1-015", greymon)] });
    const candidate = enumerateMainPhaseCandidates(state).find((entry) => entry.kind === "digivolve");
    expect(candidate).toBeDefined();
    expect(scoreCandidate(state, candidate!, balanced)).toBeGreaterThan(0);
  });

  it("refuses a digivolution that gains neither level nor DP", () => {
    const base = unit({ permanentId: "p1", cardId: "BT1-010", dp: 9_000, level: 6 });
    const state = view({ board: [base], hand: [handCard("BT1-015", greymon)] });
    const candidate = enumerateMainPhaseCandidates(state).find((entry) => entry.kind === "digivolve");
    expect(candidate).toBeDefined();
    expect(scoreCandidate(state, candidate!, balanced)).toBeLessThan(0);
  });

  it("plays an Option at a discount while the opponent has nothing to answer", () => {
    const option = {
      cardId: "BT1-090",
      set: "BT1",
      nameEn: "Gravity Crush",
      kinds: ["Option"],
      colors: ["Red"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      maxCountInDeck: 1,
      optionColorRequirements: ["Red"],
    } as unknown as BotHandCard["definition"];
    const supporter = unit({ permanentId: "p1", definition: { kinds: ["Digimon"], colors: ["Red"] } as never });
    const idle = view({ board: [supporter], hand: [handCard("BT1-090", option)] });
    const contested = view({
      board: [supporter],
      hand: [handCard("BT1-090", option)],
      opponentBoard: [unit({ permanentId: "e1" })],
    });

    expect(scoreOf(contested, "play:i-BT1-090")).toBeGreaterThan(scoreOf(idle, "play:i-BT1-090"));
  });
});

describe("candidate legality", () => {
  // BT25-043 is a dual ["Digimon","Option"] card: it is played on its DIGIMON side, but it
  // still carries `optionColorRequirements: ["Yellow"]`, and the engine gates on that list
  // regardless of play mode. Gating on the play kind instead would offer this play against
  // a Red-only board and collect `color-requirement-unmet`.
  const dual = getCardDefinition("BT25-043");
  const redSupporter = unit({
    permanentId: "p1",
    cardId: "BT1-010",
    definition: getCardDefinition("BT1-010"),
  });

  it("withholds a dual Digimon/Option card whose printed color requirement is unmet", () => {
    const state = view({
      board: [redSupporter],
      hand: [handCard("BT25-043", dual)],
      memory: 10,
      freeMemory: 10,
      ownFieldColors: new Set(["Red"]),
    });
    const keys = enumerateMainPhaseCandidates(state).map((entry) => entry.key);
    expect(keys).not.toContain("play:i-BT25-043");
  });

  it("offers the same dual card once its color is on the board", () => {
    const state = view({
      board: [redSupporter],
      hand: [handCard("BT25-043", dual)],
      memory: 10,
      freeMemory: 10,
      ownFieldColors: new Set(["Red", "Yellow"]),
    });
    const keys = enumerateMainPhaseCandidates(state).map((entry) => entry.key);
    expect(keys).toContain("play:i-BT25-043");
  });

  it("does not offer a battle-area-only alternate digivolution in breeding", () => {
    const shoutmon = unit({ permanentId: "raising", cardId: "BT5-009", definition: getCardDefinition("BT5-009") });
    const omniShoutmon = getCardDefinition("BT5-014");
    const state = view({ breeding: shoutmon, hand: [handCard("BT5-014", omniShoutmon)], memory: 10, freeMemory: 10 });

    expect(enumerateMainPhaseCandidates(state).map((entry) => entry.key)).not.toContain("digivolve:i-BT5-014:raising");
  });

  it("does not offer an evolution over a server-restricted base", () => {
    const negamon = unit({
      permanentId: "raising",
      cardId: "EX9-005",
      definition: getCardDefinition("EX9-005"),
      cannotDigivolve: true,
    });
    const soundbirdmon = getCardDefinition("EX9-046");
    const state = view({ breeding: negamon, hand: [handCard("EX9-046", soundbirdmon)] });

    expect(enumerateMainPhaseCandidates(state).map((entry) => entry.key)).not.toContain("digivolve:i-EX9-046:raising");
  });

  it.each([
    ["BT22-042 Nyabootmon", "BT22-036", "BT22-042", "BT22-088", 1],
    ["BT23-071 Dullahamon", "BT23-065", "BT23-071", "BT23-087", 1],
    // Erika Mishima is itself a [Hudie] Tamer and counts toward the required four.
    ["BT23-101 Hudiemon", "BT23-084", "BT23-101", "BT23-084", 3],
    ["BT24-018 Styracomon", "BT24-016", "BT24-018", "BT24-082", 1],
    ["EX2-022 Antylamon", "EX2-020", "EX2-022", "EX2-059", 1],
    ["EX10-023 Quartzmon", "EX10-018", "EX10-023", "EX10-067", 1],
    ["EX10-036 Magneticdramon", "EX10-032", "EX10-036", "EX10-063", 1],
    ["EX11-074 Vortexdramon", "EX11-032", "EX11-074", "EX11-062", 1],
  ])(
    "offers %s's conditional evolution only while its controller gate is met",
    (_, baseId, evolvingId, gateId, gateCount) => {
      const base = unit({ permanentId: "base", cardId: baseId, definition: getCardDefinition(baseId) });
      const evolving = handCard(evolvingId, getCardDefinition(evolvingId));
      const candidateKey = `digivolve:i-${evolvingId}:base`;

      expect(
        enumerateMainPhaseCandidates(view({ board: [base], hand: [evolving] })).map((entry) => entry.key),
      ).not.toContain(candidateKey);

      const gateUnits = Array.from({ length: gateCount }, (_unused, index) =>
        unit({ permanentId: `gate-${index}`, cardId: gateId, definition: getCardDefinition(gateId) }),
      );
      expect(
        enumerateMainPhaseCandidates(view({ board: [base, ...gateUnits], hand: [evolving] })).map((entry) => entry.key),
      ).toContain(candidateKey);
    },
  );

  it("offers BT14-101 WarGreymon's [Agumon] evolution only with a Tamer that has [Tai Kamiya] in its name", () => {
    const agumon = unit({ permanentId: "base", cardId: "BT14-007", definition: getCardDefinition("BT14-007") });
    const warGreymon = handCard("BT14-101", getCardDefinition("BT14-101"));
    const tamer = (cardId: string) => unit({ permanentId: "tamer", cardId, definition: getCardDefinition(cardId) });
    const candidateKeys = (tamerId: string) =>
      enumerateMainPhaseCandidates(view({ board: [agumon, tamer(tamerId)], hand: [warGreymon] })).map(
        (entry) => entry.key,
      );

    expect(candidateKeys("AD1-019")).not.toContain("digivolve:i-BT14-101:base");
    expect(candidateKeys("BT17-093")).toContain("digivolve:i-BT14-101:base");
  });
});

describe("decision candidate ranking", () => {
  it("accepts an optional unsuspend and chooses the largest suspended ally", () => {
    const ready = unit({ permanentId: "ready", dp: 15_000, level: 7 });
    const small = unit({ permanentId: "small", dp: 3_000, level: 3, suspended: true });
    const large = unit({ permanentId: "large", dp: 11_000, level: 6, suspended: true });
    const intent = createEvaluationPolicy().answerDecision(view({ board: [ready, small, large] }), {
      decisionId: "unsuspend",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Unsuspend up to 1 of your Digimon",
      options: { candidateInstanceIds: ["ready", "small", "large"], min: 0, max: 1, targetFate: "unsuspend" },
    });
    expect(intent).toMatchObject({ response: { instanceIds: ["large"] } });
  });

  it("ranks a removal-style board selection by the biggest opposing body", () => {
    const policy = createEvaluationPolicy({ profile: balanced, seed: 3 });
    const small = unit({ permanentId: "perm-e1", dp: 3_000, level: 3 });
    const large = unit({ permanentId: "perm-e2", dp: 11_000, level: 6 });
    const state = view({ opponentBoard: [small, large] });

    const intent = policy.answerDecision(state, {
      decisionId: "d1",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Delete 1 of your opponent's Digimon",
      options: { candidateInstanceIds: ["perm-e1", "perm-e2"], min: 1, max: 1 },
    });

    expect(intent).toEqual({
      type: "respondDecision",
      decisionId: "d1",
      response: { kind: "chooseTargets", instanceIds: ["perm-e2"] },
    });
  });

  it("prefers an unsuspended opposing body when the selection would suspend it", () => {
    const policy = createEvaluationPolicy({ profile: balanced, seed: 3 });
    const resting = unit({ permanentId: "perm-e1", dp: 11_000, level: 6, suspended: true });
    const standing = unit({ permanentId: "perm-e2", dp: 3_000, level: 3 });
    const state = view({ opponentBoard: [resting, standing] });

    const intent = policy.answerDecision(state, {
      decisionId: "d1",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Suspend 1 of your opponent's Digimon",
      options: { candidateInstanceIds: ["perm-e1", "perm-e2"], min: 1, max: 1, targetFate: "suspend" },
    });

    expect(intent).toEqual({
      type: "respondDecision",
      decisionId: "d1",
      response: { kind: "chooseTargets", instanceIds: ["perm-e2"] },
    });
  });

  it("pays an optional cost out of hand instead of declining it", () => {
    // The P-193 shape: "[Main] By trashing 1 card from your hand, Draw 2. Then, place
    // this card in the battle area." The cost arrives as a min:0 selectCards over our own
    // hand, and answering it empty forfeits the draw AND the placement, trashing the
    // Option for nothing. `purpose: "cost"` is what tells the two shapes apart.
    const policy = createEvaluationPolicy({ profile: balanced, seed: 3 });
    const cheap = handCard("BT1-010", getCardDefinition("BT1-010"));
    const expensive = handCard("BT5-014", getCardDefinition("BT5-014"));
    const state = view({ hand: [cheap, expensive] });

    const intent = policy.answerDecision(state, {
      decisionId: "d3",
      seat: 1,
      kind: "selectCards",
      promptText: "The Wicked God Emerges!",
      options: {
        candidateInstanceIds: [cheap.instanceId, expensive.instanceId],
        min: 0,
        max: 1,
        purpose: "cost",
      },
    });

    expect(intent).toEqual({
      type: "respondDecision",
      decisionId: "d3",
      response: { kind: "selectCards", instanceIds: [cheap.instanceId] },
    });
  });

  it("still declines an optional selection that is not a cost", () => {
    const policy = createEvaluationPolicy({ profile: balanced, seed: 3 });
    const cheap = handCard("BT1-010", getCardDefinition("BT1-010"));
    const state = view({ hand: [cheap] });

    const intent = policy.answerDecision(state, {
      decisionId: "d4",
      seat: 1,
      kind: "selectCards",
      promptText: "You may trash 1 card",
      options: { candidateInstanceIds: [cheap.instanceId], min: 0, max: 1 },
    });

    expect(intent).toEqual({
      type: "respondDecision",
      decisionId: "d4",
      response: { kind: "selectCards", instanceIds: [] },
    });
  });

  it("recognises a board candidate offered under its top card's instance id", () => {
    const policy = createEvaluationPolicy({ profile: balanced, seed: 3 });
    const small = unit({ permanentId: "perm-e1", topCardInstanceId: "inst-1", dp: 3_000, level: 3 });
    const large = unit({ permanentId: "perm-e2", topCardInstanceId: "inst-2", dp: 11_000, level: 6 });
    const state = view({ opponentBoard: [small, large] });

    const intent = policy.answerDecision(state, {
      decisionId: "d2",
      seat: 1,
      kind: "selectCards",
      promptText: "Select 1",
      options: { candidateInstanceIds: ["inst-1", "inst-2"], min: 1, max: 1 },
    });

    expect(intent).toEqual({
      type: "respondDecision",
      decisionId: "d2",
      response: { kind: "selectCards", instanceIds: ["inst-2"] },
    });
  });
});

describe("memory discipline", () => {
  it("charges far more for memory handed to the opponent than for memory we hold", () => {
    const state = view({ memory: 5, freeMemory: 5 });
    expect(memoryPenalty(state, 5, balanced)).toBeLessThan(memoryPenalty(state, 6, balanced));
    // The step from "the last free point" to "the first handed-over point" is a cliff,
    // not a slope: it also forfeits the rest of the turn.
    const withinStep = memoryPenalty(state, 5, balanced) - memoryPenalty(state, 4, balanced);
    const crossStep = memoryPenalty(state, 6, balanced) - memoryPenalty(state, 5, balanced);
    expect(crossStep).toBeGreaterThan(withinStep * 3);
  });

  it("charges more for overextending while attacks are still unspent", () => {
    const idle = view({ memory: 0, freeMemory: 0, board: [] });
    const armed = view({
      memory: 0,
      freeMemory: 0,
      board: [unit({ permanentId: "p1", canAttackPlayer: true })],
    });
    expect(memoryPenalty(armed, 3, balanced)).toBeGreaterThan(memoryPenalty(idle, 3, balanced));
  });

  it("passes the turn rather than taking an action worth less than nothing", () => {
    const policy = createEvaluationPolicy({ profile: balanced, seed: 1 });
    const attacker = unit({ permanentId: "p1", dp: 3_000, level: 3, canAttackPlayer: true });
    const wall = unit({ permanentId: "e1", dp: 12_000, level: 6, keywords: ["Blocker"] });
    const state = view({ board: [attacker], opponentBoard: [wall] });

    expect(policy.chooseMainAction(state)).toEqual({ type: "endPhase" });
  });
});

describe("blocking", () => {
  it("blocks to save the last security card even at the cost of the blocker", () => {
    const blocker = unit({ permanentId: "b1", dp: 3_000, level: 3, keywords: ["Blocker"] });
    const attacker = unit({ permanentId: "a1", dp: 9_000, level: 5 });
    const state = view({ board: [blocker], opponentBoard: [attacker], securityCount: 1 });

    expect(appraiseBlock(state, attacker, ["b1"], true, balanced)).toBeDefined();
  });

  it("holds a small blocker back while security is healthy", () => {
    const blocker = unit({ permanentId: "b1", dp: 3_000, level: 3, keywords: ["Blocker"] });
    const attacker = unit({ permanentId: "a1", dp: 12_000, level: 6 });
    const state = view({ board: [blocker], opponentBoard: [attacker], securityCount: 5 });

    expect(appraiseBlock(state, attacker, ["b1"], true, balanced)).toBeUndefined();
  });

  it("always blocks the attack that would end the game, on every profile", () => {
    // Security is empty: the next resolving attack wins. Holding the blocker is not a
    // risk preference at this point, it is losing.
    const blocker = unit({ permanentId: "b1", dp: 1_000, level: 3, keywords: ["Blocker"] });
    const attacker = unit({ permanentId: "a1", dp: 15_000, level: 7 });
    const state = view({ board: [blocker], opponentBoard: [attacker], securityCount: 0 });

    for (const profile of Object.values(BOT_PROFILES)) {
      expect(appraiseBlock(state, attacker, ["b1"], true, profile)).toEqual({
        blockerPermanentId: "b1",
        score: expect.any(Number),
      });
    }
  });

  it("is more willing to block on the defensive profile than the aggressive one", () => {
    const blocker = unit({ permanentId: "b1", dp: 4_000, level: 4, keywords: ["Blocker"] });
    const attacker = unit({ permanentId: "a1", dp: 6_000, level: 5 });
    const state = view({ board: [blocker], opponentBoard: [attacker], securityCount: 3 });

    expect(appraiseBlock(state, attacker, ["b1"], true, BOT_PROFILES.defensive)).toBeDefined();
    expect(appraiseBlock(state, attacker, ["b1"], true, BOT_PROFILES.aggressive)).toBeUndefined();
  });
});

describe("personalities", () => {
  it("differ only in weights, never in the code path taken", () => {
    const attacker = unit({ permanentId: "p1", dp: 4_000, canAttackPlayer: true });
    const blocker = unit({ permanentId: "e1", dp: 5_000, level: 4, keywords: ["Blocker"] });
    const state = view({ board: [attacker], opponentBoard: [blocker] });

    const aggressive = scoreOf(state, "attackPlayer:p1", BOT_PROFILES.aggressive);
    const defensive = scoreOf(state, "attackPlayer:p1", BOT_PROFILES.defensive);
    expect(aggressive).toBeGreaterThan(defensive);
  });

  it("is deterministic for a given seed", () => {
    const attacker = unit({ permanentId: "p1", dp: 4_000, canAttackPlayer: true });
    const state = view({ board: [attacker] });
    const first = createEvaluationPolicy({ profile: balanced, seed: 42 });
    const second = createEvaluationPolicy({ profile: balanced, seed: 42 });

    for (let step = 0; step < 5; step += 1) {
      expect(first.chooseMainAction(state)).toEqual(second.chooseMainAction(state));
    }
  });
});

it.each([false, true])(
  "only counts an unsuspended Alliance ally against a larger interceptor (suspended=%s)",
  (suspended) => {
    const attacker = unit({
      permanentId: "attacker",
      dp: 12000,
      level: 6,
      keywords: ["Alliance"],
      canAttackPlayer: true,
    });
    const ally = unit({ permanentId: "ally", dp: 2000, level: 3, suspended });
    const blocker = unit({ permanentId: "blocker", dp: 13000, level: 6, keywords: ["Blocker"] });
    const state = view({ board: [attacker, ally], opponentBoard: [blocker] });
    const score = scoreOf(state, "attackPlayer:attacker");
    expect(score > 0).toBe(!suspended);
  },
);

it.each([false, true])("uses the strongest eligible Alliance ally against suspended=%s opponents", (suspended) => {
  const attacker = unit({
    permanentId: "attacker",
    dp: 12000,
    keywords: ["Alliance"],
    canAttackPlayer: true,
    attackablePermanentIds: ["target"],
  });
  const weak = unit({ permanentId: "weak", dp: 1000 });
  const strong = unit({ permanentId: "strong", dp: 4000 });
  const target = unit({ permanentId: "target", dp: 14000, suspended, keywords: ["Blocker"] });
  const state = view({ board: [attacker, weak, strong], opponentBoard: [target] });
  const policy = createEvaluationPolicy({ profile: balanced, seed: 42 });
  expect(
    policy.chooseAllianceResponse(state, {
      kind: "alliancePrompt",
      permanentId: "attacker",
      eligibleAllyIds: ["weak", "strong"],
    }),
  ).toEqual({ type: "respondAlliance", allyPermanentId: "strong" });
  expect(scoreOf(state, suspended ? "attackDigimon:attacker:target" : "attackPlayer:attacker")).toBeGreaterThan(0);
});

it("uses the original Alliance attacker DP for next-turn retaliation", () => {
  const attacker = unit({ permanentId: "attacker", dp: 12000, keywords: ["Alliance"], canAttackPlayer: true });
  const ally = unit({ permanentId: "ally", dp: 4000 });
  const threat = unit({ permanentId: "threat", dp: 14000, suspended: true });
  const state = view({ board: [attacker, ally], opponentBoard: [threat] });
  const noRetaliation = { ...balanced, weights: { ...balanced.weights, retaliation: 0 } };
  const baseline = scoreOf(state, "attackPlayer:attacker", noRetaliation);
  expect(baseline - scoreOf(state, "attackPlayer:attacker")).toBeCloseTo(
    balanced.weights.retaliation * (attacker.level + (attacker.dp / 1000) * 0.6) * 0.3,
  );
});

it("accepts an eligible transformed Tamer for Alliance", () => {
  const attacker = unit({ permanentId: "attacker", dp: 12000, keywords: ["Alliance"] });
  const marcus = unit({ permanentId: "marcus", dp: 3000, definition: getCardDefinition("BT12-092") });
  const state = view({ board: [attacker, marcus], opponentBoard: [unit({ permanentId: "opponent", dp: 14000 })] });
  const policy = createEvaluationPolicy({ profile: balanced, seed: 42 });
  expect(
    policy.chooseAllianceResponse(state, {
      kind: "alliancePrompt",
      permanentId: "attacker",
      eligibleAllyIds: ["marcus"],
    }),
  ).toEqual({ type: "respondAlliance", allyPermanentId: "marcus" });
});
