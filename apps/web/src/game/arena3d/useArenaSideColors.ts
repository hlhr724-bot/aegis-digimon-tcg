import { useEffect, useState, type RefObject } from "react";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { resolveCssColor } from "@/game/arena3d/resolveCssColor";

type Params = {
  board: RefObject<HTMLElement | null>;
  paletteKey: unknown;
};

const FALLBACK_COLORS: ArenaSideColors = {
  player: "#3fb6ff",
  playerAccent: "#7ae0ff",
  opponent: "#ff4f7b",
  opponentAccent: "#c76bff",
  surface: "#070b16",
  isLight: false,
};

function getLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function readSideColors(element: HTMLElement): ArenaSideColors {
  const paper = resolveCssColor({ element, property: "--ds-paper", fallback: "#000000" });
  const isLight = getLuminance(paper) > 0.55;
  return {
    player: resolveCssColor({ element, property: "--arena-player", fallback: FALLBACK_COLORS.player }),
    playerAccent: resolveCssColor({ element, property: "--arena-player-2", fallback: FALLBACK_COLORS.playerAccent }),
    opponent: resolveCssColor({ element, property: "--arena-opponent", fallback: FALLBACK_COLORS.opponent }),
    opponentAccent: resolveCssColor({
      element,
      property: "--arena-opponent-2",
      fallback: FALLBACK_COLORS.opponentAccent,
    }),
    surface: isLight
      ? resolveCssColor({ element, property: "--ds-sheet", fallback: "#eef2fa" })
      : resolveCssColor({ element, property: "--ds-ink", fallback: FALLBACK_COLORS.surface }),
    isLight,
  };
}

function hasSameColors(left: ArenaSideColors, right: ArenaSideColors): boolean {
  return (
    left.player === right.player &&
    left.playerAccent === right.playerAccent &&
    left.opponent === right.opponent &&
    left.opponentAccent === right.opponentAccent &&
    left.surface === right.surface &&
    left.isLight === right.isLight
  );
}

export function useArenaSideColors({ board, paletteKey }: Params): ArenaSideColors {
  const [colors, setColors] = useState<ArenaSideColors>(FALLBACK_COLORS);

  useEffect(() => {
    const element = board.current;
    if (!element) {
      return;
    }
    const refresh = () => {
      const next = readSideColors(element);
      setColors((current) => (hasSameColors(current, next) ? current : next));
    };
    refresh();
    let frame = 0;
    const scheduleRefresh = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          refresh();
        });
      }
    };
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    darkQuery.addEventListener("change", scheduleRefresh);
    return () => {
      observer.disconnect();
      darkQuery.removeEventListener("change", scheduleRefresh);
      cancelAnimationFrame(frame);
    };
  }, [board, paletteKey]);

  return colors;
}
