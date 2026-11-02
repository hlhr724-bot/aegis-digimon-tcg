// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { RED_DECK } from "@aegis-api/engine/testDecks.js";
import { cleanup, fireEvent, screen, within } from "./scenarioHarness/testingLibrary";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import {
  chooseHandPlay,
  connectScenario,
  enterMain,
  finishTriggeredTurn,
  ownBattle,
  passOpponentTurn,
} from "./scenarioHarness/connectedGame";
import { decisionCandidates, findDecisionSurface } from "./scenarioHarness/decisions";
import { tap } from "./scenarioHarness/tap";
import { findEndBreedingControl, waitForBoardActions } from "./scenarioHarness/breedingStep";

const DECK = swapMainDeckCard(
  swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-013", "EX11-069"), "BT1-020", "BT26-014"),
  "BT1-021",
  "BT26-013",
);

scenario("assembly", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await server.close();
  });

  it("cancels without consuming trash then assembles the exact material for the reduced cost", async () => {
    // Seed 260: Yuuki, Musyamon, two Darumamon and Biyomon. Yuuki puts the
    // material in trash through an ordinary paid effect before Assembly is offered.
    const { owner, opponent } = await connectScenario(server, DECK, 260);
    await enterMain(opponent);
    const player = owner.state.players[0]!;
    const materialId = player.hand.find((card) => card.cardId === "BT26-013")!.instanceId;
    const assembledId = player.hand.find((card) => card.cardId === "BT26-014")!.instanceId;
    await chooseHandPlay(/^yuuki$/i);
    const costSurface = await findDecisionSurface();
    const costId = owner.state.pendingDecision!.decisionId;
    const material = decisionCandidates(costSurface).find(
      (card) => card.getAttribute("data-hand-instance-id") === materialId,
    );
    expect(material).toBeTruthy();
    fireEvent.click(material!);
    fireEvent.click(within(costSurface).getByRole("button", { name: /^end selection$/i }));
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision?.decisionId).not.toBe(costId), {
      timeout: 10_000,
    });
    await finishTriggeredTurn(opponent);
    await vi.waitFor(() => expect(player.trash.map((card) => card.instanceId)).toContain(materialId), {
      timeout: 10_000,
    });
    await passOpponentTurn(opponent);
    fireEvent.click(await findEndBreedingControl());
    // Yuuki's optional hand cost may be declined beside the highlighted hand.
    const surface = await findDecisionSurface();
    fireEvent.click(within(surface).getByRole("button", { name: /^no selection$/i }));
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision).toBeUndefined(), { timeout: 10_000 });
    await waitForBoardActions();
    const memoryBefore = owner.state.memory;
    const handBefore = player.handCount;
    const trashBefore = player.trash.map((card) => card.instanceId);
    await chooseHandPlay(/^darumamon$/i);
    let dialog = await screen.findByRole("dialog");
    let confirm = within(dialog).getByRole("button", { name: /^assembly \(1 cards\)$/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: /^musyamon \(trash\)$/i }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(player.trash.map((card) => card.instanceId)).toEqual(trashBefore);
    expect(player.handCount).toBe(handBefore);
    expect(owner.state.memory).toBe(memoryBefore);
    expect(player.battleArea.some((permanent) => permanent.topCard.instanceId === assembledId)).toBe(false);

    await chooseHandPlay(/^darumamon$/i);
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^musyamon \(trash\)$/i }));
    confirm = within(dialog).getByRole("button", { name: /^assembly \(1 cards\)$/i });
    fireEvent.click(confirm);
    await finishTriggeredTurn(opponent);
    await vi.waitFor(
      () => {
        const assembled = player.battleArea.find((permanent) => permanent.topCard.instanceId === assembledId);
        expect(assembled?.stack.map((card) => card.instanceId)).toEqual([materialId]);
        expect(player.trash.some((card) => card.instanceId === materialId)).toBe(false);
        expect(player.handCount).toBe(handBefore - 1);
        expect(owner.state.memory).toBe(5 - memoryBefore);
      },
      { timeout: 10_000 },
    );
    await screen.findByRole("img", { name: new RegExp(`^memory: -${5 - memoryBefore}$`, "i") }, { timeout: 10_000 });
    const result = within(ownBattle())
      .getByRole("img", { name: /^darumamon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(within(result).getByText("×1")).toBeTruthy();
    tap(result);
    expect(
      within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", {
        name: /^musyamon$/i,
      }),
    ).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
