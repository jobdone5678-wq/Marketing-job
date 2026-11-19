'use client';

import React from 'react';

export type SkillCategory =
  | 'Languages & Core'
  | 'Frontend & Mobile'
  | 'Backend & APIs'
  | 'Cloud & DevOps'
  | 'Data, AI & Storage'
  | 'Security & Compliance'
  | 'Practices & Architecture';

// High-trust, accessible, vibrant color tokens by Skill Category
const CATEGORY_STYLES: Record<
  SkillCategory | 'default',
  {
    bg: string;
    text: string;
    border: string;
    hover: string;
    dot: string;
  }
> = {
  'Languages & Core': {
    bg: 'bg-muted ',
    text: 'text-muted-foreground font-medium',
    border: 'border-border dark:border-blue-500/35',
    hover: 'hover:bg-blue-500/20 hover:border-blue-500/40',
    dot: 'bg-muted',
  },
  'Frontend & Mobile': {
    bg: 'bg-muted ',
    text: 'text-muted-foreground font-medium',
    border: 'border-border dark:border-violet-500/35',
    hover: 'hover:bg-violet-500/20 hover:border-violet-500/40',
    dot: 'bg-muted',
  },
  'Backend & APIs': {
    bg: 'bg-primary/10 ',
    text: 'text-primary font-medium',
    border: 'border-primary/20 dark:border-emerald-500/35',
    hover: 'hover:bg-emerald-500/20 hover:border-emerald-500/40',
    dot: 'bg-primary',
  },
  'Cloud & DevOps': {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-400 font-medium',
    border: 'border-amber-500/20 dark:border-amber-500/35',
    hover: 'hover:bg-amber-500/20 hover:border-amber-500/40',
    dot: 'bg-amber-500',
  },
  'Data, AI & Storage': {
    bg: 'bg-muted ',
    text: 'text-muted-foreground font-medium',
    border: 'border-border dark:border-cyan-500/35',
    hover: 'hover:bg-cyan-500/20 hover:border-cyan-500/40',
    dot: 'bg-muted',
  },
  'Security & Compliance': {
    bg: 'bg-destructive/10 dark:bg-rose-500/15',
    text: 'text-destructive dark:text-rose-300 font-medium',
    border: 'border-destructive/20 dark:border-rose-500/35',
    hover: 'hover:bg-rose-500/20 hover:border-rose-500/40',
    dot: 'bg-rose-500',
  },
  'Practices & Architecture': {
    bg: 'bg-slate-500/10 dark:bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300 font-medium',
    border: 'border-slate-500/25 dark:border-slate-500/35',
    hover: 'hover:bg-slate-500/20 hover:border-slate-500/40',
    dot: 'bg-slate-500',
  },
  default: {
    bg: 'bg-primary/10',
    text: 'text-primary font-medium',
    border: 'border-primary/20',
    hover: 'hover:bg-primary/15 hover:border-primary/30',
    dot: 'bg-primary',
  },
};

// Automatic categorizer fallback for skills that don't have explicit category attached
const SKILL_CATEGORY_MAP: Record<string, SkillCategory> = {
  // Languages
  python: 'Languages & Core',
  typescript: 'Languages & Core',
  javascript: 'Languages & Core',
  golang: 'Languages & Core',
  go: 'Languages & Core',
  java: 'Languages & Core',
  rust: 'Languages & Core',
  'c++': 'Languages & Core',
  c: 'Languages & Core',
  'c#': 'Languages & Core',
  sql: 'Languages & Core',
  scala: 'Languages & Core',
  ruby: 'Languages & Core',
  php: 'Languages & Core',
  bash: 'Languages & Core',
  swift: 'Languages & Core',
  kotlin: 'Languages & Core',

  // Frontend & Mobile
  react: 'Frontend & Mobile',
  'next.js': 'Frontend & Mobile',
  nextjs: 'Frontend & Mobile',
  vue: 'Frontend & Mobile',
  'vue.js': 'Frontend & Mobile',
  angular: 'Frontend & Mobile',
  tailwind: 'Frontend & Mobile',
  'tailwind css': 'Frontend & Mobile',
  'react native': 'Frontend & Mobile',
  flutter: 'Frontend & Mobile',
  ios: 'Frontend & Mobile',
  android: 'Frontend & Mobile',
  html: 'Frontend & Mobile',
  css: 'Frontend & Mobile',

  // Backend
  'node.js': 'Backend & APIs',
  nodejs: 'Backend & APIs',
  node: 'Backend & APIs',
  'spring boot': 'Backend & APIs',
  fastapi: 'Backend & APIs',
  django: 'Backend & APIs',
  graphql: 'Backend & APIs',
  rest: 'Backend & APIs',
  grpc: 'Backend & APIs',
  microservices: 'Backend & APIs',

  // Cloud & DevOps
  aws: 'Cloud & DevOps',
  gcp: 'Cloud & DevOps',
  azure: 'Cloud & DevOps',
  kubernetes: 'Cloud & DevOps',
  docker: 'Cloud & DevOps',
  terraform: 'Cloud & DevOps',
  'ci/cd': 'Cloud & DevOps',
  linux: 'Cloud & DevOps',

  // Data & AI
  pytorch: 'Data, AI & Storage',
  tensorflow: 'Data, AI & Storage',
  llm: 'Data, AI & Storage',
  postgres: 'Data, AI & Storage',
  postgresql: 'Data, AI & Storage',
  redis: 'Data, AI & Storage',
  mongodb: 'Data, AI & Storage',
  spark: 'Data, AI & Storage',
  kafka: 'Data, AI & Storage',
};

export function resolveSkillCategory(name: string, fallback?: SkillCategory): SkillCategory {
  if (fallback) return fallback;
  const clean = name.toLowerCase().trim();
  return SKILL_CATEGORY_MAP[clean] || 'Languages & Core';
}

interface SkillBadgeProps {
  name: string;
  category?: SkillCategory;
  isMatched?: boolean;
  size?: 'xs' | 'sm' | 'md';
  showDot?: boolean;
  className?: string;
  count?: number;
}

export function SkillBadge({
  name,
  category,
  isMatched = false,
  size = 'sm',
  showDot = true,
  className = '',
  count,
}: SkillBadgeProps) {
  const resolvedCategory = resolveSkillCategory(name, category);
  const styles = CATEGORY_STYLES[resolvedCategory] || CATEGORY_STYLES.default;

  const sizeClasses = {
    xs: 'text-[11px] px-2 py-0.5 rounded-[8px] gap-1',
    sm: 'text-[13px] px-2.5 py-1 rounded-[10px] gap-1.5',
    md: 'text-[13px] px-3 py-1.5 rounded-[12px] gap-2',
  }[size];

  return (
    <span
      className={`inline-flex items-center border transition-colors duration-150 select-none ${sizeClasses} ${
 isMatched
 ?'border-emerald-500/35 bg-primary/15 font-medium text-primary hover:bg-emerald-500/25 '
          : `${styles.bg} ${styles.text} ${styles.border} ${styles.hover}`
      } cursor-default ${className}`}
      title={`${name} · ${resolvedCategory}${isMatched ? ' (Matched with your profile)' : ''}`}
    >
      {isMatched ? (
        <span className="flex size-1.5 rounded-full bg-primary" />
      ) : showDot ? (
        <span className={`size-1.5 shrink-0 rounded-full ${styles.dot}`} />
      ) : null}
      <span className="max-w-[160px] truncate">{name}</span>
      {count !== undefined && count > 1 && (
        <span className="font-mono text-[11px] opacity-75">×{count}</span>
      )}
    </span>
  );
}
