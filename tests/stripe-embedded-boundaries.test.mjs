import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const support=moduleLoader()('browser-extension/embedded-support.js');
const parent='https://stripe.com/careers/apply/software-engineer-payin/8185012';
test('embedded bridge trusts only matching HTTPS Stripe and Greenhouse job identities',()=>{
 assert.equal(support.validFrame(parent,'https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8185012'),true);
 for(const frame of ['https://job-boards.greenhouse.io/embed/job_app?for=another&token=8185012','https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=999','https://job-boards.greenhouse.io.evil.test/embed/job_app?for=stripe&token=8185012','http://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8185012'])assert.equal(support.validFrame(parent,frame),false);
 assert.equal(support.stripeJob('https://stripe.com.evil.test/careers/apply/role/8185012'),null);assert.equal(support.stripeJob('https://stripe.com/careers/search'),null);
});
test('embedded bridge transfers only reviewed contact facts, never source documents or credentials',()=>{
 const facts=support.contactFacts({id:'one',full_name:'Synthetic Candidate',provenance_status:'confirmed',email:'unreviewed@example.test',source_text:'private source',token:'secret',confirmed_facts:{full_name:'Reviewed Candidate',email:'reviewed@example.test',primary_skills:'Java',expected_salary:'100000'}});
 assert.deepEqual(facts,{id:'one',full_name:'Reviewed Candidate',email:'reviewed@example.test'});
});
