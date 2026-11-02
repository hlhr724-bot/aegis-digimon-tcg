import { describe, expect, it } from "vitest";
import type { GameState, Seat, ServerEvent } from "@aegis/shared";
import { buildCardSiteIndex } from "./match/cardSiteIndex";
import {
  deletionNoticesFromEvent,
  effectNoticeFromEvent,
  dialogRepeatsEffectNotice,
  isOwnEffectNotice,
  keywordNoticeFromEvent,
  noticeRemaining,
  preventionNoticeFromEvent,
  NOTICE_LIFETIME_MS,
  recoveryNoticeFromEvent,
  rejectionNotice,
  REJECTION_LIFETIME_MS,
  stackStripNoticeFromEvent,
  type MatchNotice,
} from "./notices";
import { noticeEffectClause } from "./overlay";
import { Side } from "./side";
import { buildInstanceArtIndex } from "./sidePanels";

const VIEWER: Seat = 0;

function notice(overrides: Partial<MatchNotice> = {}): MatchNotice {
  return {
    id: "n1",
    side: Side.Viewer,
    fromSecurity: false,
    body: { variant: "effect", cardId: "BT1-001" },
    createdAt: 0,
    ...overrides,
  };
}

const resolved = (seat: Seat): ServerEvent => ({
  kind: "effectTriggered",
  seat,
  sourceCardId: "BT1-010",
  effectKey: "k",
  description: "Draw 1.",
  timing: "OnPlay",
});

describe("deletionNoticesFromEvent", () => {
  const ids = () => {
    let next = 0;
    return () => {
      next += 1;
      return `delete-${next}`;
    };
  };

  it("names a card deleted from the field", () => {
    const result = deletionNoticesFromEvent(
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["dead"],
        deletedPermanents: [
          { permanentId: "perm-dead", instanceId: "dead", cardId: "BT1-010", artId: "BT1-010_P2", seat: 1 },
        ],
      },
      VIEWER,
      ids(),
      42,
    );
    expect(result).toMatchObject([
      {
        side: Side.Opponent,
        body: { variant: "deletion", cards: [{ cardId: "BT1-010", artId: "BT1-010_P2" }] },
        createdAt: 42,
      },
    ]);
  });

  // Two permanents taken by one effect are one moment to read, not two call-outs stacked
  // in the same corner.
  it("gathers every card one movement deleted from the same side into one notice", () => {
    const result = deletionNoticesFromEvent(
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["a", "b"],
        deletedPermanents: [
          { permanentId: "perm-a", instanceId: "a", cardId: "BT1-010", seat: 1 },
          { permanentId: "perm-b", instanceId: "b", cardId: "BT1-020", artId: "BT1-020_P1", seat: 1 },
        ],
      },
      VIEWER,
      ids(),
      42,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.body).toEqual({
      variant: "deletion",
      cards: [{ cardId: "BT1-010" }, { cardId: "BT1-020", artId: "BT1-020_P1" }],
    });
  });

  // The two sides read out of opposite corners, so they stay two notices.
  it("keeps each side's deletions in its own notice", () => {
    const result = deletionNoticesFromEvent(
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["a", "b"],
        deletedPermanents: [
          { permanentId: "perm-a", instanceId: "a", cardId: "BT1-010", seat: 1 },
          { permanentId: "perm-b", instanceId: "b", cardId: "BT1-020", seat: 0 },
        ],
      },
      VIEWER,
      ids(),
      42,
    );
    expect(result.map((notice) => notice.side)).toEqual(["opp", "you"]);
  });

  it("does not call a hand trash or unnamed movement a field deletion", () => {
    expect(
      deletionNoticesFromEvent(
        { kind: "cardsMoved", from: "hand", to: "trash", instanceIds: ["dead"], cardIds: ["BT1-010"], seat: 1 },
        VIEWER,
        ids(),
        0,
      ),
    ).toEqual([]);
    expect(
      deletionNoticesFromEvent(
        { kind: "cardsMoved", from: "battleArea", to: "trash", instanceIds: ["dead"], seat: 1 },
        VIEWER,
        ids(),
        0,
      ),
    ).toEqual([]);
  });
});

describe("keywordNoticeFromEvent", () => {
  const played = (cardId: string, seat: Seat = 0): ServerEvent => ({
    kind: "cardPlayed",
    seat,
    cardId,
    mechanic: "digiXros",
    sourceCardIds: ["BT10-049", "BT10-060"],
  });

  it("calls out a played card that could only have reached the field by DigiXros", () => {
    expect(keywordNoticeFromEvent(played("BT10-066"), VIEWER, "k", 4)).toEqual({
      id: "k",
      side: Side.Viewer,
      fromSecurity: false,
      body: {
        variant: "keyword",
        keyword: "digiXros",
        cardId: "BT10-066",
        materialCardIds: ["BT10-049", "BT10-060"],
      },
      createdAt: 4,
    });
    expect(keywordNoticeFromEvent(played("BT10-066", 1), VIEWER, "k", 0)?.side).toBe("opp");
  });

  it("stays quiet when a DigiXros-capable card was played normally", () => {
    expect(keywordNoticeFromEvent({ kind: "cardPlayed", seat: VIEWER, cardId: "BT10-066" }, VIEWER, "k", 0)).toBeNull();
  });

  it("ignores other events", () => {
    expect(keywordNoticeFromEvent(resolved(0), VIEWER, "k", 0)).toBeNull();
  });
});

describe("preventionNoticeFromEvent", () => {
  const prevented = (keyword: "Scapegoat" | "Guard" | "Armor Purge", seat: Seat = 0): ServerEvent => ({
    kind: "deletionPrevented",
    keyword,
    seat,
    permanentId: "p1",
    cardId: "BT1-010",
    paidPermanentId: "p2",
    paidCardId: "EX12-008",
  });

  it("draws Guard over the Digimon that paid for it", () => {
    expect(preventionNoticeFromEvent(prevented("Guard"), VIEWER, "k", 4)).toMatchObject({
      body: { variant: "keyword", keyword: "guard", cardId: "EX12-008" },
    });
  });

  it("draws sacrifice keywords over the card that paid", () => {
    expect(preventionNoticeFromEvent(prevented("Scapegoat"), VIEWER, "k", 4)).toEqual({
      id: "k",
      side: Side.Viewer,
      fromSecurity: false,
      body: { variant: "keyword", keyword: "scapegoat", cardId: "EX12-008" },
      createdAt: 4,
    });
    expect(preventionNoticeFromEvent(prevented("Armor Purge", 1), VIEWER, "k", 0)).toMatchObject({
      side: Side.Opponent,
      body: { keyword: "armorPurge" },
    });
  });

  it("stays quiet without the saved card's identity, which the notice is drawn from", () => {
    const { cardId: _dropped, ...anonymous } = prevented("Scapegoat") as Extract<
      ServerEvent,
      { kind: "deletionPrevented" }
    >;
    expect(preventionNoticeFromEvent(anonymous, VIEWER, "k", 0)).toBeNull();
  });

  it("ignores other events", () => {
    expect(preventionNoticeFromEvent(resolved(0), VIEWER, "k", 0)).toBeNull();
  });
});

describe("effectNoticeFromEvent", () => {
  it("shows BT11-032's two Your Turn reactions as different clauses", () => {
    const clauses = [
      "[Your Turn] When you play a blue Tamer, unsuspend this Digimon.",
      "[Your Turn][Once Per Turn] When this Digimon becomes unsuspended, return 1 of your opponent's level 3 or lower Digimon to its owner's hand. For every blue Tamer you have in play, add 1 to the max level of the Digimon you can choose with this effect.",
    ];
    const shown = clauses.map((description, index) => {
      const shownNotice = effectNoticeFromEvent(
        {
          kind: "effectTriggered",
          seat: 0,
          sourceCardId: "BT11-032",
          effectKey: `ulforce-reaction-${index}`,
          timing: index === 0 ? "whenPlayed" : "whenUnsuspended",
          printedTiming: "YourTurn",
          description,
        },
        VIEWER,
        `ulforce-${index}`,
        0,
      );
      if (shownNotice?.body.variant !== "effect") throw new Error("Ulforce effect notice missing");
      return noticeEffectClause({
        cardId: shownNotice.body.cardId,
        timing: shownNotice.body.timing,
        description: shownNotice.body.description,
      });
    });
    expect(shown).toEqual(clauses);
  });

  it("attributes the security-trash reaction to Lilithmon's printed clause", () => {
    const event: ServerEvent = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "EX7-061",
      sourceInstanceId: "dev-field-0-seventh-purple",
      sourcePermanentId: "dev-perm-0-seventh-purple",
      effectKey: "subtrigger/lilith-deletion",
      timing: "onDeletionOf",
      printedTiming: "AllTurns",
      description:
        "[All Turns] [Once Per Turn] When another Digimon is deleted, if it's your turn, you may play 1 purple level 4 or lower Digimon card from your trash without paying the cost. If it's your opponent's turn, trash the top card of their security stack.",
    };
    const shown = effectNoticeFromEvent(event, VIEWER, "lilith-reaction", 0);
    expect(shown?.body).toMatchObject({
      cardId: "EX7-061",
      sourcePermanentId: "dev-perm-0-seventh-purple",
      timing: "AllTurns",
    });
    if (shown?.body.variant !== "effect") throw new Error("Lilithmon effect notice missing");
    expect(
      noticeEffectClause({
        cardId: shown.body.cardId,
        timing: shown.body.timing,
        description: shown.body.description,
      }),
    ).toContain("trash the top card of their security stack");
  });
  it("carries the clause and its card for either seat", () => {
    expect(effectNoticeFromEvent(resolved(0), VIEWER, "a", 7)).toEqual({
      id: "a",
      side: Side.Viewer,
      fromSecurity: false,
      body: {
        variant: "effect",
        cardId: "BT1-010",
        timing: "OnPlay",
        triggerTiming: "OnPlay",
        effectKey: "k",
        description: "Draw 1.",
      },
      createdAt: 7,
    });
    expect(effectNoticeFromEvent(resolved(1), VIEWER, "b", 0)?.side).toBe("opp");
  });

  it("marks an effect a security card raised", () => {
    expect(effectNoticeFromEvent(resolved(0), VIEWER, "a", 0, true)?.fromSecurity).toBe(true);
  });

  it("marks an effect the server stamped as fired mid-check", () => {
    const event: ServerEvent = { ...resolved(0), duringSecurityCheck: true } as ServerEvent;
    expect(effectNoticeFromEvent(event, VIEWER, "a", 0)?.fromSecurity).toBe(true);
  });

  it("ignores other events", () => {
    expect(effectNoticeFromEvent({ kind: "securityRecovered", seat: 0, amount: 1 }, VIEWER, "a", 0)).toBeNull();
  });
});

describe("recoveryNoticeFromEvent", () => {
  it("lands on the recovering player's side", () => {
    expect(recoveryNoticeFromEvent({ kind: "securityRecovered", seat: 1, amount: 2 }, VIEWER, "a", 0)).toEqual({
      id: "a",
      side: Side.Opponent,
      fromSecurity: false,
      body: { variant: "recovery", amount: 2 },
      createdAt: 0,
    });
  });

  it("ignores other events", () => {
    expect(recoveryNoticeFromEvent(resolved(0), VIEWER, "a", 0)).toBeNull();
  });
});

describe("rejectionNotice", () => {
  it("is always the viewer's own", () => {
    expect(rejectionNotice("Not enough memory.", "a", 1)).toEqual({
      id: "a",
      side: Side.Viewer,
      fromSecurity: false,
      body: { variant: "rejection", reason: "Not enough memory." },
      createdAt: 1,
    });
  });
});

describe("notice lifetimes", () => {
  it("gives every notice the same reading time, whatever else is on screen", () => {
    expect(noticeRemaining(notice({ createdAt: 0 }), 0)).toBe(NOTICE_LIFETIME_MS);
    expect(noticeRemaining(notice({ createdAt: 0 }), 200)).toBe(NOTICE_LIFETIME_MS - 200);
  });

  it("gives a refusal the longer clock it is read on", () => {
    const refusal = rejectionNotice("Not enough memory.", "a", 0);
    expect(REJECTION_LIFETIME_MS).toBeGreaterThan(NOTICE_LIFETIME_MS);
    expect(noticeRemaining(refusal, 0)).toBe(REJECTION_LIFETIME_MS);
    expect(noticeRemaining(refusal, NOTICE_LIFETIME_MS)).toBe(REJECTION_LIFETIME_MS - NOTICE_LIFETIME_MS);
  });

  it("never reports a negative remainder", () => {
    expect(noticeRemaining(notice({ createdAt: 0 }), NOTICE_LIFETIME_MS + 500)).toBe(0);
  });
});

describe("isOwnEffectNotice", () => {
  it("names the viewer's own clause for one card, and nobody else's", () => {
    expect(isOwnEffectNotice(notice({ side: Side.Viewer }), "BT1-001")).toBe(true);
    expect(isOwnEffectNotice(notice({ side: Side.Viewer }), "BT1-002")).toBe(false);
    expect(isOwnEffectNotice(notice({ side: Side.Opponent }), "BT1-001")).toBe(false);
    expect(isOwnEffectNotice(notice({ body: { variant: "recovery", amount: 1 } }), "BT1-001")).toBe(false);
  });
});

describe("dialogRepeatsEffectNotice", () => {
  const clause =
    "[On Play] [When Digivolving] Suspend 5 of your opponent's Digimon or Tamers. Then, this Digimon may attack.";

  it("repeats the notice when the dialog prints the whole clause", () => {
    expect(dialogRepeatsEffectNotice({ effectText: clause })).toBe(true);
    expect(dialogRepeatsEffectNotice(undefined)).toBe(true);
    expect(dialogRepeatsEffectNotice({ effectText: clause, effectTextPart: "  " })).toBe(true);
  });

  it("repeats the notice when the dialog leads with the clause's opening passage", () => {
    expect(
      dialogRepeatsEffectNotice({
        effectText: clause,
        effectTextPart: "[On Play] [When Digivolving] Suspend 5 of your opponent's Digimon or Tamers.",
      }),
    ).toBe(true);
  });

  it("keeps the notice when the dialog prints only a later passage", () => {
    expect(dialogRepeatsEffectNotice({ effectText: clause, effectTextPart: "Then, this Digimon may attack." })).toBe(
      false,
    );
  });
});

it.each(["whenHandTrashed", "whenDigivolutionTrashed", "whenOptionUsed", "whenSuspended", "whenEffectAddsToDeck"])(
  "uses printed timing for the %s watcher notice",
  (timing) => {
    const event: ServerEvent = {
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT26-059",
      sourceInstanceId: "plutomon-card",
      sourcePermanentId: "plutomon",
      effectKey: "watcher",
      description: timing,
      timing,
      printedTiming: "AllTurns",
    };
    expect(effectNoticeFromEvent(event, 0, "watcher", 0)?.body).toMatchObject({
      timing: "AllTurns",
      sourcePermanentId: "plutomon",
      sourceInstanceId: "plutomon-card",
    });
  },
);

describe("stackStripNoticeFromEvent", () => {
  const trashedTop: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["king"],
    cardIds: ["EX13-035"],
    artIds: ["EX13-035"],
    seat: 0,
    from: "battleArea",
    to: "trash",
    strippedStackTops: { permanentId: "perm-1", reason: "trashTop", sourceCardId: "BT25-025" },
  };

  it("names the stripped card and the card that stripped it, on the owner's side", () => {
    expect(stackStripNoticeFromEvent(trashedTop, VIEWER, "n", 5)).toEqual({
      id: "n",
      side: Side.Viewer,
      fromSecurity: false,
      body: { variant: "stackStrip", reason: "trashTop", cardId: "EX13-035", sourceCardId: "BT25-025" },
      createdAt: 5,
    });
    expect(stackStripNoticeFromEvent(trashedTop, 1, "n", 5)?.side).toBe(Side.Opponent);
  });

  it("keeps Armor Purge's cost peel from creating a second prevention notice", () => {
    const cost: ServerEvent = { ...trashedTop, strippedStackTops: { permanentId: "perm-1", reason: "armorPurge" } };
    expect(stackStripNoticeFromEvent(cost, VIEWER, "cost", 5)).toBeNull();
    expect(
      preventionNoticeFromEvent(
        { kind: "deletionPrevented", keyword: "Armor Purge", permanentId: "perm-1", cardId: "BT8-012", seat: 0 },
        VIEWER,
        "saved",
        5,
      )?.body,
    ).toMatchObject({ variant: "keyword", keyword: "armorPurge", cardId: "BT8-012" });
  });

  it("ignores a De-Digivolve strip", () => {
    const deDigivolved: ServerEvent = {
      ...trashedTop,
      strippedStackTops: { permanentId: "perm-1", reason: "deDigivolve", sourceCardId: "BT25-025" },
    };
    expect(stackStripNoticeFromEvent(deDigivolved, VIEWER, "n", 5)).toBeNull();
  });

  it("ignores a plain trash movement and a deletion", () => {
    const { strippedStackTops: _stripped, ...plain } = trashedTop as Extract<ServerEvent, { kind: "cardsMoved" }>;
    expect(stackStripNoticeFromEvent(plain, VIEWER, "n", 0)).toBeNull();
  });

  it("leaves trashed digivolution cards to their side panel (Discord 1555176240359415878)", () => {
    const trashedSources: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["s1-19"],
      cardIds: ["BT16-024"],
      artIds: ["BT16-024"],
      seat: 1,
      from: "various",
      to: "trash",
      trashedSources: { permanentId: "perm-5", hostCardId: "EX6-035", sourceCardId: "EX12-035" },
    };
    expect(stackStripNoticeFromEvent(trashedSources, VIEWER, "n", 5)).toBeNull();
  });
});

describe("inherited effect source", () => {
  // Production shape: MetalMamemon (EX9-018) sits under PrinceMamemon (EX13-063) and its
  // inherited [End of Your Turn] clause fires from the host permanent perm-1.
  const inheritedTrigger: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "EX9-018",
    sourceInstanceId: "s0-25",
    sourcePermanentId: "perm-1",
    effectKey: "EX9-018/ir-3-0",
    description: "[End of Your Turn] [Once Per Turn] 1 of your Digimon unsuspends.",
    timing: "OnEndTurn",
    printedTiming: "EndOfYourTurn",
    isInherited: true,
  };
  const state = {
    players: [
      {
        hand: [],
        trash: [],
        battleArea: [
          {
            permanentId: "perm-1",
            topCard: { instanceId: "s0-35", cardId: "EX13-063", artId: "EX13-063_P1" },
            stack: [{ instanceId: "s0-25", cardId: "EX9-018", artId: "EX9-018_P1" }],
          },
        ],
      },
      { hand: [], trash: [], battleArea: [] },
    ],
  } as unknown as GameState;

  it("shows the inherited card and its own printing, not the host's top card", () => {
    const arts = buildInstanceArtIndex(state);
    const notice = effectNoticeFromEvent(inheritedTrigger, VIEWER, "n", 0, false, (id) => arts.get(id));
    expect(notice?.body).toMatchObject({ variant: "effect", cardId: "EX9-018", artId: "EX9-018_P1" });
  });

  it("keeps the source card's default art when its copy's printing is unknown", () => {
    const notice = effectNoticeFromEvent(inheritedTrigger, VIEWER, "n", 0, false, () => undefined);
    expect(notice?.body).toMatchObject({ variant: "effect", cardId: "EX9-018" });
    expect(notice?.body).not.toHaveProperty("artId");
  });

  it("keeps a field effect on its permanent after live state has already trashed it", () => {
    // Gallantmon's [When Attacking] is narrated while the presented board still shows it in
    // combat, but the live state already holds the tied security battle that trashed it.
    const trashed = structuredClone(state);
    const [deleted] = trashed.players[0]!.battleArea.splice(0, 1);
    trashed.players[0]!.trash.push(deleted!.topCard);
    const { locate } = buildCardSiteIndex(trashed);
    expect(
      locate(deleted!.topCard.cardId, 0, {
        sourceInstanceId: deleted!.topCard.instanceId,
        sourcePermanentId: deleted!.permanentId,
      }),
    ).toEqual({ zone: "field", permanentId: deleted!.permanentId });
  });

  it("still lights the host permanent the inherited card lives in", () => {
    const { locate } = buildCardSiteIndex(state);
    expect(locate("EX9-018", 0, { sourceInstanceId: "s0-25", sourcePermanentId: "perm-1" })).toEqual({
      zone: "field",
      permanentId: "perm-1",
    });
  });
});

describe("modal effect notices", () => {
  const deleteBullet = "Delete 1 of your opponent's Digimon with the lowest DP.";

  it("reads a choice clause up to its bullets when it triggers", () => {
    expect(
      noticeEffectClause({ cardId: "BT22-013", timing: "WhenDigivolving", description: "Modal(choose 1 of 2)" }),
    ).toBe("[When Digivolving] Activate 1 of the effects below:");
  });

  it("reads out only the chosen bullet", () => {
    const notice = effectNoticeFromEvent(
      {
        kind: "effectOptionChosen",
        seat: 1,
        sourceCardId: "BT22-013",
        sourceInstanceId: "wargreymon",
        timing: "WhenDigivolving",
        clause: deleteBullet,
      },
      0,
      "notice-1",
      0,
    );
    expect(notice).toMatchObject({ side: Side.Opponent, body: { variant: "effect", effectTextPart: deleteBullet } });
    const body = notice!.body as Extract<MatchNotice["body"], { variant: "effect" }>;
    expect(noticeEffectClause({ ...body, timing: body.timing, description: body.description })).toBe(deleteBullet);
  });
});

it("carries the authored continuation passage in its own viewer-side effect notice", () => {
  const clause =
    "Then, trash the top 2 cards of your opponent's deck for each of this Digimon's level 6 digivolution cards.";
  const continuationNotice = effectNoticeFromEvent(
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "BT15-102",
      sourcePermanentId: "apocalymon",
      effectKey: "apocalymon/processing/TrashTopDeck",
      description: clause,
      effectTextPart: clause,
      timing: "EndOfYourTurn",
    },
    0,
    "continuation",
    0,
  );
  expect(continuationNotice).toMatchObject({ side: "you", body: { cardId: "BT15-102", effectTextPart: clause } });
});
