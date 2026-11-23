'use client';

import React,{ useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  Tags,
  Briefcase,
  ClipboardList,
  Camera,
  ArrowUp,
  X,
  Plus,
  Ban,
  Sparkles,
  FileText,
  Check,
  CheckCircle2,
  Trash2,
  ExternalLink,
  GraduationCap,
  FolderKanban,
  Pencil,
  Save,
  Languages as LanguagesIcon,
  Award,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  COUNTRIES,
  POPULAR_COUNTRY_CODES,
} from '@/lib/profile/countries';
import { CountryFlag } from '@/components/ui/country-flag';
import {
  POPULAR_ROLES,
  ALL_ROLES,
  SENIORITY_LEVELS,
  WORK_FORMAT_OPTIONS,
  POPULAR_JOB_LANGUAGES,
  getAllTimezones,
} from '@/lib/profile/roles-data';
import {
  POPULAR_SKILLS,
  POPULAR_COMPANIES_TO_AVOID,
  POPULAR_SOURCES_TO_AVOID,
} from '@/lib/profile/skills-data';
import {
  loadLocalProfile,
  fetchRemoteProfile,
  persistProfileToServer,
  clearLocalProfile,
  clearRemoteProfile,
  saveLocalProfile,
  DEFAULT_PROFILE,
} from '@/lib/profile/profile-store';
import type {
  CandidateProfileState,
  WorkExperience,
  ProjectEntry,
  EducationEntry,
  ScreeningAnswers,
} from '@/lib/profile/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ProfileView() {
  const [profile, setProfile] = useState<CandidateProfileState>(DEFAULT_PROFILE);
  const [activeTab, setActiveTab] = useState<'profile' | 'skills' | 'experience' | 'screening'>('profile');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveMessage, setSaveMessage] = useState<string>('All changes saved');

  // Resume Parsing States
  const [isParsingCv, setIsParsingCv] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccessMessage, setParseSuccessMessage] = useState<string | null>(null);

  // Edit Mode Toggles per section
  const [editingRoles, setEditingRoles] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingAvoid, setEditingAvoid] = useState(false);
  const [editingLanguages, setEditingLanguages] = useState(false);
  const [editingCertifications, setEditingCertifications] = useState(false);
  const [editingScreening, setEditingScreening] = useState(false);

  // Search States
  const [roleSearch, setRoleSearch] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const [skillSearch, setSkillSearch] = useState('');
  const [avoidSkillSearch, setAvoidSkillSearch] = useState('');
  const [avoidSourceSearch, setAvoidSourceSearch] = useState('');
  const [avoidCompanySearch, setAvoidCompanySearch] = useState('');

  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Experience forms state
  const [addingJob, setAddingJob] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState<Partial<WorkExperience>>({
    company: '',
    role: '',
    location: '',
    start: '',
    end: '',
    current: false,
    achievements: [''],
  });

  const [addingProject, setAddingProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<Partial<ProjectEntry>>({
    name: '',
    link: '',
    start: '',
    end: '',
    description: '',
  });

  // Education entry state matching Freehire
  const [newEduDegree, setNewEduDegree] = useState('');
  const [newEduInstitution, setNewEduInstitution] = useState('');
  const [newEduMonth, setNewEduMonth] = useState('');
  const [newEduYear, setNewEduYear] = useState('');
  const [newEduYearOnly, setNewEduYearOnly] = useState(false);

  // Languages & Certifications state
  const [newLang, setNewLang] = useState('');
  const [newCert, setNewCert] = useState('');

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Available Timezones
  const allTimezones = useMemo(() => getAllTimezones(), []);

  // Load profile on mount
  useEffect(() => {
    const local = loadLocalProfile();
    // Only restore fields if a resume has been uploaded/parsed
    if (!local.cv || !local.cv.filename) {
      setProfile(DEFAULT_PROFILE);
      clearLocalProfile();
    } else {
      setProfile(local);
    }

    void fetchRemoteProfile().then((remote) => {
      if (remote && remote.cv && remote.cv.filename) {
        setProfile(remote);
      } else {
        setProfile(DEFAULT_PROFILE);
      }
    });
  }, []);

  // Autosave / Updater
  const updateProfile = (updater: (prev: CandidateProfileState) => CandidateProfileState) => {
    setProfile((prev) => {
      const next = updater(prev);
      setSaveStatus('saving');
      setSaveMessage('Saving changes...');

      if (typeof window !== 'undefined') {
        localStorage.setItem('freehire_candidate_profile_v2', JSON.stringify(next));
      }

      if ((window as any).__saveTimeout) clearTimeout((window as any).__saveTimeout);
      (window as any).__saveTimeout = setTimeout(async () => {
        const ok = await persistProfileToServer(next);
        if (ok) {
          setSaveStatus('saved');
          setSaveMessage('All changes saved');
        } else {
          setSaveStatus('saved');
          setSaveMessage('Saved locally');
        }
      }, 700);

      return next;
    });
  };

  // Completion calculation (Tab dot indicators)
  const tabAttention = useMemo(() => {
    return {
      profile: !profile.cv || profile.roles.length === 0,
      skills: profile.skills.length === 0,
      experience: profile.workHistory.length === 0 && profile.education.length === 0,
      screening: profile.screeningAnswers.authorized_countries.length === 0,
    };
  }, [profile]);

  // Handle Photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      updateProfile((p) => ({ ...p, photoUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  // Clear all fields and reset profile
  const handleClearProfile = async () => {
    if (typeof window !== 'undefined') {
      const confirm = window.confirm('Are you sure you want to clear all profile details and start fresh?');
      if (!confirm) return;
    }
    setProfile(DEFAULT_PROFILE);
    clearLocalProfile();
    setParseSuccessMessage(null);
    setParseError(null);
    setSaveStatus('saving');
    setSaveMessage('Resetting all fields...');
    await clearRemoteProfile();
    setSaveStatus('saved');
    setSaveMessage('Profile reset to clean state');
  };

  // Handle CV deletion - deletes the resume file and wipes all parsed details from input fields!
  const handleDeleteCv = async () => {
    setProfile(DEFAULT_PROFILE);
    clearLocalProfile();
    setParseSuccessMessage(null);
    setParseError(null);
    setSaveStatus('saving');
    setSaveMessage('Deleting resume & clearing fields...');
    await clearRemoteProfile();
    setSaveStatus('saved');
    setSaveMessage('Resume deleted and all profile fields cleared');
  };

  // Handle CV upload with automatic PDF/DOCX parsing
  const handleCvUpload = async (file: File) => {
    setIsParsingCv(true);
    setParseError(null);
    setParseSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/resumes/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse resume document.');
      }

      const parsed: CandidateProfileState = data.profile;

      updateProfile((prev) => {
        const updated: CandidateProfileState = {
          ...prev,
          cv: parsed.cv,
          roles: parsed.roles.length > 0 ? parsed.roles : prev.roles,
          seniorities: parsed.seniorities.length > 0 ? parsed.seniorities : prev.seniorities,
          jobLanguages: parsed.jobLanguages.length > 0 ? parsed.jobLanguages : prev.jobLanguages,
          contacts: {
            fullName: parsed.contacts.fullName || prev.contacts.fullName,
            email: parsed.contacts.email || prev.contacts.email,
            phone: parsed.contacts.phone || prev.contacts.phone,
            location: parsed.contacts.location || prev.contacts.location,
            links: parsed.contacts.links.length > 0 ? parsed.contacts.links : prev.contacts.links,
          },
          location: {
            workFormat: parsed.location.workFormat.length > 0 ? parsed.location.workFormat : ['Remote'],
            whereBased: parsed.location.whereBased || prev.location.whereBased,
            timezone: parsed.location.timezone && parsed.location.timezone !== 'UTC' ? parsed.location.timezone : prev.location.timezone || 'UTC',
          },
          skills: parsed.skills.length > 0 ? parsed.skills : prev.skills,
          workHistory: parsed.workHistory.length > 0 ? parsed.workHistory : prev.workHistory,
          projects: parsed.projects && parsed.projects.length > 0 ? parsed.projects : prev.projects,
          education: parsed.education.length > 0 ? parsed.education : prev.education,
          languages: parsed.languages.length > 0 ? parsed.languages : prev.languages,
          certifications: parsed.certifications.length > 0 ? parsed.certifications : prev.certifications,
          screeningAnswers: {
            ...prev.screeningAnswers,
            ...parsed.screeningAnswers,
            authorized_countries: parsed.screeningAnswers.authorized_countries.length > 0
              ? parsed.screeningAnswers.authorized_countries
              : prev.screeningAnswers.authorized_countries,
          },
        };

        saveLocalProfile(updated);
        void persistProfileToServer(updated);
        return updated;
      });

      setParseSuccessMessage(
        `Resume parsed successfully! Extracted details for "${parsed.contacts.fullName || 'Candidate'}", ${parsed.skills.length} skills, and ${parsed.workHistory.length} work experience entries.`
      );
    } catch (err: any) {
      console.error('Resume parse error:', err);
      setParseError(err.message || 'Error parsing resume file. Please upload a valid PDF or DOCX.');
    } finally {
      setIsParsingCv(false);
    }
  };

  // Roles toggle
  const toggleRole = (roleLabel: string) => {
    updateProfile((p) => {
      const has = p.roles.includes(roleLabel);
      if (has) return { ...p, roles: p.roles.filter((r) => r !== roleLabel) };
      if (p.roles.length >= 10) return p;
      return { ...p, roles: [...p.roles, roleLabel] };
    });
  };

  // Seniority Level toggle
  const toggleSeniority = (level: string) => {
    updateProfile((p) => {
      const has = p.seniorities.includes(level);
      return {
        ...p,
        seniorities: has ? p.seniorities.filter((s) => s !== level) : [...p.seniorities, level],
      };
    });
  };

  // Job Language toggle
  const toggleJobLanguage = (lang: string) => {
    updateProfile((p) => {
      const has = p.jobLanguages.includes(lang);
      return {
        ...p,
        jobLanguages: has ? p.jobLanguages.filter((l) => l !== lang) : [...p.jobLanguages, lang],
      };
    });
  };

  // Work Format toggle
  const toggleWorkFormat = (format: string) => {
    updateProfile((p) => {
      const has = p.location.workFormat.includes(format);
      return {
        ...p,
        location: {
          ...p.location,
          workFormat: has
            ? p.location.workFormat.filter((f) => f !== format)
            : [...p.location.workFormat, format],
        },
      };
    });
  };

  // Skills
  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    updateProfile((p) => {
      if (p.skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return p;
      return { ...p, skills: [...p.skills, trimmed] };
    });
    setSkillSearch('');
  };

  const removeSkill = (skill: string) => {
    updateProfile((p) => ({ ...p, skills: p.skills.filter((s) => s !== skill) }));
  };

  // Exclusions
  const addExcludedSkill = (skill: string) => {
    const t = skill.trim();
    if (!t) return;
    updateProfile((p) => ({
      ...p,
      excludedSkills: p.excludedSkills.includes(t) ? p.excludedSkills : [...p.excludedSkills, t],
    }));
    setAvoidSkillSearch('');
  };

  const removeExcludedSkill = (skill: string) => {
    updateProfile((p) => ({ ...p, excludedSkills: p.excludedSkills.filter((s) => s !== skill) }));
  };

  const addExcludedSource = (src: string) => {
    const t = src.trim();
    if (!t) return;
    updateProfile((p) => ({
      ...p,
      excludedSources: p.excludedSources.includes(t) ? p.excludedSources : [...p.excludedSources, t],
    }));
    setAvoidSourceSearch('');
  };

  const removeExcludedSource = (src: string) => {
    updateProfile((p) => ({ ...p, excludedSources: p.excludedSources.filter((s) => s !== src) }));
  };

  const addExcludedCompany = (comp: string) => {
    const t = comp.trim();
    if (!t) return;
    updateProfile((p) => ({
      ...p,
      excludedCompanies: p.excludedCompanies.includes(t) ? p.excludedCompanies : [...p.excludedCompanies, t],
    }));
    setAvoidCompanySearch('');
  };

  const removeExcludedCompany = (comp: string) => {
    updateProfile((p) => ({ ...p, excludedCompanies: p.excludedCompanies.filter((s) => s !== comp) }));
  };

  // Screening Answers
  const toggleCountry = (code: string) => {
    updateProfile((p) => {
      const list = p.screeningAnswers.authorized_countries;
      const next = list.includes(code) ? list.filter((c) => c !== code) : [...list, code];
      return {
        ...p,
        screeningAnswers: {
          ...p.screeningAnswers,
          authorized_countries: next,
        },
      };
    });
  };

  const updateScreeningField = <K extends keyof ScreeningAnswers>(key: K, val: ScreeningAnswers[K]) => {
    updateProfile((p) => ({
      ...p,
      screeningAnswers: {
        ...p.screeningAnswers,
        [key]: val,
      },
    }));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 font-sans">
      {/* Top Navigation Tabs Header */}
      <div className="flex flex-col gap-3 border-b border-neutral-200/90 pb-3 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">freehire.me profile:</span>
            <span className="text-neutral-400">Manage your CV, targeting, and ATS extension answers</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearProfile}
              className="h-7 cursor-pointer gap-1 px-2.5 text-xs text-neutral-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-neutral-400 dark:hover:bg-red-950/20"
              title="Reset all fields to blank"
            >
              <RotateCcw className="size-3" /> Clear / Start Fresh
            </Button>
            <div className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-neutral-500">{saveMessage}</span>
            </div>
          </div>
        </div>

        {/* 4 Navigation Tabs */}
        <nav className="flex flex-wrap gap-2 sm:gap-6" aria-label="Profile Sections">
          {[
            { id: 'profile', label: 'Profile', icon: User, attention: tabAttention.profile },
            { id: 'skills', label: 'Skills', icon: Tags, attention: tabAttention.skills },
            { id: 'experience', label: 'Experience', icon: Briefcase, attention: tabAttention.experience },
            { id: 'screening', label: 'Screening answers', icon: ClipboardList, attention: tabAttention.screening },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`group inline-flex cursor-pointer items-center gap-2 border-b-2 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-lime-700 text-neutral-900 dark:border-lime-500 dark:text-neutral-50'
                    : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <Icon className={`size-4 ${active ? 'text-lime-700 dark:text-lime-500' : 'text-neutral-400 group-hover:text-neutral-600'}`} />
                <span>{tab.label}</span>
                {tab.attention ? (
                  <span className="text-xs text-neutral-400">(not filled in)</span>
                ) : (
                  <Check className="size-3 text-emerald-600" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PROFILE */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-8 pt-1">
          {/* Your photo */}
          <section className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Your photo</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                className="gap-1.5 text-xs text-neutral-700 dark:text-neutral-300"
              >
                <Pencil className="size-3.5" /> Edit Photo
              </Button>
            </div>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="relative size-24 shrink-0 rounded-full border-2 border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt="Candidate headshot"
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-neutral-400">
                    <User className="size-10 stroke-[1.5]" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex size-7 cursor-pointer items-center justify-center rounded-full bg-lime-700 text-white shadow-md hover:bg-lime-800"
                  title="Upload profile photo"
                >
                  <Camera className="size-3.5" />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

              <div className="space-y-1">
                <p className="max-w-md text-xs text-neutral-500 dark:text-neutral-400">
                  JPEG, PNG, or WebP up to 6 MB · cropped to a square. Printed only by the CV templates that show a photo.
                </p>
                {profile.photoUrl && (
                  <button
                    type="button"
                    onClick={() => updateProfile((p) => ({ ...p, photoUrl: null }))}
                    className="text-xs text-red-600 underline hover:text-red-700 dark:text-red-400"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Your CV */}
          <section className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Your CV</h2>
              {profile.cv && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5 text-xs"
                >
                  <Pencil className="size-3.5" /> Replace CV
                </Button>
              )}
            </div>

            {/* Status alerts */}
            {parseSuccessMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{parseSuccessMessage}</span>
              </div>
            )}
            {parseError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{parseError}</span>
              </div>
            )}

            {isParsingCv ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-lime-300 bg-lime-50/60 py-10 text-center dark:border-lime-800 dark:bg-lime-950/20">
                <Loader2 className="size-8 animate-spin text-lime-700 dark:text-lime-400" />
                <p className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Parsing resume (PDF/DOCX) & extracting profile details...
                </p>
                <p className="mt-1 max-w-md text-xs text-neutral-500">
                  Extracting your contact information, work experience, roles, skills, and education to automatically fill your profile fields.
                </p>
              </div>
            ) : profile.cv ? (
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                    <FileText className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{profile.cv.filename}</p>
                    <p className="text-xs text-neutral-500">
                      Uploaded {profile.cv.uploadedAt ? new Date(profile.cv.uploadedAt).toLocaleDateString() : 'recently'} · {profile.cv.sizeFormatted}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    <Check className="size-3 text-emerald-600" /> ATS readable
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteCv}
                    className="cursor-pointer text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Delete resume and clear all parsed fields"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleCvUpload(e.dataTransfer.files[0]);
                }}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50/50 py-10 transition-colors hover:border-lime-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/30 dark:hover:border-lime-500"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-lime-700 text-white shadow-sm transition-transform group-hover:scale-105">
                  <ArrowUp className="size-5 stroke-[2.5]" />
                </div>
                <p className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Drop PDF or DOCX here <span className="font-normal text-lime-700 underline dark:text-lime-400">or choose from disk</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  PDF or DOCX with selectable text, up to 15 MB · Automatically extracts and populates your contact info, roles, skills, experience, and education.
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleCvUpload(e.target.files[0]);
              }}
            />
          </section>

          {/* Roles & Level */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Roles <span className="text-neutral-500 font-normal">{profile.roles.length}/10</span>
                </h2>
                <p className="text-xs text-neutral-500">
                  Try a job title such as SOC Analyst, Cloud Engineer or Helpdesk to find its specialization.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRoles((prev) => !prev)}
                className="gap-1.5 text-xs"
              >
                <Pencil className="size-3.5" /> {editingRoles ? 'Done' : 'Edit Roles'}
              </Button>
            </div>

            {/* Role Search & Typeahead */}
            <div className="relative">
              <Input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                onFocus={() => setShowRoleDropdown(true)}
                placeholder="Search by job title or specialization"
                className="h-10 rounded-lg bg-white dark:bg-neutral-900"
              />

              {showRoleDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="mb-1.5 flex items-center justify-between px-2 text-xs font-semibold text-neutral-400">
                    <span>Select up to 10 specializations</span>
                    <button
                      type="button"
                      onClick={() => setShowRoleDropdown(false)}
                      className="cursor-pointer text-neutral-500 hover:text-neutral-800"
                    >
                      Close
                    </button>
                  </div>
                  {ALL_ROLES.filter((r) =>
                    r.label.toLowerCase().includes(roleSearch.toLowerCase())
                  ).map((role) => {
                    const selected = profile.roles.includes(role.label);
                    return (
                      <div
                        key={role.id}
                        onClick={() => toggleRole(role.label)}
                        className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          selected ? 'bg-neutral-100 font-medium text-lime-700 dark:bg-neutral-800 dark:text-lime-400' : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <span>{role.label}</span>
                        {selected && <Check className="size-3.5" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Roles Chips */}
            {profile.roles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.roles.map((r) => (
                  <Badge
                    key={r}
                    variant="secondary"
                    className="gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    {r}
                    <button
                      type="button"
                      onClick={() => toggleRole(r)}
                      className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Popular Roles Pills (Matches Freehire UI) */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {POPULAR_ROLES.map((role) => {
                const selected = profile.roles.includes(role.label);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.label)}
                    className={`cursor-pointer rounded-full px-3 py-1 font-medium transition-colors ${
                      selected
                        ? 'bg-lime-700 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {role.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowRoleDropdown(true)}
                className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
              >
                +49 more — type to search
              </button>
            </div>

            {/* Level (Pick every level you'd take) */}
            <div className="border-t border-neutral-200/80 pt-4 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Level</h3>
                  <p className="text-xs text-neutral-500">Pick every level you'd take</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {SENIORITY_LEVELS.map((level) => {
                  const sel = profile.seniorities.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleSeniority(level)}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        sel
                          ? 'border-lime-700 bg-lime-700 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Job languages */}
            <div className="border-t border-neutral-200/80 pt-4 dark:border-neutral-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Job languages</h3>
              <p className="text-xs text-neutral-500">
                Show vacancies written in any of the selected languages. Leave empty for any language.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {POPULAR_JOB_LANGUAGES.map((lang) => {
                  const sel = profile.jobLanguages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleJobLanguage(lang)}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
                        sel
                          ? 'bg-lime-700 font-medium text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Your contacts */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Your contacts</h2>
                <p className="text-xs text-neutral-500">
                  Edit without re-uploading. A new CV parse only fills empty fields — it will not overwrite what you typed.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingContacts((prev) => !prev)}
                className="gap-1.5 text-xs"
              >
                <Pencil className="size-3.5" /> {editingContacts ? 'Done' : 'Edit Contacts'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-500">Full name</label>
                <Input
                  value={profile.contacts.fullName}
                  onChange={(e) =>
                    updateProfile((p) => ({ ...p, contacts: { ...p.contacts, fullName: e.target.value } }))
                  }
                  placeholder="Full name"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Email</label>
                <Input
                  value={profile.contacts.email}
                  onChange={(e) =>
                    updateProfile((p) => ({ ...p, contacts: { ...p.contacts, email: e.target.value } }))
                  }
                  placeholder="name@example.com"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Phone</label>
                <Input
                  value={profile.contacts.phone}
                  onChange={(e) =>
                    updateProfile((p) => ({ ...p, contacts: { ...p.contacts, phone: e.target.value } }))
                  }
                  placeholder="Phone"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Location</label>
                <Input
                  value={profile.contacts.location}
                  onChange={(e) =>
                    updateProfile((p) => ({ ...p, contacts: { ...p.contacts, location: e.target.value } }))
                  }
                  placeholder="City, Country"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            {/* Links (one per line) */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Links (one per line)</label>
              <textarea
                rows={3}
                value={profile.contacts.links.join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n');
                  updateProfile((p) => ({ ...p, contacts: { ...p.contacts, links: lines } }));
                }}
                placeholder="https://linkedin.com/in/...&#10;https://github.com/...&#10;https://portfolio.dev"
                className="w-full rounded-md border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </div>
          </section>

          {/* Location & Timezone */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Location</h2>
                <p className="text-xs text-neutral-500">All optional — used to tailor your job filters.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingLocation((prev) => !prev)}
                className="gap-1.5 text-xs"
              >
                <Pencil className="size-3.5" /> {editingLocation ? 'Done' : 'Edit Location'}
              </Button>
            </div>

            {/* Work format */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Work format</span>
              <div className="flex flex-wrap gap-2">
                {WORK_FORMAT_OPTIONS.map((format) => {
                  const sel = profile.location.workFormat.includes(format);
                  return (
                    <button
                      key={format}
                      type="button"
                      onClick={() => toggleWorkFormat(format)}
                      className={`cursor-pointer rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
                        sel
                          ? 'border-lime-700 bg-lime-700 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {format}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Where you're based */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Where you're based</span>
              <Input
                value={profile.location.whereBased}
                onChange={(e) =>
                  updateProfile((p) => ({ ...p, location: { ...p.location, whereBased: e.target.value } }))
                }
                placeholder="Pick a work format above to set where you can work (e.g. Austin, TX, USA or Berlin, Germany)"
                className="h-9"
              />
            </div>

            {/* Timezone (Full IANA List) */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Timezone</span>
              <p className="text-xs text-neutral-500">
                Used to schedule a daily search-alert digest and quiet hours at your own local time.
              </p>
              <select
                value={profile.location.timezone}
                onChange={(e) =>
                  updateProfile((p) => ({ ...p, location: { ...p.location, timezone: e.target.value } }))
                }
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                {allTimezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SKILLS */}
      {/* ========================================================================= */}
      {activeTab === 'skills' && (
        <div className="space-y-8 pt-1">
          {/* Skills */}
          <section className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Skills</h2>
              <span className="text-xs text-neutral-500">{profile.skills.length}</span>
            </div>

            <div className="flex gap-2">
              <Input
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill(skillSearch);
                  }
                }}
                placeholder="Search skills"
                className="h-10 rounded-lg bg-white dark:bg-neutral-900"
              />
              <Button
                type="button"
                onClick={() => addSkill(skillSearch)}
                className="h-10 cursor-pointer bg-lime-700 px-4 text-white hover:bg-lime-800"
              >
                Add
              </Button>
            </div>

            {/* Selected Skills Chips */}
            {profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Suggestions */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Popular skills</span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_SKILLS.slice(0, 15).map((s) => {
                  const sel = profile.skills.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => (sel ? removeSkill(s) : addSkill(s))}
                      className={`cursor-pointer rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        sel
                          ? 'bg-lime-700 text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {sel ? '✓ ' : '+ '}{s}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Avoid Section (Matches Image 2) */}
          <section className="space-y-6 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                <Ban className="size-4.5 text-neutral-600 dark:text-neutral-400" />
                <span>Avoid</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingAvoid((prev) => !prev)}
                className="gap-1.5 text-xs"
              >
                <Pencil className="size-3.5" /> {editingAvoid ? 'Done' : 'Edit Exclusions'}
              </Button>
            </div>

            {/* Skills to avoid */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Skills to avoid</span>
                <span className="text-xs text-neutral-500">{profile.excludedSkills.length}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={avoidSkillSearch}
                  onChange={(e) => setAvoidSkillSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludedSkill(avoidSkillSearch);
                    }
                  }}
                  placeholder="Search skills to exclude"
                  className="h-10 rounded-lg bg-white dark:bg-neutral-900"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addExcludedSkill(avoidSkillSearch)}
                  className="h-10 cursor-pointer"
                >
                  Exclude
                </Button>
              </div>
              {profile.excludedSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.excludedSkills.map((s) => (
                    <Badge
                      key={s}
                      variant="destructive"
                      className="gap-1.5 rounded-md bg-red-50 text-xs font-normal text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => removeExcludedSkill(s)}
                        className="cursor-pointer hover:text-red-900"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Sources to avoid */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Sources to avoid</span>
                <span className="text-xs text-neutral-500">{profile.excludedSources.length}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={avoidSourceSearch}
                  onChange={(e) => setAvoidSourceSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludedSource(avoidSourceSearch);
                    }
                  }}
                  placeholder="Search sources to exclude"
                  className="h-10 rounded-lg bg-white dark:bg-neutral-900"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addExcludedSource(avoidSourceSearch)}
                  className="h-10 cursor-pointer"
                >
                  Exclude
                </Button>
              </div>
              {profile.excludedSources.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.excludedSources.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="gap-1.5 rounded-md bg-neutral-100 text-xs font-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => removeExcludedSource(s)}
                        className="cursor-pointer hover:text-neutral-900"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
                {POPULAR_SOURCES_TO_AVOID.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => addExcludedSource(src)}
                    className="cursor-pointer rounded-full bg-neutral-100 px-2.5 py-0.5 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    + {src}
                  </button>
                ))}
              </div>
            </div>

            {/* Companies to avoid */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Companies to avoid</span>
                <span className="text-xs text-neutral-500">{profile.excludedCompanies.length}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={avoidCompanySearch}
                  onChange={(e) => setAvoidCompanySearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludedCompany(avoidCompanySearch);
                    }
                  }}
                  placeholder="Search companies to exclude"
                  className="h-10 rounded-lg bg-white dark:bg-neutral-900"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addExcludedCompany(avoidCompanySearch)}
                  className="h-10 cursor-pointer"
                >
                  Exclude
                </Button>
              </div>
              {profile.excludedCompanies.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.excludedCompanies.map((c) => (
                    <Badge
                      key={c}
                      variant="secondary"
                      className="gap-1.5 rounded-md bg-neutral-100 text-xs font-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeExcludedCompany(c)}
                        className="cursor-pointer hover:text-neutral-900"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
                {POPULAR_COMPANIES_TO_AVOID.map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => addExcludedCompany(comp)}
                    className="cursor-pointer rounded-full bg-neutral-100 px-2.5 py-0.5 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    + {comp}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXPERIENCE */}
      {/* ========================================================================= */}
      {activeTab === 'experience' && (
        <div className="space-y-8 pt-1">
          {/* Top Intro Bar */}
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-900">
            <p className="max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Nothing recorded yet. Upload a CV, add a job or project below, or talk it through with the assistant — whatever you confirm is kept here and reused in every CV you build.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-lg border-neutral-300 text-neutral-800 shadow-xs hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200"
            >
              <Sparkles className="size-4 text-amber-500" />
              Tailor your experience
            </Button>
          </div>

          {/* Work history */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                <Briefcase className="size-4.5 text-neutral-600 dark:text-neutral-400" />
                <span>Work history</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setJobForm({ company: '', role: '', location: '', start: '', end: '', achievements: [''] });
                  setEditingJobId(null);
                  setAddingJob(true);
                }}
                className="cursor-pointer text-xs text-lime-700 hover:text-lime-800 dark:text-lime-400"
              >
                <Plus className="mr-1 size-4" /> Add experience
              </Button>
            </div>

            {/* Add / Edit Job Form */}
            {addingJob && (
              <div className="space-y-3 rounded-xl border border-neutral-300 bg-neutral-50/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  {editingJobId ? 'Edit Work Experience' : 'New Work Experience'}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Company name"
                    value={jobForm.company || ''}
                    onChange={(e) => setJobForm((j) => ({ ...j, company: e.target.value }))}
                  />
                  <Input
                    placeholder="Job title / Role"
                    value={jobForm.role || ''}
                    onChange={(e) => setJobForm((j) => ({ ...j, role: e.target.value }))}
                  />
                  <Input
                    placeholder="Location (e.g. San Francisco, CA / Remote)"
                    value={jobForm.location || ''}
                    onChange={(e) => setJobForm((j) => ({ ...j, location: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Start date (e.g. 2021)"
                      value={jobForm.start || ''}
                      onChange={(e) => setJobForm((j) => ({ ...j, start: e.target.value }))}
                    />
                    <Input
                      placeholder="End date or Present"
                      value={jobForm.end || ''}
                      onChange={(e) => setJobForm((j) => ({ ...j, end: e.target.value }))}
                    />
                  </div>
                </div>
                <Input
                  placeholder="Key achievement or responsibility"
                  value={jobForm.achievements?.[0] || ''}
                  onChange={(e) => setJobForm((j) => ({ ...j, achievements: [e.target.value] }))}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddingJob(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-lime-700 text-white hover:bg-lime-800"
                    onClick={() => {
                      if (!jobForm.company && !jobForm.role) return;
                      if (editingJobId) {
                        updateProfile((p) => ({
                          ...p,
                          workHistory: p.workHistory.map((j) =>
                            j.id === editingJobId ? ({ ...j, ...jobForm } as WorkExperience) : j
                          ),
                        }));
                      } else {
                        const job: WorkExperience = {
                          id: String(Date.now()),
                          company: jobForm.company || 'Company',
                          role: jobForm.role || 'Role',
                          location: jobForm.location,
                          start: jobForm.start,
                          end: jobForm.end,
                          current: !jobForm.end || jobForm.end.toLowerCase().includes('present'),
                          achievements: jobForm.achievements || [],
                        };
                        updateProfile((p) => ({ ...p, workHistory: [job, ...p.workHistory] }));
                      }
                      setAddingJob(false);
                      setEditingJobId(null);
                    }}
                  >
                    Save job
                  </Button>
                </div>
              </div>
            )}

            {profile.workHistory.length === 0 && !addingJob ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing here yet.</p>
            ) : (
              <div className="space-y-3">
                {profile.workHistory.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{job.role}</h4>
                        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {job.company} · {job.location || 'Remote'} · {job.start} – {job.end || 'Present'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setJobForm(job);
                            setEditingJobId(job.id);
                            setAddingJob(true);
                          }}
                          className="cursor-pointer text-neutral-400 hover:text-neutral-700"
                          title="Edit job"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateProfile((p) => ({
                              ...p,
                              workHistory: p.workHistory.filter((j) => j.id !== job.id),
                            }))
                          }
                          className="cursor-pointer text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {job.achievements.length > 0 && (
                      <ul className="mt-2.5 list-inside list-disc space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                        {job.achievements.map((ach, idx) => (
                          <li key={idx}>{ach}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                <FolderKanban className="size-4.5 text-neutral-600 dark:text-neutral-400" />
                <span>Projects</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProjectForm({ name: '', link: '', start: '', end: '', description: '' });
                  setEditingProjectId(null);
                  setAddingProject(true);
                }}
                className="cursor-pointer text-xs text-lime-700 hover:text-lime-800 dark:text-lime-400"
              >
                <Plus className="mr-1 size-4" /> Add project
              </Button>
            </div>

            {addingProject && (
              <div className="space-y-3 rounded-xl border border-neutral-300 bg-neutral-50/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  {editingProjectId ? 'Edit Project' : 'New Project'}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Project Name"
                    value={projectForm.name || ''}
                    onChange={(e) => setProjectForm((pr) => ({ ...pr, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Project Link (GitHub / Live URL)"
                    value={projectForm.link || ''}
                    onChange={(e) => setProjectForm((pr) => ({ ...pr, link: e.target.value }))}
                  />
                </div>
                <Input
                  placeholder="Short description of what you built and technical impact"
                  value={projectForm.description || ''}
                  onChange={(e) => setProjectForm((pr) => ({ ...pr, description: e.target.value }))}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddingProject(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-lime-700 text-white hover:bg-lime-800"
                    onClick={() => {
                      if (!projectForm.name) return;
                      if (editingProjectId) {
                        updateProfile((p) => ({
                          ...p,
                          projects: p.projects.map((pr) =>
                            pr.id === editingProjectId ? ({ ...pr, ...projectForm } as ProjectEntry) : pr
                          ),
                        }));
                      } else {
                        const proj: ProjectEntry = {
                          id: String(Date.now()),
                          name: projectForm.name,
                          link: projectForm.link,
                          description: projectForm.description,
                        };
                        updateProfile((p) => ({ ...p, projects: [proj, ...p.projects] }));
                      }
                      setAddingProject(false);
                      setEditingProjectId(null);
                    }}
                  >
                    Save project
                  </Button>
                </div>
              </div>
            )}

            {profile.projects.length === 0 && !addingProject ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing here yet.</p>
            ) : (
              <div className="space-y-3">
                {profile.projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{proj.name}</h4>
                        {proj.link && (
                          <a
                            href={proj.link.startsWith('http') ? proj.link : `https://${proj.link}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-lime-700 hover:underline dark:text-lime-400"
                          >
                            <span>{proj.link}</span>
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                        {proj.description && (
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{proj.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setProjectForm(proj);
                            setEditingProjectId(proj.id);
                            setAddingProject(true);
                          }}
                          className="cursor-pointer text-neutral-400 hover:text-neutral-700"
                          title="Edit project"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateProfile((p) => ({
                              ...p,
                              projects: p.projects.filter((pr) => pr.id !== proj.id),
                            }))
                          }
                          className="cursor-pointer text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Education (Matches Image 3) */}
          <section className="space-y-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                <GraduationCap className="size-4.5 text-neutral-600 dark:text-neutral-400" />
                <span>Education</span>
              </div>
            </div>

            {/* Saved education rows with inline edit */}
            {profile.education.length > 0 && (
              <div className="space-y-2">
                {profile.education.map((edu, idx) => (
                  <div
                    key={edu.id || idx}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{edu.degree}</p>
                      <p className="text-xs text-neutral-500">
                        {edu.institution} {edu.year ? `· ${edu.year}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateProfile((p) => ({
                          ...p,
                          education: p.education.filter((_, i) => i !== idx),
                        }))
                      }
                      className="cursor-pointer text-neutral-400 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* New entry box (Exact copy from freehire.me Image 3) */}
            <div className="space-y-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-4 dark:border-neutral-700 dark:bg-neutral-900/30">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">New entry</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Degree"
                  value={newEduDegree}
                  onChange={(e) => setNewEduDegree(e.target.value)}
                  className="h-9 bg-white dark:bg-neutral-900"
                />
                <Input
                  placeholder="Institution"
                  value={newEduInstitution}
                  onChange={(e) => setNewEduInstitution(e.target.value)}
                  className="h-9 bg-white dark:bg-neutral-900"
                />

                {/* Period Date Control with "I don't remember the month" */}
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex gap-2">
                    {!newEduYearOnly && (
                      <Input
                        type="month"
                        value={newEduMonth}
                        onChange={(e) => setNewEduMonth(e.target.value)}
                        placeholder="---------, ----"
                        className="h-9 bg-white sm:w-1/2 dark:bg-neutral-900"
                      />
                    )}
                    <Input
                      type="number"
                      placeholder="Year (e.g. 2022)"
                      value={newEduYear}
                      onChange={(e) => setNewEduYear(e.target.value)}
                      className={`h-9 bg-white dark:bg-neutral-900 ${newEduYearOnly ? 'w-full' : 'sm:w-1/2'}`}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={newEduYearOnly}
                      onChange={(e) => setNewEduYearOnly(e.target.checked)}
                      className="rounded border-neutral-300 text-lime-700 focus:ring-lime-600"
                    />
                    <span>I don't remember the month</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newEduDegree.trim() && !newEduInstitution.trim()) return;
                    const dateDisplay = newEduYearOnly
                      ? newEduYear
                      : newEduMonth || newEduYear || '';
                    const entry: EducationEntry = {
                      id: String(Date.now()),
                      degree: newEduDegree,
                      institution: newEduInstitution,
                      year: dateDisplay,
                      yearOnly: newEduYearOnly,
                    };
                    updateProfile((p) => ({ ...p, education: [...p.education, entry] }));
                    setNewEduDegree('');
                    setNewEduInstitution('');
                    setNewEduMonth('');
                    setNewEduYear('');
                  }}
                  className="cursor-pointer bg-lime-700 text-xs text-white hover:bg-lime-800"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Languages (English, Spanish) */}
            <div className="border-t border-neutral-200/80 pt-4 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LanguagesIcon className="size-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Languages</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingLanguages((prev) => !prev)}
                  className="gap-1.5 text-xs"
                >
                  <Pencil className="size-3.5" /> {editingLanguages ? 'Done' : 'Edit'}
                </Button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {profile.languages.map((lang) => (
                  <Badge
                    key={lang}
                    variant="secondary"
                    className="gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    {lang}
                    <button
                      type="button"
                      onClick={() =>
                        updateProfile((p) => ({
                          ...p,
                          languages: p.languages.filter((l) => l !== lang),
                        }))
                      }
                      className="cursor-pointer hover:text-red-600"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              {editingLanguages && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Add language (e.g. French, German)"
                    value={newLang}
                    onChange={(e) => setNewLang(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newLang.trim()) {
                          updateProfile((p) => ({ ...p, languages: [...p.languages, newLang.trim()] }));
                          setNewLang('');
                        }
                      }
                    }}
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newLang.trim()) {
                        updateProfile((p) => ({ ...p, languages: [...p.languages, newLang.trim()] }));
                        setNewLang('');
                      }
                    }}
                    className="bg-lime-700 text-white"
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* Certifications */}
            <div className="border-t border-neutral-200/80 pt-4 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Certifications</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingCertifications((prev) => !prev)}
                  className="gap-1.5 text-xs"
                >
                  <Pencil className="size-3.5" /> {editingCertifications ? 'Done' : 'Edit'}
                </Button>
              </div>

              {profile.certifications.length === 0 && !editingCertifications ? (
                <p className="mt-2 text-xs text-neutral-400">No certifications recorded yet.</p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {profile.certifications.map((cert) => (
                    <Badge
                      key={cert}
                      variant="secondary"
                      className="gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      {cert}
                      <button
                        type="button"
                        onClick={() =>
                          updateProfile((p) => ({
                            ...p,
                            certifications: p.certifications.filter((c) => c !== cert),
                          }))
                        }
                        className="cursor-pointer hover:text-red-600"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {editingCertifications && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Add certification (e.g. AWS Certified Solutions Architect)"
                    value={newCert}
                    onChange={(e) => setNewCert(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newCert.trim()) {
                          updateProfile((p) => ({ ...p, certifications: [...p.certifications, newCert.trim()] }));
                          setNewCert('');
                        }
                      }
                    }}
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newCert.trim()) {
                        updateProfile((p) => ({ ...p, certifications: [...p.certifications, newCert.trim()] }));
                        setNewCert('');
                      }
                    }}
                    className="bg-lime-700 text-white"
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SCREENING ANSWERS */}
      {/* ========================================================================= */}
      {activeTab === 'screening' && (
        <div className="space-y-8 pt-1">
          {/* Header */}
          <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Screening answers</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Answer these once and the browser extension can fill them into matching questions on real application forms.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingScreening((prev) => !prev)}
              className="gap-1.5 text-xs"
            >
              <Pencil className="size-3.5" /> {editingScreening ? 'Done' : 'Edit Answers'}
            </Button>
          </div>

          {/* Authorized to work in (138+ Countries) */}
          <section className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Authorized to work in</span>

            {/* Country search input */}
            <div className="relative">
              <Input
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                onFocus={() => setShowCountryDropdown(true)}
                placeholder="Add a country (search 138+ countries...)"
                className="h-10 rounded-lg bg-white dark:bg-neutral-900"
              />

              {showCountryDropdown && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="mb-1.5 flex items-center justify-between px-2 text-xs font-semibold text-neutral-400">
                    <span>138 Recognized Countries</span>
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown(false)}
                      className="cursor-pointer text-neutral-500 hover:text-neutral-800"
                    >
                      Close
                    </button>
                  </div>
                  {COUNTRIES.filter((c) =>
                    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                    c.code.toLowerCase().includes(countrySearch.toLowerCase())
                  ).map((c) => {
                    const sel = profile.screeningAnswers.authorized_countries.includes(c.code);
                    return (
                      <div
                        key={c.code}
                        onClick={() => toggleCountry(c.code)}
                        className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          sel ? 'bg-neutral-100 font-medium text-lime-700 dark:bg-neutral-800 dark:text-lime-400' : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <CountryFlag code={c.code} name={c.name} className="size-4 shrink-0 rounded-full" />
                          <span>{c.name}</span>
                        </span>
                        {sel && <Check className="size-3.5" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Countries Badges */}
            {profile.screeningAnswers.authorized_countries.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.screeningAnswers.authorized_countries.map((code) => {
                  const country = COUNTRIES.find((c) => c.code === code);
                  if (!country) return null;
                  return (
                    <Badge
                      key={code}
                      variant="secondary"
                      className="gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      <CountryFlag code={code} name={country.name} className="size-3.5 shrink-0 rounded-full" />
                      <span>{country.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleCountry(code)}
                        className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Popular country pills (Matches Image 4) */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {POPULAR_COUNTRY_CODES.map((code) => {
                const country = COUNTRIES.find((c) => c.code === code);
                if (!country) return null;
                const sel = profile.screeningAnswers.authorized_countries.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCountry(code)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
                      sel
                        ? 'bg-lime-700 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <CountryFlag code={code} name={country.name} className="size-4 shrink-0 rounded-full" />
                    <span>{country.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowCountryDropdown(true)}
                className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
              >
                +130 more — type to search
              </button>
            </div>
          </section>

          {/* Standard Screening Form Fields (Matches Image 4) */}
          <section className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs sm:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
            {/* Need visa sponsorship? */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Need visa sponsorship?</span>
              <select
                value={profile.screeningAnswers.visa_sponsorship_needed}
                onChange={(e) => updateScreeningField('visa_sponsorship_needed', e.target.value as any)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Not stated</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Willing to relocate? */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Willing to relocate?</span>
              <select
                value={profile.screeningAnswers.willing_to_relocate}
                onChange={(e) => updateScreeningField('willing_to_relocate', e.target.value as any)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Not stated</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* 18 or older? */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">18 or older?</span>
              <select
                value={profile.screeningAnswers.age_18_or_older}
                onChange={(e) => updateScreeningField('age_18_or_older', e.target.value as any)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Not stated</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Accept employers' privacy terms for me? (Spans 2 cols) */}
            <div className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="text-neutral-600 dark:text-neutral-400">Accept employers' privacy terms for me?</span>
              <select
                value={profile.screeningAnswers.privacy_consent}
                onChange={(e) => updateScreeningField('privacy_consent', e.target.value as any)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Not stated</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <span className="mt-0.5 text-xs text-neutral-500">
                Auto-apply ticks the required privacy / personal-data consent on application forms. It never opts you in to marketing, SMS or future-openings lists.
              </span>
            </div>

            {/* Notice period (days) */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Notice period (days)</span>
              <Input
                type="number"
                value={profile.screeningAnswers.notice_period_days}
                onChange={(e) => updateScreeningField('notice_period_days', e.target.value)}
                placeholder="30"
                className="h-9"
              />
            </div>

            {/* Desired salary amount */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Desired salary amount</span>
              <Input
                type="number"
                value={profile.screeningAnswers.desired_salary_amount}
                onChange={(e) => updateScreeningField('desired_salary_amount', e.target.value)}
                placeholder="120000"
                className="h-9"
              />
            </div>

            {/* Currency (ISO 4217) */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Currency (ISO 4217)</span>
              <Input
                value={profile.screeningAnswers.desired_salary_currency}
                onChange={(e) => updateScreeningField('desired_salary_currency', e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={3}
                className="h-9"
              />
            </div>

            {/* Salary period */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-400">Salary period</span>
              <select
                value={profile.screeningAnswers.desired_salary_period}
                onChange={(e) => updateScreeningField('desired_salary_period', e.target.value as any)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Not stated</option>
                <option value="year">Per year</option>
                <option value="month">Per month</option>
                <option value="day">Per day</option>
                <option value="hour">Per hour</option>
              </select>
            </div>
          </section>

          {/* Action button */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={async () => {
                setSaveStatus('saving');
                setSaveMessage('Saving to database...');
                const ok = await persistProfileToServer(profile);
                setSaveStatus('saved');
                setSaveMessage(ok ? 'Saved successfully' : 'Saved locally');
              }}
              className="gap-2 bg-lime-700 px-6 text-white hover:bg-lime-800"
            >
              <Save className="size-4" />
              Save Screening Answers
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
