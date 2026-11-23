# Review Package: Task 5

## Commits
1865b52 feat(api): create candidate answer bank migration and extension API endpoints

## Stat
 src/app/api/extension/answer-bank/route.ts         | 364 ++++++++++
 .../20261124000100_candidate_answer_bank.sql       |  74 ++
 tests/answer-bank-api.test.mjs                     | 758 +++++++++++++++++++++
 3 files changed, 1196 insertions(+)

## Diff
`diff
diff --git a/src/app/api/extension/answer-bank/route.ts b/src/app/api/extension/answer-bank/route.ts
new file mode 100644
index 0000000..dce0e13
--- /dev/null
+++ b/src/app/api/extension/answer-bank/route.ts
@@ -0,0 +1,364 @@
+import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
+import { database, checkDb, CaptureError } from '@/lib/db/admin';
+import { z } from 'zod';
+
+export const runtime = 'nodejs';
+export const maxDuration = 60;
+
+export async function OPTIONS(request: Request) {
+  return cors(request, new Response(null, { status: 204 }));
+}
+
+export function normalizeQuestion(text: string): string {
+  return String(text || '')
+    .toLowerCase()
+    .replace(/&/g, ' and ')
+    .replace(/[^\w\s]/g, '')
+    .replace(/\s+/g, ' ')
+    .trim();
+}
+
+async function resolveCandidate(actorId: string, candidateId?: string | null): Promise<string> {
+  const db = database();
+  if (candidateId) {
+    if (!z.uuid().safeParse(candidateId).success) {
+      throw new CaptureError('Invalid candidate ID.', 400);
+    }
+    const { data, error } = await db
+      .from('candidates')
+      .select('id, user_id')
+      .eq('id', candidateId)
+      .eq('user_id', actorId)
+      .maybeSingle();
+    checkDb(error);
+    if (!data) throw new CaptureError('Candidate not found or access denied.', 404);
+    return data.id;
+  }
+
+  const { data, error } = await db
+    .from('candidates')
+    .select('id, user_id')
+    .eq('user_id', actorId)
+    .order('updated_at', { ascending: false })
+    .limit(1)
+    .maybeSingle();
+  checkDb(error);
+  if (!data) throw new CaptureError('Candidate profile not found.', 404);
+  return data.id;
+}
+
+export async function GET(request: Request) {
+  return extensionRoute(request, async () => {
+    const actor = await extensionProfile(request);
+    const db = database();
+    const url = new URL(request.url);
+    const explicitCandidateId = url.searchParams.get('candidateId');
+    const candidateId = await resolveCandidate(actor.id, explicitCandidateId);
+
+    let query = db
+      .from('candidate_answer_bank')
+      .select('*')
+      .eq('candidate_id', candidateId);
+
+    const companyScope = url.searchParams.get('companyScope') ?? url.searchParams.get('company_scope');
+    if (companyScope !== null && companyScope !== undefined && companyScope !== '') {
+      if (companyScope === '__universal__' || companyScope === 'null') {
+        query = query.is('company_scope', null);
+      } else {
+        query = query.eq('company_scope', companyScope.toLowerCase().trim());
+      }
+    }
+
+    const { data, error } = await query
+      .order('updated_at', { ascending: false })
+      .order('created_at', { ascending: false });
+    checkDb(error);
+
+    return { answers: data || [] };
+  });
+}
+
+const postSchema = z.object({
+  candidateId: z.string().uuid().optional(),
+  question: z.string().trim().min(1, 'Question is required').max(3000),
+  questionNormalized: z.string().trim().optional(),
+  question_normalized: z.string().trim().optional(),
+  answer: z.string().trim().min(1, 'Answer is required'),
+  companyScope: z.string().trim().nullable().optional(),
+  company_scope: z.string().trim().nullable().optional(),
+  useCount: z.number().int().min(0).optional(),
+  use_count: z.number().int().min(0).optional(),
+});
+
+export async function POST(request: Request) {
+  return extensionRoute(request, async () => {
+    const actor = await extensionProfile(request);
+    const body = postSchema.parse(await request.json());
+    const db = database();
+    const candidateId = await resolveCandidate(actor.id, body.candidateId);
+
+    const rawScope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
+    const companyScope = rawScope && rawScope.trim() ? rawScope.trim().toLowerCase() : null;
+    const normalizedQuestion = (
+      body.questionNormalized ||
+      body.question_normalized ||
+      normalizeQuestion(body.question)
+    ).trim();
+
+    let query = db
+      .from('candidate_answer_bank')
+      .select('*')
+      .eq('candidate_id', candidateId)
+      .eq('question_normalized', normalizedQuestion);
+
+    if (companyScope === null) {
+      query = query.is('company_scope', null);
+    } else {
+      query = query.eq('company_scope', companyScope);
+    }
+
+    const { data: existing, error: selectError } = await query.maybeSingle();
+    checkDb(selectError);
+
+    if (existing) {
+      const currentUseCount = existing.use_count ?? 1;
+      const specifiedCount = body.useCount ?? body.use_count;
+      const nextUseCount = typeof specifiedCount === 'number' ? specifiedCount : currentUseCount + 1;
+
+      const { data: updated, error: updateError } = await db
+        .from('candidate_answer_bank')
+        .update({
+          question: body.question,
+          answer: body.answer,
+          use_count: nextUseCount,
+          last_used_at: new Date().toISOString(),
+          updated_at: new Date().toISOString(),
+        })
+        .eq('id', existing.id)
+        .select()
+        .single();
+      checkDb(updateError);
+      return {
+        answer: updated || {
+          ...existing,
+          question: body.question,
+          answer: body.answer,
+          use_count: nextUseCount,
+        },
+      };
+    } else {
+      const initialUseCount = body.useCount ?? body.use_count ?? 1;
+      const { data: inserted, error: insertError } = await db
+        .from('candidate_answer_bank')
+        .insert({
+          candidate_id: candidateId,
+          question: body.question,
+          question_normalized: normalizedQuestion,
+          answer: body.answer,
+          company_scope: companyScope,
+          use_count: initialUseCount,
+          last_used_at: new Date().toISOString(),
+          created_at: new Date().toISOString(),
+          updated_at: new Date().toISOString(),
+        })
+        .select()
+        .single();
+
+      if (insertError) {
+        if (
+          insertError.code === '23505' ||
+          String(insertError.message || '').includes('duplicate') ||
+          String(insertError.message || '').includes('unique')
+        ) {
+          let retryQuery = db
+            .from('candidate_answer_bank')
+            .select('*')
+            .eq('candidate_id', candidateId)
+            .eq('question_normalized', normalizedQuestion);
+
+          if (companyScope === null) {
+            retryQuery = retryQuery.is('company_scope', null);
+          } else {
+            retryQuery = retryQuery.eq('company_scope', companyScope);
+          }
+
+          const { data: retryExisting } = await retryQuery.maybeSingle();
+          if (retryExisting) {
+            const { data: retryUpdated, error: retryUpdateErr } = await db
+              .from('candidate_answer_bank')
+              .update({
+                question: body.question,
+                answer: body.answer,
+                use_count: (retryExisting.use_count || 1) + 1,
+                last_used_at: new Date().toISOString(),
+                updated_at: new Date().toISOString(),
+              })
+              .eq('id', retryExisting.id)
+              .select()
+              .single();
+            checkDb(retryUpdateErr);
+            return { answer: retryUpdated };
+          }
+        }
+        checkDb(insertError);
+      }
+      return { answer: inserted };
+    }
+  });
+}
+
+const putSchema = z.object({
+  id: z.string().uuid().optional(),
+  candidateId: z.string().uuid().optional(),
+  question: z.string().trim().max(3000).optional(),
+  questionNormalized: z.string().trim().optional(),
+  question_normalized: z.string().trim().optional(),
+  companyScope: z.string().trim().nullable().optional(),
+  company_scope: z.string().trim().nullable().optional(),
+  answer: z.string().trim().min(1).optional(),
+  useCount: z.number().int().min(0).optional(),
+  use_count: z.number().int().min(0).optional(),
+});
+
+export async function PUT(request: Request) {
+  return extensionRoute(request, async () => {
+    const actor = await extensionProfile(request);
+    const body = putSchema.parse(await request.json());
+    const db = database();
+    const candidateId = await resolveCandidate(actor.id, body.candidateId);
+
+    let existing = null;
+    if (body.id) {
+      const { data, error } = await db
+        .from('candidate_answer_bank')
+        .select('*')
+        .eq('id', body.id)
+        .eq('candidate_id', candidateId)
+        .maybeSingle();
+      checkDb(error);
+      existing = data;
+    } else {
+      const normalizedQuestion = (
+        body.questionNormalized ||
+        body.question_normalized ||
+        (body.question ? normalizeQuestion(body.question) : '')
+      ).trim();
+      if (!normalizedQuestion) {
+        throw new CaptureError('Answer ID or question is required.', 400);
+      }
+
+      let matchQuery = db
+        .from('candidate_answer_bank')
+        .select('*')
+        .eq('candidate_id', candidateId)
+        .eq('question_normalized', normalizedQuestion);
+
+      const rawScope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
+      const companyScope = rawScope && rawScope.trim() ? rawScope.trim().toLowerCase() : null;
+      if (companyScope === null) {
+        matchQuery = matchQuery.is('company_scope', null);
+      } else {
+        matchQuery = matchQuery.eq('company_scope', companyScope);
+      }
+
+      const { data, error } = await matchQuery.maybeSingle();
+      checkDb(error);
+      existing = data;
+    }
+
+    if (!existing) {
+      throw new CaptureError('Answer not found.', 404);
+    }
+
+    const patch: Record<string, unknown> = {
+      updated_at: new Date().toISOString(),
+    };
+    if (body.answer !== undefined) patch.answer = body.answer;
+    if (body.question !== undefined) patch.question = body.question;
+    if (body.questionNormalized !== undefined || body.question_normalized !== undefined) {
+      patch.question_normalized = (body.questionNormalized || body.question_normalized)?.trim();
+    }
+    if (body.companyScope !== undefined || body.company_scope !== undefined) {
+      const scope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
+      patch.company_scope = scope && scope.trim() ? scope.trim().toLowerCase() : null;
+    }
+    const useCount = body.useCount !== undefined ? body.useCount : body.use_count;
+    if (useCount !== undefined) {
+      patch.use_count = useCount;
+      patch.last_used_at = new Date().toISOString();
+    }
+
+    const { data: updated, error: updateErr } = await db
+      .from('candidate_answer_bank')
+      .update(patch)
+      .eq('id', existing.id)
+      .select()
+      .single();
+    checkDb(updateErr);
+
+    return { answer: updated || { ...existing, ...patch } };
+  });
+}
+
+export async function DELETE(request: Request) {
+  return extensionRoute(request, async () => {
+    const actor = await extensionProfile(request);
+    const db = database();
+    const url = new URL(request.url);
+
+    let id = url.searchParams.get('id');
+    let candidateId = url.searchParams.get('candidateId');
+    let questionNormalized =
+      url.searchParams.get('questionNormalized') || url.searchParams.get('question_normalized');
+    let companyScope =
+      url.searchParams.get('companyScope') || url.searchParams.get('company_scope');
+
+    if (!id && !questionNormalized) {
+      try {
+        const body = await request.json();
+        if (body.id) id = body.id;
+        if (body.candidateId) candidateId = body.candidateId;
+        if (body.questionNormalized || body.question_normalized) {
+          questionNormalized = body.questionNormalized || body.question_normalized;
+        }
+        if (body.companyScope !== undefined) companyScope = body.companyScope;
+        if (body.company_scope !== undefined) companyScope = body.company_scope;
+      } catch {
+        // empty body ok
+      }
+    }
+
+    const resolvedCandidateId = await resolveCandidate(actor.id, candidateId);
+
+    if (id) {
+      if (!z.uuid().safeParse(id).success) throw new CaptureError('Invalid answer ID.', 400);
+      const { error, count } = await db
+        .from('candidate_answer_bank')
+        .delete()
+        .eq('id', id)
+        .eq('candidate_id', resolvedCandidateId);
+      checkDb(error);
+      return { deleted: true, count: count ?? 1 };
+    }
+
+    if (questionNormalized) {
+      let deleteQuery = db
+        .from('candidate_answer_bank')
+        .delete()
+        .eq('candidate_id', resolvedCandidateId)
+        .eq('question_normalized', questionNormalized.trim());
+
+      const scope = companyScope && companyScope.trim() ? companyScope.trim().toLowerCase() : null;
+      if (scope === null) {
+        deleteQuery = deleteQuery.is('company_scope', null);
+      } else {
+        deleteQuery = deleteQuery.eq('company_scope', scope);
+      }
+      const { error, count } = await deleteQuery;
+      checkDb(error);
+      return { deleted: true, count: count ?? 1 };
+    }
+
+    throw new CaptureError('Answer ID or normalized question required.', 400);
+  });
+}
diff --git a/supabase/migrations/20261124000100_candidate_answer_bank.sql b/supabase/migrations/20261124000100_candidate_answer_bank.sql
new file mode 100644
index 0000000..7d580f9
--- /dev/null
+++ b/supabase/migrations/20261124000100_candidate_answer_bank.sql
@@ -0,0 +1,74 @@
+-- ==============================================================================
+-- 20261124000100_candidate_answer_bank.sql
+-- Candidate Answer Bank Schema & Partial Unique Indexing
+-- ==============================================================================
+
+BEGIN;
+
+-- 1. Create table public.candidate_answer_bank
+CREATE TABLE IF NOT EXISTS public.candidate_answer_bank (
+  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+  candidate_id        uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
+  question            text NOT NULL,
+  question_normalized text NOT NULL,
+  answer              text NOT NULL,
+  company_scope       text DEFAULT NULL,
+  use_count           integer NOT NULL DEFAULT 1 CHECK (use_count >= 0),
+  last_used_at        timestamptz NOT NULL DEFAULT now(),
+  created_at          timestamptz NOT NULL DEFAULT now(),
+  updated_at          timestamptz NOT NULL DEFAULT now()
+);
+
+-- 2. Partial unique indexes to safely handle NULL company_scope without duplicate entries
+CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_answer_universal
+  ON public.candidate_answer_bank (candidate_id, question_normalized)
+  WHERE company_scope IS NULL;
+
+CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_answer_company
+  ON public.candidate_answer_bank (candidate_id, question_normalized, company_scope)
+  WHERE company_scope IS NOT NULL;
+
+-- 3. Composite & lookup indexes for fast candidate queries and company-scope filtering
+CREATE INDEX IF NOT EXISTS idx_candidate_answer_bank_candidate
+  ON public.candidate_answer_bank (candidate_id, updated_at DESC);
+
+CREATE INDEX IF NOT EXISTS idx_candidate_answer_bank_scope
+  ON public.candidate_answer_bank (candidate_id, company_scope);
+
+-- 4. Enable Row Level Security
+ALTER TABLE public.candidate_answer_bank ENABLE ROW LEVEL SECURITY;
+
+-- 5. Drop existing policies to prevent conflicts on re-run
+DROP POLICY IF EXISTS candidate_answer_bank_select ON public.candidate_answer_bank;
+CREATE POLICY candidate_answer_bank_select ON public.candidate_answer_bank
+  FOR SELECT TO authenticated
+  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
+
+DROP POLICY IF EXISTS candidate_answer_bank_insert ON public.candidate_answer_bank;
+CREATE POLICY candidate_answer_bank_insert ON public.candidate_answer_bank
+  FOR INSERT TO authenticated
+  WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
+
+DROP POLICY IF EXISTS candidate_answer_bank_update ON public.candidate_answer_bank;
+CREATE POLICY candidate_answer_bank_update ON public.candidate_answer_bank
+  FOR UPDATE TO authenticated
+  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()))
+  WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
+
+DROP POLICY IF EXISTS candidate_answer_bank_delete ON public.candidate_answer_bank;
+CREATE POLICY candidate_answer_bank_delete ON public.candidate_answer_bank
+  FOR DELETE TO authenticated
+  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
+
+-- 6. Permissions
+REVOKE ALL ON public.candidate_answer_bank FROM anon;
+GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_answer_bank TO authenticated;
+GRANT ALL ON public.candidate_answer_bank TO service_role;
+
+-- 7. Trigger to auto-update updated_at timestamp
+DROP TRIGGER IF EXISTS trg_candidate_answer_bank_updated_at ON public.candidate_answer_bank;
+CREATE TRIGGER trg_candidate_answer_bank_updated_at
+  BEFORE UPDATE ON public.candidate_answer_bank
+  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
+
+COMMIT;
diff --git a/tests/answer-bank-api.test.mjs b/tests/answer-bank-api.test.mjs
new file mode 100644
index 0000000..71aa32d
--- /dev/null
+++ b/tests/answer-bank-api.test.mjs
@@ -0,0 +1,758 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { createHash } from 'node:crypto';
+import { readFileSync } from 'node:fs';
+import { runInNewContext } from 'node:vm';
+import ts from 'typescript';
+import { z } from 'zod';
+
+const candidateId = '11111111-1111-4000-8000-111111111111';
+const otherCandidateId = '22222222-2222-4000-8000-222222222222';
+const actorId = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
+const otherActorId = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';
+
+const activeToken = 'fixture-active-token-answer-bank-12345';
+const revokedToken = 'fixture-revoked-token-answer-bank-12345';
+const hash = (value) => createHash('sha256').update(value).digest('hex');
+
+function loadSource(path, dependencies, globals = {}) {
+  const file = new URL('../src/' + path + '.ts', import.meta.url);
+  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
+    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
+  }).outputText;
+  const exports = {};
+  runInNewContext(code, {
+    exports,
+    URL,
+    Response,
+    Request,
+    Buffer,
+    crypto,
+    console,
+    ...globals,
+    require: (name) => dependencies[name],
+  });
+  return exports;
+}
+
+function createTestHarness() {
+  const expiry = '2100-01-01T00:00:00.000Z';
+  const tables = {
+    candidates: [
+      { id: candidateId, user_id: actorId, full_name: 'Test Candidate', version: 1 },
+      { id: otherCandidateId, user_id: otherActorId, full_name: 'Other Candidate', version: 1 },
+    ],
+    extension_credentials: [
+      { token_hash: hash(activeToken), owner_id: actorId, expires_at: expiry, revoked_at: null },
+      { token_hash: hash(revokedToken), owner_id: actorId, expires_at: expiry, revoked_at: '2026-01-01T00:00:00.000Z' },
+    ],
+    profiles: [
+      { id: actorId, status: 'active', role: 'candidate' },
+      { id: otherActorId, status: 'active', role: 'candidate' },
+    ],
+    candidate_answer_bank: [],
+  };
+
+  class CaptureError extends Error {
+    constructor(message, status = 400) {
+      super(message);
+      this.status = status;
+    }
+  }
+
+  const database = () => ({
+    from(tableName) {
+      const filters = {};
+      const nullFilters = {};
+      const notNullFilters = {};
+      let selectedFields = null;
+      let orderCol = null;
+      let orderAsc = true;
+      let limitCount = null;
+
+      const query = {
+        select(fields = '*') {
+          selectedFields = fields;
+          return query;
+        },
+        eq(col, val) {
+          filters[col] = val;
+          return query;
+        },
+        is(col, val) {
+          if (val === null) nullFilters[col] = true;
+          return query;
+        },
+        not(col, op, val) {
+          if (op === 'is' && val === null) notNullFilters[col] = true;
+          return query;
+        },
+        order(col, { ascending = true } = {}) {
+          orderCol = col;
+          orderAsc = ascending;
+          return query;
+        },
+        limit(n) {
+          limitCount = n;
+          return query;
+        },
+        async maybeSingle() {
+          const list = tables[tableName] || [];
+          const match = list.find((row) => {
+            for (const [k, v] of Object.entries(filters)) {
+              if (row[k] !== v) return false;
+            }
+            for (const k of Object.keys(nullFilters)) {
+              if (row[k] !== null && row[k] !== undefined) return false;
+            }
+            for (const k of Object.keys(notNullFilters)) {
+              if (row[k] === null || row[k] === undefined) return false;
+            }
+            return true;
+          });
+          return { data: match ? { ...match } : null, error: null };
+        },
+        async single() {
+          return query.maybeSingle();
+        },
+        then(resolve, reject) {
+          const list = (tables[tableName] || []).filter((row) => {
+            for (const [k, v] of Object.entries(filters)) {
+              if (row[k] !== v) return false;
+            }
+            for (const k of Object.keys(nullFilters)) {
+              if (row[k] !== null && row[k] !== undefined) return false;
+            }
+            for (const k of Object.keys(notNullFilters)) {
+              if (row[k] === null || row[k] === undefined) return false;
+            }
+            return true;
+          });
+          let result = [...list];
+          if (orderCol) {
+            result.sort((a, b) => {
+              if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1;
+              if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1;
+              return 0;
+            });
+          }
+          if (limitCount != null) {
+            result = result.slice(0, limitCount);
+          }
+          return Promise.resolve({ data: result.map((r) => ({ ...r })), error: null }).then(resolve, reject);
+        },
+        insert(values) {
+          const rowsToInsert = Array.isArray(values) ? values : [values];
+          const inserted = [];
+          for (const item of rowsToInsert) {
+            const row = {
+              id: item.id || crypto.randomUUID(),
+              use_count: 1,
+              created_at: new Date().toISOString(),
+              updated_at: new Date().toISOString(),
+              last_used_at: new Date().toISOString(),
+              ...item,
+            };
+
+            // Enforce partial unique indexes
+            const existingUniversal = tables[tableName].find(
+              (r) =>
+                r.candidate_id === row.candidate_id &&
+                r.question_normalized === row.question_normalized &&
+                (r.company_scope === null || r.company_scope === undefined) &&
+                (row.company_scope === null || row.company_scope === undefined)
+            );
+            if (existingUniversal) {
+              const err = new Error('duplicate key value violates unique constraint "uq_candidate_answer_universal"');
+              err.code = '23505';
+              return {
+                select() {
+                  return {
+                    single: async () => ({ data: null, error: err }),
+                    maybeSingle: async () => ({ data: null, error: err }),
+                  };
+                },
+              };
+            }
+
+            const existingCompany = tables[tableName].find(
+              (r) =>
+                r.candidate_id === row.candidate_id &&
+                r.question_normalized === row.question_normalized &&
+                r.company_scope !== null &&
+                r.company_scope !== undefined &&
+                r.company_scope === row.company_scope
+            );
+            if (existingCompany) {
+              const err = new Error('duplicate key value violates unique constraint "uq_candidate_answer_company"');
+              err.code = '23505';
+              return {
+                select() {
+                  return {
+                    single: async () => ({ data: null, error: err }),
+                    maybeSingle: async () => ({ data: null, error: err }),
+                  };
+                },
+              };
+            }
+
+            tables[tableName].push(row);
+            inserted.push(row);
+          }
+
+          return {
+            select() {
+              return {
+                single: async () => ({ data: { ...inserted[0] }, error: null }),
+                maybeSingle: async () => ({ data: { ...inserted[0] }, error: null }),
+              };
+            },
+          };
+        },
+        update(patch) {
+          const list = tables[tableName] || [];
+          let updatedRow = null;
+          for (const row of list) {
+            let matches = true;
+            for (const [k, v] of Object.entries(filters)) {
+              if (row[k] !== v) {
+                matches = false;
+                break;
+              }
+            }
+            if (matches) {
+              Object.assign(row, patch, { updated_at: new Date().toISOString() });
+              updatedRow = { ...row };
+              break;
+            }
+          }
+          return {
+            eq(col, val) {
+              filters[col] = val;
+              return query.update(patch);
+            },
+            select() {
+              return {
+                single: async () => ({ data: updatedRow ? { ...updatedRow } : null, error: null }),
+                maybeSingle: async () => ({ data: updatedRow ? { ...updatedRow } : null, error: null }),
+              };
+            },
+            then(resolve, reject) {
+              return Promise.resolve({ data: updatedRow ? [{ ...updatedRow }] : [], error: null }).then(resolve, reject);
+            },
+          };
+        },
+        delete() {
+          return {
+            eq(col, val) {
+              filters[col] = val;
+              return this;
+            },
+            is(col, val) {
+              if (val === null) nullFilters[col] = true;
+              return this;
+            },
+            then(resolve, reject) {
+              const beforeCount = (tables[tableName] || []).length;
+              tables[tableName] = (tables[tableName] || []).filter((row) => {
+                for (const [k, v] of Object.entries(filters)) {
+                  if (row[k] !== v) return true;
+                }
+                for (const k of Object.keys(nullFilters)) {
+                  if (row[k] !== null && row[k] !== undefined) return true;
+                }
+                return false;
+              });
+              const deletedCount = beforeCount - tables[tableName].length;
+              return Promise.resolve({ data: null, error: null, count: deletedCount }).then(resolve, reject);
+            },
+          };
+        },
+      };
+      return query;
+    },
+  });
+
+  const admin = {
+    database,
+    CaptureError,
+    checkDb(error) {
+      if (error) {
+        const err = new CaptureError(error.message, error.status || 500);
+        err.code = error.code;
+        throw err;
+      }
+    },
+    errorResponse(error) {
+      return Response.json({ error: error.message }, { status: error.status || 500 });
+    },
+  };
+
+  const capture = loadSource('lib/capture/server', {
+    'node:crypto': { createHash },
+    '@/lib/db/admin': admin,
+    zod: { z },
+  });
+
+  const route = loadSource('app/api/extension/answer-bank/route', {
+    '@/lib/capture/server': capture,
+    '@/lib/db/admin': admin,
+    zod: { z },
+  });
+
+  return { tables, route };
+}
+
+test('Answer Bank API: 5. Unauthenticated requests are rejected with 401 across all methods', async () => {
+  const { route } = createTestHarness();
+
+  // GET: Missing Authorization header
+  const res1 = await route.GET(new Request('http://localhost.test/api/extension/answer-bank'));
+  assert.equal(res1.status, 401, 'missing token should be 401');
+
+  // GET: Malformed header
+  const res2 = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      headers: { authorization: 'Basic 12345' },
+    })
+  );
+  assert.equal(res2.status, 401, 'malformed token should be 401');
+
+  // GET: Revoked token
+  const res3 = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      headers: { authorization: `Bearer ${revokedToken}` },
+    })
+  );
+  assert.equal(res3.status, 401, 'revoked token should be 401');
+
+  // POST: Unauthenticated
+  const resPost = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      body: JSON.stringify({ question: 'test', answer: 'test' }),
+    })
+  );
+  assert.equal(resPost.status, 401);
+
+  // PUT: Unauthenticated
+  const resPut = await route.PUT(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'PUT',
+      body: JSON.stringify({ id: '11111111-1111-4000-8000-111111111111', answer: 'test' }),
+    })
+  );
+  assert.equal(resPut.status, 401);
+
+  // DELETE: Unauthenticated
+  const resDelete = await route.DELETE(
+    new Request('http://localhost.test/api/extension/answer-bank?id=11111111-1111-4000-8000-111111111111', {
+      method: 'DELETE',
+    })
+  );
+  assert.equal(resDelete.status, 401);
+});
+
+test('Answer Bank API: 1. GET /api/extension/answer-bank returns candidate saved answers', async () => {
+  const { tables, route } = createTestHarness();
+
+  // Populate fixture answers
+  tables.candidate_answer_bank.push({
+    id: '33333333-3333-4000-8000-333333333333',
+    candidate_id: candidateId,
+    question: 'How many years of experience do you have with React?',
+    question_normalized: 'how many years of experience do you have with react',
+    answer: '5 years',
+    company_scope: null,
+    use_count: 3,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  // Answer for another candidate (must not be visible)
+  tables.candidate_answer_bank.push({
+    id: '44444444-4444-4000-8000-444444444444',
+    candidate_id: otherCandidateId,
+    question: 'Secret question',
+    question_normalized: 'secret question',
+    answer: 'Other candidate secret',
+    company_scope: null,
+    use_count: 1,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  const res = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      headers: { authorization: `Bearer ${activeToken}` },
+    })
+  );
+
+  assert.equal(res.status, 200);
+  const data = await res.json();
+  assert.ok(Array.isArray(data.answers), 'should return an answers array');
+  assert.equal(data.answers.length, 1, 'should only return candidate own answers');
+  assert.equal(data.answers[0].answer, '5 years');
+  assert.equal(data.answers[0].candidate_id, candidateId);
+});
+
+test('Answer Bank API: 2. POST /api/extension/answer-bank upserts universal vs company-scoped answers without collisions', async () => {
+  const { tables, route } = createTestHarness();
+
+  // 1. Post a universal answer (company_scope is null)
+  const universalPayload = {
+    question: 'Why do you want to join our engineering team?',
+    answer: 'I love building distributed systems at scale.',
+    companyScope: null,
+  };
+
+  const res1 = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify(universalPayload),
+    })
+  );
+
+  assert.equal(res1.status, 200);
+  const data1 = await res1.json();
+  assert.ok(data1.answer, 'returns saved answer');
+  assert.equal(data1.answer.company_scope, null);
+  assert.equal(data1.answer.use_count, 1);
+  const universalId = data1.answer.id;
+
+  // 2. Post the same question universally again -> should UPSERT (increment use_count, update answer)
+  const universalUpdatedPayload = {
+    question: 'Why do you want to join our engineering team?',
+    answer: 'I love building resilient distributed systems and mentorship.',
+    companyScope: null,
+  };
+
+  const res2 = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify(universalUpdatedPayload),
+    })
+  );
+
+  assert.equal(res2.status, 200);
+  const data2 = await res2.json();
+  assert.equal(data2.answer.id, universalId, 'should update existing universal answer');
+  assert.equal(data2.answer.answer, 'I love building resilient distributed systems and mentorship.');
+  assert.equal(data2.answer.use_count, 2, 'use_count incremented');
+
+  // 3. Post company-scoped answer with SAME question -> must NOT collide with universal answer
+  const companyPayload = {
+    question: 'Why do you want to join our engineering team?',
+    answer: 'I have followed Stripe API developer tools for years and admire the developer ergonomics.',
+    companyScope: 'stripe',
+  };
+
+  const res3 = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify(companyPayload),
+    })
+  );
+
+  assert.equal(res3.status, 200);
+  const data3 = await res3.json();
+  assert.notEqual(data3.answer.id, universalId, 'company answer must have distinct id from universal answer');
+  assert.equal(data3.answer.company_scope, 'stripe');
+  assert.equal(data3.answer.use_count, 1);
+  const stripeId = data3.answer.id;
+
+  // 4. Post same company-scoped answer again -> upserts stripe answer
+  const companyUpdatedPayload = {
+    question: 'Why do you want to join our engineering team?',
+    answer: 'Updated Stripe specific motivation.',
+    companyScope: 'stripe',
+  };
+
+  const res4 = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify(companyUpdatedPayload),
+    })
+  );
+
+  assert.equal(res4.status, 200);
+  const data4 = await res4.json();
+  assert.equal(data4.answer.id, stripeId, 'should update existing company-scoped answer');
+  assert.equal(data4.answer.answer, 'Updated Stripe specific motivation.');
+  assert.equal(data4.answer.use_count, 2);
+
+  // Total answers for candidate should be 2: one universal, one company-scoped
+  const candidateRows = tables.candidate_answer_bank.filter((r) => r.candidate_id === candidateId);
+  assert.equal(candidateRows.length, 2, 'should contain exactly 1 universal and 1 stripe answer');
+});
+
+test('Answer Bank API: 3. PUT /api/extension/answer-bank updates existing answer', async () => {
+  const { tables, route } = createTestHarness();
+
+  const existingId = '55555555-5555-4000-8000-555555555555';
+  tables.candidate_answer_bank.push({
+    id: existingId,
+    candidate_id: candidateId,
+    question: 'What is your current notice period?',
+    question_normalized: 'what is your current notice period',
+    answer: '2 weeks',
+    company_scope: null,
+    use_count: 5,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  // Update answer text and use count
+  const res = await route.PUT(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'PUT',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        id: existingId,
+        answer: 'Immediately available',
+        useCount: 6,
+      }),
+    })
+  );
+
+  assert.equal(res.status, 200);
+  const data = await res.json();
+  assert.equal(data.answer.id, existingId);
+  assert.equal(data.answer.answer, 'Immediately available');
+  assert.equal(data.answer.use_count, 6);
+
+  // Attempting to update another candidate answer should be rejected with 404
+  const otherId = '66666666-6666-4000-8000-666666666666';
+  tables.candidate_answer_bank.push({
+    id: otherId,
+    candidate_id: otherCandidateId,
+    question: 'Other question',
+    question_normalized: 'other question',
+    answer: 'Other answer',
+    company_scope: null,
+    use_count: 1,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  const resOther = await route.PUT(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'PUT',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        id: otherId,
+        answer: 'Hacked answer',
+      }),
+    })
+  );
+
+  assert.equal(resOther.status, 404, 'cannot update answer not owned by candidate');
+});
+
+test('Answer Bank API: 4. DELETE /api/extension/answer-bank removes answer by ID or query', async () => {
+  const { tables, route } = createTestHarness();
+
+  const idToDelete = '77777777-7777-4000-8000-777777777777';
+  tables.candidate_answer_bank.push({
+    id: idToDelete,
+    candidate_id: candidateId,
+    question: 'Are you open to relocation?',
+    question_normalized: 'are you open to relocation',
+    answer: 'Yes, anywhere on West Coast',
+    company_scope: null,
+    use_count: 2,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  // Delete by query param ?id=...
+  const res1 = await route.DELETE(
+    new Request(`http://localhost.test/api/extension/answer-bank?id=${idToDelete}`, {
+      method: 'DELETE',
+      headers: { authorization: `Bearer ${activeToken}` },
+    })
+  );
+
+  assert.equal(res1.status, 200);
+  const data1 = await res1.json();
+  assert.equal(data1.deleted, true);
+
+  const found = tables.candidate_answer_bank.find((r) => r.id === idToDelete);
+  assert.equal(found, undefined, 'record was deleted');
+
+  // Add another and delete by question normalized + company scope
+  tables.candidate_answer_bank.push({
+    id: '88888888-8888-4000-8000-888888888888',
+    candidate_id: candidateId,
+    question: 'Target compensation?',
+    question_normalized: 'target compensation',
+    answer: '$180,000',
+    company_scope: 'meta',
+    use_count: 1,
+    last_used_at: new Date().toISOString(),
+    created_at: new Date().toISOString(),
+    updated_at: new Date().toISOString(),
+  });
+
+  const res2 = await route.DELETE(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'DELETE',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        questionNormalized: 'target compensation',
+        companyScope: 'meta',
+      }),
+    })
+  );
+
+  assert.equal(res2.status, 200);
+  const data2 = await res2.json();
+  assert.equal(data2.deleted, true);
+
+  const found2 = tables.candidate_answer_bank.find((r) => r.id === '88888888-8888-4000-8000-888888888888');
+  assert.equal(found2, undefined, 'record was deleted by question/scope');
+});
+
+test('Answer Bank API: Candidate ownership isolation and validation', async () => {
+  const { route } = createTestHarness();
+
+  // POST with candidateId not owned by actor -> rejected with 404
+  const resForbidden = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        candidateId: otherCandidateId, // Belongs to otherActorId
+        question: 'Any question',
+        answer: 'Any answer',
+      }),
+    })
+  );
+  assert.equal(resForbidden.status, 404, 'cannot post for candidate not owned by actor');
+
+  // POST with empty answer -> rejected with 400
+  const resEmptyAnswer = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        question: 'Any question',
+        answer: '   ',
+      }),
+    })
+  );
+  assert.equal(resEmptyAnswer.status, 400, 'empty answer rejected with 400');
+
+  // POST with empty question -> rejected with 400
+  const resEmptyQuestion = await route.POST(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${activeToken}`,
+        'content-type': 'application/json',
+      },
+      body: JSON.stringify({
+        question: '   ',
+        answer: 'Valid answer',
+      }),
+    })
+  );
+  assert.equal(resEmptyQuestion.status, 400, 'empty question rejected with 400');
+});
+
+test('Answer Bank API: GET filtering by companyScope', async () => {
+  const { tables, route } = createTestHarness();
+
+  tables.candidate_answer_bank.push(
+    {
+      id: 'a1111111-1111-4000-8000-111111111111',
+      candidate_id: candidateId,
+      question: 'Universal question',
+      question_normalized: 'universal question',
+      answer: 'Universal answer',
+      company_scope: null,
+      use_count: 1,
+      last_used_at: new Date().toISOString(),
+      created_at: new Date().toISOString(),
+      updated_at: new Date().toISOString(),
+    },
+    {
+      id: 'a2222222-2222-4000-8000-222222222222',
+      candidate_id: candidateId,
+      question: 'Company specific question',
+      question_normalized: 'company specific question',
+      answer: 'Figma specific answer',
+      company_scope: 'figma',
+      use_count: 2,
+      last_used_at: new Date().toISOString(),
+      created_at: new Date().toISOString(),
+      updated_at: new Date().toISOString(),
+    }
+  );
+
+  // GET without filter -> returns all candidate answers (2)
+  const resAll = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank', {
+      headers: { authorization: `Bearer ${activeToken}` },
+    })
+  );
+  const dataAll = await resAll.json();
+  assert.equal(dataAll.answers.length, 2);
+
+  // GET with ?companyScope=figma -> returns only figma answer (1)
+  const resFigma = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank?companyScope=figma', {
+      headers: { authorization: `Bearer ${activeToken}` },
+    })
+  );
+  const dataFigma = await resFigma.json();
+  assert.equal(dataFigma.answers.length, 1);
+  assert.equal(dataFigma.answers[0].company_scope, 'figma');
+
+  // GET with ?companyScope=null -> returns only universal answer (1)
+  const resUniversal = await route.GET(
+    new Request('http://localhost.test/api/extension/answer-bank?companyScope=null', {
+      headers: { authorization: `Bearer ${activeToken}` },
+    })
+  );
+  const dataUniversal = await resUniversal.json();
+  assert.equal(dataUniversal.answers.length, 1);
+  assert.equal(dataUniversal.answers[0].company_scope, null);
+});
+

`