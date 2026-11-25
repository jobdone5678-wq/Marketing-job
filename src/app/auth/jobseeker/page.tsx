'use client';

import { useState } from 'react';
import Link from 'next/link';
import { JobseekerAuthCard } from '@/components/jobseeker-auth-card';
import { BrandMark, VerifiedStamp } from '@/components/brand-mark';
import { ArrowRight } from 'lucide-react';

type DemoPlatform = 'greenhouse' | 'ashby' | 'lever' | 'workday';

interface PlatformData {
  name: string;
  url: string;
  company: string;
  role: string;
  location: string;
  score: string;
  matched: string[];
  missing: string[];
  fieldsCount: number;
}

const PLATFORMS: Record<DemoPlatform, PlatformData> = {
  greenhouse: {
    name: 'Greenhouse',
    url: 'boards.greenhouse.io/stripe/jobs/6129841',
    company: 'Stripe',
    role: 'Senior Full Stack Engineer',
    location: 'San Francisco, CA (Hybrid)',
    score: '94.8%',
    matched: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Next.js'],
    missing: ['GraphQL'],
    fieldsCount: 16,
  },
  ashby: {
    name: 'Ashby',
    url: 'jobs.ashbyhq.com/anthropic/4820-ai-sys',
    company: 'Anthropic',
    role: 'AI Application Engineer',
    location: 'San Francisco, CA (Onsite)',
    score: '96.2%',
    matched: ['Python', 'TypeScript', 'Prompt Eval', 'RAG Arch'],
    missing: [],
    fieldsCount: 14,
  },
  lever: {
    name: 'Lever',
    url: 'jobs.lever.co/figma/98d12-architect',
    company: 'Figma',
    role: 'Core Software Architect',
    location: 'New York, NY (Remote)',
    score: '91.5%',
    matched: ['Distributed Systems', 'WebAssembly', 'TypeScript', 'CI/CD'],
    missing: ['Rust'],
    fieldsCount: 13,
  },
  workday: {
    name: 'Workday',
    url: 'salesforce.wd12.myworkdayjobs.com/careers/req-4019',
    company: 'Salesforce',
    role: 'Principal Frontend Developer',
    location: 'Bellevue, WA (Hybrid)',
    score: '92.0%',
    matched: ['React', 'State Management', 'Web Vitals', 'Jest'],
    missing: ['Kubernetes'],
    fieldsCount: 22,
  },
};

const STEPS = [
  {
    n: '01',
    title: 'Pair the extension',
    note: 'Generate a code in the workspace and the Chrome extension links to this account',
  },
  {
    n: '02',
    title: 'Autofill from your resume',
    note: 'Employer forms are filled from the facts you reviewed, not from guesses',
  },
  {
    n: '03',
    title: 'Keep the receipts',
    note: 'Gmail sync files the confirmation email each employer sends back',
  },
];

export default function JobseekerAuthPage() {
  const [activePlatform, setActivePlatform] = useState<DemoPlatform>('greenhouse');
  const active = PLATFORMS[activePlatform];

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col">
      {/* Top navigation */}
      <header className="px-3 pt-3">
        <div className="panel mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark className="size-8" />
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground text-[13px] leading-4 font-medium">Nextkinlife</span>
              <span className="text-muted-foreground text-[11px] leading-4">Candidate access</span>
            </span>
          </Link>

          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[13px] transition-colors"
          >
            <span>Recruiter portal</span>
            <ArrowRight aria-hidden="true" className="size-4 stroke-[1.5]" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Left: what it does, shown rather than claimed */}
          <div className="animate-fade-rise space-y-8 lg:col-span-7">
            <div className="max-w-xl">
              <h1 className="text-foreground text-[32px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">
                Apply to software roles without retyping your resume
              </h1>
              <p className="text-muted-foreground mt-4 text-[15px] leading-6">
                Review your resume once. The browser extension fills Greenhouse, Ashby, Lever and
                Workday forms from those verified facts, and every employer confirmation is filed
                back to your workspace.
              </p>
            </div>

            {/* Product moment: a real application being filled */}
            <section aria-labelledby="sample-heading" className="panel overflow-hidden">
              <div className="border-border flex items-center justify-between border-b px-5 py-3">
                <h2 id="sample-heading" className="text-foreground text-[13px] font-medium">
                  Sample application
                </h2>
                <span className="figure text-muted-foreground text-[11px]">
                  Match {active.score}
                </span>
              </div>

              <div className="px-5 py-4">
                <div
                  role="tablist"
                  aria-label="Applicant tracking system"
                  className="bg-surface-sunken border-border flex gap-1 rounded-[10px] border p-1"
                >
                  {(Object.keys(PLATFORMS) as DemoPlatform[]).map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      role="tab"
                      aria-selected={activePlatform === platform}
                      onClick={() => setActivePlatform(platform)}
                      className={`h-8 flex-1 rounded-[7px] border text-[13px] font-medium transition-colors ${
                        activePlatform === platform
                          ? 'bg-card text-foreground border-border'
                          : 'text-muted-foreground hover:text-foreground border-transparent'
                      }`}
                    >
                      {PLATFORMS[platform].name}
                    </button>
                  ))}
                </div>

                <div className="well mt-4 p-4">
                  <div className="text-muted-foreground border-border flex items-center justify-between gap-4 border-b pb-2.5">
                    <span className="figure truncate text-[11px]">{active.url}</span>
                    <span className="figure shrink-0 text-[11px]">
                      {active.fieldsCount} fields filled
                    </span>
                  </div>

                  <div className="pt-3">
                    <h3 className="text-foreground text-[13px] font-medium">{active.role}</h3>
                    <p className="text-muted-foreground mt-1 text-[13px]">
                      {active.company} · {active.location}
                    </p>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {active.matched.map((skill) => (
                      <li
                        key={skill}
                        className="border-primary/25 bg-primary/8 text-primary inline-flex h-6 items-center gap-1.5 rounded-[6px] border px-2 text-[11px]"
                      >
                        <VerifiedStamp className="size-3.5" />
                        {skill}
                      </li>
                    ))}
                    {active.missing.map((skill) => (
                      <li
                        key={skill}
                        className="border-border text-muted-foreground inline-flex h-6 items-center rounded-[6px] border px-2 text-[11px]"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* How it works */}
            <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="border-border border-t pt-4">
                  <div className="flex items-center gap-2">
                    <span className="figure text-muted-foreground text-[11px]">{step.n}</span>
                    <span className="text-foreground text-[13px] font-medium">{step.title}</span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-[13px] leading-5">{step.note}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Right: sign in */}
          <div className="animate-fade-rise-delay flex w-full justify-center lg:col-span-5">
            <JobseekerAuthCard />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 pb-8 sm:px-6">
        <div className="border-border text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t pt-6 text-[13px] sm:flex-row">
          <span>© {new Date().getFullYear()} Nextkinlife LLC</span>
          <Link href="/" className="hover:text-foreground transition-colors">
            Terms and privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}
