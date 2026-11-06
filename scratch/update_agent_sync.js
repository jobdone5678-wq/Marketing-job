const fs = require('fs');

const p = 'jobright_extension/agent-submission-sync.7f769d2a.js';
let content = fs.readFileSync(p, 'utf8');

const oldToSet = `      if (Object.keys(toSet).length > 1) {
        chrome.storage.local.set(toSet);
      }`;

const newToSet = `      if (Object.keys(toSet).length > 1) {
        chrome.storage.local.get(['uploaded_resume', 'nextkin_uploaded_resume'], function(chk) {
          var upl = chk && (chk.uploaded_resume || chk.nextkin_uploaded_resume);
          if (upl && upl.full_name && upl.uploadedAt && (Date.now() - upl.uploadedAt < 2592000000)) {
            delete toSet.uploaded_resume;
            delete toSet.nextkin_uploaded_resume;
            delete toSet.nextkin_active_candidate;
            delete toSet.uploadedCandidate;
            delete toSet.nextkin_candidate_data;
          }
          chrome.storage.local.set(toSet);
        });
      }`;

if (content.includes(oldToSet)) {
  content = content.replace(oldToSet, newToSet);
  fs.writeFileSync(p, content, 'utf8');
  console.log('Successfully guarded toSet in agent-submission-sync');
} else {
  console.log('oldToSet not found');
}
