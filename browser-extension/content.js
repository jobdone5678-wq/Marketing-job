// Recruiting Portal - Copilot & Application Capture
(function () {
  let linked = false;
  let sentProgress = false;
  let lastSuccess = '';
  let lastFailure = 0;
  let candidates = [];
  let selectedCandidateId = null;
  let currentJobTitle = '';
  let currentCompanyName = '';

  const intentId = new URLSearchParams(location.hash.slice(1)).get('marketing-intent');

  // Existing intent check for portal-linked tabs
  if (intentId) {
    chrome.runtime.sendMessage({ intentId }).then(r => {
      linked = !!r?.linked;
      if (linked) observeIntent();
    }).catch(() => {});
  }

  // Determine portal source from hostname
  function detectPortalSource() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('dice.com')) return 'Dice';
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('indeed.com')) return 'Indeed';
    if (host.includes('greenhouse.io')) return 'Greenhouse';
    if (host.includes('ashbyhq.com')) return 'Ashby';
    if (host.includes('lever.co')) return 'Lever';
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) return 'Workday';
    return 'Web Portal';
  }

  // Detect Job Title and Company from DOM
  function detectJobDetails() {
    let title = '';
    let company = '';

    // Dice specific
    const diceTitle = document.querySelector('h1[data-cy="jobTitle"], h1.job-title, [data-testid="job-title"]');
    const diceCompany = document.querySelector('[data-cy="companyName"], .company-name, [data-testid="company-name"]');
    if (diceTitle) title = diceTitle.textContent.trim();
    if (diceCompany) company = diceCompany.textContent.trim();

    // LinkedIn specific
    if (!title) {
      const liTitle = document.querySelector('.job-details-jobs-unified-top-card__job-title, .top-card-layout__title');
      const liCompany = document.querySelector('.job-details-jobs-unified-top-card__company-name, .top-card-layout__card .topcard__org-name-link');
      if (liTitle) title = liTitle.textContent.trim();
      if (liCompany) company = liCompany.textContent.trim();
    }

    // Greenhouse / Ashby / Lever
    if (!title) {
      const h1 = document.querySelector('h1.app-title, h1.job-title, .posting-headline h2, h1');
      if (h1) title = h1.textContent.trim();
    }
    if (!company) {
      const comp = document.querySelector('.company-name, .subhead, .main-header .title');
      if (comp) company = comp.textContent.trim();
    }

    // Fallback: parse document.title
    if (!title || !company) {
      const parts = document.title.split(/[-|–·]/).map(s => s.trim());
      if (!title && parts[0]) title = parts[0];
      if (!company && parts[1]) company = parts[1];
    }

    currentJobTitle = title || document.title.split(/[-|–]/)[0]?.trim() || 'Unspecified Role';
    currentCompanyName = company || 'Unspecified Company';
  }

  // Fetch candidates from background worker
  async function loadCandidates() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'get_candidates' });
      if (res && res.candidates && res.candidates.length > 0) {
        candidates = res.candidates;
        if (!selectedCandidateId) selectedCandidateId = candidates[0].id;
      }
    } catch {}
  }

  // Intelligent Form Autofill Engine
  function autofillCandidate(candidate) {
    if (!candidate) return 0;
    let count = 0;

    const names = (candidate.full_name || '').trim().split(/\s+/);
    const firstName = names[0] || '';
    const lastName = names.slice(1).join(' ') || '';

    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

    function fillInput(input, value) {
      if (!value || input.value === value) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      input.style.transition = 'box-shadow 0.3s, border-color 0.3s';
      input.style.borderColor = '#10b981';
      input.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.3)';
      count++;
    }

    inputs.forEach(el => {
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const label = (el.closest('label')?.textContent || '').toLowerCase();
      const key = `${name} ${id} ${placeholder} ${aria} ${label}`;

      if (el.tagName === 'SELECT') {
        // Dropdown selection for state, work authorization, or country
        if (key.includes('state') && candidate.current_state) {
          const opt = Array.from(el.options).find(o => 
            o.text.toLowerCase().includes(candidate.current_state.toLowerCase()) || 
            o.value.toLowerCase() === candidate.current_state.toLowerCase()
          );
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); count++; }
        }
        if ((key.includes('authoriz') || key.includes('legally')) && candidate.authorized_in_usa) {
          const opt = Array.from(el.options).find(o => o.text.toLowerCase().includes('yes') || o.value.toLowerCase() === 'yes');
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); count++; }
        }
        return;
      }

      if (el.type === 'radio' || el.type === 'checkbox') {
        if ((key.includes('authoriz') || key.includes('legally')) && candidate.authorized_in_usa) {
          if (key.includes('yes') || el.value.toLowerCase() === 'yes' || el.value === '1') {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            count++;
          }
        }
        return;
      }

      // First Name
      if ((key.includes('first') && key.includes('name')) || name === 'fname' || id === 'fname') {
        fillInput(el, firstName);
      }
      // Last Name
      else if ((key.includes('last') && key.includes('name')) || name === 'lname' || id === 'lname') {
        fillInput(el, lastName);
      }
      // Full Name
      else if (key.includes('full name') || (key.includes('name') && !key.includes('company') && !key.includes('user') && !key.includes('title'))) {
        fillInput(el, candidate.full_name);
      }
      // Email
      else if (key.includes('email') || el.type === 'email') {
        fillInput(el, candidate.email);
      }
      // Phone
      else if (key.includes('phone') || key.includes('mobile') || key.includes('cell') || el.type === 'tel') {
        fillInput(el, candidate.phone);
      }
      // LinkedIn
      else if (key.includes('linkedin') || key.includes('profile')) {
        fillInput(el, candidate.linkedin_url);
      }
      // City
      else if (key.includes('city')) {
        fillInput(el, candidate.current_city);
      }
      // State / Province
      else if (key.includes('state') || key.includes('province')) {
        fillInput(el, candidate.current_state);
      }
      // Current Employer / Company
      else if (key.includes('current company') || key.includes('current employer') || key.includes('employer')) {
        fillInput(el, candidate.current_employer);
      }
      // Current Title
      else if (key.includes('current title') || key.includes('job title') || key.includes('headline')) {
        fillInput(el, candidate.current_job_title);
      }
      // Years of experience
      else if (key.includes('years') && key.includes('experience')) {
        fillInput(el, String(candidate.total_experience_years || ''));
      }
    });

    return count;
  }

  // Automatic Submission Logger
  async function logSubmission(evidenceText) {
    if (!selectedCandidateId) return;
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    try {
      const payload = {
        candidateId: selectedCandidateId,
        companyName: currentCompanyName,
        jobTitle: currentJobTitle,
        jobUrl: window.location.href.split('#')[0],
        portalSource: detectPortalSource(),
        status: 'Applied',
        evidence: evidenceText || 'Detected form submission'
      };
      const res = await chrome.runtime.sendMessage({ type: 'auto_submit', payload });
      if (res && res.success) {
        showInPageToast(`✅ Logged application for ${candidate?.full_name || 'candidate'} to ${currentCompanyName}!`);
      }
    } catch {}
  }

  // Floating Toast Notification
  function showInPageToast(message, isError = false) {
    const existing = document.getElementById('mp-copilot-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'mp-copilot-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? '#ef4444' : '#10b981'};
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font: 500 13px system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 9999999;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  // Build and Inject Floating Copilot Widget
  function injectFloatingWidget() {
    if (document.getElementById('mp-copilot-root')) return;

    detectJobDetails();

    const root = document.createElement('div');
    root.id = 'mp-copilot-root';
    root.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Minimized Pill
    const pill = document.createElement('div');
    pill.id = 'mp-copilot-pill';
    pill.style.cssText = `
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #f8fafc;
      border: 1px solid #334155;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      border-radius: 30px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    pill.innerHTML = `
      <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
      <span>💼 Recruiting Copilot</span>
    `;

    // Expanded Card
    const card = document.createElement('div');
    card.id = 'mp-copilot-card';
    card.style.cssText = `
      display: none;
      width: 320px;
      background: #0f172a;
      color: #f1f5f9;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      font-size: 12px;
    `;

    function updateCardContent() {
      const candidateOptions = candidates.map(c => 
        `<option value="${c.id}" ${c.id === selectedCandidateId ? 'selected' : ''}>
          ${c.full_name} (${c.visa_status || 'US Citizen'})
        </option>`
      ).join('');

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
          <div style="font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px;">
            <div style="width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></div>
            Recruiting Copilot
          </div>
          <button id="mp-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; padding: 0 4px;">&times;</button>
        </div>

        <div style="background: #1e293b; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
          <div style="font-size: 11px; color: #94a3b8;">Detected Job on ${detectPortalSource()}:</div>
          <div style="font-weight: 600; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${currentJobTitle}
          </div>
          <div style="color: #cbd5e1; font-size: 11px;">${currentCompanyName}</div>
        </div>

        <div style="margin-bottom: 10px;">
          <label style="display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Select Bench Candidate:</label>
          <select id="mp-candidate-select" style="width: 100%; background: #0b1120; color: #f1f5f9; border: 1px solid #334155; border-radius: 6px; padding: 6px; font-size: 12px; outline: none;">
            ${candidateOptions || '<option>Loading candidates from portal...</option>'}
          </select>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <button id="mp-autofill-btn" style="flex: 1; background: #2563eb; color: white; border: none; border-radius: 6px; padding: 7px 10px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            ✨ Autofill Form
          </button>
          <button id="mp-log-btn" style="flex: 1; background: #059669; color: white; border: none; border-radius: 6px; padding: 7px 10px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            ✅ Log Applied
          </button>
        </div>

        <div style="font-size: 10px; color: #64748b; text-align: center; border-top: 1px solid #1e293b; padding-top: 6px;">
          Active auto-observation: Submitting will auto-log to portal.
        </div>
      `;

      // Event handlers
      card.querySelector('#mp-close-btn').addEventListener('click', () => {
        card.style.display = 'none';
        pill.style.display = 'flex';
      });

      card.querySelector('#mp-candidate-select').addEventListener('change', (e) => {
        selectedCandidateId = e.target.value;
      });

      card.querySelector('#mp-autofill-btn').addEventListener('click', () => {
        const candidate = candidates.find(c => c.id === selectedCandidateId);
        if (!candidate) {
          showInPageToast('Please select a candidate first.', true);
          return;
        }
        const filledCount = autofillCandidate(candidate);
        showInPageToast(`✨ Filled ${filledCount} application fields for ${candidate.full_name}!`);
      });

      card.querySelector('#mp-log-btn').addEventListener('click', () => {
        logSubmission('Manually logged via Recruiting Copilot');
      });
    }

    pill.addEventListener('click', () => {
      pill.style.display = 'none';
      card.style.display = 'block';
      detectJobDetails();
      updateCardContent();
    });

    root.appendChild(pill);
    root.appendChild(card);
    document.body.appendChild(root);

    updateCardContent();
  }

  // Observe Application Submission Events
  function observeUniversal() {
    const inspect = () => {
      // Success confirmation detection on page
      const nodes = document.querySelectorAll('#application_confirmation, .application-confirmation, [data-testid="application-success"], [role="status"], h1, h2, h3, p');
      for (const node of nodes) {
        const text = (node.textContent || '').trim().slice(0, 1000);
        if (
          /(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent)|we (?:have )?received your application|application submitted|applied to)/i.test(text) &&
          lastSuccess !== text
        ) {
          lastSuccess = text;
          logSubmission(text);
        }
      }
    };

    inspect();
    new MutationObserver(inspect).observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Native form submit listener
    document.addEventListener('submit', () => {
      setTimeout(inspect, 1500);
    }, true);

    // Click submit button listener
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button, input[type="submit"]');
      if (btn) {
        const text = (btn.textContent || btn.value || '').trim();
        if (/^(?:submit|apply|submit application|send application)$/i.test(text)) {
          setTimeout(inspect, 1800);
        }
      }
    }, true);
  }

  // Existing Intent Observer for backward compatibility
  function observeIntent() {
    function form() {
      return document.querySelector('form#application_form, form[action*="applications"], form[data-testid*="application"], form');
    }
    function send(status, evidence) {
      if (linked) chrome.runtime.sendMessage({ status, evidence }).catch(() => {});
    }

    const inspect = () => {
      const f = form();
      if (f && !sentProgress) {
        sentProgress = true;
        send('in_progress', 'Application form opened');
      }
      const nodes = document.querySelectorAll('#application_confirmation, .application-confirmation, [data-testid="application-success"], [role="status"], h1, h2');
      for (const node of nodes) {
        const text = (node.textContent || '').trim().slice(0, 1000);
        if (
          /(?:thank you for (?:applying|your application)|application (?:has been |was |is )?(?:successfully )?(?:submitted|received)|we (?:have )?received your application)/i.test(text) &&
          lastSuccess !== text
        ) {
          lastSuccess = text;
          send('submitted', text);
        }
      }
      if (f && Date.now() - lastFailure > 3000 && f.querySelector('[aria-invalid="true"], .field-error, [data-testid="field-error"]')) {
        lastFailure = Date.now();
        send('failed', 'Validation error: required or invalid field');
      }
    };

    inspect();
    new MutationObserver(inspect).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-invalid']
    });

    document.addEventListener('submit', (e) => {
      if (e.target === form()) send('submit_attempted', 'Final application Submit attempted');
    }, true);

    document.addEventListener('invalid', () => {
      if (Date.now() - lastFailure > 3000) {
        lastFailure = Date.now();
        send('failed', 'Validation error: required or invalid field');
      }
    }, true);

    document.addEventListener('click', (e) => {
      const button = e.target.closest?.('button');
      if (button && form()?.contains(button) && button.type !== 'submit' && /^submit application$/i.test(button.textContent.trim())) {
        send('submit_attempted', 'Final application Submit attempted');
      }
    }, true);
  }

  // Initialize Copilot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await loadCandidates();
      injectFloatingWidget();
      observeUniversal();
    });
  } else {
    loadCandidates().then(() => {
      injectFloatingWidget();
      observeUniversal();
    });
  }
})();