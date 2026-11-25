# Auth & Caller Ownership (`src/lib/auth/`, `src/lib/v1/auth.ts`, `src/lib/http/`)

Authentication, session resolution, extension bearer pairing, and per-candidate authorization boundaries.

## Core Files

- **`src/lib/auth/require-profile.ts`**: Resolves the authenticated Supabase user and active profile for Next.js App Router requests.
- **`src/lib/http/protected-route.ts`**: Standard wrapper for dashboard APIs (`protectedRoute`). Enforces `requireSameOrigin` on non-`GET`/`HEAD` requests, authenticates via `requireProfile()`, validates Zod errors as `400`, and sets `Server-Timing`.
- **`src/lib/auth/candidate-ownership.ts` & `profile-access.ts`**: Verifies the caller owns or is explicitly authorized for the target `candidateId` before reading/writing profiles, AI secrets, or submissions.
- **`src/lib/v1/auth.ts`**: `resolveV1UserId` resolves `Authorization: Bearer <token>` by hashing (`sha256`) against `public.extension_credentials` (checking `revoked_at` and `expires_at`), validating a Supabase JWT via `auth.getUser(token)`, or falling back to server session cookies.
- **`src/lib/capture/server.ts`**: `extensionRoute`, `extensionProfile`, and `cors` helpers for `/api/extension/*`.

## Rules

- Never trust a client-supplied `candidateId` or `userId` without verifying ownership against `auth.uid()` or the resolved `extension_credentials.owner_id`.
- Always store extension bearer tokens hashed (`sha256` in `extension_credentials.token_hash`), never in plaintext.
- Do not bypass `requireSameOrigin` on cookie-authenticated mutation routes.
