export function canClaimPublicJobTask(task:{kind:string;status:string;attempts:number;available_at:string},now=Date.now()) {
  return task.kind==='source_sync'&&task.status==='queued'&&task.attempts<3&&Date.parse(task.available_at)<=now;
}
