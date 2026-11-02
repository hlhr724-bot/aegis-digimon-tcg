import { ArenaRim, type ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";
import { Side } from "@/game/side";

type Params = {
  element: HTMLElement | null;
  side: Side;
  offered: boolean;
};

export function readArenaZoneRim({ element, side, offered }: Params): ArenaRimEntry | undefined {
  if (!element) {
    return undefined;
  }
  if (element.classList.contains("game-security-shield--selected")) {
    return ArenaRim.SELECTED;
  }
  if (element.classList.contains("game-security-shield--armed")) {
    return ArenaRim.THREATENED;
  }
  if (element.classList.contains("game-security-shield--glow")) {
    return side === Side.Opponent ? ArenaRim.ATTACKABLE : ArenaRim.CANDIDATE;
  }
  if (offered) {
    return ArenaRim.OFFERED;
  }
  return undefined;
}
