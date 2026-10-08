"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCandidates } from "@/lib/candidates";
import { analyzeCandidateJobMatch, type SkillMatchResult } from "@/lib/matcher";
import type { Candidate } from "@/types/database";
import { toast } from "sonner";
import {
  SparklesIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  SendIcon,
  FileTextIcon,
  UsersIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from "lucide-react";

interface SkillMatcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id?: string;
    title: string;
    company: string;
    description: string;
    location?: string;
    portal?: string;
  };
}

export function SkillMatcherDialog({
  open,
  onOpenChange,
  job,
}: SkillMatcherDialogProps) {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>("");
  const [copiedTab, setCopiedTab] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      getCandidates().then((data) => {
        setCandidates(data);
        if (data.length > 0 && !selectedCandidateId) {
          setSelectedCandidateId(data[0].id);
        }
      });
    }
  }, [open, selectedCandidateId]);

  const selectedCandidate = React.useMemo(() => {
    return candidates.find((c) => c.id === selectedCandidateId) || candidates[0];
  }, [candidates, selectedCandidateId]);

  const matchResult: SkillMatchResult | null = React.useMemo(() => {
    if (!selectedCandidate) return null;
    return analyzeCandidateJobMatch(selectedCandidate, {
      title: job.title,
      company: job.company,
      description: job.description || "",
      location: job.location || "Remote",
    });
  }, [selectedCandidate, job]);

  const handleCopy = (text: string, tabName: string) => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(text);
      setCopiedTab(tabName);
      toast.success(`${tabName} copied to clipboard!`);
      setTimeout(() => setCopiedTab(null), 2500);
    }
  };

  const handleCreateSubmission = () => {
    onOpenChange(false);
    const query = new URLSearchParams();
    if (selectedCandidate?.id) {
      query.set("candidateId", selectedCandidate.id);
      query.set("candidate_id", selectedCandidate.id);
      query.set("candidate_name", selectedCandidate.full_name || "");
    }
    if (job.company) {
      query.set("company", job.company);
      query.set("client_name", job.company);
    }
    if (job.title) {
      query.set("title", job.title);
      query.set("job_title", job.title);
    }
    if (job.portal) {
      query.set("portal", job.portal);
      query.set("portal_source", job.portal);
    }
    if (job.location) {
      query.set("location", job.location);
    }
    if (job.url) {
      query.set("url", job.url);
    }
    router.push(`/dashboard/submissions/new?${query.toString()}`);
  };

  if (!matchResult || !selectedCandidate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6 bg-card border border-border shadow-2xl">
        <DialogHeader className="gap-1 border-b pb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <SparklesIcon className="size-4" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Bench Candidate Skill Matcher & Pitch Kit
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Evaluating bench candidate qualifications against <span className="font-semibold text-foreground">{job.title}</span> at <span className="font-semibold text-foreground">{job.company}</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Candidate Selector & Match Score Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <UsersIcon className="size-3.5" />
              Select Bench Candidate
            </label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-medium focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.target_job_titles || "Data Engineer"} ({c.visa_status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-xl border border-border/60 shrink-0">
            <div className="flex flex-col text-right">
              <span className="text-[11px] font-medium text-muted-foreground">Match Fit Score</span>
              <span className="text-xs font-bold text-foreground">
                {matchResult.score >= 85 ? "High Fit" : "Moderate Fit"}
              </span>
            </div>
            <div
              className={`flex items-center justify-center size-12 rounded-xl font-bold text-lg border ${
                matchResult.score >= 85
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
              }`}
            >
              {matchResult.score}%
            </div>
          </div>
        </div>

        {/* Skill Overlap Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/60">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
              <CheckCircle2Icon className="size-3.5" />
              Matching Skills ({matchResult.matchedSkills.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matchResult.matchedSkills.length > 0 ? (
                matchResult.matchedSkills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[11px] font-medium"
                  >
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No direct tech keyword overlaps</span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">
              <AlertCircleIcon className="size-3.5" />
              Missing Keywords / Gap ({matchResult.missingSkills.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matchResult.missingSkills.length > 0 ? (
                matchResult.missingSkills.slice(0, 6).map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-[11px] font-medium"
                  >
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Candidate covers all required skills</span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Pitch & Documents Tabs */}
        <Tabs defaultValue="pitch" className="w-full pt-1">
          <TabsList className="grid grid-cols-3 w-full h-9">
            <TabsTrigger value="pitch" className="text-xs cursor-pointer">
              Vendor Pitch Email
            </TabsTrigger>
            <TabsTrigger value="rtr" className="text-xs cursor-pointer">
              Right To Represent (RTR)
            </TabsTrigger>
            <TabsTrigger value="resume" className="text-xs cursor-pointer">
              Tailored Resume Bullets
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Pitch Email */}
          <TabsContent value="pitch" className="space-y-3 pt-2">
            <div className="relative">
              <pre className="p-3.5 text-xs font-mono bg-muted/40 rounded-xl border border-border whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto text-foreground">
                {matchResult.pitchEmail}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(matchResult.pitchEmail, "Pitch Email")}
                className="absolute top-2.5 right-2.5 h-7 text-[11px] gap-1 cursor-pointer bg-background/90"
              >
                {copiedTab === "Pitch Email" ? (
                  <CheckIcon className="size-3 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-3" />
                )}
                {copiedTab === "Pitch Email" ? "Copied" : "Copy Pitch"}
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: RTR Confirmation */}
          <TabsContent value="rtr" className="space-y-3 pt-2">
            <div className="relative">
              <pre className="p-3.5 text-xs font-mono bg-muted/40 rounded-xl border border-border whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto text-foreground">
                {matchResult.rtrText}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(matchResult.rtrText, "RTR Agreement")}
                className="absolute top-2.5 right-2.5 h-7 text-[11px] gap-1 cursor-pointer bg-background/90"
              >
                {copiedTab === "RTR Agreement" ? (
                  <CheckIcon className="size-3 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-3" />
                )}
                {copiedTab === "RTR Agreement" ? "Copied" : "Copy RTR"}
              </Button>
            </div>
          </TabsContent>

          {/* TAB 3: Tailored Resume Bullets */}
          <TabsContent value="resume" className="space-y-3 pt-2">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recommended Bullet Points to Append to Resume:
              </p>
              <div className="space-y-2">
                {matchResult.tailoredResumeBullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                    <span className="text-primary font-bold">•</span>
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCopy(
                      matchResult.tailoredResumeBullets.map((b) => `• ${b}`).join("\n\n"),
                      "Resume Bullets"
                    )
                  }
                  className="h-7 text-[11px] gap-1 cursor-pointer"
                >
                  {copiedTab === "Resume Bullets" ? (
                    <CheckIcon className="size-3 text-emerald-500" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                  {copiedTab === "Resume Bullets" ? "Copied Bullets" : "Copy All Bullets"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheckIcon className="size-3.5 text-primary" />
            Duplicate protection will check vendor + client before submission.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8 cursor-pointer w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleCreateSubmission}
              className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs w-full sm:w-auto"
            >
              <SendIcon className="size-3.5" />
              Submit Candidate Now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
