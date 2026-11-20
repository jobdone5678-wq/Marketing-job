'use client';

import React,{ useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  Clock,
  ArrowRight,
  Bookmark,
  Flag,
} from 'lucide-react';
import type { Job, JobCopy } from '@/lib/jobs/freehire-types';
import { useJobProfileSkills } from '@/hooks/use-job-profile-skills';
import { useJobBookmarks } from '@/hooks/use-job-bookmarks';
import { getJobLink, normalizeJobSkill } from '@/lib/jobs/freehire-display';
import { CompanyLogo } from '@/components/company-logo';
import {
  CATEGORY_LABELS,
  SOURCE_KINDS,
  SOURCE_DISPLAY_NAMES,
  getCountryFlag,
  getCountryName,
  formatRelativeTime,
} from '@/lib/jobs/freehire-formatters';
import { JobPinnedHeader } from '@/components/jobs/detail/JobPinnedHeader';
import { DraftReferralModal } from '@/components/jobs/detail/DraftReferralModal';
import { JobFactsSidebar } from '@/components/jobs/detail/JobFactsSidebar';
import { JobTabNavigation } from '@/components/jobs/detail/JobTabNavigation';
import { JobDescriptionTab } from '@/components/jobs/detail/JobDescriptionTab';
import { JobCompanyTab } from '@/components/jobs/detail/JobCompanyTab';
import { JobDiscussionTab } from '@/components/jobs/detail/JobDiscussionTab';

interface JobDetailClientProps {
  job: Job;
  similarJobs?: Job[];
  copies?: JobCopy[];
}

export function JobDetailClient({ job, similarJobs = [] }: JobDetailClientProps) {
  const pathname = usePathname();
  const { savedJobs, toggleSavedJob } = useJobBookmarks();
  const isSaved = savedJobs.has(job.public_slug);

  const [isSticky, setIsSticky] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'company' | 'discussion'>('description');

  // Interactive Votes (Thumbs Up / Down)
  const [upvotes, setUpvotes] = useState(job.upvote_count || 0);
  const [downvotes, setDownvotes] = useState(job.downvote_count || 0);
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(
    job.my_vote === 1 ? 'up' : job.my_vote === -1 ? 'down' : null
  );

  // Interactive ATS Source Avoidance
  const [avoidedSources, setAvoidedSources] = useState<Set<string>>(new Set());
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  // Interactive Skill Claiming & Avoidance
  const baseProfileSkills = useJobProfileSkills();
  const [claimedSkills, setClaimedSkills] = useState<Set<string>>(new Set());
  const [avoidedSkills, setAvoidedSkills] = useState<Set<string>>(new Set());
  const [openClaimSkill, setOpenClaimSkill] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ type: 'claim' | 'avoid'; skill: string } | null>(null);

  // Draft Referral modal & CV Upload
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [cvUploaded, setCvUploaded] = useState(false);

  const titleRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const jobBasePath = pathname.startsWith('/dashboard') ? '/dashboard/jobs' : '/jobs';

  // Intersection / scroll listener for sticky pinned header
  useEffect(() => {
    const handleScroll = () => {
      if (titleRef.current) {
        const rect = titleRef.current.getBoundingClientRect();
        setIsSticky(rect.bottom < 60);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Canonical Job Skills
  const skillsList = useMemo(() => {
    if (job.skills && job.skills.length > 0) return job.skills;
    if (job.enrichment?.skills && job.enrichment.skills.length > 0) return job.enrichment.skills;
    return [];
  }, [job]);

  const companyName = job.company || 'Company';
  const countryCode = job.countries?.[0];
  const flag = getCountryFlag(countryCode);
  const countryName = countryCode ? getCountryName(countryCode) : null;
  const locationDisplay = job.location || null;
  const postedTime = formatRelativeTime(job.posted_at);
  const updatedTime = formatRelativeTime(job.updated_at || job.created_at);
  const freehireUrl = `https://freehire.me/jobs/${encodeURIComponent(job.public_slug)}`;
  const applyUrl = getJobLink(job.url);
  const applicationHref = applyUrl || freehireUrl;
  const category = job.enrichment?.category;
  const categoryDisplay = category ? CATEGORY_LABELS[category] || category.replace(/_/g, ' ') : 'Software Engineering';

  const workFormat =
    job.work_mode === 'remote'
      ? 'Remote'
      : job.work_mode === 'hybrid'
        ? 'Hybrid'
        : job.work_mode === 'onsite'
          ? 'Onsite'
          : job.enrichment?.work_mode
            ? job.enrichment.work_mode.charAt(0).toUpperCase() + job.enrichment.work_mode.slice(1)
            : 'Remote';

  const companyType =
    job.enrichment?.company_type
      ? job.enrichment.company_type.charAt(0).toUpperCase() + job.enrichment.company_type.slice(1)
      : 'Product';

  const domainsDisplay =
    job.enrichment?.domains && job.enrichment.domains.length > 0
      ? job.enrichment.domains
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1).replace(/_/g, ' '))
          .join(', ')
      : 'Healthcare, E-commerce';

  const regionDisplay = job.regions?.[0]
    ? job.regions[0].charAt(0).toUpperCase() + job.regions[0].slice(1).replace(/_/g, ' ')
    : 'Europe';

  const rawSource = (job.source || 'linkedin').toLowerCase();
  const sourceName =
    SOURCE_DISPLAY_NAMES[rawSource] ||
    (rawSource === 'linkedin' ? 'LinkedIn' : rawSource.charAt(0).toUpperCase() + rawSource.slice(1));
  const sourceKind = SOURCE_KINDS[rawSource] || 'aggregator';
  const sourceKindLabel = sourceKind === 'ats' ? 'ATS' : 'Aggregator';
  const isSourceAvoided = avoidedSources.has(rawSource);

  // Interactive Skill Calculations (Matched, Adjacent, Missing)
  const { matchedSkills, adjacentSkills, missingSkills, matchPercentage, totalSkillsCount } = useMemo(() => {
    const activeCandidateSkills = new Set([
      ...baseProfileSkills.map(normalizeJobSkill),
      ...Array.from(claimedSkills).map(normalizeJobSkill),
    ]);

    if (cvUploaded && activeCandidateSkills.size === 0) {
      ['agile', 'automation', 'cloud', 'microservices'].forEach((s) => activeCandidateSkills.add(s));
    }

    const matched: string[] = [];
    const adjacent: { name: string; via: string }[] = [];
    const missing: string[] = [];

    skillsList.forEach((skill) => {
      const norm = normalizeJobSkill(skill);
      if (activeCandidateSkills.has(norm)) {
        matched.push(skill);
      } else if (
        (norm.includes('cloud') && activeCandidateSkills.has('cloud')) ||
        (norm.includes('react') && activeCandidateSkills.has('javascript')) ||
        (norm.includes('native') && activeCandidateSkills.has('cloud'))
      ) {
        adjacent.push({ name: skill, via: norm.includes('cloud') ? 'Cloud' : 'JavaScript' });
      } else {
        missing.push(skill);
      }
    });

    const total = skillsList.length || 1;
    const exactPct = Math.round((matched.length / total) * 100);
    const adjacentWeight = Math.round(((adjacent.length * 0.5) / total) * 100);
    const calculatedPct = Math.min(100, exactPct + adjacentWeight);

    return {
      matchedSkills: matched,
      adjacentSkills: adjacent,
      missingSkills: missing,
      matchPercentage: activeCandidateSkills.size > 0 ? calculatedPct : cvUploaded ? 85 : 0,
      totalSkillsCount: skillsList.length,
    };
  }, [skillsList, baseProfileSkills, claimedSkills, cvUploaded]);

  // Skill claim handler
  const handleClaimSkill = useCallback((skill: string) => {
    setClaimedSkills((prev) => new Set([...prev, skill]));
    setAvoidedSkills((prev) => {
      const next = new Set(prev);
      next.delete(skill);
      return next;
    });
    setOpenClaimSkill(null);
    setLastAction({ type: 'claim', skill });
  }, []);

  // Skill avoid handler
  const handleAvoidSkill = useCallback((skill: string) => {
    setAvoidedSkills((prev) => new Set([...prev, skill]));
    setClaimedSkills((prev) => {
      const next = new Set(prev);
      next.delete(skill);
      return next;
    });
    setOpenClaimSkill(null);
    setLastAction({ type: 'avoid', skill });
  }, []);

  const handleStopAvoidingSkill = useCallback((skill: string) => {
    setAvoidedSkills((prev) => {
      const next = new Set(prev);
      next.delete(skill);
      return next;
    });
    setOpenClaimSkill(null);
  }, []);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === 'claim') {
      setClaimedSkills((prev) => {
        const next = new Set(prev);
        next.delete(lastAction.skill);
        return next;
      });
    } else {
      setAvoidedSkills((prev) => {
        const next = new Set(prev);
        next.delete(lastAction.skill);
        return next;
      });
    }
    setLastAction(null);
  }, [lastAction]);

  // ATS Source avoid toggle
  const toggleAvoidSource = useCallback(() => {
    setAvoidedSources((prev) => {
      const next = new Set(prev);
      if (next.has(rawSource)) {
        next.delete(rawSource);
        setSourceNote(`${sourceName} is no longer avoided.`);
      } else {
        next.add(rawSource);
        setSourceNote(`${sourceName} added to sources you avoid.`);
      }
      return next;
    });
    setTimeout(() => setSourceNote(null), 3500);
  }, [rawSource, sourceName]);

  // Interactive Vote Cast
  const castVote = useCallback(
    (dir: 'up' | 'down') => {
      if (userVote === dir) {
        if (dir === 'up') setUpvotes((c) => Math.max(0, c - 1));
        if (dir === 'down') setDownvotes((c) => Math.max(0, c - 1));
        setUserVote(null);
      } else {
        if (userVote === 'up') setUpvotes((c) => Math.max(0, c - 1));
        if (userVote === 'down') setDownvotes((c) => Math.max(0, c - 1));
        if (dir === 'up') setUpvotes((c) => c + 1);
        if (dir === 'down') setDownvotes((c) => c + 1);
        setUserVote(dir);
      }
    },
    [userVote]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCvUploaded(true);
      ['agile', 'automation', 'cloud', 'microservices'].forEach((s) => claimedSkills.add(s));
      setClaimedSkills(new Set(claimedSkills));
    }
  };

  const requirementsList = job.enrichment?.requirements || [
    { text: 'Experience leading multiple engineering teams in a product-oriented environment', priority: 'required' },
    { text: 'Strong track record of creating direction, driving execution, and achieving measurable outcomes', priority: 'required' },
    { text: 'Familiarity with cloud-native architectures, modern software engineering practices, and agile product development', priority: 'required' },
    { text: 'Sufficient technical depth to recognize what good looks like and guide teams towards sound decisions', priority: 'required' },
    { text: 'Experience in e-commerce is a plus', priority: 'preferred' },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleFileUpload}
        className="hidden"
        aria-label="Upload CV file input"
      />

      {/* STICKY SUB-HEADER ON SCROLL (Screenshot 3 / JobPinnedHeader) */}
      <JobPinnedHeader
        isSticky={isSticky}
        companyName={companyName}
        title={job.title}
        isSaved={isSaved}
        applicationHref={applicationHref}
        onToggleSave={() => toggleSavedJob(job.public_slug)}
      />

      {/* DRAFT REFERRAL MODAL */}
      <DraftReferralModal
        isOpen={showReferralModal}
        companyName={companyName}
        jobTitle={job.title}
        onClose={() => setShowReferralModal(false)}
      />

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        {/* LEFT RAIL: JobFactsSidebar (Screenshot 2) */}
        <JobFactsSidebar
          cvUploaded={cvUploaded}
          matchPercentage={matchPercentage}
          matchedSkills={matchedSkills}
          adjacentSkills={adjacentSkills}
          missingSkills={missingSkills}
          totalSkillsCount={totalSkillsCount}
          openClaimSkill={openClaimSkill}
          avoidedSkills={avoidedSkills}
          lastAction={lastAction}
          requirementsList={requirementsList}
          workFormat={workFormat}
          locationDisplay={locationDisplay}
          regionDisplay={regionDisplay}
          categoryDisplay={categoryDisplay}
          countryName={countryName}
          flag={flag}
          companyType={companyType}
          domainsDisplay={domainsDisplay}
          sourceName={sourceName}
          rawSource={rawSource}
          sourceKindLabel={sourceKindLabel}
          isSourceAvoided={isSourceAvoided}
          upvotes={upvotes}
          downvotes={downvotes}
          userVote={userVote}
          sourceNote={sourceNote}
          onUploadClick={() => fileInputRef.current?.click()}
          onToggleClaimRow={(skill) => setOpenClaimSkill((prev) => (prev === skill ? null : skill))}
          onClaimSkill={handleClaimSkill}
          onAvoidSkill={handleAvoidSkill}
          onStopAvoidingSkill={handleStopAvoidingSkill}
          onUndo={handleUndo}
          onToggleAvoidSource={toggleAvoidSource}
          onCastVote={castVote}
        />

        {/* RIGHT COLUMN: Real Job Details (Screenshot 2 & 3) */}
        <section className="flex w-full min-w-0 flex-1 flex-col gap-4">
          {/* Main Job Title Header */}
          <div ref={titleRef} className="flex flex-col gap-3">
            {/* Provenance row: Logo, Company Name, New, Be an early applicant, timestamps */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <CompanyLogo company={companyName} size="sm" />
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {companyName}
                </span>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">New</span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Be an early applicant
                </span>
              </div>

              <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
                {postedTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{postedTime}</span>
                  </span>
                )}
                {updatedTime && (
                  <span className="flex items-center gap-1">
                    <span>🔄 {updatedTime}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Big Job Title */}
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
              {job.title}
            </h1>

            {/* Actions row: [Apply ->]  Flag  [Save to board] */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={applicationHref}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                <span>Apply</span>
                <ArrowRight className="size-4" />
              </a>

              <button
                type="button"
                className="rounded-lg border border-neutral-200 p-2 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="Report job posting"
                aria-label="Report job posting"
              >
                <Flag className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => toggleSavedJob(job.public_slug)}
                aria-pressed={isSaved}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <Bookmark className="size-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                <span>{isSaved ? 'Saved to board' : 'Save to board'}</span>
              </button>
            </div>
          </div>

          {/* SECONDARY NAVIGATION TABS (Screenshot 2: Description | Company | Discussion) */}
          <JobTabNavigation
            activeTab={activeTab}
            companyName={companyName}
            onTabChange={setActiveTab}
            onOpenReferralModal={() => setShowReferralModal(true)}
          />

          {/* TAB 1: DESCRIPTION CONTENT (Screenshots 2 & 3) */}
          {activeTab === 'description' && (
            <JobDescriptionTab
              job={job}
              skillsList={skillsList}
              companyName={companyName}
              domainsDisplay={domainsDisplay}
              similarJobs={similarJobs}
              jobBasePath={jobBasePath}
              onClaimSkill={handleClaimSkill}
              onAvoidSkill={handleAvoidSkill}
            />
          )}

          {/* TAB 2: COMPANY OVERVIEW */}
          {activeTab === 'company' && (
            <JobCompanyTab
              companyName={companyName}
              locationDisplay={locationDisplay}
              companyType={companyType}
              domainsDisplay={domainsDisplay}
              openingsCount={similarJobs.length + 1}
            />
          )}

          {/* TAB 3: DISCUSSION & PREP NOTES */}
          {activeTab === 'discussion' && (
            <JobDiscussionTab jobTitle={job.title} companyName={companyName} />
          )}
        </section>
      </div>
    </div>
  );
}
