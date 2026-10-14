# Gmail on the production deployment

Local `.env.local` values do not configure `nextkinhr.com`. In the hosting project that serves that domain, set these **server-side Production** environment variables, then create a new production deployment:

- `APP_URL=https://nextkinhr.com` (choose one canonical host).
- `GOOGLE_MAIL_CLIENT_ID` and `GOOGLE_MAIL_CLIENT_SECRET` from the Google OAuth web client.
- `EMAIL_TOKEN_ENCRYPTION_KEY`: a base64-encoded 32-byte key. Keep the same key across deployments to preserve existing encrypted mailbox tokens; replacing it requires reconnecting mailboxes.
- `SUPABASE_SERVICE_ROLE_KEY` for this deployment's database. The existing public Supabase URL and session configuration must also point to that database.

In the Google OAuth web client, register exactly `https://nextkinhr.com/api/email-connections/gmail/callback` as an authorized redirect URI. Enable the Gmail API and ensure the consent app allows the connecting account (including test-user access when the app is in testing).

Sign in as a super administrator and open Email confirmations. **Administrator Gmail setup** identifies missing variable names or invalid configuration, and shows the validated callback URL; it never returns credential values. Recruiters receive only a generic availability message. A configured status checks local server configuration, not Google's consent approval or credential validity.

Connect from the canonical host. If you start from `www.nextkinhr.com` or a preview host, Connect Gmail first takes you to the configured host. Sign in there if needed, then press Connect Gmail again. This keeps the host-only OAuth state cookie and sign-in session on the callback host. No shared-domain cookie or caller-provided redirect is used.

After redeployment, verify the administrator setup shows no missing/invalid values, complete Google consent, and confirm the connected mailbox appears. Sync a known receipt to verify Gmail access, token storage, and the database migrations. A failed consent callback uses a generic message to avoid exposing provider responses or tokens.

This repository change does not copy credentials into hosting or deploy a production release. Those actions require access to the correct hosting project and Google OAuth configuration.


If Connect Gmail is disabled, Google consent has not started yet. Check Administrator Gmail setup for missing names or invalid values. In particular, EMAIL_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes in base64, and APP_URL must be the public production domain. Preserve the existing encryption key if the database already contains mailbox tokens. Enter Vercel values without surrounding quotes. A copied local APP_URL pointing to localhost is rejected in production.

The page now treats receipt loading and Gmail configuration as separate results: a failing receipt API cannot disable a configured Gmail connection. If the Gmail-status API itself fails, the page reports that failure and treats configuration as unknown instead of displaying a false missing-credentials warning.
