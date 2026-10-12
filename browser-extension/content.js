// Recruiting Portal - Copilot & Application Capture
(function () {
  let linked = false;
  let sentProgress = false;
  let lastSuccess = '';
  let lastFailure = 0;
  let candidates = [];
  let selectedCandidateId = null;
  let linkedCandidateId = null;
  let candidateRole = null;
  const editedFields = new WeakSet();
  let filling = false;
  let autofillTimer;
  let currentJobTitle = '';
  let currentCompanyName = '';
  let submissionEventKey = crypto.randomUUID();
  let submissionAttempt = 0;
  const applicationAnswers = new Map();
  let draftTimer;

  function captureApplicationAnswers() {
    const answers = new Map();
    const relevant = /name|email|phone|mobile|address|city|state|zip|postal|country|location|linkedin|portfolio|website|github|skill|experience|employ|education|school|university|degree|qualif|company|title|role|position|salary|compensation|rate|availab|notice|start|relocat|sponsor|authori|work.?permit|cover.?letter|message|hear|referr|interest|project|summary/i;
    const sensitive = /password|secret|token|credential|payment|credit.?card|bank|routing|ssn|social.?security|tax.?id|birth.?date|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|otp|one.?time.?code/i;
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.closest('#mp-copilot-root') || !el.getClientRects().length || el.disabled || el.type === 'hidden' || ['password','file','submit','button','reset','image'].includes(el.type)) continue;
      const labels = Array.from(el.labels || []).map(label => label.textContent || '').join(' ').trim();
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent || '';
      const question = [legend, labelledBy, labels, el.getAttribute('aria-label'), el.placeholder].filter(Boolean).join(' ').trim();
      const label = (question || el.name || el.id || '').slice(0, 200);
      const key = String(el.name || el.id || label).trim().slice(0, 160);
      if (!key || !label || sensitive.test(`${key} ${question} ${el.name || ''} ${el.id || ''}`) || !relevant.test(`${key} ${question || label}`)) continue;
      const normalized=key.toLowerCase();
      const value = ['checkbox','radio'].includes(el.type)&&!el.checked?'':el.tagName==='SELECT'&&el.multiple?Array.from(el.selectedOptions).map(option=>option.textContent.trim()).join('; '):String(el.value || '').trim();
      const previous=answers.get(normalized);
      if(previous&&value&&el.type==='checkbox')previous.value=(previous.value+'; '+value).slice(0,4000);
      else if(value||!previous)answers.set(normalized,{key,label,value:value.slice(0,4000)});
    }
    for(const [key,answer] of answers){if(answer.value)applicationAnswers.set(key,answer);else applicationAnswers.delete(key);}
    return Array.from(applicationAnswers.values()).slice(0,100);
  }

  function rememberAnswers(event) {
    if(!selectedCandidateId)return;
    const answers=captureApplicationAnswers();
    clearTimeout(draftTimer);
    const save=()=>chrome.runtime.sendMessage({type:'save_answer_draft',candidateId:selectedCandidateId,answers,eventKey:submissionEventKey,attempt:submissionAttempt,jobTitle:currentJobTitle,companyName:currentCompanyName}).catch(()=>{});
    if(event===true||event?.type==='submit')return save();
    draftTimer=setTimeout(save,100);
  }
  for(const event of ['input','change','click','submit'])document.addEventListener(event,rememberAnswers,true);

  const intentId = new URLSearchParams(location.hash.slice(1)).get('marketing-intent');

  // Resolve the tab's intent before choosing a profile; never default recruiters to row one.
  const intentContext = chrome.runtime.sendMessage(intentId ? { intentId } : { type: 'get_context' }).then(r => {
        linked = !!r?.linked;
        linkedCandidateId = linked ? r.candidateId : null;
        return r;
      }).catch(() => null);

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
    if(submissionAttempt>0&&currentJobTitle)return;
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

  async function loadCandidates() {
    try {
      await intentContext;
      const res = await chrome.runtime.sendMessage({ type: 'get_candidates', refresh: true, candidateId: linkedCandidateId });
      candidates = res?.candidates || [];
      candidateRole = res?.role;
      const draft=await chrome.runtime.sendMessage({type:'get_answer_draft'}).catch(()=>null);
      const id = linkedCandidateId || (candidateRole === 'client' ? res.ownCandidateId : draft?.candidateId);
      selectedCandidateId = candidates.some(c => c.id === id) ? id : null;
      if(draft?.candidateId===selectedCandidateId&&Array.isArray(draft.answers)){
        for(const answer of draft.answers.slice(0,100))applicationAnswers.set(answer.key.toLowerCase(),answer);
        if(draft.eventKey)submissionEventKey=draft.eventKey;
        submissionAttempt=Number.isInteger(draft.attempt)?draft.attempt:0;
        currentJobTitle=draft.jobTitle||'';currentCompanyName=draft.companyName||'';
      }
    } catch { candidates = []; selectedCandidateId = null; }
  }

  function nativeSet(el, property, value) {
    if (property === 'checked') {
      // React uses click events to update controlled checkbox/radio state.
      if (el.checked !== value) {
        filling = true;
        try { el.click(); } finally { filling = false; }
      }
      return;
    }
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) setter.call(el, value); else el[property] = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function chooseCandidate(id) {
    if ((linkedCandidateId && id !== linkedCandidateId) || (selectedCandidateId && id !== selectedCandidateId)) {
      showInPageToast('This application is tied to one profile. Reload the application to choose a different candidate.', true);
      return;
    }
    selectedCandidateId = candidates.some(c => c.id === id) ? id : null;
    scheduleAutofill();
  }

  // Fill only known profile facts into empty application fields. Never submit.
  function autofillCandidate(candidate) {
    if (!candidate) return 0;
    let count = 0;
    const names = (candidate.full_name || '').trim().split(/\s+/);
    const norm = value => String(value || '').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    const controls = document.querySelectorAll('input, textarea, select');
    for (const el of controls) {
      if (el.closest('#mp-copilot-root') || el.disabled || el.readOnly || editedFields.has(el) || !el.getClientRects().length) continue;
      if (['hidden', 'submit', 'button', 'file', 'password', 'search', 'reset'].includes(el.type)) continue;
      const labels = Array.from(el.labels || []).map(label => label.textContent).join(' ');
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent || '';
      const key = norm([el.name, el.id, el.placeholder, el.getAttribute('aria-label'), labels, labelledBy, legend, el.autocomplete].filter(Boolean).join(' '));
      if (/password|sign in|log in|search|cover letter|reference|referral|emergency|terms|consent|privacy|gender|ethnicity|veteran|disability/.test(key)) continue;
      let value = null;
      if (/sponsor/.test(key)) {
        value = /future/.test(key) ? candidate.need_sponsorship_future : candidate.need_sponsorship_now;
        if (/now.*future|future.*now/.test(key)) value = candidate.need_sponsorship_now === candidate.need_sponsorship_future ? candidate.need_sponsorship_now : null;
      } else if (/authoriz|eligible|legally.*work/.test(key)) {
        // This profile fact is specifically US work authorization.
        if (!/\b(?:usa|united states|u\.s\.?|us)\b/.test(key) || /\bnot\b|unrestricted|permanent/.test(key)) continue;
        value = candidate.authorized_in_usa;
      } else if (/relocat/.test(key)) value = candidate.open_to_relocation;
      else if (/first.*name|given.*name|given name|\bfname\b/.test(key)) value = names[0];
      else if (/last.*name|family.*name|surname|\blname\b/.test(key)) value = names.slice(1).join(' ');
      else if (/e ?mail/.test(key) || el.type === 'email') value = candidate.email;
      else if (/phone|mobile|telephone/.test(key) || el.type === 'tel') value = candidate.phone;
      else if (/linkedin/.test(key)) value = candidate.linkedin_url;
      else if (/university|institution|school/.test(key)) value = candidate.university_name;
      else if (/degree|qualification/.test(key)) value = candidate.highest_qualification;
      else if (/graduation/.test(key)) value = candidate.graduation_year;
      else if (/full.*address|street.*address|address line 1/.test(key)) value = candidate.full_address;
      else if (/city|address level2/.test(key)) value = candidate.current_city;
      else if (/state|province|address level1/.test(key)) value = candidate.current_state;
      else if (/current.*company|current.*employer/.test(key)) value = candidate.current_employer;
      else if (/current.*title|job.*title|headline/.test(key)) value = candidate.current_job_title;
      else if (/years.*experience|experience.*years/.test(key)) value = candidate.total_experience_years;
      else if (/primary.*skills|technical.*skills/.test(key)) value = candidate.primary_skills;
      else if (/full.*name|legal.*name/.test(key) || norm(el.name) === 'name' || norm(el.autocomplete) === 'name') value = candidate.full_name;
      if (value === null || value === undefined || value === '') continue;
      const boolean = typeof value === 'boolean';
      if (['radio', 'checkbox'].includes(el.type)) {
        if (!boolean) continue;
        const group = el.name ? Array.from(document.getElementsByName(el.name)).filter(input => input.form === el.form) : [el];
        if (group.some(input => input.checked)) continue;
        const answer = norm(el.value);
        const labelAnswer = norm(labels);
        const yes = /^(yes|true|1)$/.test(answer) || /^(yes|yes[,. ].*)$/.test(labelAnswer);
        const no = /^(no|false|0)$/.test(answer) || /^(no|no[,. ].*)$/.test(labelAnswer);
        if (!(value ? yes : no)) continue;
        nativeSet(el, 'checked', true);
      } else if (el.tagName === 'SELECT') {
        const selected = el.selectedOptions[0];
        if (el.value && !/^(select|choose|please select|--)/i.test(selected?.textContent?.trim() || '')) continue;
        const answer = boolean ? (value ? 'yes' : 'no') : norm(value);
        const option = Array.from(el.options).find(option => !option.disabled && option.value !== '' &&
          (norm(option.textContent) === answer || norm(option.value) === answer || boolean && norm(option.value) === String(value)));
        if (!option) continue;
        nativeSet(el, 'value', option.value);
      } else {
        if (el.value.trim()) continue;
        const answer = boolean ? (value ? 'Yes' : 'No') : String(value);
        nativeSet(el, 'value', answer);
      }
      count++;
    }
    return count;
  }

  function scheduleAutofill() {
    clearTimeout(autofillTimer);
    autofillTimer = setTimeout(() => {
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (candidate) autofillCandidate(candidate);
    }, 120);
  }

  function observeAutofill() {
    for (const event of ['input', 'change']) document.addEventListener(event, e => {
      if (!filling && e.isTrusted && e.target instanceof Element && !e.target.closest('#mp-copilot-root')) editedFields.add(e.target);
    }, true);
    new MutationObserver(mutations => {
      if (mutations.some(m => !m.target.parentElement?.closest('#mp-copilot-root, #mp-copilot-toast'))) scheduleAutofill();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class', 'style', 'aria-hidden'] });
    scheduleAutofill();
  }

  // Automatic Submission Logger
  async function logSubmission(evidenceText,manualAttestation=false) {
    if (!selectedCandidateId) return;
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    try {
      submissionAttempt=Math.max(1,submissionAttempt);
      await rememberAnswers(true);
      if(linked&&manualAttestation){
        const result=await chrome.runtime.sendMessage({status:'submitted',manualAttestation:true,evidence:evidenceText||'Applicant manually attested submission'});
        reportCaptureDelivery(result);
        return;
      }
      const payload = {
        candidateId: selectedCandidateId,
        eventKey: submissionEventKey,
        attempt: Math.max(1, submissionAttempt),
        companyName: currentCompanyName,
        jobTitle: currentJobTitle,
        jobUrl: window.location.href.split('#')[0],
        portalSource: detectPortalSource(),
        status: 'Applied',
        evidence: evidenceText || 'Detected form submission',
        answers: manualAttestation?undefined:captureApplicationAnswers(),
        manualAttestation,
        profileVersion: candidate?.version || null
      };
      const res = await chrome.runtime.sendMessage({ type: 'auto_submit', payload });
      if (res && res.success) {
        showInPageToast(`✅ Logged application for ${candidate?.full_name || 'candidate'} to ${currentCompanyName}!`);
        // Keep the event key for repeated confirmation messages and retries on this application.
      }
      reportCaptureDelivery(res);
    } catch { reportCaptureDelivery({ error: true }); }
  }

  function reportCaptureDelivery(result) {
    let message = '';
    if (result?.manualReview) message = 'Capture needs manual review in the portal. Evidence remains saved locally; automatic retries are paused.';
    else if (result?.needsReconnect) message = 'Capture is queued locally. Reconnect the extension to sync this application update.';
    else if (result?.queued) message = 'Application update queued locally, waiting to sync. Keep the extension connected; review the application in the portal if syncing fails.';
    else if (result?.error) message = 'Capture could not be saved to the portal. Check the extension connection and review this application in the portal; the capture queue may be full.';
    else if (result?.success) message = 'Application update synced to the portal.';
    if (!message) return;
    const root = document.getElementById('mp-copilot-root');
    if (!root) return;
    let status = document.getElementById('mp-capture-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'mp-capture-status';
      status.setAttribute('role', 'status');
      status.style.cssText = 'max-width:320px;margin-top:8px;padding:10px;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:12px;';
      root.appendChild(status);
    }
    status.textContent = message;
    if (result?.error || result?.manualReview) showInPageToast(message, true);
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
      const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const candidateOptions = candidates.map(c => 
        `<option value="${c.id}" ${c.id === selectedCandidateId ? 'selected' : ''}>
          ${escape(c.full_name)}
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
            ${escape(currentJobTitle)}
          </div>
          <div style="color: #cbd5e1; font-size: 11px;">${escape(currentCompanyName)}</div>
        </div>

        <div style="margin-bottom: 10px;">
          <label style="display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Candidate profile:</label>
          <select id="mp-candidate-select" style="width: 100%; background: #0b1120; color: #f1f5f9; border: 1px solid #334155; border-radius: 6px; padding: 6px; font-size: 12px; outline: none;">
            <option value="">Select a reviewed candidate</option>
            ${candidateOptions}
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
          Known details fill automatically. Review all answers before submitting.
        </div>
      `;

      // Event handlers
      card.querySelector('#mp-close-btn').addEventListener('click', () => {
        card.style.display = 'none';
        pill.style.display = 'flex';
      });

      card.querySelector('#mp-candidate-select').addEventListener('change', (e) => {
        chooseCandidate(e.target.value);
        e.target.value = selectedCandidateId || '';
        e.target.disabled = Boolean(selectedCandidateId);
      });

      card.querySelector('#mp-candidate-select').disabled = Boolean(selectedCandidateId) || Boolean(linkedCandidateId) || candidateRole === 'client';
      card.querySelector('#mp-candidate-select').title = 'Each application uses one profile. Reload an unlinked application to choose another candidate.';
      card.querySelector('#mp-log-btn').hidden = false;

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
        logSubmission('Applicant manually attested that the application was submitted',true);
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
      if(linked)return;
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
      if(!linked)submissionAttempt += 1;
      rememberAnswers(true);
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
    async function send(status, evidence) {
      if(status==='submit_attempted')rememberAnswers(true);
      if (!linked) return;
      try {
        const result = await chrome.runtime.sendMessage({ status, evidence, ...(['submit_attempted','submitted'].includes(status) ? { answers: captureApplicationAnswers() } : {}) });
        reportCaptureDelivery(result);
      } catch { reportCaptureDelivery({ error: true }); }
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
      if (e.target === form()) { submissionAttempt += 1; send('submit_attempted', 'Final application Submit attempted'); }
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
        submissionAttempt += 1;
        send('submit_attempted', 'Final application Submit attempted');
      }
    }, true);
  }

  // Initialize Copilot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await loadCandidates();
      injectFloatingWidget();
      if(linked)observeIntent();else observeUniversal();
      observeAutofill();
    });
  } else {
    loadCandidates().then(() => {
      injectFloatingWidget();
      if(linked)observeIntent();else observeUniversal();
      observeAutofill();
    });
  }
})();
