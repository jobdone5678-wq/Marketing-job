import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const load=moduleLoader();
test('application dates use inclusive calendar boundaries, independent of updated time',()=>{
 const {inSubmissionDateRange,dailySubmissionCounts}=load('src/lib/submission-dates.ts');
 const rows=[{submission_date:'2026-10-14',updated_at:'2026-10-15'},{submission_date:'2026-10-15'},{submission_date:'2026-10-15'},{submission_date:'2026-10-16'},{submission_date:null}];
 const filtered=rows.filter(row=>inSubmissionDateRange(row.submission_date,'2026-10-14','2026-10-15'));
 assert.equal(filtered.length,3);
 assert.deepEqual(dailySubmissionCounts(filtered),[{date:'2026-10-15',count:2},{date:'2026-10-14',count:1}]);
 assert.equal(inSubmissionDateRange('2026-10-15','2026-10-16','2026-10-14'),false);
 assert.equal(inSubmissionDateRange(null,'',''),true);
});
test('date shortcuts cover seven calendar days and current month without UTC shifting',()=>{
 const {submissionDatePreset}=load('src/lib/submission-dates.ts');
 const today=new Date(2026,9,3,0,5);
 assert.deepEqual(submissionDatePreset('today',today),{from:'2026-10-03',to:'2026-10-03'});
 assert.deepEqual(submissionDatePreset('week',today),{from:'2026-09-27',to:'2026-10-03'});
 assert.deepEqual(submissionDatePreset('month',today),{from:'2026-10-01',to:'2026-10-03'});
});
