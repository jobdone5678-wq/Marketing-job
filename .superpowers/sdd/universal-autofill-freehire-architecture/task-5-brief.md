# Task 5: Supabase Schema & Backend API for Candidate Answer Bank

**Files:**
- Create: `supabase/migrations/20261124000100_candidate_answer_bank.sql`
- Create: `src/app/api/extension/answer-bank/route.ts`
- Create: `tests/answer-bank-api.test.mjs`

**Interfaces:**
- Consumes: Authenticated session / extension token, question-answer payloads.
- Produces: Persistent `candidate_answer_bank` table and Next.js REST API (`GET`, `POST`, `PUT`, `DELETE`).

**Global Constraints:**
- Must use separate partial unique indexes to safely handle `NULL company_scope` without duplicate entries:
  - `CREATE UNIQUE INDEX uq_candidate_answer_universal ON public.candidate_answer_bank (candidate_id, question_normalized) WHERE company_scope IS NULL;`
  - `CREATE UNIQUE INDEX uq_candidate_answer_company ON public.candidate_answer_bank (candidate_id, question_normalized, company_scope) WHERE company_scope IS NOT NULL;`
- Row Level Security (RLS) enabled: Candidates can only access their own answer bank (`candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())`).
- Extension communicates exclusively through authenticated backend API routes (`/api/extension/answer-bank`), never direct Supabase client access.
- Candidate ownership and authentication must be verified using existing `protectedRoute` or candidate token verification in NextKinHR.
- All existing tests (`npm test`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing API test in `tests/answer-bank-api.test.mjs`**
Test that:
1. `GET /api/extension/answer-bank` returns candidate's saved answers.
2. `POST /api/extension/answer-bank` upserts an answer, correctly handling NULL `company_scope` (universal) vs non-NULL (company-scoped) without duplicate collisions.
3. `PUT /api/extension/answer-bank` updates an existing answer (e.g. text or use count).
4. `DELETE /api/extension/answer-bank` removes an answer by ID or query.
5. Unauthenticated requests are rejected with 401.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/answer-bank-api.test.mjs`
Expected: FAIL

- [ ] **Step 3: Create the migration and implement the API route**
1. In `supabase/migrations/20261124000100_candidate_answer_bank.sql`, define table and separate partial unique indexes (`uq_candidate_answer_universal` WHERE `company_scope IS NULL`, `uq_candidate_answer_company` WHERE `company_scope IS NOT NULL`). Include RLS policies.
2. Implement `src/app/api/extension/answer-bank/route.ts` using NextKinHR route handlers with candidate access verification, supporting GET, POST, PUT, DELETE with zod validation.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/answer-bank-api.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261124000100_candidate_answer_bank.sql src/app/api/extension/answer-bank/route.ts tests/answer-bank-api.test.mjs
git commit -m "feat(api): create candidate answer bank migration and extension API endpoints"
```
