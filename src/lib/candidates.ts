import {api} from './api-client';
import type {Candidate,CandidateFormData} from '@/types/database';

let candidatesCache: { data: Candidate[]; timestamp: number } | null = null;
let inFlightRequest: Promise<Candidate[]> | null = null;
const CACHE_TTL_MS = 15000; // 15 seconds cache

export function invalidateCandidatesCache() {
  candidatesCache = null;
  inFlightRequest = null;
}

export async function getCandidates(forceRefresh = false): Promise<Candidate[]> {
  const now = Date.now();
  if (!forceRefresh && candidatesCache && (now - candidatesCache.timestamp < CACHE_TTL_MS)) {
    return candidatesCache.data;
  }
  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = (async () => {
    let page = 0;
    const result: Candidate[] = [];
    for (;;) {
      const data = await api<{ candidates: Candidate[]; hasMore: boolean }>(`/api/candidates?page=${page}&limit=500`);
      result.push(...data.candidates);
      if (!data.hasMore) break;
      page++;
    }
    candidatesCache = { data: result, timestamp: Date.now() };
    return result;
  })().finally(() => {
    inFlightRequest = null;
  });

  return inFlightRequest;
}

export async function getCandidateById(id:string) {return (await api<{candidate:Candidate}>(`/api/candidates/${id}`)).candidate;}

export async function createCandidate(fields:Partial<CandidateFormData>) {
  try {
    const res = await api<{candidate:Candidate}>('/api/candidates',{method:'POST',body:JSON.stringify(fields)});
    invalidateCandidatesCache();
    return {data:res.candidate,error:null};
  } catch(e) {
    return {data:null,error:e instanceof Error?e.message:'Save failed'};
  }
}

export async function updateCandidate(id:string,fields:Partial<CandidateFormData>) {
  try {
    const version=fields.version ?? (await getCandidateById(id)).version;
    const res = await api<{candidate:Candidate}>(`/api/candidates/${id}`,{method:'PATCH',body:JSON.stringify({version,fields})});
    invalidateCandidatesCache();
    return {data:res.candidate,error:null};
  } catch(e) {
    return {data:null,error:e instanceof Error?e.message:'Save failed'};
  }
}