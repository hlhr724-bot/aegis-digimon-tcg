import { describe, expect, it } from "vitest";
import { CardKind, CombatWindow, GameState, Phase, PlayerState, Permanent, CardInstance } from "@aegis/shared";
import { effectiveExactNames, effectiveStaticNames, getCardDefinition, getCompiledCard } from "@aegis/shared";
import { buildTriggerKey } from "@aegis/shared";
import type { ServerEvent } from "@aegis/shared";
import { translator } from "../i18n";
import {
  breedingSlotClickAction,
  canMoveFromBreeding,
  canUseBreedingAction,
  eventsAfter,
  linkCardSlots,
  playButtonLabel,
  triggerCardId,
  triggerLabel,
  triggerLabels,
} from "./boardModel";
import {
  activeBlockWindow,
  activeCounterWindow,
  openCombatWindow,
  mirroredCombatWindow,
  lastRejectedCombatAnswer,
  ownAlliancePromptCardId,
  type MirroredCombatWindow,
} from "./combatWindowModel";
import {
  decisionCardColors,
  differentColorsAllowCandidate,
  decisionSourceCounts,
  decisionPermanentDetails,
  decisionVisibleCards,
  distinctCardIdsAllow,
  buildInstanceIndex,
  buildInstanceZoneIndex,
} from "./decisionModel";
import {
  digivolveBasePermanentIds,
  getDigivolveCostOptions,
  handCardEvolutionRoute,
  appFusionRoutesForHost,
  findDnaMaterialCombination,
} from "./digivolveModel";
import { buildMatchLog, decisionEffectSource, describeEvent } from "./matchLog";

describe("appFusionRoutesForHost", () => {
  const host = (permanentId: string, linked: { instanceId: string; cardId: string }[]) =>
    ({ permanentId, linked }) as unknown as Permanent;

  it("joins two current linked physical cards with server costs", () => {
    expect(
      appFusionRoutesForHost(
        [
          { hostPermanentId: "host", linkedInstanceId: "a", projectedCost: 0 },
          { hostPermanentId: "host", linkedInstanceId: "b", projectedCost: 2 },
        ],
        host("host", [
          { instanceId: "a", cardId: "BT23-007" },
          { instanceId: "b", cardId: "BT23-021" },
        ]),
      ),
    ).toEqual([
      { linkedInstanceId: "a", linkedCardId: "BT23-007", projectedCost: 0 },
      { linkedInstanceId: "b", linkedCardId: "BT23-021", projectedCost: 2 },
    ]);
  });

  it("rejects routes for another host, removed links, and an empty host", () => {
    const current = host("host", [{ instanceId: "a", cardId: "BT23-007" }]);
    expect(
      appFusionRoutesForHost(
        [
          { hostPermanentId: "other", linkedInstanceId: "a", projectedCost: 0 },
          { hostPermanentId: "host", linkedInstanceId: "removed", projectedCost: 1 },
        ],
        current,
      ),
    ).toEqual([]);
    expect(
      appFusionRoutesForHost([{ hostPermanentId: "host", linkedInstanceId: "a", projectedCost: 0 }], undefined),
    ).toEqual([]);
  });
});

describe("buildInstanceIndex", () => {
  it("keeps rendering when a transient state patch omits a permanent card list", () => {
    const state = {
      players: [
        {
          battleArea: [
            {
              permanentId: "agumon",
              topCard: { instanceId: "agumon-card", cardId: "BT1-010" },
              stack: undefined,
              linked: [],
            },
          ],
          breeding: undefined,
          trash: [],
          hand: [],
          deck: [],
        },
        {
          battleArea: [],
          breeding: undefined,
          trash: [],
          hand: [],
          deck: [],
        },
      ],
    } as unknown as import("@aegis/shared").GameState;

    expect(buildInstanceIndex(state, 0)).toEqual(
      new Map([
        ["agumon-card", "BT1-010"],
        ["agumon", "BT1-010"],
      ]),
    );
  });
});

describe("buildInstanceZoneIndex", () => {
  it("files digivolution cards under their own zone instead of the battle area", () => {
    const permanent = (permanentId: string, top: string, under: string) => ({
      permanentId,
      topCard: { instanceId: top, cardId: "BT1-010" },
      stack: [{ instanceId: under, cardId: "BT1-009" }],
      linked: [],
    });
    const state = {
      players: [
        {
          battleArea: [permanent("examon", "examon-card", "dracomon-card")],
          breeding: undefined,
          trash: [],
          hand: [{ instanceId: "hand-card", cardId: "BT1-010" }],
          deck: [],
        },
        {
          battleArea: [permanent("greymon", "greymon-card", "agumon-card")],
          breeding: undefined,
          trash: [],
          hand: [],
          deck: [],
        },
      ],
    } as unknown as import("@aegis/shared").GameState;

    const zones = buildInstanceZoneIndex(state, 0);
    expect(zones.get("hand-card")).toBe("hand");
    expect(zones.get("examon")).toBe("battle");
    expect(zones.get("examon-card")).toBe("battle");
    expect(zones.get("dracomon-card")).toBe("digivolutionCards");
    expect(zones.get("greymon-card")).toBe("opponentBattle");
    expect(zones.get("agumon-card")).toBe("opponentDigivolutionCards");
  });

  it("files the opponent's face-up security cards from the public projection", () => {
    const state = {
      players: [
        { battleArea: [], trash: [], hand: [], security: [], securityView: [] },
        {
          battleArea: [],
          trash: [],
          hand: [],
          security: [],
          securityView: [
            { instanceId: "", cardId: "", artId: "", faceUp: false },
            { instanceId: "face-up-security", cardId: "BT1-010", artId: "BT1-010", faceUp: true },
          ],
        },
      ],
    } as unknown as import("@aegis/shared").GameState;

    const zones = buildInstanceZoneIndex(state, 0);
    expect(zones.get("face-up-security")).toBe("security");
    expect(zones.has("")).toBe(false);
  });
});

describe("activeBlockWindow", () => {
  it("does not render an empty diagnostic block event as a pending prompt", () => {
    expect(
      activeBlockWindow(
        [
          {
            kind: "blockWindowOpened",
            attackerPermanentId: "attacker",
            eligibleBlockerIds: [],
          },
        ],
        false,
      ),
    ).toBeNull();
  });

  it("keeps a real blocker choice open until combat consumes it", () => {
    const opened: ServerEvent = {
      kind: "blockWindowOpened",
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["blanc"],
    };
    expect(activeBlockWindow([opened], false)).toEqual({
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["blanc"],
      mustBlock: false,
    });
    // ＜Collision＞ reaches the window as the compulsion the server enforces.
    expect(activeBlockWindow([{ ...opened, mustBlock: true }], false)).toMatchObject({ mustBlock: true });
    expect(
      activeBlockWindow(
        [
          opened,
          {
            kind: "blocked",
            blockerPermanentId: "blanc",
          },
        ],
        false,
      ),
    ).toBeNull();
    expect(
      activeBlockWindow(
        [
          opened,
          {
            kind: "blockDeclined",
            attackerPermanentId: "attacker",
          },
        ],
        false,
      ),
    ).toBeNull();
  });
});

describe("activeCounterWindow", () => {
  it("does not render an empty legacy Counter event as a pending prompt", () => {
    expect(
      activeCounterWindow(
        [
          {
            kind: "counterWindowOpened",
            attackerPermanentId: "attacker",
            defendingSeat: 1,
            eligibleCounters: [],
          },
        ],
        1,
        false,
      ),
    ).toBeNull();
  });

  it("does not render a mirrored Counter window that offers nothing", () => {
    const mirrored: MirroredCombatWindow = {
      key: "counter:attacker",
      kind: "counter",
      seat: 1,
      attackerPermanentId: "attacker",
      permanentId: "",
      eligiblePermanentIds: [],
      eligibleCounters: [],
      mustBlock: false,
    };
    expect(activeCounterWindow([], 1, false, { ...mirrored, eligibleCounters: [] })).toBeNull();
    expect(activeCounterWindow([], 1, true, { ...mirrored, eligibleCounters: [] })).toBeNull();
    expect(
      activeCounterWindow([], 1, false, {
        ...mirrored,
        eligibleCounters: [{ instanceId: "ace", effectKey: "counter", description: "Blast Digivolve" }],
      }),
    ).toMatchObject({ eligibleCounters: [{ instanceId: "ace" }] });
  });

  it("returns a real Counter choice only to its defending seat", () => {
    const events: ServerEvent[] = [
      {
        kind: "counterWindowOpened",
        attackerPermanentId: "attacker",
        defendingSeat: 1,
        eligibleCounters: [{ instanceId: "ace", effectKey: "counter", description: "Blast Digivolve" }],
      },
    ];
    expect(activeCounterWindow(events, 0, false)).toBeNull();
    expect(activeCounterWindow(events, 1, false)).toMatchObject({
      attackerPermanentId: "attacker",
      eligibleCounters: [{ instanceId: "ace" }],
    });
    expect(
      activeCounterWindow(
        [
          ...events,
          {
            kind: "counterResolved",
            attackerPermanentId: "attacker",
            activated: false,
          },
        ],
        1,
        false,
      ),
    ).toBeNull();
  });
});

describe("openCombatWindow", () => {
  // Minimal GameState with one permanent, controlled by seat 1, for the Alliance/Evade/Barrier
  // cases below (those prompts are scoped by permanent controller, not by defending seat).
  const stateWithPermanent = (permanentId: string, controllerSeat: 0 | 1) =>
    ({
      players: [{ battleArea: [] }, { battleArea: controllerSeat === 1 ? [{ permanentId, controllerSeat }] : [] }],
    }) as unknown as import("@aegis/shared").GameState;
  const noPermanentState = {
    players: [{ battleArea: [] }, { battleArea: [] }],
  } as unknown as import("@aegis/shared").GameState;

  it("returns null when nothing is open", () => {
    expect(openCombatWindow([], noPermanentState, 1)).toBeNull();
  });

  it("carries the opening event's stateVersion for the barrier", () => {
    const events = [
      {
        kind: "blockWindowOpened" as const,
        attackerPermanentId: "attacker",
        eligibleBlockerIds: ["blanc"],
        stateVersion: 42,
      },
    ];
    expect(openCombatWindow(events, noPermanentState, 1)).toEqual({
      key: "block:attacker",
      stateVersion: 42,
    });
  });

  it("scopes the block window to the defender, like activeBlockWindow", () => {
    const attackersTurn = {
      players: [{ battleArea: [] }, { battleArea: [] }],
      turnSeat: 0,
    } as unknown as import("@aegis/shared").GameState;
    const events = [
      {
        kind: "blockWindowOpened" as const,
        attackerPermanentId: "attacker",
        eligibleBlockerIds: ["blanc"],
        stateVersion: 42,
      },
    ];
    // Seat 0 is attacking: the question belongs to seat 1, so seat 0 raises no barrier and
    // keeps narrating what the defender does inside the window.
    expect(openCombatWindow(events, attackersTurn, 0)).toBeNull();
    expect(openCombatWindow(events, attackersTurn, 1)).toEqual({ key: "block:attacker", stateVersion: 42 });
  });

  it("scopes the Counter window to the defending seat, like activeCounterWindow", () => {
    const events = [
      {
        kind: "counterWindowOpened" as const,
        attackerPermanentId: "attacker",
        defendingSeat: 1 as const,
        eligibleCounters: [{ instanceId: "ace", effectKey: "counter", description: "Blast Digivolve" }],
        stateVersion: 7,
      },
    ];
    expect(openCombatWindow(events, noPermanentState, 0)).toBeNull();
    expect(openCombatWindow(events, noPermanentState, 1)).toEqual({ key: "counter:attacker", stateVersion: 7 });
  });

  it("scopes Alliance/Evade/Barrier prompts to the permanent's controller", () => {
    const state = stateWithPermanent("shoutmon", 1);
    const alliance = [
      { kind: "alliancePrompt" as const, permanentId: "shoutmon", eligibleAllyIds: [], stateVersion: 3 },
    ];
    expect(openCombatWindow(alliance, state, 0)).toBeNull();
    expect(openCombatWindow(alliance, state, 1)).toEqual({ key: "alliance:shoutmon", stateVersion: 3 });

    const evade = [{ kind: "evadePrompt" as const, permanentId: "shoutmon", stateVersion: 4 }];
    expect(openCombatWindow(evade, state, 1)).toEqual({ key: "evade:shoutmon", stateVersion: 4 });

    const barrier = [{ kind: "barrierPrompt" as const, permanentId: "shoutmon", stateVersion: 5 }];
    expect(openCombatWindow(barrier, state, 1)).toEqual({ key: "barrier:shoutmon", stateVersion: 5 });
  });

  it("closes on the matching resolved event, combatResolved, gameOver, and phaseChanged", () => {
    const opened = {
      kind: "blockWindowOpened" as const,
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["blanc"],
      stateVersion: 1,
    };
    expect(
      openCombatWindow([opened, { kind: "blocked", blockerPermanentId: "blanc" }], noPermanentState, 1),
    ).toBeNull();
    expect(
      openCombatWindow([opened, { kind: "blockDeclined", attackerPermanentId: "attacker" }], noPermanentState, 1),
    ).toBeNull();
    expect(
      openCombatWindow(
        [opened, { kind: "combatResolved", seat: 0, attackerPermanentId: "attacker", deletedPermanentIds: [] }],
        noPermanentState,
        1,
      ),
    ).toBeNull();
    expect(
      openCombatWindow(
        [opened, { kind: "phaseChanged", phase: "End", turnSeat: 0, turnCount: 1 }],
        noPermanentState,
        1,
      ),
    ).toBeNull();
  });
});

describe("ownAlliancePromptCardId", () => {
  it("suppresses the Alliance toast only for the player answering the prompt", () => {
    const state = new GameState();
    for (const seat of [0, 1] as const) {
      const player = new PlayerState();
      player.seat = seat;
      state.players.push(player);
    }
    const attacker = new Permanent();
    attacker.permanentId = "attacker";
    attacker.controllerSeat = 0;
    attacker.topCard = new CardInstance();
    attacker.topCard.cardId = "ST1-07";
    state.players[0]!.battleArea.push(attacker);
    state.combatWindow = new CombatWindow();
    state.combatWindow.kind = "alliance";
    state.combatWindow.seat = 0;
    state.combatWindow.permanentId = attacker.permanentId;

    expect(ownAlliancePromptCardId(state, 0)).toBe("ST1-07");
    expect(ownAlliancePromptCardId(state, 1)).toBeUndefined();
  });
});

describe("eventsAfter", () => {
  it("keeps finding new events after the rolling buffer reaches 100 entries", () => {
    const events = Array.from({ length: 100 }, (_, index): ServerEvent => ({
      kind: "cardsMoved",
      instanceIds: [`event-${index}`],
      from: "deck",
      to: "hand",
    }));
    const previous = events.at(-1)!;
    const newest: ServerEvent = { kind: "securityRecovered", seat: 0, amount: 1 };
    const rolled = [...events.slice(-99), newest];

    expect(eventsAfter(rolled, previous)).toEqual([newest]);
  });
});

describe("friendly movement log", () => {
  it("silences the physical move of a hatched egg", () => {
    const line = describeEvent({
      event: { kind: "cardsMoved", instanceIds: ["egg"], from: "eggDeck", to: "breeding" },
      viewerSeat: 0,
      identities: new Map(),
      t: translator("pt-BR"),
    });

    expect(line).toBeNull();
  });

  it("names only the chosen publicly revealed card and its source", () => {
    const revealed: ServerEvent = {
      kind: "cardRevealed",
      seat: 0,
      cardId: "BT1-045",
      sourceCardId: "EX3-029",
    };

    expect(describeEvent({ event: revealed, viewerSeat: 0, identities: new Map(), t: translator("pt-BR") })?.text).toBe(
      "Você revelou Tsukaimon (BT1-045) com Airdramon (EX3-029)",
    );
    expect(describeEvent({ event: revealed, viewerSeat: 1, identities: new Map(), t: translator("pt-BR") })?.text).toBe(
      "Oponente revelou Tsukaimon (BT1-045) com Airdramon (EX3-029)",
    );
  });
});

describe("friendly memory log", () => {
  it("does not expose internal engine reasons", () => {
    const line = describeEvent({
      event: { kind: "memoryChanged", from: 0, to: -5, reason: "playCard" },
      viewerSeat: 0,
      identities: new Map(),
      t: translator("pt-BR"),
    });

    expect(line?.text).toBe("Memória de Você: 0 → -5");
    expect(line?.text).not.toContain("playCard");
  });

  it("collapses the duplicate memory line a paid play emits", () => {
    const events: ServerEvent[] = [
      { kind: "memoryChanged", from: 3, to: 1, reason: "playCard" },
      { kind: "memoryChanged", from: 3, to: 1, reason: "payCost" },
    ];

    expect(buildMatchLog(events, 0, new Map(), translator("pt-BR")).map((line) => line.text)).toEqual([
      "Memória de Você: 3 → 1",
    ]);
  });

  it("keeps two identical non-memory lines, which are two real moves", () => {
    // Both players milling 2 cards reads the same way; collapsing it would hide one of the moves.
    const events: ServerEvent[] = [
      { kind: "cardsMoved", instanceIds: ["a", "b"], from: "deck", to: "trash" },
      { kind: "cardsMoved", instanceIds: ["c", "d"], from: "deck", to: "trash" },
    ];

    expect(buildMatchLog(events, 0, new Map(), translator("pt-BR"))).toHaveLength(2);
  });
});

describe("findDnaMaterialCombination", () => {
  it("accepts BT22-014 Gaiomon's [Rule] [Greymon] name for BT22-015 Omnimon", () => {
    const permanent = (permanentId: string, cardId: string) =>
      ({
        permanentId,
        topCard: { instanceId: `${permanentId}-top`, cardId },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(
      findDnaMaterialCombination("BT22-015", [permanent("gaiomon", "BT22-014"), permanent("cres", "AD1-012")]),
    ).toEqual(["gaiomon", "cres"]);
  });

  it("finds distinct yellow and purple level 5 materials for Mastemon", () => {
    const permanent = (permanentId: string, cardId: string) =>
      ({
        permanentId,
        topCard: { instanceId: `${permanentId}-top`, cardId },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(
      findDnaMaterialCombination("ST10-06", [permanent("yellow", "ST10-05"), permanent("purple", "ST10-12")]),
    ).toEqual(["yellow", "purple"]);
  });

  it("assigns two dual-color Ophanimon Falldown Mode to Ordinemon's distinct slots", () => {
    const permanent = (permanentId: string) =>
      ({
        permanentId,
        topCard: { instanceId: `${permanentId}-top`, cardId: "BT8-082" },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(findDnaMaterialCombination("BT9-082", [permanent("host"), permanent("partner")])).toEqual([
      "host",
      "partner",
    ]);
  });

  it("tries every printed DNA requirement until BT18-041 finds a legal color pair", () => {
    const permanent = (permanentId: string, cardId: string) =>
      ({
        permanentId,
        topCard: { instanceId: `${permanentId}-top`, cardId },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(
      findDnaMaterialCombination("BT18-041", [permanent("blue", "BT1-040"), permanent("black", "BT10-064")]),
    ).toEqual(["blue", "black"]);
  });

  it("preserves both legal choices when Ordinemon is dropped onto a dual-color material", () => {
    const permanent = (permanentId: string) =>
      ({
        permanentId,
        controllerSeat: 0,
        topCard: { instanceId: `${permanentId}-top`, cardId: "BT8-082" },
        stack: [],
        linked: [],
      }) as unknown as Permanent;
    const host = permanent("host");
    const partner = permanent("partner");

    expect(handCardEvolutionRoute("BT9-082", [host, partner], true)).toEqual({
      kind: "both",
      materialPermanentIds: ["host", "partner"],
    });
  });

  it("offers only the DNA route when the server rejects the normal digivolution", () => {
    const permanent = (permanentId: string) =>
      ({
        permanentId,
        controllerSeat: 0,
        topCard: { instanceId: `${permanentId}-top`, cardId: "BT8-082" },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(handCardEvolutionRoute("BT9-082", [permanent("host"), permanent("partner")], false)).toEqual({
      kind: "dna",
      materialPermanentIds: ["host", "partner"],
    });
  });

  it("uses the server-projected EX13 DNA route for destination-specific effective levels", () => {
    const permanent = (permanentId: string, cardId: string) =>
      ({
        permanentId,
        controllerSeat: 0,
        topCard: { instanceId: `${permanentId}-top`, cardId },
        stack: [],
        linked: [],
      }) as unknown as Permanent;
    const wingdramon = permanent("wingdramon", "EX13-021");
    const groundramon = permanent("groundramon", "EX13-041");

    expect(
      handCardEvolutionRoute("EX13-045", [wingdramon, groundramon], false, [
        { materialPermanentIds: ["wingdramon", "groundramon"], projectedCost: 0 },
      ]),
    ).toEqual({ kind: "dna", materialPermanentIds: ["wingdramon", "groundramon"] });
  });

  it("finds two same-color level 4 materials for Kimeramon, whose requirement lives only in the shared overrides", () => {
    const permanent = (permanentId: string, cardId: string) =>
      ({
        permanentId,
        topCard: { instanceId: `${permanentId}-top`, cardId },
        stack: [],
        linked: [],
      }) as unknown as Permanent;

    expect(
      findDnaMaterialCombination("BT8-084", [permanent("purpleA", "BT10-074"), permanent("purpleB", "BT10-075")]),
    ).toEqual(["purpleA", "purpleB"]);
  });

  it("returns undefined when the field does not satisfy every DNA slot", () => {
    const yellow = {
      permanentId: "yellow",
      topCard: { instanceId: "yellow-top", cardId: "ST10-05" },
      stack: [],
      linked: [],
    } as unknown as Permanent;
    expect(findDnaMaterialCombination("ST10-06", [yellow])).toBeUndefined();
  });
});

describe("digivolveBasePermanentIds", () => {
  // Bug: dragging a hand Digimon marked every permanent on the field, Tamers included,
  // because the board painted "this area accepts the drop" rather than "this is a base".
  const digimon = permOf("ST10-05");
  const tamer = permOf("BT7-085");

  it("leaves a Tamer out of the bases the server offered", () => {
    expect(digivolveBasePermanentIds("ST10-06", [digimon, tamer], [digimon.permanentId])).toEqual([
      digimon.permanentId,
    ]);
  });

  it("5166: dropping on a later DNA material opens its pair, and unrelated bases have no DNA route", () => {
    const routes = [
      { materialPermanentIds: ["yellow", "purple-one"], projectedCost: 0 },
      { materialPermanentIds: ["yellow", "purple-two"], projectedCost: 0 },
    ];
    expect(handCardEvolutionRoute("ST10-06", [], false, routes, "purple-two")).toEqual({
      kind: "dna",
      materialPermanentIds: ["yellow", "purple-two"],
    });
    expect(handCardEvolutionRoute("ST10-06", [], false, routes, "unrelated")).toBeUndefined();
    expect(handCardEvolutionRoute("ST10-06", [], true, routes, "unrelated")).toEqual({ kind: "normal" });
  });

  it("5166: highlights the materials from every server-projected DNA pair", () => {
    const second = permOf("ST10-12");
    const unused = permOf("BT8-082");
    expect(
      digivolveBasePermanentIds(
        "ST10-06",
        [digimon, second, unused],
        [],
        [
          { materialPermanentIds: [digimon.permanentId, second.permanentId], projectedCost: 0 },
          { materialPermanentIds: [digimon.permanentId, unused.permanentId], projectedCost: 0 },
        ],
      ),
    ).toEqual([digimon.permanentId, second.permanentId, unused.permanentId]);
  });

  it("marks nothing when the card has no base on the field", () => {
    expect(digivolveBasePermanentIds("BT17-012", [digimon, tamer], [])).toEqual([]);
  });

  it("adds the Digimon a DNA declaration would consume, and only those", () => {
    const purple = permOf("ST10-12");

    expect(digivolveBasePermanentIds("ST10-06", [digimon, purple, tamer], [])).toEqual([
      digimon.permanentId,
      purple.permanentId,
    ]);
  });

  it("keeps a base outside the battle area, such as the raised Digimon, off the field", () => {
    // The lone battle-area Digimon is no consolation prize: a DNA declaration needs
    // two materials, so dropping the breeding base leaves nothing to mark.
    expect(digivolveBasePermanentIds("ST10-06", [digimon], ["perm-breeding"])).toEqual([]);
  });
});

describe("decisionVisibleCards", () => {
  it("keeps revealed printing IDs per copy and never projects art without a visible identity", () => {
    const cards = decisionVisibleCards(
      {
        visibleInstanceIds: ["one", "two", "hidden"],
        visibleCards: [{ instanceId: "one", cardId: "BT1-010", artId: "BT1-010_P1" }],
      },
      new Map([["two", "BT1-010"]]),
      new Map([
        ["one", "BT1-010_P2"],
        ["two", "BT1-010_P3"],
        ["hidden", "BT1-010_P4"],
      ]),
    );
    expect(cards).toEqual([
      { instanceId: "one", cardId: "BT1-010", artId: "BT1-010_P1" },
      { instanceId: "two", cardId: "BT1-010", artId: "BT1-010_P3" },
      { instanceId: "hidden", cardId: undefined },
    ]);
  });

  it("uses authoritative reveal identities when zone state has not indexed every card yet", () => {
    const staleIndex = new Map([["revealed-1", "ST12-10"]]);
    const cards = decisionVisibleCards(
      {
        candidateInstanceIds: ["revealed-1", "revealed-2"],
        visibleInstanceIds: ["revealed-1", "revealed-2", "revealed-3"],
        visibleCards: [
          { instanceId: "revealed-1", cardId: "ST12-10" },
          { instanceId: "revealed-2", cardId: "ST12-12" },
          { instanceId: "revealed-3", cardId: "BT1-001" },
        ],
      },
      staleIndex,
    );

    expect(cards).toEqual([
      { instanceId: "revealed-1", cardId: "ST12-10" },
      { instanceId: "revealed-2", cardId: "ST12-12" },
      { instanceId: "revealed-3", cardId: "BT1-001" },
    ]);
  });

  it("derives different-color legality from authoritative reveal cards while zone state lags", () => {
    const staleIndex = new Map<string, string>();
    const cards = decisionVisibleCards(
      {
        candidateInstanceIds: ["red-one", "red-two", "blue"],
        visibleCards: [
          { instanceId: "red-one", cardId: "BT1-009" },
          { instanceId: "red-two", cardId: "ST1-02" },
          { instanceId: "blue", cardId: "BT1-029" },
        ],
      },
      staleIndex,
    );

    const colors = decisionCardColors(cards);
    expect(colors).toEqual(
      new Map([
        ["red-one", ["Red"]],
        ["red-two", ["Red"]],
        ["blue", ["Blue"]],
      ]),
    );
    expect(differentColorsAllowCandidate("red-two", ["red-one"], colors, true)).toBe(false);
    expect(differentColorsAllowCandidate("blue", ["red-one"], colors, true)).toBe(true);
  });
});

describe("distinctCardIdsAllow", () => {
  it("keeps the selected copy interactive but disables another instance of the same card", () => {
    const cardIds = new Map([
      ["copy-a", "EX1-048"],
      ["copy-b", "EX1-048"],
      ["other", "EX1-049"],
    ]);

    expect(distinctCardIdsAllow("copy-a", ["copy-a"], cardIds, true)).toBe(true);
    expect(distinctCardIdsAllow("copy-b", ["copy-a"], cardIds, true)).toBe(false);
    expect(distinctCardIdsAllow("other", ["copy-a"], cardIds, true)).toBe(true);
    expect(distinctCardIdsAllow("copy-b", ["copy-a"], cardIds, false)).toBe(true);
  });
});

describe("decisionSourceCounts", () => {
  it("indexes a stack by permanentId and by its top-card instanceId", () => {
    const permanent = {
      permanentId: "machinedramon-with-stack",
      topCard: { instanceId: "machinedramon-top", cardId: "EX1-073" },
      stack: [
        { instanceId: "source-1", cardId: "EX1-048" },
        { instanceId: "source-2", cardId: "EX1-049" },
      ],
      linked: [],
    } as unknown as Permanent;

    const counts = decisionSourceCounts([permanent]);

    expect(counts.get("machinedramon-with-stack")).toBe(2);
    expect(counts.get("machinedramon-top")).toBe(2);
  });
});

describe("decisionPermanentDetails", () => {
  it("indexes live DP and suspension by permanent and top-card identity", () => {
    const permanent = {
      permanentId: "boosted-machinedramon",
      topCard: { instanceId: "machinedramon-top", cardId: "EX1-073" },
      stack: [],
      linked: [],
      currentDP: 14_000,
      isSuspended: true,
    } as unknown as Permanent;

    const details = decisionPermanentDetails([permanent]);

    expect(details.get("boosted-machinedramon")).toEqual({ currentDP: 14_000, isSuspended: true });
    expect(details.get("machinedramon-top")).toEqual({ currentDP: 14_000, isSuspended: true });
  });
});

function permOf(cardId: string): Permanent {
  return {
    permanentId: `perm-${cardId}`,
    controllerSeat: 0,
    topCard: { cardId, instanceId: `i-${cardId}` },
    stack: [{ cardId, instanceId: `i-${cardId}` }],
    suspended: false,
    inBreeding: false,
  } as unknown as Permanent;
}

it("GitHub #5385 keeps Neptunemon's TS route index onto Holy instead of an invalid Aqua route", () => {
  const base = permOf("BT26-029");
  const options = getDigivolveCostOptions("BT24-030", base, undefined, undefined, [
    { permanentId: base.permanentId, alternateRequirementIndex: -1, projectedCost: 4 },
    { permanentId: base.permanentId, alternateRequirementIndex: 2, projectedCost: 3 },
  ]);
  expect(options.filter((option) => option.type === "alternate")).toEqual([
    expect.objectContaining({ cost: 3, alternateRequirementIndex: 2 }),
  ]);
});

it.each(["BT10-023", "BT2-029", "BT24-028"])(
  "GitHub #5385 preserves Neptunemon's Aqua substring route onto %s",
  (cardId) => {
    expect(getDigivolveCostOptions("BT24-030", permOf(cardId))).toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 3, alternateRequirementIndex: 0 }),
    );
  },
);

function permWithStack(cardId: string, under: string[]): Permanent {
  return {
    ...permOf(cardId),
    stack: [
      { cardId, instanceId: `i-${cardId}` },
      ...under.map((underCardId, index) => ({
        cardId: underCardId,
        instanceId: `under-${underCardId}-${index}`,
      })),
    ],
  } as unknown as Permanent;
}

describe("BT23-013 conditional Huckmon warp", () => {
  it.each([0, 9999, 10000])("offers the warp only with an opposing Digimon at 10000 DP (actual %i)", (dp) => {
    const opponent = new PlayerState();
    if (dp > 0) {
      const permanent = new Permanent();
      permanent.topCard = new CardInstance();
      permanent.topCard.cardId = "BT1-024";
      permanent.currentDP = dp;
      opponent.battleArea.push(permanent);
    }
    const options = getDigivolveCostOptions("BT23-013", permOf("BT23-006"), undefined, opponent);
    expect(options.some((option) => option.type === "alternate" && option.cost === 5)).toBe(dp >= 10000);
  });
});

describe("Burst Digivolve Tamer return cost", () => {
  const inPlay = (cardId: string) =>
    Object.assign(new Permanent(), {
      permanentId: `perm-${cardId}`,
      topCard: Object.assign(new CardInstance(), { cardId, instanceId: `i-${cardId}` }),
    });

  it.each([
    ["BT25-104", "BT12-043", "BT13-095"],
    ["BT13-020", "BT13-018", "BT13-095"],
    ["BT13-033", "BT13-031", "BT13-097"],
    ["BT13-060", "BT13-057", "BT13-100"],
    ["BT13-092", "BT13-089", "BT13-102"],
    ["BT26-050", "BT26-049", "BT26-091"],
  ])("%s only offers cost 0 with its required Tamer in the viewer's battle area", (cardId, baseId, tamerId) => {
    const base = inPlay(baseId);
    const viewer = new PlayerState();
    const opponent = new PlayerState();
    opponent.battleArea.push(inPlay(tamerId));
    viewer.hand.push(Object.assign(new CardInstance(), { cardId: tamerId }));
    viewer.trash.push(Object.assign(new CardInstance(), { cardId: tamerId }));
    viewer.breeding = inPlay(tamerId);
    viewer.battleArea.push(base, inPlay("BT1-085"));
    const withoutTamer = getDigivolveCostOptions(cardId, base, viewer, opponent);
    expect(withoutTamer.some((option) => option.cost === 0)).toBe(false);
    expect(withoutTamer.some((option) => option.cost > 0)).toBe(true);
    expect(getDigivolveCostOptions(cardId, base).some((option) => option.cost === 0)).toBe(false);

    const tamer = inPlay(tamerId);
    tamer.isSuspended = true;
    viewer.battleArea.push(tamer);
    expect(getDigivolveCostOptions(cardId, base, viewer, opponent)).toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 0 }),
    );
    viewer.battleArea.pop();
    expect(getDigivolveCostOptions(cardId, base, viewer, opponent)).toEqual(withoutTamer);
  });

  it.each(["BT4-092", "BT12-092", "BT13-095", "BT17-087", "BT21-086"])(
    "accepts Marcus Damon %s in play for BT25-104",
    (tamerId) => {
      const viewer = new PlayerState();
      viewer.battleArea.push(inPlay(tamerId));
      expect(getDigivolveCostOptions("BT25-104", inPlay("BT12-043"), viewer)).toContainEqual(
        expect.objectContaining({ type: "alternate", cost: 0, alternateRequirementIndex: 1 }),
      );
    },
  );
});

describe("BT10-086 intrinsic digivolution cost reduction", () => {
  it("shows cost 1 for the alternate [Omnimon] path with X Antibody in the base stack", () => {
    const options = getDigivolveCostOptions("BT10-086", permWithStack("AD1-025", ["BT9-109"]));
    expect(options).toContainEqual(expect.objectContaining({ type: "alternate", cost: 1 }));
  });

  it("shows cost 5 for the regular red level-6 path with X Antibody in the base stack", () => {
    const options = getDigivolveCostOptions("BT10-086", permWithStack("BT1-025", ["BT9-109"]));
    expect(options).toContainEqual(expect.objectContaining({ type: "normal", cost: 5 }));
  });
});

describe("alternate digivolve paths that match a printed cost", () => {
  it("hides a cost-only alternate path that costs the same as the printed path", () => {
    expect(getDigivolveCostOptions("EX5-008", permOf("EX5-007"))).toEqual([
      expect.objectContaining({ type: "normal", cost: 2 }),
    ]);
  });

  it("keeps an alternate path with a different cost", () => {
    const options = getDigivolveCostOptions("EX5-054", permOf("EX13-031"));
    expect(options).toEqual([
      expect.objectContaining({ type: "normal", cost: 4 }),
      expect.objectContaining({ type: "alternate", cost: 3 }),
    ]);
  });
});

describe("digivolving a Digimon rewritten to a white [Sukamon]", () => {
  const rewrittenSunflowmon = (): Permanent =>
    ({
      ...permOf("BT10-048"),
      originalNameOverride: "Sukamon",
      originalColorsOverride: ["White"],
      originalDPOverride: 3000,
    }) as unknown as Permanent;

  it("offers no green route onto the rewritten green Sunflowmon", () => {
    expect(getDigivolveCostOptions("BT3-054", rewrittenSunflowmon())).toEqual([]);
  });

  it("offers the white Lv.4 route onto it", () => {
    expect(getDigivolveCostOptions("BT8-084", rewrittenSunflowmon())).toEqual([
      { type: "normal", label: "White Lv.4", cost: 4 },
    ]);
  });

  it("offers the green route again without the rewrite", () => {
    expect(getDigivolveCostOptions("BT3-054", permOf("BT10-048"))).toEqual([
      { type: "normal", label: "Green Lv.4", cost: 3 },
    ]);
  });
});

describe("equivalent digivolution requirements", () => {
  it("combines EX8 Dinomon's same-cost Tyrannomon and Dinosaur routes", () => {
    expect(getDigivolveCostOptions("EX8-016", permOf("EX11-010"))).toEqual([
      {
        type: "normal",
        label: "Red Lv.5",
        cost: 5,
      },
      {
        type: "alternate",
        label: "Tyrannomon / [Dinosaur] trait Lv.5",
        cost: 4,
        alternateRequirementIndex: 0,
      },
    ]);
  });
});

describe("BT22-076 intrinsic Ver.1 digivolution cost reduction", () => {
  it("shows the reduced cost 3 for a legal yellow level-5 Ver.1 base", () => {
    const options = getDigivolveCostOptions("BT22-076", permOf("BT22-038"));
    expect(options).toContainEqual(expect.objectContaining({ type: "normal", cost: 3 }));
  });
});

describe("BT22-061 intrinsic face-down-source digivolution reduction", () => {
  it("shows cost 1 from a Ver.2 Vegiemon with two face-down sources", () => {
    const base = permOf("BT22-049");
    base.stack = [
      { cardId: "BT1-001", instanceId: "fd-1", faceUp: false },
      { cardId: "BT1-002", instanceId: "fd-2", faceUp: false },
    ] as typeof base.stack;
    const options = getDigivolveCostOptions("BT22-061", base);
    expect(options).toContainEqual(expect.objectContaining({ type: "alternate", cost: 1 }));
  });

  it("shows the full cost 3 from a Ver.2 Vegiemon in the breeding area", () => {
    const base = permOf("BT22-049");
    base.inBreeding = true;
    base.stack = [{ cardId: "BT1-001", instanceId: "fd-1", faceUp: false }] as typeof base.stack;
    const options = getDigivolveCostOptions("BT22-061", base);
    expect(options).toContainEqual(expect.objectContaining({ type: "alternate", cost: 3 }));
  });
});

describe("Lopmon base-granted evolution pricing", () => {
  it.each([
    ["own Makiko", ["BT23-082"], [], true],
    ["missing Makiko", [], [], false],
    ["opponent Makiko", [], ["BT23-082"], false],
    ["card naming Makiko in its text", ["BT23-026"], [], false],
  ] as const)("offers Antylamon at cost 3 only with %s", (_label, ownCards, opponentCards, eligible) => {
    const owner = new PlayerState();
    const opponent = new PlayerState();
    for (const [player, cards] of [
      [owner, ownCards],
      [opponent, opponentCards],
    ] as const) {
      for (const cardId of cards) {
        const permanent = new Permanent();
        permanent.topCard = new CardInstance();
        permanent.topCard.cardId = cardId;
        player.battleArea.push(permanent);
      }
    }
    const options = getDigivolveCostOptions("BT23-029", permOf("BT23-026"), owner, opponent);
    expect(options.map(({ type, cost }) => ({ type, cost }))).toEqual(eligible ? [{ type: "alternate", cost: 3 }] : []);
  });
});

describe("Tamer-onto digivolution cost paths (BT17-012 family)", () => {
  // Bug: BT17-012 prints SPECIFIC named requirements ([Takuya Kanbara]: Cost 2,
  // [Agunimon]: Cost 1) alongside a generic "onto any red Tamer as level 3" effect.
  // The client must offer the named cost onto a named base, and the derived generic
  // cost onto an unnamed same-color Tamer — never the stale compiled entry.
  it("offers cost 2 onto Takuya Kanbara (named Tamer path)", () => {
    const opts = getDigivolveCostOptions("BT17-012", permOf("BT7-085"));
    expect(opts.some((o) => o.type === "alternate" && o.cost === 2)).toBe(true);
  });

  it("offers cost 1 onto Agunimon (named slide-evolution onto a Digimon)", () => {
    const opts = getDigivolveCostOptions("BT17-012", permOf("BT4-011"));
    expect(opts.some((o) => o.type === "alternate" && o.cost === 1)).toBe(true);
    expect(getDigivolveCostOptions("BT17-012", permOf("BT4-011")).length > 0).toBe(true);
  });

  it("offers the derived generic cost onto an unnamed red Tamer, not cost 0", () => {
    // A red Tamer with no named requirement match uses the red Lv.3 EvoCost (memory 3).
    const opts = getDigivolveCostOptions("BT17-012", permOf("BT12-088"));
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.cost !== 0)).toBe(true);
    expect(opts.some((o) => o.cost === 3)).toBe(true);
  });

  it.each([
    ["BT4-011", "BT7-085", 2],
    ["BT4-013", "BT7-085", 3],
    ["BT4-025", "BT4-093", 2],
  ] as const)("Family-B %s onto %s uses derived cost %i", (cardId, tamerId, expectedCost) => {
    const opts = getDigivolveCostOptions(cardId, permOf(tamerId));
    expect(opts).toContainEqual(expect.objectContaining({ type: "alternate", cost: expectedCost }));
    expect(opts.every((o) => o.cost !== 0)).toBe(true);
  });

  it("uses BT7's canonical target filter for Tamer color and fixed cost", () => {
    const greenTamer = getDigivolveCostOptions("BT7-047", permOf("BT7-089"));
    expect(greenTamer).toContainEqual(expect.objectContaining({ type: "alternate", cost: 2 }));

    const redTamer = getDigivolveCostOptions("BT7-047", permOf("BT7-085"));
    expect(redTamer.some((option) => option.type === "alternate")).toBe(false);
  });
});

describe("AD1-002 onto a [Takuya Kanbara] Tamer w/2+ [Hybrid] cards under it", () => {
  // Bug: the client's name gate compared only the base's printed nameEn, while the server
  // compares its EFFECTIVE names. AD1-020 ("Tommy, Takuya, & Zoe") is also treated as
  // [Takuya Kanbara], so the server accepted the digivolve but the client never offered it.
  // The client also ignored the stack gate, so it offered the path with too few Hybrids.
  const HYBRID_UNDER = ["AD1-002", "BT12-009"];

  function tamerWithUnder(cardId: string, under: string[]): Permanent {
    return {
      ...permOf(cardId),
      stack: under.map((id, i) => ({ cardId: id, instanceId: `u-${id}-${i}` })),
    } as unknown as Permanent;
  }

  it("offers the cost-3 path onto AD1-020, whose effective names include [Takuya Kanbara]", () => {
    const base = tamerWithUnder("AD1-020", HYBRID_UNDER);
    expect(getDigivolveCostOptions("AD1-002", base).length > 0).toBe(true);
    expect(getDigivolveCostOptions("AD1-002", base).some((o) => o.cost === 3)).toBe(true);
  });

  it("offers the cost-3 path onto a printed [Takuya Kanbara] Tamer", () => {
    const base = tamerWithUnder("BT12-088", HYBRID_UNDER);
    expect(getDigivolveCostOptions("AD1-002", base).length > 0).toBe(true);
  });

  it("withholds the path when fewer than 2 [Hybrid] cards are under the Tamer", () => {
    const base = tamerWithUnder("AD1-020", ["AD1-002"]);
    expect(getDigivolveCostOptions("AD1-002", base).length > 0).toBe(false);
  });

  it("withholds the path onto an unrelated Tamer", () => {
    const base = tamerWithUnder("BT1-085", HYBRID_UNDER); // Tai Kamiya
    expect(getDigivolveCostOptions("AD1-002", base).length > 0).toBe(false);
  });
});

describe("server-priced digivolution routes", () => {
  it("labels every path with the server's price, printed figures only where it published none", () => {
    // BT24-101 prints Yellow Lv.5 = 5, [TS] = 5, [Aegiochusmon] = 1, but its own static
    // rewrites all of them to 1 per security card. With 3 security the server prices every
    // route at 3, and the overlay must say 3 — the printed 1 would promise a bargain that
    // the gauge will not honor.
    const base = permOf("BT24-014");
    const priced = getDigivolveCostOptions("BT24-101", base, undefined, undefined, [
      { permanentId: base.permanentId, alternateRequirementIndex: -1, projectedCost: 3 },
      { permanentId: base.permanentId, alternateRequirementIndex: 0, projectedCost: 3 },
      { permanentId: base.permanentId, alternateRequirementIndex: 1, projectedCost: 3 },
    ]);
    expect(priced.map((option) => option.cost)).toEqual(priced.map(() => 3));

    // A route the server did not publish keeps its printed price rather than borrowing
    // another path's: a prediction for a path nobody priced, never a silent substitution.
    const partial = getDigivolveCostOptions("BT24-101", base, undefined, undefined, [
      { permanentId: base.permanentId, alternateRequirementIndex: 0, projectedCost: 3 },
    ]);
    expect(partial).toContainEqual(expect.objectContaining({ alternateRequirementIndex: 0, cost: 3 }));
    expect(partial).toContainEqual(expect.objectContaining({ alternateRequirementIndex: 1, cost: 1 }));
    expect(partial).toContainEqual(expect.objectContaining({ type: "normal", cost: 5 }));

    // Prices published for a DIFFERENT base never leak onto this one.
    const otherBase = getDigivolveCostOptions("BT24-101", base, undefined, undefined, [
      { permanentId: "perm-elsewhere", alternateRequirementIndex: -1, projectedCost: 0 },
    ]);
    expect(otherBase).toContainEqual(expect.objectContaining({ type: "normal", cost: 5 }));
  });
});

describe("EX3-018 Coredramon evolution choices", () => {
  it("offers distinct, friendly normal and Dracomon paths without duplicating the localized memory cost", () => {
    const options = getDigivolveCostOptions("EX3-018", permOf("EX3-037"));

    expect(options).toEqual([
      { type: "normal", label: "Blue Lv.3", cost: 3 },
      { type: "alternate", label: "Dracomon Lv.3", cost: 2, alternateRequirementIndex: 0 },
    ]);
    expect(options.every(({ label }) => !label.toLowerCase().includes("memory"))).toBe(true);
  });
});

describe("EX3-037 Dracomon evolution choices", () => {
  it("offers both the normal and 0-cost Bebydomon routes with friendly labels", () => {
    expect(getDigivolveCostOptions("EX3-037", permOf("EX3-001"))).toEqual([
      { type: "normal", label: "Blue Lv.2", cost: 1 },
      { type: "alternate", label: "Bebydomon Lv.2", cost: 0, alternateRequirementIndex: 0 },
    ]);
  });
});

describe("EX3-039 Coredramon evolution choices", () => {
  it("offers friendly normal and cheaper Dracomon routes without duplicate multicolor costs", () => {
    expect(getDigivolveCostOptions("EX3-039", permOf("EX3-037"))).toEqual([
      { type: "normal", label: "Green Lv.3", cost: 3 },
      { type: "alternate", label: "Dracomon Lv.3", cost: 2, alternateRequirementIndex: 0 },
    ]);
  });
});

describe("EX3-020 Wingdramon evolution choices", () => {
  it("shows friendly normal and Coredramon routes with their distinct costs", () => {
    expect(getDigivolveCostOptions("EX3-020", permOf("EX3-018"))).toEqual([
      { type: "normal", label: "Blue Lv.4", cost: 4 },
      { type: "alternate", label: "Coredramon Lv.4", cost: 3, alternateRequirementIndex: 0 },
    ]);
  });
});

describe("linkCardSlots (Comprehensive Rules 4-8-3: link cards plugged in sideways, link portion visible)", () => {
  it("returns no slots for an unlinked permanent", () => {
    expect(linkCardSlots(0, 92)).toEqual([]);
  });

  it("peeks a single link card's right edge past the host's own right edge", () => {
    const [slot] = linkCardSlots(1, 92);
    expect(slot).toBeDefined();
    expect(slot!.left + slot!.width).toBeGreaterThan(92);
  });

  it("staggers a 2nd link card downward so both link portions stay visible (4-8-3)", () => {
    const slots = linkCardSlots(2, 92);
    expect(slots).toHaveLength(2);
    expect(slots[1]!.top).toBeGreaterThan(slots[0]!.top);
    // Same horizontal placement: only the vertical stagger distinguishes them.
    expect(slots[1]!.left).toBe(slots[0]!.left);
  });

  it("scales with the host's mini width instead of a hard-coded pixel size", () => {
    const small = linkCardSlots(1, 60)[0]!;
    const large = linkCardSlots(1, 120)[0]!;
    expect(large.width).toBeGreaterThan(small.width);
  });

  it("anchors toward the host's bottom-right corner, not its vertical middle", () => {
    const hostWidth = 92;
    const hostHeight = Math.round(hostWidth * 1.4);
    const [slot] = linkCardSlots(1, hostWidth);
    expect(slot!.top).toBeGreaterThan(hostHeight / 2);
  });

  it("exposes at least 30% of the link card's long edge (TokenInfo's bottom name/DP band is ~23% of it)", () => {
    const [slot] = linkCardSlots(1, 92);
    const peek = slot!.left + slot!.width - 92;
    expect(peek / slot!.width).toBeGreaterThanOrEqual(0.3);
  });
});

const t = translator("en");

describe("playButtonLabel", () => {
  // Bug: the action-bar "play" button always read "Play Digimon", even for
  // Tamers and Options, because Tamers share the battleArea zone with Digimon
  // server-side (apps/api/src/engine/actions/playCard.ts) and the label only
  // special-cased Option vs "everything else". A player selecting a Tamer saw
  // a button that misdescribed what they were about to do.
  it('labels a Digimon exactly "Play Digimon" (pinned: scenario tests query this by accessible name)', () => {
    expect(playButtonLabel([CardKind.Digimon], t)).toBe("Play Digimon");
  });

  it('labels a Tamer "Play Tamer", not "Play Digimon"', () => {
    expect(playButtonLabel([CardKind.Tamer], t)).toBe("Play Tamer");
  });

  it('labels an Option "Play Option"', () => {
    expect(playButtonLabel([CardKind.Option], t)).toBe("Play Option");
  });

  it("labels a Digi-Egg as a hatch action", () => {
    expect(playButtonLabel([CardKind.DigiEgg], t)).toBe("Hatch egg");
    expect(playButtonLabel([CardKind.DigiEgg], translator("pt-BR"))).toBe("Chocar ovo");
  });
});

describe("triggerLabel / triggerLabels", () => {
  it("identifies the card represented by a pending trigger", () => {
    const key = buildTriggerKey("perm-1", "AD1-001/dp-plus-1000");
    expect(triggerCardId(key)).toBe("AD1-001");
  });

  // Bug: two permanents of the SAME card triggering simultaneously produced the
  // same effectKey (cardId/effect-index), so the orderTriggers decision carried
  // duplicate keys — React rendered duplicate keys and both order buttons
  // toggled the same entry, making the confirm button impossible to enable.
  // The fix threads the source permanent's instanceId into the key
  // (buildTriggerKey, packages/shared/src/protocol/triggerKey.ts); the client
  // must parse that composite key back out to render a label instead of
  // showing the raw instanceId-prefixed string.
  it("derives a label from a composite instanceId::effectKey trigger key", () => {
    const key = buildTriggerKey("perm-1", "AD1-001/dp-plus-1000");
    expect(triggerLabel(key)).not.toContain("perm-1");
    expect(triggerLabel(key)).not.toBe(key);
  });

  it("disambiguates two triggering permanents of the same card with a (copy N) suffix", () => {
    const keyA = buildTriggerKey("perm-A", "AD1-001/dp-plus-1000");
    const keyB = buildTriggerKey("perm-B", "AD1-001/dp-plus-1000");
    const [labelA, labelB] = triggerLabels([keyA, keyB], t);
    expect(labelA).not.toBe(labelB);
    expect(labelA).toContain("copy 1");
    expect(labelB).toContain("copy 2");
  });

  it("never numbers two effects of ONE permanent as copies", () => {
    const onPlay = buildTriggerKey("perm-A", "AD1-001/on-play");
    const whenDigivolving = buildTriggerKey("perm-A", "AD1-001/when-digivolving");
    expect(triggerLabels([onPlay, whenDigivolving], t)).toEqual(["Greymon", "Greymon"]);
  });

  it("numbers copies per permanent, so a permanent's two effects share one number", () => {
    const first = buildTriggerKey("perm-A", "AD1-001/on-play");
    const firstAgain = buildTriggerKey("perm-A", "AD1-001/when-digivolving");
    const second = buildTriggerKey("perm-B", "AD1-001/on-play");
    const [a, b, c] = triggerLabels([first, firstAgain, second], t);
    expect(a).toContain("copy 1");
    expect(b).toContain("copy 1");
    expect(c).toContain("copy 2");
  });

  it("leaves a single trigger's label undecorated", () => {
    const key = buildTriggerKey("perm-1", "AD1-001/dp-plus-1000");
    expect(triggerLabels([key], t)[0]).not.toContain("copy");
    expect(triggerLabels([key], t)[0]).toBe("Greymon");
  });

  it("never exposes an internal IR key for a single pending effect", () => {
    const key = buildTriggerKey("perm-1", "ST12-12/ir-6-0");
    expect(triggerLabels([key], t)[0]).not.toMatch(/ir|6|0/i);
  });

  it("never exposes action or IR slugs when several cards trigger", () => {
    const meiko = buildTriggerKey("meiko", "BT9-091/GainMemory");
    const blackGatomon = buildTriggerKey("gatomon", "BT8-077/ir-6-0");
    expect(triggerLabels([meiko, blackGatomon], t)).toEqual(["Meiko Mochizuki", "BlackGatomon"]);
  });

  it("prefers authoritative card ids when an effect key names a different card", () => {
    const staleKey = buildTriggerKey("garurumon-source", "P-008/ir-6-0");
    expect(triggerLabels([staleKey], t, ["P-007"])).toEqual(["Garurumon"]);
  });

  it("does not attribute a multi-trigger prompt to the last resolved card", () => {
    const request = {
      kind: "orderTriggers",
      seat: 0,
      options: { triggerKeys: ["a", "b"] },
    } as never;
    const staleEvents = [{ kind: "effectResolved", seat: 0, sourceCardId: "BT9-040" }] as never;
    expect(decisionEffectSource(request, staleEvents)).toBeUndefined();
  });

  it("uses Onmon's authoritative decision source instead of a stale Cyber Engage event", () => {
    const request = {
      kind: "optional",
      seat: 0,
      sourceCardId: "BT25-045",
    } as never;
    const staleEvents = [{ kind: "effectResolved", seat: 0, sourceCardId: "BT25-098" }] as never;
    expect(decisionEffectSource(request, staleEvents)).toBe("BT25-045");
  });
});

describe("canUseBreedingAction", () => {
  const base = { phase: Phase.Breeding, isMyTurn: true, canHatch: false, canMove: false };

  it("offers the hatch only when an egg is available", () => {
    expect(canUseBreedingAction({ ...base, canHatch: true })).toBe(true);
    expect(canUseBreedingAction({ ...base, canHatch: false })).toBe(false);
  });

  it("offers the move only when the raised Digimon can leave", () => {
    expect(canUseBreedingAction({ ...base, canMove: true })).toBe(true);
    expect(canUseBreedingAction({ ...base, canMove: false })).toBe(false);
  });

  it("offers neither outside the breeding phase", () => {
    // The server gates both verbs on the breeding phase and would answer
    // `wrong-phase`, so offering them anywhere else invites a rejected intent.
    for (const phase of [Phase.Main, Phase.Draw, Phase.Active, Phase.End]) {
      expect(canUseBreedingAction({ ...base, phase, canHatch: true })).toBe(false);
      expect(canUseBreedingAction({ ...base, phase, canMove: true })).toBe(false);
    }
  });

  it("never offers the action on the opponent's turn", () => {
    expect(canUseBreedingAction({ ...base, isMyTurn: false, canHatch: true })).toBe(false);
    expect(canUseBreedingAction({ ...base, isMyTurn: false, canMove: true })).toBe(false);
  });
});

describe("breedingSlotClickAction", () => {
  const base = { breedingActionsOpen: true, canMove: true, hasPendingSelection: false };

  it("moves the Digimon out during the breeding step", () => {
    expect(breedingSlotClickAction(base)).toBe("move");
  });

  it("opens the detail menu outside the breeding step", () => {
    expect(breedingSlotClickAction({ ...base, breedingActionsOpen: false })).toBe("detail");
  });

  it("opens the detail menu for a Digimon that cannot move yet", () => {
    expect(breedingSlotClickAction({ ...base, canMove: false })).toBe("detail");
  });

  it("leaves a pending selection its own routing", () => {
    expect(breedingSlotClickAction({ ...base, hasPendingSelection: true })).toBe("detail");
  });
});

describe("canMoveFromBreeding", () => {
  function breedingWith(cardId: string): Permanent {
    return { topCard: { cardId } } as unknown as Permanent;
  }

  it("keeps a freshly hatched Digi-Egg in the breeding area", () => {
    // Rules 4-16-2: a Lv.2 Digi-Egg has no DP and cannot move out.
    expect(canMoveFromBreeding(breedingWith("BT1-001"))).toBe(false);
  });

  it("#5161 offers movement for Lucemon: Larva with printed 0 DP", () => {
    expect(canMoveFromBreeding(breedingWith("BT18-086"))).toBe(true);
  });

  it("lets a Digimon with DP move out", () => {
    expect(canMoveFromBreeding(breedingWith("BT1-009"))).toBe(true);
  });

  it("lets Mother D-Reaper move out because the Digi-Egg has DP", () => {
    // Official EX2-007 Q3276: Mother D-Reaper may move like any other Digimon;
    // the relevant distinction from a normal Lv.2 Digi-Egg is its printed DP.
    expect(canMoveFromBreeding(breedingWith("EX2-007"))).toBe(true);
  });

  it("treats an empty breeding area as nothing to move", () => {
    expect(canMoveFromBreeding(undefined)).toBe(false);
  });
});

describe("match log card identity", () => {
  const attack = (attackerCardId: string): ServerEvent => ({
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "attacker",
    attackerCardId,
    target: { kind: "player" },
  });

  it("keeps naming the attacker after the attacker has left the field", () => {
    // An empty index is the board as it looks once the attacker is deleted: the line has
    // to stay readable, so it reads the identity out of the event instead.
    const log = buildMatchLog([attack("BT1-010")], 0, new Map(), t);

    expect(log[0]?.text).toBe("You: Agumon (BT1-010) #attacker attacks security");
    expect(log[0]?.cardIds).toEqual(["BT1-010"]);
  });

  it("names the attacked Digimon instead of calling it a Digimon", () => {
    const declared: ServerEvent = {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "attacker",
      attackerCardId: "BT1-010",
      target: { kind: "permanent", permanentId: "victim" },
      targetCardId: "BT1-045",
    };

    const line = buildMatchLog([declared], 0, new Map(), t)[0];
    expect(line?.text).toBe("You: Agumon (BT1-010) #attacker attacks Tsukaimon (BT1-045) #victim");
    // Ordered as the sentence names them, so each name links to its own card.
    expect(line?.cardIds).toEqual(["BT1-010", "BT1-045"]);
  });

  it("names the Digimon combat deleted", () => {
    const events: ServerEvent[] = [
      attack("BT1-010"),
      { kind: "combatResolved", seat: 0, attackerPermanentId: "attacker", deletedPermanentIds: ["attacker"] },
    ];

    const line = buildMatchLog(events, 0, new Map(), t)[0];
    expect(line?.text).toBe("Combat resolved. Agumon (BT1-010) #attacker deleted");
    expect(line?.cardIds).toEqual(["BT1-010"]);
  });

  it("falls back to the count when a deleted permanent was never identified", () => {
    const events: ServerEvent[] = [
      { kind: "combatResolved", seat: 0, attackerPermanentId: "attacker", deletedPermanentIds: ["ghost"] },
    ];

    expect(buildMatchLog(events, 0, new Map(), t)[0]?.text).toBe("Combat resolved. 1 deleted");
  });

  it("names a single moved card when the board still identifies it", () => {
    const events: ServerEvent[] = [{ kind: "cardsMoved", instanceIds: ["c1"], from: "hand", to: "trash" }];

    const line = buildMatchLog(events, 0, new Map([["c1", "BT1-045"]]), t)[0];
    expect(line?.text).toBe("Tsukaimon (BT1-045) moved: hand → trash");
    expect(line?.cardIds).toEqual(["BT1-045"]);
  });

  it("keeps counting when several cards move at once", () => {
    const events: ServerEvent[] = [{ kind: "cardsMoved", instanceIds: ["c1", "c2"], from: "deck", to: "trash" }];

    expect(buildMatchLog(events, 0, new Map([["c1", "BT1-045"]]), t)[0]?.text).toBe("2 cards moved: deck → trash");
  });

  it("lists a reveal's cards in the order the sentence names them", () => {
    // Both printings are called Agumon, so only the order tells the link apart.
    const revealed: ServerEvent = { kind: "cardRevealed", seat: 0, cardId: "ST1-03", sourceCardId: "BT1-010" };

    const line = describeEvent({ event: revealed, viewerSeat: 0, identities: new Map(), t: t });
    expect(line?.text).toBe("You revealed Agumon (ST1-03) with Agumon (BT1-010)");
    expect(line?.cardIds).toEqual(["ST1-03", "BT1-010"]);
  });
});

describe("match log combat responses", () => {
  it("records that the defender fired a Counter effect", () => {
    const activated: ServerEvent = { kind: "counterResolved", attackerPermanentId: "attacker", activated: true };
    const passed: ServerEvent = { kind: "counterResolved", attackerPermanentId: "attacker", activated: false };

    expect(describeEvent({ event: activated, viewerSeat: 0, identities: new Map(), t: t })?.text).toBe(
      "The defender activated a [Counter] effect",
    );
    expect(describeEvent({ event: passed, viewerSeat: 0, identities: new Map(), t: t })).toBeNull();
  });

  it("records an accepted Evade and Barrier, naming the Digimon they saved", () => {
    const played: ServerEvent = { kind: "cardPlayed", seat: 1, cardId: "BT1-010", permanentId: "saved" };
    const evade: ServerEvent = { kind: "evadeResolved", permanentId: "saved", accepted: true };
    const barrier: ServerEvent = { kind: "barrierResolved", permanentId: "saved", accepted: true };

    const log = buildMatchLog([played, evade, barrier], 0, new Map(), t);
    expect(log.map((line) => line.text)).toEqual([
      "＜Barrier＞ trashed a security card to save Agumon (BT1-010) #saved",
      "＜Evade＞ suspended Agumon (BT1-010) #saved to avoid deletion",
      "Opponent played Agumon (BT1-010) #saved",
    ]);
    expect(log[0]?.cardIds).toEqual(["BT1-010"]);
  });

  it("stays quiet about a declined Evade or Barrier", () => {
    expect(
      describeEvent({
        event: { kind: "evadeResolved", permanentId: "p", accepted: false },
        viewerSeat: 0,
        identities: new Map(),
        t: t,
      }),
    ).toBeNull();
    expect(
      describeEvent({
        event: { kind: "barrierResolved", permanentId: "p", accepted: false },
        viewerSeat: 0,
        identities: new Map(),
        t: t,
      }),
    ).toBeNull();
  });

  it("closes the block window it opened", () => {
    expect(
      describeEvent({
        event: { kind: "blockDeclined", attackerPermanentId: "a" },
        viewerSeat: 0,
        identities: new Map(),
        t: t,
      })?.text,
    ).toBe("No block was declared");
  });

  it("names Shoemon and Karakurumon for a scheduled deletion without a state patch", () => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["shoemon"],
      from: "battleArea",
      to: "trash",
      turnEndDeletion: { deletedCardId: "ST19-03", sourceCardId: "EX11-022" },
    };
    expect(describeEvent({ event: event, viewerSeat: 0, identities: new Map(), t: t })).toMatchObject({
      text: "Shoemon (ST19-03) was deleted at turn end by Karakurumon (EX11-022)'s effect",
      cardIds: ["ST19-03", "EX11-022"],
    });
    expect(describeEvent({ event: event, viewerSeat: 0, identities: new Map(), t: translator("pt-BR") })?.text).toBe(
      "Shoemon (ST19-03) foi excluída no fim do turno pelo efeito de Karakurumon (EX11-022)",
    );
  });

  it("keeps a permanent record of a triggered effect resolving", () => {
    const resolved: ServerEvent = {
      kind: "effectResolved",
      seat: 0,
      sourceCardId: "BT1-045",
      effectKey: "onPlay",
      description: "Draw 1 card.",
      timing: "OnPlay",
    };

    // The wording stays with the overlay: the log records that it resolved, not the clause.
    const line = describeEvent({ event: resolved, viewerSeat: 0, identities: new Map(), t: t });
    expect(line?.text).toBe("Tsukaimon (BT1-045)'s effect resolved");
    expect(line?.cardIds).toEqual(["BT1-045"]);
  });

  it.each([
    ["en", "Wall Training (LM-057)'s effect resolved. No digivolution performed"],
    ["pt-BR", "O efeito de Wall Training (LM-057) foi resolvido. Nenhuma evolução realizada"],
    ["es", "Se resolvió el efecto de Wall Training (LM-057). No se realizó ninguna digievolución"],
    ["it", "Effetto di Wall Training (LM-057) risolto. Nessuna digievoluzione effettuata"],
  ] as const)("explains a Training resolution without digivolution in %s", (locale, text) => {
    const event: ServerEvent = {
      kind: "effectResolved",
      seat: 0,
      sourceCardId: "LM-057",
      effectKey: "delay",
      description: "Digivolve with the cost reduced by 2.",
      timing: "Main",
      digivolutionPerformed: false,
    };
    expect(describeEvent({ event: event, viewerSeat: 0, identities: new Map(), t: translator(locale) })).toMatchObject({
      text,
      cardIds: ["LM-057"],
    });
  });

  it.each([true, undefined])("keeps the standard resolution text for digivolution outcome %s", (performed) => {
    const event: ServerEvent = {
      kind: "effectResolved",
      seat: 0,
      sourceCardId: "LM-057",
      effectKey: "delay",
      description: "Digivolve with the cost reduced by 2.",
      digivolutionPerformed: performed,
    };
    expect(describeEvent({ event: event, viewerSeat: 0, identities: new Map(), t: t })?.text).toBe(
      "Wall Training (LM-057)'s effect resolved",
    );
  });
});

describe("exact vs substring name gates on digivolution routes (Q2868)", () => {
  // EX4-030 Kuzuhamon is "also treated as having [Sakuyamon] IN ITS NAME", so it answers a
  // substring [Sakuyamon] route but never an exact one. The client twin of the server's
  // matchGatedRequirement must read the same two channels or highlighting outruns legality.
  it("keeps the substring alias on the union channel", () => {
    expect(effectiveStaticNames(getCardDefinition("EX4-030")!)).toEqual(
      expect.arrayContaining(["Kuzuhamon", "Sakuyamon"]),
    );
    expect(effectiveExactNames(getCardDefinition("EX4-030")!)).toEqual(["Kuzuhamon"]);
  });

  it("limits LM-023's cost-1 route to exact [Sakuyamon] (Q3475)", () => {
    // LM-023 prints "[Digivolve] [Sakuyamon]: Cost 1", without "in its name".
    expect(getDigivolveCostOptions("LM-023", permOf("EX4-030"))).toEqual([]);
    expect(getDigivolveCostOptions("LM-023", permOf("LM-023"))).toEqual([]);
    expect(getDigivolveCostOptions("LM-023", permOf("BT5-044"))).toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 1 }),
    );
  });

  it("keeps LM-023's yellow level-5 cost-3 route independent of its exact-name route", () => {
    const options = getDigivolveCostOptions("LM-023", permOf("EX2-023"));
    expect(options).toContainEqual(expect.objectContaining({ type: "normal", cost: 3 }));
    expect(options).not.toContainEqual(expect.objectContaining({ type: "alternate", cost: 1 }));
  });

  it("refuses an exact-name route to a base that only carries the alias in its name", () => {
    // EX9-018 prints an exact [Mamemon] route; EX12-041 Thundermon is only "treated as having
    // [Mamemon] in its name" — the same alias class as EX4-030/[Sakuyamon].
    expect(getDigivolveCostOptions("EX9-018", permOf("EX12-041"))).not.toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 1 }),
    );
    // The exact route still fires on a real [Mamemon].
    expect(getDigivolveCostOptions("EX9-018", permOf("BT6-064"))).toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 1 }),
    );
  });
});

describe("combat windows read from synchronized state", () => {
  const withCombatWindow = (window: Record<string, unknown>) =>
    ({
      players: [{ battleArea: [] }, { battleArea: [] }],
      turnSeat: 0,
      combatWindow: {
        kind: "block",
        seat: 1,
        attackerPermanentId: "",
        permanentId: "",
        eligiblePermanentIds: [],
        eligibleCountersJson: "",
        mustBlock: false,
        ...window,
      },
    }) as unknown as import("@aegis/shared").GameState;

  it("scopes the mirrored window to the seat that must answer it", () => {
    const state = withCombatWindow({ attackerPermanentId: "attacker", eligiblePermanentIds: ["blanc"] });
    expect(mirroredCombatWindow(state, 0)).toBeNull();
    expect(mirroredCombatWindow(state, 1)).toMatchObject({
      key: "block:attacker",
      kind: "block",
      eligiblePermanentIds: ["blanc"],
    });
  });

  it("keeps the block window answerable when its opening event never reached this client", () => {
    // The exact shape of the deadlock: the broadcast went out while the socket was down (or has
    // aged out of the capped live log), so the log is empty and only the state mirror is left.
    const state = withCombatWindow({ attackerPermanentId: "attacker", eligiblePermanentIds: ["blanc"] });
    const mirrored = mirroredCombatWindow(state, 1);

    expect(activeBlockWindow([], false, mirrored)).toEqual({
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["blanc"],
      mustBlock: false,
    });
    expect(openCombatWindow([], state, 1)).toEqual({ key: "block:attacker" });
    expect(openCombatWindow([], state, 0)).toBeNull();
  });

  it("keeps the Counter window answerable from the mirror alone", () => {
    const counters = [{ instanceId: "ace", effectKey: "counter", description: "Blast Digivolve" }];
    const state = withCombatWindow({
      kind: "counter",
      attackerPermanentId: "attacker",
      eligibleCountersJson: JSON.stringify(counters),
    });

    expect(activeCounterWindow([], 1, false, mirroredCombatWindow(state, 1))).toEqual({
      attackerPermanentId: "attacker",
      eligibleCounters: counters,
    });
  });

  it("still closes on a terminator already in the log", () => {
    const state = withCombatWindow({ attackerPermanentId: "attacker", eligiblePermanentIds: ["blanc"] });
    const answered = [{ kind: "blockDeclined" as const, attackerPermanentId: "attacker" }];
    expect(activeBlockWindow(answered, false, mirroredCombatWindow(state, 1))).toBeNull();
  });
});

describe("lastRejectedCombatAnswer", () => {
  it("reports the refusal that must roll an optimistic hide back", () => {
    expect(lastRejectedCombatAnswer([])).toBeUndefined();
    expect(
      lastRejectedCombatAnswer([{ kind: "actionRejected", intent: "attack", reason: "wrong-phase", seq: 4 }]),
    ).toBeUndefined();
    expect(
      lastRejectedCombatAnswer([
        { kind: "actionRejected", intent: "respondBarrier", reason: "illegal-target", seq: 4 },
        { kind: "actionRejected", intent: "respondEvade", reason: "illegal-target", seq: 9 },
      ]),
    ).toBe(9);
  });
});

describe("hand-resident SET digivolution cost", () => {
  const viewerWithSecurity = (count: number) =>
    ({
      hand: [],
      trash: [],
      battleArea: [],
      security: Array.from(
        { length: count },
        (_unused, index) => ({ cardId: "AD1-001", instanceId: `sec-${index}` }) as CardInstance,
      ),
    }) as unknown as PlayerState;

  it("prices BT24-101 at 0 on every path with an empty security stack (Q5714)", () => {
    const options = getDigivolveCostOptions("BT24-101", permOf("BT24-014"), viewerWithSecurity(0));
    expect(options.map((option) => option.cost)).toEqual([0]);
  });

  it("prices BT24-101 at the security count, the rate the printed figure only states", () => {
    const options = getDigivolveCostOptions("BT24-101", permOf("BT24-014"), viewerWithSecurity(3));
    expect(options.map((option) => option.cost)).toEqual([3]);
  });

  it("keeps the printed figures onto a base the SET static does not gate in", () => {
    const options = getDigivolveCostOptions("BT24-101", permOf("BT24-039"), viewerWithSecurity(0));
    expect(options.map((option) => option.cost)).toEqual([5]);
  });

  it.each([undefined, true])("does not apply a trash-only SET to a hand card (legacy flag: %s)", (handResident) => {
    const modifier = getCompiledCard("BT24-101")!
      .effects.flatMap((effect) => effect.actions ?? [])
      .find((action) => action.kind === "CostModifier");
    expect(modifier?.kind).toBe("CostModifier");
    if (modifier?.kind !== "CostModifier") return;
    const originalZones = modifier.residentZones;
    const originalLegacy = modifier.handResident;
    try {
      modifier.residentZones = ["trash"];
      modifier.handResident = handResident;
      const options = getDigivolveCostOptions("BT24-101", permOf("BT24-014"), viewerWithSecurity(0));
      expect(options.map((option) => option.cost)).toEqual([5, 1]);
    } finally {
      modifier.residentZones = originalZones;
      modifier.handResident = originalLegacy;
    }
  });

  it("honors the floor that keeps BT7-040 at 1 on an empty security stack", () => {
    const options = getDigivolveCostOptions("BT7-040", permOf("BT7-039"), viewerWithSecurity(0));
    expect(options.map((option) => option.cost)).toEqual([1]);
    expect(getDigivolveCostOptions("BT7-040", permOf("BT7-039"), viewerWithSecurity(4))[0]!.cost).toBe(4);
  });

  it("leaves the printed figure alone without a viewer to count security for", () => {
    const options = getDigivolveCostOptions("BT24-101", permOf("BT24-014"));
    expect(options.map((option) => option.cost)).toEqual([5, 1]);
  });
});

describe("Discord 1555941341962309693 Wisemon Witchelny cost choices", () => {
  it.each(["BT18-036", "BT19-036", "BT26-022", "BT26-067", "EX10-041", "EX13-029", "EX7-019"])(
    "Discord 1555941341962309693 offers the printed cost 3 onto %s, including trait-only text",
    (cardId) => {
      const base = permOf(cardId);
      const options = getDigivolveCostOptions("EX13-034", base, undefined, undefined, [
        { permanentId: base.permanentId, alternateRequirementIndex: -1, projectedCost: 4 },
        { permanentId: base.permanentId, alternateRequirementIndex: 0, projectedCost: 3 },
      ]);
      expect(options).toContainEqual(
        expect.objectContaining({ type: "alternate", cost: 3, alternateRequirementIndex: 0 }),
      );
    },
  );
  it("does not offer the alternate on a plain yellow Lv.4 or a Witchelny Lv.3", () => {
    expect(getDigivolveCostOptions("EX13-034", permOf("BT1-051"))).toEqual([
      expect.objectContaining({ type: "normal", cost: 4 }),
    ]);
    expect(getDigivolveCostOptions("EX13-034", permOf("BT18-030"))).toEqual([]);
  });
});

describe("Discord 1555941341962309693 alternate text mechanism sweep", () => {
  it.each([
    ["AD1-001", "BT11-062", 2], // Omnimon only in the inherited effect.
    ["BT16-062", "BT8-013", 3], // Gammamon only in the name.
    ["EX12-030", "RB1-013", 3], // Jellymon only in the name.
    ["EX13-033", "BT19-036", 3], // Witchelny in trait/inherited effect.
    ["EX13-037", "BT18-039", 3], // Witchelny only in the trait.
  ] as const)("offers %s onto %s for %i through all printed text fields", (cardId, baseId, cost) => {
    expect(getDigivolveCostOptions(cardId, permOf(baseId))).toContainEqual(
      expect.objectContaining({ type: "alternate", cost, alternateRequirementIndex: 0 }),
    );
  });

  it.each(["BT10-111", "BT15-012", "BT21-059"])(
    "does not treat Material Save or Savemon text on %s as the Save keyword",
    (baseId) => {
      expect(getDigivolveCostOptions("BT12-039", permOf(baseId))).toEqual([]);
    },
  );

  it("keeps a genuine Save keyword route", () => {
    expect(getDigivolveCostOptions("BT12-039", permOf("EX10-026"))).toContainEqual(
      expect.objectContaining({ type: "alternate", cost: 3, alternateRequirementIndex: 0 }),
    );
  });
});

it("#4948 does not display Imperialdramon's alternate cost after its name is rewritten to Sukamon", () => {
  const base = new Permanent();
  base.topCard = Object.assign(new CardInstance(), { cardId: "BT16-028", instanceId: "rewritten-base" });
  base.originalNameOverride = "Sukamon";
  base.originalColorsOverride.push("White");
  expect(getDigivolveCostOptions("BT17-077", base)).toEqual([]);
  base.originalColorsOverride.clear();
  base.originalColorsOverride.push("Blue");
  expect(getDigivolveCostOptions("BT17-077", base).map((option) => ({ type: option.type, cost: option.cost }))).toEqual(
    [{ type: "normal", cost: 6 }],
  );
});

it("GitHub bugs #5030/#5019 expose a server-projected Koromon alias evolution cost", () => {
  const base = permOf("BT17-102");
  expect(
    getDigivolveCostOptions("BT12-034", base, undefined, undefined, [
      { permanentId: base.permanentId, alternateRequirementIndex: 0, projectedCost: 0 },
    ]),
  ).toContainEqual(expect.objectContaining({ type: "alternate", alternateRequirementIndex: 0, cost: 0 }));
});
