import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { notifyApplicationSaved, readApplication, watchApplication } from "../../lib/applicationSync";
import { planLabelFills } from "../../lib/fillPlan";
import { normalizeLabel } from "../../lib/fieldKeys";
import {
  CONNECTION_KEY,
  NEXTKIN_ORIGIN,
  SESSION_KEY,
  NextKinError,
  getSession,
  draftScreeningAnswers,
  readCandidate,
  saveJob,
  scoreResume,
  trackJob,
  type Candidate,
  type NextKinConnection,
  type NextKinSession,
} from "../../lib/nextkinhr";
import type { CapturedJob, FramedField, LabelFill, RuntimeMessage } from "../../lib/protocol";

const buttonClass =
  "rounded-md border border-border px-3 py-2 text-sm font-medium hover:opacity-75 disabled:opacity-50";

type TabTarget = { tabId: number; pageUrl: string };
type ScreeningDraft = { question: string; fill: LabelFill };
const privateQuestion =
  /\b(age|birth|demographics?|disability|disabled|gender|ethnicity|ethnic|race|veteran|neurodivergent|religion|pronouns?|citizenship|passport|salary|compensation|consent|signature)\b/i;

function locationValue(field: FramedField, candidate: Candidate): string {
  const label = normalizeLabel(field.label);
  if (
    /^(which country do you intend to work from|where (?:would you like|do you intend) to work|preferred (?:work )?location)\b/.test(
      label,
    )
  ) {
    const location = candidate.preferred_locations?.trim() ?? "";
    return /[;|\n/]|,.*,/u.test(location) ? "" : location;
  }
  if (
    /^(location|current location|city and state|where (?:are you based|do you(?: currently)? live))[\s?.:]*$/.test(
      label,
    )
  ) {
    return [candidate.current_city, candidate.current_state].filter(Boolean).join(", ");
  }
  return "";
}

async function readApplicationForm(target: TabTarget) {
  const form = (await browser.runtime.sendMessage({
    kind: "GET_FRAMED_FORM",
    ...target,
  } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
  if (form?.kind !== "FRAMED_FORM" || !form.fields.length) {
    throw new Error(
      "Open the application form. If it is already open, reload the tab and try again.",
    );
  }
  const [upload] = form.uploads;
  if (
    !upload ||
    form.uploads.some((other) => other.frame !== upload.frame || other.form !== upload.form)
  ) {
    throw new Error("Open a single application form with a resume upload.");
  }
  return form.fields.filter(({ frame, form }) => frame === upload.frame && form === upload.form);
}

function candidateValues(candidate: Candidate): Record<string, string> {
  const fullName = candidate.full_name?.trim() ?? "";
  const [firstName = "", ...lastName] = fullName.split(/\s+/);
  const yesNo = (value?: boolean) => (value == null ? "" : value ? "Yes" : "No");
  return {
    fullName,
    firstName,
    lastName: lastName.join(" "),
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    city: candidate.current_city ?? "",
    state: candidate.current_state ?? "",
    linkedin: candidate.linkedin_url ?? "",
    desiredSalary: candidate.expected_salary ?? "",
    noticePeriod: candidate.notice_period ?? "",
    visaSponsorshipNeeded: yesNo(candidate.need_sponsorship_future),
    willingToRelocate: yesNo(candidate.open_to_relocation),
  };
}

export default function NextKinActions() {
  const [session, setSession] = useState<NextKinSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    target: TabTarget;
    userId: string;
    job: CapturedJob;
    drafts: ScreeningDraft[];
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    async function restore() {
      const version = ++generation;
      try {
        const stored = await getSession();
        const account = stored ? await readCandidate(stored.token) : null;
        if (!mounted || version !== generation) return;
        setSession(account?.actorId === stored?.userId ? stored : null);
        setError(
          stored && account?.actorId !== stored.userId
            ? "Connect your NextKinHR account again."
            : "",
        );
      } catch (err) {
        if (!mounted || version !== generation) return;
        setSession(null);
        setError(
          err instanceof NextKinError && [401, 403].includes(err.status)
            ? "Your NextKinHR session ended. Connect again."
            : "Could not verify your NextKinHR connection.",
        );
      } finally {
        if (mounted && version === generation) setLoading(false);
      }
    }

    async function showTrackingStatus() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return;
      const [stored, pending] = await Promise.all([getSession(), readApplication(tab.id)]);
      if (!mounted || !pending || pending.userId !== stored?.userId) return;
      if (pending.state === "synced") setNotice("Application synced to NextKinHR.");
      if (pending.state === "failed")
        setError("Could not sync the confirmation. Open the job posting and use Mark as applied.");
    }

    const onStorage: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes) => {
      if (changes[SESSION_KEY]) void restore();
      const connection = changes[CONNECTION_KEY];
      const pending = connection?.newValue as NextKinConnection | undefined;
      if (pending?.error) {
        setNotice("");
        setError(pending.error);
      } else if (connection && !pending) {
        setNotice("");
      }
      if (Object.keys(changes).some((key) => key.startsWith("application:")))
        void showTrackingStatus().catch(() => {});
    };

    browser.storage.onChanged.addListener(onStorage);
    void restore();
    void showTrackingStatus().catch(() => {});
    return () => {
      mounted = false;
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = (await browser.runtime.sendMessage({
        kind: "CONNECT_NEXTKINHR",
      } satisfies RuntimeMessage)) as { error?: string } | undefined;
      if (!result || result.error)
        throw new Error(result?.error ?? "Reload the extension and try again.");
      setNotice("Complete sign-in in the NextKinHR tab.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open NextKinHR sign-in.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "fill" | "draft" | "score" | "save" | "applied") {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url)) {
        throw new Error("Open a job posting or application form first.");
      }
      const target = { tabId: tab.id, pageUrl: tab.url };
      const { candidates, ownCandidateId } = await readCandidate(session.token);
      const candidate = candidates.find(({ id }) => id === ownCandidateId);
      const readJob = async () => {
        const reply = (await browser.runtime.sendMessage({
          kind: "GET_CAPTURED_JOB",
          ...target,
        } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
        return reply?.kind === "CAPTURED_JOB" ? reply.job : null;
      };

      if (action === "fill" || action === "draft") {
        if (!candidate)
          throw new Error("Save and confirm your candidate profile in NextKinHR first.");
        const form = await readApplicationForm(target);
        const fields = form.filter(({ value }) => !value.trim());
        const job = await readJob().catch(() => null);
        if (action === "draft") {
          setReview(null);
          if (!job) throw new Error("Open the full job posting to draft screening answers.");
          const written = fields
            .filter(
              (field) =>
                field.tag === "textarea" &&
                field.label.trim().length >= 12 &&
                field.label.length <= 2000 &&
                !privateQuestion.test(field.label) &&
                form.filter((other) => normalizeLabel(other.label) === normalizeLabel(field.label))
                  .length === 1,
            )
            .sort((a, b) => Number(b.required) - Number(a.required))
            .slice(0, 30);
          if (!written.length) {
            setNotice("No empty written screening questions are available to draft.");
            return;
          }
          setNotice("Looking for relevant evidence in your confirmed NextKinHR profile…");
          const answers = await draftScreeningAnswers(
            job,
            session.token,
            candidate.id,
            written.map((field) => ({
              id: String(field.index),
              label: field.label,
              type: "textarea",
            })),
          );
          const drafts = written.flatMap((field) => {
            const value = answers[String(field.index)]?.trim();
            return value
              ? [
                  {
                    question: field.label,
                    fill: {
                      label: field.label,
                      frame: field.frame,
                      form: field.form,
                      value,
                      onlyEmpty: true,
                    },
                  },
                ]
              : [];
          });
          if (drafts.length) setReview({ target, userId: session.userId, job, drafts });
          setNotice(
            drafts.length === written.length
              ? "Review and edit the drafts before inserting them."
              : "Questions without enough confirmed evidence need your own answer. Review any drafts before inserting them.",
          );
          return;
        }
        const fills = planLabelFills(
          fields.filter((field) => !field.combo && !locationValue(field, candidate)),
          candidateValues(candidate),
        ).map((fill) => ({
          ...fill,
          onlyEmpty: true,
        }));
        for (const field of fields.filter((item) => !item.combo)) {
          const value = locationValue(field, candidate);
          if (value)
            fills.push({
              label: field.label,
              frame: field.frame,
              form: field.form,
              value,
              onlyEmpty: true,
            });
        }
        if (job) await watchApplication(tab.id, job, session.userId, candidate.id);
        const reply = fills.length
          ? ((await browser.runtime.sendMessage({
              kind: "FILL_BY_LABEL",
              ...target,
              fills,
            } satisfies RuntimeMessage)) as RuntimeMessage | undefined)
          : undefined;
        let filled =
          reply?.kind === "FILL_OUTCOMES"
            ? reply.outcomes.filter(({ status }) => status === "filled").length
            : 0;
        for (const field of fields.filter((item) => item.combo)) {
          const value = locationValue(field, candidate);
          if (!value) continue;
          const result = (await browser.runtime.sendMessage({
            kind: "FILL_LOCATION",
            ...target,
            target: { label: field.label, frame: field.frame, form: field.form, value },
          } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
          if (result?.kind === "LOCATION_FILLED" && result.filled) filled++;
        }
        setNotice(
          filled
            ? "Filled " +
                filled +
                (filled === 1 ? " field." : " fields.") +
                " Review the form before submitting."
            : "No more fields match your saved profile. Use Draft screening answers for written questions.",
        );
        return;
      }

      const job = await readJob();
      if (!job) throw new Error("Open the full job posting and try again.");

      if (action === "score") {
        const { score } = await scoreResume(job, session.token, candidate?.id);
        setNotice(
          score == null
            ? "The job description has no scorable requirements."
            : "ATS match score " + score + " / 100",
        );
      } else if (action === "save") {
        await saveJob(job, session.token);
        setNotice("Job saved to NextKinHR.");
      } else {
        if (!candidate)
          throw new Error(
            "Save and confirm your candidate profile in NextKinHR before tracking applications.",
          );
        const pending = await readApplication(tab.id);
        const eventKey =
          pending?.userId === session.userId &&
          pending.candidateId === candidate.id &&
          pending.job.jobUrl === job.jobUrl
            ? pending.eventKey
            : crypto.randomUUID();
        if (pending?.eventKey !== eventKey || pending.state !== "synced") {
          await trackJob(job, session.token, candidate.id, eventKey);
          await notifyApplicationSaved().catch(() => {});
        }
        setNotice("Application marked as applied in NextKinHR.");
      }
    } catch (err) {
      setNotice("");
      if (err instanceof NextKinError && [401, 403].includes(err.status)) {
        setSession(null);
        setError("Your NextKinHR session ended. Connect again.");
      } else {
        setError(err instanceof Error ? err.message : "The action could not be completed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function insertDraft(draft: ScreeningDraft) {
    if (!review || review.userId !== session?.userId || !draft.fill.value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== review.target.tabId || tab.url !== review.target.pageUrl) {
        throw new Error("Return to the original application to insert this draft.");
      }
      const currentJob = (await browser.runtime.sendMessage({
        kind: "GET_CAPTURED_JOB",
        ...review.target,
      } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
      if (currentJob?.kind !== "CAPTURED_JOB" || currentJob.job?.jobUrl !== review.job.jobUrl) {
        throw new Error("The job posting changed. Draft answers for the current application.");
      }
      const form = await readApplicationForm(review.target);
      const matched = form.filter(
        (field) =>
          field.frame === draft.fill.frame &&
          field.form === draft.fill.form &&
          normalizeLabel(field.label) === normalizeLabel(draft.fill.label),
      );
      if (matched.length !== 1 || matched[0]?.tag !== "textarea" || matched[0].value.trim()) {
        throw new Error(
          "The question moved or already has an answer. Review the application before inserting.",
        );
      }
      const reply = (await browser.runtime.sendMessage({
        kind: "FILL_BY_LABEL",
        ...review.target,
        fills: [draft.fill],
      } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
      if (reply?.kind !== "FILL_OUTCOMES" || reply.outcomes[0]?.status !== "filled") {
        throw new Error("The draft could not be inserted. Enter it directly in the application.");
      }
      setReview({ ...review, drafts: review.drafts.filter((item) => item !== draft) });
      setNotice("Draft inserted. Review it in the application before submitting.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be inserted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {session ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="NextKinHR tools">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => act("fill")}
            >
              Autofill application
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => act("draft")}
              title="Use AI with your confirmed NextKinHR profile and the current job posting"
            >
              Draft screening answers with AI
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => act("score")}
            >
              Check ATS score
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => act("save")}
            >
              Save job
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => act("applied")}
            >
              Mark as applied
            </button>
          </div>
          {review?.userId === session.userId &&
            review.drafts.map((draft) => (
              <div
                key={draft.question}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <label className="flex flex-col gap-2 text-sm">
                  {draft.question}
                  <textarea
                    rows={4}
                    className="rounded-md border border-border p-2"
                    disabled={busy}
                    value={draft.fill.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      setReview({
                        ...review,
                        drafts: review.drafts.map((item) =>
                          item === draft ? { ...item, fill: { ...item.fill, value } } : item,
                        ),
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !draft.fill.value.trim()}
                  onClick={() => insertDraft(draft)}
                >
                  Insert reviewed answer
                </button>
              </div>
            ))}
          <a
            className="text-sm underline"
            href={NEXTKIN_ORIGIN + "/dashboard/submissions"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open application tracker
          </a>
        </>
      ) : (
        <button type="button" className={buttonClass} disabled={loading || busy} onClick={connect}>
          Connect NextKinHR
        </button>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </>
  );
}
