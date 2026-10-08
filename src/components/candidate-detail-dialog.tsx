"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Candidate } from "@/types/database";
import { toast } from "sonner";
import {
  UserIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon,
  MapPinIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  CalendarIcon,
  DollarSignIcon,
  GraduationCapIcon,
  CopyIcon,
  EditIcon,
  SendIcon,
  CheckIcon,
} from "lucide-react";

interface CandidateDetailDialogProps {
  candidate: Candidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (candidate: Candidate) => void;
  onSubmitJob?: (candidate: Candidate) => void;
}

export function CandidateDetailDialog({
  candidate,
  open,
  onOpenChange,
  onEdit,
  onSubmitJob,
}: CandidateDetailDialogProps) {
  const [copied, setCopied] = React.useState(false);

  if (!candidate) return null;

  const handleCopyPitch = () => {
    const pitch = `CONSULTANT PITCH / PROFILE SUMMARY
----------------------------------------
Name: ${candidate.full_name}
Target Role: ${candidate.target_job_titles || "Data Engineer"}
Total Experience: ${candidate.total_experience_years || "4+ years"} (${candidate.relevant_experience_years || "4+ Years"} relevant)
Visa Status: ${candidate.visa_status} (Authorized in USA: ${candidate.authorized_in_usa ? "Yes" : "No"})
Current Location: ${candidate.current_city ? `${candidate.current_city}, ${candidate.current_state}` : "Saint Louis, MO"}
Relocation: ${candidate.open_to_relocation ? "Yes (Open to Relocate)" : "No"} | Work Type: ${candidate.preferred_work_type || "ALL"}
Availability: ${candidate.available_to_join || "Immediately"} (Notice: ${candidate.notice_period || "Immediately"})
Interview Availability: ${candidate.interview_availability || "Mon-Thu 10:00am - 3:00pm"}
Rate Expectation: ${candidate.expected_salary || "$65/hr C2C / $55/hr W2"} (${candidate.employment_types?.join(", ") || "C2C, W2, Full time"})
Current Employer: ${candidate.current_employer || "Knowvia Tech"} (${candidate.current_job_title || "Software Developer"})
Education: ${candidate.highest_qualification || "Masters"} from ${candidate.university_name || "Webster University"} (${candidate.graduation_year || "2023-2025"})
Primary Skills: ${candidate.primary_skills || "Python, SQL, Apache Spark, AWS, Snowflake, Airflow"}
Secondary Skills: ${candidate.secondary_skills || "Kafka, Docker, CI/CD, Git"}
Certifications: ${candidate.certifications || "N/A"}
Contact: ${candidate.phone || ""} | ${candidate.email || ""}
LinkedIn: ${candidate.linkedin_url || ""}`;

    navigator.clipboard.writeText(pitch);
    setCopied(true);
    toast.success("Candidate Pitch Copied to Clipboard!", {
      description: "Ready to paste into vendor email or client submission form.",
    });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {candidate.full_name}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs"
                >
                  {candidate.visa_status}
                </Badge>
                {candidate.is_active_bench && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs"
                  >
                    Active on Bench
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{candidate.target_job_titles || "Data Engineer"}</span>
                <span>•</span>
                <span>{candidate.total_experience_years || "4+ years"} Exp</span>
                <span>•</span>
                <span>{candidate.current_city ? `${candidate.current_city}, ${candidate.current_state}` : "USA"}</span>
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyPitch}
                className="h-8 text-xs gap-1.5 cursor-pointer hover:border-primary/50"
              >
                {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
                {copied ? "Copied Pitch" : "Copy Pitch"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onEdit?.(candidate);
                }}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <EditIcon className="size-3.5" />
                Edit
              </Button>
              {onSubmitJob && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onSubmitJob?.(candidate);
                  }}
                  className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  <SendIcon className="size-3.5" />
                  Submit to Job
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 text-sm">
          {/* Quick Contact & Geographic Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-lg border bg-muted/30 text-xs">
            <div className="flex items-center gap-2">
              <PhoneIcon className="size-3.5 text-primary shrink-0" />
              <span className="truncate">{candidate.phone || "No phone"}</span>
            </div>
            <div className="flex items-center gap-2">
              <MailIcon className="size-3.5 text-primary shrink-0" />
              <span className="truncate">{candidate.email || "No email"}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPinIcon className="size-3.5 text-primary shrink-0" />
              <span className="truncate">
                {candidate.current_city ? `${candidate.current_city}, ${candidate.current_state}` : "USA"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GlobeIcon className="size-3.5 text-primary shrink-0" />
              <span className="truncate text-primary underline">
                {candidate.linkedin_url ? "LinkedIn Profile" : "No link"}
              </span>
            </div>
          </div>

          {/* SECTION 1: WORK AUTHORIZATION & EMPLOYMENT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-2">
                <ShieldCheckIcon className="size-4 text-primary" />
                Work Authorization
              </h4>
              <Separator />
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Current Visa:</span>
                  <span className="font-medium text-foreground">{candidate.visa_status}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Authorized in USA:</span>
                  <span className="font-medium text-emerald-600">
                    {candidate.authorized_in_usa ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Sponsorship Needed Now:</span>
                  <span className="font-medium text-foreground">
                    {candidate.need_sponsorship_now ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Future Sponsorship:</span>
                  <span className="font-medium text-foreground">
                    {candidate.need_sponsorship_future ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-2">
                <BriefcaseIcon className="size-4 text-primary" />
                Current Employment
              </h4>
              <Separator />
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Current Employer:</span>
                  <span className="font-medium text-foreground">{candidate.current_employer || "N/A"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Current Job Title:</span>
                  <span className="font-medium text-foreground">{candidate.current_job_title || "N/A"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Total Experience:</span>
                  <span className="font-medium text-foreground">{candidate.total_experience_years || "N/A"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Relevant Experience:</span>
                  <span className="font-medium text-foreground">{candidate.relevant_experience_years || "N/A"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: AVAILABILITY & COMPENSATION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-2">
                <CalendarIcon className="size-4 text-primary" />
                Availability & Interview Slots
              </h4>
              <Separator />
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Notice Period:</span>
                  <span className="font-medium text-emerald-600">{candidate.notice_period || "Immediately"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Available to Join:</span>
                  <span className="font-medium text-emerald-600">{candidate.available_to_join || "Immediately"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Relocation:</span>
                  <span className="font-medium text-foreground">{candidate.open_to_relocation ? "Yes (Open)" : "No"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Preferred Work Type:</span>
                  <span className="font-medium text-foreground">{candidate.preferred_work_type || "ALL"}</span>
                </div>
                <div className="pt-1.5 border-t">
                  <span className="text-muted-foreground block mb-0.5">Interview Availability:</span>
                  <span className="font-medium text-primary bg-primary/5 px-2 py-1 rounded inline-block">
                    {candidate.interview_availability || "Mon- Thursday 10:00am- 3:00pm"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-2">
                <DollarSignIcon className="size-4 text-primary" />
                Compensation & Contract Types
              </h4>
              <Separator />
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Current Pay Rate:</span>
                  <span className="font-medium text-foreground">{candidate.current_salary || "$55/hr (W2)"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Expected Pay Rate:</span>
                  <span className="font-medium text-emerald-600 font-semibold">{candidate.expected_salary || "95k-100k"}</span>
                </div>
                <div className="pt-2">
                  <span className="text-muted-foreground block mb-1.5">Employment Types:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.employment_types?.map((type) => (
                      <Badge key={type} variant="secondary" className="text-[11px]">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: SKILLS, EDUCATION & CERTIFICATIONS */}
          <div className="p-4 rounded-xl border bg-card space-y-4">
            <h4 className="font-semibold text-xs text-foreground flex items-center gap-2">
              <GraduationCapIcon className="size-4 text-primary" />
              Education, Target Roles & Technical Skills
            </h4>
            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Education:</span>
                <span className="font-medium text-foreground">
                  {candidate.highest_qualification || "Masters"} • {candidate.university_name || "Webster University"} (
                  {candidate.graduation_year || "2023-2025"})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Target Job Roles:</span>
                <span className="font-medium text-foreground">{candidate.target_job_titles || "Data Engineer"}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs pt-1 border-t">
              <span className="text-muted-foreground font-medium">Primary Technical Skills:</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(candidate.primary_skills || "Python, SQL, Apache Spark, AWS, Snowflake, Airflow")
                  .split(",")
                  .map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium"
                    >
                      {skill.trim()}
                    </span>
                  ))}
              </div>
            </div>

            {candidate.secondary_skills && (
              <div className="space-y-1.5 text-xs pt-1 border-t">
                <span className="text-muted-foreground font-medium">Secondary Skills:</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {candidate.secondary_skills.split(",").map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-muted text-foreground border border-border"
                    >
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {candidate.certifications && (
              <div className="text-xs pt-1 border-t flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Certifications:</span>
                <span className="font-medium text-foreground">{candidate.certifications}</span>
              </div>
            )}

            {candidate.notes && (
              <div className="text-xs pt-1 border-t">
                <span className="text-muted-foreground font-medium block mb-0.5">Internal Notes:</span>
                <p className="text-muted-foreground italic bg-muted/30 p-2.5 rounded-lg border">
                  &ldquo;{candidate.notes}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
