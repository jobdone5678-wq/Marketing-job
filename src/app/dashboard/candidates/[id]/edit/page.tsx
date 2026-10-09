"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { CandidateForm } from "@/components/candidate-form";
import { getCandidateById } from "@/lib/candidates";
import type { Candidate } from "@/types/database";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

export default function EditCandidatePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [candidate, setCandidate] = React.useState<Candidate | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    getCandidateById(id)
      .then((data) => {
        if (data) {
          setCandidate(data);
        } else {
          toast.error("Candidate not found");
          router.push("/dashboard/candidates");
        }
      })
      .catch(() => {
        toast.error("Failed to load candidate");
        router.push("/dashboard/candidates");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <RefreshCwIcon className="size-6 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Loading candidate profile...</span>
      </div>
    );
  }

  if (!candidate) return null;

  return (
    <CandidateForm
      initialCandidate={candidate}
      backUrl="/dashboard/candidates"
    />
  );
}
