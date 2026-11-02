// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { matchMaker } from "colyseus";
import type { GameState } from "@aegis/shared";
import { RED_DECK } from "@aegis-api/engine/testDecks.js";
import { cleanup, fireEvent, screen, within } from "./scenarioHarness/testingLibrary";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import {
  chooseHandPlay,
  connectScenario,
  enterMain,
  ownBattle,
  passOpponentTurn,
} from "./scenarioHarness/connectedGame";
import { tap } from "./scenarioHarness/tap";

const DECK = swapMainDeckCard(
  swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-013", "BT10-013"), "BT1-020", "BT5-009"),
  "BT1-021",
  "BT10-049",
);

scenario("digi-xros-materials", () => {
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

  it.each(["hand", "battle area"] as const)(
    "orders two selected materials from %s by the printed recipe",
    async (zone) => {
      // Seed 314 opens two Shoutmon, Ballistamon, Shoutmon X5 and Biyomon.
      const { owner, opponent } = await connectScenario(server, DECK, 314);
      await enterMain(opponent);
      const player = owner.state.players[0]!;
      const shoutmonIds = player.hand.filter((card) => card.cardId === "BT5-009").map((card) => card.instanceId);
      expect(shoutmonIds).toHaveLength(2);
      const ballistamonId = player.hand.find((card) => card.cardId === "BT10-049")!.instanceId;
      const xrosId = player.hand.find((card) => card.cardId === "BT10-013")!.instanceId;
      if (zone === "battle area") {
        await chooseHandPlay(/^ballistamon$/i);
        await vi.waitFor(
          () =>
            // eslint-disable-next-line vitest/no-conditional-expect -- this parameterized branch first plays its field material.
            expect(player.battleArea.some((permanent) => permanent.topCard.instanceId === ballistamonId)).toBe(true),
          { timeout: 10_000 },
        );
        await passOpponentTurn(opponent);
        await enterMain(opponent);
      }
      const handBefore = player.handCount;
      const memoryBefore = owner.state.memory;
      await chooseHandPlay(/^shoutmon x5$/i);
      const dialog = await screen.findByRole("dialog");
      expect(
        (within(dialog).getByRole("button", { name: /digixros \(0 cards\)/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
      // Pick the right-hand recipe slot first. Input order must not become stack order.
      fireEvent.click(within(dialog).getByRole("button", { name: /^ballistamon \(/i }));
      const shoutmonButtons = within(dialog).getAllByRole("button", { name: /^shoutmon \(/i });
      fireEvent.click(shoutmonButtons[0]!);
      expect((shoutmonButtons[1] as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(shoutmonButtons[1]!);
      expect(shoutmonButtons[1]!.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(within(dialog).getByRole("button", { name: /digixros \(2 cards\)/i }));

      await vi.waitFor(
        () => {
          const serverState = matchMaker.getLocalRoomById(owner.roomId)!.state as GameState;
          const serverPlayed = serverState.players[0]!.battleArea.find(
            (permanent) => permanent.topCard.instanceId === xrosId,
          );
          expect(serverPlayed?.stack.map((card) => card.instanceId)).toEqual([ballistamonId, shoutmonIds[0]]);
          const played = player.battleArea.find((permanent) => permanent.topCard.instanceId === xrosId);
          expect(played).toBeDefined();
          expect(played!.stack.map((card) => card.instanceId)).toEqual([ballistamonId, shoutmonIds[0]]);
          expect(player.battleArea.some((permanent) => permanent.topCard.instanceId === ballistamonId)).toBe(false);
          expect(player.hand.some((card) => card.instanceId === shoutmonIds[0])).toBe(false);
          expect(player.hand.some((card) => card.instanceId === shoutmonIds[1])).toBe(true);
          expect(player.trash.some((card) => [ballistamonId, shoutmonIds[0]].includes(card.instanceId))).toBe(false);
          expect(player.handCount).toBe(handBefore - (zone === "hand" ? 3 : 2));
          expect(owner.state.turnSeat).toBe(1);
          expect(owner.state.memory).toBe(6 - memoryBefore);
        },
        { timeout: 10_000 },
      );
      await screen.findByRole("img", { name: new RegExp(`^memory: -${6 - memoryBefore}$`, "i") }, { timeout: 10_000 });
      const result = within(ownBattle())
        .getByRole("img", { name: /^shoutmon x5$/i })
        .closest('[data-drop="perm-you"]') as HTMLElement;
      expect(within(result).getByText("×2")).toBeTruthy();
      tap(result);
      expect(
        within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", {
          name: /^shoutmon$/i,
        }),
      ).toBeTruthy();
      expect(
        within(screen.getByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", { name: /^ballistamon$/i }),
      ).toBeTruthy();
      await opponent.leave();
    },
    45_000,
  );
});
