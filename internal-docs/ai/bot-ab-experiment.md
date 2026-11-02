# Bot A/B experiment

The API can split human-vs-bot practice matches between bot policies and record
which policy each match used. The experiment is off unless you set
`AEGIS_BOT_EXPERIMENT`. Without it, bot seating is the same as before.

## Arms

| Arm                 | Bot policy                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `certified`         | The certified residual policy with the selected style, without search. It has not played people yet. |
| `legacy`            | The evaluation bot (`createEvaluationPolicy`) production runs today. Also the default when off.      |
| `humanPanel`        | The `human-panel-v2` scoring program (`apps/api/src/bot/evolution/programs/human-panel-v2.json`).    |
| `humanPanelPlanner` | The same program, with the main-phase turn planner and the planner settings from that file.          |

## Enable it

Set `AEGIS_BOT_EXPERIMENT` to inline JSON or to the path of a JSON file, then
restart the API:

```sh
AEGIS_BOT_EXPERIMENT='{"id":"bot-ab-2026-10","arms":{"legacy":50,"certified":25,"humanPanelPlanner":25}}'
```

Rules, checked at startup:

- `id`: 3 to 64 lowercase letters, digits or hyphens. Use a new id for each
  experiment. A new id reshuffles every match.
- `arms`: arm names from the table above, each with an integer weight from 1 to 100. Weights must sum to 100.
- Any other field, an unknown arm, bad weights, unreadable files or malformed
  JSON stop the API from starting.

The experiment applies only to Standard difficulty in human-vs-bot practice rooms.
The selected style applies to every arm; other difficulty levels bypass assignment. It does not apply to
tournament bots, ranked or private rooms, story battles, developer scenarios or
scenario fixtures. If `AEGIS_BOT_HEURISTIC` or `AEGIS_BOT_CHECKPOINT` is set,
that policy wins, the API logs that the experiment stays off, and no match gets
an arm.

## How a match gets its arm

The room hashes the experiment id and the match id (SHA-256) into one of 100
buckets and walks the arm weights in order. The same match always gets the same
arm, so a reload or a repeated bot join keeps it.

If a candidate arm throws, fails an answer or has an action rejected by the
engine, the bot switches to the `legacy` policy for the rest of that match.
The record then has `botArmFallback: true`. A single slow answer (over one
second) uses the older evaluation bot for that one decision only; the match-end
log line counts these as `inferenceFallbacks`.

## Where results are recorded

- `account_recent_matches.record` for the signed-in human gets `botExperiment`,
  `botArm` and, after a fallback, `botArmFallback`. The player-facing history
  endpoint strips these fields.
- Log lines: `bot.seated` (with `botExperiment` and `botArm`),
  `bot.experiment.fallback`, and `bot.experiment.result` (bot result, reason and
  fallback counts). Logs also cover guests.

Limits of the table: guests have no record, and each account keeps only its
newest 100 matches. Pruning does not depend on the arm, so it costs data, not
fairness. Export results regularly during a long experiment.

## Recommended first rollout

1. Run `legacy` 50, `certified` 25, `humanPanelPlanner` 25. `legacy` is the bot production runs today.
2. After a day, check the fallback rate and error logs. Expect almost no
   fallbacks.
3. If the candidate is healthy, keep the split until the sample size below is
   reached. Raise the candidate share to 50 to reach it faster.

## Compute results

Run this read-only query. `result` is from the human's side, so a human `loss`
is a bot win.

```sql
SELECT
  record->>'botArm' AS arm,
  count(*) AS games,
  count(*) FILTER (WHERE record->>'reason' IN ('security', 'deckOut', 'effect')) AS decided,
  count(*) FILTER (WHERE record->>'reason' IN ('security', 'deckOut', 'effect') AND record->>'result' = 'loss') AS bot_wins_decided,
  count(*) FILTER (WHERE record->>'reason' = 'security' AND record->>'result' = 'loss') AS bot_wins_by_security,
  count(*) FILTER (WHERE record->>'reason' = 'security' AND record->>'result' = 'win') AS bot_losses_by_security,
  count(*) FILTER (WHERE record->>'reason' = 'surrender' AND record->>'result' = 'loss') AS human_surrenders,
  count(*) FILTER (WHERE record->>'reason' = 'timeout') AS timeouts,
  count(*) FILTER (WHERE record->>'botArmFallback' = 'true') AS fallbacks
FROM account_recent_matches
WHERE record->>'botExperiment' = 'bot-ab-2026-10'
GROUP BY 1
ORDER BY 1;
```

## Decision rule

Set the rule before you look at results:

- **Primary metric:** bot win rate in decided games (`bot_wins_decided / decided`).
  Compare each arm with `legacy` using a two-proportion test.
- **Sample size:** to detect a 5-point change near 50 percent (two-sided 5
  percent significance, 80 percent power) you need about 1,570 decided games per
  arm at a 50/50 split, or about 870 candidate and 7,840 control games at 10/90.
  Stop at that size, or use a sequential test (for example, an O'Brien-Fleming
  boundary) if you want to check early. Do not stop the first time a plain test
  looks significant.
- **Report separately:** surrender rate (`human_surrenders / games`), timeout
  rate and fallback rate. A stronger bot can cause more surrenders, so if
  surrender rates differ a lot between arms, also report the bot win rate over
  all games, counting a human surrender as a bot win.
- Many games come from a few players. Check that the result holds when you
  count each account's games once (per-account win rate), not only overall.

## Roll back

Unset `AEGIS_BOT_EXPERIMENT` and restart the API. New matches use the legacy
bot again. Recorded fields stay in old records and do no harm.
