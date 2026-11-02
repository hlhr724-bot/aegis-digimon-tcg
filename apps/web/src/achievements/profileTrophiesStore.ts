export const PROFILE_TROPHIES_STORAGE_KEY = "aegis.profile-trophies";

function readProfileTrophiesShown(): boolean {
  try {
    return localStorage.getItem(PROFILE_TROPHIES_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export const profileTrophiesStore = {
  shown: readProfileTrophiesShown(),
  listeners: new Set<() => void>(),
};
