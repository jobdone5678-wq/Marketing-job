'use client';

import { useState } from 'react';
import Link from 'next/link';
import { JobseekerAuthCard } from '@/components/jobseeker-auth-card';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Zap,
  ArrowRight,
  Layers,
  Lock,
} from 'lucide-react';

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

export default function JobseekerAuthPage() {
  const [activePlatform, setActivePlatform] = useState<DemoPlatform>('greenhouse');
  const active = PLATFORMS[activePlatform];

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col justify-between antialiased">
      {/* Top Header */}
      <header className="border-border/80 bg-card/80 sticky top-0 z-30 w-full border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="bg-primary/10 border-primary/25 text-primary flex size-7 items-center justify-center rounded-lg border text-xs font-bold shadow-2xs transition-transform group-hover:scale-105">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground text-sm font-semibold tracking-tight">
                Nextkinlife
              </span>
              <span className="text-primary bg-primary/10 border-primary/20 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                Jobseeker
              </span>
            </div>
          </Link>

          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 sm:flex dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="font-mono text-[11px]">Extension Ready</span>
            </div>
            <Link
              href="/"
              className="text-foreground hover:text-primary flex items-center gap-1 text-xs font-medium transition-colors"
            >
              <span>Recruiter Portal</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Structural Layout */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Left Column: Value Proposition & Live Simulator */}
          <div className="animate-fade-rise space-y-8 lg:col-span-7">
            <div>
              <div className="bg-primary/10 border-primary/20 text-primary mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
                <Zap className="size-3.5" />
                <span>Next-Gen Candidate Experience</span>
              </div>
              <h1 className="text-foreground text-3xl leading-[1.1] font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Accelerate your job search with{' '}
                <span className="text-primary">tailored intelligence.</span>
              </h1>
              <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed sm:text-base">
                Connect your verified resume and let our intelligent assistant autofill ATS
                applications on Ashby, Greenhouse, Lever, and Workday with 95%+ precision.
              </p>
            </div>

            {/* Interactive ATS Simulator Card */}
            <div className="border-border/80 bg-card space-y-4 rounded-2xl border p-5 shadow-xs sm:p-6">
              <div className="border-border/60 flex items-center justify-between border-b pb-3">
                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  ATS Application Simulation
                </span>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  Match Score: {active.score}
                </span>
              </div>

              {/* Platform Selector Tabs */}
              <div className="bg-muted/50 border-border/60 flex flex-wrap gap-1.5 rounded-xl border p-1">
                {(Object.keys(PLATFORMS) as DemoPlatform[]).map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setActivePlatform(platform)}
                    className={`min-w-[70px] flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      activePlatform === platform
                        ? 'bg-background text-foreground border-border/80 border shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {PLATFORMS[platform].name}
                  </button>
                ))}
              </div>

              {/* Simulation Details */}
              <div className="border-border/60 bg-muted/20 space-y-3 rounded-xl border p-4 font-mono text-xs">
                <div className="text-muted-foreground border-border/40 flex items-center justify-between border-b pb-2 text-[11px]">
                  <span className="max-w-[280px] truncate">{active.url}</span>
                  <span className="shrink-0">{active.fieldsCount} Fields Mapped</span>
                </div>
                <div className="font-sans">
                  <h4 className="text-foreground text-sm font-bold">{active.role}</h4>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {active.company} · {active.location}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {active.matched.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="size-3" />
                      {skill}
                    </span>
                  ))}
                  {active.missing.map((skill) => (
                    <span
                      key={skill}
                      className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="grid gap-4 pt-2 sm:grid-cols-3">
              <div className="border-border/70 bg-card space-y-2 rounded-xl border p-4 shadow-2xs">
                <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                  01
                </div>
                <h3 className="text-foreground text-xs font-semibold">One-Click Pairing</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Generate an instant pairing code and sync with Chrome extension in seconds.
                </p>
              </div>

              <div className="border-border/70 bg-card space-y-2 rounded-xl border p-4 shadow-2xs">
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  02
                </div>
                <h3 className="text-foreground text-xs font-semibold">Smart Autofill</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Answers application questions intelligently based on your confirmed career
                  history.
                </p>
              </div>

              <div className="border-border/70 bg-card space-y-2 rounded-xl border p-4 shadow-2xs">
                <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                  03
                </div>
                <h3 className="text-foreground text-xs font-semibold">Candidate Vault</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Your profile data is strictly sandboxed with SOC 2 compliance and 256-bit
                  encryption.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Auth Card */}
          <div className="animate-fade-rise-delay flex w-full justify-center lg:col-span-5">
            <div className="w-full max-w-md">
              <JobseekerAuthCard />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-border/70 bg-card text-muted-foreground w-full border-t py-6 text-xs">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-semibold">Nextkinlife</span>
            <span>&copy; {new Date().getFullYear()} Nextkinlife LLC. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              SOC 2 Type II
            </span>
            <span>AES-256 GCM</span>
            <Link href="/" className="hover:text-foreground transition-colors">
              Terms &amp; Privacy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
