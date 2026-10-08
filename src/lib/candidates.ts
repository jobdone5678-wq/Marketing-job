import { createClient } from "@/lib/client";
import type { Candidate, CandidateFormData } from "@/types/database";

export async function getCandidates(): Promise<Candidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching candidates:", error);
    return [];
  }

  return (data as Candidate[]) || [];
}

export async function getCandidateById(id: string): Promise<Candidate | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching candidate ${id}:`, error);
    return null;
  }

  return (data as Candidate) || null;
}

export async function createCandidate(
  candidateData: CandidateFormData
): Promise<{ data: Candidate | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("candidates")
    .insert([candidateData])
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Candidate, error: null };
}

export async function updateCandidate(
  id: string,
  candidateData: Partial<CandidateFormData>
): Promise<{ data: Candidate | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("candidates")
    .update(candidateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Candidate, error: null };
}
