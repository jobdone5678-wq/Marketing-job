'use client';

import { CheckCircle2, Sparkles, Users } from 'lucide-react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export function MotionHero() {
  return (
    <div className="relative hidden h-full items-center justify-center overflow-hidden bg-black select-none lg:flex">
      {/* Fullscreen Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-85"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Cinematic Vignette Overlay */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/40 to-black/30" />

      {/* Centered Cinematic Headline & Subtext */}
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center justify-center px-8 text-center xl:px-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 shadow-lg backdrop-blur-md">
          <Sparkles className="size-3.5 text-amber-300" />
          Next-Generation Recruiting Infrastructure
        </div>

        <h1
          className="animate-fade-rise text-5xl leading-[0.98] font-normal tracking-[-1.8px] text-white drop-shadow-sm xl:text-6xl 2xl:text-7xl"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Where <em className="text-zinc-300 not-italic">dreams</em> rise{' '}
          <em className="text-zinc-300 not-italic">through the silence.</em>
        </h1>

        <p className="animate-fade-rise-delay mt-6 max-w-lg text-sm leading-relaxed text-zinc-300/95 xl:text-base">
          Connecting top marketing talent, recruiters, and forward-thinking clients. Discover
          curated opportunities, track hiring pipelines, and build exceptional teams in one unified
          portal.
        </p>

        {/* Feature Pills */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-md">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span>Curated Bench Network</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-md">
            <Users className="text-primary size-3.5" />
            <span>Verified Candidate Matching</span>
          </div>
        </div>
      </div>
    </div>
  );
}
