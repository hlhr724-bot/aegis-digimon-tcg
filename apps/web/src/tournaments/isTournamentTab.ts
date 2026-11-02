import { TournamentTab } from "@/tournaments/TournamentTab";

export function isTournamentTab(value: unknown): value is TournamentTab {
  return typeof value === "string" && Object.values(TournamentTab).some((entry) => entry.value === value);
}
