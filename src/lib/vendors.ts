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

import {api} from './api-client';
export async function getVendors():Promise<Vendor[]> {return (await api<{vendors:Vendor[]}>('/api/vendors')).vendors;}
export async function getVendorById(id:string):Promise<Vendor|null> {return (await getVendors()).find(v=>v.id===id)||null;}
async function save(id:string|null,data:Partial<VendorFormData>){try{const fields=id?{...await getVendorById(id),...data}:data;const result=await api<{id:string}>('/api/vendors',{method:'POST',body:JSON.stringify({id,data:fields})});return {data:await getVendorById(result.id),error:null};}catch(e){return {data:null,error:(e as Error).message};}}
export async function createVendor(data:VendorFormData){return save(null,data);}
export async function updateVendor(id:string,data:Partial<VendorFormData>){return save(id,data);}
export async function deleteVendor(id:string){try{await api('/api/vendors/'+id,{method:'DELETE'});return {success:true,error:null};}catch(e){return {success:false,error:(e as Error).message};}}
