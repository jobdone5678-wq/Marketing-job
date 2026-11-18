import Link from 'next/link';
import {
  FileText,
  Building2,
  Sparkles,
  Send,
  Mail,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Keyboard,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { WorkspaceHeading } from '@/components/workspace-ui';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    step: '01',
    title: 'Upload & Verify Candidate Resume',
    description:
      'Upload a PDF or Word document under Candidates. Our intelligent extraction maps verified skills, employment history, and authorization details. You review and confirm facts before making them active.',
    link: '/dashboard/candidates/new',
    linkLabel: 'Add new candidate',
    icon: FileText,
  },
  {
    step: '02',
    title: 'Sync Public ATS Job Boards',
    description:
      'Connect live Greenhouse or Ashby company portals in Job Discovery. The automated crawler ingests active positions and extracts required tech stacks with zero manual scraping.',
    link: '/dashboard/jobs',
    linkLabel: 'Explore public jobs',
    icon: Building2,
  },
  {
    step: '03',
    title: 'Review Candidate Fit & Match Scores',
    description:
      'Open any job posting to evaluate matched candidates with transparent scoring breakdown. Review required vs missing skills and preview tailored resume formats.',
    link: '/dashboard/jobs',
    linkLabel: 'Match engine',
    icon: Sparkles,
  },
  {
    step: '04',
    title: 'One-Click Application Autofill with Extension',
    description:
      'Install the NextKin Chrome copilot. Open employer application pages on Greenhouse, Ashby, Lever, or Workday, and click Autofill to fill forms using confirmed resume facts.',
    link: '/dashboard/integrations',
    linkLabel: 'Pair extension',
    icon: Send,
  },
  {
    step: '05',
    title: 'Verify Official Email Receipts',
    description:
      'Connect your Google Workspace or Gmail under Email Confirmations to automatically detect and reconcile employer receipt emails with logged job submissions.',
    link: '/dashboard/email-confirmations',
    linkLabel: 'Manage mailboxes',
    icon: Mail,
  },
];

export default function HelpPage() {
  return (
    <main className="portal-page animate-fade-rise max-w-5xl space-y-8">
      <WorkspaceHeading
        eyebrow="Knowledge Base"
        title="Documentation & Portal Guidance"
        description="Comprehensive guides to candidate intake, public ATS synchronization, Chrome extension copilot, and submission receipt tracking."
      />

      {/* Workflow Steps Grid */}
      <section className="space-y-4">
        <h2 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
          Platform Architecture & Workflow
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="border-border/80 bg-card hover:border-border flex flex-col justify-between space-y-4 rounded-2xl border p-5 shadow-xs transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-primary bg-primary/10 border-primary/20 rounded-full border px-2 py-0.5 font-mono text-xs font-bold">
                      Step {item.step}
                    </span>
                    <div className="bg-muted/60 text-muted-foreground flex size-8 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </div>
                  </div>

                  <h3 className="text-foreground text-sm font-bold tracking-tight">{item.title}</h3>

                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="border-border/60 border-t pt-2">
                  <Link
                    href={item.link}
                    className="text-primary inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                  >
                    <span>{item.linkLabel}</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Security & Isolation Callout */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 shadow-xs sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h3 className="text-foreground text-sm font-bold">Candidate Vault & Data Isolation</h3>
            <p className="text-muted-foreground mt-0.5 max-w-xl text-xs leading-relaxed">
              Candidate resumes and credentials are encrypted with 256-bit TLS. Automated background
              processing requires dedicated worker processes with restricted scope.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/settings"
          className="border-border/80 bg-background text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors"
        >
          <span>Server AI Setup</span>
          <ArrowRight className="size-3" />
        </Link>
      </section>

      {/* Keyboard Shortcuts Reference */}
      <section className="border-border/80 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <Keyboard className="text-muted-foreground size-4" />
          <h2 className="text-foreground text-sm font-bold">Keyboard Shortcuts</h2>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-2 md:grid-cols-3">
          <div className="border-border/60 bg-muted/20 flex items-center justify-between rounded-xl border p-3">
            <span className="text-muted-foreground">Quick Search Jobs</span>
            <kbd className="border-border bg-background text-foreground rounded border px-2 py-0.5 font-mono text-[11px] font-semibold">
              ⌘K
            </kbd>
          </div>

          <div className="border-border/60 bg-muted/20 flex items-center justify-between rounded-xl border p-3">
            <span className="text-muted-foreground">Jump to Candidates</span>
            <kbd className="border-border bg-background text-foreground rounded border px-2 py-0.5 font-mono text-[11px] font-semibold">
              G then C
            </kbd>
          </div>

          <div className="border-border/60 bg-muted/20 flex items-center justify-between rounded-xl border p-3">
            <span className="text-muted-foreground">Jump to Submissions</span>
            <kbd className="border-border bg-background text-foreground rounded border px-2 py-0.5 font-mono text-[11px] font-semibold">
              G then S
            </kbd>
          </div>
        </div>
      </section>
    </main>
  );
}
