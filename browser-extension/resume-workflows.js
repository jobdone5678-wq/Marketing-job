/* Service-worker resume storage. Every document belongs to one candidate and job snapshot. */
(function (root) {
  'use strict';
  async function handle(message) {
    const config = await chrome.storage.local.get(['origin','token','uploadedCandidate','uploadedProfiles']);
    if (message.type === 'list_resume_profiles') {
      const profiles = {...config.uploadedProfiles};
      const stored = await chrome.storage.local.get(null);
      for (const [key,record] of Object.entries(stored)) if (key.startsWith('resumeVersion:') && !profiles[record.candidateId]) profiles[record.candidateId] = {id:record.candidateId,full_name:record.candidateName || 'Previous uploaded candidate'};
      if (config.uploadedCandidate) profiles[config.uploadedCandidate.id] = {id:config.uploadedCandidate.id,full_name:config.uploadedCandidate.full_name};
      return {success:true,profiles:Object.values(profiles).map(profile => ({...profile,archived:profile.id !== config.uploadedCandidate?.id}))};
    }
    if (!message.candidateId) return {error:'Candidate details are missing. Select a candidate or upload a resume.',resumes:[]};
    const uploaded = config.uploadedCandidate?.id === message.candidateId;
    if (message.type === 'tailor_resume' && !uploaded && String(message.candidateId).startsWith('uploaded')) return {error:'This uploaded source is no longer active. Re-upload this candidate to generate a new resume; previous versions remain in history.'};
    const localHistory = message.type !== 'tailor_resume' && String(message.candidateId).startsWith('uploaded');
    if (!uploaded && !localHistory) {
      if (!config.token) return {error:'This candidate is unavailable. Upload their resume or reconnect NextKinHR.',resumes:[]};
      // Authorization and candidate freshness are checked on every connected request.
      try {
        const generating = message.type === 'tailor_resume';
        const query = new URLSearchParams({candidateId:message.candidateId,limit:String(message.limit || 50),offset:String(message.offset || 0)});
        if (message.type === 'get_saved_resume') query.set('resumeId',message.resumeId);
        const response = await fetch(config.origin + '/api/extension/tailor-resume' + (generating ? '' : '?' + query),{
          method:generating ? 'POST' : 'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer ' + config.token},
          ...(generating ? {body:JSON.stringify({candidateId:message.candidateId,jobTitle:message.jobTitle,companyName:message.companyName,jobDescription:message.jobDescription,jobUrl:message.jobUrl})} : {}),
          signal:AbortSignal.timeout(generating ? 45000 : 15000)
        });
        const data = await response.json();
        return response.ok ? {...data,success:true} : {error:data.error || 'Unable to access this candidate resume. Reconnect and retry.',resumes:[]};
      } catch { return {error:'Unable to reach NextKinHR. Reconnect and retry; no other candidate resume was used.',resumes:[]}; }
    }
    const engine = root.NextkinResume;
    if (!engine) return {error:'Reload the updated extension to enable resume generation.'};
    if (message.type === 'tailor_resume') {
      try {
        const output = engine.buildResume(config.uploadedCandidate,message);
        const resumeId = await engine.fingerprint(output.scopeKey), key = 'resumeVersion:' + resumeId;
        const existing = (await chrome.storage.local.get(key))[key];
        if (existing) return {...existing,success:true,cached:true};
        const bytes = engine.resumeDocx(output.markdown);
        let binary = '';for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
        const version = {...output,resumeId,candidateId:message.candidateId,candidateName:config.uploadedCandidate.full_name,
          jobTitle:message.jobTitle,companyName:message.companyName,jobUrl:message.jobUrl,jobDescription:message.jobDescription,
          docxBase64:btoa(binary),filename:output.filename.replace(/\.docx$/,'_' + resumeId.slice(0,10) + '.docx'),createdAt:new Date().toISOString(),savedToPortal:false};
        // Separate entries avoid overwrites and any fixed application-count limit.
        await chrome.storage.local.set({[key]:version});
        return {...version,success:true};
      } catch (error) { return {error:error.message || 'Resume generation failed. Check candidate details and JD.'}; }
    }
    if (message.type === 'get_saved_resume') {
      const key = 'resumeVersion:' + String(message.resumeId || '');
      const record = (await chrome.storage.local.get(key))[key];
      return record?.candidateId === message.candidateId ? {...record,success:true} : {error:'Saved resume not found for this candidate.'};
    }
    const stored = await chrome.storage.local.get(null);
    const resumes = Object.entries(stored).filter(([key,value]) => key.startsWith('resumeVersion:') && value.candidateId === message.candidateId)
      .map(([,value]) => ({resumeId:value.resumeId,candidateId:value.candidateId,jobTitle:value.jobTitle,companyName:value.companyName,jobUrl:value.jobUrl,createdAt:value.createdAt,matchScore:value.matchScore,filename:value.filename}))
      .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {success:true,resumes,total:resumes.length};
  }
  root.NextkinResumeWorkflows = {handle};
})(globalThis);
