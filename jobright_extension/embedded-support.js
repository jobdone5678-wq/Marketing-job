(function(root){'use strict';
 function stripeJob(value){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;const match=url.pathname.match(/^\/careers\/(apply|listing)\/([^/]+)\/(\d+)\/?$/);return match?{id:match[3],kind:match[1],listing:url.href}:null;}catch{return null;}}
 function validFrame(parentUrl,frameUrl){
   try {
     if (!frameUrl) return false;
     const frame = new URL(frameUrl, typeof location !== 'undefined' ? location.href : undefined);
     if (frame.protocol !== 'https:' && frame.protocol !== 'http:') return false;
     const host = frame.hostname.toLowerCase();
     const knownAts = [
       'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workday.com',
       'smartrecruiters.com', 'breezy.hr', 'workable.com', 'bamboohr.com', 'recruitee.com',
       'keka.com', 'icims.com', 'jobvite.com', 'taleo.net', 'rippling.com', 'jazzhr.com',
       'pinpointhq.com', 'applytojob.com', 'teamtailor.com'
     ];
     if (knownAts.some(ats => host.includes(ats))) return true;
     if (/\/(embed|apply|job|career|form|candidate|position)\b/i.test(frame.pathname)) return true;
     if (parentUrl) {
       try {
         const parent = new URL(parentUrl);
         if (parent.hostname === frame.hostname) return true;
       } catch {}
     }
     return true;
   } catch {
     return false;
   }
 }
 function contactFacts(candidate){const source=candidate.provenance_status==='confirmed'?(candidate.confirmed_facts||{}):candidate,output={id:candidate.id};for(const key of ['full_name','email','phone','current_city','current_state','country','zip_code','full_address','linkedin_url','github_url','website']){const value=source[key]??(key==='full_name'?candidate.full_name:null);if(typeof value==='string'&&value.length<2000)output[key]=value;}return output;}
 root.NextkinEmbeddedSupport={stripeJob,validFrame,contactFacts};if(typeof module!=='undefined')module.exports=root.NextkinEmbeddedSupport;
})(globalThis);
