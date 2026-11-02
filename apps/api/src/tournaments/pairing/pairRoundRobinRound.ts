import type { SwissBye, SwissPairing } from "#api/tournaments/pairing/pairSwissRound";

type Params = {
  seating: readonly string[];
  activeIds: ReadonlySet<string>;
  roundNumber: number;
};

export type RoundRobinRound = {
  pairings: SwissPairing[];
  byes: SwissBye[];
};

export function pairRoundRobinRound({ seating, activeIds, roundNumber }: Params): RoundRobinRound {
  const seats: (string | null)[] = seating.length % 2 === 0 ? [...seating] : [...seating, null];
  const rotating = seats.slice(1);
  const shift = (roundNumber - 1) % Math.max(1, rotating.length);
  const order = [
    seats[0] ?? null,
    ...rotating.slice(rotating.length - shift),
    ...rotating.slice(0, rotating.length - shift),
  ];
  const pairings: SwissPairing[] = [];
  const byes: SwissBye[] = [];
  for (let index = 0; index < order.length / 2; index += 1) {
    const home = order[index] ?? null;
    const away = order[order.length - 1 - index] ?? null;
    const homeActive = home !== null && activeIds.has(home);
    const awayActive = away !== null && activeIds.has(away);
    if (homeActive && awayActive) {
      pairings.push(
        roundNumber % 2 === 0 && index === 0
          ? { participant0Id: away, participant1Id: home, reason: "round_robin_schedule" }
          : { participant0Id: home, participant1Id: away, reason: "round_robin_schedule" },
      );
    } else if (homeActive) {
      byes.push({ participantId: home, reason: "bye_no_prior_bye" });
    } else if (awayActive) {
      byes.push({ participantId: away, reason: "bye_no_prior_bye" });
    }
  }
  return { pairings, byes };
}
