export interface CandidateRaw {
  id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  current_city?: string;
  current_state?: string;
  country?: string;
  total_experience_years?: number | null;
  primary_skills?: string;
  source_text?: string;
  markdown?: string;
  provenance_status?: string;
  confirmed_facts?: {
    country?: string;
    [key: string]: unknown;
  };
  version?: number;
  [key: string]: unknown;
}

export interface CandidateFacts {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  totalExperienceYears: number | null;
  primarySkills: string;
}

export interface CandidateContextResult {
  valid: boolean;
  candidateId: string | null;
  source: string;
  version: number;
  factsHash: string;
  facts: CandidateFacts | Record<string, unknown>;
  isConfirmed: boolean;
  reasons: string[];
  raw?: CandidateRaw;
}

export function createCandidateContext(candidate: CandidateRaw | null | undefined, source = 'connected'): CandidateContextResult {
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

  const facts: CandidateFacts = {
    fullName: candidate.full_name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    city: candidate.current_city || '',
    state: candidate.current_state || '',
    country: candidate.confirmed_facts?.country || candidate.country || '',
    totalExperienceYears: candidate.total_experience_years != null ? candidate.total_experience_years : null,
    primarySkills: candidate.primary_skills || ''
  };

  const reasons: string[] = [];
  if (!isConfirmed) {
    reasons.push('Candidate facts are unconfirmed or stale.');
  }

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

export const NextkinCandidateContext = { create: createCandidateContext };
export default NextkinCandidateContext;

