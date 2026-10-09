"use client";

import * as React from "react";
import { CandidateForm } from "@/components/candidate-form";
import type { Candidate } from "@/types/database";

interface CandidateFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateToEdit?: Candidate | null;
  onSuccess?: (candidate: Candidate) => void;
}

export function CandidateFormSheet({
  open,
  onOpenChange,
  candidateToEdit,
  onSuccess,
}: CandidateFormSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto w-screen h-screen">
      <CandidateForm
        initialCandidate={candidateToEdit}
        onSuccess={candidate=>{onSuccess?.(candidate);onOpenChange(false);}}
        backUrl="/dashboard/candidates"
      />
    </div>
  );
}
