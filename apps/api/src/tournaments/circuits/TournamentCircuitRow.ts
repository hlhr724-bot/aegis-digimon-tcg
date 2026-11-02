import type { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type {
  TournamentCircuitPointsTier,
  TournamentCircuitSchedule,
  TournamentCircuitTemplate,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import type { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";

export type TournamentCircuitRow = {
  id: string;
  name: string;
  description: string;
  status: TournamentCircuitStatus;
  starts_at: string | number;
  ends_at: string | number;
  time_zone: string;
  cadence: TournamentCircuitCadence;
  slots: TournamentCircuitSchedule["slots"] | string;
  lead_time_ms: string | number;
  check_in_window_ms: string | number;
  template: TournamentCircuitTemplate | string;
  points_table: TournamentCircuitPointsTier[] | string;
  participation_points: number;
  created_by: string;
  finalized_at: string | number | null;
};
