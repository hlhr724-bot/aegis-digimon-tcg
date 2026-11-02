import type { CreateTournamentInput, TournamentStatus } from "#shared/tournaments/index";
import type { TournamentCircuitCadence } from "#shared/tournaments/circuits/TournamentCircuitCadence";
import type { TournamentCircuitStatus } from "#shared/tournaments/circuits/TournamentCircuitStatus";

export type TournamentCircuitWeeklySlot = {
  weekday: number;
  localTime: string;
};

export type TournamentCircuitMonthlySlot = {
  monthDay: number;
  localTime: string;
};

export type TournamentCircuitSchedule =
  | {
      cadence: (typeof TournamentCircuitCadence.WEEKLY)["value"];
      slots: TournamentCircuitWeeklySlot[];
    }
  | {
      cadence: (typeof TournamentCircuitCadence.MONTHLY)["value"];
      slots: TournamentCircuitMonthlySlot[];
    };

export type TournamentCircuitPointsTier = {
  maxPlacement: number;
  points: number;
};

export type TournamentCircuitTemplate = Omit<CreateTournamentInput, "name" | "startsAt" | "category" | "password"> & {
  block?: string;
};

export type CreateTournamentCircuitInput = {
  name: string;
  description?: string;
  startsAt: number;
  endsAt: number;
  timeZone: string;
  schedule: TournamentCircuitSchedule;
  leadTimeMs: number;
  checkInWindowMs: number;
  template: TournamentCircuitTemplate;
  pointsTable: TournamentCircuitPointsTier[];
  participationPoints: number;
};

export type TournamentCircuitSummary = {
  id: string;
  name: string;
  description: string;
  status: TournamentCircuitStatus;
  startsAt: number;
  endsAt: number;
  timeZone: string;
  schedule: TournamentCircuitSchedule;
  leadTimeMs: number;
  checkInWindowMs: number;
  pointsTable: TournamentCircuitPointsTier[];
  participationPoints: number;
  createdBy: string;
  finalizedAt: number | null;
  nextOccurrenceAt: number | null;
  scoringLocked: boolean;
};

export type TournamentCircuitEvent = {
  tournamentId: string;
  name: string;
  startsAt: number;
  status: TournamentStatus;
};

export type TournamentCircuitView = TournamentCircuitSummary & {
  template: TournamentCircuitTemplate;
  tournaments: TournamentCircuitEvent[];
  upcoming: number[];
};

export type TournamentCircuitStanding = {
  position: number;
  accountId: string;
  displayName: string;
  points: number;
  events: number;
  bestPlacement: number | null;
};

export type TournamentCircuitLeaderboard = {
  circuitId: string;
  final: boolean;
  entries: TournamentCircuitStanding[];
  mine: TournamentCircuitStanding | null;
  page: number;
  total: number;
};

export type TournamentCircuitLink = { id: string; name: string };
