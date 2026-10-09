export type EmploymentType='contract'|'permanent'|'temporary'|'part_time'|'internship'|'unknown';
export interface NormalizedJob {external_id:string;title:string;company:string;source_url:string;application_url:string;location:string|null;department:string|null;description:string;description_html:string;employment_type:EmploymentType;employment_evidence:string|null;arrangements:string[]|null;compensation:unknown;content_hash:string}
export interface JobSnapshot {jobs:NormalizedJob[];completeness:'complete'|'partial'}
export interface StoredJob extends NormalizedJob {id:string;source_id:string;version:number;state:'active'|'closed'|'stale';updated_at:string}
