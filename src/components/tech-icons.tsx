import {
  siPython,
  siDebian,
  siUbuntu,
  siCplusplus,
  siKubernetes,
  siLinux,
  siRust,
  siAngular,
} from 'simple-icons';

export function TeoresiLogo({ className = 'size-8' }: { className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-lg bg-card border border-border/80 shadow-2xs overflow-hidden shrink-0 ${className}`}
    >
      <svg viewBox="0 0 40 40" fill="none" className="size-full p-1" aria-hidden="true">
        {/* Stylized T logo matching Teoresi Group */}
        <rect x="8" y="8" width="10" height="10" rx="2" fill="#0284C7" />
        <rect x="8" y="22" width="10" height="10" rx="2" fill="#EA580C" />
        <rect x="22" y="8" width="10" height="10" rx="2" fill="#0284C7" />
      </svg>
    </div>
  );
}

export function LinkedInIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[3px] bg-[#0077b5] text-white p-0.5 shrink-0">
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
      </svg>
    </span>
  );
}

export function TechBadgeIcon({
  skill,
  className = 'size-3',
}: {
  skill: string;
  className?: string;
}) {
  const s = skill.toLowerCase().replace(/[-_ ]/g, '');

  if (s.includes('c#') || s.includes('csharp')) {
    return (
      <span className="text-[#9B4F96] font-bold text-[9px] leading-none shrink-0">
        C#
      </span>
    );
  }

  if (s.includes('python')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siPython.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siPython.path} />
      </svg>
    );
  }

  if (s.includes('rust')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siRust.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siRust.path} />
      </svg>
    );
  }

  if (s.includes('javascript') || s === 'js') {
    return (
      <span className="inline-flex size-3.5 items-center justify-center rounded-[2px] bg-[#f7df1e] text-black font-extrabold text-[8px] leading-none shrink-0">
        JS
      </span>
    );
  }

  if (s.includes('kubernetes') || s === 'k8s') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siKubernetes.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siKubernetes.path} />
      </svg>
    );
  }

  if (s.includes('ubuntu')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siUbuntu.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siUbuntu.path} />
      </svg>
    );
  }

  if (s.includes('debian')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siDebian.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siDebian.path} />
      </svg>
    );
  }

  if (s.includes('linux')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
      >
        <path d={siLinux.path} />
      </svg>
    );
  }

  if (s.includes('c++') || s.includes('cpp')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siCplusplus.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siCplusplus.path} />
      </svg>
    );
  }

  if (s.includes('angular')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill={`#${siAngular.hex}`}
        className={className}
        aria-hidden="true"
      >
        <path d={siAngular.path} />
      </svg>
    );
  }

  if (s.includes('aws')) {
    return (
      <span className="text-[#ff9900] font-bold text-[9px] leading-none">
        AWS
      </span>
    );
  }

  if (s.includes('azure')) {
    return (
      <span className="text-[#0089d6] font-bold text-[9px] leading-none">
        ☁
      </span>
    );
  }

  return null;
}
