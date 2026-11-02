# Tournament Discord announcements

The API posts selected tournaments to the community Discord server and keeps tournament roles in sync. A dedicated bot, **Aegis Tournaments**, does the posting through the Discord REST API. It does not run a gateway bot or slash commands.

## What the bot does

| When                                      | What the bot does                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| An admin turns on **Announce on Discord** | Creates a text channel for the tournament and posts its announcement there.                                           |
| Every match of a round has its players    | Posts the round's pairings in its dedicated channel. Players with a linked Discord account are mentioned.             |
| A player registers, checks in or plays    | Gives the participant role while the tournament is open or running.                                                   |
| The tournament finishes                   | Posts the champion, Top 4 and Top 8 in its dedicated channel, removes the participant role and gives placement roles. |
| The tournament is cancelled               | Posts a cancellation notice in its dedicated channel.                                                                 |

Only admins can turn the flag on, in the tournament's admin controls. Any player can create a community tournament, so the flag keeps the server free of spam.

Each tournament gets a channel such as `torneio-copa-da-comunidade-a1b2c3d4`. The suffix distinguishes events with identical names. The channel stays available after the event ends. New channels use the reference channel’s category and explicit permission overrides; they do not add new audience permissions.

Open events using the old threads move to a dedicated channel on their next sync, with their announcement and active round republished. Previous thread messages and completed-event history remain untouched. Circuit-level result summaries continue to use the reference channel.

### Placements

- **Champion:** the tournament winner.
- **Top 4:** the finalist and the semifinal losers of the last bracket. Without a bracket, Swiss ranks 2–4.
- **Top 8:** the quarterfinal losers. Without a bracket, Swiss ranks 5–8.

Placement roles are permanent. A player keeps only their best placement role across all tournaments.

### Rounds

- A round is posted once. The bot waits until every match in the round has both players.
- If the bot catches up on a round that has already finished, it skips that round.
- Players without a linked Discord account appear by their Aegis name.

## Configuration

The sync runs in the tournament deadline worker, about every 15 seconds. It stays off until the token and reference channel are set.

| Variable                              | Required    | Value                                                                                                                              |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AEGIS_TOURNAMENT_DISCORD_BOT_TOKEN`  | Recommended | Token of the dedicated tournament bot. Falls back to `AEGIS_DISCORD_BOT_TOKEN`, then `DISCORD_BOT_TOKEN`.                          |
| `AEGIS_TOURNAMENT_DISCORD_CHANNEL_ID` | Yes         | Reference text channel: new tournament channels use its server, category and permission overrides. Circuit summaries still use it. |
| `AEGIS_TOURNAMENT_DISCORD_GUILD_ID`   | For roles   | Server ID. For channel creation it can be derived from the reference channel; roles require an explicit value.                     |
| `AEGIS_TOURNAMENT_DISCORD_ROLES`      | For roles   | JSON object. Keys: `participant`, `champion`, `top_four`, `top_eight`. Any subset works.                                           |
| `AEGIS_WEB_URL`                       | Yes in prod | Base URL for tournament links.                                                                                                     |

Example:

```sh
AEGIS_TOURNAMENT_DISCORD_CHANNEL_ID=123456789012345678
AEGIS_TOURNAMENT_DISCORD_GUILD_ID=123456789012345679
AEGIS_TOURNAMENT_DISCORD_ROLES='{"participant":"223456789012345678","champion":"223456789012345679","top_four":"223456789012345680","top_eight":"223456789012345681"}'
```

If a value is invalid, the API logs an error and keeps the sync off. Other API features keep working.

### Bot permissions

The bot needs **Manage Channels** in the server to create tournament channels. It also needs these permissions in the reference channel and the new channels:

- View Channel
- Send Messages
- Embed Links
- Read Message History

For roles, the bot needs **Manage Roles**. Its highest role must be above every configured tournament role. Use dedicated roles: the bot adds and removes only the roles in `AEGIS_TOURNAMENT_DISCORD_ROLES`.

## Failures

- Each tournament retries on its own schedule. Backoff starts at 2 minutes and is capped at 1 hour. A `429` waits at least Discord's `Retry-After`.
- A player who has not linked Discord is retried every hour.
- Channels carry a stable tournament identifier in their topic. A retry searches for that identifier before creating a channel, recovering channels created before a failed database save or an ambiguous network response.
- The channel ID is persisted before the announcement is sent. A failed announcement retries in that same channel.
- If a message succeeds but saving its state fails, a retry can post the message again.

Persistence is described in [COLLECTIONS.md](../COLLECTIONS.md#tournament-discord-announcements).

Discord API references: [Create Guild Channel](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx#create-guild-channel) and [channel permissions](https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx).

The tournament detail page links directly to its Discord channel once synchronization creates it. The stored guild and channel IDs keep this link available after completion. Tournament channels and their message history remain in Discord after completion or cancellation.
