# Replay annotations

Players can mark pivotal moments of a match, live or while they watch the
replay. The markers help them learn from past games and make content, such as
replay reviews on YouTube.

## What a player can do

| Where              | Action                                                          |
| ------------------ | --------------------------------------------------------------- |
| During a match     | Drop an emoji marker on the current moment from the chat window |
| In the replay view | Drop an emoji marker on the shown action                        |
| In the replay view | See markers on the timeline and jump to one with a click        |
| In the replay view | Delete their own markers from the annotations panel             |

## Model

- An annotation belongs to its author and to a match. The match ID is the
  replay summary ID (`MatchReplay.id`), the same ID that `account_replays.match_id`
  stores. Every copy of the replay, local file, Drive file or shared link, finds
  the same annotations.
- A moment is a replay frame index. The API also stores the turn shown at that
  frame so lists can show it without the replay file.
- The server stores annotations in its database. It never writes them into the
  replay file, so a downloaded or Drive copy stays unchanged.

## Live markers

- The client sends only the emoji. The room picks the moment from its own
  recording: the latest recorded frame and the current turn.
- The room answers only the sender. Markers stay out of the state patch, the
  event channel, the replay file and the input record. The opponent cannot see
  a marker or infer it from timing.
- A failed database write does not touch the match. The room logs it and the
  sender sees no confirmation.
- Guests cannot mark, because a marker needs an author account.

## Who can annotate

A signed-in viewer can annotate a match when one of these is true:

- they have their own `account_replays` row for it, as a player or spectator; or
- a saved replay of it is shared with them: public, or friends-only while they
  are friends and neither blocks the other.

## Visibility

Markers are private. Only their author can list them.

## Limits

| Limit                        | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| Markers per author and match | 100                                                 |
| Live markers                 | One per second per author                           |
| HTTP writes                  | Token bucket of 20, one token per 3 s               |
| HTTP reads                   | Token bucket of 30, one token per 2 s               |
| Emoji                        | One of the eight `ReplayMarkerEmoji` values         |
| Frame index                  | 0 to 4999 (the recording keeps at most 5000 frames) |

## Retention

- Deleting an account deletes its annotations.
- The replay cleanup job deletes annotations older than seven days whose match
  has no `account_replays` row left. This matches the seven-day retention of
  unsaved replay rows.
