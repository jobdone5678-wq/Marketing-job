import { JobseekerAuthCard } from "@/components/jobseeker-auth-card";
import { Sparkles, Shield, Zap, FileText } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Sign In & 1-Click Autofill | NextKin",
  description: "Sign in to NextKin to access real-time ATS match scoring and 1-click job application autofill.",
};

export default function JobseekerAuthPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-background via-muted/10 to-muted/30 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between py-4">
        <a href="/" className="flex items-center gap-2.5 font-bold text-foreground">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base tracking-tight font-extrabold text-foreground">NextKin</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Candidate
            </span>
          </div>
        </a>

        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Shield className="size-3.5 text-emerald-500" /> Secure Cloud Storage
          </span>
          <a
            href="/"
            className="text-foreground hover:text-primary transition-colors text-xs font-semibold"
          >
            Internal Staff Portal →
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl mx-auto grid lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto py-8">
        {/* Left Hero Pitch */}
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Zap className="size-3.5" />
            <span>Powering Applications on Ashby, Greenhouse, Lever, Workday</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            Apply faster with <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
              1-Click Smart Autofill
            </span>
          </h2>

          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto lg:mx-0 leading-relaxed">
            Stop filling out the same job application forms repeatedly. NextKin securely stores your
            verified resume details and automatically fills job postings while providing real-time ATS scoring.
          </p>

          <div className="grid sm:grid-cols-2 gap-3.5 max-w-lg mx-auto lg:mx-0 pt-2 text-left">
            <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <FileText className="size-4 text-primary" />
                <span>Cloud Resume Storage</span>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Upload once, use everywhere across all supported job boards.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Sparkles className="size-4 text-emerald-500" />
                <span>Deterministic ATS Match</span>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                See exact missing skills and coverage before submitting your application.
              </p>
            </div>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <JobseekerAuthCard />
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto text-center py-4 border-t border-border/40 text-xs text-muted-foreground">
        © {new Date().getFullYear()} NextKinLife. All rights reserved. Candidate privacy guaranteed.
      </footer>
    </div>
  );
}
