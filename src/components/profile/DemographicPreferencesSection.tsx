'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, AlertCircle } from 'lucide-react';
import {
  demographicFields,
  demographicKeys,
  parseDemographicPreferences,
  type DemographicKey,
  type DemographicPreferences,
} from '@/lib/profile/demographic-preferences';
import { DEMOGRAPHIC_FIELD_OPTIONS } from '@/lib/profile/demographic-options';
import { Button } from '@/components/ui/button';

interface DemographicPreferencesSectionProps {
  onStatusChange?: (prefs: DemographicPreferences) => void;
}

const EMPTY_PREFS: DemographicPreferences = { enabled: false, answers: {} };

export function DemographicPreferencesSection({ onStatusChange }: DemographicPreferencesSectionProps) {
  const [prefs, setPrefs] = useState<DemographicPreferences>(EMPTY_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saveSeqRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await fetch('/api/v1/me/demographic-preferences', {
          credentials: 'include',
          cache: 'no-store',
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.error || 'Could not load demographic preferences.');
        }
        if (!cancelled) {
          const loaded = parseDemographicPreferences(body.demographic_preferences);
          setPrefs(loaded);
          onStatusChangeRef.current?.(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Could not load demographic preferences.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistPreferences(next: DemographicPreferences) {
    const seq = ++saveSeqRef.current;
    setPrefs(next);
    onStatusChange?.(next);
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage('Saving to Supabase...');

    try {
      const res = await fetch('/api/v1/me/demographic-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || 'Could not save demographic preferences.');
      }
      if (seq === saveSeqRef.current) {
        const saved = parseDemographicPreferences(body.demographic_preferences);
        setPrefs(saved);
        onStatusChange?.(saved);
        setStatusMessage('Saved to Supabase');
      }
    } catch (err) {
      if (seq === saveSeqRef.current) {
        setStatusMessage(null);
        setErrorMessage(err instanceof Error ? err.message : 'Could not save demographic preferences.');
      }
    } finally {
      if (seq === saveSeqRef.current) setSaving(false);
    }
  }

  function handleToggle(enabled: boolean) {
    const next = parseDemographicPreferences({ ...prefs, enabled });
    void persistPreferences(next);
  }

  function handleSelectChange(key: DemographicKey, value: string) {
    const hadAnyAnswers = Object.keys(prefs.answers).length > 0;
    const nextAnswers: DemographicPreferences['answers'] = { ...prefs.answers };
    if (value) {
      nextAnswers[key] = [value];
    } else {
      delete nextAnswers[key];
    }
    const nextEnabled = value && !prefs.enabled && !hadAnyAnswers ? true : prefs.enabled;
    const next = parseDemographicPreferences({ enabled: nextEnabled, answers: nextAnswers });
    void persistPreferences(next);
  }

  async function handleClear() {
    const seq = ++saveSeqRef.current;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage('Clearing preferences...');
    try {
      const res = await fetch('/api/v1/me/demographic-preferences', {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || 'Could not clear demographic preferences.');
      }
      if (seq === saveSeqRef.current) {
        setPrefs(EMPTY_PREFS);
        onStatusChange?.(EMPTY_PREFS);
        setStatusMessage('Saved preferences cleared');
      }
    } catch (err) {
      if (seq === saveSeqRef.current) {
        setStatusMessage(null);
        setErrorMessage(err instanceof Error ? err.message : 'Could not clear demographic preferences.');
      }
    } finally {
      if (seq === saveSeqRef.current) setSaving(false);
    }
  }

  const configuredCount = Object.keys(prefs.answers).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4.5 text-lime-700 dark:text-lime-500" />
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Demographic autofill preferences
            </h2>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Select your optional EEO &amp; demographic answers below. Selections save directly to your Supabase profile and are used by the browser extension to autofill matching dropdowns, radios, and checkboxes on job portals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </span>
          )}
          {!saving && statusMessage && !errorMessage && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {statusMessage}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={loading || saving || (!prefs.enabled && configuredCount === 0)}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="size-3.5" />
            Clear saved preferences
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <section className="space-y-5 rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200/80 bg-neutral-50/70 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
          <input
            type="checkbox"
            checked={prefs.enabled}
            disabled={loading}
            onChange={(e) => handleToggle(e.target.checked)}
            className="mt-0.5 size-4 rounded border-neutral-300 text-lime-700 focus:ring-lime-600"
          />
          <div className="space-y-0.5">
            <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Use my saved demographic answers when I click Autofill
            </span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              Leave any dropdown as &ldquo;Not specified&rdquo; to answer it manually on a portal, or choose &ldquo;Prefer not to say&rdquo; to auto-select decline options when offered unambiguously.
            </span>
          </div>
        </label>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-neutral-500">
            <Loader2 className="size-4 animate-spin" />
            Loading saved demographic preferences...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {demographicKeys.map((key) => {
              const [label] = demographicFields[key];
              const options = DEMOGRAPHIC_FIELD_OPTIONS[key];
              const currentValue = prefs.answers[key]?.[0] ?? '';
              const hasCustomValue =
                Boolean(currentValue) && !options.some((opt) => opt.value === currentValue);

              return (
                <label key={key} className="flex flex-col gap-1.5 text-xs">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
                  <select
                    aria-label={label}
                    value={currentValue}
                    onChange={(e) => handleSelectChange(key, e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-2xs transition-colors focus:border-lime-600 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">Not specified (skip)</option>
                    {hasCustomValue && (
                      <option value={currentValue}>{currentValue}</option>
                    )}
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
