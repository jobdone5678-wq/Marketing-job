export function profileAccess(profile: {role:string;status:string}|null, access:'candidate_or_staff'|'staff'|'admin'):boolean {
  if(!profile || profile.status!=='active') return false;
  if(access==='admin') return profile.role==='super_admin';
  if(access==='staff') return ['recruiter','super_admin'].includes(profile.role);
  return ['client','recruiter','super_admin'].includes(profile.role);
}
