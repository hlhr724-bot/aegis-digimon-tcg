import type { ServerEvent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { translator } from "../i18n";
import { buildMatchLog } from "./matchLog";

const kakkinmon = {
  seat: 1 as const,
  sourceCardId: "P-245",
  sourceInstanceId: "s1-52",
  sourcePermanentId: "perm-1",
  effectKey: "P-245/ir-3-0",
  description: "[End of All Turns] [Once Per Turn] By suspending 1 of your black Digimon with ＜Blocker＞, ...",
  timing: "OnEndTurn",
  isInherited: true as const,
};

const craniamonSweep = {
  seat: 1 as const,
  sourceCardId: "EX13-062",
  sourceInstanceId: "s1-31",
  sourcePermanentId: "perm-1",
  effectKey: "subtrigger/opt/s1-31/printed/EX13-062",
  description: "[All Turns] [Once Per Turn] When this Digimon suspends, you may delete ...",
  timing: "whenSuspended",
};

// Production match 6b32b755, turn 5, seq 226-232, plus the no-target sweep the fix announces.
const endOfTurnEvents: ServerEvent[] = [
  { kind: "effectTriggered", ...kakkinmon, printedTiming: "EndOfAllTurns" },
  { kind: "cardsMoved", instanceIds: ["perm-1"], from: "unsuspended", to: "suspended" },
  { kind: "cardsMoved", instanceIds: ["s1-26"], from: "deck", to: "hand", handAddition: "draw", seat: 1 },
  { kind: "effectResolved", ...kakkinmon },
  { kind: "effectHadNoEffect", ...craniamonSweep },
];

const chronologicalLog = (events: readonly ServerEvent[]) =>
  buildMatchLog(events, 1, new Map([["perm-1", "EX13-062"]]), translator("en"))
    .map((line) => line.text)
    .reverse();

describe("match log effect lifecycle", () => {
  it("names the activating effect before its results (Discord 1557481090870939840)", () => {
    expect(chronologicalLog(endOfTurnEvents).slice(0, 4)).toEqual([
      "Kakkinmon (P-245) #1's effect activated",
      "Craniamon (EX13-062) #1 suspended",
      "You drew 1",
      "Kakkinmon (P-245) #1's effect resolved",
    ]);
  });

  it("says a triggered effect with no legal target had no effect (Discord 1557481090870939840)", () => {
    expect(chronologicalLog(endOfTurnEvents).slice(4)).toEqual(["Craniamon (EX13-062) #1's effect had no effect"]);
  });

  it("does not repeat a [Main] activation as a receipt after its own lifecycle (Discord 1557481090870939840)", () => {
    const main = { ...kakkinmon, sourceCardId: "BT1-085", effectKey: "BT1-085/main", description: "[Main] ..." };
    expect(
      chronologicalLog([
        { kind: "effectTriggered", ...main },
        { kind: "effectResolved", ...main },
        { kind: "effectActivated", ...main, receiptOnly: true },
      ]),
    ).toEqual(["Tai Kamiya (BT1-085) #1's effect activated", "Tai Kamiya (BT1-085) #1's effect resolved"]);
  });
});

describe("readable match history", () => {
  const t = translator("en");
  const names = { 0: "Alice", 1: "Bob" };

  it("uses both display names regardless of viewer perspective", () => {
    const events: ServerEvent[] = [
      { kind: "cardPlayed", seat: 0, cardId: "ST1-03" },
      { kind: "cardPlayed", seat: 1, cardId: "ST1-02" },
    ];
    for (const viewerSeat of [0, 1] as const) {
      expect(buildMatchLog(events, viewerSeat, new Map(), t, 30, names).map((line) => line.text)).toEqual([
        "Bob played Biyomon (ST1-02)",
        "Alice played Agumon (ST1-03)",
      ]);
    }
  });

  it("keeps participant fallback names when display names are unavailable", () => {
    expect(buildMatchLog([{ kind: "cardPlayed", seat: 0, cardId: "ST1-03" }], 0, new Map(), t)[0]?.text).toBe(
      "You played Agumon (ST1-03)",
    );
    expect(buildMatchLog([{ kind: "cardPlayed", seat: 1, cardId: "ST1-03" }], 0, new Map(), t)[0]?.text).toBe(
      "Opponent played Agumon (ST1-03)",
    );
  });

  it("attaches paid memory to the action without a duplicate physical move", () => {
    const events: ServerEvent[] = [
      { kind: "matchStarted", firstSeat: 1 },
      { kind: "memoryChanged", from: 4, to: -1, reason: "payCost" },
      { kind: "cardsMoved", instanceIds: ["played"], from: "hand", to: "battleArea" },
      { kind: "memoryChanged", from: 4, to: -1, reason: "playCard" },
      { kind: "cardPlayed", seat: 1, cardId: "ST1-03", instanceId: "played" },
    ];
    const lines = buildMatchLog(events, 0, new Map(), t, 30, names);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ text: "Bob played Agumon (ST1-03)", memory: { delta: -5, after: -1 } });
  });

  it("keeps Overflow as a separate source-attributed gain", () => {
    const events: ServerEvent[] = [
      { kind: "effectTriggered", ...kakkinmon },
      { kind: "memoryChanged", from: 0, to: 3, reason: "overflow" },
      { kind: "effectResolved", ...kakkinmon },
    ];
    expect(buildMatchLog(events, 0, new Map(), t, 30, names).map((line) => line.text)).toEqual([
      "Kakkinmon (P-245) #1's effect resolved",
      "Kakkinmon (P-245): memory 0 → 3",
      "Kakkinmon (P-245) #1's effect activated",
    ]);
  });

  it("narrates every deleted permanent with its own owner", () => {
    const events: ServerEvent[] = [
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["a", "b"],
        battleDeletion: true,
        deletedPermanents: [
          { permanentId: "pa", instanceId: "a", cardId: "ST1-03", seat: 0 },
          { permanentId: "pb", instanceId: "b", cardId: "ST1-02", seat: 1 },
        ],
      },
    ];
    const lines = buildMatchLog(events, 0, new Map(), t, 30, names);
    expect(lines.map((line) => line.text)).toEqual([
      "Bob: Biyomon (ST1-02) #pb was deleted in battle",
      "Alice: Agumon (ST1-03) #pa was deleted in battle",
    ]);
    expect(lines.map((line) => line.kind)).toEqual(["opp", "you"]);
    expect(lines.map((line) => line.cardIds)).toEqual([["ST1-02"], ["ST1-03"]]);
  });

  it("renders unknown origins from old replays without inventing ownership", () => {
    const lines = buildMatchLog(
      [{ kind: "cardsMoved", from: "various", to: "trash", instanceIds: ["unknown"] }],
      0,
      new Map(),
      t,
      30,
      names,
    );
    expect(lines[0]?.text).toBe("1 card moved: other areas → trash");
  });

  it("silences pass-turn resets", () => {
    expect(buildMatchLog([{ kind: "memoryChanged", from: 1, to: -3, reason: "passTurn" }], 0, new Map(), t)).toEqual(
      [],
    );
  });
});

describe("movement origin narration", () => {
  it("names the origin owner independently of the destination owner", () => {
    const log = buildMatchLog(
      [{ kind: "cardsMoved", instanceIds: ["card"], from: "trash", fromSeat: 0, to: "hand", seat: 1 }],
      0,
      new Map([["card", "ST1-03"]]),
      translator("en"),
      30,
      { 0: "Alice", 1: "Bob" },
    );
    expect(log[0]?.text).toContain("Alice's trash");
    expect(log[0]?.text).toContain("Bob's hand");
  });

  it("names and links the original host even after its top changes", () => {
    const log = buildMatchLog(
      [
        {
          kind: "cardsMoved",
          instanceIds: ["source"],
          from: "digivolutionCards",
          fromSeat: 0,
          fromHost: { permanentId: "host", hostCardId: "ST1-07" },
          to: "trash",
        },
      ],
      0,
      new Map([["source", "ST1-03"]]),
      translator("en"),
    );
    expect(log[0]?.text).toContain("under Greymon");
    expect(log[0]?.cardIds).toEqual(["ST1-03", "ST1-07"]);
  });

  it("uses a grammatical participant fallback for an owned zone", () => {
    const log = buildMatchLog(
      [{ kind: "cardsMoved", instanceIds: ["card"], from: "trash", fromSeat: 0, to: "hand", seat: 0 }],
      0,
      new Map(),
      translator("en"),
    );
    expect(log[0]?.text).toContain("your trash");
    expect(log[0]?.text).toContain("your hand");
  });
});

describe("public search dispositions", () => {
  it("names every card added from a public reveal without relying on a state patch", () => {
    const event: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["blue", "green"],
      cardIds: ["BT1-027", "BT1-064"],
      from: "deck",
      to: "hand",
      seat: 0,
      handAddition: "transfer",
    };
    for (const viewerSeat of [0, 1] as const) {
      const log = buildMatchLog([event], viewerSeat, new Map(), translator("en"));
      expect(log[0]?.text).toContain("Armadillomon (BT1-027), Goblimon (BT1-064)");
      expect(log[0]?.cardIds).toEqual(["BT1-027", "BT1-064"]);
    }
  });

  it("names a single selected card rather than only the revealed source", () => {
    const log = buildMatchLog(
      [
        {
          kind: "cardsMoved",
          instanceIds: ["chosen"],
          cardIds: ["ST1-03"],
          from: "deck",
          to: "hand",
          seat: 0,
          handAddition: "transfer",
        },
      ],
      1,
      new Map(),
      translator("en"),
    );
    expect(log[0]?.text).toContain("Agumon (ST1-03)");
    expect(log[0]?.text).toContain("hand");
  });

  it.each(["deck", "deckBottom"])("explains the final top-to-bottom order for %s", (to) => {
    const log = buildMatchLog(
      [
        {
          kind: "cardsMoved",
          instanceIds: ["second", "first"],
          cardIds: ["ST1-02", "ST1-03"],
          from: "deck",
          to,
          seat: 0,
          deckReturnOrder: true,
        },
      ],
      1,
      new Map(),
      translator("en"),
    );
    expect(log[0]?.text).toContain("Biyomon (ST1-02), Agumon (ST1-03)");
    expect(log[0]?.text).toContain("Listed from top to bottom");
    expect(log[0]?.text).toContain(to === "deck" ? "top of" : "bottom of");
  });

  it("never infers private transfers or returns from a stale identity index", () => {
    const events: ServerEvent[] = [
      { kind: "cardsMoved", instanceIds: ["private"], from: "deck", to: "hand", seat: 0, handAddition: "transfer" },
      { kind: "cardsMoved", instanceIds: ["private"], from: "hand", to: "deckBottom", seat: 0, deckReturnOrder: true },
    ];
    const log = buildMatchLog(events, 1, new Map([["private", "ST1-03"]]), translator("en"));
    expect(log.map((line) => line.text).join(" ")).not.toContain("Agumon");
    expect(log.map((line) => line.cardIds ?? []).flat()).toEqual([]);
    expect(log[0]?.text).toContain("Identities hidden");
  });
});

it("does not use cached source identities for a private face-down return", () => {
  const log = buildMatchLog(
    [
      {
        kind: "cardsMoved",
        instanceIds: ["source"],
        from: "digivolutionCards",
        to: "deckBottom",
        seat: 0,
        deckReturnOrder: true,
      },
    ],
    1,
    new Map([["source", "ST1-03"]]),
    translator("en"),
  );
  expect(log[0]?.text).not.toContain("Agumon");
  expect(log[0]?.cardIds).toEqual([]);
});

it("explains Barrier and subsequent public option results without naming concealed security", () => {
  const events: ServerEvent[] = [
    { kind: "barrierResolved", permanentId: "protected", accepted: true },
    {
      kind: "cardsMoved",
      instanceIds: ["paid-security"],
      cardIds: ["EX7-071"],
      from: "security",
      to: "trash",
      seat: 1,
    },
    {
      kind: "effectActivated",
      seat: 1,
      sourceCardId: "EX7-071",
      effectKey: "accel-effect",
      description: "ACCEL",
    },
    { kind: "cardsMoved", instanceIds: ["hidden-security"], from: "security", to: "trash", seat: 0 },
  ];
  const log = buildMatchLog(events, 0, new Map([["protected", "EX13-062"]]), translator("en"));
  expect(log.some((line) => line.text.includes("Barrier") && line.text.includes("Craniamon"))).toBe(true);
  expect(log.some((line) => line.text.includes("Hurricane Screw Shot") && line.text.includes("trash"))).toBe(true);
  expect(log.some((line) => line.text.includes("Hurricane Screw Shot") && line.text.includes("ACCEL"))).toBe(true);
  expect(log.flatMap((line) => line.cardIds ?? [])).not.toContain("hidden-security");
});
