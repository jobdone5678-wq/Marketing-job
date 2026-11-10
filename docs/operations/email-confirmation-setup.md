# Email confirmation capture setup

This release adds read-only Gmail capture and reviewed .eml imports. It does not include a browser extension, Outlook, resume AI, Firecrawl, or the full public-job rebuild. Those remain later milestones. Detection uses conservative deterministic receipt rules, not an AI guess of submission success.

## Database

Apply `supabase/migrations/20261008_email_confirmation_capture.sql` after the existing bench-marketing schema, using the intended Supabase project's SQL editor or migration tooling. The migration is additive and preserves existing records. It creates private connections/receipts/events, confirmation fields on submissions, mailbox leases and an atomic confirmation function. It also prevents browser profile writes from changing role/status. Test on a database copy before production rollout.

New recruiter signups start pending and require approval from an existing active administrator or a trusted database operation. Existing active accounts are preserved. A user cannot activate their own staff access through profile writes or signup metadata. Review existing staff accounts before rollout.

The migration is exercised locally using embedded PostgreSQL tests; it has not been applied to the user's live Supabase project by this task.

## Server environment

Copy the names from `.env.example` into your local/deployment secret settings. Keep the existing public Supabase configuration. Configure server-only `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`, `EMAIL_TOKEN_ENCRYPTION_KEY`, `EMAIL_SYNC_SECRET`, and `APP_URL`.

Generate separate random secrets locally, without sending their values to chat:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use the first for token encryption and the second for worker authorization. Stored refresh tokens use AES-256-GCM. Changing the encryption key requires reconnecting mailboxes. Private tokens are not readable by authenticated database clients. No receipt bodies, email addresses, access tokens or provider error bodies are logged.

## Gmail OAuth

1. Enable Gmail API in the team's Google Cloud project.
2. Create OAuth web application credentials; configure the consent screen and test users as appropriate.
3. Register the exact redirect URI: `APP_URL` origin followed by `/api/email-connections/gmail/callback` (for local development, `http://localhost:3000/api/email-connections/gmail/callback`).
4. Request `https://www.googleapis.com/auth/gmail.readonly`. The connection is separate from the app's Supabase Google sign-in. Production external apps using Gmail restricted scopes may need Google's verification and related requirements; check the official guidance below before rollout.
5. Restart the app after setting credentials. An active recruiter opens **Email Confirmations**, connects the appropriate mailbox and grants access. If receipts are sent only to the candidate, the candidate's mailbox owner must authorize access in the supported onboarding process or provide downloaded/forwarded receipts. Recruiter mailbox access cannot reveal another inbox.
6. Sync once and review receipts. Add only exact known receipt sender domains to approved domains. Automatic confirmation additionally requires Gmail authentication evidence, unambiguous candidate email and company/role evidence. An approved domain is not enough by itself. Existing imported/uncertain receipts stay in review until a recruiter decides.

## Background synchronization

Run Next.js and a separate worker:

```powershell
npm run dev
npm run worker:email
```

The worker POSTs to the protected `/api/email-confirmations/sync` endpoint every five minutes. It runs without a browser tab. Production hosting must run this process separately, or schedule authenticated POST requests using the same secret; publishing only the Next.js UI does not start the worker.

Each invocation processes one bounded Gmail result page for one mailbox, with a persistent page cursor and fixed date window. The oldest attempted eligible mailbox is selected first; inactive owners and active leases are excluded, and failures rotate to avoid starving other mailboxes. The initial window is seven days. Overlap and unique provider message keys prevent lost boundary messages and duplicates. For initial backlogs, **Sync now** can be repeated when the page says more messages remain. A single lease prevents concurrent processing of the same mailbox. Receipt ingestion locks and checks that lease in the database transaction; disconnect prevents subsequent receipt persistence. On failure, saved receipts stay visible and the next sync retries the unfinished page. Connect enough workers/scheduler capacity for the actual mailbox volume before promising a response-time SLA.

Disconnect clears stored credentials and prevents further capture. The app also attempts Google revocation; if Google cannot be reached, the UI reports local disconnection and advises removing access in Google account settings.

## Review and evidence

- Download the original email as .eml (maximum 2 MiB), then use **Import receipt**. Imported evidence always requires recruiter review.
- Select the candidate and confirm/correct company and job title. Choose an existing application if there are multiple matches. Review commits receipt/event/application linkage atomically.
- A new confirmed receipt creates an Applied submission; an existing interview/offer/rejection status is preserved. Capture status becomes confirmed separately.
- Source, sender, received date, extracted text and review reason are shown without executing email HTML. Each status view has page controls so older unresolved receipts remain reachable.
- Confirmed submissions cannot be deleted through normal application deletion; this preserves receipt/event history.
- An introduction, sent vendor pitch, rejection or interview email does not automatically become a new confirmed application. This feature does not claim universal receipt-template support. Unknown or conflicting evidence remains reviewable.
- A public job API does not notify this portal of external applications. Browser states started/in_progress/submit_attempted/submitted/failed remain reserved for the future extension; email receipt evidence supplies confirmed.

## Verification

Requires Node.js 22.18+ (the implementation environment uses Node 24).

```powershell
npm test
npm run typecheck
npm run build
```

Tests use only synthetic emails and embedded PostgreSQL. Live mailbox verification needs configured OAuth credentials and explicit mailbox consent. Do not count synthetic tests as proof that a particular live company's receipt template is supported.

Official references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

The workspace development/build scripts use the supported Webpack option because the installed Turbopack CSS subprocess repeatedly crashed here, including outside the sandbox. No framework upgrade was performed.
