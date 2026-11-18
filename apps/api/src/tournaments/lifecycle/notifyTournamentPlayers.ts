import type { AccountStore } from "#api/accounts/AccountStore";
import type { Queryable } from "#api/db/migrator";
import { logError } from "#api/logger";
import { notify, type NewNotification } from "#api/notifications/NotificationStore";

type Params = {
  accounts: AccountStore;
  now: number;
};

type RecipientParams = {
  db: Queryable;
  now: number;
  tournamentId?: string;
};

type TournamentParams = Params & { tournamentId: string };

type TournamentPlayerNotification = Extract<NewNotification, { kind: "tournament_started" | "tournament_match_ready" }>;

type RecipientRow = {
  tournament_id: string;
  name: string;
  account_id: string;
  match_id: string | null;
  round: number | null;
};

const RECIPIENTS_PER_SWEEP = 200;
const START_ANNOUNCEMENT_WINDOW_MS = 60 * 60 * 1000;

const STARTED_RECIPIENTS = `SELECT t.id AS tournament_id, t.name, p.account_id, NULL AS match_id, NULL AS round
  FROM tournaments t
  JOIN tournament_phases ph ON ph.tournament_id=t.id AND ph.phase_order=0 AND ph.created_at>$1
  JOIN tournament_participants p ON p.tournament_id=t.id AND p.status='active' AND p.account_id IS NOT NULL
  LEFT JOIN notifications n ON n.account_id=p.account_id AND n.subject=('tournament_started:' || t.id::text)
  WHERE n.id IS NULL AND t.status='in_progress' AND ($2::text IS NULL OR t.id::text=$2)
  ORDER BY t.id, p.account_id LIMIT ${RECIPIENTS_PER_SWEEP}`;

const MATCH_READY_RECIPIENTS = `SELECT t.id AS tournament_id, t.name, a.id AS account_id, m.id AS match_id, m.round
  FROM tournament_matches m
  JOIN tournaments t ON t.id=m.tournament_id
  JOIN accounts a ON a.id=m.player0_account_id OR a.id=m.player1_account_id
  LEFT JOIN notifications n ON n.account_id=a.id AND n.subject=('tournament_match:' || m.id::text)
  WHERE n.id IS NULL AND m.status='pending' AND m.join_deadline_at>$1 AND t.status='in_progress'
    AND ($2::text IS NULL OR t.id::text=$2)
  ORDER BY m.id, a.id LIMIT ${RECIPIENTS_PER_SWEEP}`;

export async function notifyTournamentPlayers({ accounts, now }: Params): Promise<number> {
  await accounts.ensureReady();
  const waiting = await findRecipients({ db: accounts.pool, now });
  let notified = 0;
  for (const tournamentId of new Set(waiting.map((notification) => notification.payload.tournamentId))) {
    try {
      notified += await notifyTournament({ accounts, now, tournamentId });
    } catch (error) {
      logError(`[tournaments] notifying the players of ${tournamentId} failed`, error);
    }
  }
  return notified;
}

async function notifyTournament({ accounts, now, tournamentId }: TournamentParams): Promise<number> {
  const client = await accounts.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM tournaments WHERE id=$1 FOR UPDATE", [tournamentId]);
    const recipients = await findRecipients({ db: client, now, tournamentId });
    for (const notification of recipients) {
      await notify(client, notification);
    }
    await client.query("COMMIT");
    return recipients.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findRecipients({ db, now, tournamentId }: RecipientParams): Promise<TournamentPlayerNotification[]> {
  const scope = tournamentId ?? null;
  const started = await db.query<RecipientRow>(STARTED_RECIPIENTS, [now - START_ANNOUNCEMENT_WINDOW_MS, scope]);
  const ready = await db.query<RecipientRow>(MATCH_READY_RECIPIENTS, [now, scope]);
  return [...started.rows, ...ready.rows].map((row) => buildNotification(row, now));
}

function buildNotification(row: RecipientRow, now: number): TournamentPlayerNotification {
  const tournamentId = String(row.tournament_id);
  const recipient = { accountId: String(row.account_id), at: now };
  if (row.match_id === null) {
    return {
      ...recipient,
      kind: "tournament_started",
      subject: `tournament_started:${tournamentId}`,
      payload: { tournamentId, tournamentName: row.name },
    };
  }
  return {
    ...recipient,
    kind: "tournament_match_ready",
    subject: `tournament_match:${String(row.match_id)}`,
    payload: { tournamentId, tournamentName: row.name, round: Number(row.round) },
  };
}
