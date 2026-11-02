// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { hatchDigiEgg } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

// BT10-095 "Hero of the Skies!" (Red Option, playCost 2): printed "[Main] Activate 1
// of the effects below. ・1 of your Digimon with [Xros Heart] gains <Security Attack
// +1> ・<Draw 2>". Its IR (apps/api/src/cards/BT10/BT10-095.ts) compiles this as a
// `Modal` action (choose 1 of 2), offered unconditionally regardless of whether the
// controller has a Xros Heart Digimon — playing it always raises a real
// "chooseOption" decision. Swapped 1:1 for RED_DECK's BT1-090 (Gravity Crush, count
// 1 — within BT10-095's maxCountInDeck of 4) so the deck stays legal and the swap
// lands in the array slot BT1-090 held under the shuffle.
const PROTAGONIST_DECK = swapMainDeckCard(RED_DECK, "BT1-090", "BT10-095");

scenario("modal-choice", () => {
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

  it("choosing the Draw 2 mode from Hero of the Skies! draws 2 cards", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 284: seat 0 (protagonist) goes first and its dealt opening hand includes
    // BT10-095 — found by exhaustively searching seeds for the swapped RED_DECK,
    // mirroring mulligan.scenario.test.tsx's seed-4 search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 284,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);

    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck },
    });
    opponent.onDecision((req) => {
      if (req.kind === "mulligan") opponent.mulligan(true);
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    // §4-21-2: playing an Option needs a Digimon or Tamer of its own color already
    // on the field. A Digi-Egg card alone is not a Digimon, so hatch and then
    // digivolve a Red Lv.3 in the breeding area before using Hero of the Skies!.
    await hatchDigiEgg();
    await screen.findByRole("img", { name: /yokomon|bebydomon/i }, { timeout: 10_000 });

    const yourBreedingSlot = () => document.querySelector('[data-drop="breeding-you"]') as HTMLElement;
    const [rookieImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /monodramon|biyomon/i });
    tap(rookieImg!);
    fireEvent.click(yourBreedingSlot());
    const confirmation = await screen.findByRole("dialog", { name: "Confirm action" });
    fireEvent.click(within(confirmation).getByRole("button", { name: /^digivolve$/i }));
    await vi.waitFor(
      () => expect(within(yourBreedingSlot()).getByRole("img", { name: /monodramon|biyomon/i })).toBeTruthy(),
      { timeout: 10_000 },
    );

    // The dealt hand's other 4 cards are the "before" snapshot — after drawing 2
    // via the modal, the hand should show these 4 plus 2 new cards.
    const handBefore = within(screen.getByTestId("hand"))
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt"));
    expect(handBefore).toContain("Hero of the Skies!");

    const [heroImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /hero of the skies/i });
    tap(heroImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    // Playing it opens a real "chooseOption" decision — the DecisionOverlay's
    // isChoose branch renders one button per option, no accept/decline pair.
    const dialog = await screen.findByRole("dialog", {}, { timeout: 10_000 });
    const drawOption = within(dialog).getByRole("button", { name: /draw/i });
    fireEvent.click(drawOption);

    // Choosing "Draw 2" resolves immediately (no further decision) and the hand
    // grows by 2 cards, replacing Hero of the Skies! (now played and gone) with
    // the 4 original cards plus 2 freshly drawn ones (6 total).
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 10_000 });
    await vi.waitFor(
      () => {
        const handAfter = within(screen.getByTestId("hand"))
          .getAllByRole("img")
          .map((img) => img.getAttribute("alt"));
        expect(handAfter).toHaveLength(6);
        expect(handAfter).not.toContain("Hero of the Skies!");
        for (const card of handBefore.filter((c) => c !== "Hero of the Skies!")) {
          expect(handAfter).toContain(card);
        }
      },
      { timeout: 10_000 },
    );

    await opponent.leave();
  }, 20_000);
});
