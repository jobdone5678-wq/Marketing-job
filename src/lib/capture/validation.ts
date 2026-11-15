import {applicationUrlKey} from '../jobs/application-state';
export function allowedCaptureUrl(observed:string,application:string){
 try {
  const current=new URL(observed),expected=new URL(application);
  if(current.protocol!=='https:'||current.origin!==expected.origin||current.username||current.password)return false;
  const observedKey=applicationUrlKey(observed), expectedKey=applicationUrlKey(application);
  return !!observedKey && observedKey===expectedKey;
 } catch {return false;}
}
export function validateObservation(status:string,evidence:string){
 if(status==='started')return false;
 if(status==='submitted'||status==='confirmed'){
  const text=evidence.replace(/\s+/g,' ').trim();
  if(/\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(text))return false;
  if(/^(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent)|(?:we|we've) (?:have )?received your application|you(?: have|'ve) successfully applied)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i.test(text))return true;
  if(/\b(?:confirmation|thank[-_]?you|thankyou|applied|application[-_]submitted|application[-_]success|submission[-_]success|success)\b/i.test(text))return true;
  return false;
 }
 if(status==='failed')return /required|invalid|unable to submit|submission failed|error/i.test(evidence);
 return ['in_progress','submit_attempted'].includes(status);
}
