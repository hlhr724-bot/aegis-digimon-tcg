import { expect, it, vi } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import type { AnimationStep, AnimationStepContext } from "@/game/animationQueue";
import { Side } from "@/game/side";
import type { SidePanel } from "@/game/sidePanels";
import { enqueuePublicPileMoves, type FlyPublicPileCard } from "@/game/match/present/enqueuePublicPileMoves";
import { revealShowcasesFromEvents } from "@/game/match/present/revealShowcases";
import { sidePanelFromEvent } from "@/game/sidePanels";

const context: AnimationStepContext = { mode: "live", skipping: false, cancelled: false, wait: async () => {} };

it("places a trash card underneath before milling, and announces only the completed discard", async () => {
  const fresh: ServerEvent[] = [
    {
      kind: "cardsMoved",
      from: "trash",
      to: "battleArea",
      fromSeat: 0,
      seat: 0,
      placedUnder: { permanentId: "apocalymon" },
      instanceIds: ["source"],
      cardIds: ["BT15-031"],
    },
    {
      kind: "cardsMoved",
      from: "deck",
      to: "trash",
      fromSeat: 1,
      seat: 1,
      instanceIds: ["milled-1", "milled-2"],
      cardIds: ["ST1-03", "ST1-03"],
    },
  ];
  const lookup = { cardId: () => undefined, seat: () => undefined };
  const panel = sidePanelFromEvent(fresh[1]!, 0, lookup, "discard", 0)!;
  expect(panel).toMatchObject({ titleKey: "panel.trashedCards", side: Side.Opponent });
  expect(revealShowcasesFromEvents(fresh, 0, () => 1)).toEqual([]);
  const panels: SidePanel[] = [panel];
  const steps: AnimationStep[] = [];
  const order: string[] = [];
  const deferred = enqueuePublicPileMoves({
    fresh,
    panels,
    panelAt: [1],
    causingEffectGate: null,
    flyPublicPileCard: async ({ event, index }) => {
      order.push(event.instanceIds[index]!);
    },
    enqueue: (step) => steps.push(step),
    narrate: (shown) => {
      order.push(...shown.map((entry) => entry.titleKey));
    },
  });
  expect(deferred.has(panel)).toBe(true);
  expect(order).toEqual([]);
  for (const step of steps) {
    await step.run(context);
  }
  expect(order).toEqual(["source", "milled-1", "milled-2", "panel.trashedCards"]);
});

it("keeps genuine reveals on their existing presentation path", () => {
  const enqueue = vi.fn<(step: AnimationStep) => void>();
  const fresh: ServerEvent[] = [{ kind: "cardRevealed", seat: 1, cardId: "ST1-03" }];
  expect(revealShowcasesFromEvents(fresh, 0, () => 1)).toHaveLength(1);
  enqueuePublicPileMoves({
    fresh,
    panels: [],
    panelAt: [],
    causingEffectGate: null,
    flyPublicPileCard: vi.fn<FlyPublicPileCard>(),
    enqueue,
    narrate: vi.fn<(panels: readonly SidePanel[]) => void>(),
  });
  expect(enqueue).not.toHaveBeenCalled();
});

it("skips flights when draining but preserves the single result panel", async () => {
  const event: ServerEvent = {
    kind: "cardsMoved",
    from: "deck",
    to: "trash",
    seat: 1,
    instanceIds: ["mill"],
    cardIds: ["ST1-03"],
  };
  const panel: SidePanel = {
    id: "discard",
    ordered: true,
    titleKey: "panel.trashedCards",
    side: Side.Opponent,
    cards: [{ cardId: "ST1-03", badge: 1 }],
    createdAt: 0,
  };
  const steps: AnimationStep[] = [];
  const fly = vi.fn<FlyPublicPileCard>();
  const narrate = vi.fn<(panels: readonly SidePanel[]) => void>();
  enqueuePublicPileMoves({
    fresh: [event],
    panels: [panel],
    panelAt: [0],
    causingEffectGate: null,
    flyPublicPileCard: fly,
    enqueue: (step) => steps.push(step),
    narrate,
  });
  await steps[0]!.run({ ...context, mode: "drain" });
  expect(fly).not.toHaveBeenCalled();
  expect(narrate).toHaveBeenCalledExactlyOnceWith([panel]);
});
