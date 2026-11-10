import {api} from './api-client';
import type {UserProfile} from '@/types/database';
export type AdminProfile=Pick<UserProfile,'id'|'full_name'|'email'|'role'|'status'>;
export async function getAdminProfiles():Promise<AdminProfile[]>{
 const profiles:AdminProfile[]=[];
 let offset=0;
 for(;;){
  const page=await api<{profiles:AdminProfile[];hasMore?:boolean;nextOffset?:number}>(`/api/admin/profiles?offset=${offset}`);
  profiles.push(...page.profiles);
  if(!page.hasMore)return profiles;
  const next=page.nextOffset??offset+page.profiles.length;
  if(next<=offset)throw new Error('Unable to load the complete team. Refresh and try again.');
  offset=next;
 }
}
