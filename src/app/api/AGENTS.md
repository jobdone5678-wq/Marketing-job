# Next.js API Route Handlers (`src/app/api/`)

Backend API surface running on Next.js 16 App Router (`Node.js` runtime for AI/DB/crypto routes).

## Auth & Security Gates

1. **Web dashboard routes** (`/api/jobseeker/*`, `/api/resumes/*`, `/api/submissions/*`, `/api/outside-jobs`):
   - Wrap handlers with `protectedRoute` (`src/lib/http/protected-route.ts`), which enforces `requireSameOrigin` on mutations, resolves the authenticated profile via `requireProfile()`, validates Zod inputs, and emits `Server-Timing` headers.
   - Always enforce candidate ownership (`src/lib/auth/candidate-ownership.ts`) before reading or mutating candidate records.
2. **Extension routes** (`/api/extension/*`):
   - Authenticate via `extensionRoute` / `extensionProfile` (`src/lib/capture/server.ts`) or `extensionResumeActor` (`src/lib/extension-answers/candidate-context.ts`).
   - Support CORS preflight (`OPTIONS`) cleanly via `cors(request, ...)`.
   - Apply rate limiting (`src/lib/rate-limit.ts`) on AI endpoints (`autofill/plan`, `autofill/choose`, `generate-answer`).
3. **Canonical `v1/me` routes** (`/api/v1/me/*`):
   - Resolve caller via `resolveV1UserId` (`src/lib/v1/auth.ts`), supporting `Authorization: Bearer <token>` (hashed against `extension_credentials` or Supabase JWT) and session cookies.
4. **Worker webhooks** (`/api/webhooks/process-task`):
   - Authenticate with constant-time secret comparison (`WEBHOOK_SECRET` / `SUPABASE_WEBHOOK_SECRET`); never trust unauthenticated payloads.

## Core Route Groups (In-Scope)

- **Autofill & AI**:
  - `extension/autofill/plan/route.ts` & `extension/autofill/choose/route.ts` -> `src/lib/ai/autofill-orchestrator.ts`
  - `extension/generate-answer/route.ts` -> open-ended screening prose
  - `extension/ai/settings/route.ts` & `extension/ai/test-connection/route.ts` -> 4-mode AI config (`server`, `portal_byok`, `extension_byok`, `local`)
  - `extension/answer-bank/route.ts`, `extension/candidates/route.ts`, `extension/resume/route.ts`, `extension/resume-file/route.ts`
- **Applied Jobs Saving**:
  - `extension/auto-submit/route.ts`, `extension/events/route.ts`, `extension/intents/*`, `extension/save-external-job/route.ts`
  - `webhooks/application-submitted/route.ts`, `submissions/*`, `outside-jobs/route.ts`, `application-intents/*`
- **Candidate Profile & Resumes**:
  - `jobseeker/resume/route.ts`, `resumes/*`, `v1/me/*`
