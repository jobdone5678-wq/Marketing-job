export type CaptureStatus = 'started' | 'in_progress' | 'submit_attempted' | 'submitted' | 'confirmed' | 'failed';
export type ReceiptDisposition = 'auto_confirm' | 'needs_review' | 'ignored';

export interface ReceivedEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  receivedAt: string;
  source: 'connected_mailbox' | 'manual_import';
  direction?: 'received' | 'sent';
  senderAuthenticated?: boolean;
  senderAllowed?: boolean;
}

export interface CandidateIdentity { id: string; full_name: string; email?: string | null }
export interface ApplicationIdentity {
  id: string; candidate_id: string; company_name: string; job_title: string;
  status?: string; submission_date?: string;
}
export interface ReceiptAnalysis {
  disposition: ReceiptDisposition;
  candidateId: string | null;
  submissionId: string | null;
  company: string | null;
  jobTitle: string | null;
  reason: string;
}

export interface EmailReceiptRecord {
  id: string; subject: string; sender: string; received_at: string; body_text: string;
  disposition: 'needs_review' | 'confirmed' | 'dismissed';
  source: 'connected_mailbox' | 'manual_import';
  extracted_company: string | null; extracted_job_title: string | null;
  candidate_id: string | null; submission_id: string | null; review_reason: string;
  reviewed_at: string | null; created_at: string;
}

export interface EmailConnectionSummary {
  id: string; provider: 'gmail'; mailbox_email: string;
  status: 'connected' | 'reconnect_required' | 'disconnected';
  last_synced_at: string | null; last_error: string | null; sender_domains: string[];
}
