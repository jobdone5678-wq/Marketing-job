# NextKinHR Recruiting Copilot 3.4.2 (targeted remediation of 3.4.1)

Changed: core/field-mapping.js, core/question-intent.js, core/answer-bank.js, core/application.js,
core/job-capture.js, core/site-rules.js, manifest.json, tests/*.

Mapper safety
- Third-party subject guard now runs first in planSingleField (before URL, DOB, availability, answer bank).
  Adds professor/attorney/doctor/landlord etc. and "email/phone of your company".
- Adapter hints no longer override a visible question about something else (also blocked from the intent classifier).
- Compensation: CTC/total comp, any explicitly requested currency, and non-annual periods need review unless the
  profile carries salary_currency / salary_period / compensation_type. Unqualified "expected salary" still fills.
- Education: "or equivalent experience", accreditation, degree-and-experience compounds need review.
- Relocation: destination-specific and at-own-expense questions need review.
- Country: large country list plus "work/sponsorship/authorized ... in <Place>" structural check.

Shared protected-question policy (question-intent.js: PROTECTED_QUESTION / isProtectedQuestion)
- Used by AI eligibility, mapper answer-bank lookup, answer-bank.matchAnswer and application.js replay.
- Option labels count as evidence. Fails closed if the policy is not loaded.

Veteran / community / location
- New facts: protected_veteran, military_service, current_military_service, community_memberships,
  preferred_work_location, preferred_office_location, relocation_destinations.
- Option-aware community checkbox groups: only explicitly confirmed memberships; opt-out only from a confirmed
  disclosure_preference; None of the above only when explicitly confirmed; mutually exclusive.
  Profile shape: { selected: [], disclosure_preference: 'disclose'|'decline', none_of_the_above: false, confirmed: true }
- Boolean veteran facts map to "I am (not) a veteran" style options; subtype lists stay unresolved.
- Intended work country wordings added; residence is never substituted.

Integration
- application.js passes jobCountry (structured JobPosting data only) and requireCandidateReview into planFill.
- site-rules.js enforces policyExpiresAt independently of selector expiresAt.

NOT in this release (see report): background write authorization, FAILED/PENDING_VERIFICATION handling,
submission-confirmation evidence, typeahead dropdown selection/readback, browser-level tests, backend/profile API
fields for the new facts.
