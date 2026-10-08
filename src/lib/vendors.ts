// ==============================================================================
// VENDOR CRM & IMPLEMENTATION PARTNER DATA ACCESS LAYER
// Prime Vendor Directory, Recruiter Contacts, and Performance Metrics
// ==============================================================================

export interface VendorContact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  is_primary: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  tier: "Tier 1" | "Tier 2" | "Tier 3" | "Preferred";
  website?: string;
  headquarters: string;
  payment_terms: "Net 30" | "Net 45" | "Net 60" | "Immediate";
  agreement_status: "MSA Active" | "Pending NDA" | "Standard RTR" | "No Agreement";
  specializations: string[];
  responsiveness: "High" | "Medium" | "Low";
  rating: number; // 1-5 stars
  total_submissions: number;
  active_interviews: number;
  placements_count: number;
  notes?: string;
  contacts: VendorContact[];
  created_at: string;
  updated_at: string;
}

export type VendorFormData = Omit<Vendor, "id" | "created_at" | "updated_at">;

export const SAMPLE_VENDORS: Vendor[] = [
  {
    id: "v-001",
    name: "TEKsystems Inc.",
    tier: "Tier 1",
    website: "https://www.teksystems.com",
    headquarters: "Hanover, Maryland",
    payment_terms: "Net 30",
    agreement_status: "MSA Active",
    specializations: ["Data Engineering", "Cloud & DevOps", "Enterprise Architecture"],
    responsiveness: "High",
    rating: 4.9,
    total_submissions: 18,
    active_interviews: 4,
    placements_count: 5,
    notes: "Direct MSP for Capital One, Amazon, and JPMorgan Chase. Very fast turnaround on STEM OPT and EAD consultants.",
    contacts: [
      {
        id: "c-101",
        name: "Sarah Jenkins",
        title: "Senior Technical Recruiter",
        email: "sjenkins@teksystems.com",
        phone: "(415) 555-0192",
        linkedin_url: "https://linkedin.com/in/sarah-jenkins-teksystems",
        is_primary: true,
      },
      {
        id: "c-102",
        name: "Marcus Vance",
        title: "Account Delivery Lead",
        email: "mvance@teksystems.com",
        phone: "(415) 555-0199",
        is_primary: false,
      },
    ],
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-10-06T10:00:00Z",
  },
  {
    id: "v-002",
    name: "Apex Systems",
    tier: "Tier 1",
    website: "https://www.apexsystems.com",
    headquarters: "Glen Allen, Virginia",
    payment_terms: "Net 30",
    agreement_status: "MSA Active",
    specializations: ["AWS / Cloud Migration", "Snowflake & Spark", "Cybersecurity"],
    responsiveness: "High",
    rating: 4.8,
    total_submissions: 14,
    active_interviews: 3,
    placements_count: 4,
    notes: "Holds prime vendor slots at Anthem, Wells Fargo, and Delta Air Lines. Prefers C2C rate at $65-$75/hr.",
    contacts: [
      {
        id: "c-103",
        name: "Michael Vance",
        title: "Lead Technical Recruiter",
        email: "mvance@apexsystems.com",
        phone: "(214) 555-0144",
        linkedin_url: "https://linkedin.com/in/michael-vance-apex",
        is_primary: true,
      },
    ],
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-10-05T14:30:00Z",
  },
  {
    id: "v-003",
    name: "Insight Global",
    tier: "Tier 1",
    website: "https://www.insightglobal.com",
    headquarters: "Atlanta, Georgia",
    payment_terms: "Net 45",
    agreement_status: "MSA Active",
    specializations: ["Python & AI/ML", "Data Pipelines", "Full Stack Java"],
    responsiveness: "Medium",
    rating: 4.6,
    total_submissions: 11,
    active_interviews: 2,
    placements_count: 3,
    notes: "Aggressive submission volume. Requires right-to-represent (RTR) email before submitting to their end client manager.",
    contacts: [
      {
        id: "c-104",
        name: "Priya Patel",
        title: "Senior Recruiter - IT Practice",
        email: "priya.patel@insightglobal.com",
        phone: "(312) 555-0188",
        linkedin_url: "https://linkedin.com/in/priya-patel-ig",
        is_primary: true,
      },
    ],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-10-04T09:15:00Z",
  },
  {
    id: "v-004",
    name: "Randstad Technologies",
    tier: "Preferred",
    website: "https://www.randstadusa.com",
    headquarters: "Woburn, Massachusetts",
    payment_terms: "Net 30",
    agreement_status: "MSA Active",
    specializations: ["Data Warehousing", "Healthcare IT", "FinTech"],
    responsiveness: "High",
    rating: 4.7,
    total_submissions: 9,
    active_interviews: 1,
    placements_count: 2,
    notes: "Direct accounts with UnitedHealth Group, CVS Health, and Citi. Reliable bi-weekly invoice clearing.",
    contacts: [
      {
        id: "c-105",
        name: "David Miller",
        title: "Technical Account Manager",
        email: "david.miller@randstad.com",
        phone: "(646) 555-0177",
        is_primary: true,
      },
    ],
    created_at: "2026-09-22T00:00:00Z",
    updated_at: "2026-10-06T11:45:00Z",
  },
  {
    id: "v-005",
    name: "Collabera",
    tier: "Tier 2",
    website: "https://www.collabera.com",
    headquarters: "Basking Ridge, New Jersey",
    payment_terms: "Net 45",
    agreement_status: "Standard RTR",
    specializations: ["Software Engineering", "Cloud Infrastructure", "Big Data"],
    responsiveness: "Medium",
    rating: 4.3,
    total_submissions: 8,
    active_interviews: 1,
    placements_count: 2,
    notes: "Specializes in high-volume bank accounts. Always confirm bill rate before submitting consultant profile.",
    contacts: [
      {
        id: "c-106",
        name: "Ananya Sharma",
        title: "Talent Acquisition Specialist",
        email: "ananya.s@collabera.com",
        phone: "(973) 555-0165",
        is_primary: true,
      },
    ],
    created_at: "2026-09-25T00:00:00Z",
    updated_at: "2026-10-03T16:00:00Z",
  },
  {
    id: "v-006",
    name: "Kforce Inc.",
    tier: "Preferred",
    website: "https://www.kforce.com",
    headquarters: "Tampa, Florida",
    payment_terms: "Net 30",
    agreement_status: "MSA Active",
    specializations: ["FinTech", "Data Analytics", "Cloud Security"],
    responsiveness: "High",
    rating: 4.8,
    total_submissions: 10,
    active_interviews: 2,
    placements_count: 3,
    notes: "Fast interview feedback loop. Great for East Coast and Remote positions.",
    contacts: [
      {
        id: "c-107",
        name: "Christopher Lee",
        title: "Senior IT Recruiter",
        email: "clee@kforce.com",
        phone: "(813) 555-0149",
        is_primary: true,
      },
    ],
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-10-05T08:20:00Z",
  },
];

let localMemoryVendors: Vendor[] = [...SAMPLE_VENDORS];

export async function getVendors(): Promise<Vendor[]> {
  return [...localMemoryVendors];
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  const vendor = localMemoryVendors.find((v) => v.id === id);
  return vendor || null;
}

export async function createVendor(
  vendorData: VendorFormData
): Promise<{ data: Vendor | null; error: string | null }> {
  try {
    const newVendor: Vendor = {
      ...vendorData,
      id: `v-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localMemoryVendors.unshift(newVendor);
    return { data: newVendor, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || "Failed to create vendor" };
  }
}

export async function updateVendor(
  id: string,
  vendorData: Partial<VendorFormData>
): Promise<{ data: Vendor | null; error: string | null }> {
  try {
    const idx = localMemoryVendors.findIndex((v) => v.id === id);
    if (idx === -1) {
      return { data: null, error: "Vendor not found" };
    }
    localMemoryVendors[idx] = {
      ...localMemoryVendors[idx],
      ...vendorData,
      updated_at: new Date().toISOString(),
    };
    return { data: localMemoryVendors[idx], error: null };
  } catch (err: any) {
    return { data: null, error: err.message || "Failed to update vendor" };
  }
}

export async function deleteVendor(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    localMemoryVendors = localMemoryVendors.filter((v) => v.id !== id);
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete vendor" };
  }
}
