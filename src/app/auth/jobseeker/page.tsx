"use client";

import { useState } from "react";
import { JobseekerAuthCard } from "@/components/jobseeker-auth-card";

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
    <main className="overflow-x-hidden w-full max-w-full min-h-screen bg-[#FBFBFA] text-[#111111] flex flex-col justify-between antialiased font-sans">
      {/* Top Navigation: Utilitarian Minimalist Document Bar */}
      <header className="w-full border-b border-[#EAEAEA] bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between">
          {/* Brand Mark */}
          <a href="/" className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-[4px] bg-[#111111] text-white flex items-center justify-center font-bold text-xs select-none">
              N
            </span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-[#111111] tracking-tight">
                NextKin
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#787774] bg-[#F7F6F3] px-2 py-0.5 rounded border border-[#EAEAEA]">
                Applicant
              </span>
            </div>
          </a>

          {/* Status & Gateway */}
          <div className="flex items-center gap-5 text-xs text-[#787774]">
            <div className="hidden sm:flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#346538]" />
              <span className="text-[11px] font-mono text-[#346538]">Extension v3.2 Active</span>
            </div>
            <a
              href="/"
              className="text-xs text-[#111111] hover:text-[#787774] transition-colors font-medium flex items-center gap-1"
            >
              <span>Staff portal</span>
              <span className="font-mono text-[11px] text-[#787774]">&rarr;</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Structural Layout: Editorial Two-Column */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Editorial Headline & Faux-OS ATS Inspector */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#E1F3FE] text-[#1F6C9F] text-[10px] font-mono uppercase tracking-wider">
                <span>Direct ATS Integration</span>
              </div>

              {/* Editorial Serif Heading with Tight Line Height */}
              <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-serif font-normal text-[#111111] tracking-[-0.03em] leading-[1.08] max-w-2xl">
                Where <span className="italic">precision</span> meets every application.
              </h1>

              <p className="text-sm text-[#787774] max-w-xl leading-relaxed">
                Connect your verified resume once. NextKin maps your career history directly into Ashby, Greenhouse, Lever, and Workday forms with grounded ATS score verification.
              </p>
            </div>

            {/* Faux-OS Window Chrome: ATS Telemetry Inspector */}
            <div className="rounded-xl border border-[#EAEAEA] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
              {/* Window Chrome Header Bar */}
              <div className="h-10 bg-[#FAFAFA] border-b border-[#EAEAEA] px-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#E5E5E5]" />
                    <span className="size-2 rounded-full bg-[#E5E5E5]" />
                    <span className="size-2 rounded-full bg-[#E5E5E5]" />
                  </div>
                  <span className="hidden sm:inline-block font-mono text-[10px] text-[#787774] px-2 py-0.5 bg-white rounded border border-[#EAEAEA]">
                    https://{active.url}
                  </span>
                </div>

                {/* Platform Selector Tabs */}
                <div className="flex items-center gap-1">
                  {(["greenhouse", "ashby", "lever", "workday"] as DemoPlatform[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setActivePlatform(p)}
                      className={`px-2 py-0.5 rounded-[4px] text-[11px] transition-colors cursor-pointer font-medium ${
                        activePlatform === p
                          ? "bg-[#111111] text-white"
                          : "text-[#787774] hover:text-[#111111] hover:bg-[#F7F6F3]"
                      }`}
                    >
                      {PLATFORMS[p].name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inspector Content */}
              <div className="p-6 space-y-5">
                {/* Role Details & ATS Match Score */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-[#EAEAEA]">
                  <div>
                    <h3 className="text-base font-medium text-[#111111]">
                      {active.role}
                    </h3>
                    <p className="text-xs text-[#787774] mt-0.5">
                      {active.company} <span className="mx-1 text-[#EAEAEA]">•</span> {active.location}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-[11px] font-mono text-[#787774]">ATS Match</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#EDF3EC] text-[#346538]">
                      {active.score}
                    </span>
                  </div>
                </div>

                {/* Requirement Alignment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#111111] font-medium">Verified skill alignment</span>
                    <span className="text-[11px] font-mono text-[#787774]">
                      {active.matched.length} matched
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.matched.map((skill) => (
                      <span
                        key={skill}
                        className="px-2.5 py-1 rounded-[4px] text-xs font-mono bg-[#EDF3EC] text-[#346538] border border-[#EDF3EC]"
                      >
                        + {skill}
                      </span>
                    ))}
                    {active.missing.length > 0 && (
                      <span className="px-2.5 py-1 rounded-[4px] text-xs font-mono bg-[#FBF3DB] text-[#956400] border border-[#FBF3DB]">
                        optional: {active.missing[0]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Injection Readiness Status */}
                <div className="pt-3 border-t border-[#EAEAEA] flex items-center justify-between text-xs text-[#787774]">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[#346538]" />
                    <span>{active.fieldsCount} form fields mapped</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <kbd className="border border-[#EAEAEA] rounded-[4px] bg-[#F7F6F3] font-mono text-[10px] px-1.5 py-0.5 text-[#787774]">
                      Alt + A
                    </kbd>
                    <span className="text-xs text-[#111111] font-medium">Autofill on 1-click</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Utilitarian Auth Terminal */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <JobseekerAuthCard />
          </div>

        </div>

        {/* Utilitarian Bento Feature Grid: Asymmetrical Minimalist Containers */}
        <div className="mt-20 pt-12 border-t border-[#EAEAEA] grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-7 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="w-7 h-7 rounded-[4px] bg-[#F7F6F3] border border-[#EAEAEA] flex items-center justify-center font-mono text-xs font-medium text-[#111111]">
              01
            </div>
            <h3 className="text-sm font-medium text-[#111111]">
              Deterministic matching
            </h3>
            <p className="text-xs text-[#787774] leading-relaxed">
              Resume terms are compared directly against verified job description keywords with zero hallucination.
            </p>
          </div>

          <div className="rounded-xl border border-[#EAEAEA] bg-white p-7 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="w-7 h-7 rounded-[4px] bg-[#F7F6F3] border border-[#EAEAEA] flex items-center justify-center font-mono text-xs font-medium text-[#111111]">
              02
            </div>
            <h3 className="text-sm font-medium text-[#111111]">
              Direct field mapping
            </h3>
            <p className="text-xs text-[#787774] leading-relaxed">
              Targeted autofill across Greenhouse, Ashby, Lever, and Workday forms in under three seconds.
            </p>
          </div>

          <div className="rounded-xl border border-[#EAEAEA] bg-white p-7 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="w-7 h-7 rounded-[4px] bg-[#F7F6F3] border border-[#EAEAEA] flex items-center justify-center font-mono text-xs font-medium text-[#111111]">
              03
            </div>
            <h3 className="text-sm font-medium text-[#111111]">
              Candidate vault isolation
            </h3>
            <p className="text-xs text-[#787774] leading-relaxed">
              Your profile data is strictly sandboxed and never shared with internal company recruiting pipelines.
            </p>
          </div>

        </div>
      </div>

      {/* Footer: Editorial Document Meta Footer */}
      <footer className="w-full border-t border-[#EAEAEA] py-6 bg-white text-xs text-[#787774]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#111111]">NextKin</span>
            <span>&copy; {new Date().getFullYear()} NextKinLife LLC.</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#346538]" />
              SOC 2 Type II
            </span>
            <span>AES-256 GCM</span>
            <a href="/" className="hover:text-[#111111] transition-colors">
              Terms &amp; Privacy
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
