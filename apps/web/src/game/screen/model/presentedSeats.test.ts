import { ArraySchema } from "@colyseus/schema";
import { CardInstance, GameState, Permanent, PlayerState } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { presentedSeats } from "./presentedSeats";
import type { HeldHandArrival, HeldStackStrip } from "../../match/types";

function permanent({ rush, duringAttack = false }: { rush: boolean; duringAttack?: boolean }): Permanent {
  const result = new Permanent();
  result.permanentId = "grademon";
  result.topCard = new CardInstance();
  result.topCard.cardId = "BT20-055";
  result.topCard.instanceId = "grademon-card";
  result.summoningSick = !rush;
  result.baseDP = 7000;
  result.currentDP = duringAttack ? 12_000 : 7000;
  result.immuneToOpponentDigimonEffects = duringAttack;
  if (rush) {
    result.keywords = new ArraySchema<string>("Rush");
    result.grantedKeywords = new ArraySchema<string>("Rush");
  }
  return result;
}

function player(seat: 0 | 1, battleArea: Permanent[] = []): PlayerState {
  const result = new PlayerState();
  result.seat = seat;
  result.battleArea.push(...battleArea);
  return result;
}

describe("presentedSeats live projection", () => {
  it.each(["current", "sequential"] as const)(
    "does not turn a forced attacker early from a newer security hold under %s pacing (Discord bug 1557482157012680795)",
    (presentationPacing) => {
      const upright = permanent({ rush: false });
      const shownState = new GameState();
      shownState.stateVersion = 16;
      shownState.players.push(player(0), player(1, [upright]));
      const attacking = permanent({ rush: false });
      attacking.isSuspended = true;
      const securityRevealed = new GameState();
      securityRevealed.stateVersion = 20;
      securityRevealed.players.push(player(0), player(1, [attacking]));

      const seats = presentedSeats({
        shownState,
        viewer: player(0),
        opponent: player(1, [attacking]),
        viewerSeat: 0,
        presentationPacing,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: securityRevealed,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        optimisticPlayedInstanceId: undefined,
      });

      expect(seats.shownOpponent.battleArea[0]!.isSuspended).toBe(false);
    },
  );

  it.each(["current", "sequential"] as const)(
    "keeps both seats' Digi-Burst DP until the earliest cost finishes under %s pacing",
    (presentationPacing) => {
      const host = permanent({ rush: true });
      host.permanentId = "host";
      host.currentDP = 6000;
      const target = permanent({ rush: true });
      target.permanentId = "target";
      target.currentDP = 8000;
      const viewer = player(0, [host]);
      const opponent = player(1, [target]);
      const shownState = new GameState();
      shownState.stateVersion = 3;
      shownState.players.push(viewer, opponent);
      const held = new Map<number, HeldStackStrip>([
        [
          1,
          {
            seat: 0,
            permanent: host,
            index: 0,
            stateVersion: 2,
            returnedInstanceId: undefined,
            beforeCostDps: new Map([
              ["host", 7000],
              ["target", 12000],
            ]),
          },
        ],
        [
          2,
          {
            seat: 0,
            permanent: host,
            index: 0,
            stateVersion: 3,
            returnedInstanceId: undefined,
            beforeCostDps: new Map([
              ["host", 6000],
              ["target", 10000],
            ]),
          },
        ],
      ]);
      const show = () =>
        presentedSeats({
          shownState,
          viewer,
          opponent,
          viewerSeat: 0,
          presentationPacing,
          heldPhaseState: undefined,
          heldBlowState: undefined,
          heldSecurityEffectState: undefined,
          heldDrawState: undefined,
          heldBreedingState: undefined,
          heldDeletions: new Map(),
          heldTrashArrivals: new Map(),
          heldStackStrips: held,
          optimisticPlayedInstanceId: undefined,
        });
      expect([show().shownViewer.battleArea[0]!.currentDP, show().shownOpponent.battleArea[0]!.currentDP]).toEqual([
        7000, 12000,
      ]);
      held.delete(1);
      expect([show().shownViewer.battleArea[0]!.currentDP, show().shownOpponent.battleArea[0]!.currentDP]).toEqual([
        6000, 10000,
      ]);
      held.delete(2);
      expect(show().shownOpponent.battleArea[0]!.currentDP).toBe(8000);
      expect(target.currentDP).toBe(8000);
    },
  );

  it("does not import a future cost's DP into an earlier narrated revision", () => {
    const host = permanent({ rush: true });
    const target = permanent({ rush: true });
    target.permanentId = "target";
    target.currentDP = 14000;
    const viewer = player(0, [host]);
    const opponent = player(1, [target]);
    const shownState = new GameState();
    shownState.stateVersion = 1;
    shownState.players.push(viewer, opponent);
    const shown = presentedSeats({
      shownState,
      viewer,
      opponent,
      viewerSeat: 0,
      presentationPacing: "sequential",
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldStackStrips: new Map([
        [
          1,
          {
            seat: 0,
            permanent: host,
            index: 0,
            stateVersion: 2,
            returnedInstanceId: undefined,
            beforeCostDps: new Map([["target", 12000]]),
          },
        ],
      ]),
      optimisticPlayedInstanceId: undefined,
    });
    expect(shown.shownOpponent.battleArea[0]!.currentDP).toBe(14000);
  });
  it.each([0, 1] as const)("holds a count-only private opponent hand for viewer seat%s", (viewerSeat) => {
    const viewer = player(viewerSeat);
    const other = player(viewerSeat === 0 ? 1 : 0);
    other.handCount = 8;
    other.deckCount = 24;
    const opaque = other.toJSON();
    delete (opaque as Partial<typeof opaque>).hand;
    const opponent = opaque as unknown as PlayerState;
    const shownState = {
      stateVersion: 4,
      players: viewerSeat === 0 ? [viewer, opponent] : [opponent, viewer],
    } as unknown as GameState;
    for (const presentationPacing of ["current", "sequential"] as const) {
      const result = presentedSeats({
        shownState,
        viewer,
        opponent,
        viewerSeat,
        presentationPacing,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: undefined,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        heldHandArrivals: new Map([
          [1, { seat: opponent.seat as 0 | 1, stateVersion: 4, handCountAfter: 8, deckCountAfter: 24 }],
        ]),
        optimisticPlayedInstanceId: undefined,
      });
      expect(result.shownOpponentHandCount).toBe(7);
      expect(result.shownOpponent.deckCount).toBe(25);
      expect(result.shownOpponent.hand).toBeUndefined();
      expect(result.shownHand).toHaveLength(0);
      expect(opponent.handCount).toBe(8);
    }
  });

  it("hands a Draw 2 over one physical card at a time, without importing future counts", () => {
    function handCard(id: string) {
      const card = new CardInstance();
      card.instanceId = id;
      card.cardId = "ST1-03";
      return card;
    }
    const viewer = player(0);
    viewer.hand.push(handCard("kept"), handCard("first"), handCard("second"));
    viewer.handCount = 3;
    viewer.deckCount = 28;
    const opponent = player(1);
    const after = new GameState();
    after.stateVersion = 2;
    after.players.push(viewer, opponent);
    const before = new GameState();
    before.stateVersion = 1;
    const oldViewer = player(0);
    oldViewer.hand.push(handCard("kept"));
    oldViewer.handCount = 1;
    oldViewer.deckCount = 30;
    before.players.push(oldViewer, opponent);
    const held = new Map<number, HeldHandArrival>([
      [1, { seat: 0, instanceId: "first", stateVersion: 2, handCountAfter: 3, deckCountAfter: 28 }],
      [2, { seat: 0, instanceId: "second", stateVersion: 2, handCountAfter: 3, deckCountAfter: 28 }],
    ]);
    function show(shownState: GameState) {
      return presentedSeats({
        shownState,
        viewer,
        opponent,
        viewerSeat: 0,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: undefined,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        heldHandArrivals: held,
        optimisticPlayedInstanceId: undefined,
        presentationPacing: "sequential",
      });
    }
    expect(show(before).shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
    expect(show(after).shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
    expect(show(after).shownHand!.map((card) => card.instanceId)).toEqual(["kept"]);
    held.delete(1);
    expect(show(after).shownViewer).toMatchObject({ handCount: 2, deckCount: 29 });
    expect(show(after).shownHand!.map((card) => card.instanceId)).toEqual(["kept", "first"]);
    held.delete(2);
    expect(show(after).shownViewer).toMatchObject({ handCount: 3, deckCount: 28 });
    expect(viewer.handCount).toBe(3);
    expect(viewer.hand).toHaveLength(3);
  });

  it.each(["current", "sequential"] as const)(
    "%s: holds a bonus draw that a coalesced patch leaked into the earlier narrated snapshot",
    (presentationPacing) => {
      function handCard(id: string) {
        const card = new CardInstance();
        card.instanceId = id;
        card.cardId = "ST1-03";
        return card;
      }
      // Match 667f78a8: the digivolve closed at sv 7 and its bonus draw at sv 8 two
      // milliseconds later, so the snapshot frozen for sv 7 already held the drawn card.
      const viewer = player(0);
      viewer.hand.push(handCard("kept"), handCard("bonus"));
      viewer.handCount = 2;
      viewer.deckCount = 29;
      const opponent = player(1);
      const digivolved = new GameState();
      digivolved.stateVersion = 7;
      digivolved.players.push(viewer, opponent);
      const result = presentedSeats({
        shownState: digivolved,
        viewer,
        opponent,
        viewerSeat: 0,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: undefined,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        heldHandArrivals: new Map([
          [1, { seat: 0, instanceId: "bonus", stateVersion: 8, handCountAfter: 2, deckCountAfter: 29 }],
        ]),
        optimisticPlayedInstanceId: undefined,
        presentationPacing,
      });
      expect(result.shownHand!.map((card) => card.instanceId)).toEqual(["kept"]);
      expect(result.shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
    },
  );

  function securityTransferSeats(
    presentationPacing: "current" | "sequential",
    { shownSecurityCount, shownVersion }: { shownSecurityCount: number; shownVersion: number },
  ) {
    const kept = new CardInstance();
    kept.instanceId = "kept";
    kept.cardId = "ST1-03";
    const horn = new CardInstance();
    horn.instanceId = "horn";
    horn.cardId = "BT1-108";
    const viewer = player(0);
    viewer.hand.push(kept, horn);
    viewer.handCount = 2;
    viewer.deckCount = 30;
    viewer.securityCount = shownSecurityCount;
    const opponent = player(1);
    const shownState = new GameState();
    shownState.stateVersion = shownVersion;
    shownState.players.push(viewer, opponent);
    return presentedSeats({
      shownState,
      viewer,
      opponent,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldHandArrivals: new Map([
        [
          1,
          {
            seat: 0,
            instanceId: "horn",
            entryOnly: true,
            fromDeck: false,
            fromSecurity: true,
            stateVersion: 8,
            handCountAfter: 2,
            deckCountAfter: 30,
            securityCountAfter: 4,
          },
        ],
      ]),
      optimisticPlayedInstanceId: undefined,
      presentationPacing,
    });
  }

  it.each(["current", "sequential"] as const)(
    "%s: holds a checked security card a coalesced patch leaked into the reveal snapshot (Discord 1557410815466938429)",
    (presentationPacing) => {
      // The reveal (sv 7) already removed the card from security; its [Security] effect moved it
      // to hand at sv 8, and one patch carried both into the snapshot frozen for the reveal.
      const result = securityTransferSeats(presentationPacing, { shownSecurityCount: 4, shownVersion: 7 });
      expect(result.shownHand!.map((card) => card.instanceId)).toEqual(["kept"]);
      expect(result.shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
    },
  );

  it("keeps a hand card in a snapshot from before the security reveal that later returns it", () => {
    const result = securityTransferSeats("sequential", { shownSecurityCount: 5, shownVersion: 5 });
    expect(result.shownHand!.map((card) => card.instanceId)).toEqual(["kept", "horn"]);
  });

  it("keeps a card the narrated snapshot already held before a later draw of it", () => {
    const card = new CardInstance();
    card.instanceId = "returned";
    card.cardId = "ST1-03";
    const viewer = player(0);
    viewer.hand.push(card);
    viewer.handCount = 1;
    viewer.deckCount = 30;
    const shownState = new GameState();
    shownState.stateVersion = 5;
    shownState.players.push(viewer, player(1));
    const result = presentedSeats({
      shownState,
      viewer,
      opponent: player(1),
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldHandArrivals: new Map([
        [1, { seat: 0, instanceId: "returned", stateVersion: 9, handCountAfter: 1, deckCountAfter: 29 }],
      ]),
      optimisticPlayedInstanceId: undefined,
      presentationPacing: "sequential",
    });
    expect(result.shownHand!.map((shown) => shown.instanceId)).toEqual(["returned"]);
  });

  it.each([0, 1] as const)(
    "holds an opaque opponent hand and deck at the same beat for viewer seat %s",
    (viewerSeat) => {
      const viewer = player(viewerSeat);
      const opponent = player(viewerSeat === 0 ? 1 : 0);
      opponent.handCount = 8;
      opponent.deckCount = 24;
      const shownState = new GameState();
      shownState.stateVersion = 4;
      shownState.players.push(viewerSeat === 0 ? viewer : opponent, viewerSeat === 0 ? opponent : viewer);
      const result = presentedSeats({
        shownState,
        viewer,
        opponent,
        viewerSeat,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: undefined,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        heldHandArrivals: new Map([
          [1, { seat: opponent.seat as 0 | 1, stateVersion: 4, handCountAfter: 8, deckCountAfter: 24 }],
        ]),
        optimisticPlayedInstanceId: undefined,
        presentationPacing: "sequential",
      });
      expect(result.shownOpponentHandCount).toBe(7);
      expect(result.shownOpponent.deckCount).toBe(25);
      expect(result.shownOpponent.hand).toHaveLength(0);
      expect(opponent.handCount).toBe(8);
    },
  );

  it("keeps future DP and granted abilities on the narrated snapshot while paced, then shows them at the decision horizon", () => {
    const viewer = player(0, [permanent({ rush: true, duringAttack: true })]);
    viewer.battleArea[0]!.securityAttackModifier = 1;
    const opponent = player(1);
    const before = new GameState();
    before.stateVersion = 1;
    before.players.push(player(0, [permanent({ rush: false })]), player(1));
    const after = new GameState();
    after.stateVersion = 2;
    after.players.push(viewer, opponent);
    const show = (shownState: GameState) =>
      presentedSeats({
        shownState,
        viewer,
        opponent,
        viewerSeat: 0,
        heldPhaseState: undefined,
        heldBlowState: undefined,
        heldSecurityEffectState: undefined,
        heldDrawState: undefined,
        heldBreedingState: undefined,
        heldDeletions: new Map(),
        heldTrashArrivals: new Map(),
        optimisticPlayedInstanceId: undefined,
        presentationPacing: "sequential",
      }).shownViewer.battleArea[0]!;

    const held = show(before);
    expect([...held.keywords]).toEqual([]);
    expect([...held.grantedKeywords]).toEqual([]);
    expect(held).toMatchObject({
      currentDP: 7000,
      summoningSick: true,
      securityAttackModifier: 0,
      immuneToOpponentDigimonEffects: false,
    });
    const released = show(after);
    expect([...released.keywords]).toEqual(["Rush"]);
    expect([...released.grantedKeywords]).toEqual(["Rush"]);
    expect(released).toMatchObject({
      currentDP: 12_000,
      summoningSick: false,
      securityAttackModifier: 1,
      immuneToOpponentDigimonEffects: true,
    });
  });

  it("shows Grademon's live Rush and attack rider while an older arrival snapshot is still presented", () => {
    const viewer = player(0, [permanent({ rush: true, duringAttack: true })]);
    const opponent = player(1);
    const shownState = new GameState();
    shownState.players.push(player(0, [permanent({ rush: false })]), player(1));

    const result = presentedSeats({
      shownState,
      viewer,
      opponent,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      optimisticPlayedInstanceId: undefined,
    });

    const grademon = result.shownViewer.battleArea[0]!;
    expect([...grademon.keywords]).toContain("Rush");
    expect([...grademon.grantedKeywords]).toContain("Rush");
    expect(grademon.summoningSick).toBe(false);
    expect(grademon.currentDP).toBe(12_000);
    expect(grademon.immuneToOpponentDigimonEffects).toBe(true);
  });

  it("keeps a held trash arrival out of the pile until its batch is narrated (Discord 1555578375677018193)", () => {
    const trashed = (instanceId: string, cardId: string) => {
      const card = new CardInstance();
      card.instanceId = instanceId;
      card.cardId = cardId;
      return card;
    };
    const viewer = player(0);
    viewer.trash.push(trashed("older", "BT1-009"), trashed("shot", "EX7-071"));
    const opponent = player(1);
    const shownState = new GameState();
    shownState.players.push(viewer, opponent);

    const result = presentedSeats({
      shownState,
      viewer,
      opponent,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map([[1, { seat: 0, instanceIds: ["shot"], stateVersion: 11 }]]),
      optimisticPlayedInstanceId: undefined,
    });

    expect(result.shownViewer.trash.map((card) => card.instanceId)).toEqual(["older"]);
    expect(result.shownOpponent.trash).toHaveLength(0);
  });
});

/**
 * The reported white screen ("GameScreen-27dEPKEy.js: Cannot read properties of undefined
 * (reading 'length')" at `shownViewer.trash`): a seat arrives without a trash list, and the
 * board reads `.length` on it. The presentation hands the board seats it can always read.
 */
it("gives the board a trash list when the seat arrived without one", () => {
  const bare = (seat: 0 | 1) =>
    ({ seat, battleArea: [], hand: [], handCount: 0, deckCount: 30 }) as unknown as PlayerState;
  const shownState = { stateVersion: 3, players: [bare(0), bare(1)] } as unknown as GameState;

  const result = presentedSeats({
    shownState,
    viewer: bare(0),
    opponent: bare(1),
    viewerSeat: 0,
    heldPhaseState: undefined,
    heldBlowState: undefined,
    heldSecurityEffectState: undefined,
    heldDrawState: undefined,
    heldBreedingState: undefined,
    heldDeletions: new Map(),
    heldTrashArrivals: new Map(),
    optimisticPlayedInstanceId: undefined,
  });

  expect(result.shownViewer.trash).toEqual([]);
  expect(result.shownOpponent.trash).toEqual([]);
  expect(result.breedingViewer.trash).toEqual([]);
});
