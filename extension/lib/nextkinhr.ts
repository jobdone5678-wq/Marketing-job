import { browser } from "wxt/browser";
import type { CapturedJob } from "./protocol";

export const NEXTKIN_ORIGIN = new URL(
  import.meta.env.WXT_NEXTKINHR_ORIGIN ?? "https://www.nextkinhr.com",
).origin;
export const CONNECTED_PATH = "/auth/jobseeker/connected";
export const SESSION_KEY = `nextkinhr.session:${NEXTKIN_ORIGIN}`;
export const CONNECTION_KEY = "nextkinhr.connection";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface NextKinSession {
  token: string;
  userId: string;
}

export interface NextKinConnection {
  tabId: number;
  expiresAt: number;
  error?: string;
}

export interface Candidate {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  current_city?: string;
  current_state?: string;
  preferred_locations?: string;
  linkedin_url?: string;
  expected_salary?: string;
  notice_period?: string;
  need_sponsorship_future?: boolean;
  open_to_relocation?: boolean;
}

export const getSession = async () =>
  ((await browser.storage.local.get(SESSION_KEY))[SESSION_KEY] as NextKinSession | undefined) ??
  null;

export class NextKinError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token: string, body?: object): Promise<T> {
  const response = await fetch(`${NEXTKIN_ORIGIN}/api${path}`, {
    method: body ? "POST" : "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    ...(path === "/webhooks/application-submitted" && { signal: AbortSignal.timeout(8000) }),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) {
    throw new NextKinError(
      data?.error || "NextKinHR could not complete the request.",
      response.status,
    );
  }
  return data;
}

export const readCandidate = (token: string) =>
  request<{ actorId: string; ownCandidateId: string | null; candidates: Candidate[] }>(
    "/extension/candidates?savedOnly=true",
    token,
  );

type DraftTask = {
  taskId: string;
  sessionId: string;
  scopeKey: string;
  status: string;
  answers: Record<string, string>;
};

export async function draftScreeningAnswers(
  job: CapturedJob,
  token: string,
  candidateId: string,
  questions: { id: string; label: string; type: "textarea" }[],
) {
  if (job.description.length < 40)
    throw new Error("Open a posting with the full job description to draft answers.");
  const sessionId = crypto.randomUUID();
  const initial = await request<DraftTask>("/extension/answer-drafts", token, {
    version: 2,
    consent: true,
    requestId: crypto.randomUUID(),
    sessionId,
    candidateId,
    questions,
    jobTitle: job.title,
    companyName: job.company,
    jobDescription: job.description,
    jobUrl: job.jobUrl,
  });
  let task = initial;
  const deadline = Date.now() + 75_000;
  while (task.sessionId === sessionId && task.scopeKey === initial.scopeKey) {
    if (task.status === "succeeded") return task.answers;
    if (Date.now() >= deadline || !["queued", "running"].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    task = await request<DraftTask>(
      "/extension/answer-drafts?taskId=" + encodeURIComponent(initial.taskId),
      token,
    );
  }
  throw new Error("The screening drafts are not ready. Try again in a moment.");
}

export async function scoreResume(job: CapturedJob, token: string, candidateId?: string) {
  if (job.description.length < 30)
    throw new Error("Open the full job description to check your ATS score.");
  const { documents } = await request<{ documents: { id: string; candidate_id: string | null }[] }>(
    "/extension/resume",
    token,
  );
  const document =
    documents.find(({ candidate_id }) => candidate_id === candidateId) ??
    documents.find(({ candidate_id }) => candidate_id === null);
  if (!document && !candidateId)
    throw new Error("Upload a resume to NextKinHR to check your ATS score.");
  return request<{ score: number | null }>("/extension/resume-match", token, {
    jobDescription: job.description,
    ...(document ? { documentId: document.id } : { candidateId }),
  });
}

export const saveJob = (job: CapturedJob, token: string) =>
  request("/extension/save-external-job", token, job);

export function trackJob(
  job: CapturedJob,
  token: string,
  candidateId: string | undefined,
  eventKey: string,
  confirmation?: { url: string; evidence: string },
) {
  return request(confirmation ? "/webhooks/application-submitted" : "/extension/auto-submit", token, {
    candidateId,
    eventKey,
    jobUrl: job.jobUrl,
    jobTitle: job.title,
    companyName: job.company,
    jobDescription: job.description,
    evidence: confirmation?.evidence ?? "Application submitted",
    ...(confirmation ? { confirmationUrl: confirmation.url } : { manualAttestation: true }),
  });
}
