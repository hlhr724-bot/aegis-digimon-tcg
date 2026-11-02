import type { ArenaLayout } from "@/game/screen/hooks/useArenaLayout";

type Params = { layout: ArenaLayout; factor: number };

export function getScaledArenaLayout({ layout, factor }: Params): ArenaLayout {
  return {
    ...layout,
    arenaPermanentWidth: Math.round(layout.arenaPermanentWidth * factor),
    arenaPileWidth: Math.round(layout.arenaPileWidth * factor),
    arenaRaisingWidth: Math.round(layout.arenaRaisingWidth * factor),
    arenaSidelineBasisWidth: Math.round(layout.arenaSidelineBasisWidth * factor),
    handCardWidth: Math.round(layout.handCardWidth * factor),
    handMinExposure: layout.handMinExposure === undefined ? undefined : Math.round(layout.handMinExposure * factor),
  };
}
