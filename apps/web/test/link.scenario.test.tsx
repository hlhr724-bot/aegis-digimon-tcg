// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "./scenarioHarness/testingLibrary";
import { RED_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import {
  connectScenario,
  enterMain,
  ownBattle,
  passOpponentTurn,
  chooseHandPlay,
} from "./scenarioHarness/connectedGame";
import { resolveIncidentalDecisionsThroughUi } from "./scenarioHarness/decisions";
import { tap } from "./scenarioHarness/tap";

// BT21-041 Calendamon and BT21-009 Gatchmon both have [Appmon] and [Link] cost 1.
// Four copies replace the four same-position base-deck cards, preserving legality and
// the seed-76 opening arrangement used to exercise hand and field Link origins.
const PROTAGONIST_DECK = swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-013", "BT21-041"), "BT1-020", "BT21-009");
const SEED = 76;

scenario("link", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    cleanup();
    await server.close();
    vi.unstubAllEnvs();
  });

  it("links from hand and battle area, cancels without paying, and enforces the host's one-link limit", async () => {
    const { owner, opponent } = await connectScenario(server, PROTAGONIST_DECK, SEED);
    const player = () => opponent.room.state.players[0]!;
    const host = () => player().battleArea.find((permanent) => permanent.topCard.cardId === "BT21-041");
    const handImages = (name: RegExp) => within(screen.getByTestId("hand")).getAllByRole("img", { name });

    await enterMain(opponent);

    const calendamonImages = handImages(/^calendamon$/i);
    const calendamonInstances = [...owner.state.players[0]!.hand].filter((card) => card.cardId === "BT21-041");
    expect(calendamonImages.length).toBe(calendamonInstances.length);
    const calendamonInstanceId = calendamonInstances[0]!.instanceId;
    const handCountBeforePlay = player().handCount;
    const deckCountBeforePlay = player().deckCount;
    await chooseHandPlay(/^calendamon$/i);
    await vi.waitFor(
      () => {
        expect(host()?.topCard.instanceId).toBe(calendamonInstanceId);
        expect(player().handCount).toBe(handCountBeforePlay - 1);
        expect(player().deckCount).toBe(deckCountBeforePlay);
        expect(opponent.room.state.turnSeat).toBe(1);
      },
      { timeout: 10_000 },
    );

    await passOpponentTurn(opponent);
    await enterMain(opponent);
    expect(opponent.room.state.memory).toBe(3);
    const hostPermanentId = host()!.permanentId;

    // Arm a hand-origin Link, then cancel. Neither memory nor the selected physical card
    // changes, and Calendamon has no attached link yet.
    const gatchmonImages = handImages(/^gatchmon$/i);
    const gatchmonInstances = [...owner.state.players[0]!.hand].filter((card) => card.cardId === "BT21-009");
    expect(gatchmonImages.length).toBe(gatchmonInstances.length);
    const handLinkInstanceId = gatchmonInstances[0]!.instanceId;
    const handCountBeforeLink = player().handCount;
    const deckCountBeforeLink = player().deckCount;
    tap(gatchmonImages[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^link$/i }, { timeout: 10_000 }));
    await screen.findByRole("button", { name: /^cancel$/i }, { timeout: 10_000 });
    expect(opponent.room.state.memory).toBe(3);
    expect(host()!.linked).toHaveLength(0);
    expect(owner.state.players[0]!.hand.some((card) => card.instanceId === handLinkInstanceId)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(opponent.room.state.memory).toBe(3);
    expect(player().handCount).toBe(handCountBeforeLink);
    expect(player().deckCount).toBe(deckCountBeforeLink);
    expect(host()!.linked).toHaveLength(0);

    // The same instance is linked through the hand preview and then a tap on Calendamon.
    tap(handImages(/^gatchmon$/i)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^link$/i }, { timeout: 10_000 }));
    const hostElement = within(ownBattle())
      .getByRole("img", { name: /^calendamon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    tap(hostElement);
    await resolveIncidentalDecisionsThroughUi(opponent);
    await vi.waitFor(
      () => {
        expect(opponent.room.state.memory).toBe(2);
        expect(host()?.linked.map((card) => card.instanceId)).toEqual([handLinkInstanceId]);
        expect(player().handCount).toBe(handCountBeforeLink - 1);
      },
      { timeout: 10_000 },
    );
    expect(host()!.stack).toHaveLength(0);
    expect(host()!.currentDP).toBe(3000);
    expect(within(hostElement).getByRole("img", { name: /^gatchmon$/i })).toBeTruthy();

    // Play the second Gatchmon to the field. Its hand-origin Link card remains distinct;
    // the field card will become a second Link on the next owner turn.
    const secondGatchmon = [...owner.state.players[0]!.hand].find((card) => card.cardId === "BT21-009");
    expect(secondGatchmon).toBeDefined();
    const secondGatchmonInstanceId = secondGatchmon!.instanceId;
    const handCountBeforeSecondPlay = player().handCount;
    const deckCountBeforeSecondPlay = player().deckCount;
    await chooseHandPlay(/^gatchmon$/i);
    await vi.waitFor(
      () => {
        expect(player().battleArea.some((permanent) => permanent.topCard.instanceId === secondGatchmonInstanceId)).toBe(
          true,
        );
        expect(player().handCount).toBe(handCountBeforeSecondPlay - 1);
        expect(player().deckCount).toBe(deckCountBeforeSecondPlay);
        expect(opponent.room.state.turnSeat).toBe(1);
      },
      { timeout: 10_000 },
    );

    await passOpponentTurn(opponent);
    await enterMain(opponent);
    expect(opponent.room.state.memory).toBe(3);
    const sourcePermanent = player().battleArea.find(
      (permanent) => permanent.topCard.instanceId === secondGatchmonInstanceId,
    )!;
    expect(sourcePermanent.topCard.linkTargetPermanentIds).toContain(hostPermanentId);

    // Cancel the field-origin declaration too; its source permanent and the existing Link
    // stay intact and the Link cost is not paid.
    const sourceElement = () =>
      within(ownBattle())
        .getAllByRole("img", { name: /^gatchmon$/i })
        .map((image) => image.closest<HTMLElement>('[data-drop="perm-you"]'))
        .find((element) => element?.getAttribute("data-id") === sourcePermanent.permanentId)!;
    tap(sourceElement());
    fireEvent.click(await screen.findByRole("button", { name: /^link$/i }, { timeout: 10_000 }));
    await screen.findByRole("button", { name: /^cancel$/i }, { timeout: 10_000 });
    expect(opponent.room.state.memory).toBe(3);
    expect(player().battleArea.some((permanent) => permanent.topCard.instanceId === secondGatchmonInstanceId)).toBe(
      true,
    );
    expect(host()!.linked.map((card) => card.instanceId)).toEqual([handLinkInstanceId]);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(opponent.room.state.memory).toBe(3);

    // Declare the field-origin Link. Its card leaves its own permanent and joins Calendamon;
    // the existing Link is the sole legal card to trash at the base limit of one.
    tap(sourceElement());
    fireEvent.click(await screen.findByRole("button", { name: /^link$/i }, { timeout: 10_000 }));
    tap(hostElement);
    await resolveIncidentalDecisionsThroughUi(opponent);
    await vi.waitFor(
      () => {
        expect(opponent.room.state.memory).toBe(2);
        expect(host()?.linked.map((card) => card.instanceId)).toEqual([secondGatchmonInstanceId]);
        expect(player().trash.some((card) => card.instanceId === handLinkInstanceId)).toBe(true);
        expect(player().battleArea.some((permanent) => permanent.topCard.instanceId === secondGatchmonInstanceId)).toBe(
          false,
        );
      },
      { timeout: 10_000 },
    );
    expect(host()!.stack).toHaveLength(0);
    expect(host()!.currentDP).toBe(3000);
    expect(within(hostElement).getByRole("img", { name: /^gatchmon$/i })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /^gatchmon$/i })).toHaveLength(1);

    await opponent.leave();
  }, 60_000);
});
