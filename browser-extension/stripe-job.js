(function(root){'use strict';
 const cache=new Map();
 function descriptionText(html){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,nav,footer,form').forEach(el=>el.remove());doc.querySelectorAll('p,li,h1,h2,h3,h4,br').forEach(el=>el.append('\n'));return doc.body.textContent.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
 async function load(pageUrl){
  const job=root.NextkinEmbeddedSupport?.stripeJob(pageUrl);if(!job)return null;
  if(cache.has(job.listing))return cache.get(job.listing);
  const request=(async()=>{
   const response=await fetch(job.listing,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Role details unavailable.');
   const html=await response.text();if(html.length>3000000)throw Error('Role page too large.');const doc=new DOMParser().parseFromString(html,'text/html');
   for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){
    try{const data=JSON.parse(script.textContent),items=Array.isArray(data)?data:[data,...(data['@graph']||[])];
     for(const item of items)if([item['@type']].flat().includes('JobPosting')&&typeof item.title==='string'&&typeof item.description==='string'){
      const jobDescription=descriptionText(item.description);if(jobDescription.length>=40)return {jobTitle:item.title.trim(),companyName:'Stripe',jobDescription:jobDescription.slice(0,100000),sourceUrl:job.listing};
     }
    }catch{}
   }
   const body=doc.querySelector('.careers-listing-details__body'),title=doc.querySelector('h1');
   if(body&&title){const jobDescription=descriptionText(body.innerHTML);if(jobDescription.length>=40)return {jobTitle:title.textContent.trim(),companyName:'Stripe',jobDescription:jobDescription.slice(0,100000),sourceUrl:job.listing};}
   throw Error('Full role description unavailable.');
  })().catch(()=>{cache.delete(job.listing);return null;});cache.set(job.listing,request);return request;
 }
 root.NextkinStripeJob={load};
})(globalThis);
