type BracketMatch = { round: number; winnerParticipantId: string | null; participantIds: readonly string[] };
type Bracket = { finalRound: number; matches: readonly BracketMatch[] };
type UnrankedParticipant = { participantId: string; matchPoints: number };
type Params = {
  championParticipantId: string | null;
  bracket: Bracket | null;
  swissOrder: readonly string[];
  unranked: readonly UnrankedParticipant[];
};

export function getFinalPlacements({
  championParticipantId,
  bracket,
  swissOrder,
  unranked,
}: Params): Map<string, number> {
  const placements = new Map<string, number>();
  if (bracket) {
    placeBracket({ placements, bracket, championParticipantId });
  } else if (championParticipantId) {
    placements.set(championParticipantId, 1);
  }
  const remaining = [
    ...swissOrder,
    ...[...unranked]
      .sort(
        (first, second) =>
          second.matchPoints - first.matchPoints || first.participantId.localeCompare(second.participantId),
      )
      .map((entry) => entry.participantId),
  ];
  for (const participantId of remaining) {
    if (!placements.has(participantId)) {
      placements.set(participantId, placements.size + 1);
    }
  }
  return placements;
}

type PlaceBracketParams = {
  placements: Map<string, number>;
  bracket: Bracket;
  championParticipantId: string | null;
};

function placeBracket({ placements, bracket, championParticipantId }: PlaceBracketParams): void {
  const champion =
    championParticipantId ??
    bracket.matches.find((match) => match.round === bracket.finalRound)?.winnerParticipantId ??
    null;
  if (champion) {
    placements.set(champion, 1);
  }
  const byDepth = [...bracket.matches].sort((first, second) => second.round - first.round);
  for (const match of byDepth) {
    const depth = bracket.finalRound - match.round;
    if (depth < 0 || match.participantIds.length < 2) {
      continue;
    }
    for (const participantId of match.participantIds) {
      if (participantId !== match.winnerParticipantId && !placements.has(participantId)) {
        placements.set(participantId, 2 ** depth + 1);
      }
    }
  }
}
