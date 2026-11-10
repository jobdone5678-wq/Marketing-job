"use client";
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
export function WorkflowTaskStatus({taskId,onComplete,onFailed}:{taskId:string;onComplete:()=>void|Promise<void>;onFailed?:()=>void|Promise<void>}){
 const complete=useRef(onComplete),failed=useRef(onFailed);const [status,setStatus]=useState('queued'),[error,setError]=useState(''),[note,setNote]=useState(''),[check,setCheck]=useState(0),[paused,setPaused]=useState(false);
 useEffect(()=>{complete.current=onComplete;},[onComplete]);
 useEffect(()=>{failed.current=onFailed;},[onFailed]);
 useEffect(()=>{
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;let polls=0,failures=0;
  void api<{status:string;message?:string}>(`/api/tasks/${taskId}/process`,{method:'POST'}).then(result=>{if(!cancelled&&result.status==='waiting_for_worker')setNote(result.message||'Waiting for the configured worker.');}).catch(()=>{});
  async function poll(){try{
   const {task}=await api<{task:{status:string;error:string|null}}>(`/api/tasks/${taskId}`);
   if(cancelled)return;setStatus(task.status);setPaused(false);setError('');failures=0;
   if(task.status==='succeeded'){await complete.current();return;}
   if(task.status==='failed'||task.status==='cancelled'){setError(task.error||'Processing did not complete. Check configuration and retry.');await failed.current?.();return;}
   if(++polls>=60){setPaused(true);setNote('Processing may continue in the background. Check status again when ready.');return;}
   timer=setTimeout(poll,polls<10?2000:5000);
  }catch(e){if(cancelled)return;if(++failures<3){timer=setTimeout(poll,1000*2**failures);return;}setError((e as Error).message);setPaused(true);}}
  void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[taskId,check]);
 return <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" role="status"><p>{status==='succeeded'?'Processing complete.':status==='running'?'Processing with AI…':status==='failed'?'Processing failed.':status==='cancelled'?'Processing cancelled.':'Queued: waiting for the processing worker.'}</p>{note&&status!=='succeeded'&&<p className="text-xs text-muted-foreground">{note}</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}{status==='failed'?<Button size="sm" variant="outline" onClick={async()=>{try{await api(`/api/tasks/${taskId}/retry`,{method:'POST'});setStatus('queued');setError('');setCheck(v=>v+1);}catch(e){setError((e as Error).message);}}}>Retry processing</Button>:paused&&<Button size="sm" variant="outline" onClick={()=>setCheck(v=>v+1)}>Check processing status</Button>}</div>;
}
