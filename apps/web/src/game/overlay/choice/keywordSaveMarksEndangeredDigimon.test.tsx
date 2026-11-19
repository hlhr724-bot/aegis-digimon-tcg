// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CardInstance, GameState, Permanent, PlayerState, type DecisionRequest } from "@aegis/shared";
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

it.each(["evade", "barrier"] as const)(
  "marks the Digimon a %s prompt would save on the board and keeps its name out of the prompt",
  (keyword) => {
    const state = new GameState();
    const player = new PlayerState();
    player.battleArea.push(endangered, sameNameBystander);
    state.players.push(player, new PlayerState());
    const keywordWindow = { permanentId: "perm-7" };
    render(
      <I18nProvider>
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
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("dialog").textContent).not.toContain("BigMamemon");
    const badges = pendingFateBadges({
      decision: undefined,
      picks: [],
      viewerSeat: 0,
      wouldBeDeletedPermanentIds: [keywordWindow.permanentId],
    });
    expect([...badges.entries()].map(([id, badge]) => [id, badge.fate])).toEqual([["perm-7", "delete"]]);
  },
);

it("marks the endangered Digimon of a replacement prompt on the board and keeps its name out of the prompt", () => {
  const decision: DecisionRequest = {
    decisionId: "would-leave",
    seat: 0,
    kind: "optional",
    promptText: "Use this effect?",
    options: { activationConfirmation: true, affectedPermanentIds: ["perm-4"] },
  };
  render(
    <I18nProvider>
      <DecisionPrompts
        decision={decision}
        answerOnBoard={false}
        permanents={[endangered, sameNameBystander]}
        sourceCardId={undefined}
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
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("dialog").textContent).not.toContain("BigMamemon");
  expect([...pendingFateBadges({ decision, picks: [], viewerSeat: 0 }).keys()]).toEqual(["perm-4"]);
});
