# Production environment check — 14 October 2026

The website reads Vercel server variables through process.env. next.config.ts and the recruiting worker use optional local defaults with override:false; local files do not replace injected host values. AI configuration is evaluated when requested, rather than captured at module build time.

Vercel project variables configure that website deployment. They do not configure a separate worker service. Set OPENAI_API_KEY, OPENAI_BASE_URL (for a compatible provider), OPENAI_MODEL and the worker Supabase variables on the worker host too, then restart/redeploy that worker. A production AI base URL must be publicly reachable HTTPS, not localhost on your computer.

In Vercel, select the project serving nextkinhr.com, ensure the variables target Production, then create a new Production deployment. Existing deployments retain their previous variable configuration. Browser Supabase settings NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are build-time values; rebuild after changing them. Keep OPENAI_API_KEY, GOOGLE_MAIL_CLIENT_SECRET, EMAIL_TOKEN_ENCRYPTION_KEY and SUPABASE_SERVICE_ROLE_KEY server-only.

Exact canonical Gmail names are GOOGLE_MAIL_CLIENT_ID, GOOGLE_MAIL_CLIENT_SECRET, EMAIL_TOKEN_ENCRYPTION_KEY, APP_URL and SUPABASE_SERVICE_ROLE_KEY. APP_URL should use the canonical HTTPS domain and match the Google callback setup. See ../gmail-production-setup.md.

A real startup defect was corrected: npm run worker:email previously required a .env.local file through Node's --env-file flag. It now starts from hosted environment variables and optionally loads .env.local without overriding them. This change does not supply credentials to a worker or start a worker inside Vercel.

Verification: synthetic environment configuration tests and email-worker startup regressions. No real mailbox/provider calls were performed. Vercel project settings, deployed secrets and worker hosting are not accessible from this workspace, so missing scope, old deployment and worker configuration remain checks to perform on those services. Settings shows safe AI configuration status; the administrator Email confirmations screen shows safe Gmail setup diagnostics without secret values.

Official deployment behavior: https://vercel.com/docs/environment-variables
