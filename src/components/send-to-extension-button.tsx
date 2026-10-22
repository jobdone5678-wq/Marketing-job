"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { SendIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import type { JobSubmission } from "@/types/database";

// Push a reviewed candidate profile into the extension of the client who is
// applying. The recipient is the candidate's own account, so no selection UI
// is needed: the recruiter or technical recruiter confirms the push.
export function SendToExtensionButton({ submission }: { submission: JobSubmission }) {
  const candidate = submission.candidate;
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function push() {
    if (!candidate?.id) {
      toast.error("No reviewed candidate is linked to this submission.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/extension/push-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          recipientId: candidate.user_id,
          label: submission.company_name || "Shared profile",
        }),
      });
      setSent(true);
      toast.success(`Sent ${candidate.full_name} to the client's extension.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2Icon className="size-3" /> Sent to extension
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={push}
      className="h-7 px-2 cursor-pointer text-[11px] gap-1"
      title="Push this reviewed candidate profile into the client's extension"
    >
      {loading ? <Loader2Icon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />}
      Send to extension
    </Button>
  );
}