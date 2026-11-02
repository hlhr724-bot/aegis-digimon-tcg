import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import type { MatchCues } from "../types";
import {
  soundsForPresentation,
  takeNewPresentationSounds,
  securityOutcomeSound,
  audioBoardFromPresentedSeats,
  type PresentationAudioBoard,
} from "./presentationAudio";
import { SecurityBreakPhase } from "../enums";
import { Side } from "../../side";

function cues(patch: Partial<MatchCues> = {}): MatchCues {
  return {
    zoneShowcase: null,
    permanentBursts: new Map(),
    attackAnnouncement: null,
    securityBreak: null,
    securityClash: null,
    fieldClash: null,
    combatImpactIds: new Set(),
    deleteBursts: [],
    heldStackStrips: new Map(),
    effectSources: [],
    deckRiffles: new Map(),
    securityFlights: new Map(),
    drawFlights: [],
    revealShowcase: null,
    dpPulses: new Map(),
    freezePulses: new Map(),
    unsuspendSweep: null,
    phaseBanner: null,
    notices: [],
    sidePanels: [],
    securityDealCounts: new Map(),
    ...patch,
  } as unknown as MatchCues;
}
describe("painted presentation audio", () => {
  it("voices Options, Breeding/Main banners, each dealt shield, and protection call-outs", () => {
    const option = {
      key: 7,
      cardId: "BT1-090",
      seat: 0 as const,
      mine: true,
      kind: "play" as const,
      color: "Red" as const,
    };
    expect(soundsForPresentation(cues({ zoneShowcase: option })).map((sound) => sound.kind)).toEqual(["optionUse"]);
    const banner = (phase: string) =>
      soundsForPresentation(cues({ phaseBanner: { key: 3, phase } as MatchCues["phaseBanner"] })).map(
        (sound) => sound.kind,
      );
    expect(banner("Main")).toEqual(["phase"]);
    expect(banner("Breeding")).toEqual(["phase"]);
    expect(banner("Draw")).toEqual([]);
    const seen = new Set<string>();
    const deal = (dealt: number) =>
      takeNewPresentationSounds(soundsForPresentation(cues({ securityDealCounts: new Map([[0, dealt]]) })), seen);
    expect(deal(0)).toEqual([]);
    expect(deal(1)).toMatchObject([{ kind: "securityDeal" }]);
    expect(deal(1)).toEqual([]);
    expect(deal(2)).toHaveLength(1);
    const notice = (keyword: string) =>
      soundsForPresentation(
        cues({ notices: [{ id: keyword, body: { variant: "keyword", keyword, cardId: "BT1-010" } }] as never }),
      ).map((sound) => sound.kind);
    expect(notice("guard")).toEqual(["protect"]);
    expect(notice("digiXros")).toEqual(["group"]);
    expect(notice("cannotBlock")).toEqual(["group"]);
  });
  it("plays public play once across showcase, landing, and repeated commits", () => {
    const seen = new Set<string>();
    const showcase = {
      key: 42,
      cardId: "BT1-010",
      seat: 1 as const,
      mine: false,
      kind: "play" as const,
      color: "Red" as const,
    };
    const first = takeNewPresentationSounds(soundsForPresentation(cues({ zoneShowcase: showcase })), seen);
    expect(first).toMatchObject([{ kind: "cardPlay", details: { cost: getCardDefinition("BT1-010")?.playCost } }]);
    const landing = cues({
      permanentBursts: new Map([
        ["p1", { key: 42, permanentId: "p1", variant: "play", color: "Red", inBreeding: false }],
      ]),
    });
    expect(takeNewPresentationSounds(soundsForPresentation(landing), seen)).toEqual([]);
    expect(
      takeNewPresentationSounds(soundsForPresentation(cues({ zoneShowcase: { ...showcase, key: 43 } })), seen),
    ).toHaveLength(1);
  });
  it("keeps source metadata neutral instead of reconstructing an earlier card from a future stack", () => {
    const state = {
      players: [
        {
          battleArea: [
            {
              permanentId: "p1",
              stack: [{ cardId: "BT1-010" }, { cardId: "BT1-015" }],
              topCard: { cardId: "BT1-020" },
            },
          ],
        },
      ],
    } as unknown as PresentationAudioBoard;
    const result = soundsForPresentation(
      cues({ zoneShowcase: { key: 9, cardId: "BT1-015", seat: 0, mine: true, kind: "digivolve", color: "Red" } }),
      state,
    );
    expect(result).toMatchObject([{ kind: "digivolve", details: { sourceLevel: undefined, targetLevel: 4 } }]);
  });
  it("uses the physically identified burst host when another stack has the same target card", () => {
    const state = {
      players: [
        {
          battleArea: [
            { permanentId: "other", topCard: { cardId: "ST1-08" }, stack: [{ cardId: "ST1-07" }] },
            { permanentId: "painted", topCard: { cardId: "ST1-08" }, stack: [{ cardId: "ST1-03" }] },
          ],
        },
      ],
    } as unknown as PresentationAudioBoard;
    const result = soundsForPresentation(
      cues({
        permanentBursts: new Map([
          [
            "painted",
            {
              key: 70,
              permanentId: "painted",
              variant: "evolve",
              color: "Red",
              inBreeding: false,
            },
          ],
        ]),
      }),
      state,
    );
    expect(result).toMatchObject([{ kind: "digivolve", details: { sourceLevel: 3, targetLevel: 5 } }]);
  });
  it("uses held painted Agumon in breeding while the live slot has already reached Garudamon", () => {
    const garudamon = {
      permanentId: "breeding",
      topCard: { cardId: "ST1-08", instanceId: "future" },
      stack: [{ cardId: "ST1-03", instanceId: "agumon" }],
    };
    const agumon = {
      permanentId: "breeding",
      topCard: { cardId: "ST1-03", instanceId: "agumon" },
      stack: [{ cardId: "ST1-01", instanceId: "egg" }],
    };
    const live = { battleArea: [], breeding: garudamon };
    const empty = { battleArea: [] };
    const seats = {
      shownViewer: live,
      shownOpponent: empty,
      breedingViewer: { ...live, breeding: agumon },
      breedingOpponent: empty,
    } as unknown as Parameters<typeof audioBoardFromPresentedSeats>[0];
    const board = audioBoardFromPresentedSeats(seats, 0);
    const result = soundsForPresentation(
      cues({
        permanentBursts: new Map([
          [
            "breeding",
            {
              key: 71,
              permanentId: "breeding",
              variant: "evolve",
              color: "Red",
              inBreeding: true,
            },
          ],
        ]),
      }),
      board,
    );
    expect(result).toMatchObject([{ kind: "digivolve", details: { sourceLevel: 2, targetLevel: 3, cost: 3 } }]);
  });
  it("uses a matching physical showcase occurrence and preserves actual seat order when the viewer is seat one", () => {
    const field = {
      permanentId: "field",
      topCard: { cardId: "ST1-08", instanceId: "painted" },
      stack: [{ cardId: "ST1-03", instanceId: "source" }],
    };
    const other = { ...field, permanentId: "other", stack: [{ cardId: "ST1-07", instanceId: "other-source" }] };
    const seats = {
      shownViewer: { battleArea: [field] },
      shownOpponent: { battleArea: [other] },
      breedingViewer: {},
      breedingOpponent: {},
    } as unknown as Parameters<typeof audioBoardFromPresentedSeats>[0];
    const result = soundsForPresentation(
      cues({
        zoneShowcase: { key: 72, cardId: "ST1-08", seat: 1, mine: true, kind: "digivolve", color: "Red" },
        permanentBursts: new Map([
          ["field", { key: 72, permanentId: "field", variant: "evolve", color: "Red", inBreeding: false }],
        ]),
      }),
      audioBoardFromPresentedSeats(seats, 1),
    );
    expect(takeNewPresentationSounds(result, new Set())).toMatchObject([
      { details: { sourceLevel: 3, targetLevel: 5 } },
    ]);
  });
  it("does not choose an arbitrary same-seat duplicate for an unidentified showcase", () => {
    const state = {
      players: [
        {
          battleArea: [
            { permanentId: "first", topCard: { cardId: "ST1-08" }, stack: [{ cardId: "ST1-07" }] },
            { permanentId: "second", topCard: { cardId: "ST1-08" }, stack: [{ cardId: "ST1-03" }] },
          ],
        },
      ],
    } as unknown as PresentationAudioBoard;
    const result = soundsForPresentation(
      cues({ zoneShowcase: { key: 73, cardId: "ST1-08", seat: 0, mine: true, kind: "digivolve", color: "Red" } }),
      state,
    );
    expect(result).toMatchObject([{ details: { sourceLevel: undefined, targetLevel: 5 } }]);
  });
  it("separates top stripping, source trash, hand trash and field deletion", () => {
    const result = soundsForPresentation(
      cues({
        deleteBursts: [
          { key: 1, x: 0, y: 0, stackStrip: true, stackStripKind: "top" },
          { key: 2, x: 0, y: 0, stackStrip: true, stackStripKind: "source" },
          { key: 3, x: 0, y: 0 },
        ],
        sidePanels: [
          {
            id: "discard",
            titleKey: "panel.discardedCards",
            side: Side.Viewer,
            cards: [],
            ordered: false,
            createdAt: 0,
          },
        ],
      }),
    );
    expect(result.map((item) => item.kind)).toEqual(["deDigivolve", "sourceTrash", "delete", "handTrash"]);
  });
  it("waits for actual shield fracture and impact, not shield arming or the battle arrow", () => {
    const shield = { key: 7, seat: 0 as const, side: Side.Viewer, seed: 1 };
    const fieldClash = {
      key: 5,
      attacker: { permanentId: "a" },
      defender: { permanentId: "b" },
      loserPermanentIds: [],
    } as unknown as MatchCues["fieldClash"];
    expect(
      soundsForPresentation(cues({ securityBreak: { ...shield, phase: SecurityBreakPhase.Arm }, fieldClash })),
    ).toEqual([]);
    const sounded = takeNewPresentationSounds(
      soundsForPresentation(
        cues({
          securityBreak: { ...shield, phase: SecurityBreakPhase.Break },
          fieldClash,
          combatImpactIds: new Set(["a", "b"]),
        }),
      ),
      new Set(),
    );
    expect(sounded.map((item) => item.kind)).toEqual(["securityHit", "impact"]);
  });
  it("keeps geometry-owned field focus out of the generic activation fanout", () => {
    const source = {
      key: 1,
      seat: 0 as const,
      cardId: "BT1-010",
      itemId: "clause",
      site: { zone: "field" as const, permanentId: "p1" },
    };
    const notice = {
      id: "clause",
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "effect" as const, cardId: "BT1-010" },
    };
    expect(soundsForPresentation(cues({ effectSources: [source], notices: [notice] }))).toEqual([]);
    expect(soundsForPresentation(cues({ notices: [notice] }))).toMatchObject([{ kind: "effectActivate" }]);
    expect(
      soundsForPresentation(
        cues({ effectSources: [{ ...source, site: { zone: "hand", instanceId: "i1" } }], notices: [notice] }),
      ),
    ).toMatchObject([{ kind: "effectActivate" }]);
  });
  it("covers movement, draw, reveal, shuffle, recovery, modifiers, restrictions and grouping", () => {
    const result = soundsForPresentation(
      cues({
        permanentBursts: new Map([
          [
            "p1",
            { key: 1, permanentId: "p1", variant: "play", color: "Blue", inBreeding: false, moveFromBreeding: true },
          ],
          ["p2", { key: 2, permanentId: "p2", variant: "hatch", color: "Blue", inBreeding: true }],
        ]),
        drawFlights: [{ key: 3, x: 0, y: 0, dx: 0, dy: 0, duration: 100 }],
        deckRiffles: new Map([["0:deck", 4]]),
        securityFlights: new Map([[5, 0]]),
        revealShowcase: { key: 6, seat: 1, cards: [{ cardId: "BT1-010" }], eventIndices: [0] },
        dpPulses: new Map([
          ["p1", { key: 7, permanentId: "p1", kind: "buff", from: 1000, to: 2000 }],
          ["p2", { key: 8, permanentId: "p2", kind: "debuff", from: 2000, to: 1000 }],
        ]),
        freezePulses: new Map([["p1", { key: 9, permanentId: "p1", kind: "cannotAttack" }]]),
        notices: [
          {
            id: "group",
            side: Side.Viewer,
            fromSecurity: false,
            createdAt: 0,
            body: { variant: "keyword", keyword: "digiXros", cardId: "BT1-010" },
          },
        ],
      }),
    );
    expect(new Set(result.map((item) => item.kind))).toEqual(
      new Set(["move", "hatch", "draw", "shuffle", "recover", "reveal", "buff", "debuff", "freeze", "group"]),
    );
  });
  it("sounds security battle and destruction at their scene clock, preserving a late zero-delay outcome", () => {
    const scene = { key: 6, resolution: "pending", revealed: { cardId: "BT1-010", side: Side.Opponent } } as const;
    expect(securityOutcomeSound(scene)).toBeNull();
    expect(securityOutcomeSound({ ...scene, resolution: "battle", outcomeAtMs: 0 })).toMatchObject({
      kind: "impact",
      delayMs: 0,
    });
    const destruction = securityOutcomeSound({ ...scene, cause: "destruction" });
    expect(destruction?.kind).toBe("delete");
    expect(destruction!.delayMs).toBeGreaterThan(0);
  });
  it("bounds dedupe memory across long matches", () => {
    const seen = new Set<string>();
    takeNewPresentationSounds(
      Array.from({ length: 1000 }, (_, index) => ({ id: String(index), kind: "draw" as const })),
      seen,
    );
    expect(seen.size).toBe(512);
  });
});

it("plays one discard sound for the hand-to-trash presentation without a draw sound", () => {
  const result = soundsForPresentation(
    cues({
      drawFlights: [
        { key: 1, x: 0, y: 0, dx: 200, dy: 100, duration: 600, handTrash: true, card: { cardId: "BT1-009" } },
      ],
      sidePanels: [
        {
          id: "discard",
          titleKey: "panel.discardedCards",
          side: Side.Opponent,
          cards: [{ cardId: "BT1-009", badge: 1 }],
          createdAt: 0,
          ordered: false,
        },
      ],
    }),
  );
  expect(result.map((sound) => sound.kind)).toEqual(["handTrash"]);
});
