"use client";

import * as React from "react";
import { CandidateForm } from "@/components/candidate-form";

export default function NewCandidatePage() {
  return <CandidateForm backUrl="/dashboard/candidates" />;
}
