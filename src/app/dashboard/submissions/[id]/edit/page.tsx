"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { SubmissionForm } from "@/components/submission-form";
import { getSubmissionById } from "@/lib/submissions";
import type { JobSubmission } from "@/types/database";
import {WorkspaceSkeleton} from "@/components/workspace-ui";
import { toast } from "sonner";

export default function EditSubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [submission, setSubmission] = React.useState<JobSubmission | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    getSubmissionById(id)
      .then((data) => {
        if (data) {
          setSubmission(data);
        } else {
          toast.error("Submission not found");
          router.push("/dashboard/submissions");
        }
      })
      .catch(() => {
        toast.error("Failed to load submission");
        router.push("/dashboard/submissions");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, router]);

  if (loading) {
    return (
      <div className="portal-page"><WorkspaceSkeleton/></div>
    );
  }

  if (!submission) return null;

  return (
    <SubmissionForm
      initialSubmission={submission}
      backUrl="/dashboard/submissions"
    />
  );
}
