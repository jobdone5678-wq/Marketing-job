# Supabase `pgvector` Semantic Retrieval

**Current status**: `pgvector` is **planned / target** in Supabase PostgreSQL (not yet enabled in `supabase/migrations/`). Currently, Answer Bank lookup uses canonical topic keys (`CANONICAL_ANSWER_TOPICS` in `src/lib/candidate/answerbank.ts`) and LLM planning (`src/lib/ai/planner.ts`).

## Target Architecture (Next.js + Supabase `pgvector`)

Use Supabase `pgvector` strictly inside PostgreSQL rather than adding Pinecone, Qdrant, Meilisearch, or a separate vector service:

1. **Extension & Columns** (new migration):
   - Enable `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;`
   - Add `question_embedding extensions.vector(1536)` (or configured dimension matching the embedding model) to `public.candidate_answer_bank` and/or `public.screening_answer_bank`, and `atom_embedding extensions.vector(1536)` to `public.experience_evidence_atoms`.
   - Create `HNSW` indexes (`vector_cosine_ops`) filtered by `user_id` / `candidate_id` in RPC queries.
2. **Async Embedding Generation (Supabase Workers)**:
   - On answer-bank save or experience-atom creation, enqueue a `background_tasks` job (e.g., `embed_answer_bank` / `embed_experience_atom`) processed via `pg_net` -> `/api/webhooks/process-task` so user saves remain fast.
   - Respect user AI settings / BYOK rules or server embedding config; never block deterministic saving if embedding generation fails.
3. **Querying via Security-Invoking / Owner-Scoped RPC**:
   - Query top-$k$ candidate-owned answers via a SQL RPC (`match_candidate_answers(p_user_id, p_query_embedding, p_threshold, p_limit)`) enforcing `user_id = auth.uid()` (or service-role verified `actorId`).
   - Pass matched Q&As as grounding context into `executePlan` (`src/lib/ai/autofill-orchestrator.ts`) and `/api/extension/generate-answer`.

## Guardrails

- **Never bypass `validateGroundedAnswer`**: Semantic similarity is a retrieval hint, not permission to auto-fill factual eligibility (work authorization, visa sponsorship, experience years) without verified candidate truth.
- **Per-candidate isolation**: Every `pgvector` similarity query MUST filter by authenticated `owner_id` / `user_id` before ranking.
