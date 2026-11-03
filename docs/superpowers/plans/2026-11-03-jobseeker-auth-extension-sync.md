# Dedicated Job Seeker Auth & Extension Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated, role-free candidate authentication portal and automated extension pairing flow so external job applicants can register, save resumes to the database, and use 1-click autofill across job boards without seeing or interacting with internal company roles.

**Architecture:** A dedicated Next.js page (`/auth/jobseeker`) provides clean applicant signup and login with zero internal role pickers, automatically assigning `role: 'job_seeker'` with active status. An authenticated API endpoint (`/api/jobseeker/resume`) persists uploaded resumes to the database, while the extension quick-pair mechanism establishes a secure extension credential token and syncs profile data into `chrome.storage.local`.

**Tech Stack:** Next.js 15 (App Router), Supabase Auth & SSR, PostgreSQL / Supabase DB, React 19, Tailwind CSS, Chrome Extension API (storage.local, tabs, runtime).

---

## Global Constraints

- Never expose internal company roles (`super_admin`, `recruiter`, `technical_recruiter`) to external applicants.
- Keep the existing internal company login page (`/` and `src/components/signup-form.tsx`) completely intact for internal company staff.
- External job seekers must be automatically assigned `role: 'job_seeker'` and `status: 'active'` without requiring administrative approval.
- Ensure all API endpoints validate authenticated user sessions and enforce Row Level Security (RLS) so external users cannot read or modify other candidates' data.
- The Chrome extension must maintain zero visual drift for the existing layout, circular gauge, and buttons.

---

## Review Focus

1. **Role Leakage Prevention**: External users visiting `/auth/jobseeker` must not see recruiter or client role tabs, admin warnings, or internal workspace menus.
2. **Session Handshake Reliability**: When an applicant signs up or logs in via the browser tab, the extension must capture the session token within 2 seconds without requiring manual copy-pasting.
3. **Database Persistence**: Resumes uploaded during or after onboarding must be written to the database with parsed facts, skills, and source text associated with the applicant's `user_id`.
4. **Internal Staff Isolation**: Existing internal company users logging into `/` must continue to have their existing permissions, bench lists, and approval workflows untouched.
5. **Session Expiry & Re-auth**: If an external applicant's token expires or is cleared, the extension must gracefully prompt them to re-authenticate at `/auth/jobseeker` rather than throwing uncaught errors.

---

## Task Decomposition

### Task 1: Database Types & Role Definition

**Files:**
- Modify: `src/types/database.ts:1-25`
- Modify: `src/lib/auth/session-profile.ts:1-55`
- Modify: `src/app/api/extension/quick-pair/route.ts:70-95`

- [ ] **Step 1.1: Add `job_seeker` to `AppRole`**
  Update `src/types/database.ts` to include `'job_seeker'` in `AppRole`:
  ```typescript
  export type AppRole = 'super_admin' | 'recruiter' | 'technical_recruiter' | 'client' | 'job_seeker';
  ```

- [ ] **Step 1.2: Update Session Profile Helpers**
  In `src/lib/auth/session-profile.ts`:
  - Update `roleLabel` to map `'job_seeker'` to `"Job Seeker"`.
  - Update `ensureSessionProfile` so that when `requestedRole === 'job_seeker'` (or user registers via candidate portal), the profile is created with `role: 'job_seeker'` and `status: 'active'`.

- [ ] **Step 1.3: Update Quick-Pair Endpoint Authorization**
  In `src/app/api/extension/quick-pair/route.ts`, allow `job_seeker` in the allowed roles list:
  ```typescript
  if (profile.status !== 'active' || !['job_seeker', 'client', 'recruiter', 'technical_recruiter', 'super_admin'].includes(profile.role)) {
    return cors(request, Response.json({ error: 'Active account required.' }, { status: 403 }));
  }
  ```

- [ ] **Step 1.4: Run Typecheck**
  Run: `npx tsc --noEmit` to verify type safety across all database and auth modules.

---

### Task 2: Dedicated Candidate Auth Page (`/auth/jobseeker`)

**Files:**
- Create: `src/app/auth/jobseeker/page.tsx`
- Create: `src/components/jobseeker-auth-card.tsx`

- [ ] **Step 2.1: Create Candidate Auth Component**
  Build `src/components/jobseeker-auth-card.tsx`:
  - Professional, clean UI tailored to job applicants.
  - No role selector buttons or administrative notices.
  - Fields: Full Name (on Sign Up), Email Address, Password.
  - Toggle between "Sign Up" and "Log In".
  - One-click Google authentication button (`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })`).
  - Auto-submits `role: 'job_seeker'` in metadata on signup.
  - On success: redirects to `/auth/jobseeker/connected?paired=true`.

- [ ] **Step 2.2: Create Candidate Page Route**
  Build `src/app/auth/jobseeker/page.tsx` rendering `JobseekerAuthCard` centered on a branded, gradient background showcasing key candidate benefits:
  - *"1-Click Job Application Autofill for Ashby, Greenhouse, Lever & Workday"*
  - *"Real-time ATS Match Scoring & Gap Analysis"*
  - *"Cloud Resume Sync across all job portals"*

- [ ] **Step 2.3: Build Post-Auth Handoff Page**
  Create `src/app/auth/jobseeker/connected/page.tsx`:
  - Dispatches extension pairing event via `window.postMessage({ type: 'NEXTKIN_EXTENSION_PAIRED', token, user }, '*')` and DOM attribute flags (`data-nextkin-session`).
  - Shows clear confirmation: *"Account connected! Return to your job application tab to autofill."*
  - Automatically closes the tab after 4 seconds (or provides a "Close Tab" button).

---

### Task 3: Resume Database Storage API for Job Seekers

**Files:**
- Create: `src/app/api/jobseeker/resume/route.ts`
- Test: `tests/api/jobseeker-resume.test.ts` (or node verification script)

- [ ] **Step 3.1: Build Resume Upload API Route**
  In `src/app/api/jobseeker/resume/route.ts`:
  - Accepts authenticated POST requests with `Authorization: Bearer <token>` or Supabase session cookies.
  - Body payload:
    ```json
    {
      "filename": "Bhargav_Reddy_Resume.pdf",
      "raw_text": "...",
      "skills": ["Python", "TypeScript", "React"],
      "fullName": "Bhargav Reddy",
      "email": "bhargav@example.com",
      "phone": "+1234567890"
    }
    ```
  - Inserts/upserts into `candidates` table (or `user_resumes`) with `owner_id: user.id` and `is_job_seeker: true`.
  - Returns `{ success: true, resumeId: "...", profile: { ... } }`.

- [ ] **Step 3.2: Build Resume Retrieval API Route**
  In the same route (`GET` handler):
  - Retrieves the active saved resume for the authenticated user so the extension can auto-populate on any device.

---

### Task 4: Extension Integration & Quick-Pair Handshake

**Files:**
- Modify: `jobright_extension/helper-app.41ea2652.js`
- Modify: `browser-extension-v3.2.1/content.js` (and `jobright_extension/contents.d42e7fcf.js`)

- [ ] **Step 4.1: Extension Auth Trigger**
  In `jobright_extension/helper-app.41ea2652.js`:
  - When an unauthenticated applicant clicks "Upload Resume" or "Autofill":
    - Check if `nextkin_auth_token` or `nextkin_active_candidate` exists in storage.
    - If missing: open `window.open("https://nextkinhr.com/auth/jobseeker?source=extension", "_blank")` or notify background script to open tab.

- [ ] **Step 4.2: Web Session Sync Listener**
  In `jobright_extension` content scripts (`contents.d42e7fcf.js` or `agent-submission-sync.7f769d2a.js`):
  - When user is on `nextkinhr.com/auth/jobseeker/connected`:
    - Call `/api/extension/quick-pair` to generate extension credential token.
    - Save token, user role (`job_seeker`), and user ID into `chrome.storage.local`.
    - Broadcast `NEXTKIN_EXTENSION_AUTH_SUCCESS` so open job tabs immediately reload candidate data.

- [ ] **Step 4.3: Cloud Resume Sync in Extension**
  When `evaluateMatch` runs in `helper-app.41ea2652.js`:
  - Check `chrome.storage.local.get(["uploaded_resume", "jobseeker_cloud_resume"])`.
  - If a cloud resume exists, automatically load it into `activeCandidateRef.current`.
  - When user uploads a new resume file in the extension, background worker asynchronously saves it to `/api/jobseeker/resume` so it is backed up to the database.

---

### Task 5: End-to-End Verification

**Files:**
- Test: `tests/e2e-jobseeker-flow.js`

- [ ] **Step 5.1: Test Fresh Job Seeker Page Rendering**
  Verify `/auth/jobseeker` renders without role picker tabs or recruiter warnings.
- [ ] **Step 5.2: Test Candidate Registration & Supabase DB Entry**
  Verify that creating an account assigns `role: 'job_seeker'` and `status: 'active'`.
- [ ] **Step 5.3: Test Quick-Pair Token Generation**
  Verify `/api/extension/quick-pair` succeeds for `job_seeker` and issues a valid Bearer token.
- [ ] **Step 5.4: Test Resume Save & Retrieve**
  Verify `/api/jobseeker/resume` persists candidate data and returns it on GET.
- [ ] **Step 5.5: Test Extension Autofill Activation**
  Verify that the extension in a job board tab receives the candidate profile and enables ATS match scoring and 1-click autofill.
