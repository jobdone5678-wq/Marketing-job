'use client';

import Link from 'next/link';
import { CompanyLogo } from '@/components/company-logo';
import { JobSkillChip } from './JobSkillChip';
import type { Job } from '@/lib/jobs/nextkinhr-types';

interface JobDescriptionTabProps {
  job: Job;
  skillsList: string[];
  companyName: string;
  domainsDisplay: string;
  similarJobs: Job[];
  jobBasePath: string;
  onClaimSkill: (skill: string) => void;
  onAvoidSkill: (skill: string) => void;
}

export function JobDescriptionTab({
  job,
  skillsList,
  companyName,
  domainsDisplay,
  similarJobs,
  jobBasePath,
  onClaimSkill,
  onAvoidSkill,
}: JobDescriptionTabProps) {
  return (
    <div className="space-y-6 pt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
      {/* Summary Heading & Text */}
      {job.enrichment?.summary && (
        <div className="space-y-2">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Summary
          </h2>
          <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">
            {job.enrichment.summary}
          </p>
        </div>
      )}

      {/* Full Job Description HTML or fallback structured copy */}
      {job.description ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-neutral-600 dark:text-neutral-300"
          dangerouslySetInnerHTML={{ __html: job.description }}
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              About {companyName}:
            </h2>
            <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">
              {companyName} is leading innovation in {domainsDisplay}. We strive to create a collaborative and inclusive work environment where every employee is empowered to make a meaningful difference.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              About the role:
            </h2>
            <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">
              As an Engineering Manager (m/f/d), you will lead cross-functional engineering initiatives, drive high-quality software architecture, and collaborate with product teams to build scalable solutions.
            </p>
          </div>
        </div>
      )}

      {/* Additional Information / Benefits (Screenshot 3) */}
      <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Additional Information
        </h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            About your benefits:
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            In order to provide our employees with the best possible support for their individual needs, we offer a wide range of benefits:
          </p>

          <ul className="list-disc space-y-2 pl-5 text-xs text-neutral-600 dark:text-neutral-300">
            <li>
              <strong className="text-neutral-800 dark:text-neutral-200">Sports:</strong> Stay healthy. Profit from a membership (M) package at Urban Sports Club, so that you can take advantage of a huge variety of sport offers.
            </li>
            <li>
              <strong className="text-neutral-800 dark:text-neutral-200">Mental Health:</strong> Get quick and professional help from psychologists of Likeminded if you feel overwhelmed in private or professional life. Anonymous and free of charge.
            </li>
            <li>
              <strong className="text-neutral-800 dark:text-neutral-200">Work from Home:</strong> If your job does not require you to be present in the office, we can arrange the place you work from individually - even for up to 20 days a year anywhere in the EU.
            </li>
            <li>
              <strong className="text-neutral-800 dark:text-neutral-200">Mobility:</strong> We provide our employees with a fully costed Deutschland Ticket which can be used at any time. Click here to learn more.
            </li>
            <li>
              <strong className="text-neutral-800 dark:text-neutral-200">Personal Development:</strong> Grow! We support and encourage your individual development through various in- and external trainings.
            </li>
            <li>
              And many more :)
            </li>
          </ul>
        </div>
      </div>

      {/* INTERACTIVE SKILL CHIPS (Screenshot 3 & NextKinHR SkillChip.svelte pattern) */}
      {skillsList.length > 0 && (
        <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Skills
          </h2>

          <div className="flex flex-wrap gap-2">
            {skillsList.map((skill) => (
              <JobSkillChip
                key={skill}
                skill={skill}
                jobBasePath={jobBasePath}
                onClaimSkill={onClaimSkill}
                onAvoidSkill={onAvoidSkill}
              />
            ))}
          </div>
        </div>
      )}

      {/* Similar Jobs (See also) */}
      {similarJobs.length > 0 && (
        <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Similar live openings
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {similarJobs.slice(0, 4).map((simJob) => (
              <Link
                key={simJob.public_slug}
                href={`${jobBasePath}/${encodeURIComponent(simJob.public_slug)}`}
                className="group flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-2xs transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <CompanyLogo company={simJob.company} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="text-[11px] text-neutral-500">
                    {[simJob.company, simJob.location].filter(Boolean).join(' · ')}
                  </span>
                  <span className="truncate text-xs font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-neutral-100 dark:group-hover:text-blue-400">
                    {simJob.title}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

