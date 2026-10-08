import { NextResponse } from "next/server";

export interface GreenhouseJob {
  id: number;
  internal_job_id?: number;
  title: string;
  updated_at: string;
  first_published?: string;
  requisition_id?: string;
  absolute_url: string;
  location?: {
    name: string;
  };
  departments?: Array<{
    id: number;
    name: string;
    parent_id?: number | null;
    child_ids?: number[];
  }>;
  offices?: Array<{
    id: number;
    name: string;
    location?: string;
    parent_id?: number | null;
    child_ids?: number[];
  }>;
  content?: string;
  company_name?: string;
  company_slug?: string;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&bull;/g, "•")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&"); // Replace &amp; last
}

// In-memory cache for board content to prevent rate limits and provide instant detail lookups
const boardCache = new Map<string, { timestamp: number; jobs: any[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fetch with automatic retry on HTTP 429 (rate limiting) with exponential backoff
async function fetchWithRetry(url: string, retries = 3, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (res.status === 429 && attempt < retries - 1) {
        const retryAfter = res.headers.get("retry-after");
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  return fetch(url, { cache: "no-store" });
}

// Fetch all jobs for a Greenhouse board with content=true (with caching)
async function getGreenhouseBoardJobsWithContent(board: string): Promise<any[]> {
  const cached = boardCache.get(`gh-${board}`);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.jobs;
  }

  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    boardCache.set(`gh-${board}`, { timestamp: Date.now(), jobs });
    return jobs;
  } catch {
    return [];
  }
}

// Fetch all jobs for an Ashby board (with caching)
async function getAshbyBoardJobs(board: string): Promise<any[]> {
  const cached = boardCache.get(`ashby-${board}`);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.jobs;
  }

  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${board}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    boardCache.set(`ashby-${board}`, { timestamp: Date.now(), jobs });
    return jobs;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const portalParam = searchParams.get("portal")?.trim().toLowerCase();
  const boardParam = searchParams.get("board")?.trim().toLowerCase();
  const boardsParam = searchParams.get("boards")?.trim().toLowerCase();
  const withContent = searchParams.get("content") === "true";
  const jobId = searchParams.get("jobId")?.trim();
  const titleParam = searchParams.get("title")?.trim();
  const locationParam = searchParams.get("location")?.trim().toLowerCase();

  // 1. Single Job Details Endpoint: Lookup by jobId and/or title
  if (jobId || titleParam) {
    const board = boardParam || "stripe";
    const isAshby = portalParam === "ashby" || board === "ramp" || jobId?.startsWith("ashby-");

    // Handling Ashby boards (e.g. Ramp)
    if (isAshby) {
      const ashbyJobs = await getAshbyBoardJobs(board);
      const cleanJobId = jobId?.replace(/^ashby-[^-]+-/, "");
      
      let matched = ashbyJobs.find((j) => j.id === cleanJobId || j.id === jobId);
      if (!matched && titleParam) {
        const targetTitle = titleParam.toLowerCase();
        matched = ashbyJobs.find((j) => j.title?.toLowerCase().trim() === targetTitle);
        if (!matched) {
          matched = ashbyJobs.find((j) => j.title?.toLowerCase().includes(targetTitle));
        }
      }

      if (matched) {
        return NextResponse.json({
          portal: "Ashby",
          board_token: board,
          endpoint_called: `https://api.ashbyhq.com/posting-api/job-board/${board}`,
          job: {
            id: matched.id,
            title: matched.title,
            company_name: board.charAt(0).toUpperCase() + board.slice(1),
            company_slug: board,
            location: { name: matched.locationName || matched.location || "Remote" },
            departments: [{ id: 1, name: matched.departmentName || matched.department || "General" }],
            absolute_url: matched.jobUrl || matched.applyUrl || `https://jobs.ashbyhq.com/${board}/${matched.id}`,
            content: matched.descriptionHtml || matched.descriptionPlain || null,
            raw_content: matched.descriptionHtml,
            updated_at: matched.publishedAt || new Date().toISOString(),
          },
        });
      }
    }

    // Handling Greenhouse boards
    // A. First try direct endpoint: GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
    // Only attempt if jobId is numeric (real Greenhouse job IDs are integers like 8172508)
    const isNumericId = jobId && /^\d+$/.test(jobId);
    if (isNumericId) {
      const targetUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`;
      try {
        const res = await fetchWithRetry(targetUrl);
        if (res.ok) {
          const jobData = await res.json();
          if (jobData && (jobData.content || jobData.title)) {
            const decodedContent = jobData.content ? decodeHtmlEntities(jobData.content) : null;
            return NextResponse.json({
              portal: "Greenhouse",
              board_token: board,
              endpoint_called: targetUrl,
              job: {
                ...jobData,
                company_name: jobData.company_name || board.charAt(0).toUpperCase() + board.slice(1),
                company_slug: board,
                raw_content: jobData.content,
                content: decodedContent,
              },
            });
          }
        }
      } catch {
        // Fallback to board search below
      }
    }

    // B. Smart Fallback: Fetch all jobs for this board with content=true and search by ID or title
    const allBoardJobs = await getGreenhouseBoardJobsWithContent(board);
    if (allBoardJobs.length > 0) {
      let matchedJob: any = null;

      // 1. Match by numeric ID
      if (isNumericId) {
        matchedJob = allBoardJobs.find((j) => j.id === Number(jobId));
      }

      // 2. Match by exact title
      if (!matchedJob && titleParam) {
        const targetTitle = titleParam.toLowerCase().trim();
        const titleMatches = allBoardJobs.filter((j) => j.title?.toLowerCase().trim() === targetTitle);
        if (titleMatches.length === 1) {
          matchedJob = titleMatches[0];
        } else if (titleMatches.length > 1 && locationParam) {
          matchedJob = titleMatches.find((j) => j.location?.name?.toLowerCase().includes(locationParam)) || titleMatches[0];
        } else if (titleMatches.length > 0) {
          matchedJob = titleMatches[0];
        }
      }

      // 3. Match by partial title
      if (!matchedJob && titleParam) {
        const targetTitle = titleParam.toLowerCase().trim();
        const partialMatches = allBoardJobs.filter((j) => j.title?.toLowerCase().includes(targetTitle));
        if (partialMatches.length > 0) {
          matchedJob = locationParam
            ? partialMatches.find((j) => j.location?.name?.toLowerCase().includes(locationParam)) || partialMatches[0]
            : partialMatches[0];
        }
      }

      if (matchedJob) {
        const decodedContent = matchedJob.content ? decodeHtmlEntities(matchedJob.content) : null;
        return NextResponse.json({
          portal: "Greenhouse",
          board_token: board,
          endpoint_called: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
          matched_by: isNumericId ? "id" : "title_search",
          job: {
            ...matchedJob,
            company_name: matchedJob.company_name || board.charAt(0).toUpperCase() + board.slice(1),
            company_slug: board,
            raw_content: matchedJob.content,
            content: decodedContent,
          },
        });
      }
    }

    return NextResponse.json(
      {
        error: `Job not found on ${board} board`,
        board_token: board,
        jobId,
        title: titleParam,
      },
      { status: 404 }
    );
  }

  // 2. Multi-Board Aggregation: ?boards=stripe,anthropic,airbnb,gitlab,figma
  if (boardsParam) {
    const boardTokens = boardsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const results = await Promise.allSettled(
      boardTokens.map(async (token) => {
        const url = withContent
          ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`
          : `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
        const res = await fetchWithRetry(url);
        if (!res.ok) return [];
        const data = await res.json();
        const rawJobs: GreenhouseJob[] = Array.isArray(data.jobs) ? data.jobs : [];
        return rawJobs.map((j) => ({
          ...j,
          company_name: token.charAt(0).toUpperCase() + token.slice(1),
          company_slug: token,
          raw_content: j.content,
          content: j.content ? decodeHtmlEntities(j.content) : undefined,
        }));
      })
    );

    const aggregatedJobs: GreenhouseJob[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        aggregatedJobs.push(...r.value);
      }
    }

    return NextResponse.json({
      boards: boardTokens,
      has_content: withContent,
      total: aggregatedJobs.length,
      meta: { total: aggregatedJobs.length },
      jobs: aggregatedJobs,
    });
  }

  // 3. Single Board Jobs List:
  // - GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
  // - GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
  const board = boardParam || "stripe";
  const targetUrl = withContent
    ? `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`
    : `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;

  try {
    const res = await fetchWithRetry(targetUrl);

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Greenhouse API returned status ${res.status} for board '${board}'`,
          board_token: board,
          endpoint_called: targetUrl,
          jobs: [],
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawJobs: GreenhouseJob[] = Array.isArray(data.jobs) ? data.jobs : [];

    const jobs = rawJobs.map((job) => ({
      ...job,
      company_name: job.company_name || board.charAt(0).toUpperCase() + board.slice(1),
      company_slug: board,
      raw_content: job.content,
      content: job.content ? decodeHtmlEntities(job.content) : undefined,
    }));

    return NextResponse.json({
      board_token: board,
      endpoint_called: targetUrl,
      has_content: withContent,
      total: jobs.length,
      meta: { total: jobs.length },
      jobs,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch jobs from Greenhouse API",
        details: err?.message || String(err),
        board_token: board,
        endpoint_called: targetUrl,
        jobs: [],
      },
      { status: 502 }
    );
  }
}
