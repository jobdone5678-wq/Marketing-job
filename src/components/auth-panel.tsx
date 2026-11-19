'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { SignupForm } from '@/components/signup-form';

export function AuthPanel() {
  return (
    <div className="bg-background border-border relative flex h-full flex-col justify-between overflow-y-auto border-r p-6 select-none md:p-8 lg:p-12">
      {/* Brand */}
      <div className="flex w-full items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark className="size-8" />
          <span className="flex min-w-0 flex-col">
            <span className="text-foreground text-[13px] leading-4 font-medium">Nextkinlife</span>
            <span className="text-muted-foreground text-[11px] leading-4">Recruiter portal</span>
          </span>
        </Link>

        <Link
          href="/auth/jobseeker"
          className="text-muted-foreground hover:text-foreground text-[13px] transition-colors"
        >
          Candidate sign in
        </Link>
      </div>

      {/* Sign in */}
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm sm:max-w-md">
          <SignupForm />
        </div>
      </div>

      {/* Footer */}
      <div className="text-muted-foreground border-border flex flex-col items-center justify-between gap-2 border-t pt-5 text-[13px] sm:flex-row">
        <span>© {new Date().getFullYear()} Nextkinlife LLC</span>
        <Link href="/auth/jobseeker" className="hover:text-foreground transition-colors">
          Looking for a job?
        </Link>
      </div>
    </div>
  );
}
