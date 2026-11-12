"use client";

import { useState } from "react";
import Link from "next/link";
import { JobseekerAuthCard } from "@/components/jobseeker-auth-card";
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
} from "lucide-react";

type DemoPlatform = "greenhouse" | "ashby" | "lever" | "workday";

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
    name: "Greenhouse",
    url: "boards.greenhouse.io/stripe/jobs/6129841",
    company: "Stripe",
    role: "Senior Full Stack Engineer",
    location: "San Francisco, CA (Hybrid)",
    score: "94.8%",
    matched: ["TypeScript", "React", "Node.js", "PostgreSQL", "Next.js"],
    missing: ["GraphQL"],
    fieldsCount: 16,
  },
  ashby: {
    name: "Ashby",
    url: "jobs.ashbyhq.com/anthropic/4820-ai-sys",
    company: "Anthropic",
    role: "AI Application Engineer",
    location: "San Francisco, CA (Onsite)",
    score: "96.2%",
    matched: ["Python", "TypeScript", "Prompt Eval", "RAG Arch"],
    missing: [],
    fieldsCount: 14,
  },
  lever: {
    name: "Lever",
    url: "jobs.lever.co/figma/98d12-architect",
    company: "Figma",
    role: "Core Software Architect",
    location: "New York, NY (Remote)",
    score: "91.5%",
    matched: ["Distributed Systems", "WebAssembly", "TypeScript", "CI/CD"],
    missing: ["Rust"],
    fieldsCount: 13,
  },
  workday: {
    name: "Workday",
    url: "salesforce.wd12.myworkdayjobs.com/careers/req-4019",
    company: "Salesforce",
    role: "Principal Frontend Developer",
    location: "Bellevue, WA (Hybrid)",
    score: "92.0%",
    matched: ["React", "State Management", "Web Vitals", "Jest"],
    missing: ["Kubernetes"],
    fieldsCount: 22,
  },
};

export default function JobseekerAuthPage() {
  const [activePlatform, setActivePlatform] = useState<DemoPlatform>("greenhouse");
  const active = PLATFORMS[activePlatform];

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col justify-between antialiased">
      {/* Top Header */}
      <header className="w-full border-b border-border/80 bg-card/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="size-7 rounded-lg bg-primary/10 border border-primary/25 text-primary flex items-center justify-center font-bold text-xs shadow-2xs group-hover:scale-105 transition-transform">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-foreground">
                Nextkinlife
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                Jobseeker
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono">Extension Ready</span>
            </div>
            <Link
              href="/"
              className="text-xs text-foreground hover:text-primary transition-colors font-medium flex items-center gap-1"
            >
              <span>Recruiter Portal</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Structural Layout */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left Column: Value Proposition & Live Simulator */}
          <div className="lg:col-span-7 space-y-8 animate-fade-rise">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
                <Zap className="size-3.5" />
                <span>Next-Gen Candidate Experience</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
                Accelerate your job search with{" "}
                <span className="text-primary">tailored intelligence.</span>
              </h1>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
                Connect your verified resume and let our intelligent assistant autofill
                ATS applications on Ashby, Greenhouse, Lever, and Workday with 95%+ precision.
              </p>
            </div>

            {/* Interactive ATS Simulator Card */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ATS Application Simulation
                </span>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Match Score: {active.score}
                </span>
              </div>

              {/* Platform Selector Tabs */}
              <div className="flex flex-wrap gap-1.5 p-1 bg-muted/50 rounded-xl border border-border/60">
                {(Object.keys(PLATFORMS) as DemoPlatform[]).map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setActivePlatform(platform)}
                    className={`flex-1 min-w-[70px] py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                      activePlatform === platform
                        ? "bg-background text-foreground shadow-xs border border-border/80"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {PLATFORMS[platform].name}
                  </button>
                ))}
              </div>

              {/* Simulation Details */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center text-muted-foreground pb-2 border-b border-border/40 text-[11px]">
                  <span className="truncate max-w-[280px]">{active.url}</span>
                  <span className="shrink-0">{active.fieldsCount} Fields Mapped</span>
                </div>
                <div className="font-sans">
                  <h4 className="font-bold text-sm text-foreground">{active.role}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {active.company} · {active.location}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {active.matched.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px]"
                    >
                      <CheckCircle2 className="size-3" />
                      {skill}
                    </span>
                  ))}
                  {active.missing.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                  01
                </div>
                <h3 className="text-xs font-semibold text-foreground">One-Click Pairing</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Generate an instant pairing code and sync with Chrome extension in seconds.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <div className="size-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  02
                </div>
                <h3 className="text-xs font-semibold text-foreground">Smart Autofill</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Answers application questions intelligently based on your confirmed career history.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                  03
                </div>
                <h3 className="text-xs font-semibold text-foreground">Candidate Vault</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Your profile data is strictly sandboxed with SOC 2 compliance and 256-bit encryption.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Auth Card */}
          <div className="lg:col-span-5 w-full flex justify-center animate-fade-rise-delay">
            <div className="w-full max-w-md">
              <JobseekerAuthCard />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-border/70 py-6 bg-card text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Nextkinlife</span>
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
