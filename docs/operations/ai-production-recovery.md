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
