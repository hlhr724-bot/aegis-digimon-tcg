import type {
  TournamentCircuitPointsTier,
  TournamentCircuitSchedule,
  TournamentCircuitTemplate,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import type { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";

export type TournamentCircuitRecord = {
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
  template: TournamentCircuitTemplate;
  pointsTable: TournamentCircuitPointsTier[];
  participationPoints: number;
  createdBy: string;
  finalizedAt: number | null;
};
