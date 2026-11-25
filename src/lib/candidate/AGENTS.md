# Candidate Truth Layer (`src/lib/candidate/`, `profile/`, `resumes/`, `identity/`, `ingest/`)

Manages the candidate's verified profile, resume extraction, Experience Bank, Screening Answer Bank, and geography/skill normalization.

## Modules

- **`src/lib/candidate/experience.ts`**:
  - Append-only/structured `experience_employments` and `experience_evidence_atoms` (`cv_import`, `stated_in_chat`, `manual`, `agent_inferred`).
  - Enforces rune caps (`MAX_CLAIM_RUNES = 400`, `MAX_CONTEXT_RUNES = 1200`, `MAX_EMP_SUMMARY_RUNES = 600`) and skill merging via `mergeProfileSkills`.
- **`src/lib/candidate/answerbank.ts`**:
  - Topic-keyed reusable answers (`CANONICAL_ANSWER_TOPICS`: `salary_expectation`, `notice_period`, `relocation`, `start_date`, `how_did_you_hear`, `age_18_or_older`) + custom screening Q&As (`MAX_ANSWER_LEN = 2000`).
  - Tracks provenance (`candidate` vs `agent_inferred`) and excludes EEO demographics (`isEeoDemographicField`).
  - Pair with Supabase `pgvector` (see `docs/agents/pgvector-embeddings.md`) for semantic retrieval on novel question phrasing.
- **`src/lib/candidate/resumeextract.ts` & `src/lib/resumes/`**:
  - Parses uploaded PDF/DOCX resumes (`local-extract.ts`, `upload.ts`, `validation.ts`) into structured contacts, employments, projects, and skills.
  - `extension-documents.ts` serves confirmed resume files for ATS file-upload inputs.
- **`src/lib/ingest/screeninganswers.ts`**:
  - Typed screening facts (`authorized_countries`, `visa_sponsorship_needed`, `desired_salary_*`, `notice_period_days`, `willing_to_relocate`, `age_18_or_older`, `privacy_consent`).
- **`src/lib/identity/userprofile.ts` & `src/lib/profile/`**:
  - Country normalization (`normalizeCountryCode`, `countries.ts`, `profile-countries.json`), skill slug normalization (`normalizeSkillSlug`), and profile persistence (`profile-store.ts`).

## Rules

- **Confirmation boundary**: Parsed resume values and `agent_inferred` screening/experience entries must be reviewable drafts before becoming confirmed autofill truth. Never silently overwrite candidate-edited fields on re-upload.
- **Strict allowlist on extension reads**: `/api/extension/candidates` (`savedOnly=true`) must only expose confirmed autofill fields and metadata, never unreviewed raw resume text or unrelated account fields.
- **Explicit field clearing**: Clearing an optional field (email, phone, sponsorship) must persist `null`/empty explicitly rather than preserving stale column values via `undefined`.
