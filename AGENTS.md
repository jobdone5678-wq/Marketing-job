<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository routing map

Read the applicable nested `AGENTS.md` before editing. Use surgical, idiomatic TypeScript/SQL changes; no placeholders or speculative infrastructure. English only.

Scope of this workspace: **candidate-based AI autofill** and **saving applied jobs (with AI)**, built on **Next.js (App Router) + TypeScript** for frontend and backend, **Supabase PostgreSQL + `pgvector` + Supabase Storage** for data/embeddings, **Supabase `pg_net` / `pg_cron` + Next.js task webhooks** for background workers, **Supabase Realtime** for all WebSockets, and the **browser extension** for ATS DOM execution.

Before implementation, read the relevant sections of [repository requirements](AGENT-REFERENCE.md):
API/auth/AI provider changes require [Conventions](AGENT-REFERENCE.md#conventions); SQL changes require [supabase/AGENTS.md](supabase/AGENTS.md) and [Commands](AGENT-REFERENCE.md#commands); worker changes require [docs/agents/workers.md](docs/agents/workers.md); realtime UI changes require [docs/agents/realtime.md](docs/agents/realtime.md); extension changes require [extension/AGENTS.md](extension/AGENTS.md) and [design-system/AGENTS.md](design-system/AGENTS.md).

Never edit applied migrations in `supabase/migrations/`: add a new timestamped migration instead. Preserve authenticated caller ownership (`auth.uid()` / `extension_credentials`), AAD secret encryption + SSRF guards on BYOK endpoints, `validateGroundedAnswer` truth checks for factual autofill fields, and atomic/idempotent applied-job recording.

Upstream Go/SvelteKit design references (for logic parity only — not the runtime stack) are archived under [docs/freehire-reference/README.md](docs/freehire-reference/README.md).

## Working principles

Read [Working principles](AGENT-REFERENCE.md#working-principles) before work involving this topic.

## What this is

Read [What this is](AGENT-REFERENCE.md#what-this-is) before work involving this topic.

## Layout

Read [Layout](AGENT-REFERENCE.md#layout) before work involving this topic.

## Commands

Read [Commands](AGENT-REFERENCE.md#commands) before work involving this topic.

## Module files

Each is self-contained and can be read independently.

| Area | Reference |
|---|---|
| **System architecture** — start here | [docs/architecture.md](docs/architecture.md) |
| **Supabase workers** (`background_tasks`, `pg_net`, `pg_cron`) | [docs/agents/workers.md](docs/agents/workers.md) |
| **Supabase Realtime** (all WebSockets: `job_submissions`, `outside_jobs`) | [docs/agents/realtime.md](docs/agents/realtime.md) |
| **Supabase `pgvector`** (semantic Answer Bank & experience retrieval) | [docs/agents/pgvector-embeddings.md](docs/agents/pgvector-embeddings.md) |
| **Supabase PostgreSQL & RLS** (migrations, triggers, publications) | [supabase/AGENTS.md](supabase/AGENTS.md) |
| **Next.js API Route Handlers** (`src/app/api/**`) | [src/app/api/AGENTS.md](src/app/api/AGENTS.md) |
| **AI Autofill Engine** (`planner`, `chooser`, `grounded`, BYOK, LLM telemetry) | [src/lib/ai/AGENTS.md](src/lib/ai/AGENTS.md) |
| **Candidate Truth Layer** (profile, resume, experience bank, answer bank, screening) | [src/lib/candidate/AGENTS.md](src/lib/candidate/AGENTS.md) |
| **Auth & Caller Ownership** (Supabase Auth, extension pairing, `protectedRoute`) | [src/lib/auth/AGENTS.md](src/lib/auth/AGENTS.md) |
| **Applied Jobs Capture** (`auto-submit`, intents, URL/company dedup, snapshots) | [src/lib/capture/AGENTS.md](src/lib/capture/AGENTS.md) |
| **Background Task Handlers** (`resume_extract`, `application_answers`, leases) | [src/lib/tasks/AGENTS.md](src/lib/tasks/AGENTS.md) |
| **Browser Extension** (WXT + Svelte side panel, DOM fill & submission capture) | [extension/AGENTS.md](extension/AGENTS.md) |
| **Design System** (Svelte tokens & primitives consumed by `extension/`) | [design-system/AGENTS.md](design-system/AGENTS.md) |

## Conventions

Read [Conventions](AGENT-REFERENCE.md#conventions) before work involving this topic.
