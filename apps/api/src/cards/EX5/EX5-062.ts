import { getCompiledCard } from "@aegis/shared";
import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = structuredClone(getCompiledCard("EX5-062")!);
for (const effect of compiled.effects ?? []) {
  if (effect.trigger !== "Main" && effect.trigger !== "WhenDigivolving") continue;
  effect.sharedUseKey = "ir-shared-0";
  effect.actions = effect.actions.filter((action) => action.kind !== "Replacement");
  const trash = effect.actions.find((action) => action.kind === "Trash");
  if (trash?.kind === "Trash") {
    trash.trackCount = "anubismonTrashed";
    trash.effectTextPart = "[When Digivolving] [Main] [Once Per Turn] You may trash up to 3 cards from your hand.";
  }
  const play = effect.actions.find((action) => action.kind === "PlayWithoutCost");
  if (play?.kind === "PlayWithoutCost") {
    play.effectTextPart =
      "Then, play 1 purple Digimon card from your trash with the play cost reduced by 3. " +
      "For each card trashed by this effect, further reduce it by 1.";
    play.reduceCostBy = 3;
    play.reduceCostByScaling = { per: 1, unit: "namedCount", countSource: "anubismonTrashed" };
  }
}
const watcher = compiled.effects.find((effect) => effect.trigger === "YourTurn");
const watcherTrigger = watcher?.actions.find((action) => action.kind === "SubTrigger");
const draw = watcher?.actions.find((action) => action.kind === "Draw");
if (watcher !== undefined && watcherTrigger?.kind === "SubTrigger" && draw?.kind === "Draw") {
  watcherTrigger.sourceFilter = { ...(watcherTrigger.sourceFilter ?? {}), byEffect: true };
  draw.condition = { kind: "ifThisEffectDidNotDelete" };
  watcherTrigger.actions.push(draw);
  watcher.actions = [watcherTrigger];
}
if (watcher !== undefined) {
  delete watcher.frequency;
}
compiled.coverage = "full";
compiled.residual = [];

registerIrCard("EX5-062", compiled);
