import { swissRoundCount, topCutSize, type CreateTournamentInput } from "@aegis/shared";
import { playsScoredRounds } from "@aegis/shared/tournaments/playsScoredRounds";
import { roundRobinRoundCount } from "@aegis/shared/tournaments/roundRobinRoundCount";

/**
 * The Swiss round count and Top Cut size computed from the official tables and frozen on the
 * tournament. Both are `null` for a structure that has no such phase, so a stored `null` means
 * "not applicable" and a stored `0` means "the flag was on but the field is too small to cut".
 */
export type FrozenStructure = {
  swissRounds: number | null;
  topCutSize: number | null;
};

export type FreezeStructureInput = Pick<CreateTournamentInput, "structure" | "topCut"> & {
  rounds?: number | null;
  topCutSize?: number | null;
};

export function freezeStructure(confirmedParticipants: number, input: FreezeStructureInput): FrozenStructure {
  const participants = Math.max(0, Math.trunc(confirmedParticipants));
  if (!playsScoredRounds(input.structure)) return { swissRounds: null, topCutSize: null };
  const rounds =
    input.structure === "round_robin"
      ? roundRobinRoundCount(participants)
      : (input.rounds ?? swissRoundCount(participants));
  return {
    swissRounds: rounds,
    topCutSize: input.topCut ? fitTopCut(participants, input.topCutSize ?? null) : null,
  };
}

function fitTopCut(participants: number, chosen: number | null): number {
  if (chosen === null) return topCutSize(participants);
  let size = chosen;
  while (size > participants) size /= 2;
  return size >= 2 ? size : 0;
}

/**
 * What the creation form shows before anyone has registered: the cut the current field would
 * produce. `null` means no cut applies at all — a plain bracket, or the flag switched off — while
 * `0` means the flag is on but the field is too small to cut. Only `0` should raise the UI warning;
 * warning on a plain bracket would be nonsense.
 */
export function estimatedTopCutSize(confirmedParticipants: number, input: FreezeStructureInput): number | null {
  return freezeStructure(confirmedParticipants, input).topCutSize;
}
