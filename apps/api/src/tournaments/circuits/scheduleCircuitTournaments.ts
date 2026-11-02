import { latestReleasedProductLabel } from "@aegis/shared/cards/cardPool";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import { computeCircuitOccurrences } from "#api/tournaments/circuits/computeCircuitOccurrences";
import type { TournamentCircuitRecord } from "#api/tournaments/circuits/TournamentCircuitRecord";
import type { TournamentCircuitRow } from "#api/tournaments/circuits/TournamentCircuitRow";
import { toTournamentCircuitRecord } from "#api/tournaments/circuits/toTournamentCircuitRecord";
import { MAX_TOURNAMENT_NAME_LENGTH, validateCreateTournament } from "#api/tournaments/rules/validation";
import { derivedUuid } from "#api/tournaments/scheduler/DeadlineQueue";

type Params = { accounts: AccountStore; now: number };

export async function scheduleCircuitTournaments({ accounts, now }: Params): Promise<number> {
  await accounts.ensureReady();
  const circuits = (
    await accounts.pool.query<TournamentCircuitRow>(
      "SELECT * FROM tournament_circuits WHERE status=$1 AND ends_at>$2 AND starts_at - lead_time_ms <= $2",
      [TournamentCircuitStatus.ACTIVE.value, now],
    )
  ).rows.map(toTournamentCircuitRecord);
  let created = 0;
  for (const circuit of circuits) {
    const due = computeCircuitOccurrences({
      schedule: circuit.schedule,
      timeZone: circuit.timeZone,
      from: Math.max(circuit.startsAt, now),
      to: Math.min(circuit.endsAt, now + circuit.leadTimeMs),
    });
    for (const occurrenceAt of due) {
      try {
        created += await createOccurrence({
          accounts,
          circuit,
          occurrenceAt,
          now,
        });
      } catch (error) {
        logError(`[tournament-circuits] occurrence ${occurrenceAt} of ${circuit.id} failed`, error);
      }
    }
  }
  return created;
}

async function createOccurrence({
  accounts,
  circuit,
  occurrenceAt,
  now,
}: Params & {
  circuit: TournamentCircuitRecord;
  occurrenceAt: number;
}): Promise<number> {
  const id = derivedUuid(`${circuit.id}:${occurrenceAt}`, "circuit_tournament");
  const existing = await accounts.pool.query("SELECT 1 FROM tournaments WHERE id=$1", [id]);
  if ((existing.rowCount ?? 0) > 0) {
    return 0;
  }
  const { block, ...template } = circuit.template;
  const validated = validateCreateTournament(
    {
      ...template,
      name: occurrenceName(circuit, occurrenceAt),
      startsAt: occurrenceAt,
      category: TournamentCategory.OFFICIAL.value,
    },
    now,
  );
  if (!validated.ok) {
    logError(
      `[tournament-circuits] template of ${circuit.id} no longer validates`,
      new Error(validated.errors.map((error) => error.code).join(",")),
    );
    return 0;
  }
  const { input, rules, banlistCards } = validated.value;
  const checkInOpensAt = occurrenceAt - circuit.checkInWindowMs;
  await accounts.createTournament(circuit.createdBy, {
    id,
    circuitId: circuit.id,
    autoStart: true,
    registrationClosesAt: occurrenceAt,
    checkInOpensAt,
    checkInClosesAt: occurrenceAt,
    category: TournamentCategory.OFFICIAL.value,
    name: input.name,
    format: input.format,
    description: input.description ?? circuit.description,
    block: block ?? latestReleasedProductLabel(),
    startsAt: occurrenceAt,
    maxPlayers: input.maxPlayers,
    structure: input.structure,
    bestOf: input.bestOf,
    topCutEnabled: input.topCut,
    allowBots: input.allowBots,
    randomBotStyles: input.randomBotStyles === true,
    rules,
    banlistPolicy: input.banlist,
    banlistCards,
  });
  return 1;
}

function occurrenceName(circuit: TournamentCircuitRecord, occurrenceAt: number): string {
  const number =
    computeCircuitOccurrences({
      schedule: circuit.schedule,
      timeZone: circuit.timeZone,
      from: circuit.startsAt,
      to: occurrenceAt,
    }).length + 1;
  const suffix = ` #${number}`;
  return `${circuit.name.slice(0, MAX_TOURNAMENT_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}
