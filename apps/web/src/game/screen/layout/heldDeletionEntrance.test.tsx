// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { I18nProvider } from "../../../i18n";
import { pendingFateBadge } from "../../pendingFate";
import { FieldLayout, setFieldLayout } from "../../../design/fieldLayout";
import type { PermanentChrome } from "../types";
import { ViewerBattleRow } from "./ViewerBattleRow";
import { OpponentBattleRow } from "./OpponentBattleRow";

afterEach(cleanup);

function permanent(id: string, cardId: string) {
  const p = new Permanent();
  p.permanentId = id;
  p.topCard = new CardInstance();
  p.topCard.cardId = cardId;
  p.topCard.instanceId = `${id}-card`;
  return p;
}

function chrome(heldDeletionIds: ReadonlySet<string>): PermanentChrome {
  return {
    compact: false,
    width: 100,
    permanentRefs: { current: {} },
    effectSourcePermanentIds: new Set(),
    effectLinkedPermanentIds: new Set(),
    decisionPickedInstanceIds: new Set(),
    permanentBursts: new Map(),
    pendingPermanentIds: new Set(),
    fateBadges: new Map(),
    combatImpactIds: new Set(),
    dpPulses: new Map(),
    dpBadgeSuppressedIds: new Set(),
    freezePulses: new Map(),
    heldSuspendedIds: new Set(),
    heldDeletionIds,
    suspendDelayMs: () => 0,
  };
}

it.each(["viewer", "opponent"] as const)(
  "keeps restored deletion faces quiet on the %s row, including a hidden grouped member",
  (seat) => {
    setFieldLayout(FieldLayout.Organized);
    const target = permanent("target", "BT1-009");
    const first = permanent("first", "BT24-098");
    const second = permanent("second", "BT24-098");
    const newcomer = permanent("newcomer", "BT26-059");
    const established = [target, first, second];
    const view = (permanents: Permanent[], held: ReadonlySet<string> = new Set(), newArrival = false) => {
      const cues = chrome(held);
      cues.fateBadges = new Map([["target", pendingFateBadge("delete")]]);
      cues.decisionPickedInstanceIds = new Set(["target"]);
      if (newArrival)
        cues.permanentBursts = new Map([
          ["target", { permanentId: "target", key: 1, seat: 0, variant: "evolve", color: "Purple", inBreeding: false }],
        ]);
      const common = {
        permanents,
        chrome: cues,
        dropIntentAttrs: () => ({}),
        isDecisionCandidate: () => false,
        onPermanentClick: () => undefined,
        onPermanentInspect: () => {},
      };
      return (
        <I18nProvider>
          {seat === "viewer" ? (
            <ViewerBattleRow
              {...common}
              dragIsPlay={false}
              selectedAttackerPermanentId={null}
              isBasePermanent={() => false}
              draggable={() => false}
              baseDropIntentAttrs={() => ({})}
              onPermanentPointerDown={() => {}}
            />
          ) : (
            <OpponentBattleRow
              {...common}
              attackerPermanent={undefined}
              draggedAttackerPermanent={undefined}
              vortexMode={false}
            />
          )}
        </I18nProvider>
      );
    };
    const { container, rerender } = render(view(established));
    rerender(view([]));
    rerender(view([...established, newcomer], new Set(["target", "second"])));
    const entrance = (id: string) => container.querySelector(`[data-id="${id}"] .game-card-enter`)!;
    expect(container.querySelector<HTMLElement>('[data-id="target"]')!.style.transform).toBe("none");
    expect(container.querySelector<HTMLElement>('[data-id="target"]')!.style.transition).toBe("opacity 160ms");
    expect(container.querySelector('[data-id="target"]')?.hasAttribute("data-stationary-departure")).toBe(true);
    expect(container.querySelector('[data-id="first"]')?.hasAttribute("data-stationary-departure")).toBe(true);
    expect(container.querySelector('[data-id="newcomer"]')?.hasAttribute("data-stationary-departure")).toBe(false);
    expect(container.querySelector<HTMLElement>('[data-id="newcomer"]')!.style.transition).toContain("transform 160ms");
    expect(entrance("target").classList.contains("game-card-enter--quiet")).toBe(true);
    expect(entrance("first").classList.contains("game-card-enter--quiet")).toBe(true);
    expect(entrance("newcomer").classList.contains("game-card-enter--quiet")).toBe(false);
    expect(container.querySelector('[data-id="first"]')?.getAttribute("data-field-member-ids")).toBe(
      '["first","second"]',
    );
    // The queue releases holds before the presented board necessarily advances.
    // Removing quiet must not restart CSS entrance on those same physical faces.
    rerender(view([...established, newcomer]));
    expect(entrance("target").classList.contains("game-card-enter--quiet")).toBe(true);
    expect(entrance("first").classList.contains("game-card-enter--quiet")).toBe(true);
    rerender(view([target, second, newcomer]));
    expect(entrance("second").classList.contains("game-card-enter--quiet")).toBe(true);
    // A genuine later arrival has its own entrance key and still animates.
    rerender(view([target, second, newcomer], new Set(), true));
    expect(entrance("target").classList.contains("game-card-enter--quiet")).toBe(false);
    expect(entrance("target").classList.contains("game-card-landing")).toBe(true);
    expect(entrance("newcomer").classList.contains("game-card-enter--quiet")).toBe(false);
  },
);
