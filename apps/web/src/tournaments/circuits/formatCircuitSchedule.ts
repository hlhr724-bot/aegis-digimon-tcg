import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type { TournamentCircuitSchedule } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import type { Translate } from "@/i18n/translationTypes";
import { formatCircuitWeekday } from "@/tournaments/circuits/formatCircuitWeekday";

export function formatCircuitSchedule(schedule: TournamentCircuitSchedule, locale: string, t: Translate): string[] {
  return schedule.cadence === TournamentCircuitCadence.WEEKLY.value
    ? schedule.slots.map((slot) => `${formatCircuitWeekday(slot.weekday, locale)} ${slot.localTime}`)
    : schedule.slots.map((slot) =>
        t("tournaments.circuits.monthlySlot", {
          day: slot.monthDay,
          time: slot.localTime,
        }),
      );
}
