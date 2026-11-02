import { getCompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled = structuredClone(getCompiledCard("BT12-072")!);
const effect = compiled.effects[0];
if (effect?.actions[0]?.kind === "PlaceUnder") {
  effect.actions[0].position = "bottom";
  effect.actions[0].underFilter = { isSelfRef: true };
}
const deletionEffect = compiled.effects.find(
  (entry) => entry.trigger === "AllTurns" && entry.actions[0]?.kind === "SubTrigger",
);
const deletionTrigger = deletionEffect?.actions[0];
if (deletionTrigger?.kind === "SubTrigger") deletionTrigger.sourceFilter = { isSelfRef: true };
for (const action of compiled.effects.flatMap((entry) => entry.actions)) {
  if (action.kind === "GrantStatic" && action.grant === "effects") action.excludeInherited = true;
}
compiled.digivolutionRequirement = compiled.digivolutionRequirement?.map(({ names, ...requirement }) => ({
  ...requirement,
  ...(names === undefined ? {} : { namesExact: names }),
}));

export default registerIrCard("BT12-072", compiled);
