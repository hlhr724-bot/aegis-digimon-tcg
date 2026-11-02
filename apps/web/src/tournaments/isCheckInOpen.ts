import type { TournamentDetail, TournamentWindows } from "@/tournaments/types";

type Params = {
  status: TournamentDetail["status"];
  windows: TournamentWindows | undefined;
  now: number;
};

export function isCheckInOpen({ status, windows, now }: Params): boolean {
  if (status !== "registration" && status !== "check_in") return false;
  const opensAt = windows?.checkInOpensAt ?? null;
  return opensAt === null || now >= opensAt;
}
