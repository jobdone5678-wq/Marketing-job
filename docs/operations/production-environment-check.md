# Production environment check — 14 October 2026

## Confirmed hosting project — 15 October 2026

The public NextKinHR domain is assigned to **`marketing-job-wufj`** in the `job-1819` team. **`marketing-job`** is a separate project serving only its default `marketing-job.vercel.app` domain. Both deploy the same repository, but their environment variables are independent. Adding Gmail settings to `marketing-job` did not configure `www.nextkinhr.com`.

Browser inspection confirmed that the live project had no `GOOGLE_*` or `EMAIL_*` variables. Its Production environment now has `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`, `EMAIL_TOKEN_ENCRYPTION_KEY`, and `EMAIL_SYNC_SECRET` saved as Secrets, and `APP_URL=https://www.nextkinhr.com` saved as Config. The existing local encryption key was preserved. No credentials are recorded in this document. Production deployment `owZGtNPSyyFHdXyVReXVwesEQY7N` finished with **Ready** status and `www.nextkinhr.com` assigned, using the existing deployed main-branch source and the latest project settings. Google consent and mailbox connection still require an authenticated NextKinHR session for end-to-end verification.

Use https://vercel.com/job-1819/marketing-job-wufj/settings/environment-variables for future NextKinHR production configuration.

The same project mismatch affected resume processing: `marketing-job-wufj` had no `OPENAI_*` variables, while `marketing-job` had the intended compatible provider settings. A synthetic JSON completion against `https://api.xkiro.com/v1/` with model `mistralai/mistral-large-4-0` succeeded. The existing key, base URL and model were then saved as Production Secrets in `marketing-job-wufj`. No real resume data was used in this connectivity check. Local localhost gateway settings were not copied to Vercel. A fresh upload is needed to verify extraction in an authenticated production session.

Production deployment `4LKh4Waab52Pd2gQsxiDfsmMpa58` completed with **Ready** status and `www.nextkinhr.com` assigned after adding the AI settings. This verifies configuration deployment; actual resume extraction remains to be tested by the signed-in user.

The website reads Vercel server variables through process.env. next.config.ts and the recruiting worker use optional local defaults with override:false; local files do not replace injected host values. AI configuration is evaluated when requested, rather than captured at module build time.

Vercel project variables configure that website deployment. They do not configure a separate worker service. Set OPENAI_API_KEY, OPENAI_BASE_URL (for a compatible provider), OPENAI_MODEL and the worker Supabase variables on the worker host too, then restart/redeploy that worker. A production AI base URL must be publicly reachable HTTPS, not localhost on your computer.

In Vercel, select the project serving nextkinhr.com, ensure the variables target Production, then create a new Production deployment. Existing deployments retain their previous variable configuration. Browser Supabase settings NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are build-time values; rebuild after changing them. Keep OPENAI_API_KEY, GOOGLE_MAIL_CLIENT_SECRET, EMAIL_TOKEN_ENCRYPTION_KEY and SUPABASE_SERVICE_ROLE_KEY server-only.

Exact canonical Gmail names are GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET, EMAIL_TOKEN_ENCRYPTION_KEY, APP_URL and SUPABASE_SERVICE_ROLE_KEY. APP_URL should use the canonical HTTPS domain and match the Google callback setup. See ../gmail-production-setup.md.

A real startup defect was corrected: npm run worker:email previously required a .env.local file through Node's --env-file flag. It now starts from hosted environment variables and optionally loads .env.local without overriding them. This change does not supply credentials to a worker or start a worker inside Vercel.

Verification: synthetic environment configuration tests and email-worker startup regressions, plus the synthetic provider connectivity check described above. Vercel settings were inspected through the authorized browser session. No real mailbox contents or resume contents were sent during these checks. The separate worker host and end-to-end mailbox/resume flows remain unverified. Settings shows safe AI configuration status; the administrator Email confirmations screen shows safe Gmail setup diagnostics without secret values.

Official deployment behavior: https://vercel.com/docs/environment-variables
