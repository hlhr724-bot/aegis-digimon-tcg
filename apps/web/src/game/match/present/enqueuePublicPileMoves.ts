import { Zone } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared";
import type { AnimationStep, AnimationStepContext } from "@/game/animationQueue";
import type { SidePanel } from "@/game/sidePanels";
import { CueTrack } from "@/game/match/enums";
import { CONSEQUENCE_GATE_MAX_MS, waitForGate, type PresentationGate } from "@/game/match/presentationGate";

type Movement = Extract<ServerEvent, { kind: "cardsMoved" }>;
export type FlyPublicPileCard = (params: {
  event: Movement;
  index: number;
  context: AnimationStepContext;
}) => Promise<void>;
type Params = {
  fresh: readonly ServerEvent[];
  panels: readonly SidePanel[];
  panelAt: readonly number[];
  causingEffectGate: PresentationGate | null;
  flyPublicPileCard: FlyPublicPileCard;
  enqueue: (step: AnimationStep) => void;
  narrate: (panels: readonly SidePanel[]) => void;
};

export function enqueuePublicPileMoves({
  fresh,
  panels,
  panelAt,
  causingEffectGate,
  flyPublicPileCard,
  enqueue,
  narrate,
}: Params) {
  const deferredPanels = new Set<SidePanel>();
  for (const [eventIndex, event] of fresh.entries()) {
    if (event.kind !== "cardsMoved") {
      continue;
    }
    const millsDeck = event.from === Zone.Deck && event.to === Zone.Trash;
    const placesFromTrash = event.from === Zone.Trash && event.placedUnder !== undefined;
    if (!millsDeck && !placesFromTrash) {
      continue;
    }
    const panel = panels[panelAt.indexOf(eventIndex)];
    if (panel) {
      deferredPanels.add(panel);
    }
    enqueue({
      id: `pile-move-${event.instanceIds.join("-")}`,
      track: CueTrack.CenterStage,
      async run(context) {
        await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "pileMove/causingEffect");
        if (context.cancelled) {
          return;
        }
        if (context.mode === "live" && !context.skipping) {
          for (let index = 0; index < event.instanceIds.length; index += 1) {
            await flyPublicPileCard({ event, index, context });
            if (context.cancelled || context.skipping) {
              break;
            }
          }
        }
        if (panel && !context.cancelled) {
          narrate([panel]);
        }
      },
    });
  }
  return deferredPanels;
}
