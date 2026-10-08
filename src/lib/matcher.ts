import type { Candidate } from "@/types/database";

export interface SkillMatchResult {
  score: number; // 0 - 100
  matchedSkills: string[];
  missingSkills: string[];
  candidateSkills: string[];
  jobKeywords: string[];
  strengths: string[];
  visaCompatibility: {
    status: string;
    isCompatible: boolean;
    note: string;
  };
  pitchEmail: string;
  rtrText: string;
  tailoredResumeBullets: string[];
}

// Common tech keywords dictionary for extraction
const TECH_KEYWORDS = [
  "python", "sql", "apache spark", "spark", "snowflake", "aws", "azure", "gcp",
  "databricks", "airflow", "kafka", "hadoop", "dbt", "bigquery", "redshift",
  "docker", "kubernetes", "terraform", "ci/cd", "git", "linux", "jenkins",
  "scala", "java", "typescript", "javascript", "react", "next.js", "node.js",
  "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "nosql",
  "mongodb", "postgresql", "mysql", "data warehouse", "etl", "data pipeline",
  "rest api", "graphql", "microservices", "flink", "hive", "presto", "trino"
];

/**
 * Extracts recognized tech keywords from raw text (HTML or plain text)
 */
export function extractKeywords(text: string): string[] {
  const clean = text.toLowerCase().replace(/<[^>]*>/g, " ");
  const found = new Set<string>();

  for (const kw of TECH_KEYWORDS) {
    // Word boundary or containment
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(clean)) {
      // Capitalize nicely
      const formatted = kw
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      found.add(formatted);
    }
  }

  return Array.from(found);
}

/**
 * Analyzes candidate profile vs a target job description and generates match metrics & kits
 */
export function analyzeCandidateJobMatch(
  candidate: Candidate,
  job: {
    id?: string;
    title: string;
    company: string;
    description: string;
    location?: string;
  },
  recruiterName = "Rahul Sharma",
  vendorName = "Prime Vendor"
): SkillMatchResult {
  const candidateSkillsRaw = [
    candidate.primary_skills || "",
    candidate.secondary_skills || "",
    candidate.certifications || "",
    candidate.current_job_title || "",
  ].join(", ");

  const candidateKeywords = extractKeywords(candidateSkillsRaw);
  const jobKeywords = extractKeywords(
    `${job.title} ${job.description} ${job.company}`
  );

  // If candidate has primary_skills listed, also split by comma
  if (candidate.primary_skills) {
    candidate.primary_skills.split(",").forEach((s) => {
      const clean = s.trim();
      if (clean && !candidateKeywords.some((k) => k.toLowerCase() === clean.toLowerCase())) {
        candidateKeywords.push(clean);
      }
    });
  }

  // Calculate matched and missing
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  const candidateLower = candidateKeywords.map((k) => k.toLowerCase());

  jobKeywords.forEach((jk) => {
    if (candidateLower.some((ck) => ck.includes(jk.toLowerCase()) || jk.toLowerCase().includes(ck))) {
      matchedSkills.push(jk);
    } else {
      missingSkills.push(jk);
    }
  });

  // Also include skills candidate has that align with job title
  candidateKeywords.forEach((ck) => {
    if (
      !matchedSkills.includes(ck) &&
      job.title.toLowerCase().includes(ck.toLowerCase())
    ) {
      matchedSkills.push(ck);
    }
  });

  // Calculate match score
  let score = 75; // Baseline qualification
  if (jobKeywords.length > 0) {
    const ratio = matchedSkills.length / Math.max(jobKeywords.length, 1);
    score = Math.min(98, Math.round(55 + ratio * 43));
  }

  // Bonus for relevant experience years
  if (candidate.relevant_experience_years && parseInt(candidate.relevant_experience_years) >= 4) {
    score = Math.min(98, score + 4);
  }

  // Strengths list
  const strengths: string[] = [];
  if (candidate.visa_status) {
    strengths.push(`Work Authorized in USA (${candidate.visa_status})`);
  }
  if (candidate.total_experience_years) {
    strengths.push(`${candidate.total_experience_years} Total Professional Experience`);
  }
  if (matchedSkills.length > 0) {
    strengths.push(`Strong overlap in: ${matchedSkills.slice(0, 4).join(", ")}`);
  }
  if (candidate.available_to_join) {
    strengths.push(`Available to start: ${candidate.available_to_join}`);
  }
  if (candidate.open_to_relocation) {
    strengths.push("Open to Nationwide Relocation & Remote");
  }

  // Visa Compatibility
  const visaCompat = {
    status: candidate.visa_status,
    isCompatible: true,
    note: "Valid for C2C or W2 contract placements with client.",
  };

  const rate = candidate.expected_salary || "$65/hr C2C";
  const matchedHighlights = matchedSkills.length > 0
    ? matchedSkills.slice(0, 5).join(", ")
    : "Python, SQL, Apache Spark, Cloud Architecture";

  // Tailored Pitch Email
  const pitchEmail = `Subject: Hotlist Candidate: ${candidate.full_name} (${candidate.target_job_titles || "Data Engineer"}) - Immediate Fit for ${job.title}

Hi ${vendorName} Team,

I hope you are doing well.

I would like to present our prime bench consultant, ${candidate.full_name}, who is an exceptional fit for the ${job.title} position at ${job.company}.

CONSULTANT SUMMARY:
• Candidate Name: ${candidate.full_name}
• Target Role: ${candidate.target_job_titles || job.title}
• Total Experience: ${candidate.total_experience_years || "4+ years"}
• USA Visa Status: ${candidate.visa_status}
• Current Location: ${candidate.current_city || "St. Louis"}, ${candidate.current_state || "MO"} (${candidate.open_to_relocation ? "Open to Relocate / Remote" : "Local"})
• Key Tech Stack: ${matchedHighlights}
• Certifications: ${candidate.certifications || "AWS Certified"}
• Availability: ${candidate.available_to_join || "Immediate"}
• Proposed Rate: ${rate}
• Interview Availability: ${candidate.interview_availability || "Mon-Thu 10am-3pm EST"}

WHY ${candidate.full_name.split(" ")[0]} IS A TOP MATCH FOR ${job.company.toUpperCase()}:
1. Production experience developing scalable data pipelines using ${matchedSkills.slice(0, 3).join(", ") || "Spark and Python"}.
2. Proven record optimizing warehouse architectures and cloud compute workloads.
3. Excellent client communication with quick ramp-up time for sprint deliverables.

Resume is attached. Please confirm receipt and let me know when we can schedule the technical screening.

Best regards,
${recruiterName}
Senior Bench Sales & Technical Recruiter
Marketing Portal | Bench Network`;

  // Right-to-Represent (RTR) Confirmation
  const rtrText = `RIGHT TO REPRESENT (RTR) CONFIRMATION

Date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

To Whom It May Concern,

I, ${candidate.full_name}, explicitly give exclusive Right to Represent (RTR) to ${recruiterName} and the Marketing Portal recruiting agency to submit my profile for the following position:

• Position Title: ${job.title}
• Client / Organization: ${job.company}
• Job Location: ${job.location || "Remote / Onsite"}
• Agreed Billing Rate: ${rate}
• Work Authorization: ${candidate.visa_status}

I verify that I have not been submitted for this specific requisition with ${job.company} through any other agency or staffing vendor within the last 6 months.

Authorized By:
Candidate: ${candidate.full_name}
Email: ${candidate.email || "consultant@example.com"}
Phone: ${candidate.phone || "+1 314 357 5705"}`;

  // Tailored Resume Bullets
  const tailoredResumeBullets = [
    `Architected and optimized distributed data processing pipelines using ${matchedSkills[0] || "Python"} and ${matchedSkills[1] || "SQL"}, reducing query execution times and data latency across production analytics systems.`,
    `Implemented automated ETL/ELT workflows leveraging ${matchedSkills[2] || "Apache Spark"} and ${matchedSkills[3] || "Cloud Storage"}, ensuring 99.9% data pipeline uptime and robust error recovery.`,
    `Collaborated with cross-functional engineering teams to implement data governance, schema validation, and CI/CD testing aligned with ${job.company}'s engineering standards.`,
  ];

  return {
    score,
    matchedSkills,
    missingSkills,
    candidateSkills: candidateKeywords,
    jobKeywords,
    strengths,
    visaCompatibility: visaCompat,
    pitchEmail,
    rtrText,
    tailoredResumeBullets,
  };
}
