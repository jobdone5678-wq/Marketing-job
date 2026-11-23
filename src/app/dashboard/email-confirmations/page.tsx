'use client';

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
  XIcon,
} from 'lucide-react';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type {
  ApplicationIdentity,
  CandidateIdentity,
  EmailConnectionSummary,
  EmailReceiptRecord,
} from '@/lib/email-confirmations/types';

type GmailSetup = {
  missing: string[];
  invalid: string[];
  appOrigin: string | null;
  redirectUri: string | null;
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result as T;
}

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
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
        api<{
          receipts: EmailReceiptRecord[];
          candidates: CandidateIdentity[];
          applications: ApplicationIdentity[];
          total: number;
          hasMore: boolean;
        }>(`/api/email-confirmations?disposition=${filter}&page=${page}`),
        api<{
          connections: EmailConnectionSummary[];
          gmailConfigured: boolean;
          gmailSetup?: GmailSetup;
        }>('/api/email-connections'),
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
        failures.push(
          'Receipts: ' +
            (data.reason instanceof Error ? data.reason.message : 'Could not load receipts.')
        );
      }
      if (mail.status === 'fulfilled') {
        setConnections(mail.value.connections);
        setConfigured(mail.value.gmailConfigured);
        setGmailSetup(mail.value.gmailSetup ?? null);
      } else {
        setConnections([]);
        failures.push(
          'Gmail status: ' +
            (mail.reason instanceof Error
              ? mail.reason.message
              : 'Could not check mailbox configuration.')
        );
      }
      setError(failures.join(' '));
    } catch (reason) {
      if (generation === loadGeneration.current)
        setError(reason instanceof Error ? reason.message : 'Could not load confirmations.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [filter, page]);

  React.useEffect(() => {
    void Promise.resolve().then(load);
    const status = new URLSearchParams(window.location.search).get('mail');
    if (status === 'connected')
      toast.success('Mailbox connected. Sync now to import recent receipts.');
    if (status === 'connection_failed')
      toast.error('Mailbox was not connected. Check configuration and consent, then retry.');
    if (status === 'reconnect')
      toast.info(
        'You are now on the configured Gmail callback host. Connect Gmail again to continue.'
      );
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 lg:p-8">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 pb-1 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-foreground text-2xl font-medium tracking-tight sm:text-3xl">
            Email Sync
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Connect the mailbox that receives your job application confirmations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="border-border/60 hover:bg-muted/50 h-8 cursor-pointer rounded-md px-3 text-xs font-normal transition-colors"
            disabled={loading || !!busy}
            onClick={() => void load()}
          >
            <RefreshCwIcon className={`mr-1.5 size-3.5 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-border/60 hover:bg-muted/50 h-8 cursor-pointer rounded-md px-3 text-xs font-normal transition-colors"
            disabled={!!busy}
            onClick={() => uploadRef.current?.click()}
          >
            <UploadIcon className="mr-1.5 size-3.5 stroke-[1.5]" />
            Import receipt
          </Button>
          <Button
            variant="outline"
            className="border-border/60 hover:bg-muted/50 h-8 cursor-pointer rounded-md px-3 text-xs font-normal transition-colors"
            render={<Link href="/dashboard/submissions" />}
          >
            Applications
            <ExternalLinkIcon className="text-muted-foreground ml-1.5 size-3.5 stroke-[1.5]" />
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
              const result = await api<{ disposition: string; duplicate: boolean }>(
                '/api/email-confirmations/import',
                { method: 'POST', body: form }
              );
              toast.success(
                result.duplicate
                  ? 'This receipt was already imported.'
                  : result.disposition === 'ignored'
                    ? 'This email is not an application receipt.'
                    : 'Receipt imported for review.'
              );
              await load();
            });
          }}
        />
      </div>

      {/* Connected mailboxes section */}
      <section className="border-border/70 bg-card space-y-5 rounded-2xl border p-6 shadow-xs">
        <div className="border-border/60 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
              <MailIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold">Connected mailboxes</h2>
              <p className="text-muted-foreground mt-0.5 max-w-xl text-xs">
                Connect Gmail separately even if you signed in with Google. Read-only scanning finds
                application receipts; confirmed applications appear in My Applications. A receipt
                confirms submission, not a job offer.
              </p>
            </div>
          </div>
          <Button
            disabled={!configured || !!busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-9 shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl px-4 text-xs font-semibold shadow-xs transition-all sm:self-auto"
            onClick={() =>
              void run('connect', async () => {
                const result = await api<{ url: string }>('/api/email-connections/gmail/connect', {
                  method: 'POST',
                });
                window.location.assign(result.url);
              })
            }
          >
            <GoogleIcon className="h-4 w-4" />
            Connect Gmail
          </Button>
        </div>

        {!loading && configured === false && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-relaxed">
              Gmail is not configured on this deployment. Your administrator must complete the email
              capture setup. Imported .eml receipts require review.
            </p>
          </div>
        )}

        {gmailSetup && (
          <details
            className="group border-border/70 bg-muted/20 overflow-hidden rounded-xl border text-xs"
            open={!configured}
          >
            <summary className="text-foreground hover:bg-muted/40 flex cursor-pointer items-center justify-between p-3.5 font-semibold transition-colors select-none">
              <div className="flex items-center gap-2">
                <Settings2Icon className="text-muted-foreground h-4 w-4" />
                <span>Administrator Gmail setup</span>
              </div>
              <ChevronDownIcon className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-border/50 bg-background/50 space-y-3 border-t p-4">
              {gmailSetup.missing.length > 0 && (
                <div className="text-destructive font-medium">
                  Missing server variables:{' '}
                  <span className="bg-destructive/10 rounded px-1.5 py-0.5 font-mono break-words">
                    {gmailSetup.missing.join(', ')}
                  </span>
                  .
                </div>
              )}
              {gmailSetup.invalid.map((issue) => (
                <p key={issue} className="text-destructive font-medium">
                  {issue}
                </p>
              ))}
              <p className="text-muted-foreground">
                Set the server variables in this hosting project&apos;s Production environment, then
                redeploy. Local .env.local settings do not configure the hosted site.
              </p>
              {gmailSetup.redirectUri && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">
                    Register this exact authorized redirect URI in the Google OAuth web client:
                  </span>
                  <div className="bg-muted border-border/80 text-foreground rounded-lg border p-2 font-mono text-[11px] break-all select-all">
                    <code>{gmailSetup.redirectUri}</code>
                  </div>
                </div>
              )}
              {gmailSetup.appOrigin && (
                <p className="text-muted-foreground">
                  Connect from{' '}
                  <a
                    className="text-primary font-medium underline"
                    href={`${gmailSetup.appOrigin}/dashboard/email-confirmations`}
                  >
                    {gmailSetup.appOrigin}
                  </a>{' '}
                  so the sign-in session and consent cookie use the callback host.
                </p>
              )}
            </div>
          </details>
        )}

        {connections.length === 0 && !loading && !error && (
          <div className="border-border/80 bg-muted/10 text-muted-foreground rounded-xl border border-dashed p-6 text-center text-xs">
            No connected mailboxes. Click &quot;Connect Gmail&quot; above to link a mailbox or
            import an .eml receipt file.
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
                  const result = await api<{
                    processed: number;
                    confirmed: number;
                    review: number;
                    hasMore: boolean;
                  }>(`/api/email-connections/${connection.id}/sync`, { method: 'POST' });
                  toast.success(
                    `${result.confirmed} confirmed, ${result.review} for review.${
                      result.hasMore
                        ? ' More messages remain; sync again or let the worker continue.'
                        : ''
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
                  toast.success(
                    'Approved sender domains saved. Existing receipts still require their recorded review.'
                  );
                  await load();
                })
              }
              onDisconnect={() =>
                void run(connection.id, async () => {
                  const result = await api<{ providerRevoked: boolean }>(
                    `/api/email-connections/${connection.id}`,
                    { method: 'DELETE' }
                  );
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
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2.5 rounded-xl border p-4 text-sm"
        >
          <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Recent receipts section */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-lg font-bold">Recent receipts</h2>
            <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {total}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="receipt-status-filter"
              className="text-muted-foreground sr-only text-xs font-medium"
            >
              Filter receipt status
            </label>
            <select
              id="receipt-status-filter"
              aria-label="Filter receipt status"
              className="border-input bg-background focus-visible:ring-ring h-9 cursor-pointer rounded-xl border px-3 text-xs font-medium shadow-xs focus-visible:ring-1 focus-visible:outline-none"
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

        <div className="border-border/70 bg-card text-muted-foreground flex flex-col justify-between gap-3 rounded-xl border p-3.5 text-xs shadow-2xs sm:flex-row sm:items-center">
          <p>
            <strong className="text-foreground font-semibold">{total} receipts</strong> in this view
            · Page {page + 1}. Automatic confirmation requires an authenticated approved sender and
            an unambiguous candidate and job match.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer rounded-lg px-3 text-xs font-medium"
              disabled={loading || !!busy || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer rounded-lg px-3 text-xs font-medium"
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
          <div className="border-border/80 bg-muted/10 space-y-2 rounded-2xl border border-dashed p-10 text-center">
            <div className="bg-muted text-muted-foreground mx-auto flex h-10 w-10 items-center justify-center rounded-xl">
              <MailIcon className="h-5 w-5" />
            </div>
            <p className="text-foreground text-sm font-semibold">No receipts in this view</p>
            <p className="text-muted-foreground mx-auto max-w-sm text-xs">
              Connect a mailbox or import an application receipt to start tracking inbound
              submission confirmations.
            </p>
          </div>
        ) : null}

        {!loading && !error && (
          <div className="space-y-3">
            {visible.map((receipt) => (
              <article
                key={receipt.id}
                className="border-border/70 bg-card hover:border-primary/40 flex flex-col justify-between gap-4 rounded-2xl border p-5 shadow-xs transition-all hover:shadow-sm md:flex-row md:items-center"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-foreground text-sm font-semibold break-words">
                      {receipt.subject}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        receipt.disposition === 'confirmed'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : receipt.disposition === 'needs_review'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {receipt.disposition.replaceAll('_', ' ')}
                    </Badge>
                  </div>

                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-mono text-[11px] break-words">{receipt.sender}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {new Date(receipt.received_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="bg-muted/60 text-foreground border-border/60 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold">
                      <BriefcaseIcon className="text-primary h-3 w-3" />
                      {receipt.extracted_job_title || 'Role needs review'}
                    </span>
                    <span className="bg-muted/60 text-foreground border-border/60 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold">
                      <BuildingIcon className="text-primary h-3 w-3" />
                      {receipt.extracted_company || 'Company needs review'}
                    </span>
                  </div>

                  {receipt.review_reason && (
                    <p className="text-muted-foreground bg-muted/20 border-border/40 rounded-md border p-1.5 font-sans text-xs italic">
                      {receipt.review_reason}
                    </p>
                  )}
                </div>

                <div className="shrink-0 self-start md:self-center">
                  <Button
                    variant={receipt.disposition === 'needs_review' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 cursor-pointer rounded-lg px-3.5 text-xs font-semibold ${
                      receipt.disposition === 'needs_review'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs'
                        : 'border-border/80'
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
        <section
          className="border-primary/30 bg-card animate-in fade-in-50 space-y-5 rounded-2xl border p-6 shadow-md"
          aria-label="Receipt review"
        >
          <div className="border-border/60 flex items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
                <ShieldCheckIcon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-foreground text-base font-bold">
                  {selected.disposition === 'needs_review'
                    ? 'Review application receipt'
                    : 'Receipt evidence'}
                </h2>
                <p className="text-muted-foreground text-xs">
                  {selected.source === 'manual_import'
                    ? 'User-imported evidence: confirm its authenticity and details before recording the application.'
                    : 'Mailbox receipt: check candidate and application details.'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8 cursor-pointer p-0"
              onClick={() => setSelected(null)}
            >
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Raw message excerpt:</span>
            <pre className="bg-muted/30 border-border/70 text-foreground/90 max-h-64 overflow-y-auto rounded-xl border p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
              {selected.body_text}
            </pre>
          </div>

          {selected.disposition === 'needs_review' && (
            <div className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="receipt-candidate"
                    className="text-foreground text-xs font-medium"
                  >
                    Candidate <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="receipt-candidate"
                    className="border-input bg-background focus-visible:ring-ring h-10 w-full cursor-pointer rounded-xl border px-3 text-xs font-medium shadow-xs focus-visible:ring-1 focus-visible:outline-none"
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
                  <Label
                    htmlFor="receipt-application"
                    className="text-foreground text-xs font-medium"
                  >
                    Existing application
                  </Label>
                  <select
                    id="receipt-application"
                    className="border-input bg-background focus-visible:ring-ring h-10 w-full cursor-pointer rounded-xl border px-3 text-xs font-medium shadow-xs focus-visible:ring-1 focus-visible:outline-none"
                    value={submissionId}
                    onChange={(event) => {
                      setSubmissionId(event.target.value);
                      const application = applications.find(
                        (item) => item.id === event.target.value
                      );
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
                  <Label htmlFor="receipt-company" className="text-foreground text-xs font-medium">
                    Company <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="receipt-company"
                    maxLength={160}
                    className="border-input bg-background h-10 rounded-xl text-xs shadow-xs"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="receipt-role" className="text-foreground text-xs font-medium">
                    Job title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="receipt-role"
                    maxLength={160}
                    className="border-input bg-background h-10 rounded-xl text-xs shadow-xs"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  disabled={!!busy || !candidateId || !company.trim() || !jobTitle.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 cursor-pointer items-center gap-2 rounded-xl px-5 text-xs font-semibold shadow-xs transition-all"
                  onClick={() =>
                    void run('review', async () => {
                      await api(`/api/email-confirmations/${selected.id}/review`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'confirm',
                          candidateId,
                          company,
                          jobTitle,
                          submissionId: submissionId || null,
                        }),
                      });
                      toast.success(
                        'Application confirmation saved. Existing recruiting status is preserved.'
                      );
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
                  className="border-border/80 hover:border-destructive/50 hover:text-destructive h-10 cursor-pointer rounded-xl px-4 text-xs font-medium shadow-xs"
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
                className="border-border/80 hover:border-primary/50 h-9 cursor-pointer rounded-xl text-xs font-medium shadow-xs"
                render={<Link href="/dashboard/submissions" />}
              >
                Open application tracker
                <ExternalLinkIcon className="text-muted-foreground ml-1.5 h-3.5 w-3.5" />
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
    <div className="border-border/70 bg-card hover:border-primary/40 space-y-4 rounded-xl border p-5 shadow-2xs transition-all">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="text-foreground text-sm font-semibold">
              {connection.mailbox_email}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                isConnected
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground border-border border'
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
              />
              {connection.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ClockIcon className="h-3 w-3" />
            Last checked:{' '}
            {connection.last_synced_at
              ? new Date(connection.last_synced_at).toLocaleString()
              : 'Not yet synchronized'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border/80 hover:border-primary/50 h-8 cursor-pointer rounded-lg px-3 text-xs font-semibold"
            disabled={busy || connection.status !== 'connected'}
            onClick={onSync}
          >
            <RefreshCwIcon className={`mr-1.5 h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
            Sync now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 cursor-pointer rounded-lg px-2.5 text-xs"
            disabled={busy || connection.status === 'disconnected'}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </div>

      {connection.last_error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border p-3 text-xs">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          <span>{connection.last_error}</span>
        </div>
      )}

      <div className="border-border/50 space-y-2 border-t pt-2">
        <Label htmlFor={`senders-${connection.id}`} className="text-foreground text-xs font-medium">
          Approved receipt sender domains
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`senders-${connection.id}`}
            className="border-input bg-background h-9 flex-1 rounded-lg text-xs shadow-2xs"
            placeholder="Enter exact domains from verified receipts (e.g. greenhouse.io, lever.co)"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            className="border-border/80 hover:border-primary/50 h-9 shrink-0 cursor-pointer rounded-lg px-4 text-xs font-semibold shadow-2xs"
            disabled={busy}
            onClick={() =>
              onSave(
                domains
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean)
              )
            }
          >
            Save domains
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Start with review. Approve only known application receipt senders; other messages always
          need review.
        </p>
      </div>
    </div>
  );
}
