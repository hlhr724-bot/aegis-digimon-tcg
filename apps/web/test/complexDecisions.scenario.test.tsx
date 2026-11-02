// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep, endTurnStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";
import { findDecisionSurface } from "./scenarioHarness/decisions";
import { EVENT_CHANNEL, type SequencedServerEvent } from "@aegis/shared";

function replaceCopies(deck: typeof BLUE_DECK, from: string, to: string, count: number) {
  const mainDeck = [...deck.mainDeck];
  for (let copy = 0; copy < count; copy += 1) {
    const index = mainDeck.indexOf(from);
    if (index < 0) throw new Error(`Missing ${from} in source deck`);
    mainDeck[index] = to;
  }
  return { mainDeck, eggDeck: [...deck.eggDeck] };
}

function distinctPermanentButtons(container: HTMLElement, name: RegExp) {
  const fieldSelection = container.getAttribute("data-variant") === "field-selection";
  const candidates = fieldSelection ? (document.querySelector(".game-battle-row--opp") as HTMLElement) : container;
  const buttons = within(candidates).getAllByRole("button", { name });
  const byPermanentId = new Map<string, HTMLElement>();
  for (const button of buttons) {
    const id =
      button.getAttribute("data-instance-id") ?? button.closest('[data-drop="perm-opp"]')?.getAttribute("data-id");
    if (id && !byPermanentId.has(id)) byPermanentId.set(id, button);
  }
  return [...byPermanentId.entries()];
}

const BLUE_TARGET_DECK = replaceCopies(BLUE_DECK, "BT1-096", "BT2-095", 4);
const BLUE_TRAINING_TARGET_DECK = replaceCopies(BLUE_DECK, "BT1-096", "BT26-023", 2);
// Reorder only the fixture's existing Red deck instances. Seed 5684466 then deals three
// legal BT1-009 copies to the opponent's opening hand and the fourth as its first draw.
// This keeps the card multiset unchanged while making the four-target maximum deterministic.
const redTargetMainDeck = [...RED_DECK.mainDeck];
[redTargetMainDeck[16], redTargetMainDeck[0]] = [redTargetMainDeck[0]!, redTargetMainDeck[16]!];
[redTargetMainDeck[40], redTargetMainDeck[2]] = [redTargetMainDeck[2]!, redTargetMainDeck[40]!];
const RED_TARGET_DECK = { mainDeck: redTargetMainDeck, eggDeck: [...RED_DECK.eggDeck] };
const RED_WARGROWLMON_DECK = {
  mainDeck: RED_DECK.mainDeck.map((cardId, index) =>
    cardId === "BT1-025" && index === RED_DECK.mainDeck.indexOf("BT1-025") ? "EX2-010" : cardId,
  ),
  eggDeck: [...RED_DECK.eggDeck],
};

scenario("complex-decisions", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(() => cleanup());

  afterAll(async () => {
    cleanup();
    await server.close();
    vi.unstubAllEnvs();
  });

  it("confirms zero and maximum three from four same-name targets through the UI", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: BLUE_TARGET_DECK,
      seed: 5684466,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Blue" startMode="casual" onExit={() => {}} />);
    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: RED_TARGET_DECK,
    });
    opponent.onDecision((request) => {
      if (request.kind === "mulligan") opponent.mulligan(true);
    });
    opponent.ready();
    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    // Seat 0's seed-5684466 opening has a blue Digimon and two Rivers of Power. Play the
    // Digimon through the UI so the real blue Option color requirement is met.
    await endBreedingStep();
    const [blueDigimon] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /armadillomon/i });
    tap(blueDigimon!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () =>
        expect(
          document.querySelector('[data-drop="battle-you"]')?.querySelector("img[alt='Armadillomon']"),
        ).not.toBeNull(),
      {
        timeout: 10_000,
      },
    );

    // The opponent's seed-5684466 opening has real BT1-009 Monodramon cards.
    // Playing them with the headless client uses ordinary room intents.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    for (let count = 0; count < 2; count += 1) {
      const card = opponent.room.state.players[1]!.hand.find(({ cardId }) => cardId === "BT1-009");
      expect(card).toBeDefined();
      opponent.playCard(card!.instanceId);
      await vi.waitFor(() => expect(opponent.room.state.players[1]!.battleArea).toHaveLength(count + 1), {
        timeout: 10_000,
      });
    }

    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    await endBreedingStep();
    const opponentZonesBeforeZeroTarget =
      opponent.room.state.players[1]!.handCount + opponent.room.state.players[1]!.deckCount;
    const firstOption = within(screen.getByTestId("hand")).getAllByRole("img", { name: /river of power/i })[0]!;
    tap(firstOption);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    const firstPrompt = await findDecisionSurface();
    expect(within(firstPrompt).getByText(/return up to 3/i)).toBeTruthy();
    const firstTargets = opponent.room.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    const firstTargetInstances = opponent.room.state.players[1]!.battleArea.map(({ topCard }) => topCard!.instanceId);
    expect(firstTargets).toHaveLength(2);
    const firstCandidateButtons = distinctPermanentButtons(firstPrompt, /monodramon/i);
    expect(firstCandidateButtons.map(([id]) => id).sort()).toEqual([...firstTargets].sort());
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision?.kind).toBe("chooseTargets"), {
      timeout: 10_000,
    });
    const firstDecisionId = opponent.room.state.pendingDecision!.decisionId;

    // “Up to 3” permits choosing zero. Confirming zero consumes the played
    // Option but leaves both eligible permanents and their exact identities alone.
    fireEvent.click(within(firstPrompt).getByRole("button", { name: /^pass$/i }));
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision?.decisionId).not.toBe(firstDecisionId), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => {
        expect(opponent.room.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(firstTargets);
        expect(opponent.room.state.players[1]!.battleArea.map(({ topCard }) => topCard!.instanceId)).toEqual(
          firstTargetInstances,
        );
        expect(opponent.room.state.players[1]!.handCount + opponent.room.state.players[1]!.deckCount).toBe(
          opponentZonesBeforeZeroTarget,
        );
        expect(
          opponent.room.state.players[1]!.hand.some(({ instanceId }) => firstTargetInstances.includes(instanceId)),
        ).toBe(false);
      },
      { timeout: 10_000 },
    );

    // Add two more duplicate-name cards on ordinary future turns, one per turn.
    // Passing and playing are driven by the headless client's real room intents.
    for (let added = 0; added < 2; added += 1) {
      if (opponent.room.state.turnSeat !== 1) {
        await endTurnStep(10_000);
        await waitForTurnSeat(opponent, 1);
      }
      if (opponent.room.state.phase === "Breeding") opponent.endPhase();
      await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
      const card = opponent.room.state.players[1]!.hand.find(({ cardId }) => cardId === "BT1-009");
      expect(card).toBeDefined();
      const battleCount = opponent.room.state.players[1]!.battleArea.length;
      opponent.playCard(card!.instanceId);
      await vi.waitFor(() => expect(opponent.room.state.players[1]!.battleArea).toHaveLength(battleCount + 1), {
        timeout: 10_000,
      });
      if (opponent.room.state.turnSeat === 1) {
        opponent.endPhase();
        await waitForTurnSeat(opponent, 0);
      }
      if (added === 0) {
        await endBreedingStep();
        await waitForOwnMain(opponent);
        await endTurnStep(10_000);
        await waitForTurnSeat(opponent, 1);
      }
    }

    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    await endBreedingStep();
    await waitForOwnMain(opponent);
    const opponentZonesBeforeMaximum =
      opponent.room.state.players[1]!.handCount + opponent.room.state.players[1]!.deckCount;
    const secondOption = within(screen.getByTestId("hand")).getByRole("img", { name: /river of power/i });
    tap(secondOption);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    const maximumPrompt = await findDecisionSurface();
    const candidateButtons = distinctPermanentButtons(maximumPrompt, /monodramon/i);
    expect(candidateButtons).toHaveLength(4);
    const candidateIds = candidateButtons.map(([id]) => id);
    expect(new Set(candidateIds).size).toBe(4);
    const initialSelectedIds = candidateIds.slice(0, 3);
    const fourthCandidateId = candidateIds[3];
    const candidateInstanceIds = new Map(
      opponent.room.state.players[1]!.battleArea.map(({ permanentId, topCard }) => [permanentId, topCard!.instanceId]),
    );
    const candidateInstanceIdSet = new Set(candidateInstanceIds.values());
    for (const id of initialSelectedIds) {
      const target = candidateButtons.find(([candidateId]) => candidateId === id)?.[1];
      expect(target).toBeDefined();
      tap(target!);
    }
    expect(within(maximumPrompt).getByText(/^3 selected of 0–3$/i)).toBeTruthy();
    const fourthCandidate = candidateButtons.find(([id]) => id === fourthCandidateId)?.[1];
    expect(fourthCandidate).toBeDefined();
    tap(fourthCandidate!);
    expect(within(maximumPrompt).getByText(/^3 selected of 0–3$/i)).toBeTruthy();
    // At the cap the field picker keeps the earlier three and ignores the fourth
    // eligible target, so the fourth Monodramon is the one left on the field.
    const selectedIds = initialSelectedIds;
    const survivorId = fourthCandidateId;
    const confirmMaximum = within(maximumPrompt).getByRole("button", { name: /confirm targets/i });
    await vi.waitFor(() => expect(confirmMaximum.hasAttribute("disabled")).toBe(false), { timeout: 10_000 });
    fireEvent.click(confirmMaximum);

    await vi.waitFor(
      () => {
        const opponentState = opponent.room.state.players[1]!;
        expect(opponentState.battleArea.map(({ permanentId }) => permanentId)).toEqual([survivorId]);
        expect(
          opponentState.hand
            .map(({ instanceId }) => instanceId)
            .filter((id) => candidateInstanceIdSet.has(id))
            .sort(),
        ).toEqual(selectedIds.map((id) => candidateInstanceIds.get(id)).sort());
        expect(opponentState.battleArea[0]!.topCard!.instanceId).toBe(candidateInstanceIds.get(survivorId!));
        expect(opponentState.handCount + opponentState.deckCount).toBe(opponentZonesBeforeMaximum + 3);
      },
      { timeout: 10_000 },
    );
    const opponentBattle = document.querySelector(".game-battle-row--opp") as HTMLElement | null;
    expect(opponentBattle).toBeTruthy();
    expect(within(opponentBattle!).getAllByRole("img", { name: /monodramon/i })).toHaveLength(1);
    expect(
      within(opponentBattle!)
        .getByRole("img", { name: /monodramon/i })
        .closest('[data-drop="perm-opp"]')
        ?.getAttribute("data-id"),
    ).toBe(survivorId);

    await opponent.leave();
  }, 90_000);

  it("clears a deleted attack target before battle and accepts the next legal action", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: RED_WARGROWLMON_DECK,
      seed: 19246,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);
    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: BLUE_TRAINING_TARGET_DECK,
    });
    const optionalDecisionIds: string[] = [];
    opponent.onDecision((request) => {
      if (request.kind === "mulligan") opponent.mulligan(true);
      if (request.kind === "optional") {
        optionalDecisionIds.push(request.decisionId);
        opponent.respondDecision(request.decisionId, { kind: "optional", accept: false });
      }
    });
    const resolvedCombats: string[] = [];
    const securityChecks: string[] = [];
    opponent.room.onMessage<SequencedServerEvent>(EVENT_CHANNEL, (event) => {
      if (event.kind === "combatResolved") resolvedCombats.push(event.attackerPermanentId ?? "");
      if (event.kind === "securityChecked") securityChecks.push(event.kind);
    });
    opponent.ready();
    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    // Seed 19246 gives the protagonist BT1-016 and WarGrowlmon. Playing the printed
    // WarGrowlmon through the action bar creates the real When Attacking source.
    await endBreedingStep();
    const warGrowlmon = await screen.findByRole("img", { name: /wargrowlmon/i }, { timeout: 10_000 });
    tap(warGrowlmon);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    const yourBattle = document.querySelector('[data-drop="battle-you"]') as HTMLElement;
    await vi.waitFor(() => expect(within(yourBattle).getAllByRole("img", { name: /wargrowlmon/i })).toHaveLength(1), {
      timeout: 10_000,
    });
    const warGrowlmonId = opponent.room.state.players[0]!.battleArea[0]!.permanentId;

    // The opposing Blue deck has two real BT26-023 Mojyamon copies. They are
    // played through room intents; the first then uses its printed Training
    // keyword through a valid activateEffect intent to suspend itself.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const playMojyamonIfAvailable = async () => {
      const card = opponent.room.state.players[1]!.hand.find(({ cardId }) => cardId === "BT26-023");
      if (!card) return false;
      const optionalCountBefore = optionalDecisionIds.length;
      const before = opponent.room.state.players[1]!.battleArea.length;
      opponent.playCard(card.instanceId);
      await vi.waitFor(() => expect(opponent.room.state.players[1]!.battleArea).toHaveLength(before + 1), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(optionalDecisionIds.length).toBeGreaterThan(optionalCountBefore), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(opponent.room.state.pendingDecision).toBeUndefined(), { timeout: 10_000 });
      return true;
    };
    expect(await playMojyamonIfAvailable()).toBe(true);
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(1);
        expect(opponent.room.state.phase).toBe("Main");
        const entries = JSON.parse(opponent.room.state.players[1]!.battleArea[0]!.activatableEffectsJson || "[]") as {
          description: string;
        }[];
        expect(entries.some(({ description }) => /training/i.test(description))).toBe(true);
      },
      { timeout: 10_000 },
    );
    const suspendedTarget = opponent.room.state.players[1]!.battleArea.find(
      ({ topCard }) => topCard?.cardId === "BT26-023",
    )!;
    const suspendedTargetId = suspendedTarget.permanentId;
    const suspendedTargetInstanceId = suspendedTarget.topCard!.instanceId;
    const trainingEntries = JSON.parse(suspendedTarget!.activatableEffectsJson || "[]") as {
      instanceId: string;
      effectKey: string;
      description: string;
    }[];
    const training = trainingEntries.find(({ description }) => /training/i.test(description));
    expect(training).toBeDefined();
    opponent.room.send("activateEffect", { sourceInstanceId: training!.instanceId, effectKey: training!.effectKey });
    await vi.waitFor(
      () =>
        expect(
          opponent.room.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === suspendedTargetId)
            ?.isSuspended,
        ).toBe(true),
      {
        timeout: 10_000,
      },
    );
    expect(await playMojyamonIfAvailable()).toBe(true);
    await vi.waitFor(
      () =>
        expect(
          opponent.room.state.players[1]!.battleArea.filter(({ topCard }) => topCard?.cardId === "BT26-023"),
        ).toHaveLength(2),
      { timeout: 10_000 },
    );
    const survivingTarget = opponent.room.state.players[1]!.battleArea.find(
      ({ topCard, permanentId }) => topCard?.cardId === "BT26-023" && permanentId !== suspendedTargetId,
    )!;
    const survivorPermanentId = survivingTarget.permanentId;
    const survivorInstanceId = survivingTarget.topCard!.instanceId;
    opponent.endPhase();

    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    await endBreedingStep();
    await waitForOwnMain(opponent);
    const attackedTargetId = suspendedTargetId;
    const attackedTargetInstanceId = suspendedTargetInstanceId;
    const securityBefore = opponent.room.state.players[1]!.securityCount;

    const warGrowlmonPermanent = within(yourBattle)
      .getByRole("img", { name: /wargrowlmon/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    tap(warGrowlmonPermanent);
    fireEvent.click(await screen.findByRole("button", { name: /^attack$/i }));
    const opponentBattle = document.querySelector(".game-battle-row--opp") as HTMLElement;
    const attackTarget = opponentBattle.querySelector(
      `[data-drop="perm-opp"][data-id="${attackedTargetId}"]`,
    ) as HTMLElement;
    fireEvent.click(attackTarget);

    const deletionPrompt = await findDecisionSurface();
    const deletionCandidates = distinctPermanentButtons(deletionPrompt, /mojyamon/i);
    expect(deletionCandidates).toHaveLength(2);
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision?.kind).toBe("chooseTargets"), {
      timeout: 10_000,
    });
    const exactTargetButton = deletionCandidates.find(([id]) => id === attackedTargetId)?.[1];
    expect(exactTargetButton).toBeDefined();
    tap(exactTargetButton!);
    fireEvent.click(within(deletionPrompt).getByRole("button", { name: /confirm targets/i }));

    await vi.waitFor(
      () => {
        const own = opponent.room.state.players[0]!;
        const defending = opponent.room.state.players[1]!;
        expect(defending.battleArea.some(({ permanentId }) => permanentId === attackedTargetId)).toBe(false);
        expect(defending.trash.some(({ instanceId }) => instanceId === attackedTargetInstanceId)).toBe(true);
        expect(
          defending.battleArea.some(
            ({ permanentId, topCard }) =>
              permanentId === survivorPermanentId && topCard?.instanceId === survivorInstanceId,
          ),
        ).toBe(true);
        expect(own.battleArea.find(({ permanentId }) => permanentId === warGrowlmonId)?.isSuspended).toBe(true);
        expect(defending.securityCount).toBe(securityBefore);
        expect(opponent.room.state.combatWindow).toBeUndefined();
        expect(opponent.room.state.pendingDecision).toBeUndefined();
        expect(resolvedCombats).not.toContain(warGrowlmonId);
        expect(securityChecks).toHaveLength(0);
      },
      { timeout: 10_000 },
    );
    await vi.waitFor(() => expect(screen.queryByTestId("board-prompt")).toBeNull(), { timeout: 10_000 });
    expect(within(opponentBattle).queryByRole("img", { name: /mojyamon/i })).toBeTruthy();
    expect(opponentBattle.querySelector(`[data-drop="perm-opp"][data-id="${attackedTargetId}"]`)).toBeNull();
    expect(opponentBattle.querySelector(`[data-drop="perm-opp"][data-id="${survivorPermanentId}"]`)).not.toBeNull();
    const renderedWarGrowlmon = within(yourBattle)
      .getByRole("img", { name: /wargrowlmon/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(renderedWarGrowlmon.querySelector('[data-state="suspended"]')).not.toBeNull();

    // A fresh ordinary UI action succeeds after the abandoned attack timing; this
    // catches stale attacker/target selection left behind by the earlier choice.
    const tyrannomon = await screen.findByRole("img", { name: /^tyrannomon$/i }, { timeout: 10_000 });
    tap(tyrannomon);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(() => expect(within(yourBattle).getByRole("img", { name: /^tyrannomon$/i })).toBeTruthy(), {
      timeout: 10_000,
    });

    await opponent.leave();
  }, 90_000);
});

async function waitForOwnMain(opponent: Awaited<ReturnType<typeof joinHeadlessOpponent>>) {
  await vi.waitFor(
    () => {
      expect(opponent.room.state.turnSeat).toBe(0);
      expect(opponent.room.state.phase).toBe("Main");
    },
    { timeout: 10_000 },
  );
}

async function waitForTurnSeat(opponent: Awaited<ReturnType<typeof joinHeadlessOpponent>>, seat: 0 | 1) {
  await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(seat), { timeout: 10_000 });
}
