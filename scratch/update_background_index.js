const fs = require('fs');

const path = 'jobright_extension/static/background/index.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Update generate_ai_field_answer with robust fallback and local generation
const aiGenTarget = `    if (type === 'generate_ai_field_answer') {
      const { prompt, fieldLabel, candidate, jobTitle, companyName } = msg;
      (async () => {
        try {
          const storage = await chrome.storage.local.get(['origin', 'token', 'nextkin_auth_token']);
          let primaryOrigin = storage.origin || 'http://localhost:3000';
          const fallbackOrigin = primaryOrigin.includes('localhost') ? 'https://www.nextkinhr.com' : 'http://localhost:3000';
          const tok = storage.token || storage.nextkin_auth_token || '';

          let resp = null;
          try {
            resp = await fetch(primaryOrigin + '/api/extension/generate-answer', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'x-extension-id': chrome.runtime.id || 'nextkin-copilot'
              },
              body: JSON.stringify({ prompt, fieldLabel, candidate, jobTitle, companyName })
            });
          } catch (e1) {
            resp = await fetch(fallbackOrigin + '/api/extension/generate-answer', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'x-extension-id': chrome.runtime.id || 'nextkin-copilot'
              },
              body: JSON.stringify({ prompt, fieldLabel, candidate, jobTitle, companyName })
            });
          }

          const data = await resp.json();
          if (data && data.ok) {
            reply({ ok: true, answer: data.answer });
          } else {
            reply({ ok: false, error: data?.error || 'Generation failed' });
          }
        } catch (err) {
          reply({ ok: false, error: err.message });
        }
      })();
      return true;
    }`;

const aiGenReplacement = `    if (type === 'generate_ai_field_answer') {
      const { prompt, fieldLabel, candidate, jobTitle, companyName } = msg;
      (async () => {
        const buildFallbackAnswer = () => {
          const name = candidate?.full_name || 'Candidate';
          const skills = (Array.isArray(candidate?.skills) && candidate.skills.length) ? candidate.skills.slice(0, 4).join(', ') : 'software engineering';
          const role = jobTitle || 'this role';
          const comp = companyName || 'your team';
          const candSummary = candidate?.summary || candidate?.confirmed_facts?.summary;
          if (candSummary && candSummary.length > 25) {
            return candSummary;
          }
          return \`I am excited to apply for \${role} at \${comp}. With a strong background in \${skills}, I am eager to apply my problem-solving skills and technical experience to make an immediate impact on your organization.\`;
        };

        try {
          const storage = await chrome.storage.local.get(['origin', 'token', 'nextkin_auth_token']);
          const primaryOrigin = 'http://localhost:3000';
          const fallbackOrigin = storage.origin || 'https://www.nextkinhr.com';
          const tok = storage.token || storage.nextkin_auth_token || '';

          let answer = null;
          for (const origin of [primaryOrigin, fallbackOrigin]) {
            try {
              const resp = await fetch(origin + '/api/extension/generate-answer', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + tok,
                  'x-extension-id': chrome.runtime.id || 'nextkin-copilot'
                },
                body: JSON.stringify({ prompt, fieldLabel, candidate, jobTitle, companyName })
              });
              if (resp.ok) {
                const data = await resp.json();
                if (data && data.ok && data.answer) {
                  answer = data.answer;
                  break;
                }
              }
            } catch (_) {}
          }

          if (answer) {
            reply({ ok: true, answer });
          } else {
            reply({ ok: true, answer: buildFallbackAnswer() });
          }
        } catch (err) {
          reply({ ok: true, answer: buildFallbackAnswer() });
        }
      })();
      return true;
    }`;

if (content.includes(aiGenTarget)) {
  content = content.replace(aiGenTarget, aiGenReplacement);
  console.log('Updated generate_ai_field_answer in background index.js');
} else {
  console.log('aiGenTarget not found');
}

// 2. Block non-job domains in auto_submit and record_submission
const autoSubmitTarget = `    if (type === 'auto_submit' || type === 'record_submission') {
      const payload = msg.payload || msg;
      const storage = await chrome.storage.local.get(['outbox', 'origin', 'token', 'nextkin_auth_token', 'nextkin_active_candidate', 'uploaded_resume']);
      const outbox = storage.outbox || [];
      const activeCand = storage.nextkin_active_candidate || storage.uploaded_resume || null;`;

const autoSubmitReplacement = `    if (type === 'auto_submit' || type === 'record_submission') {
      const payload = msg.payload || msg;

      let targetJobUrl = payload.jobUrl || '';
      if (!targetJobUrl || targetJobUrl.startsWith('chrome-extension://')) {
        targetJobUrl = (sender.tab && sender.tab.url) || '';
      }

      // Strict rejection of non-job platforms (ChatGPT, OpenAI, Claude, GitHub, etc.)
      const BLOCKED_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'github.com', 'gitlab.com', 'gitingest.com', 'gitreverse.com', 'google.com', 'bing.com', 'youtube.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitter.com', 'x.com', 'reddit.com', 'cloudflare.com'];
      if (targetJobUrl) {
        try {
          const u = new URL(targetJobUrl);
          const h = u.hostname.toLowerCase();
          if (BLOCKED_HOSTS.some(b => h === b || h.endsWith('.' + b))) {
            reply({ ok: false, error: 'Target URL is blocked: ' + h });
            return;
          }
        } catch (_) {}
      }

      const storage = await chrome.storage.local.get(['outbox', 'origin', 'token', 'nextkin_auth_token', 'uploaded_resume', 'nextkin_uploaded_resume', 'uploadedCandidate', 'nextkin_active_candidate']);
      const outbox = storage.outbox || [];
      const upl = storage.uploaded_resume || storage.nextkin_uploaded_resume;
      const activeCand = (upl && upl.parsed_candidate) || storage.uploadedCandidate || upl || storage.nextkin_active_candidate || null;`;

if (content.includes(autoSubmitTarget)) {
  content = content.replace(autoSubmitTarget, autoSubmitReplacement);
  console.log('Updated auto_submit with domain blocking and uploaded resume priority');
} else {
  console.log('autoSubmitTarget not found');
}

// 3. Update getNextKinCandidate prioritization
const getCandTarget = `async function getNextKinCandidate() {
  try {
    var saved = await chrome.storage.local.get([
      "nextkin_active_candidate",
      "uploadedCandidate",
      "uploaded_resume",
      "nextkin_uploaded_resume",
      "nextkin_candidate_data"
    ]);
    var cand = saved.nextkin_active_candidate ||
               saved.uploadedCandidate ||
               saved.uploaded_resume ||
               saved.nextkin_uploaded_resume ||
               saved.nextkin_candidate_data;`;

const getCandReplacement = `async function getNextKinCandidate() {
  try {
    var saved = await chrome.storage.local.get([
      "uploaded_resume",
      "nextkin_uploaded_resume",
      "uploadedCandidate",
      "nextkin_active_candidate",
      "nextkin_candidate_data"
    ]);
    var upl = saved.uploaded_resume || saved.nextkin_uploaded_resume;
    var cand = (upl && upl.parsed_candidate) ||
               saved.uploadedCandidate ||
               upl ||
               saved.nextkin_active_candidate ||
               saved.nextkin_candidate_data;`;

if (content.includes(getCandTarget)) {
  content = content.replace(getCandTarget, getCandReplacement);
  console.log('Updated getNextKinCandidate prioritization in background index.js');
} else {
  console.log('getCandTarget not found');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Saved updates to static/background/index.js');
