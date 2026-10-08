import { NextResponse } from "next/server";

export interface PublicJob {
  id: string;
  title: string;
  company: string;
  companySlug: string;
  portal: "Greenhouse" | "Ashby";
  location: string;
  department: string;
  type: string;
  url: string;
  updatedAt: string;
}

const GREENHOUSE_COMPANIES = [
  { name: "Stripe", slug: "stripe" },
  { name: "Cloudflare", slug: "cloudflare" },
  { name: "Figma", slug: "figma" },
  { name: "Reddit", slug: "reddit" },
  { name: "Coinbase", slug: "coinbase" },
  { name: "Datadog", slug: "datadog" },
  { name: "Airbnb", slug: "airbnb" },
  { name: "Discord", slug: "discord" },
];

const ASHBY_COMPANIES = [
  { name: "Ramp", slug: "ramp" },
];

// Simple in-memory cache to prevent rate-limiting and ensure instant sub-millisecond responses
let cachedJobs: PublicJob[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function fetchGreenhouseJobs(company: { name: string; slug: string }): Promise<PublicJob[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.slice(0, 40).map((job: any) => ({
      id: `gh-${company.slug}-${job.id}`,
      title: job.title || "Untitled Role",
      company: company.name,
      companySlug: company.slug,
      portal: "Greenhouse" as const,
      location: job.location?.name || "Remote / Unspecified",
      department: job.departments?.[0]?.name || "General",
      type: "Full-time",
      url: job.absolute_url || `https://boards.greenhouse.io/${company.slug}/jobs/${job.id}`,
      updatedAt: job.updated_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

async function fetchAshbyJobs(company: { name: string; slug: string }): Promise<PublicJob[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company.slug}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.slice(0, 40).map((job: any) => ({
      id: `ashby-${company.slug}-${job.id}`,
      title: job.title || "Untitled Role",
      company: company.name,
      companySlug: company.slug,
      portal: "Ashby" as const,
      location: job.locationName || "Remote / Unspecified",
      department: job.departmentName || "General",
      type: job.employmentType || "Full-time",
      url: job.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${job.id}`,
      updatedAt: job.publishedAt || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

async function getAllJobs(): Promise<PublicJob[]> {
  const now = Date.now();
  if (cachedJobs.length > 0 && now - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedJobs;
  }

  const greenhousePromises = GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs);
  const ashbyPromises = ASHBY_COMPANIES.map(fetchAshbyJobs);

  const results = await Promise.all([...greenhousePromises, ...ashbyPromises]);
  const flattened = results.flat();

  if (flattened.length > 0) {
    cachedJobs = flattened;
    cacheTimestamp = now;
  }

  return cachedJobs.length > 0 ? cachedJobs : flattened;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const portal = searchParams.get("portal");
  const search = searchParams.get("search")?.toLowerCase();

  let jobs = await getAllJobs();

  if (company && company !== "all") {
    jobs = jobs.filter((j) => j.companySlug.toLowerCase() === company.toLowerCase());
  }

  if (portal && portal !== "all") {
    jobs = jobs.filter((j) => j.portal.toLowerCase() === portal.toLowerCase());
  }

  if (search) {
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(search) ||
        j.department.toLowerCase().includes(search) ||
        j.location.toLowerCase().includes(search) ||
        j.company.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({
    total: jobs.length,
    companies: [
      ...GREENHOUSE_COMPANIES.map((c) => ({ ...c, portal: "Greenhouse" })),
      ...ASHBY_COMPANIES.map((c) => ({ ...c, portal: "Ashby" })),
    ],
    jobs,
  });
}
