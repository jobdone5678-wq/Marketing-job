"use client";

import { CheckCircle2, Sparkles, Users } from "lucide-react";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";

export function MotionHero() {
  return (
    <div className="relative hidden lg:flex items-center justify-center h-full overflow-hidden bg-black select-none">
      {/* Fullscreen Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-85"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Cinematic Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30 z-[1] pointer-events-none" />

      {/* Centered Cinematic Headline & Subtext */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 xl:px-12 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/90 text-xs font-medium mb-6 shadow-lg">
          <Sparkles className="size-3.5 text-amber-300" />
          Next-Generation Recruiting Infrastructure
        </div>

        <h1
          className="text-5xl xl:text-6xl 2xl:text-7xl leading-[0.98] tracking-[-1.8px] font-normal text-white animate-fade-rise drop-shadow-sm"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Where{" "}
          <em className="not-italic text-zinc-300">dreams</em> rise{" "}
          <em className="not-italic text-zinc-300">through the silence.</em>
        </h1>

        <p className="text-zinc-300/95 text-sm xl:text-base max-w-lg mt-6 leading-relaxed animate-fade-rise-delay">
          Connecting top marketing talent, recruiters, and forward-thinking clients.
          Discover curated opportunities, track hiring pipelines, and build
          exceptional teams in one unified portal.
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80 text-xs">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span>Curated Bench Network</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80 text-xs">
            <Users className="size-3.5 text-primary" />
            <span>Verified Candidate Matching</span>
          </div>
        </div>
      </div>
    </div>
  );
}
