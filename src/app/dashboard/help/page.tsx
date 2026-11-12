import Link from "next/link";
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
} from "lucide-react";
import { WorkspaceHeading } from "@/components/workspace-ui";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    step: "01",
    title: "Upload & Verify Candidate Resume",
    description:
      "Upload a PDF or Word document under Candidates. Our intelligent extraction maps verified skills, employment history, and authorization details. You review and confirm facts before making them active.",
    link: "/dashboard/candidates/new",
    linkLabel: "Add new candidate",
    icon: FileText,
  },
  {
    step: "02",
    title: "Sync Public ATS Job Boards",
    description:
      "Connect live Greenhouse or Ashby company portals in Job Discovery. The automated crawler ingests active positions and extracts required tech stacks with zero manual scraping.",
    link: "/dashboard/jobs",
    linkLabel: "Explore public jobs",
    icon: Building2,
  },
  {
    step: "03",
    title: "Review Candidate Fit & Match Scores",
    description:
      "Open any job posting to evaluate matched candidates with transparent scoring breakdown. Review required vs missing skills and preview tailored resume formats.",
    link: "/dashboard/jobs",
    linkLabel: "Match engine",
    icon: Sparkles,
  },
  {
    step: "04",
    title: "One-Click Application Autofill with Extension",
    description:
      "Install the NextKin Chrome copilot. Open employer application pages on Greenhouse, Ashby, Lever, or Workday, and click Autofill to fill forms using confirmed resume facts.",
    link: "/dashboard/integrations",
    linkLabel: "Pair extension",
    icon: Send,
  },
  {
    step: "05",
    title: "Verify Official Email Receipts",
    description:
      "Connect your Google Workspace or Gmail under Email Confirmations to automatically detect and reconcile employer receipt emails with logged job submissions.",
    link: "/dashboard/email-confirmations",
    linkLabel: "Manage mailboxes",
    icon: Mail,
  },
];

export default function HelpPage() {
  return (
    <main className="portal-page max-w-5xl space-y-8 animate-fade-rise">
      <WorkspaceHeading
        eyebrow="Knowledge Base"
        title="Documentation & Portal Guidance"
        description="Comprehensive guides to candidate intake, public ATS synchronization, Chrome extension copilot, and submission receipt tracking."
      />

      {/* Workflow Steps Grid */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Platform Architecture & Workflow
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-border transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                      Step {item.step}
                    </span>
                    <div className="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground">
                      <Icon className="size-4" />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-foreground tracking-tight">
                    {item.title}
                  </h3>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/60">
                  <Link
                    href={item.link}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
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
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Candidate Vault & Data Isolation
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
              Candidate resumes and credentials are encrypted with 256-bit TLS. Automated background processing requires dedicated worker processes with restricted scope.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground hover:bg-muted transition-colors shrink-0 shadow-2xs"
        >
          <span>Server AI Setup</span>
          <ArrowRight className="size-3" />
        </Link>
      </section>

      {/* Keyboard Shortcuts Reference */}
      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Keyboard className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground">
            Keyboard Shortcuts
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
            <span className="text-muted-foreground">Quick Search Jobs</span>
            <kbd className="px-2 py-0.5 rounded border border-border bg-background font-mono text-[11px] font-semibold text-foreground">
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
            <span className="text-muted-foreground">Jump to Candidates</span>
            <kbd className="px-2 py-0.5 rounded border border-border bg-background font-mono text-[11px] font-semibold text-foreground">
              G then C
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
            <span className="text-muted-foreground">Jump to Submissions</span>
            <kbd className="px-2 py-0.5 rounded border border-border bg-background font-mono text-[11px] font-semibold text-foreground">
              G then S
            </kbd>
          </div>
        </div>
      </section>
    </main>
  );
}
