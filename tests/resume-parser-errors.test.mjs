import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

class CaptureError extends Error {constructor(message,status){super(message);this.status=status;}}

function parser(getDocument){
  return moduleLoader({'pdfjs-dist/legacy/build/pdf.mjs':{getDocument}})('src/lib/resumes/validation.ts');
}

test('PDF worker cleanup failures do not discard readable resume text',async()=>{
  const {readResume}=parser(()=>({
    promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Synthetic Candidate SQL'}]})})}),
    destroy:async()=>{throw new Error('worker already closed');},
  }));
  assert.equal((await readResume(Buffer.from('%PDF-1.7'),'resume.pdf')).text,'Synthetic Candidate SQL');
});

test('PDF worker cleanup failures do not hide password errors',async()=>{
  const failure=Object.assign(new Error('password needed'),{name:'PasswordException'});
  const {readResume,ResumeReadError}=parser(()=>({promise:Promise.reject(failure),destroy:async()=>{throw new Error('cleanup failed');}}));
  await assert.rejects(readResume(Buffer.from('%PDF-1.7'),'resume.pdf'),error=>error instanceof ResumeReadError&&/password protection/.test(error.message));
});

test('resume task preserves safe parser validation errors before making an AI request',async()=>{
  const raw=Buffer.from('%PDF-1.7');let aiCalls=0;
  class ResumeReadError extends Error {}
  const base=fixtureDatabase({candidate_documents:[{id:'document',task_id:'task',status:'queued',filename:'resume.pdf',object_path:'private/resume.pdf',content_hash:createHash('sha256').update(raw).digest('hex')}],resume_extractions:[]});
  const db={...base,storage:{from:()=>({download:async()=>({data:new Blob([raw]),error:null})})}};
  const load=moduleLoader({
    '@/lib/db/admin':{database:()=>db,checkDb:error=>{if(error)throw error;},CaptureError},
    '@/lib/tasks/repository':{taskLease:async()=>{}},
    '@/lib/resumes/validation':{ResumeReadError,readResume:async()=>{throw new ResumeReadError('Resume must contain at most 20 pages.');}},
    '@/lib/ai/client':{getAIModel:()=> 'synthetic',structuredAI:async()=>{aiCalls++;}},
  });
  await assert.rejects(load('src/lib/ai/resume.ts').extractResume({id:'task',lease_token:'lease',payload:{documentId:'document'}}),error=>error instanceof CaptureError&&error.status===422&&/20 pages/.test(error.message));
  assert.equal(aiCalls,0);
});
