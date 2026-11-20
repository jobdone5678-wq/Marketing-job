'use client';


interface JobDiscussionTabProps {
  jobTitle: string;
  companyName: string;
}

export function JobDiscussionTab({ jobTitle, companyName }: JobDiscussionTabProps) {
  return (
    <div className="space-y-6 pt-2 text-sm text-neutral-700 dark:text-neutral-300">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
          Interview Preparation & Community Notes
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Tips compiled for candidates applying to {jobTitle} at {companyName}.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-700 dark:bg-neutral-800">
            <p className="font-semibold text-neutral-800 dark:text-neutral-200">
              💡 Architecture & Leadership
            </p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              Expect questions on scaling microservices, team topology, and handling cross-functional
              alignment between engineering and product managers.
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-700 dark:bg-neutral-800">
            <p className="font-semibold text-neutral-800 dark:text-neutral-200">
              💡 Domain Knowledge
            </p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              Familiarity with compliance, high availability, and e-commerce platforms is a strong
              positive signal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

