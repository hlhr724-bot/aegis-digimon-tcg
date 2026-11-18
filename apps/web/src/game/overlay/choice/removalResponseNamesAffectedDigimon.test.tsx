// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { CardInstance, GameState, Permanent, PlayerState, type DecisionRequest } from "@aegis/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DecisionPrompts } from "@/game/screen/layout/DecisionPrompts";
import { CombatWindowPrompts } from "@/game/screen/layout/CombatWindowPrompts";
import { pendingFateBadges } from "@/game/pendingFate";

beforeEach(() => localStorage.setItem("aegis.locale", "en"));
afterEach(cleanup);

function buildPermanent(permanentId: string, cardId: string): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = permanentId;
  permanent.controllerSeat = 0;
  permanent.topCard = Object.assign(new CardInstance(), { cardId, instanceId: `${permanentId}-top` });
  return permanent;
}

const endangered = buildPermanent("perm-4", "BT6-063");
const sameNameBystander = buildPermanent("perm-7", "BT6-063");
const responder = buildPermanent("perm-9", "BT20-091");
const permanents = [endangered, sameNameBystander, responder];

function renderPrompt(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

function renderDecision(decision: DecisionRequest) {
  return renderPrompt(
    <DecisionPrompts
      decision={decision}
      answerOnBoard={false}
      permanents={permanents}
      sourceCardId={decision.sourceCardId}
      candidates={[]}
      allowsPick={() => true}
      picks={[]}
      min={0}
      max={1}
      triggerDetails={[]}
      opponentSecurityCount={3}
      onTogglePick={vi.fn<(instanceId: string) => void>()}
      onRespond={vi.fn<() => void>()}
      onOpenDialog={vi.fn<() => void>()}
    />,
  );
}

function getAffectedNames(): string[] {
  const group = screen.getByRole("group", { name: "Affected Digimon" });
  return within(group)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

it("names the endangered Digimon and its field reference on an optional replacement prompt", () => {
  renderDecision({
    decisionId: "would-leave",
    seat: 0,
    kind: "optional",
    promptText: "Play without paying the cost",
    sourceCardId: "BT20-091",
    sourcePermanentId: "perm-9",
    options: { activationConfirmation: true, affectedPermanentIds: ["perm-4"] },
  });
  expect(getAffectedNames()).toEqual(["BigMamemon #4"]);
  expect(screen.getByRole("button", { name: "View board" })).toBeTruthy();
});

it("names the endangered Digimon on the Armor Purge prompt", () => {
  renderDecision({
    decisionId: "armor-purge",
    seat: 0,
    kind: "selectCards",
    promptText: "Armor Purge",
    sourceCardId: "BT6-063",
    sourcePermanentId: "perm-4",
    options: {
      candidateInstanceIds: ["perm-4-top"],
      min: 0,
      max: 1,
      promptKey: "armorPurge",
      affectedPermanentIds: ["perm-4"],
    },
  });
  expect(getAffectedNames()).toEqual(["BigMamemon #4"]);
});

it("leaves the field reference out when no other Digimon shares the name", () => {
  renderDecision({
    decisionId: "unique-name",
    seat: 0,
    kind: "optional",
    promptText: "Use this effect?",
    options: { affectedPermanentIds: ["perm-9"] },
  });
  expect(getAffectedNames()).toEqual(["Cool Boy"]);
});

it.each(["evade", "barrier"] as const)(
  "names the Digimon a %s prompt would save and marks it on the board",
  (keyword) => {
    const state = new GameState();
    const player = new PlayerState();
    player.battleArea.push(endangered, sameNameBystander);
    state.players.push(player, new PlayerState());
    const keywordWindow = { permanentId: "perm-7" };
    renderPrompt(
      <CombatWindowPrompts
        state={state}
        blockWindow={null}
        counterWindow={null}
        allianceWindow={null}
        evadeWindow={keyword === "evade" ? keywordWindow : null}
        barrierWindow={keyword === "barrier" ? keywordWindow : null}
        onBlock={vi.fn<() => void>()}
        onCounter={vi.fn<() => void>()}
        onAlliance={vi.fn<() => void>()}
        onEvade={vi.fn<() => void>()}
        onBarrier={vi.fn<() => void>()}
      />,
    );
    expect(getAffectedNames()).toEqual(["BigMamemon #7"]);
    const badges = pendingFateBadges({
      decision: undefined,
      picks: [],
      viewerSeat: 0,
      wouldBeDeletedPermanentIds: [keywordWindow.permanentId],
    });
    expect([...badges.entries()].map(([id, badge]) => [id, badge.fate])).toEqual([["perm-7", "delete"]]);
  },
);
