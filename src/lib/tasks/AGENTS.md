# Background Task Handlers (`src/lib/tasks/`)

Async task dispatch invoked by Supabase `pg_net` -> `/api/webhooks/process-task` and the local durable runner (`npm run worker` -> `scripts/workers/worker.ts`).

## Registry (`src/lib/tasks/handlers.ts`)

- `resume_extract` -> `extractResume` (`src/lib/ai/resume.ts`)
- `application_answers` -> `withAIExecutionWindow(45000, () => generateScreening(task))` (`src/lib/extension-answers/service.ts`)
- `candidate_match` -> `analyzeMatch` (`src/lib/ai/match.ts`)
- `packet_generate` -> `generatePacket` (`src/lib/ai/packet.ts`)
- `source_sync` -> `syncSource` (`src/lib/jobs/sync.ts`, legacy/optional catalog sync)

*(Planned `pgvector` addition: `embed_answer_bank` / `embed_experience_atom` handler to compute embeddings asynchronously on save.)*

## Conventions

- Read [docs/agents/workers.md](../../../docs/agents/workers.md) before changing task claiming, lease recovery, or webhook authentication.
- Always pass `task.id` and `task.lease_token` to DB save RPCs so stale workers after lease expiration cannot overwrite newer results.
