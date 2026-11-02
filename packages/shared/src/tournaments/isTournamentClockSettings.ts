import type { TournamentClockSettings } from "#shared/tournaments/TournamentClockSettings";

export function isTournamentClockSettings(value: unknown): value is TournamentClockSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const settings = value as Record<string, unknown>;
  return (
    isDuration(settings.roundMinutes) &&
    isDuration(settings.eliminationMinutes) &&
    (settings.finalMinutes === null || isDuration(settings.finalMinutes)) &&
    typeof settings.overtimeMinutes === "number" &&
    Number.isInteger(settings.overtimeMinutes) &&
    settings.overtimeMinutes >= 0 &&
    settings.overtimeMinutes <= 60
  );
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 240;
}
