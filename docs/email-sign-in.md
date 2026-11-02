# Email sign-in

Players without Discord sign in with a one-use link sent by email. The API owns the whole flow
in [routes](../apps/api/src/accounts/routes.ts) and [AccountStore](../apps/api/src/accounts/AccountStore.ts).

## Flow

1. The web app sends `POST /auth/magic-link` with the email address and, when Turnstile is on,
   a `turnstileToken`.
2. The API checks the Turnstile token, then the request limits, then creates a token that
   expires after 15 minutes and emails a link to `GET /auth/magic-link/consume?token=…`.
3. `GET` only shows a page with a **Sign in** button. It never uses up the token.
4. The button sends `POST /auth/magic-link/consume`. That request uses up the token, starts the
   session, and redirects to the web app.

Step 3 exists because email security scanners (Outlook Safe Links, Defender, Proofpoint and
others) open every link in an email before the player does. When `GET` used up the token, the
player's own click always failed with "invalid or expired sign-in link" (issue #5458).

## Local development

Start PostgreSQL and a local Mailpit inbox before running the app:

```sh
brew services start postgresql@16
mkdir -p .local
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --database .local/mailpit.db
```

Configure the ignored `apps/api/.env.development` file:

```dotenv
AEGIS_DEV_SMTP_URL=smtp://127.0.0.1:1025
AEGIS_API_URL=http://localhost:2567
AEGIS_WEB_URL=http://localhost:5173
```

Set `DATABASE_URL` there if PostgreSQL is not available through the default local
connection. Restart `pnpm dev` after changing API configuration. Request a sign-in
link in the app and open it from [the local inbox](http://127.0.0.1:8025).
Messages stay on the machine. This creates or uses an account in the local database;
it does not access the account or decks from the deployed site.

`AEGIS_DEV_SMTP_URL` overrides external delivery only outside production and accepts
only an SMTP server on a loopback hostname. Production ignores this setting.

## Responses

| Status | Body                                | Cause                                                                        |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| 202    | `{ "ok": true }`                    | Accepted. The API never says whether an account exists or the email arrived. |
| 403    | `{ "error": "human_check_failed" }` | Turnstile is on and the token is missing or rejected.                        |
| 429    | `{ "error": "too_many_requests" }`  | A request limit below was reached.                                           |
| 429    | `{ "error": "email_daily_limit" }`  | Every email provider reached its daily quota.                                |

## Request limits

Limits are stored in `magic_link_request_limits` and shared by every API process.

| Key               | Limit                         |
| ----------------- | ----------------------------- |
| Caller IP         | 10 per 15 minutes, 20 per day |
| Recipient address | 3 per 15 minutes, 5 per day   |

## Turnstile

Cloudflare Turnstile blocks automated requests. It is on only when both values are set:

| Variable               | Where                                 | Use                                 |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| `TURNSTILE_SITE_KEY`   | Web build (`VITE_TURNSTILE_SITE_KEY`) | Renders the widget.                 |
| `TURNSTILE_SECRET_KEY` | API                                   | Verifies the token with Cloudflare. |

When Cloudflare cannot be reached, the API refuses the request. With neither value set, the
forms work without a check.

## Email quota

Providers are tried in order, each with its own daily quota in `email_daily_usage`. See
[mailer](../apps/api/src/email/mailer.ts). The quota resets at 00:00 UTC.

| Order | Provider           | Default daily limit    | Variables                                                                                  |
| ----- | ------------------ | ---------------------- | ------------------------------------------------------------------------------------------ |
| 1     | Resend             | 100 (free plan)        | `RESEND_API_KEY`, `AEGIS_EMAIL_FROM`, `RESEND_DAILY_LIMIT`                                 |
| 2     | Brevo              | 300 (free plan)        | `BREVO_API_KEY`, `BREVO_EMAIL_FROM`, `BREVO_DAILY_LIMIT`                                   |
| 3     | OCI Email Delivery | 50,000 (tenancy limit) | `OCI_SMTP_HOST`, `OCI_SMTP_USER`, `OCI_SMTP_PASSWORD`, `OCI_EMAIL_FROM`, `OCI_DAILY_LIMIT` |

OCI includes 3,000 emails a month at no cost on a Pay As You Go tenancy, then bills per 1,000. The
default cap is the tenancy limit of 50,000 a day; set `OCI_DAILY_LIMIT` to cap spend lower. OCI sends
over SMTP on port 587 from an approved sender, with SPF and DKIM published for its email domain.
