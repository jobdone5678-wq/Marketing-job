// Ignore unrequested provider metadata; required values remain subject to strict
// schema and evidence validation. Provider scores are never accepted here.
function fields(value:unknown,names:string[]):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const record=value as Record<string,unknown>;
 return Object.fromEntries(names.filter(name=>Object.prototype.hasOwnProperty.call(record,name)).map(name=>[name,record[name]]));
}
export function projectAIOutput(name:string,value:unknown):unknown{
 if(!['job_requirements','candidate_match'].includes(name)||!value||typeof value!=='object'||Array.isArray(value))return value;
 const output=fields(value,['requirements','constraints']) as Record<string,unknown>;
 const match=name==='candidate_match';
 if(Array.isArray(output.requirements))output.requirements=output.requirements.map(row=>fields(row,match?['requirement','jobEvidence','status','candidateField','candidateEvidence']:['requirement','jobEvidence']));
 if(Array.isArray(output.constraints))output.constraints=output.constraints.map(row=>fields(row,match?['field','requiredValue','status','jobEvidence']:['field','requiredValue','jobEvidence']));
 return output;
}
