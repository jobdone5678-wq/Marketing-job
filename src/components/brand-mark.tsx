import * as React from 'react';

/**
 * Nextkinlife logo (public/logo.png) — the single source of truth for the brand mark.
 */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Nextkinlife"
      width={313}
      height={349}
      className={`inline-block shrink-0 object-contain ${className}`}
    />
  );
}

/**
 * The receipt stamp. Signature detail — used only where a record is verified.
 */
export function VerifiedStamp({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      className={`bg-primary/12 text-primary ring-primary/25 inline-flex shrink-0 items-center justify-center rounded-[4px] ring-1 ring-inset ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
        <path
          d="M2.5 6.2 4.6 8.3 9.5 3.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
