import type { Migration } from "#api/db/migrator";

const STATEMENTS = [
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''",
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS password_hash text",
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'standard'",
  `CREATE TABLE IF NOT EXISTS account_active_rooms (account_id uuid PRIMARY KEY REFERENCES accounts(id), room_id text NOT NULL, expires_at bigint NOT NULL)`,
  "CREATE TABLE IF NOT EXISTS ranked_control (id integer PRIMARY KEY)",
  "INSERT INTO ranked_control (id) VALUES (1) ON CONFLICT DO NOTHING",
  `CREATE TABLE IF NOT EXISTS ranked_seasons (id integer PRIMARY KEY, starts_at bigint NOT NULL, ends_at bigint NOT NULL, finalized boolean NOT NULL DEFAULT false)`,
  `CREATE TABLE IF NOT EXISTS ranked_ratings (account_id uuid NOT NULL REFERENCES accounts(id), format text NOT NULL, rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 0), PRIMARY KEY(account_id, format))`,
  `CREATE TABLE IF NOT EXISTS ranked_standings (season_id integer NOT NULL REFERENCES ranked_seasons(id), account_id uuid NOT NULL REFERENCES accounts(id), format text NOT NULL, region text NOT NULL, rating integer NOT NULL DEFAULT 1000, peak_rating integer, wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0, PRIMARY KEY(season_id, account_id, format))`,
  `CREATE TABLE IF NOT EXISTS ranked_pairs (id uuid PRIMARY KEY, format text NOT NULL, slot text NOT NULL, room_id text UNIQUE, status text NOT NULL, created_at bigint NOT NULL, reservation_expires_at bigint NOT NULL, started_at bigint, heartbeat_at bigint NOT NULL, season_id integer REFERENCES ranked_seasons(id), result_id uuid UNIQUE REFERENCES match_records(id))`,
  `CREATE TABLE IF NOT EXISTS ranked_queue (account_id uuid PRIMARY KEY REFERENCES accounts(id), search_id text NOT NULL, format text NOT NULL, region text NOT NULL, slot text NOT NULL, rating integer NOT NULL, deck jsonb NOT NULL, banlist jsonb NOT NULL, queued_at bigint NOT NULL, heartbeat_at bigint NOT NULL, pair_id uuid REFERENCES ranked_pairs(id), token text NOT NULL, joined boolean NOT NULL DEFAULT false)`,
  "CREATE INDEX IF NOT EXISTS ranked_queue_waiting ON ranked_queue(format, slot, queued_at)",
  `CREATE TABLE IF NOT EXISTS ranked_pair_players (pair_id uuid NOT NULL REFERENCES ranked_pairs(id), account_id uuid NOT NULL REFERENCES accounts(id), seat integer NOT NULL CHECK (seat IN (0,1)), region text NOT NULL, PRIMARY KEY(pair_id, account_id), UNIQUE(pair_id, seat))`,
  `CREATE TABLE IF NOT EXISTS ranked_rewards (season_id integer NOT NULL REFERENCES ranked_seasons(id), account_id uuid NOT NULL REFERENCES accounts(id), tier text NOT NULL, equipped boolean NOT NULL DEFAULT false, granted_at bigint NOT NULL, PRIMARY KEY(season_id, account_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ranked_one_equipped_reward ON ranked_rewards(account_id) WHERE equipped`,
  `CREATE TABLE IF NOT EXISTS ranked_discord (account_id uuid PRIMARY KEY REFERENCES accounts(id), opted_in boolean NOT NULL DEFAULT false, status text, desired_tier text, applied_role text, updated_at bigint NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0, retry_at bigint NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS competitive_match_facts (match_id text NOT NULL, account_id uuid NOT NULL REFERENCES accounts(id), opponent_account_id uuid NOT NULL REFERENCES accounts(id), origin text NOT NULL, format text NOT NULL, region text, archetype text NOT NULL, opponent_archetype text NOT NULL, classifier_version integer NOT NULL, result text NOT NULL, finished_at bigint NOT NULL, PRIMARY KEY(match_id, account_id))`,
  `CREATE INDEX IF NOT EXISTS competitive_match_facts_filters ON competitive_match_facts(origin, format, finished_at)`,
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS discord_announce boolean NOT NULL DEFAULT false",
  `CREATE TABLE IF NOT EXISTS tournament_discord_posts (
    tournament_id uuid PRIMARY KEY REFERENCES tournaments(id),
    announcement_message_id text,
    thread_id text,
    closed_at bigint,
    attempts integer NOT NULL DEFAULT 0,
    retry_at bigint NOT NULL DEFAULT 0,
    lease_until bigint NOT NULL DEFAULT 0,
    updated_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_discord_rounds (
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    phase_id uuid NOT NULL,
    round integer NOT NULL,
    message_id text,
    posted_at bigint NOT NULL,
    PRIMARY KEY (tournament_id, phase_id, round)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_discord_placements (
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    account_id uuid NOT NULL REFERENCES accounts(id),
    placement text NOT NULL CHECK (placement IN ('champion','top_four','top_eight')),
    PRIMARY KEY (tournament_id, account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_discord_members (
    account_id uuid PRIMARY KEY REFERENCES accounts(id),
    applied_roles text NOT NULL DEFAULT '',
    attempts integer NOT NULL DEFAULT 0,
    retry_at bigint NOT NULL DEFAULT 0,
    updated_at bigint NOT NULL
  )`,
  "ALTER TABLE ranked_pairs ADD COLUMN IF NOT EXISTS match_log_id text",
  "ALTER TABLE ranked_pairs ADD COLUMN IF NOT EXISTS voided_at bigint",
  "ALTER TABLE ranked_pair_players ADD COLUMN IF NOT EXISTS rating_before integer",
  "ALTER TABLE ranked_pair_players ADD COLUMN IF NOT EXISTS rating_after integer",
  "ALTER TABLE ranked_pair_players ADD COLUMN IF NOT EXISTS peak_before integer",
  `CREATE TABLE IF NOT EXISTS ranked_game_reports (
    id uuid PRIMARY KEY,
    pair_id uuid NOT NULL UNIQUE REFERENCES ranked_pairs(id),
    season_id integer NOT NULL REFERENCES ranked_seasons(id),
    reporter_account_id uuid NOT NULL REFERENCES accounts(id),
    description text NOT NULL,
    turn integer NOT NULL CHECK (turn >= 0),
    status text NOT NULL CHECK (status IN ('pending','confirmed','rejected')),
    created_at bigint NOT NULL,
    resolved_at bigint,
    resolver_account_id uuid REFERENCES accounts(id),
    replay jsonb,
    replay_input_count integer
  )`,
  "CREATE INDEX IF NOT EXISTS ranked_game_reports_reporter ON ranked_game_reports(reporter_account_id, season_id)",
  "CREATE INDEX IF NOT EXISTS ranked_game_reports_pending ON ranked_game_reports(status, season_id)",
  `CREATE TABLE IF NOT EXISTS player_trophies (
    account_id uuid NOT NULL REFERENCES accounts(id),
    source_kind text NOT NULL CHECK (source_kind IN ('tournament','ranked_season','tournament_circuit')),
    source_key text NOT NULL,
    award text NOT NULL,
    tier text NOT NULL CHECK (tier IN ('bronze','silver','gold','rainbow')),
    tournament_id uuid REFERENCES tournaments(id),
    season_id integer REFERENCES ranked_seasons(id),
    format text,
    awarded_at bigint NOT NULL,
    PRIMARY KEY (account_id, source_kind, source_key)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_trophy_grants (
    tournament_id uuid PRIMARY KEY REFERENCES tournaments(id),
    granted_at bigint NOT NULL
  )`,
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'community' CHECK (category IN ('community','official'))",
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS random_bot_styles boolean NOT NULL DEFAULT false",
  `CREATE TABLE IF NOT EXISTS tournament_reports (
    id serial PRIMARY KEY,
    tournament_id uuid NOT NULL,
    tournament_name text NOT NULL,
    reporter_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    reason text NOT NULL CHECK (reason IN ('offensive_content','fake_event','organizer_abuse','other')),
    details text,
    created_at bigint NOT NULL,
    resolved_at bigint,
    resolution text CHECK (resolution IS NULL OR resolution IN ('dismiss','delete_tournament')),
    resolved_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS tournament_reports_open_idx ON tournament_reports (tournament_id, resolved_at)",
  "UPDATE tournaments SET ruleset_preset='aegis_community' WHERE ruleset_preset='aegis_lightning'",
  `CREATE TABLE IF NOT EXISTS tournament_result_exports (
    tournament_id uuid PRIMARY KEY REFERENCES tournaments(id),
    schema_version integer NOT NULL CHECK (schema_version >= 1),
    payload jsonb NOT NULL,
    created_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_circuits (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('active','finished','cancelled')),
    starts_at bigint NOT NULL,
    ends_at bigint NOT NULL,
    time_zone text NOT NULL,
    cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly','monthly')),
    slots jsonb NOT NULL,
    lead_time_ms bigint NOT NULL CHECK (lead_time_ms > 0),
    check_in_window_ms bigint NOT NULL CHECK (check_in_window_ms > 0),
    template jsonb NOT NULL,
    points_table jsonb NOT NULL,
    participation_points integer NOT NULL CHECK (participation_points >= 0),
    created_by uuid NOT NULL REFERENCES accounts(id),
    created_at bigint NOT NULL,
    finalized_at bigint,
    CHECK (ends_at > starts_at)
  )`,
  "ALTER TABLE tournament_circuits ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly','monthly'))",
  "CREATE INDEX IF NOT EXISTS tournament_circuits_status_idx ON tournament_circuits (status, ends_at)",
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS circuit_id uuid REFERENCES tournament_circuits(id)",
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS auto_start boolean NOT NULL DEFAULT false",
  "CREATE INDEX IF NOT EXISTS tournaments_circuit_idx ON tournaments (circuit_id, starts_at)",
  "CREATE INDEX IF NOT EXISTS tournaments_auto_start_idx ON tournaments (auto_start, status, starts_at)",
  `CREATE TABLE IF NOT EXISTS tournament_circuit_scores (
    tournament_id uuid PRIMARY KEY REFERENCES tournaments(id),
    circuit_id uuid NOT NULL REFERENCES tournament_circuits(id),
    scored_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_circuit_points (
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    account_id uuid NOT NULL REFERENCES accounts(id),
    circuit_id uuid NOT NULL REFERENCES tournament_circuits(id),
    placement integer,
    points integer NOT NULL CHECK (points >= 0),
    PRIMARY KEY (tournament_id, account_id)
  )`,
  "CREATE INDEX IF NOT EXISTS tournament_circuit_points_circuit_idx ON tournament_circuit_points (circuit_id, account_id)",
  `CREATE TABLE IF NOT EXISTS tournament_circuit_results (
    circuit_id uuid PRIMARY KEY REFERENCES tournament_circuits(id),
    standings jsonb NOT NULL,
    frozen_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_circuit_discord_posts (
    circuit_id uuid PRIMARY KEY REFERENCES tournament_circuits(id),
    message_id text,
    attempts integer NOT NULL DEFAULT 0,
    retry_at bigint NOT NULL DEFAULT 0,
    lease_until bigint NOT NULL DEFAULT 0,
    posted_at bigint,
    updated_at bigint NOT NULL
  )`,
  "ALTER TABLE player_trophies ADD COLUMN IF NOT EXISTS circuit_id uuid REFERENCES tournament_circuits(id)",
];

export const communityTournaments: Migration = {
  id: "044-community-tournaments",
  up: async (db) => {
    for (const statement of STATEMENTS) {
      await db.query(statement);
    }
  },
};
