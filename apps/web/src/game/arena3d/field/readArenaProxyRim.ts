import { ArenaRim, type ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";
import { Side } from "@/game/side";

type Params = {
  element: HTMLElement;
  side: Side;
  offered: boolean;
};

const FACE_SELECTOR = ".game-card-enter > [data-state], .game-card-enter > [data-card-back]";

export function readArenaProxyRim({ element, side, offered }: Params): ArenaRimEntry | undefined {
  const face = element.querySelector<HTMLElement>(FACE_SELECTOR);
  if (face?.dataset.selected !== undefined) {
    return ArenaRim.SELECTED;
  }
  if (element.classList.contains("game-permanent--threatened")) {
    return ArenaRim.THREATENED;
  }
  if (face?.dataset.attackable !== undefined || element.classList.contains("game-permanent--candidate")) {
    return side === Side.Opponent ? ArenaRim.ATTACKABLE : ArenaRim.CANDIDATE;
  }
  if (offered) {
    return ArenaRim.OFFERED;
  }
  if (element.classList.contains("game-permanent--effect-source")) {
    return ArenaRim.EFFECT_SOURCE;
  }
  if (element.classList.contains("game-permanent--effect-linked")) {
    return ArenaRim.EFFECT_LINKED;
  }
  return undefined;
}
