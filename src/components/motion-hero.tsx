"use client";

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
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Centered Cinematic Headline & Subtext */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 xl:px-12 max-w-2xl mx-auto">
        <h1
          className="text-5xl xl:text-6xl 2xl:text-7xl leading-[0.98] tracking-[-1.8px] font-normal text-white animate-fade-rise"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Where{" "}
          <em className="not-italic text-zinc-300">dreams</em> rise{" "}
          <em className="not-italic text-zinc-300">through the silence.</em>
        </h1>

        <p className="text-zinc-300 text-sm xl:text-base max-w-lg mt-6 leading-relaxed animate-fade-rise-delay">
          Connecting top marketing talent, recruiters, and forward-thinking clients.
          Discover curated opportunities, track hiring pipelines, and build
          exceptional teams in one unified portal.
        </p>
      </div>
    </div>
  );
}
