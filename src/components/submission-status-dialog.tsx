"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateSubmissionStatus } from "@/lib/submissions";
import type { JobSubmission, SubmissionStatus } from "@/types/database";
import {
  CalendarIcon,
  VideoIcon,
  CheckCircle2Icon,
  SparklesIcon,
} from "lucide-react";

const STATUS_OPTIONS: { label: string; value: SubmissionStatus }[] = [
  {label:"Draft (not submitted)",value:"Draft"},
  { label: "1. Applied", value: "Applied" },
  { label: "2. Vendor Screening", value: "Vendor_Screening" },
  { label: "3. Submitted to Client", value: "Submitted_to_Client" },
  { label: "4. Interview Scheduled", value: "Interview_Scheduled" },
  { label: "5. Round 1 Interview", value: "Round_1" },
  { label: "6. Round 2 Interview / Loop", value: "Round_2" },
  { label: "7. Offer Received 🎉", value: "Offer_Received" },
  { label: "8. Rejected", value: "Rejected" },
  { label: "9. No Response", value: "No_Response" },
];

const INTERVIEW_MODES = [
  "Zoom",
  "Microsoft Teams",
  "Google Meet",
  "Phone Call",
  "WebEx",
  "In-Person",
];

interface SubmissionStatusDialogProps {
  submission: JobSubmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (updated: JobSubmission) => void;
}

export function SubmissionStatusDialog({
  submission,
  open,
  onOpenChange,
  onSuccess,
}: SubmissionStatusDialogProps) {
  const [status, setStatus] = React.useState<SubmissionStatus>("Draft");
  const [notes, setNotes] = React.useState("");
  const [interviewTime, setInterviewTime] = React.useState("");
  const [interviewMode, setInterviewMode] = React.useState("");
  const [interviewMeetingLink, setInterviewMeetingLink] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
    if (submission) {
      setStatus(submission.status);
      setNotes(submission.notes || "");
      setInterviewTime(
        submission.interview_time
          ? new Date(submission.interview_time).toISOString().slice(0, 16)
          : ""
      );
      setInterviewMode(submission.interview_mode || "");
      setInterviewMeetingLink(submission.interview_meeting_link || "");
    }
    },0);
    return () => clearTimeout(timer);
  }, [submission]);

  if (!submission) return null;

  const isInterview =
    status === "Interview_Scheduled" || status === "Round_1" || status === "Round_2";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const interviewDetails = isInterview
        ? {
            interview_time: interviewTime
              ? new Date(interviewTime).toISOString()
              : undefined,
            interview_mode: interviewMode,
            interview_meeting_link: interviewMeetingLink.trim() || undefined,
          }
        : undefined;

      const { data, error } = await updateSubmissionStatus(
        submission.id,
        status,
        notes.trim() || undefined,
        interviewDetails
      );

      if (error) {
        toast.error("Failed to update status", { description: error });
      } else if (data) {
        toast.success("Submission Status Updated!", {
          description: `${data.company_name} status moved to ${status.replace(/_/g, " ")}.`,
        });
        onSuccess?.(data);
        onOpenChange(false);
      }
    } catch {
      toast.error("An error occurred updating the status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Quick Pipeline Transition
            </Badge>
          </div>
          <DialogTitle className="text-lg font-bold">
            Update Submission Stage
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {submission.company_name} — {submission.job_title} (
            {submission.candidate?.full_name || "Tarun Pothukuri"})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="quick-status" className="text-xs font-medium">
              New Status Stage
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as SubmissionStatus)}
            >
              <SelectTrigger id="quick-status" className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isInterview && (
            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 space-y-3">
              <div className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300">
                <CalendarIcon className="size-3.5" />
                Interview Details
              </div>

              <div className="space-y-1">
                <Label htmlFor="quick-time" className="text-[11px]">
                  Date & Time
                </Label>
                <Input
                  id="quick-time"
                  type="datetime-local"
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="quick-mode" className="text-[11px]">
                    Platform
                  </Label>
                  <Select
                    value={interviewMode}
                    onValueChange={(val) => setInterviewMode(val ?? "Zoom")}
                  >
                    <SelectTrigger id="quick-mode" className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVIEW_MODES.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="quick-link" className="text-[11px]">
                    Meeting Link
                  </Label>
                  <Input
                    id="quick-link"
                    placeholder="https://zoom.us/..."
                    value={interviewMeetingLink}
                    onChange={(e) => setInterviewMeetingLink(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="quick-notes" className="text-xs font-medium">
              Update Notes / Recruiter Log
            </Label>
            <Textarea
              id="quick-notes"
              placeholder="e.g. Candidate confirmed slot, sent prep questions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-xs bg-background"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              {loading ? "Saving..." : "Save Status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
