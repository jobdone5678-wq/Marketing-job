/** Publication age is based on source dates, never on our sync timestamp. */
export function publicationWindow(value:string|null,now=Date.now()){
 const selected=value||'30';
 if(!['7','30','90','all'].includes(selected))throw new Error('Invalid posting date filter.');
 return {since:selected==='all'?null:new Date(now-Number(selected)*86400000).toISOString(),until:new Date(now).toISOString()};
}
export function isWithinPublicationWindow(postedAt:string|null|undefined,window:ReturnType<typeof publicationWindow>){
 if(!window.since)return true;
 const posted=postedAt?Date.parse(postedAt):NaN;
 return Number.isFinite(posted)&&posted>=Date.parse(window.since)&&posted<=Date.parse(window.until);
}
export function newestPostedFirst(a:{posted_at?:string|null},b:{posted_at?:string|null}){
 const time=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?Date.parse(value):-Infinity;
 const left=time(a.posted_at),right=time(b.posted_at);
 return left===right?0:left>right?-1:1;
}
