import { PROFILE_TROPHIES_STORAGE_KEY, profileTrophiesStore } from "@/achievements/profileTrophiesStore";

export function setProfileTrophiesShown(shown: boolean): void {
  if (profileTrophiesStore.shown === shown) {
    return;
  }
  profileTrophiesStore.shown = shown;
  try {
    localStorage.setItem(PROFILE_TROPHIES_STORAGE_KEY, String(shown));
  } catch {}
  for (const listener of profileTrophiesStore.listeners) {
    listener();
  }
}
