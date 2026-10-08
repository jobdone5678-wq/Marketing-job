import { createClient } from "@/lib/client";
import type {
  JobSubmission,
  JobSubmissionFormData,
  SubmissionStatus,
} from "@/types/database";

export const SAMPLE_SUBMISSIONS: JobSubmission[] = [
  {
    id: "sub-demo-1",
    candidate_id: "cand-demo-tarun",
    submission_date: "2026-10-05",
    company_name: "Cloudflare",
    job_title: "Senior Data Engineer (Distributed Systems)",
    job_url: "https://boards.greenhouse.io/cloudflare",
    portal_source: "Greenhouse",
    job_location: "Austin, TX (Remote)",
    vendor_company: "TEKsystems Inc.",
    vendor_contact_name: "Sarah Jenkins",
    vendor_contact_email: "sjenkins@teksystems.com",
    vendor_contact_phone: "415-555-0192",
    submitted_rate: "$68/hr C2C",
    client_pay_rate: "$85/hr",
    status: "Round_1",
    interview_time: "2026-10-10T14:30:00Z",
    interview_mode: "Zoom",
    interview_meeting_link: "https://cloudflare.zoom.us/j/9876543210",
    notes: "Client loved Spark & Snowflake background. Round 1 coding round with Engineering Lead.",
    duplicate_flag: false,
    created_at: "2026-10-05T09:30:00Z",
    updated_at: "2026-10-06T15:20:00Z",
    candidate: {
      id: "cand-demo-tarun",
      full_name: "Tarun Pothukuri",
      email: "tarunreddyp007@gmail.com",
      phone: "3143575705",
      visa_status: "STEM [EAD]",
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      target_job_titles: "Data Engineer",
      primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
      is_active_bench: true,
      open_to_relocation: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  },
  {
    id: "sub-demo-2",
    candidate_id: "cand-demo-tarun",
    submission_date: "2026-10-04",
    company_name: "Capital One",
    job_title: "Data Engineer - Enterprise Cloud Analytics",
    job_url: "https://capitalone.wd1.myworkdayjobs.com",
    portal_source: "Direct",
    job_location: "McLean, VA / Remote",
    vendor_company: "Apex Systems",
    vendor_contact_name: "Michael Vance",
    vendor_contact_email: "mvance@apexsystems.com",
    vendor_contact_phone: "804-555-0144",
    submitted_rate: "$65/hr C2C",
    client_pay_rate: "$80/hr",
    status: "Submitted_to_Client",
    notes: "Submitted via Prime Vendor. Waiting for manager review.",
    duplicate_flag: false,
    created_at: "2026-10-04T11:15:00Z",
    updated_at: "2026-10-05T10:00:00Z",
    candidate: {
      id: "cand-demo-tarun",
      full_name: "Tarun Pothukuri",
      email: "tarunreddyp007@gmail.com",
      phone: "3143575705",
      visa_status: "STEM [EAD]",
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      target_job_titles: "Data Engineer",
      primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
      is_active_bench: true,
      open_to_relocation: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  },
  {
    id: "sub-demo-3",
    candidate_id: "cand-demo-tarun",
    submission_date: "2026-10-03",
    company_name: "Stripe",
    job_title: "Infrastructure Data Engineer",
    job_url: "https://boards.greenhouse.io/stripe",
    portal_source: "Greenhouse",
    job_location: "San Francisco, CA / Remote",
    vendor_company: "Insight Global",
    vendor_contact_name: "Jessica Miller",
    vendor_contact_email: "jessica.m@insightglobal.com",
    vendor_contact_phone: "212-555-0188",
    submitted_rate: "$70/hr C2C",
    client_pay_rate: "$90/hr",
    status: "Vendor_Screening",
    notes: "Passed recruiter phone screen. Vendor submitted RTR (Right to Represent).",
    duplicate_flag: false,
    created_at: "2026-10-03T14:40:00Z",
    updated_at: "2026-10-03T16:00:00Z",
    candidate: {
      id: "cand-demo-tarun",
      full_name: "Tarun Pothukuri",
      email: "tarunreddyp007@gmail.com",
      phone: "3143575705",
      visa_status: "STEM [EAD]",
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      target_job_titles: "Data Engineer",
      primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
      is_active_bench: true,
      open_to_relocation: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  },
  {
    id: "sub-demo-4",
    candidate_id: "cand-demo-tarun",
    submission_date: "2026-09-28",
    company_name: "Snowflake Inc.",
    job_title: "Data Pipeline & ETL Engineer",
    job_url: "https://jobs.ashbyhq.com/snowflake",
    portal_source: "Ashby",
    job_location: "San Mateo, CA / Remote",
    vendor_company: "Randstad Technologies",
    vendor_contact_name: "David Kim",
    vendor_contact_email: "david.kim@randstadusa.com",
    vendor_contact_phone: "408-555-0177",
    submitted_rate: "$75/hr C2C",
    client_pay_rate: "$95/hr",
    status: "Offer_Received",
    interview_time: "2026-10-02T16:00:00Z",
    interview_mode: "Google Meet",
    notes: "Client cleared final loop! Written offer received: $75/hr C2C starting Nov 1.",
    duplicate_flag: false,
    created_at: "2026-09-28T10:00:00Z",
    updated_at: "2026-10-03T18:00:00Z",
    candidate: {
      id: "cand-demo-tarun",
      full_name: "Tarun Pothukuri",
      email: "tarunreddyp007@gmail.com",
      phone: "3143575705",
      visa_status: "STEM [EAD]",
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      target_job_titles: "Data Engineer",
      primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
      is_active_bench: true,
      open_to_relocation: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  },
  {
    id: "sub-demo-5",
    candidate_id: "cand-demo-tarun",
    submission_date: "2026-10-06",
    company_name: "Cloudflare",
    job_title: "Data Platform Engineer",
    job_url: "https://boards.greenhouse.io/cloudflare",
    portal_source: "Greenhouse",
    job_location: "Austin, TX",
    vendor_company: "Kforce",
    vendor_contact_name: "Brian Cox",
    vendor_contact_email: "bcox@kforce.com",
    vendor_contact_phone: "512-555-0133",
    submitted_rate: "$65/hr C2C",
    client_pay_rate: "$80/hr",
    status: "Applied",
    notes: "Flagged: Candidate was already submitted to Cloudflare within the last 30 days via TEKsystems.",
    duplicate_flag: true,
    created_at: "2026-10-06T10:15:00Z",
    updated_at: "2026-10-06T10:15:00Z",
    candidate: {
      id: "cand-demo-tarun",
      full_name: "Tarun Pothukuri",
      email: "tarunreddyp007@gmail.com",
      phone: "3143575705",
      visa_status: "STEM [EAD]",
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      target_job_titles: "Data Engineer",
      primary_skills: "Python, SQL, Apache Spark, AWS, Snowflake, Airflow",
      is_active_bench: true,
      open_to_relocation: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  },
];

// In-memory fallback cache for immediate responsive feedback
let localMemorySubmissions: JobSubmission[] = [...SAMPLE_SUBMISSIONS];

export async function getSubmissions(
  candidateId?: string
): Promise<JobSubmission[]> {
  try {
    const supabase = createClient();
    let query = supabase
      .from("job_submissions")
      .select(`
        *,
        candidate:candidates(*),
        recruiter:profiles(*)
      `)
      .order("submission_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (candidateId) {
      query = query.eq("candidate_id", candidateId);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      return data as JobSubmission[];
    }
  } catch (err) {
    console.warn("Supabase query fallback to local sample data:", err);
  }

  // Fallback to local memory cache
  if (candidateId) {
    return localMemorySubmissions.filter((s) => s.candidate_id === candidateId);
  }
  return localMemorySubmissions;
}

export async function getSubmissionById(id: string): Promise<JobSubmission | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_submissions")
      .select(`
        *,
        candidate:candidates(*),
        recruiter:profiles(*)
      `)
      .eq("id", id)
      .single();

    if (!error && data) {
      return data as JobSubmission;
    }
  } catch (err) {
    console.warn("Supabase getSubmissionById fallback:", err);
  }

  const localItem = localMemorySubmissions.find((s) => s.id === id);
  return localItem || null;
}

export async function createSubmission(
  submissionData: JobSubmissionFormData,
  candidateObj?: any
): Promise<{ data: JobSubmission | null; error: string | null; isDuplicate?: boolean }> {
  // Check for prior submission to same company within last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  let hasDuplicate = false;

  try {
    const supabase = createClient();
    const { data: priorSubmissions } = await supabase
      .from("job_submissions")
      .select("id, company_name, submission_date")
      .eq("candidate_id", submissionData.candidate_id)
      .ilike("company_name", submissionData.company_name.trim())
      .gte("submission_date", thirtyDaysStr);

    hasDuplicate = Boolean(priorSubmissions && priorSubmissions.length > 0);

    const { data, error } = await supabase
      .from("job_submissions")
      .insert([
        {
          ...submissionData,
          duplicate_flag: hasDuplicate,
        },
      ])
      .select(`
        *,
        candidate:candidates(*),
        recruiter:profiles(*)
      `)
      .single();

    if (!error && data) {
      const createdItem = data as JobSubmission;
      localMemorySubmissions.unshift(createdItem);
      return {
        data: createdItem,
        error: null,
        isDuplicate: hasDuplicate,
      };
    }
  } catch (err) {
    console.warn("Supabase insert fallback:", err);
  }

  // Local fallback creation
  const priorLocal = localMemorySubmissions.find(
    (s) =>
      s.candidate_id === submissionData.candidate_id &&
      s.company_name.toLowerCase().trim() === submissionData.company_name.toLowerCase().trim() &&
      s.submission_date >= thirtyDaysStr
  );
  hasDuplicate = Boolean(priorLocal);

  const fallbackItem: JobSubmission = {
    ...submissionData,
    id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    duplicate_flag: hasDuplicate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    candidate: candidateObj || {
      id: submissionData.candidate_id,
      full_name: "Tarun Pothukuri",
      visa_status: "STEM [EAD]",
      target_job_titles: "Data Engineer",
      is_active_bench: true,
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      open_to_relocation: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  localMemorySubmissions.unshift(fallbackItem);

  return {
    data: fallbackItem,
    error: null,
    isDuplicate: hasDuplicate,
  };
}

export async function updateSubmission(
  id: string,
  updates: Partial<JobSubmissionFormData>
): Promise<{ data: JobSubmission | null; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_submissions")
      .update(updates)
      .eq("id", id)
      .select(`
        *,
        candidate:candidates(*),
        recruiter:profiles(*)
      `)
      .single();

    if (!error && data) {
      const updated = data as JobSubmission;
      localMemorySubmissions = localMemorySubmissions.map((s) => (s.id === id ? updated : s));
      return { data: updated, error: null };
    }
  } catch (err) {
    console.warn("Supabase update fallback:", err);
  }

  // Update in local memory
  const idx = localMemorySubmissions.findIndex((s) => s.id === id);
  if (idx !== -1) {
    localMemorySubmissions[idx] = {
      ...localMemorySubmissions[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return { data: localMemorySubmissions[idx], error: null };
  }

  return { data: null, error: "Submission not found" };
}

export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  notes?: string,
  interviewDetails?: {
    interview_time?: string;
    interview_mode?: string;
    interview_meeting_link?: string;
  }
): Promise<{ data: JobSubmission | null; error: string | null }> {
  const payload: Record<string, any> = { status };
  if (notes !== undefined) payload.notes = notes;
  if (interviewDetails?.interview_time !== undefined) payload.interview_time = interviewDetails.interview_time;
  if (interviewDetails?.interview_mode !== undefined) payload.interview_mode = interviewDetails.interview_mode;
  if (interviewDetails?.interview_meeting_link !== undefined) payload.interview_meeting_link = interviewDetails.interview_meeting_link;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_submissions")
      .update(payload)
      .eq("id", id)
      .select(`
        *,
        candidate:candidates(*),
        recruiter:profiles(*)
      `)
      .single();

    if (!error && data) {
      const updated = data as JobSubmission;
      localMemorySubmissions = localMemorySubmissions.map((s) => (s.id === id ? updated : s));
      return { data: updated, error: null };
    }
  } catch (err) {
    console.warn("Supabase updateStatus fallback:", err);
  }

  const idx = localMemorySubmissions.findIndex((s) => s.id === id);
  if (idx !== -1) {
    localMemorySubmissions[idx] = {
      ...localMemorySubmissions[idx],
      ...payload,
      updated_at: new Date().toISOString(),
    };
    return { data: localMemorySubmissions[idx], error: null };
  }

  return { data: null, error: "Submission not found" };
}

export async function deleteSubmission(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("job_submissions").delete().eq("id", id);
    if (!error) {
      localMemorySubmissions = localMemorySubmissions.filter((s) => s.id !== id);
      return { success: true, error: null };
    }
  } catch (err) {
    console.warn("Supabase delete fallback:", err);
  }

  localMemorySubmissions = localMemorySubmissions.filter((s) => s.id !== id);
  return { success: true, error: null };
}

export async function checkDuplicate(
  candidateId: string,
  companyName: string
): Promise<boolean> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("job_submissions")
      .select("id")
      .eq("candidate_id", candidateId)
      .ilike("company_name", companyName.trim())
      .gte("submission_date", thirtyDaysStr);

    if (data && data.length > 0) return true;
  } catch (err) {
    console.warn("Duplicate check fallback:", err);
  }

  const localMatch = localMemorySubmissions.some(
    (s) =>
      s.candidate_id === candidateId &&
      s.company_name.toLowerCase().trim() === companyName.toLowerCase().trim() &&
      s.submission_date >= thirtyDaysStr
  );
  return localMatch;
}
