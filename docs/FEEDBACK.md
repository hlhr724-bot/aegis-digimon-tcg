# Feedback and community roadmap

Players send private reports from the game. Admins triage them. Bugs also go to
GitHub, and admins choose which ideas appear on the public roadmap.

## Reports

The report dialog posts to `POST /bug-reports`. The API always saves the report in
`feedback_reports`. A report sent from a match also keeps a copy of the match replay
in `feedback_report_replays` for 30 days (`AEGIS_REPLAY_RETENTION_DAYS`).

### Replay capture

While a room plays, the logger copies each replay line (`replay.*` and `intent.*`) of
the match to `<AEGIS_LOG_DIR>/replays/<matchId>.jsonl`, besides the normal log segment.
The folder is created on the first write. All API instances share the log directory, so
any instance can answer a report about a match another instance hosted.

When a report names a match, the API reads only that file and rebuilds the replay with
`extractReplay`. It never scans the `api-*.jsonl` segments. The read has a 3-second
budget (`AEGIS_REPLAY_CAPTURE_TIMEOUT_MS`) and runs at most two at a time. The report
carries one of these outcomes:

| Outcome          | Cause                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| saved            | The file rebuilt a complete replay.                                      |
| `logs_not_found` | No file (pruned, or match played before this change), bad ID, no header. |
| `timed_out`      | The read took longer than the budget.                                    |
| `busy`           | Two captures were already running.                                       |
| `too_large`      | The record is over `AEGIS_REPLAY_MAX_CHARS`.                             |
| `error`          | Any other failure.                                                       |

The API deletes a match file 12 hours after its last write, the same rule as the log
segments. A failed write goes to stderr and never stops the match.

Admins triage reports at `/admin/feedback`. Signed-in reporters follow their own
reports at `/feedback`.

## Official tournament requests

The organizer of a community tournament can ask admins to make it official
through the API until the event starts. The web app has no request form.

The API stores each request in `feedback_reports` with the kind
`official_tournament`. The report JSON holds `tournamentId`, and the description
holds the organizer's optional message (up to 1,000 characters). Requests never go
to GitHub, and the public report form refuses this kind.

| Rule        | Behavior                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Who can ask | The tournament organizer                                                                       |
| When        | Status `draft`, `registration` or `check_in`, category `community`                             |
| How many    | One open request per tournament                                                                |
| Cancel      | The organizer can cancel an open request; the row is deleted                                   |
| Approve     | An admin sets the request to Resolved; the tournament becomes official in the same transaction |
| Decline     | An admin closes it as Won't fix or Duplicate; the organizer sees the reply and can ask again   |

The organizer gets the usual feedback notification when the status changes.

| Route                                      | Access    | Purpose                       |
| ------------------------------------------ | --------- | ----------------------------- |
| `GET /tournaments/:id/official-request`    | Organizer | The latest request, or `null` |
| `POST /tournaments/:id/official-request`   | Organizer | `{ message?: string }`        |
| `DELETE /tournaments/:id/official-request` | Organizer | Cancel the open request       |

## GitHub mirror

Only **bug** reports are filed on GitHub. Ideas and other feedback stay private, with
`github_status = 'disabled'`. The dialog shows the public-repository notice only
while the reporter has Bug selected.

The mirror is off unless the API has:

| Variable                  | Value                                                |
| ------------------------- | ---------------------------------------------------- |
| `FEEDBACK_GITHUB_ENABLED` | `true`                                               |
| `GITHUB_TOKEN`            | Token that can create issues in the repository       |
| `GITHUB_BUG_REPOSITORY`   | `owner/repo`                                         |
| `AEGIS_API_URL`           | Public API origin, used for the replay download link |

The API files the issue while it answers the report. It does not retry later, and it
does not file reports saved while the mirror was off.

### Replay download

When a bug report has a replay, the issue links to
`GET /bug-reports/<id>/replay`. The route answers only for bug reports whose issue
was filed (`github_status = 'sent'`), so guessing report numbers reveals nothing that
is not already linked from a public issue. It is rate limited per address and answers
404 once the replay expires.

The replay has no player names by design: `ReplayRecord` holds only the seed, rules,
both decks and the inputs. Maintainers can still run `pnpm replay fetch <id>`.

## Community roadmap

`/roadmap` shows public items in four columns:

| Column         | Status         |
| -------------- | -------------- |
| Planned        | `planned`      |
| In development | `in_progress`  |
| Under review   | `under_review` |
| Completed      | `completed`    |

Each column shows its 20 most supported items. Signed-in players can support an
item once; guests are sent to sign in. Each item has a page at `/roadmap/<id>` with
its description and an optional Discord thread link. There are no comments on the
site; discussion happens on Discord.

Roadmap items live in `roadmap_items`, separate from reports. Changing an item's
column does not change the status of the report it came from, and does not notify
the reporter.

### Admin flow

- **Publish a report.** In the triage screen, the "Publish to the roadmap" form
  starts with the report's summary and description. Edit them before publishing:
  the report stays private, and only the public title and description appear, with
  no author. A report can be published once.
- **Edit or remove an item.** On the item page, admins can change the title,
  description, column and Discord link, or remove the item with its support.

Discord links must be `https://` links on `discord.com` or `discord.gg`.

### Seed

Migration 034 seeds 20 items from the curated community requests reviewed on
2026-10-12. Ranked / Leaderboard starts as Planned and the rest as Under review.

### Routing

`/roadmap` is the page. The web app calls the API under `/community/roadmap`, because the
installed slot gateway already sends `/community/*` requests that do not accept `text/html` to
the API. The API also answers the same routes at `/roadmap` for direct deployments, and the
gateway source routes `/roadmap` the same way once it is reinstalled.

## API

| Route                                     | Access    | Purpose                                |
| ----------------------------------------- | --------- | -------------------------------------- |
| `GET /community/roadmap`                  | Public    | All items, most supported first        |
| `GET /community/roadmap/:id`              | Public    | One item                               |
| `PUT /community/roadmap/:id/support`      | Signed in | `{ supported: boolean }`               |
| `POST /account/admin/roadmap`             | Admin     | Create, optionally from a report       |
| `PUT /account/admin/roadmap/:id`          | Admin     | Replace title, text, column and link   |
| `DELETE /account/admin/roadmap/:id`       | Admin     | Remove the item and its support        |
| `GET /account/admin/feedback/:id/roadmap` | Admin     | The item published from a report       |
| `GET /bug-reports/:id/replay`             | Public    | Anonymous replay of a filed bug report |

## Deck performance

The profile supports the following grouped feedback requests:

| Reports                | Behavior                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| #364, #514, #657, #668 | Compare wins, losses, draws and win rate by saved deck; filter match history by deck; compare total results with results since the last card change. |
| #663                   | Identify the deck in match results and history, and inspect the frozen deck used by either participant when available.                               |
| #406                   | Deferred: deck matchup analysis is not currently exposed in the profile or history response.                                                         |

Deck totals survive recent-history pruning. Players can count each deck's last 100 human matches or all of them; the window changes the deck total and the deck comparison, while the current-list period always counts every match since the last card change. Cosmetic edits and renames do not reset the current-list period. Result filters affect the history list, while mode and opponent filters scope personal statistics. Older matches without deck attribution cannot contribute retroactively.

Deck matchup analysis is deferred. The profile and history response do not expose or compute personal/community matchup aggregates. Existing composition metadata is retained for a future design.
