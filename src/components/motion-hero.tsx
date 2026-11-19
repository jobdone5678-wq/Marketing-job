'use client';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export function MotionHero() {
  return (
    <div className="relative hidden h-full items-end overflow-hidden bg-black select-none lg:flex">
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Scrim so the text stays legible over the footage */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/85 via-black/35 to-black/15" />

      <div className="relative z-10 w-full px-10 pb-14 xl:px-14 xl:pb-16">
        <h1
          className="animate-fade-rise max-w-xl text-[44px] leading-[1.05] font-normal tracking-[-0.02em] text-white xl:text-[56px]"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Every placement starts with a record someone can trust
        </h1>

        <p className="animate-fade-rise-delay mt-5 max-w-md text-[15px] leading-6 text-white/75">
          Nextkinlife keeps candidates, submissions and employer confirmations in one portal, so
          recruiters and clients work from the same verified history.
        </p>
      </div>
    </div>
  );
}
