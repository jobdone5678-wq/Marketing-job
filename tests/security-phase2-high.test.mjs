import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('VULN-06: Next.js 16 proxy.ts and middleware.ts are configured with matching pattern', async () => {
  assert.ok(fs.existsSync('src/proxy.ts'), 'src/proxy.ts must exist for Next.js 16 proxy convention');
  assert.ok(fs.existsSync('src/middleware.ts'), 'src/middleware.ts must exist for backwards compatibility');

  const proxyContent = fs.readFileSync('src/proxy.ts', 'utf8');
  assert.match(proxyContent, /export async function proxy/);
  assert.match(proxyContent, /export const config/);
  assert.match(proxyContent, /updateSession/);

  const middlewareContent = fs.readFileSync('src/middleware.ts', 'utf8');
  assert.match(middlewareContent, /export async function middleware/);
});

test('VULN-07: extension agent-submission-sync validates ev.origin and ev.source', () => {
  const syncJobright = fs.readFileSync('jobright_extension/agent-submission-sync.7f769d2a.js', 'utf8');
  assert.match(syncJobright, /isTrustedOrigin\(ev\.origin\)/, 'Must check isTrustedOrigin on incoming event');
  assert.match(syncJobright, /ev\.source !== win/, 'Must verify message sender is the current window');
  assert.match(syncJobright, /u\.hostname === ["']nextkinhr\.com["']/, 'Must explicitly validate trusted nextkinhr domain');
});

test('VULN-08 & VULN-09: RTR [id] endpoint enforces identifier validation and calls candidateAccess', () => {
  const rtrIdRoute = fs.readFileSync('src/app/api/rtr/[id]/route.ts', 'utf8');
  assert.match(rtrIdRoute, /candidateAccess/, 'Must import and enforce candidateAccess');
  assert.match(rtrIdRoute, /sanitizeRtrId/, 'Must sanitize and validate RTR ID');
  assert.doesNotMatch(rtrIdRoute, /\.or\(`id\.eq\.\$\{cleanSubId\}/, 'Must not interpolate raw string into PostgREST .or()');
});

test('VULN-10: migration 20261105000100_candidate_shares_rls enables RLS on candidate_shares', () => {
  assert.ok(fs.existsSync('supabase/migrations/20261105000100_candidate_shares_rls.sql'));
  const sql = fs.readFileSync('supabase/migrations/20261105000100_candidate_shares_rls.sql', 'utf8');
  assert.match(sql, /ALTER TABLE public\.candidate_shares ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /CREATE POLICY candidate_shares_recipient_select/);
  assert.match(sql, /CREATE POLICY candidate_shares_pusher_select/);
  assert.match(sql, /CREATE POLICY candidate_shares_insert/);
});
