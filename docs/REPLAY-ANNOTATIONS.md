# Replay annotations

Players can mark pivotal moments of a match and write notes about them, live
or while they watch the replay. The markers help them learn from past games and make content, such as
replay reviews on YouTube.

## What a player can do

| Where              | Action                                                          |
| ------------------ | --------------------------------------------------------------- |
| During a match     | Drop an emoji marker on the current moment from the chat window |
| During a match     | Write a private text note on the current moment                 |
| In the replay view | Drop an emoji marker or write a note on the shown action        |
| In the replay view | See markers and notes on the timeline and jump with a click     |
| In the replay view | Edit their own notes and delete their own markers and notes     |
| In the replay view | Copy a link to the shown moment                                 |
| In the replay view | Copy their annotations as YouTube chapters                      |

## Model

- An annotation belongs to its author and to a match. The match ID is the
  replay summary ID (`MatchReplay.id`), the same ID that `account_replays.match_id`
  stores. Every copy of the replay, local file, Drive file or shared link, finds
  the same annotations.
- A moment is a replay frame index. The API also stores the turn shown at that
  frame so lists can show it without the replay file.
- The server stores annotations in its database. It never writes them into the
  replay file, so a downloaded or Drive copy stays unchanged.

## Live annotations

- The client sends only the emoji or the note text. The room picks the moment from its own
  recording: the latest recorded frame and the current turn.
- The room answers only the sender. Annotations stay out of the state patch, the
  event channel, the replay file and the input record. The opponent cannot see
  an annotation or infer it from timing.
- A failed database write does not touch the match. The room logs it and the
  sender sees no confirmation.
- Guests cannot annotate, because an annotation needs an author account.

## Who can annotate

A signed-in viewer can annotate a match when one of these is true:

- they have their own `account_replays` row for it, as a player or spectator; or
- a saved replay of it is shared with them: public, or friends-only while they
  are friends and neither blocks the other.

## Visibility

Annotations are private. Only their author can see, edit or delete them, even
on a public or friends-only replay. Other viewers, including the replay owner,
never receive someone else's annotations. There is no sharing setting.

## Content workflow

- **Deep link.** "Copy link to this moment" copies `/replays/<replayId>?at=<action>`.
  The link opens the replay at that action (one-based, as the timeline shows).
  The usual replay access rules decide who can open it. The button appears when
  the replay has a shareable index ID: the viewer opened a shared link, or owns a
  saved copy.
- **YouTube chapters.** "Copy YouTube chapters" copies one line per annotation,
  for example `1:23 ⭐ Key moment · Turn 4`. The list starts at `0:00` with the
  player names. YouTube needs chapters at least 10 seconds apart, so an
  annotation closer than 10 seconds to the previous chapter joins that chapter's
  title. Times follow playback from the first action at 1× speed with the
  current "Skip thinking time" setting, which is how the built-in replay recorder
  plays. Animations can add a few seconds, so creators should check the times
  against their video. The panel also shows the text so it can be copied by hand
  when the clipboard is blocked.

## Limits

| Limit                        | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| Markers per author and match | 100                                                 |
| Notes per author and match   | 50                                                  |
| Note length                  | 1 to 500 code points after normalization            |
| Live annotations             | One per second per author                           |
| HTTP writes                  | Token bucket of 20, one token per 3 s               |
| HTTP reads                   | Token bucket of 30, one token per 2 s               |
| Emoji                        | Exactly one emoji; the eight presets come first     |
| Frame index                  | 0 to 4999 (the recording keeps at most 5000 frames) |

## Retention

- Deleting an account deletes its annotations.
- The replay cleanup job deletes annotations older than seven days whose match
  has no `account_replays` row left. This matches the seven-day retention of
  unsaved replay rows.
