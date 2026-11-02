import { WinrateTone } from "@/screens/community/WinrateTone";

const EVEN_MARGIN = 0.02;

export function getWinrateTone(winrate: number | null): WinrateTone {
  if (winrate === null || Math.abs(winrate - 0.5) < EVEN_MARGIN) {
    return WinrateTone.EVEN.value;
  }
  return winrate > 0.5 ? WinrateTone.GOOD.value : WinrateTone.BAD.value;
}
