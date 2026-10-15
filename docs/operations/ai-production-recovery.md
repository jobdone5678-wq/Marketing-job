# AI configuration and recovery

The app uses Chat Completions with a validated JSON output contract. OpenAI-compatible gateways must expose that API and the configured model. A compatible key is supported when it is paired with the matching endpoint and model; a key alone cannot identify its provider.

Set these **server-only** variables on the separate processing worker, and also on the deployed web app if its authenticated processing webhook is enabled:

| Variable | OpenAI | Compatible provider |
| --- | --- | --- |
| `OPENAI_API_KEY` | Your OpenAI key | Your provider/gateway key |
| `OPENAI_BASE_URL` | Omit, or `https://api.openai.com/v1` | The provider's public HTTPS API base URL |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini` | The exact model ID available through that provider |

Do not prefix these variables with `NEXT_PUBLIC`. Next.js loads local environment files for development. The worker loads local defaults without overriding variables supplied by its host. Restart both processes after changing local variables; redeploy/restart the corresponding production services after changing hosted variables. The [official OpenAI SDK documentation](https://developers.openai.com/api/docs/libraries) describes server API-key configuration.

This workspace's local configuration used a loopback AI gateway. A read-only models request could not reach it during investigation. Start that gateway locally to use its endpoint, or configure a reachable provider. A hosted web server/worker cannot reach a gateway on your personal computer through `localhost`; production now reports this setup error explicitly. No live provider completion was verified during this work.

In Settings, “Configuration present” means the server has the required settings, not that the provider or worker connection has been verified. Administrator setup messages identify missing or invalid configuration without returning keys. Queueing remains available when only the separate worker holds the credentials. Configuration is validated when a worker or authenticated processing webhook executes the task. Resume status GETs never execute AI or claim tasks.

If a comparison failed before setup was fixed, use **Retry AI comparison**. It calls the existing authorized task-retry endpoint rather than repeatedly enqueueing the same failed idempotent task. Keep the general worker (`npm run worker`) running; deploying the Next.js app alone does not run that long-lived worker. An optional authenticated database webhook can also process tasks using exclusive leases, but never steals an active worker lease. Provider-format fallbacks count as separate reserved AI attempts; unrelated bad-model errors are not retried as format errors.

The production project and its deployment secrets are not linked to this workspace, so production variables could not be changed here. Gmail has separate credentials and setup requirements: see [Gmail production setup](../gmail-production-setup.md).


## Interactive task processing (14 October 2026)

Queueing a comparison now also sends a same-origin authenticated POST to `/api/tasks/{id}/process`. Resume review triggers the same action for its queued extraction task once. This fixes the previous path where the browser only polled and no running worker/webhook picked up the queued task. Upload/status GETs remain queue/read operations; no GET executes AI. The action verifies current task access and actor ownership, claims only the specified eligible AI task through `claim_specific_task`, and never steals an existing worker lease. Provider attempt reservations and artifact validation are unchanged.

When the website has valid AI settings, the interactive action can process the task without a configured database webhook. It declares a 60-second platform duration, uses a 45-second provider execution window, and caps each provider request at 20 seconds within the remaining window. Slow models should use the durable worker, which retains its 120-second provider timeout and heartbeat. Errors are finalized visibly and require authorized retry. If web AI settings are absent/invalid, the task is left untouched for a configured separate worker and the UI explains that it is waiting.

Production needs a reachable public HTTPS AI endpoint with the matching model and key on whichever service executes the work. A localhost gateway cannot serve hosted Vercel requests. No secret keys are added to browser code. In this investigation, the sandbox could not resolve the configured database host and could not access the configured loopback gateway; real provider completion remains unverified.


## Compatible-provider response validation

Requirement extraction and candidate matching now project provider JSON onto the supported fields before strict schema validation. Extraneous scores, summaries and confidence metadata are ignored; required fields, types, limits and evidence validation remain mandatory. Coverage continues to be computed from validated evidence, not provider scores. Missing/invalid required values produce a response-format error. Unexpected SDK/gateway failures before usable output are reported separately from schema failures.

A live local models check accepted the configured key and listed the selected model. Synthetic-only chat tests succeeded at the HTTP/API level, but SDK output varied between a valid expected shape, extra/incorrect metadata and an unexpected gateway error. This does not verify any real candidate comparison. Automatic approval review blocked transmitting the database job description for an end-to-end reproduction without explicit authorization; no real candidate or job-database content was transmitted during these checks.

## Check the worker's effective connection

Run `npm run worker -- --check-ai` in the same terminal used to start the worker. This mode does not access the database or claim tasks. It sends one invented connection-test prompt and reports the effective endpoint origin, success, safe network error code, and variable names whose effective values differ from `.env.local`. It does not print keys, raw provider errors, or response contents. A fresh-process check against the current local configuration succeeded; this does not verify production or a real candidate comparison.

The worker intentionally preserves inherited/hosted variables. Restarting from a terminal containing old `OPENAI_*` overrides therefore keeps those overrides. For local development, stop the worker and clear the overrides in that terminal before rechecking:

```powershell
Remove-Item Env:OPENAI_BASE_URL, Env:OPENAI_MODEL, Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
npm run worker -- --check-ai
```

This clears only the current terminal's overrides; `.env.local` remains intact. When the check succeeds, run `npm run worker`. Use the same cleared terminal to restart the web app if it had the same stale endpoint. Hosted services should receive their settings through their own deployment environment.

The check now includes the HTTP status and distinguishes authentication, access denial, payment required, request rejection, rate limits and provider outages. A subsequent invented-data check against the currently configured gateway returned HTTP 402. This is a provider payment response; inspect that provider's credits, billing and model access rather than changing database queries or repeatedly retrying tasks. The app and worker now surface a safe payment-required message for this response. No billing settings were changed and real candidate completion remains unverified.

## Reviewed resume matching correction (15 October 2026)

Previously, matching required a whole requirement sentence to appear inside a single candidate field. For example, a reviewed `Python` skill did not prove the literal skill alternative in `Strong background in TypeScript/JavaScript or Python`. Model-renamed criteria were also lost during merging, and cached zero scores could remain visible after retries.

AI now extracts job criteria; the app evaluates their literal evidence against reviewed professional facts locally. Simple alternative groups, mandatory groups, common skill aliases and technology word boundaries are handled explicitly. Each supported criterion includes citations to the reviewed source fields. Negated lists and ambiguous Go prose do not establish support; CI/CD compounds do not become independent alternatives. Complex years, seniority and parenthetical conditions remain unknown unless directly supported. Coverage measures supported criteria, not job suitability or placement probability. Missing reviewed professional facts produce insufficient evidence.

Current-version cached comparisons are re-evaluated on authorized reads, without another provider call or modifying historical artifacts. Comparisons from changed candidate/job versions remain stale. Saved and live candidate job feeds use `confirmed_facts` when present, rather than stale editable profile columns; unreviewed profiles and closed/expired jobs remain excluded. The UI distinguishes supported and unknown counts and shows individual field citations.

Restart the worker after deploying the code and refresh/reopen the comparison. No database migration is needed for this correction. Regression and browser verification use fictional data only; no real candidate comparison was sent to a provider during this change.
