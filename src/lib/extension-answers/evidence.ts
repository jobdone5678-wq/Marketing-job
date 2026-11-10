import {z} from 'zod';
export const questionSchema=z.object({id:z.string().min(1).max(200),label:z.string().min(1).max(2000),type:z.string().max(40).default('text'),options:z.array(z.string().max(1000)).max(200).optional()}).strict();
export const screeningSelectionSchema=z.object({decisions:z.array(z.object({questionId:z.string().max(200),factIds:z.array(z.string().max(100)).max(5),option:z.string().max(1000).nullable()}).strict()).max(30)}).strict();
export type Question=z.infer<typeof questionSchema>;
export type Fact={id:string;text:string;context?:string};
// These decisions need an explicit recruiter answer, never a language-model inference.
export const manualQuestion=/authoriz|sponsor|visa|citizen|salary|compensation|rate\b|notice|available|start date|relocat|years?|how many|disabil|gender|ethnic|race\b|veteran|social security|passport|password|consent|agree|certify|signature|criminal|convict|date of birth/i;
export function validateScreening(questions:Question[],facts:Fact[],output:unknown){
 const selected=screeningSelectionSchema.parse(output),byId=new Map(facts.map(f=>[f.id,f])),seen=new Set<string>();
 for(const row of selected.decisions){if(seen.has(row.questionId)||!questions.some(q=>q.id===row.questionId))throw Error('Unknown or duplicate screening question.');seen.add(row.questionId);}
 const answers:Record<string,string>={};
 const decisions=questions.map(question=>{
  const row=selected.decisions.find(r=>r.questionId===question.id);
  if(manualQuestion.test(question.label))return {questionId:question.id,status:'manual',evidence:[]};
  const evidence=(row?.factIds||[]).map(id=>{const fact=byId.get(id);if(!fact)throw Error('Unsupported screening evidence.');return fact;});
  if(!evidence.length)return {questionId:question.id,status:'unknown',evidence:[]};
  let answer=evidence.map(f=>f.context?`${f.context}: ${f.text}`:f.text).join('\n');
  if(question.options?.length){
   if(!row?.option||!question.options.includes(row.option)||!evidence.some(f=>f.text.trim().toLowerCase()===row.option!.trim().toLowerCase()))throw Error('Screening option lacks exact source evidence.');
   answer=row.option;
  }else if(row?.option!==null)throw Error('Unexpected choice for a text question.');
  answers[question.id]=answer;
  return {questionId:question.id,status:'supported',evidence};
 });
 return {answers,decisions};
}
