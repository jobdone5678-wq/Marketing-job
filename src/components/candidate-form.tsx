"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createCandidate,
  updateCandidate,
  getCandidateById,
} from "@/lib/candidates";
import type { Candidate, CandidateFormData } from "@/types/database";
import {
  ArrowLeftIcon,
  UserIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  ClockIcon,
  DollarSignIcon,
  SparklesIcon,
  SendIcon,
  CheckIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon,
} from "lucide-react";

const TARUN_PRESET: CandidateFormData = {
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

const DEFAULT_FORM: CandidateFormData = {
  full_name: "",
  phone: "",
  email: "",
  linkedin_url: "",
  current_city: "",
  current_state: "",
  full_address: "",
  visa_status: "STEM [EAD]",
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  current_employer: "",
  current_job_title: "",
  employment_status: "STEM [EAD]",
  total_experience_years: "",
  relevant_experience_years: "",
  notice_period: "Immediately",
  available_to_join: "Immediately",
  interview_availability: "Mon- Thursday 10:00am- 3:00pm",
  open_to_relocation: true,
  preferred_work_type: "ALL",
  preferred_locations: "All",
  current_salary: "",
  expected_salary: "",
  employment_types: ["C2C", "W2"],
  highest_qualification: "Masters",
  university_name: "",
  graduation_year: "",
  target_job_titles: "",
  primary_skills: "",
  secondary_skills: "",
  certifications: "",
  is_active_bench: true,
  notes: "",
};

interface CandidateFormProps {
  initialCandidate?: Candidate | null;
  candidateId?: string;
  backUrl?: string;
}

export function CandidateForm({
  initialCandidate,
  candidateId,
  backUrl = "/dashboard/candidates",
}: CandidateFormProps) {
  const router = useRouter();
  const [formData, setFormData] = React.useState<CandidateFormData>(
    initialCandidate ? { ...initialCandidate } : DEFAULT_FORM
  );
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(Boolean(candidateId && !initialCandidate));

  // If candidateId provided without initialCandidate, fetch it
  React.useEffect(() => {
    if (candidateId && !initialCandidate) {
      setFetching(true);
      getCandidateById(candidateId)
        .then((cand) => {
          if (cand) {
            setFormData({ ...cand });
          } else {
            toast.error("Candidate not found");
          }
        })
        .finally(() => setFetching(false));
    }
  }, [candidateId, initialCandidate]);

  const handleChange = (field: keyof CandidateFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmploymentTypeToggle = (type: string) => {
    const currentTypes = formData.employment_types || [];
    if (currentTypes.includes(type)) {
      handleChange(
        "employment_types",
        currentTypes.filter((t) => t !== type)
      );
    } else {
      handleChange("employment_types", [...currentTypes, type]);
    }
  };

  const handleLoadTarunPreset = () => {
    setFormData(TARUN_PRESET);
    toast.success("Loaded Tarun Pothukuri's Profile", {
      description: "Data Engineer candidate profile pre-filled into all form fields.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      toast.error("Full Name is required");
      return;
    }

    setLoading(true);
    const targetId = initialCandidate?.id || candidateId;

    try {
      if (targetId) {
        const { data, error } = await updateCandidate(targetId, formData);
        if (error) {
          toast.error("Failed to update candidate", { description: error });
        } else if (data) {
          toast.success("Candidate Profile Updated!", {
            description: `${data.full_name} profile successfully updated.`,
          });
          router.push(backUrl);
        }
      } else {
        const { data, error } = await createCandidate(formData);
        if (error) {
          toast.error("Failed to create candidate", { description: error });
        } else if (data) {
          toast.success("Candidate Added to Bench!", {
            description: `${data.full_name} is now available for marketing submissions.`,
          });
          router.push(backUrl);
        }
      }
    } catch {
      toast.error("An error occurred while saving the candidate.");
    } finally {
      setLoading(false);
    }
  };

  const isEditing = Boolean(initialCandidate?.id || candidateId);

  if (fetching) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center min-h-[400px] gap-3">
        <SparklesIcon className="size-6 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Loading candidate profile...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8 max-w-6xl w-full mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={backUrl}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium cursor-pointer"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to Bench Candidates
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">
            {isEditing ? "Edit Candidate" : "New Candidate Profile"}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {isEditing
                  ? `Edit Profile: ${formData.full_name || "Candidate"}`
                  : "USA Candidate Information Form"}
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs"
              >
                <UserIcon className="size-3" />
                Bench Profile Intake
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Complete US IT bench placement profile for STEM OPT, EAD, and H1B consultants.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {!isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadTarunPreset}
                className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
              >
                <SparklesIcon className="size-3.5" />
                Load Sample Profile
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(backUrl)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={handleSubmit}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 cursor-pointer shadow-xs"
            >
              <SendIcon className="size-3.5" />
              {loading
                ? "Saving..."
                : isEditing
                ? "Update Candidate"
                : "Save to Bench Pool"}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Columns: Core Profile Sections */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. PERSONAL DETAILS & LOCATION */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <UserIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    1. Personal Information & Geographic Details
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Full legal name, direct contact info, and current US residential address.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name" className="text-xs font-medium">
                      Full Legal Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="full_name"
                      placeholder="e.g. Tarun Pothukuri"
                      value={formData.full_name}
                      onChange={(e) => handleChange("full_name", e.target.value)}
                      className="h-9 text-xs bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      placeholder="e.g. 3143575705"
                      value={formData.phone || ""}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="tarunreddyp007@gmail.com"
                      value={formData.email || ""}
                      onChange={(e) => handleChange("email", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="linkedin_url" className="text-xs font-medium">
                      LinkedIn Profile URL
                    </Label>
                    <Input
                      id="linkedin_url"
                      placeholder="www.linkedin.com/in/..."
                      value={formData.linkedin_url || ""}
                      onChange={(e) => handleChange("linkedin_url", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="current_city" className="text-xs font-medium">
                      Current City
                    </Label>
                    <Input
                      id="current_city"
                      placeholder="Saint Louis"
                      value={formData.current_city || ""}
                      onChange={(e) => handleChange("current_city", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="current_state" className="text-xs font-medium">
                      Current State
                    </Label>
                    <Input
                      id="current_state"
                      placeholder="Missouri"
                      value={formData.current_state || ""}
                      onChange={(e) => handleChange("current_state", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="full_address" className="text-xs font-medium">
                    Full Physical Address
                  </Label>
                  <Input
                    id="full_address"
                    placeholder="12618 Mateus dr, Apt A, Saint Louis, MO"
                    value={formData.full_address || ""}
                    onChange={(e) => handleChange("full_address", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. WORK AUTHORIZATION & VISA STATUS */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    2. Work Authorization & USA Visa Status
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Immigration status, current EAD validity, and sponsorship prerequisites.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="visa_status" className="text-xs font-medium">
                      Visa / Work Authorization Status
                    </Label>
                    <Select
                      value={formData.visa_status}
                      onValueChange={(val) => handleChange("visa_status", val)}
                    >
                      <SelectTrigger id="visa_status" className="h-9 text-xs bg-background font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STEM [EAD]" className="text-xs">
                          STEM [EAD] (F1 Extension)
                        </SelectItem>
                        <SelectItem value="OPT [EAD]" className="text-xs">
                          OPT [EAD] (Initial 12 mo)
                        </SelectItem>
                        <SelectItem value="H1B" className="text-xs">
                          H1B Visa (Transfer Ready)
                        </SelectItem>
                        <SelectItem value="H4 EAD" className="text-xs">
                          H4 EAD (Authorized)
                        </SelectItem>
                        <SelectItem value="Green Card" className="text-xs">
                          Green Card (Permanent Resident)
                        </SelectItem>
                        <SelectItem value="US Citizen" className="text-xs">
                          US Citizen
                        </SelectItem>
                        <SelectItem value="Other" className="text-xs">
                          Other / EAD
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="employment_status" className="text-xs font-medium">
                      Employment Document Status
                    </Label>
                    <Input
                      id="employment_status"
                      placeholder="e.g. STEM [EAD]"
                      value={formData.employment_status || ""}
                      onChange={(e) => handleChange("employment_status", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <label className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formData.authorized_in_usa}
                      onChange={(e) => handleChange("authorized_in_usa", e.target.checked)}
                      className="size-4 rounded border-gray-300 text-primary accent-primary"
                    />
                    <span className="font-medium text-foreground">
                      Legally Authorized to Work in USA
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formData.need_sponsorship_now}
                      onChange={(e) => handleChange("need_sponsorship_now", e.target.checked)}
                      className="size-4 rounded border-gray-300 text-primary accent-primary"
                    />
                    <span className="font-medium text-foreground">
                      Needs Sponsorship Now
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formData.need_sponsorship_future}
                      onChange={(e) => handleChange("need_sponsorship_future", e.target.checked)}
                      className="size-4 rounded border-gray-300 text-primary accent-primary"
                    />
                    <span className="font-medium text-foreground">
                      Needs Sponsorship in Future
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* 3. EMPLOYMENT & EXPERIENCE */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <BriefcaseIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    3. Professional Experience & Target Roles
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Current employer, job title, years of experience, and target designations.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="current_employer" className="text-xs font-medium">
                      Current / Recent Employer
                    </Label>
                    <Input
                      id="current_employer"
                      placeholder="e.g. Knowvia Tech"
                      value={formData.current_employer || ""}
                      onChange={(e) => handleChange("current_employer", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="current_job_title" className="text-xs font-medium">
                      Current Job Title
                    </Label>
                    <Input
                      id="current_job_title"
                      placeholder="e.g. Software Developer (Data Engineer)"
                      value={formData.current_job_title || ""}
                      onChange={(e) => handleChange("current_job_title", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="total_experience_years" className="text-xs font-medium">
                      Total Experience
                    </Label>
                    <Input
                      id="total_experience_years"
                      placeholder="e.g. 4+ years"
                      value={formData.total_experience_years || ""}
                      onChange={(e) => handleChange("total_experience_years", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="relevant_experience_years" className="text-xs font-medium">
                      Relevant US Experience
                    </Label>
                    <Input
                      id="relevant_experience_years"
                      placeholder="e.g. 4+ Years"
                      value={formData.relevant_experience_years || ""}
                      onChange={(e) => handleChange("relevant_experience_years", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="target_job_titles" className="text-xs font-medium">
                      Target Job Titles
                    </Label>
                    <Input
                      id="target_job_titles"
                      placeholder="e.g. Data Engineer, Big Data Lead"
                      value={formData.target_job_titles || ""}
                      onChange={(e) => handleChange("target_job_titles", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 4. EDUCATION & SKILLS */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <GraduationCapIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    4. Education & Technical Skills
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Degrees, universities, primary tech stack, and professional certifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="highest_qualification" className="text-xs font-medium">
                      Highest Qualification
                    </Label>
                    <Input
                      id="highest_qualification"
                      placeholder="Masters"
                      value={formData.highest_qualification || ""}
                      onChange={(e) => handleChange("highest_qualification", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="university_name" className="text-xs font-medium">
                      University Name
                    </Label>
                    <Input
                      id="university_name"
                      placeholder="Webster University"
                      value={formData.university_name || ""}
                      onChange={(e) => handleChange("university_name", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="graduation_year" className="text-xs font-medium">
                      Graduation Timeline
                    </Label>
                    <Input
                      id="graduation_year"
                      placeholder="May 2023-May 2025"
                      value={formData.graduation_year || ""}
                      onChange={(e) => handleChange("graduation_year", e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="primary_skills" className="text-xs font-medium">
                    Primary Technical Skills
                  </Label>
                  <Input
                    id="primary_skills"
                    placeholder="Python, SQL, Apache Spark, AWS, Snowflake, Airflow"
                    value={formData.primary_skills || ""}
                    onChange={(e) => handleChange("primary_skills", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Core technologies used for primary keyword matching.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="secondary_skills" className="text-xs font-medium">
                    Secondary Skills & Tools
                  </Label>
                  <Input
                    id="secondary_skills"
                    placeholder="Kafka, Docker, CI/CD, Git, Linux"
                    value={formData.secondary_skills || ""}
                    onChange={(e) => handleChange("secondary_skills", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="certifications" className="text-xs font-medium">
                    Certifications
                  </Label>
                  <Input
                    id="certifications"
                    placeholder="AWS Certified Data Engineer Associate, Snowflake SnowPro"
                    value={formData.certifications || ""}
                    onChange={(e) => handleChange("certifications", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right 1 Column: Compensation, Availability & Marketing Flags */}
          <div className="space-y-6">
            {/* 5. COMPENSATION & AVAILABILITY */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <DollarSignIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    Compensation & Terms
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Rate targets and work types.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="expected_salary" className="text-xs font-medium">
                    Expected Rate / Salary
                  </Label>
                  <Input
                    id="expected_salary"
                    placeholder="e.g. $65/hr C2C or 95k-100k W2"
                    value={formData.expected_salary || ""}
                    onChange={(e) => handleChange("expected_salary", e.target.value)}
                    className="h-9 text-xs bg-background font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="current_salary" className="text-xs font-medium">
                    Current Rate / Salary (Optional)
                  </Label>
                  <Input
                    id="current_salary"
                    placeholder="$55/hr (W2)"
                    value={formData.current_salary || ""}
                    onChange={(e) => handleChange("current_salary", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Allowed Employment Types</Label>
                  <div className="flex flex-wrap gap-2">
                    {["C2C", "W2", "Full time", "1099"].map((type) => {
                      const isSelected = formData.employment_types?.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleEmploymentTypeToggle(type)}
                          className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-medium ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 hover:bg-muted text-foreground border-border/60"
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t">
                  <Label htmlFor="notice_period" className="text-xs font-medium">
                    Notice Period / Availability
                  </Label>
                  <Input
                    id="notice_period"
                    placeholder="Immediately"
                    value={formData.notice_period || ""}
                    onChange={(e) => handleChange("notice_period", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="interview_availability" className="text-xs font-medium">
                    Interview Time Slots
                  </Label>
                  <Input
                    id="interview_availability"
                    placeholder="Mon- Thursday 10:00am- 3:00pm CST"
                    value={formData.interview_availability || ""}
                    onChange={(e) => handleChange("interview_availability", e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <label className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={formData.open_to_relocation}
                    onChange={(e) => handleChange("open_to_relocation", e.target.checked)}
                    className="size-4 rounded border-gray-300 text-primary accent-primary"
                  />
                  <span className="font-medium text-foreground">
                    Open to Relocation (Any USA Location)
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* 6. BENCH STATUS & NOTES */}
            <Card className="shadow-xs border-primary/20">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold">
                  Recruiter Bench Marketing Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <label className="flex items-center gap-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={formData.is_active_bench}
                    onChange={(e) => handleChange("is_active_bench", e.target.checked)}
                    className="size-4 rounded border-gray-300 text-emerald-600 accent-emerald-600"
                  />
                  <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Active on Bench (Available for Submissions)
                  </span>
                </label>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium">
                    Internal Recruiter Notes
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Log recruiter notes, vendor representation preferences, client interview feedback..."
                    value={formData.notes || ""}
                    onChange={(e) => handleChange("notes", e.target.value)}
                    rows={4}
                    className="text-xs bg-background"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Buttons Box */}
            <div className="p-4 rounded-xl border bg-card shadow-xs space-y-2.5">
              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <SendIcon className="size-4" />
                {loading
                  ? "Saving..."
                  : isEditing
                  ? "Update Candidate Profile"
                  : "Save to Bench Pool"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(backUrl)}
                className="w-full text-xs cursor-pointer"
              >
                Cancel & Return
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
