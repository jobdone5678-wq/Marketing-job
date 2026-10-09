import {api} from './api-client';
export async function getWorkspaceSettings(){return api('/api/settings');}
export async function updateWorkspaceSettings(settings:Record<string,unknown>){return api('/api/settings',{method:'PATCH',body:JSON.stringify({settings})});}
