// Curated primary sources; Lever directory expanded 2026-10-16. Jobs are fetched from the public
// ATS API at request time; the catalog itself contains no cached job postings.
export type SupportedJobProvider =
  'greenhouse' | 'ashby' | 'lever' | 'smartrecruiters' | 'breezy' | 'remoteok';

export const PUBLIC_JOB_BOARDS: {
  provider: SupportedJobProvider;
  board_slug: string;
  company: string;
  source_url: string;
}[] = [
  {
    provider: 'ashby',
    board_slug: 'ramp',
    company: 'Ramp',
    source_url: 'https://jobs.ashbyhq.com/ramp',
  },
  {
    provider: 'greenhouse',
    board_slug: 'figma',
    company: 'Figma',
    source_url: 'https://job-boards.greenhouse.io/figma',
  },
  {
    provider: 'ashby',
    board_slug: 'openai',
    company: 'OpenAI',
    source_url: 'https://jobs.ashbyhq.com/openai',
  },
  {
    provider: 'greenhouse',
    board_slug: 'stripe',
    company: 'Stripe',
    source_url: 'https://job-boards.greenhouse.io/stripe',
  },
  {
    provider: 'lever',
    board_slug: 'spotify',
    company: 'Spotify',
    source_url: 'https://jobs.lever.co/spotify',
  },
  {
    provider: 'lever',
    board_slug: 'palantir',
    company: 'Palantir Technologies',
    source_url: 'https://jobs.lever.co/palantir',
  },
  {
    provider: 'lever',
    board_slug: 'zoox',
    company: 'Zoox',
    source_url: 'https://jobs.lever.co/zoox',
  },
  {
    provider: 'greenhouse',
    board_slug: 'cloudflare',
    company: 'Cloudflare',
    source_url: 'https://job-boards.greenhouse.io/cloudflare',
  },
  {
    provider: 'smartrecruiters',
    board_slug: 'BoschGroup',
    company: 'Bosch Group',
    source_url: 'https://careers.smartrecruiters.com/BoschGroup',
  },
  {
    provider: 'greenhouse',
    board_slug: 'canonical',
    company: 'Canonical',
    source_url: 'https://job-boards.greenhouse.io/canonical',
  },
  {
    provider: 'ashby',
    board_slug: 'notion',
    company: 'Notion',
    source_url: 'https://jobs.ashbyhq.com/notion',
  },
  {
    provider: 'ashby',
    board_slug: 'linear',
    company: 'Linear',
    source_url: 'https://jobs.ashbyhq.com/linear',
  },
  {
    provider: 'ashby',
    board_slug: 'supabase',
    company: 'Supabase',
    source_url: 'https://jobs.ashbyhq.com/supabase',
  },
  {
    provider: 'breezy',
    board_slug: 'breezy',
    company: 'Breezy HR',
    source_url: 'https://breezy.breezy.hr',
  },
  {
    provider: 'remoteok',
    board_slug: 'remote',
    company: 'RemoteOK Global Tech',
    source_url: 'https://remoteok.com',
  },
];
