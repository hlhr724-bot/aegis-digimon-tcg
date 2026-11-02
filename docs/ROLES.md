# Account roles

Each account has a set of roles. An account with no role is a normal player. Admins give and remove roles on the admin page (`/admin/feedback`).

## Roles

| Role               | Serialized value | What the account can do                                                                   |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------- |
| Admin              | `admin`          | Everything below, plus every admin tool: feedback triage, moderation, circuits and roles. |
| Judge              | `judge`          | Rule on ranked game reports. Use the arbitration commands in any tournament.              |
| Official organizer | `organizer`      | Create official tournaments directly, with no limit on open tournaments.                  |
| (none)             | —                | Play, and create one open community tournament at a time.                                 |

An account can hold several roles. The shared `AccountRole` enum defines each role's capabilities, and the API checks capabilities, not role names. Only admins approve a request to make a community tournament official.

An admin cannot remove their own admin role, so the site always keeps at least the admin making the change.

`ADMIN_DISPLAY_NAME` still seeds the first admin through migration 013, which runs before migration 050 turns that flag into the `admin` role.

## API

| Route                                 | Who   | Purpose                                     |
| ------------------------------------- | ----- | ------------------------------------------- |
| `GET /account/admin/roles?query=`     | Admin | Role holders, or accounts matching the name |
| `PUT /account/admin/roles/:accountId` | Admin | Replace an account's roles                  |

Ranked report review (`/account/admin/ranked/reports`) accepts judges as well as admins and answers `403 judge_required` otherwise. Tournament arbitration (`/tournaments/:id/arbitration/...`) accepts the tournament's creator and any judge.
