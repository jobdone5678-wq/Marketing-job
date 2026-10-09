export type TaskKind='resume_extract'|'source_sync'|'candidate_match'|'packet_generate';
export interface BackgroundTask {id:string;actor_id:string;kind:TaskKind;payload:Record<string,unknown>;status:'queued'|'running'|'succeeded'|'failed'|'cancelled';attempts:number;lease_token:string;result:Record<string,unknown>|null;error:string|null}
