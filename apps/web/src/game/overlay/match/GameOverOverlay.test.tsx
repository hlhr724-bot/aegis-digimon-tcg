import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import { UsedDeckDialog } from "@/game/UsedDeckDialog";
import { DECKS, copyDeckPreset, type DeckListing } from "@/game/decks";
import { saveDecks, loadDecks } from "@/identity";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../../i18n";
import { GameOverOverlay } from "./GameOverOverlay";
import type { SeriesView } from "../../seriesModel";
import type { RematchStage } from "@/game/getRematchView";
import { RematchMode } from "@aegis/shared/protocol/RematchMode";

afterEach(cleanup);

function renderOverlay(cardsRevealed = false) {
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[{ value: 7, label: "Turns" }]}
        cardsRevealed={cardsRevealed}
        onMenu={() => {}}
        onRematch={() => {}}
      />
    </I18nProvider>,
  );
}

describe("chatting from the result", () => {
  it("toggles the match chat and shows how many messages are unread", () => {
    const onToggle = vi.fn<() => void>();
    render(
      <I18nProvider>
        <GameOverOverlay
          result="loss"
          reason="surrender"
          stats={[]}
          onMenu={() => {}}
          onRematch={() => {}}
          chat={{ open: false, unread: 2, onToggle }}
        />
      </I18nProvider>,
    );

    const chatButton = screen.getByRole("button", { name: "Chat, 2 unread" });
    expect(chatButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chatButton);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("offers no chat when the match has no live chat", () => {
    renderOverlay();

    expect(screen.queryByTestId("game-result-chat")).toBeNull();
  });
});

describe("reviewing the board after the match", () => {
  it("folds the result into a bar and brings it back", () => {
    renderOverlay();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Victory");

    fireEvent.click(screen.getByRole("button", { name: "Show result" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find rematch" })).toBeTruthy();
  });
});

describe("viewing the used deck from the result", () => {
  it("hides the result behind the deck and leaves the board in review once the deck closes", () => {
    render(
      <I18nProvider>
        <GameOverOverlay
          result="win"
          reason="security"
          stats={[{ value: 7, label: "Turns" }]}
          onMenu={() => {}}
          onRematch={() => {}}
          usedDeckDialog={(onClose) => (
            <div role="dialog" aria-label="Used deck">
              <button type="button" onClick={onClose}>
                Close deck
              </button>
            </div>
          )}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Your deck" }));
    expect(screen.getAllByRole("dialog").map((dialog) => dialog.getAttribute("aria-label"))).toEqual(["Used deck"]);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close deck" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Victory");

    fireEvent.click(screen.getByRole("button", { name: "Show result" }));
    expect(screen.getByRole("button", { name: "Find rematch" })).toBeTruthy();
  });
});

describe("revealed cards hint", () => {
  it("points at the piles only once the server revealed them", () => {
    renderOverlay(true);
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    expect(screen.getByRole("status").textContent).toContain("Click a pile to see its cards");
  });
});

describe("best-of-three result", () => {
  const view = (fields: Partial<SeriesView>): SeriesView => ({
    bestOf: 3,
    gameNumber: 1,
    viewerWins: 0,
    opponentWins: 1,
    pips: ["loss", "pending", "pending"],
    stage: "choosing",
    viewerChooses: true,
    choiceSecondsLeft: 18,
    viewerGoesFirst: undefined,
    viewerDeckReady: false,
    opponentDeckReady: false,
    opponentDeckChanged: false,
    outcome: undefined,
    endReason: "",
    ...fields,
  });

  function renderSeries(fields: Partial<SeriesView>) {
    const calls: string[] = [];
    render(
      <I18nProvider>
        <GameOverOverlay
          result="loss"
          reason="security"
          stats={[]}
          onMenu={() => calls.push("menu")}
          onRematch={() => calls.push("rematch")}
          series={{
            view: view(fields),
            opponentName: "Nova",
            onChooseTurnOrder: (goFirst) => calls.push(goFirst ? "first" : "second"),
            onLeave: () => calls.push("leave"),
          }}
        />
      </I18nProvider>,
    );
    return calls;
  }

  it("lets the loser pick the turn order and leave, without the rematch actions", () => {
    const calls = renderSeries({});
    expect(screen.getByText("Game 1 of 3 · complete")).toBeTruthy();
    expect(screen.getByText("Picks Go first in 00:18")).toBeTruthy();
    expect(screen.getByText("Game 1: lost")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Find rematch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go second" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave series" }));
    expect(calls).toEqual(["second", "leave"]);
  });

  it("tells the winner who is choosing", () => {
    renderSeries({ viewerChooses: false, viewerWins: 1, opponentWins: 0, pips: ["win", "pending", "pending"] });
    expect(screen.getByText("Nova is choosing who goes first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go first" })).toBeNull();
  });

  it("announces who starts the next game", () => {
    renderSeries({ stage: "starting", viewerChooses: false, viewerGoesFirst: false });
    expect(screen.getByText("Game 2 · Nova goes first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave series" })).toBeNull();
  });

  it("ends with the series result and the usual actions", () => {
    const calls = renderSeries({
      stage: "over",
      outcome: "win",
      endReason: "won",
      viewerWins: 2,
      opponentWins: 1,
      pips: ["loss", "win", "win"],
    });
    expect(screen.getByText("Series won")).toBeTruthy();
    expect(screen.getByText("Series complete")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find rematch" }));
    expect(calls).toEqual(["rematch"]);
  });

  it("explains a forfeit from the winner's side", () => {
    renderSeries({ stage: "over", outcome: "win", endReason: "forfeit", viewerWins: 1, opponentWins: 0 });
    expect(screen.getByText("Nova left the series.")).toBeTruthy();
  });
});

describe("rematch after a best-of-one", () => {
  function renderRematch(
    stage: RematchStage,
    series?: SeriesView,
    mode: RematchMode = RematchMode.NEW_SERIES.value,
    modes: RematchMode[] = [RematchMode.FINISH_SERIES.value, RematchMode.NEW_SERIES.value],
  ) {
    const calls: string[] = [];
    render(
      <I18nProvider>
        <GameOverOverlay
          result="loss"
          reason="security"
          stats={[]}
          onMenu={() => calls.push("menu")}
          onRematch={() => calls.push("queue")}
          rematch={{
            view: { stage, mode, modes, series },
            opponentName: "Nova",
            onOffer: (offered) => calls.push(`offer:${offered}`),
            onAnswer: (accept) => calls.push(accept ? "accept" : "decline"),
            onChooseTurnOrder: (goFirst) => calls.push(goFirst ? "first" : "second"),
            onKeepDeck: () => calls.push("keep"),
            deckPicker: (onClose) => (
              <div role="dialog" aria-label="Deck picker">
                <button type="button" onClick={onClose}>
                  Close picker
                </button>
              </div>
            ),
          }}
        />
      </I18nProvider>,
    );
    return calls;
  }

  it("offers to finish or restart a best-of-three beside the usual actions", () => {
    const calls = renderRematch("open");
    expect(screen.getByText("Play Nova again?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish this Best of 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Start new Best of 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Find rematch" }));
    expect(calls).toEqual(["offer:finish", "offer:new", "queue"]);
    expect(screen.getByRole("button", { name: "Start new Best of 3" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("0–0 · switch decks · random first player")).toBeTruthy();
  });

  it("tells the invited player that the finished game counts toward the offered series", () => {
    renderRematch("offeredToYou", undefined, RematchMode.FINISH_SERIES.value);
    expect(screen.getByText("Nova wants to finish this Best of 3")).toBeTruthy();
    expect(screen.getByText("Counts as game 1 · same decks")).toBeTruthy();
  });

  it("lets the invited player accept or decline", () => {
    const calls = renderRematch("offeredToYou");
    expect(screen.getByText("Nova wants to start a new Best of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(calls).toEqual(["decline", "accept"]);
  });

  it("tells the offering player who they are waiting for", () => {
    renderRematch("offeredByYou");
    expect(screen.getByText("Waiting for Nova to answer…")).toBeTruthy();
  });

  it("runs the turn-order choice for game 1 without the leave actions", () => {
    const calls = renderRematch("accepted", {
      bestOf: 3,
      gameNumber: 0,
      viewerWins: 0,
      opponentWins: 0,
      pips: ["pending", "pending", "pending"],
      stage: "choosing",
      viewerChooses: true,
      choiceSecondsLeft: 20,
      viewerGoesFirst: undefined,
      viewerDeckReady: false,
      opponentDeckReady: false,
      opponentDeckChanged: false,
      outcome: undefined,
      endReason: "",
    });
    expect(screen.getByText("You choose for game 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Find rematch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go first" }));
    expect(calls).toEqual(["first"]);
  });

  const deckSelection = (fields: Partial<SeriesView>): SeriesView => ({
    bestOf: 3,
    gameNumber: 0,
    viewerWins: 0,
    opponentWins: 0,
    pips: ["pending", "pending", "pending"],
    stage: "deckSelection",
    viewerChooses: false,
    choiceSecondsLeft: 90,
    viewerGoesFirst: undefined,
    viewerDeckReady: false,
    opponentDeckReady: false,
    opponentDeckChanged: false,
    outcome: undefined,
    endReason: "",
    ...fields,
  });

  it("offers only a new best-of-three once a best-of-three is over", () => {
    renderRematch("open", undefined, RematchMode.NEW_SERIES.value, [RematchMode.NEW_SERIES.value]);
    expect(screen.getByRole("button", { name: "Start new Best of 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finish this Best of 3" })).toBeNull();
  });

  it("lets each player keep or change their deck before a new best-of-three", () => {
    const calls = renderRematch("accepted", deckSelection({}));
    expect(screen.getByText("Choose your deck for game 1")).toBeTruthy();
    expect(screen.getByText("Nova is choosing a deck…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change deck" }));
    expect(screen.getByRole("dialog", { name: "Deck picker" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close picker" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current deck" }));
    expect(calls).toEqual(["keep"]);
  });

  it("tells a ready player that the opponent switched decks without naming the deck", () => {
    renderRematch(
      "accepted",
      deckSelection({ viewerDeckReady: true, opponentDeckReady: true, opponentDeckChanged: true }),
    );
    expect(screen.getByText("Your deck is locked in.")).toBeTruthy();
    expect(screen.getByText("Nova switched decks.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep current deck" })).toBeNull();
  });

  it("announces a randomly drawn first player for a new best-of-three", () => {
    renderRematch("accepted", deckSelection({ stage: "starting" }));
    expect(screen.getByText("Game 1 · First player drawn at random")).toBeTruthy();
    expect(screen.queryByText("Nova switched decks.")).toBeNull();
  });

  it("still tells a player who locked in first that the opponent switched decks", () => {
    renderRematch("accepted", deckSelection({ stage: "starting", opponentDeckReady: true, opponentDeckChanged: true }));
    expect(screen.getByText("Nova switched decks.")).toBeTruthy();
  });
});

it("opens the exact used deck after a duel and saves an independent personal copy with attribution and artwork", () => {
  const original = DECKS[0]!;
  const snapshot: UsedDeck = {
    deckId: "community-used",
    deckName: "Deck at match start",
    mainDeck: [...original.mainDeck],
    eggDeck: [...original.eggDeck],
    mainDeckArts: [...original.mainDeck],
    eggDeckArts: [...original.eggDeck],
    format: "BT1",
    community: { id: "publication", author: { id: "author", displayName: "Original Author" } },
  };
  const onCopy = vi.fn<(deck: DeckListing) => void>((deck: DeckListing) => saveDecks([copyDeckPreset(deck, [])]));
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[]}
        onMenu={() => undefined}
        onRematch={() => undefined}
        usedDeckDialog={(onClose) => <UsedDeckDialog snapshot={snapshot} onCopy={onCopy} onClose={onClose} />}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Your deck" }));
  expect(screen.getByRole("heading", { name: /Deck at match start/ })).toBeTruthy();
  expect(screen.getByText("Original Author")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use deck" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy to edit" }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Copied!" })).toHaveProperty("disabled", true);
  const saved = loadDecks()[0]!;
  expect(saved.id).not.toBe(snapshot.deckId);
  expect(saved.mainDeck).toEqual(snapshot.mainDeck);
  expect(saved.eggDeck).toEqual(snapshot.eggDeck);
  expect(saved.mainDeckArts).toEqual(snapshot.mainDeckArts);
  expect(saved.eggDeckArts).toEqual(snapshot.eggDeckArts);
  expect(saved.format).toBe("BT1");
  expect(saved.community).toEqual(snapshot.community);
  snapshot.mainDeck[0] = "BT1-010";
  snapshot.community!.author.displayName = "Changed author";
  expect(loadDecks()[0]!.mainDeck).toEqual(original.mainDeck);
  expect(loadDecks()[0]!.community!.author.displayName).toBe("Original Author");
  localStorage.removeItem("aegis:decks");
});

it("opens the shared opponent deck and returns to the result", () => {
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[]}
        onMenu={() => {}}
        onRematch={() => {}}
        opponentDeckDialog={(onClose) => (
          <div role="dialog" aria-label="Opponent deck">
            <button onClick={onClose}>Close opponent deck</button>
          </div>
        )}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Opponent’s deck" }));
  expect(screen.getByRole("dialog", { name: "Opponent deck" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close opponent deck" }));
  expect(screen.getByRole("button", { name: "Opponent’s deck" })).toBeTruthy();
});

it("does not offer an unavailable opponent deck", () => {
  renderOverlay();
  expect(screen.queryByRole("button", { name: "Opponent’s deck" })).toBeNull();
});

it("keeps the board-review result bar clear of the portrait match menu", () => {
  const header = document.createElement("header");
  header.className = "game-opponent-bar";
  const hand = document.createElement("div");
  hand.className = "game-opponent-hand";
  const menu = document.createElement("details");
  menu.className = "game-mobile-menu";
  header.append(hand, menu);
  document.body.append(header);
  vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 844));
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 44));
  vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 80, 44));
  vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(338, 4, 36, 36));
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("game-result-bar--compact")) {
      return 40;
    }
    return this.classList.contains("game-result-bar--brief") ? 180 : 300;
  });
  try {
    renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    const bar = screen.getByRole("status");
    expect(bar.classList.contains("game-result-bar--compact")).toBe(true);
    expect(bar.style.right).toBe("64px");
    expect(bar.style.translate).toBe("none");
  } finally {
    header.remove();
    vi.restoreAllMocks();
  }
});

describe("adding the opponent after a match", () => {
  it("sends the authorized match reference even when a replay is unavailable", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ accepted: false }));
    try {
      render(
        <I18nProvider>
          <GameOverOverlay
            result="win"
            reason="security"
            stats={[]}
            signedIn
            friendMatchId="finished-room"
            replayStatus="unavailable"
            onMenu={() => {}}
            onRematch={() => {}}
          />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Request sent" })).toBeTruthy());
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/friends/requests"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ matchId: "finished-room" }),
          credentials: "include",
        }),
      );
    } finally {
      fetcher.mockRestore();
    }
  });
});

it("identifies both deck names on the result screen", () => {
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[]}
        onMenu={() => {}}
        onRematch={() => {}}
        usedDeckName="Competitive Blue"
        opponentDeckName="Xros Heart"
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Competitive Blue")).toBeTruthy();
  expect(screen.getByText("Xros Heart")).toBeTruthy();
});

it.each([false, true])("offers a finished spectator replay download with signedIn=%s", (signedIn) => {
  const download = vi.fn<() => void>();
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        spectatorResult="Nova wins"
        stats={[]}
        signedIn={signedIn}
        onMenu={() => {}}
        onRematch={() => {}}
        onDownloadReplay={download}
        replayFile={{
          kind: "ready",
          summary: {
            id: "spectated-match",
            players: ["Nova", "Tai"],
            mode: "casual",
            startedAt: 0,
            finishedAt: 1,
            winnerSeat: 0,
            frameCount: 1,
          },
          viewerSeat: SPECTATOR_REPLAY_SEAT,
          data: btoa("replay"),
        }}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("heading", { name: "Match complete" })).toBeTruthy();
  expect(screen.getByText("Nova wins")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Download file" }));
  expect(download).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();
});
