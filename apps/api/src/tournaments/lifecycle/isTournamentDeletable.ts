const DELETABLE_STATUSES: readonly string[] = ["draft", "registration", "check_in"];

export function isTournamentDeletable(status: string): boolean {
  return DELETABLE_STATUSES.includes(status);
}
