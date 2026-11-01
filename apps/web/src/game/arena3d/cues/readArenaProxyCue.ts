import { ArenaCardChannel, type ArenaCardChannelEntry } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCue } from "@/game/arena3d/cues/ArenaCardCue";
import type { ArenaCueElement } from "@/game/arena3d/cues/ArenaCueElement";
import { ArenaCardTint, type ArenaCardTintEntry } from "@/game/arena3d/cues/ArenaCardTint";

type Params = {
  element: ArenaCueElement;
  offered: boolean;
};

const DP_LOSS_SELECTOR = ".game-dp-pulse--debuff, .game-dp-pulse--debuffFatal";
const DP_CHANGE_SELECTOR = ".game-dp-pulse";
const LANDING_SELECTOR = ".game-card-landing";

function readChannel(element: ArenaCueElement): ArenaCardChannelEntry | undefined {
  if (element.classList.contains("game-permanent--effect-source")) {
    return ArenaCardChannel.SOURCE;
  }
  if (element.classList.contains("game-permanent--effect-linked")) {
    return ArenaCardChannel.LINKED;
  }
  return undefined;
}

function readTint(element: ArenaCueElement): ArenaCardTintEntry | undefined {
  if (element.classList.contains("game-permanent-freeze")) {
    return ArenaCardTint.FREEZE;
  }
  if (element.classList.contains("game-permanent-debuff")) {
    return ArenaCardTint.DEBUFF;
  }
  if (element.classList.contains("game-permanent-buff")) {
    return ArenaCardTint.BUFF;
  }
  if (element.querySelector(DP_LOSS_SELECTOR)) {
    return ArenaCardTint.DEBUFF;
  }
  if (element.querySelector(DP_CHANGE_SELECTOR)) {
    return ArenaCardTint.BUFF;
  }
  return undefined;
}

export function readArenaProxyCue({ element, offered }: Params): ArenaCardCue {
  return {
    channel: readChannel(element),
    tint: readTint(element),
    shaking: element.classList.contains("game-permanent-shake"),
    landing: Boolean(element.querySelector(LANDING_SELECTOR)),
    offered,
  };
}
