// @vitest-environment jsdom
import type { PhaseView, SeriesScoreView } from "@aegis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { isAwaitingTopCut, TopCutBracket } from "./TopCutBracket";
import type { TournamentDetail } from "./types";

const BASE: TournamentDetail = {
  id: "t-1",
  name: "Regional qualifier",
  status: "running",
  structure: "swiss",
  topCutEnabled: true,
  topCutSize: 4,
  bestOf: 3,
  allowBots: false,
  startsAt: 0,
  maxPlayers: 32,
  registeredCount: 4,
  banlistPolicy: { mode: "current" },
  block: "BT10",
  createdBy: "acc-organizer",
  winnerAccountId: null,
  rules: null,
  banlistCards: [],
  matches: [],
  participants: [
    { id: "p-1", kind: "human", displayName: "Ada", status: "active", seed: 1 },
    { id: "p-2", kind: "human", displayName: "Bo", status: "active", seed: 2 },
    { id: "p-3", kind: "human", displayName: "Cy", status: "active", seed: 3 },
    { id: "p-4", kind: "human", displayName: "Di", status: "active", seed: 4 },
  ],
};

function match(input: Partial<SeriesScoreView> & { matchId: string }): SeriesScoreView {
  return {
    seriesId: null,
    status: "scheduled",
    participant0Id: null,
    participant1Id: null,
    wins0: 0,
    wins1: 0,
    currentGameIndex: null,
    joinDeadlineAt: null,
    seriesDeadlineAt: null,
    winnerParticipantId: null,
    ...input,
  };
}

/** A Top 4 mid-play: the semifinals are decided and the final has not started. */
const TOP_CUT: PhaseView = {
  id: "phase-cut",
  kind: "top_cut",
  status: "running",
  plannedRounds: 2,
  rounds: [
    {
      number: 1,
      status: "closed",
      publishedAt: null,
      matches: [
        match({
          matchId: "m-1",
          status: "resolved",
          participant0Id: "p-1",
          participant1Id: "p-4",
          wins0: 2,
          wins1: 0,
          winnerParticipantId: "p-1",
        }),
        match({
          matchId: "m-2",
          status: "resolved",
          participant0Id: "p-2",
          participant1Id: "p-3",
          wins0: 1,
          wins1: 2,
          winnerParticipantId: "p-3",
        }),
      ],
    },
    {
      number: 2,
      status: "published",
      publishedAt: null,
      matches: [match({ matchId: "m-3", participant0Id: "p-1", participant1Id: "p-3" })],
    },
  ],
};

function renderBracket(detail: TournamentDetail) {
  return render(
    <I18nProvider>
      <TopCutBracket detail={detail} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("TopCutBracket", () => {
  it("renders nothing while the event has no cut phase and its Swiss is still running", () => {
    const swiss: PhaseView = { id: "p", kind: "swiss", status: "running", plannedRounds: 4, rounds: [] };
    const { container } = renderBracket({ ...BASE, phases: [swiss] });
    expect(container.innerHTML).toBe("");
  });

  it("announces the transition while the Swiss phase is frozen and the bracket does not exist yet", () => {
    const swiss: PhaseView = { id: "p", kind: "swiss", status: "frozen", plannedRounds: 4, rounds: [] };
    const detail = { ...BASE, phases: [swiss] };
    expect(isAwaitingTopCut(detail)).toBe(true);
    renderBracket(detail);
    expect(screen.getByRole("status").textContent).toBe("Swiss is over. We are drawing the Top 4 bracket now.");
  });

  it("lays the cut out round by round, naming the last rounds and marking the winners", () => {
    renderBracket({ ...BASE, phases: [TOP_CUT] });
    expect(screen.getByRole("heading", { name: "Semifinals" }).tagName).toBe("H4");
    expect(screen.getByRole("heading", { name: "Final" }).tagName).toBe("H4");
    // Mirrored seeding is the server's; what the client must show is who plays whom. Ada appears
    // twice — she won her semifinal and is in the final — so the semifinal is located by its own
    // heading rather than by her name.
    const semifinals = screen.getByRole("heading", { name: "Semifinals" }).parentElement!;
    const [first] = [...semifinals.querySelectorAll("li")];
    expect(first!.textContent).toContain("Ada");
    expect(first!.textContent).toContain("Di");
    expect([...first!.querySelectorAll(".tournaments-tree__wins")].map((wins) => wins.textContent)).toEqual(["2", "0"]);
    expect(first!.querySelector(".tournaments-bracket__seat--winner")!.textContent).toBe("Ada");
    expect(first!.querySelectorAll(".tournaments-bracket__seat--winner")).toHaveLength(1);
  });

  it("badges the final as untimed when the ruleset gives it no deadline", () => {
    renderBracket({ ...BASE, phases: [TOP_CUT] });
    const final = screen.getByRole("heading", { name: "Final" }).parentElement!;
    expect(final.textContent).toContain("No time limit");
    // The semifinals run on the cut clock, so they carry no such badge.
    expect(screen.getByRole("heading", { name: "Semifinals" }).parentElement!.textContent).not.toContain(
      "No time limit",
    );
  });

  it("badges a pairing the server explained, and stays silent about an ordinary one", () => {
    const explained: PhaseView = {
      ...TOP_CUT,
      rounds: [
        {
          ...TOP_CUT.rounds[0]!,
          matches: [
            { ...TOP_CUT.rounds[0]!.matches[0]!, pairingReason: "pair_down" },
            { ...TOP_CUT.rounds[0]!.matches[1]!, pairingReason: "same_score" },
          ],
        },
        TOP_CUT.rounds[1]!,
      ],
    };
    renderBracket({ ...BASE, phases: [explained] });
    const semifinals = screen.getByRole("heading", { name: "Semifinals" }).parentElement!;
    const [first, second] = [...semifinals.querySelectorAll("li")];
    expect(first!.textContent).toContain("Paired down");
    // The ordinary same-score pairing says nothing, and neither does a match with no reason at all.
    expect(second!.textContent).not.toContain("Paired down");
    expect(screen.getByRole("heading", { name: "Final" }).parentElement!.textContent).not.toContain("Paired down");
  });

  it("does not claim a final is untimed once it has a deadline", () => {
    const timed: PhaseView = {
      ...TOP_CUT,
      rounds: [
        TOP_CUT.rounds[0]!,
        {
          ...TOP_CUT.rounds[1]!,
          matches: [match({ matchId: "m-3", participant0Id: "p-1", participant1Id: "p-3", seriesDeadlineAt: 5_000 })],
        },
      ],
    };
    renderBracket({ ...BASE, phases: [timed] });
    expect(screen.queryByText("No time limit")).toBeNull();
  });
});
