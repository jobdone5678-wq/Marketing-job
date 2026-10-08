"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCandidates, createCandidate } from "@/lib/candidates";
import type { Candidate } from "@/types/database";
import { CandidateDetailDialog } from "@/components/candidate-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import {
  UsersIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  CopyIcon,
  EyeIcon,
  EditIcon,
  SendIcon,
  MapPinIcon,
  BriefcaseIcon,
  CalendarIcon,
  DollarSignIcon,
  CheckIcon,
  RefreshCwIcon,
} from "lucide-react";

const INITIAL_TARUN_DATA = {
  full_name: "Tarun Pothukuri",
  phone: "3143575705",
  email: "tarunreddyp007@gmail.com",
  linkedin_url: "www.linkedin.com/in/tarun-pothukuri-17275b325",
  current_city: "Saint Louis",
  current_state: "Missouri",
  full_address: "12618 Mateus dr, Apt A",
  visa_status: "STEM [EAD]",
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  current_employer: "Knowvia Tech",
  current_job_title: "Software Developer (Data Engineer)",
  employment_status: "STEM [EAD]",
  total_experience_years: "4+ years",
  relevant_experience_years: "4+ Years",
  notice_period: "Immediately",
  available_to_join: "Immediately",
  interview_availability: "Mon- Thursday 10:00am- 3:00pm",
  open_to_relocation: true,
  preferred_work_type: "ALL",
  preferred_locations: "All",
  current_salary: "$55/hr (W2)",
  expected_salary: "95k-100k",
  employment_types: ["C2C", "W2", "Full time"],
  highest_qualification: "Masters",
  university_name: "Webster University",
  graduation_year: "May 2023-May 2025",
  target_job_titles: "Data Engineer",
  primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
  secondary_skills: "Kafka, Docker, CI/CD, Git, Linux",
  certifications: "AWS Certified Data Engineer Associate",
  is_active_bench: true,
  notes: "Primary candidate on bench. Ready for immediate C2C or W2 contract submissions.",
};

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedVisaFilter, setSelectedVisaFilter] = React.useState("all");

  const [detailDialogOpen, setDetailDialogOpen] = React.useState(false);
  const [activeCandidate, setActiveCandidate] = React.useState<Candidate | null>(null);

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const loadCandidates = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCandidates();
      setCandidates(data);
    } catch {
      toast.error("Failed to fetch candidates");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleSeedTarun = async () => {
    const { data, error } = await createCandidate(INITIAL_TARUN_DATA);
    if (error) {
      toast.error("Notice", { description: error });
    } else if (data) {
      toast.success("Tarun Pothukuri Added to Bench!", {
        description: "Data Engineer profile is now live for job marketing submissions.",
      });
      loadCandidates();
    }
  };

  const handleCopyPitch = (candidate: Candidate) => {
    const pitch = `Consultant Profile: ${candidate.full_name} | Role: ${
      candidate.target_job_titles || "Data Engineer"
    } | Exp: ${candidate.total_experience_years || "4+ years"} | Visa: ${
      candidate.visa_status
    } | Location: ${candidate.current_city}, ${candidate.current_state} (Open to Relocate) | Rate: ${
      candidate.expected_salary || "$65/hr C2C"
    } | Availability: ${candidate.available_to_join || "Immediately"} | Interview: ${
      candidate.interview_availability || "Mon-Thu 10am-3pm"
    } | Skills: ${candidate.primary_skills || "Python, SQL, Spark, AWS"}`;

    navigator.clipboard.writeText(pitch);
    setCopiedId(candidate.id);
    toast.success(`Copied pitch for ${candidate.full_name}`, {
      description: "Ready to paste into vendor email or client submission.",
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filter candidates
  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.target_job_titles && c.target_job_titles.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.primary_skills && c.primary_skills.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.current_city && c.current_city.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesVisa =
      selectedVisaFilter === "all" ||
      c.visa_status.toLowerCase().includes(selectedVisaFilter.toLowerCase());

    return matchesSearch && matchesVisa;
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-7xl mx-auto w-full">
      {/* Header & Metric Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Bench Candidates
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {candidates.length} Profiles
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            USA Candidate Information Forms & active bench consultants ready for client job submissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCandidates}
            disabled={loading}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {candidates.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeedTarun}
              className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5 cursor-pointer"
            >
              <SparklesIcon className="size-3.5" />
              Add Tarun (Sample)
            </Button>
          )}

          <Link href="/dashboard/candidates/new">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              <PlusIcon className="size-3.5" />
              New Candidate Form
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by candidate name, target role, or skills (e.g. Python, Spark)..."
            className="h-8.5 pl-8 text-xs bg-card"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All Visas" },
            { id: "stem", label: "STEM [EAD]" },
            { id: "h1b", label: "H1B" },
            { id: "green card", label: "Green Card" },
            { id: "usc", label: "US Citizen" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedVisaFilter(tab.id)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedVisaFilter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candidate Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl border bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-card/30 text-center space-y-3">
          <UsersIcon className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-sm">No Candidates Found</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {candidates.length === 0
                ? "No candidates added to the bench yet. Load Tarun's profile or add a new candidate."
                : "No candidates match your current search or visa filter."}
            </p>
          </div>
          {candidates.length === 0 && (
            <Button
              size="sm"
              onClick={handleSeedTarun}
              className="text-xs gap-1.5 bg-primary text-primary-foreground mt-2 cursor-pointer"
            >
              <SparklesIcon className="size-3.5" />
              Load Tarun Pothukuri Profile
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map((candidate) => (
            <Card
              key={candidate.id}
              className="flex flex-col justify-between hover:border-primary/40 transition-all shadow-xs"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base tracking-tight text-foreground">
                      {candidate.full_name}
                    </h3>
                    <p className="text-xs text-primary font-medium mt-0.5">
                      {candidate.target_job_titles || "Data Engineer"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[11px] shrink-0"
                  >
                    {candidate.visa_status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-1 pb-3 space-y-3 text-xs">
                {/* Meta details */}
                <div className="space-y-1.5 text-muted-foreground pt-1 border-t">
                  <div className="flex items-center gap-1.5">
                    <BriefcaseIcon className="size-3.5 text-primary shrink-0" />
                    <span>
                      {candidate.total_experience_years || "4+ years"} Exp • {candidate.current_employer || "Knowvia Tech"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <MapPinIcon className="size-3.5 text-primary shrink-0" />
                    <span>
                      {candidate.current_city ? `${candidate.current_city}, ${candidate.current_state}` : "USA"}
                      {candidate.open_to_relocation ? " (Open to Relocate)" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      Slots: {candidate.interview_availability || "Mon-Thu 10am-3pm"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <DollarSignIcon className="size-3.5 text-primary shrink-0" />
                    <span className="font-medium text-emerald-600">
                      {candidate.expected_salary || "95k-100k"} ({candidate.employment_types?.join(", ") || "C2C, W2"})
                    </span>
                  </div>
                </div>

                {/* Primary Skills pills */}
                <div className="pt-2 border-t">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">
                    Skills
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(candidate.primary_skills || "Python, SQL, Apache Spark, AWS, Snowflake")
                      .split(",")
                      .slice(0, 4)
                      .map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 font-medium"
                        >
                          {skill.trim()}
                        </span>
                      ))}
                    {(candidate.primary_skills || "").split(",").length > 4 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        +{(candidate.primary_skills || "").split(",").length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-3 pt-2 bg-muted/20 border-t flex items-center justify-between gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyPitch(candidate)}
                  className="h-7 text-[11px] gap-1 cursor-pointer flex-1"
                >
                  {copiedId === candidate.id ? (
                    <CheckIcon className="size-3 text-emerald-600" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                  {copiedId === candidate.id ? "Copied" : "Copy Pitch"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveCandidate(candidate);
                    setDetailDialogOpen(true);
                  }}
                  className="h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <EyeIcon className="size-3" />
                  View
                </Button>

                <Link href={`/dashboard/candidates/${candidate.id}/edit`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1 cursor-pointer"
                  >
                    <EditIcon className="size-3" />
                    Edit
                  </Button>
                </Link>

                <Button
                  size="sm"
                  onClick={() => {
                    router.push(`/dashboard/submissions/new?candidateId=${candidate.id}`);
                  }}
                  className="h-7 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer ml-auto"
                >
                  <SendIcon className="size-3" />
                  Submit to Job
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <CandidateDetailDialog
        candidate={activeCandidate}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(cand) => {
          router.push(`/dashboard/candidates/${cand.id}/edit`);
        }}
        onSubmitJob={(cand) => {
          router.push(`/dashboard/submissions/new?candidateId=${cand.id}`);
        }}
      />
    </div>
  );
}
