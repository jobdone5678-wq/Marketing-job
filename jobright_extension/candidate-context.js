(function(root) {
  'use strict';

  function createCandidateContext(candidate, source = 'connected') {
    if (!candidate || !candidate.id) {
      return {
        valid: false,
        candidateId: null,
        source,
        version: 1,
        factsHash: '',
        facts: {},
        isConfirmed: false,
        reasons: ['No active candidate profile selected.']
      };
    }

    const isConfirmed = source === 'uploaded'
      ? Boolean(candidate.source_text || candidate.markdown)
      : candidate.provenance_status === 'confirmed';

    const facts = {
      fullName: candidate.full_name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      city: candidate.current_city || '',
      state: candidate.current_state || '',
      country: candidate.confirmed_facts?.country || candidate.country || '',
      totalExperienceYears: candidate.total_experience_years != null ? candidate.total_experience_years : null,
      primarySkills: candidate.primary_skills || '',
      expectedSalary: candidate.expected_salary || null,
      authorizedInUsa: typeof candidate.authorized_in_usa === 'boolean' ? candidate.authorized_in_usa : null,
      needsSponsorship: typeof (candidate.need_sponsorship_now || candidate.need_sponsorship_future) === 'boolean'
        ? (candidate.need_sponsorship_now || candidate.need_sponsorship_future)
        : null,
      openToRelocation: typeof candidate.open_to_relocation === 'boolean' ? candidate.open_to_relocation : null,
      noticePeriod: candidate.notice_period || candidate.available_to_join || null
    };

    const reasons = [];
    if (!isConfirmed) {
      reasons.push('Candidate facts have not been reviewed and confirmed.');
    }
    if (!facts.fullName) {
      reasons.push('Candidate full name is missing.');
    }

    // Stable facts hash
    const serialized = JSON.stringify({
      id: candidate.id,
      version: candidate.version || 1,
      facts
    });

    let hash = 0;
    for (let i = 0; i < serialized.length; i++) {
      hash = ((hash << 5) - hash) + serialized.charCodeAt(i);
      hash |= 0;
    }
    const factsHash = 'cf_' + Math.abs(hash).toString(36);

    return {
      valid: reasons.length === 0,
      candidateId: candidate.id,
      source,
      version: candidate.version || 1,
      factsHash,
      facts,
      isConfirmed,
      reasons,
      raw: candidate
    };
  }

  const api = { create: createCandidateContext };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.NextkinCandidateContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
