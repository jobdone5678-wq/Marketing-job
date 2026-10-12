export type ProfileAccess = 'candidate_or_staff' | 'recruiting_staff' | 'staff' | 'admin';

const recruitingRoles = ['recruiter', 'technical_recruiter', 'super_admin'];

export function profileAccess(profile: {role:string;status:string}|null, access:ProfileAccess):boolean {
  if(!profile || profile.status!=='active') return false;
  if(access==='admin') return profile.role==='super_admin';
  if(access==='staff') return ['recruiter','super_admin'].includes(profile.role);
  if(access==='recruiting_staff') return recruitingRoles.includes(profile.role);
  return ['client', ...recruitingRoles].includes(profile.role);
}
