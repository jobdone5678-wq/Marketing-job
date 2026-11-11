import type { Adapter, FillContext } from '../adapters';
import type { Answer, FieldReport, Profile } from '../types';
import { checkCancel, status } from './control';
import { scanFields, currentValue, type Field } from './fields';
import { matchOption, norm, type Desired } from './match';
import { entryFor, fillSections } from './sections';
import { fillField } from './widgets';

export interface FillPageOptions {
  profile: Profile;
  resume?: File;
  adapter: Adapter;
  learned: Answer[];
  overwrite: boolean;
  onNavigate?: () => void;
  onProgress?: (fields: FieldReport[]) => void;
}

export interface FillSingleOptions {
  profile: Profile;
  resume?: File;
  adapter: Adapter;
  learned: Answer[];
  overwrite: boolean;
}

export function matchProfileField(f: Field, profile: Profile): Desired | null {
  const label = norm(f.label || f.hints || '');
  if (!label) return null;

  // Personal details
  if (/\bfirst\s*name\b|\bgiven\s*name\b|\bfname\b/.test(label)) {
    const val = profile.firstName || (profile.name ? profile.name.split(' ')[0] : '');
    return val ? { text: val } : null;
  }
  if (/\blast\s*name\b|\bsurname\b|\bfamily\s*name\b|\blname\b/.test(label)) {
    const parts = (profile.name || '').split(' ');
    const val = profile.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : '');
    return val ? { text: val } : null;
  }
  if (/\bfull\s*name\b|^name\b|\blegal\s*name\b/.test(label)) {
    const val = profile.name || [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    return val ? { text: val } : null;
  }
  if (/\be-?mail\b/.test(label)) {
    return profile.email ? { text: profile.email } : null;
  }
  if (/\bphone\b|\bmobile\b|\bcell\b|\btelephone\b/.test(label)) {
    return profile.phone ? { text: profile.phone } : null;
  }
  if (/\bcity\b/.test(label)) {
    return profile.city ? { text: profile.city } : null;
  }
  if (/\bstate\b|\bprovince\b/.test(label)) {
    return profile.state ? { text: profile.state } : null;
  }
  if (/\bzip\b|\bpostal\b/.test(label)) {
    return profile.zip ? { text: profile.zip } : null;
  }
  if (/\bcountry\b/.test(label)) {
    return profile.country ? { text: profile.country } : null;
  }
  if (/\baddress\b|\bstreet\b/.test(label)) {
    return profile.address ? { text: profile.address } : null;
  }
  if (/\blinkedin\b/.test(label)) {
    const val = profile.linkedin || profile.linkedin_url;
    return val ? { text: String(val) } : null;
  }
  if (/\bgithub\b/.test(label)) {
    const val = profile.github || profile.github_url;
    return val ? { text: String(val) } : null;
  }
  if (/\bwebsite\b|\bportfolio\b/.test(label)) {
    const val = profile.website || profile.portfolio_url;
    return val ? { text: String(val) } : null;
  }

  return null;
}

export function matchLearnedField(f: Field, learned: Answer[]): Desired | null {
  const text = norm(f.label || f.hints || '');
  if (!text) return null;
  for (const item of learned) {
    if (item.pattern && text.includes(norm(item.pattern))) {
      return { text: item.answer };
    }
  }
  return null;
}

export async function fillSingle(f: Field, opts: FillSingleOptions): Promise<FieldReport | null> {
  const entryMatch = entryFor(f, opts.profile);
  if (entryMatch) {
    const d = entryMatch.resolver(f, norm(f.label), entryMatch.entry);
    if (d && d !== 'skip' && d !== 'ask') {
      const res = await fillField(f, d, opts.overwrite);
      return {
        id: f.id,
        label: `${entryMatch.name}: ${f.label || f.hints}`,
        status: res.ok ? 'filled' : 'flagged',
        confidence: res.match,
        value: res.value,
        reason: res.reason,
        required: f.required,
      };
    }
  }

  const ctx: FillContext = {
    profile: opts.profile,
    resume: opts.resume,
    learned: opts.learned,
    overwrite: opts.overwrite,
    handled: new Set(),
    extra: [],
  };

  if (opts.adapter.fillOne) {
    const adapterRes = await opts.adapter.fillOne(ctx, f);
    if (adapterRes) return adapterRes;
  }

  // Handle file uploads
  if (f.kind === 'file' && opts.resume) {
    const input = f.el as HTMLInputElement;
    try {
      const dt = new DataTransfer();
      dt.items.add(opts.resume);
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        id: f.id,
        label: f.label || 'Resume',
        status: 'filled',
        confidence: 1,
        value: opts.resume.name,
        required: f.required,
      };
    } catch {
      // DataTransfer might not be supported in some environments
    }
  }

  const desired = matchLearnedField(f, opts.learned) || matchProfileField(f, opts.profile);
  if (desired) {
    const res = await fillField(f, desired, opts.overwrite);
    return {
      id: f.id,
      label: f.label || f.hints,
      status: res.ok ? 'filled' : 'flagged',
      confidence: res.match,
      value: res.value,
      reason: res.reason,
      required: f.required,
    };
  }

  const cur = currentValue(f);
  if (cur) {
    return {
      id: f.id,
      label: f.label || f.hints,
      status: 'skipped',
      confidence: 1,
      value: cur,
      reason: 'Already filled',
      required: f.required,
    };
  }

  if (f.required) {
    return {
      id: f.id,
      label: f.label || f.hints,
      status: 'flagged',
      confidence: 0,
      reason: 'Missing profile info for required field',
      required: true,
    };
  }

  return null;
}

export async function fillPage(opts: FillPageOptions): Promise<FieldReport[]> {
  const reports: FieldReport[] = [];
  const handled = new Set<string>();

  const ctx: FillContext = {
    profile: opts.profile,
    resume: opts.resume,
    learned: opts.learned,
    overwrite: opts.overwrite,
    handled,
    extra: reports,
    onNavigate: opts.onNavigate,
    onProgress: opts.onProgress,
  };

  // Upload resume if adapter provides input
  if (opts.resume && opts.adapter.resumeInput) {
    const resumeEl = opts.adapter.resumeInput();
    if (resumeEl) {
      try {
        const dt = new DataTransfer();
        dt.items.add(opts.resume);
        resumeEl.files = dt.files;
        resumeEl.dispatchEvent(new Event('input', { bubbles: true }));
        resumeEl.dispatchEvent(new Event('change', { bubbles: true }));
        handled.add(resumeEl.getAttribute('data-rej-id') || '');
        if (opts.adapter.waitResumeProcessed) {
          await opts.adapter.waitResumeProcessed(resumeEl, opts.resume);
        }
      } catch (err) {
        // Resume upload best-effort
      }
    }
  }

  // ATS adapter special repeatable sections (e.g. Workday)
  if (opts.adapter.fillSpecial) {
    await opts.adapter.fillSpecial(ctx);
  }

  // Generic repeatable sections (Work, Education)
  await fillSections({
    profile: opts.profile,
    overwrite: opts.overwrite,
    handled,
    onRow: (r) => reports.push(r),
    fallback: async (f) => fillSingle(f, { ...opts }),
  });

  // General field scan and fill
  const allFields = scanFields();
  for (const f of allFields) {
    checkCancel();
    if (handled.has(f.id)) continue;
    handled.add(f.id);

    status(`Filling ${f.label || 'field'}…`);
    const r = await fillSingle(f, { ...opts });
    if (r) {
      reports.push(r);
      opts.onProgress?.([...reports]);
    }
  }

  return reports;
}

