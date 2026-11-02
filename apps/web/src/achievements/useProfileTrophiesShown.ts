import { useSyncExternalStore } from "react";
import { profileTrophiesStore } from "@/achievements/profileTrophiesStore";

function getProfileTrophiesShown(): boolean {
  return profileTrophiesStore.shown;
}

function subscribeProfileTrophiesShown(listener: () => void): () => void {
  profileTrophiesStore.listeners.add(listener);
  return () => profileTrophiesStore.listeners.delete(listener);
}

export function useProfileTrophiesShown(): boolean {
  return useSyncExternalStore(subscribeProfileTrophiesShown, getProfileTrophiesShown, () => true);
}
