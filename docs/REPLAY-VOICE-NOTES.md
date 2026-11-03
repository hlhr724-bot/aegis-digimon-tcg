# Replay voice notes (not built)

Voice notes would let a player record audio on a replay moment. We did not
build them, because Aegis has no safe path for user-uploaded audio. This note
lists what that path would need, so the work can be planned.

## Why we stopped

The only user-uploaded media today is the profile picture. See
[avatar moderation](AVATAR-MODERATION.md). That flow does not fit audio:

| Need       | Avatar flow today                                | Gap for voice notes                                   |
| ---------- | ------------------------------------------------ | ----------------------------------------------------- |
| Media type | PNG and JPEG only                                | Audio container and codec checks (WebM/Opus, MP4/AAC) |
| Size       | Small images, stored in the `accounts` row       | Up to hundreds of KB per note, many per match         |
| Storage    | `bytea` column; deleted with the account         | Object storage, or a quota-limited table              |
| Moderation | OpenAI image moderation, then a local NSFW model | No audio moderation; needs speech-to-text first       |
| Retention  | Lives as long as the account                     | Must follow replay and annotation retention           |
| Serving    | Public, immutable avatar URL                     | Private by default; must follow replay visibility     |

The replay recorder (`apps/web/src/replays/screenRecording.ts`) encodes video on
the viewer's device and never uploads it. It does not solve server storage.

## What a safe design needs

1. **Contract.** A `ReplayVoiceNote` type in `packages/shared/src/replays/annotations/`
   with the same author, match, frame and turn fields as `ReplayNote`, plus
   duration, byte size and MIME type.
2. **Limits.** At most 60 seconds and 512 KiB per note, 10 voice notes per
   author and match, and a per-account byte quota under the account row lock,
   like friends-only replay files (128 MiB per account).
3. **Upload.** `express.raw` on one route with an allowlist of MIME types. The
   API checks the container header and the decoded duration, not only the
   declared type. Uploads are rate-limited per account.
4. **Moderation.** Private notes need none. Before a voice note is shared with a
   replay, the API transcribes it, runs the transcript through the community
   text checks (`hasBlockedCommunityText`), and refuses to share it when no
   check can run. This mirrors the avatar rule: never publish unchecked media.
5. **Storage.** A `replay_voice_notes` table with a `bytea` column and a
   cascading author foreign key is the smallest step, matching
   `friend_replay_files`. Larger volumes would need object storage with
   server-side encryption and signed, short-lived download URLs.
6. **Serving.** Downloads go through the API, which rechecks the same access
   rules as `GET /replay-annotations/:matchId`. Responses send
   `Cache-Control: private, no-store` and `Content-Disposition: attachment`.
7. **Retention.** The annotation cleanup job also removes voice notes, and
   account deletion cascades.
8. **Privacy policy.** Update the privacy policy (`apps/web/src/legal/privacyPolicy.ts`)
   to cover stored voice recordings, transcription and the third party that
   transcribes them.

## A cheaper alternative

Creators who want narration can record it with their own tools while the replay
plays, or the built-in recorder could mix the microphone into the local video.
Both keep audio on the creator's device, so the server stores nothing. Text
notes and YouTube chapters already cover the shared, searchable part.
