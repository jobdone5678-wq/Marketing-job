"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { SubmissionForm } from "@/components/submission-form";
import { RefreshCwIcon } from "lucide-react";

function NewSubmissionContent() {
  const searchParams = useSearchParams();

  const candidateId =
    searchParams.get("candidateId") ||
    searchParams.get("candidate_id") ||
    undefined;
  const company =
    searchParams.get("company") ||
    searchParams.get("client_name") ||
    searchParams.get("company_name") ||
    undefined;
  const title =
    searchParams.get("title") ||
    searchParams.get("job_title") ||
    undefined;
  const url =
    searchParams.get("url") ||
    searchParams.get("job_url") ||
    undefined;
  const portal =
    searchParams.get("portal") ||
    searchParams.get("portal_source") ||
    undefined;
  const location =
    searchParams.get("location") ||
    searchParams.get("job_location") ||
    undefined;
  const vendor =
    searchParams.get("vendor") ||
    searchParams.get("vendor_company") ||
    undefined;

  const initialJob =
    company || title || url || portal || location || vendor
      ? {
          company_name: company,
          job_title: title,
          job_url: url,
          portal_source: portal,
          job_location: location,
          vendor_company: vendor,
        }
      : undefined;

  return (
    <SubmissionForm
      initialCandidateId={candidateId}
      initialJob={initialJob}
      backUrl="/dashboard/submissions"
    />
  );
}

export default function NewSubmissionPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-96 flex-col items-center justify-center gap-3">
          <RefreshCwIcon className="size-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">
            Loading submission form...
          </span>
        </div>
      }
    >
      <NewSubmissionContent />
    </React.Suspense>
  );
}
