# Remaining Security Risks and Deployment Considerations

**Assessment Date**: 2026-11-05  
**Scope**: Post-Remediation Threat Profile  
**Status**: Managed & Tracked  

---

## 1. Unapplied Live Database Migrations (Pending Deployment)
- **Risk**: Migration `supabase/migrations/20261105000100_candidate_shares_rls.sql` has been created and verified in repository code, but will only take effect in production once applied to the live PostgreSQL database via `supabase db push` or executed via the Supabase Dashboard SQL Editor.
- **Mitigation Action**: Execute the migration on the staging and production Supabase environments during the next release deployment.

---

## 2. Historical Secret Exposure in Git History
- **Risk**: Commits `9071fd5308` (`jobright_extension/static/background/index.js`), `af6218b`, and `e2ef8f2` in Git commit history contain historical API keys. Even though they have been excised from the working branch, clone operations could recover historical commits.
- **Mitigation Action**:
  1. Revoke the Supabase `service_role` key in the Supabase Dashboard and reissue.
  2. Revoke the OpenAI API key in the OpenAI platform console.
  3. Execute `git-filter-repo` during an off-hours maintenance window to rewrite historical commit trees.

---

## 3. Moderate Transitive npm Vulnerabilities
- **Risk**: `npm audit` reports 23 non-critical vulnerabilities in transitive dependencies (e.g. `undici`, `mailparser`, `ip-address`, `fast-uri` used by development tools, parsers, and registry tooling).
- **Impact**: No direct exploitable remote code execution paths identified in production request pipelines.
- **Mitigation Action**: Keep dependencies refreshed via periodic `npm update` and upstream library patches.

---

## 4. Client-Side Workstation Token Storage
- **Risk**: Manifest V3 browser extensions use `chrome.storage.local` to cache active authentication tokens and candidate metadata for autofill functionality. These files reside in the user's local Chrome profile directory on disk.
- **Impact**: Malware running with administrative access on the user's personal operating system could read local profile files.
- **Mitigation Action**: Candidate workstations should enable operating system full-disk encryption (BitLocker on Windows, FileVault on macOS) and strong device lock credentials. Short-lived extension credential expiration (`expires_at`) limits exposure window.

---

## 5. Ongoing Monitoring & Security Governance
- Maintain automated pre-commit scanning (e.g. `git-secrets` or Gitleaks) to prevent accidental credential commits.
- Enforce periodic token rotation for service role credentials and OAuth client secrets.
