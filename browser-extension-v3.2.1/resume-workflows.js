/* Service-worker resume storage. Every document belongs to one candidate and job snapshot. */
(function (root) {
  'use strict';
  const AI_VERSION = 'contextual-v1-source-points-3.2.1';
  function cleanDocument(record) {
    if (!record?.markdown || !/^\s*Target role:/m.test(record.markdown)) return record;
    const markdown=record.markdown.split(/\r?\n/).filter(line=>!/^\s*Target role:/.test(line)).join('\n');
    const bytes=root.NextkinResume.resumeDocx(markdown);
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {...record,markdown,docxBase64:btoa(binary)};
  }
  async function generateAI(message,config,uploaded) {
    if (message.consent !== true) return {error:'Agree to AI processing of the reviewed candidate facts and this JD before generating.'};
    if (!config.token || !config.origin) return {error:'Connect or sign in to NextKinHR for authenticated AI access. Uploaded candidates do not need a portal candidate record.'};
    const engine=root.NextkinResume;
    if (!engine) return {error:'Reload the updated extension to enable AI tailoring.'};
    if(uploaded){try{engine.buildResume(config.uploadedCandidate,message);}catch(error){return {error:error.message || 'Candidate details or job description are missing.'};}}
    try {
      let linkedSource = null;
      if (!uploaded && message.sourceText) {
        const access = await fetch(config.origin+'/api/extension/candidates?candidateId='+encodeURIComponent(message.candidateId),{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(15000)});
        const data = await access.json();
        if (!access.ok) return {error:data.error || 'Candidate access denied.'};
        const profile = data.candidates?.find(row => row.id === message.candidateId);
        if (!profile || (message.candidateVersion != null && profile.version !== message.candidateVersion)) return {error:'Candidate changed. Refresh the profile and generate again.'};
        linkedSource = engine.candidateFromText(message.sourceText);
        const normalizedName = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
        if (normalizedName(linkedSource.full_name) !== normalizedName(profile.full_name)) return {error:'The original resume name does not match the selected candidate. Review the source before generating.'};
        linkedSource.id = 'uploaded-linked-'+message.candidateId;
        linkedSource.version = profile.version;
        if (!engine.normalizeCandidate(linkedSource).employment.some(row => row.bullets?.length)) return {error:'The original resume has no readable work bullets. Upload the full original resume with responsibilities and accomplishments before using AI tailoring.'};
      }
      const sourceCandidate = linkedSource || (uploaded ? config.uploadedCandidate : null);
      const useSource = !!sourceCandidate;
      const serviceCandidateId = sourceCandidate?.id || message.candidateId;
      const context=useSource?engine.scopeKey(sourceCandidate,message):JSON.stringify({candidateId:message.candidateId,job:engine.jobIdentity(message)});
      const identity=await engine.fingerprint({version:AI_VERSION,origin:config.origin,token:config.token,context});
      const key='resumeAIRequest:'+identity;
      let pending=(await chrome.storage.local.get(key))[key];
      if(!pending){pending={requestId:crypto.randomUUID()};await chrome.storage.local.set({[key]:pending});}
      const path=useSource?'/api/extension/tailor-upload':'/api/extension/tailor-resume';
      const headers={'Content-Type':'application/json',Authorization:'Bearer '+config.token};
      const job={jobTitle:message.jobTitle,companyName:message.companyName,jobDescription:message.jobDescription,jobUrl:message.jobUrl,consent:true,requestId:pending.requestId};
      // Do not send original binary files, local credentials or unrelated profile fields.
      const body=useSource?{...job,candidate:{id:serviceCandidateId,full_name:sourceCandidate.full_name,source_text:sourceCandidate.source_text || sourceCandidate.confirmed_facts?.raw_text || ''}}:{...job,candidateId:message.candidateId};
      let response=await fetch(config.origin+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
      let result=await response.json();
      for(let poll=0;response.ok && !result.docxBase64 && result.taskId && poll<120;poll++){
        await new Promise(resolve=>setTimeout(resolve,2000));
        response=await fetch(config.origin+path+'?taskId='+encodeURIComponent(result.taskId),{method:'GET',headers,signal:AbortSignal.timeout(15000)});
        result=await response.json();
      }
      if(!response.ok){await chrome.storage.local.set({[key]:null});return {error:result.error || 'AI tailoring failed. Review the details and retry.'};}
      if(!result.docxBase64 || !result.ai)return {error:'AI processing is still pending. Keep a configured worker running and choose Tailor Resume again to resume this request. No rules-based resume was substituted.'};
      if(result.candidateId !== serviceCandidateId)return {error:'AI result belongs to another candidate. No resume was used.'};
      result=cleanDocument(result);
      if (linkedSource && !result.contentQuality?.experienceBulletCount) return {error:'The AI service needs the matching v3.2.1 resume-engine update. Redeploy the existing server/worker with the updated browser-extension source, then generate again. No heading-only resume was downloaded.'};
      if(!useSource)return {...result,success:true};
      if (linkedSource) {
        const access = await fetch(config.origin+'/api/extension/candidates?candidateId='+encodeURIComponent(message.candidateId),{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(15000)});
        const latest = await access.json();
        if (!access.ok || !latest.candidates?.some(row => row.id===message.candidateId && row.version===linkedSource.version)) return {error:'Candidate access or profile changed during AI generation. Refresh and generate again.'};
      } else {
        const latest=(await chrome.storage.local.get('uploadedCandidate')).uploadedCandidate;
        if(engine.scopeKey(latest,message)!==context)return {error:'Uploaded candidate details changed during AI processing. Refresh and generate again.'};
      }
      const resumeId=await engine.fingerprint({version:AI_VERSION,context,scopeKey:result.scopeKey});
      const version={...result,resumeId,candidateId:message.candidateId,candidateName:sourceCandidate.full_name,...(linkedSource?{candidateVersion:linkedSource.version}:{}),jobTitle:message.jobTitle,companyName:message.companyName,jobUrl:message.jobUrl,jobDescription:message.jobDescription,scopeKey:context,createdAt:new Date().toISOString(),savedToPortal:false};
      await chrome.storage.local.set({['resumeVersion:'+resumeId]:version});
      return {...version,success:true};
    }catch{return {error:'Unable to reach the AI service. Reconnect and retry to resume this request; no other resume was substituted.'};}
  }
  async function handle(message) {
    const config = await chrome.storage.local.get(['origin','token','uploadedCandidate','uploadedProfiles']);
    if (message.type === 'list_resume_profiles') {
      const profiles = {...config.uploadedProfiles};
      const stored = await chrome.storage.local.get(null);
      for (const [key,record] of Object.entries(stored)) if (key.startsWith('resumeVersion:') && String(record?.candidateId).startsWith('uploaded') && !profiles[record.candidateId]) profiles[record.candidateId] = {id:record.candidateId,full_name:record.candidateName || 'Previous uploaded candidate'};
      if (config.uploadedCandidate) profiles[config.uploadedCandidate.id] = {id:config.uploadedCandidate.id,full_name:config.uploadedCandidate.full_name};
      return {success:true,profiles:Object.values(profiles).map(profile => ({...profile,archived:profile.id !== config.uploadedCandidate?.id}))};
    }
    if (!message.candidateId) return {error:'Candidate details are missing. Select a candidate or upload a resume.',resumes:[]};
    const uploaded = config.uploadedCandidate?.id === message.candidateId;
    if (message.type === 'tailor_resume' && !uploaded && String(message.candidateId).startsWith('uploaded')) return {error:'This uploaded source is no longer active. Re-upload this candidate to generate a new resume; previous versions remain in history.'};
    const localHistory = message.type !== 'tailor_resume' && String(message.candidateId).startsWith('uploaded');
    if(message.type === 'tailor_resume') return generateAI(message,config,uploaded);
    if (!uploaded && !localHistory) {
      if (!config.token) return {error:'This candidate is unavailable. Upload their resume or reconnect NextKinHR.',resumes:[]};
      // Authorization and candidate freshness are checked on every connected request.
      try {
        const stored = await chrome.storage.local.get(null);
        const localVersions = Object.entries(stored).filter(([key,record]) => key.startsWith('resumeVersion:') && record?.candidateId===message.candidateId).map(([,record])=>record);
        const saved = localVersions.find(record=>record.resumeId===message.resumeId);
        if (message.type==='get_saved_resume' && saved) {
          const access = await fetch(config.origin+'/api/extension/candidates?candidateId='+encodeURIComponent(message.candidateId),{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(15000)});
          const data = await access.json();
          if (!access.ok || !data.candidates?.some(row=>row.id===message.candidateId)) return {error:data.error || 'Candidate access denied.'};
          return {...cleanDocument(saved),success:true};
        }
        const generating = message.type === 'tailor_resume';
        const query = new URLSearchParams({candidateId:message.candidateId,limit:String(message.limit || 50),offset:String(message.offset || 0)});
        if (message.type === 'get_saved_resume') query.set('resumeId',message.resumeId);
        const response = await fetch(config.origin + '/api/extension/tailor-resume' + (generating ? '' : '?' + query),{
          method:generating ? 'POST' : 'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer ' + config.token},
          ...(generating ? {body:JSON.stringify({candidateId:message.candidateId,jobTitle:message.jobTitle,companyName:message.companyName,jobDescription:message.jobDescription,jobUrl:message.jobUrl})} : {}),
          signal:AbortSignal.timeout(generating ? 45000 : 15000)
        });
        const data = await response.json();
        if (!response.ok) return {error:data.error || 'Unable to access this candidate resume. Reconnect and retry.',resumes:[]};
        if (message.type==='list_resume_versions' && !Number(message.offset)) data.resumes=[...localVersions,...(data.resumes||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
        return {...cleanDocument(data),success:true};
      } catch { return {error:'Unable to reach NextKinHR. Reconnect and retry; no other candidate resume was used.',resumes:[]}; }
    }
    const engine = root.NextkinResume;
    if (!engine) return {error:'Reload the updated extension to enable resume generation.'};
    if (message.type === 'get_saved_resume') {
      const key = 'resumeVersion:' + String(message.resumeId || '');
      const record = (await chrome.storage.local.get(key))[key];
      return record?.candidateId === message.candidateId ? {...cleanDocument(record),success:true} : {error:'Saved resume not found for this candidate.'};
    }
    const stored = await chrome.storage.local.get(null);
    const resumes = Object.entries(stored).filter(([key,value]) => key.startsWith('resumeVersion:') && value.candidateId === message.candidateId)
      .map(([,value]) => ({resumeId:value.resumeId,candidateId:value.candidateId,jobTitle:value.jobTitle,companyName:value.companyName,jobUrl:value.jobUrl,createdAt:value.createdAt,matchScore:value.matchScore,filename:value.filename}))
      .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {success:true,resumes,total:resumes.length};
  }
  root.NextkinResumeWorkflows = {handle};
})(globalThis);
