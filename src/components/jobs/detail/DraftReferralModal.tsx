'use client';

import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

interface DraftReferralModalProps {
  isOpen: boolean;
  companyName: string;
  jobTitle: string;
  onClose: () => void;
}

export function DraftReferralModal({
  isOpen,
  companyName,
  jobTitle,
  onClose,
}: DraftReferralModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const referralMessage = `Hi there! I saw that ${companyName} is hiring for ${jobTitle}. With my background in engineering leadership, agile product development, and building scalable platforms, I would love to connect and learn more about the team. If you're open to submitting a quick referral, I'd really appreciate it!`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="referral-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <h3 id="referral-modal-title" className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Draft Referral Request
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Copy this personalized draft to message team members or mutual connections at {companyName} on LinkedIn:
        </p>
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {referralMessage}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy to clipboard'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

