/* Runs only on the narrowly matched Greenhouse embed; no widget or autonomous fill. */
(function(root){'use strict';
 if(window===window.top||!root.NextkinEmbeddedSupport)return;
 let active=null,epoch=0,queue=Promise.resolve();const receipts=new Map();
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||message.channel!=='nextkin_embedded_v1')return;
  queue=queue.then(async()=>{
   if(!root.NextkinEmbeddedSupport.validFrame(message.jobUrl,location.href))return {error:'Embedded job context changed.'};
   if(message.op==='fill'){
    const current=++epoch;
    if(active?.sessionId!==message.sessionId||active?.candidateId!==message.candidateId)receipts.clear();
    active={sessionId:message.sessionId,candidateId:message.candidateId};
    const fields=root.NextkinForms.discoverFields(document),plans=root.NextkinFieldMapping.planFill(fields,message.candidate);
    const written=await root.NextkinFieldWriter.applyFill(plans,{sessionId:message.sessionId,isCurrent:()=>epoch===current&&root.NextkinEmbeddedSupport.validFrame(message.jobUrl,location.href)});
    for(const receipt of written)if(!receipts.has(receipt.fieldKey))receipts.set(receipt.fieldKey,receipt);
    return {success:true,count:written.length,manual:plans.filter(p=>p.status!=='supported').map(p=>p.field.label).filter(Boolean)};
   }
   if(!active||active.sessionId!==message.sessionId||active.candidateId!==message.candidateId)return {error:'The embedded candidate or session changed.'};
   if(message.op==='undo'){epoch++;return {success:true,count:await root.NextkinFieldWriter.undo([...receipts.values()],active)};}
   return {error:'Unsupported embedded operation.'};
  }).then(reply,()=>reply({error:'Embedded form needs manual review.'}));return true;
 });
 chrome.runtime.sendMessage({type:'register_embedded_form'}).catch(()=>{});
})(globalThis);
