"use client";

import * as React from 'react';
import Link from 'next/link';
import {
  MailIcon,
  RefreshCwIcon,
  UploadIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ExternalLinkIcon,
  ClockIcon,
  BuildingIcon,
  BriefcaseIcon,
  Settings2Icon,
  ChevronDownIcon,
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
} from 'lucide-react';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { ApplicationIdentity, CandidateIdentity, EmailConnectionSummary, EmailReceiptRecord } from '@/lib/email-confirmations/types';

type GmailSetup = { missing: string[]; invalid: string[]; appOrigin: string | null; redirectUri: string | null };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result as T;
}

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
    </svg>
  );
}

export default function EmailConfirmationsPage() {
  const [receipts, setReceipts] = React.useState<EmailReceiptRecord[]>([]);
  const [connections, setConnections] = React.useState<EmailConnectionSummary[]>([]);
  const [candidates, setCandidates] = React.useState<CandidateIdentity[]>([]);
  const [applications, setApplications] = React.useState<ApplicationIdentity[]>([]);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [gmailSetup, setGmailSetup] = React.useState<GmailSetup | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<EmailReceiptRecord | null>(null);
  const [candidateId, setCandidateId] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [jobTitle, setJobTitle] = React.useState('');
  const [submissionId, setSubmissionId] = React.useState('');
  const [filter, setFilter] = React.useState('needs_review');
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const loadGeneration = React.useRef(0);

  const load = React.useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    setConfigured(null);
    setGmailSetup(null);
    try {
      const [data, mail] = await Promise.allSettled([
        api<{ receipts: EmailReceiptRecord[]; candidates: CandidateIdentity[]; applications: ApplicationIdentity[]; total: number; hasMore: boolean }>(
          `/api/email-confirmations?disposition=${filter}&page=${page}`
        ),
        api<{ connections: EmailConnectionSummary[]; gmailConfigured: boolean; gmailSetup?: GmailSetup }>('/api/email-connections'),
      ]);
      if (generation !== loadGeneration.current) return;
      const failures: string[] = [];
      if (data.status === 'fulfilled') {
        setReceipts(data.value.receipts);
        setCandidates(data.value.candidates);
        setApplications(data.value.applications);
        setTotal(data.value.total);
        setHasMore(data.value.hasMore);
      } else {
        failures.push('Receipts: ' + (data.reason instanceof Error ? data.reason.message : 'Could not load receipts.'));
      }
      if (mail.status === 'fulfilled') {
        setConnections(mail.value.connections);
        setConfigured(mail.value.gmailConfigured);
        setGmailSetup(mail.value.gmailSetup ?? null);
      } else {
        setConnections([]);
        failures.push('Gmail status: ' + (mail.reason instanceof Error ? mail.reason.message : 'Could not check mailbox configuration.'));
      }
      setError(failures.join(' '));
    } catch (reason) {
      if (generation === loadGeneration.current) setError(reason instanceof Error ? reason.message : 'Could not load confirmations.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [filter, page]);

  React.useEffect(() => {
    void Promise.resolve().then(load);
    const status = new URLSearchParams(window.location.search).get('mail');
    if (status === 'connected') toast.success('Mailbox connected. Sync now to import recent receipts.');
    if (status === 'connection_failed') toast.error('Mailbox was not connected. Check configuration and consent, then retry.');
    if (status === 'reconnect') toast.info('You are now on the configured Gmail callback host. Connect Gmail again to continue.');
    if (status) window.history.replaceState(null, '', window.location.pathname);
    return () => {
      loadGeneration.current++;
    };
  }, [load]);

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    try {
      await work();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Operation failed.');
    } finally {
      setBusy(null);
    }
  }

  function openReview(receipt: EmailReceiptRecord) {
    setSelected(receipt);
    setCandidateId(receipt.candidate_id || '');
    setCompany(receipt.extracted_company || '');
    setJobTitle(receipt.extracted_job_title || '');
    setSubmissionId(receipt.submission_id || '');
  }

  const related = applications.filter((application) => application.candidate_id === candidateId);
  const visible = receipts.filter((receipt) => filter === 'all' || receipt.disposition === filter);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-6xl w-full mx-auto">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Communications & Inbound Tracking
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <MailIcon className="h-5 w-5" />
            </span>
            Email confirmations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Connect the Gmail mailbox that receives job application confirmations. Recruiters track assigned candidates; candidates track their own applications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-xl border-border/80 px-3 text-xs font-medium shadow-xs hover:border-primary/50 transition-all cursor-pointer"
            disabled={loading || !!busy}
            onClick={() => void load()}
          >
            <RefreshCwIcon className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-xl border-border/80 px-3 text-xs font-medium shadow-xs hover:border-primary/50 transition-all cursor-pointer"
            disabled={!!busy}
            onClick={() => uploadRef.current?.click()}
          >
            <UploadIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
            Import receipt
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-xl border-border/80 px-3 text-xs font-medium shadow-xs hover:border-primary/50 transition-all cursor-pointer"
            render={<Link href="/dashboard/submissions" />}
          >
            Applications
            <ExternalLinkIcon className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
          </Button>
        </div>

        <input
          ref={uploadRef}
          type="file"
          accept=".eml,message/rfc822"
          className="hidden"
          aria-label="Import email receipt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void run('import', async () => {
              const form = new FormData();
              form.append('receipt', file);
              const result = await api<{ disposition: string; duplicate: boolean }>('/api/email-confirmations/import', { method: 'POST', body: form });
              toast.success(result.duplicate ? 'This receipt was already imported.' : result.disposition === 'ignored' ? 'This email is not an application receipt.' : 'Receipt imported for review.');
              await load();
            });
          }}
        />
      </div>

      {/* Connected mailboxes section */}
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MailIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Connected mailboxes</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                Connect Gmail separately even if you signed in with Google. Read-only scanning finds application receipts; confirmed applications appear in My Applications. A receipt confirms submission, not a job offer.
              </p>
            </div>
          </div>
          <Button
            disabled={!configured || !!busy}
            className="h-9 rounded-xl px-4 text-xs font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto shrink-0"
            onClick={() =>
              void run('connect', async () => {
                const result = await api<{ url: string }>('/api/email-connections/gmail/connect', { method: 'POST' });
                window.location.assign(result.url);
              })
            }
          >
            <GoogleIcon className="h-4 w-4" />
            Connect Gmail
          </Button>
        </div>

        {!loading && configured === false && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-700 dark:text-amber-300 flex items-start gap-3">
            <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Gmail is not configured on this deployment. Your administrator must complete the email capture setup. Imported .eml receipts require review.
            </p>
          </div>
        )}

        {gmailSetup && (
          <details className="group rounded-xl border border-border/70 bg-muted/20 overflow-hidden text-xs" open={!configured}>
            <summary className="flex items-center justify-between p-3.5 font-semibold cursor-pointer select-none text-foreground hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2">
                <Settings2Icon className="h-4 w-4 text-muted-foreground" />
                <span>Administrator Gmail setup</span>
              </div>
              <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
            </summary>
            <div className="p-4 border-t border-border/50 space-y-3 bg-background/50">
              {gmailSetup.missing.length > 0 && (
                <div className="text-destructive font-medium">
                  Missing server variables: <span className="font-mono bg-destructive/10 px-1.5 py-0.5 rounded break-words">{gmailSetup.missing.join(', ')}</span>.
                </div>
              )}
              {gmailSetup.invalid.map((issue) => (
                <p key={issue} className="text-destructive font-medium">{issue}</p>
              ))}
              <p className="text-muted-foreground">
                Set the server variables in this hosting project&apos;s Production environment, then redeploy. Local .env.local settings do not configure the hosted site.
              </p>
              {gmailSetup.redirectUri && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Register this exact authorized redirect URI in the Google OAuth web client:</span>
                  <div className="p-2 rounded-lg bg-muted border border-border/80 font-mono text-[11px] text-foreground break-all select-all">
                    <code>{gmailSetup.redirectUri}</code>
                  </div>
                </div>
              )}
              {gmailSetup.appOrigin && (
                <p className="text-muted-foreground">
                  Connect from{' '}
                  <a className="font-medium text-primary underline" href={`${gmailSetup.appOrigin}/dashboard/email-confirmations`}>
                    {gmailSetup.appOrigin}
                  </a>{' '}
                  so the sign-in session and consent cookie use the callback host.
                </p>
              )}
            </div>
          </details>
        )}

        {connections.length === 0 && !loading && !error && (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 text-center text-xs text-muted-foreground">
            No connected mailboxes. Click &quot;Connect Gmail&quot; above to link a mailbox or import an .eml receipt file.
          </div>
        )}

        <div className="space-y-3">
          {connections.map((connection) => (
            <MailboxCard
              key={connection.id}
              connection={connection}
              busy={!!busy}
              onSync={() =>
                void run(connection.id, async () => {
                  const result = await api<{ processed: number; confirmed: number; review: number; hasMore: boolean }>(
                    `/api/email-connections/${connection.id}/sync`,
                    { method: 'POST' }
                  );
                  toast.success(
                    `${result.confirmed} confirmed, ${result.review} for review.${
                      result.hasMore ? ' More messages remain; sync again or let the worker continue.' : ''
                    }`
                  );
                  await load();
                })
              }
              onSave={(domains) =>
                void run(connection.id, async () => {
                  await api(`/api/email-connections/${connection.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ senderDomains: domains }),
                  });
                  toast.success('Approved sender domains saved. Existing receipts still require their recorded review.');
                  await load();
                })
              }
              onDisconnect={() =>
                void run(connection.id, async () => {
                  const result = await api<{ providerRevoked: boolean }>(`/api/email-connections/${connection.id}`, { method: 'DELETE' });
                  toast.success(
                    result.providerRevoked
                      ? 'Mailbox disconnected and Google access revoked.'
                      : 'Mailbox disconnected locally. Also remove access in your Google account if provider revocation failed.'
                  );
                  await load();
                })
              }
            />
          ))}
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div role="alert" className="border border-destructive/40 bg-destructive/10 rounded-xl p-4 text-sm text-destructive flex items-start gap-2.5">
          <AlertCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Recent receipts section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-foreground">Recent receipts</h2>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {total}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="receipt-status-filter" className="text-xs font-medium text-muted-foreground sr-only">
              Filter receipt status
            </label>
            <select
              id="receipt-status-filter"
              aria-label="Filter receipt status"
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="needs_review">Needs review</option>
              <option value="confirmed">Confirmed</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All receipts</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            <strong className="font-semibold text-foreground">{total} receipts</strong> in this view · Page {page + 1}. Automatic confirmation requires an authenticated approved sender and an unambiguous candidate and job match.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
              disabled={loading || !!busy || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
              disabled={loading || !!busy || !hasMore}
              onClick={() => setPage((value) => value + 1)}
            >
              Next page
            </Button>
          </div>
        </div>

        {loading ? (
          <WorkspaceSkeleton rows={4} />
        ) : !error && visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-10 text-center space-y-2">
            <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MailIcon className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">No receipts in this view</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Connect a mailbox or import an application receipt to start tracking inbound submission confirmations.
            </p>
          </div>
        ) : null}

        {!loading && !error && (
          <div className="space-y-3">
            {visible.map((receipt) => (
              <article
                key={receipt.id}
                className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground break-words">{receipt.subject}</h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        receipt.disposition === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : receipt.disposition === 'needs_review'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {receipt.disposition.replaceAll('_', ' ')}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] break-words">{receipt.sender}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {new Date(receipt.received_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground border border-border/60">
                      <BriefcaseIcon className="h-3 w-3 text-primary" />
                      {receipt.extracted_job_title || 'Role needs review'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground border border-border/60">
                      <BuildingIcon className="h-3 w-3 text-primary" />
                      {receipt.extracted_company || 'Company needs review'}
                    </span>
                  </div>

                  {receipt.review_reason && (
                    <p className="text-xs text-muted-foreground italic font-sans bg-muted/20 rounded-md p-1.5 border border-border/40">
                      {receipt.review_reason}
                    </p>
                  )}
                </div>

                <div className="shrink-0 self-start md:self-center">
                  <Button
                    variant={receipt.disposition === 'needs_review' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 rounded-lg px-3.5 text-xs font-semibold cursor-pointer ${
                      receipt.disposition === 'needs_review' ? 'bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90' : 'border-border/80'
                    }`}
                    onClick={() => openReview(receipt)}
                  >
                    {receipt.disposition === 'needs_review' ? 'Review receipt' : 'View evidence'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Receipt review section */}
      {selected && (
        <section className="rounded-2xl border border-primary/30 bg-card p-6 shadow-md space-y-5 animate-in fade-in-50" aria-label="Receipt review">
          <div className="flex justify-between items-center gap-2 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheckIcon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-bold text-base text-foreground">
                  {selected.disposition === 'needs_review' ? 'Review application receipt' : 'Receipt evidence'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selected.source === 'manual_import'
                    ? 'User-imported evidence: confirm its authenticity and details before recording the application.'
                    : 'Mailbox receipt: check candidate and application details.'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setSelected(null)}>
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Raw message excerpt:</span>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto bg-muted/30 border border-border/70 rounded-xl p-4 leading-relaxed text-foreground/90">
              {selected.body_text}
            </pre>
          </div>

          {selected.disposition === 'needs_review' && (
            <div className="space-y-4 pt-2">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="receipt-candidate" className="text-xs font-medium text-foreground">
                    Candidate <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="receipt-candidate"
                    className="w-full h-10 border border-input rounded-xl bg-background px-3 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    value={candidateId}
                    onChange={(event) => {
                      setCandidateId(event.target.value);
                      setSubmissionId('');
                    }}
                  >
                    <option value="">Select candidate</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.full_name}
                        {candidate.email ? ` · ${candidate.email}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="receipt-application" className="text-xs font-medium text-foreground">
                    Existing application
                  </Label>
                  <select
                    id="receipt-application"
                    className="w-full h-10 border border-input rounded-xl bg-background px-3 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    value={submissionId}
                    onChange={(event) => {
                      setSubmissionId(event.target.value);
                      const application = applications.find((item) => item.id === event.target.value);
                      if (application) {
                        setCompany(application.company_name);
                        setJobTitle(application.job_title);
                      }
                    }}
                  >
                    <option value="">Match automatically or create a record</option>
                    {related.map((application) => (
                      <option key={application.id} value={application.id}>
                        {application.job_title} · {application.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="receipt-company" className="text-xs font-medium text-foreground">
                    Company <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="receipt-company"
                    maxLength={160}
                    className="h-10 rounded-xl border-input bg-background text-xs shadow-xs"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="receipt-role" className="text-xs font-medium text-foreground">
                    Job title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="receipt-role"
                    maxLength={160}
                    className="h-10 rounded-xl border-input bg-background text-xs shadow-xs"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  disabled={!!busy || !candidateId || !company.trim() || !jobTitle.trim()}
                  className="h-10 rounded-xl px-5 text-xs font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer"
                  onClick={() =>
                    void run('review', async () => {
                      await api(`/api/email-confirmations/${selected.id}/review`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'confirm', candidateId, company, jobTitle, submissionId: submissionId || null }),
                      });
                      toast.success('Application confirmation saved. Existing recruiting status is preserved.');
                      setSelected(null);
                      await load();
                    })
                  }
                >
                  <CheckCircle2Icon className="h-4 w-4" />
                  Confirm application
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl px-4 text-xs font-medium border-border/80 shadow-xs hover:border-destructive/50 hover:text-destructive cursor-pointer"
                  disabled={!!busy}
                  onClick={() =>
                    void run('dismiss', async () => {
                      await api(`/api/email-confirmations/${selected.id}/review`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'dismiss' }),
                      });
                      setSelected(null);
                      await load();
                    })
                  }
                >
                  Dismiss unrelated receipt
                </Button>
              </div>
            </div>
          )}

          {selected.submission_id && (
            <div className="pt-2">
              <Button
                variant="outline"
                className="h-9 rounded-xl border-border/80 text-xs font-medium shadow-xs hover:border-primary/50 cursor-pointer"
                render={<Link href="/dashboard/submissions" />}
              >
                Open application tracker
                <ExternalLinkIcon className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MailboxCard({
  connection,
  busy,
  onSync,
  onSave,
  onDisconnect,
}: {
  connection: EmailConnectionSummary;
  busy: boolean;
  onSync: () => void;
  onSave: (domains: string[]) => void;
  onDisconnect: () => void;
}) {
  const [domains, setDomains] = React.useState(connection.sender_domains.join(', '));
  const isConnected = connection.status === 'connected';

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-2xs hover:border-primary/40 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-sm text-foreground">{connection.mailbox_email}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              {connection.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ClockIcon className="h-3 w-3" />
            Last checked: {connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'Not yet synchronized'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-3 text-xs font-semibold cursor-pointer border-border/80 hover:border-primary/50"
            disabled={busy || connection.status !== 'connected'}
            onClick={onSync}
          >
            <RefreshCwIcon className={`h-3 w-3 mr-1.5 ${busy ? 'animate-spin' : ''}`} />
            Sync now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
            disabled={busy || connection.status === 'disconnected'}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </div>

      {connection.last_error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          <span>{connection.last_error}</span>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border/50">
        <Label htmlFor={`senders-${connection.id}`} className="text-xs font-medium text-foreground">
          Approved receipt sender domains
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id={`senders-${connection.id}`}
            className="flex-1 h-9 rounded-lg border-input bg-background text-xs shadow-2xs"
            placeholder="Enter exact domains from verified receipts (e.g. greenhouse.io, lever.co)"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg px-4 text-xs font-semibold border-border/80 shadow-2xs hover:border-primary/50 cursor-pointer shrink-0"
            disabled={busy}
            onClick={() => onSave(domains.split(',').map((value) => value.trim()).filter(Boolean))}
          >
            Save domains
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Start with review. Approve only known application receipt senders; other messages always need review.
        </p>
      </div>
    </div>
  );
}
