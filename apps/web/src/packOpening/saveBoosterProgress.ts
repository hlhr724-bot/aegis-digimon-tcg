import { BOOSTER_PROGRESS_KEY, LEGACY_BOOSTER_PROGRESS_KEY, type BoosterProgress } from "@/packOpening/BoosterProgress";

export function saveBoosterProgress(progress: BoosterProgress): boolean {
  try {
    localStorage.setItem(BOOSTER_PROGRESS_KEY, JSON.stringify(progress));
    localStorage.removeItem(LEGACY_BOOSTER_PROGRESS_KEY);
    return true;
  } catch {
    return false;
  }
}
