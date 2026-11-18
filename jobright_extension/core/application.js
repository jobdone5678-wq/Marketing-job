(function () {
  if (globalThis.NextkinApplication) return;
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  const manualQuestion = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
  const privateAnswer = /birth|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|signature/i;
  const finalSubmit = /^(?:submit(?:\s+(?:my |your |the )?application)?|send application|apply(?: now)?|complete application|finish application)[.!]?$/i;
  const reviewField = /\b(?:agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|signature|captcha|password|otp)\b/i;
  const fileEvidence = new WeakMap();
  const submitting = new WeakSet();
  let wizard;
  const answerKey = field => field.label.normalize('NFKC').toLowerCase().replace(/[?*:.!]+$/g, '').trim().replace(/\s+/g, ' ');

  function inspect() {
    const job = capture.read();
    const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
    const contacts = new Set(fields.map(field => mapping.resolveFact(field.label, field.hint)?.key)
      .filter(key => contactKeys.has(key)));
    const routeLooksLikeApplication = /(?:^|[/?=_#-])(?:apply|applyjob|application|applytojob|jobapply)(?:$|[/?=_#-])/i.test(location.pathname + location.search + (location.hash || ''));
    const resumeInput = findResumeInput();
    const hasForm = (contacts.size >= 2 && !!(job || routeLooksLikeApplication || resumeInput)) ||
      (routeLooksLikeApplication && fields.length >= 1) || (!!job && fields.length >= 2 && !!resumeInput);
    return { job, fields, hasForm, resumeInput };
  }

  function findResumeInput(root = document) {
    const matches = input => {
      if (input.disabled) return false;
      const label = discovery.label(input);
      const description = [label, input.name, input.id, input.getAttribute?.('data-testid'), input.getAttribute?.('data-automation-id')]
        .join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '');
      return /\b(?:resume|curriculum vitae|cv)\b/i.test(description) && !/cover\s*letter|additional|optional document/i.test(label);
    };
    const direct = [...root.querySelectorAll('input[type="file"]')].find(matches);
    if (direct) return direct;
    for (const host of root.querySelectorAll('*')) {
      if (!host.shadowRoot) continue;
      const nested = findResumeInput(host.shadowRoot);
      if (nested) return nested;
    }
  }

  function resumeMetadata(file) {
    if (!file || !/\.(?:pdf|docx)$/i.test(file.name)) return null;
    return { filename: file.name.slice(0, 255), mimeType: /\.docx$/i.test(file.name)
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' };
  }

  async function readAttachedResume(file) {
    const metadata = resumeMetadata(file);
    if (!metadata || fileEvidence.has(file) || file.size > 2 * 1024 * 1024) return;
    fileEvidence.set(file, metadata);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    }
    fileEvidence.set(file, { ...metadata, base64: btoa(chunks.join('')) });
  }

  function submissionEvidence(form) {
    const answers = new Map();
    for (const field of discovery.discoverFields(form)) {
      if (!field.label || field.excluded || field.kind === 'inaccessible' || manualQuestion.test(field.label) || privateAnswer.test(field.label)) continue;
      const key = answerKey(field).slice(0, 160);
      const value = writer.read(field);
      if (!key || value === undefined || value === null || value === '' || answers.has(key)) continue;
      answers.set(key, { key, label: field.label.slice(0, 200), value: String(Array.isArray(value) ? value.join(', ') : value).slice(0, 1000) });
      if (answers.size === 100) break;
    }
    const file = findResumeInput(form)?.files?.[0];
    const appliedResume = file && (fileEvidence.get(file) || resumeMetadata(file));
    return { answers: [...answers.values()], ...(appliedResume ? { appliedResume } : {}) };
  }

  function prepareSubmission(form, url, job, evidence = submissionEvidence(form)) {
    return chrome.runtime.sendMessage({ action: 'prepare_application_tracking', url, job, submitted: true,
      submissionEvidence: evidence });
  }

  async function submitApplication(expectedUrl) {
    if (location.href !== expectedUrl) throw new Error('The application page changed.');
    const { job, hasForm, fields } = inspect();
    const forms = new Set(fields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
    const [form] = forms;
    if (!hasForm || forms.size !== 1 || submitting.has(form) || typeof form.requestSubmit !== 'function') {
      throw new Error('Submit manually on the employer page. A single final application form is required.');
    }
    const buttons = [...form.elements].filter(button => button.type === 'submit' && !button.disabled &&
      !button.formNoValidate && button.getClientRects().length && finalSubmit.test(submitLabel(button)));
    const blocked = form.querySelector('[data-sitekey], iframe[src*="captcha" i], [name*="captcha" i], input[type="password"]');
    const incomplete = fields.some(field => {
      const element = field.element;
      const value = writer.read(field);
      const label = field.label + ' ' + (field.hint || '');
      if (reviewField.test(label) && field.kind === 'checkbox') return value !== true;
      const required = element?.required || element?.getAttribute?.('aria-required') === 'true' ||
        field.options?.some(option => option.element?.required) || reviewField.test(label);
      return required && (value === '' || value == null || value === false || Array.isArray(value) && !value.length);
    });
    if (buttons.length !== 1 || blocked || incomplete || !form.checkValidity()) {
      throw new Error('Review and complete the employer form, then submit it manually.');
    }
    submitting.add(form);
    try {
      const file = findResumeInput(form)?.files?.[0];
      if (file) await readAttachedResume(file).catch(() => {});
      const evidence = submissionEvidence(form);
      const tracked = await prepareSubmission(form, expectedUrl, job, evidence);
      if (!tracked?.tracked || location.href !== expectedUrl || !form.isConnected || !form.checkValidity()) {
        throw new Error('Automatic submission could not start. Review the form and submit manually.');
      }
      if (file !== findResumeInput(form)?.files?.[0] || JSON.stringify(evidence.answers) !== JSON.stringify(submissionEvidence(form).answers)) {
        throw new Error('Form values changed during autofill. Review the form and submit manually.');
      }
      form.requestSubmit(buttons[0]);
    } catch (error) {
      submitting.delete(form);
      throw error;
    }
  }

  function submitLabel(button) {
    return String(button.innerText || button.value || button.getAttribute?.('aria-label') || '').trim();
  }

  async function fill(expectedUrl, candidate, resume, continuation = false, newFields) {
    if (location.href !== expectedUrl) throw new Error('The page changed. Open the application form and try again.');
    const page = inspect();
    if (!page.hasForm && (!continuation || !page.fields.length)) {
      throw new Error('Open the job application form before using autofill.');
    }
    const facts = candidate?.provenance_status === 'confirmed' ? candidate.confirmed_facts : candidate;
    if (!facts || !Object.values(facts).some(value =>
      typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' && value.trim()
    )) {
      return { filled: [], unfilled: [], total: page.fields.length, error: 'Save your candidate details in My Applications and Resume first.' };
    }
    const fields = newFields ? page.fields.filter(field => newFields.some(next =>
      next.element === field.element && next.label === field.label)) : page.fields;
    const plans = mapping.planFill(fields, facts);
    const receipts = await writer.applyFill(plans, {
      sessionId: crypto.randomUUID(),
      isCurrent: () => location.href === expectedUrl,
    });
    const filled = receipts.map(receipt => ({
      key: receipt.field.key,
      label: receipt.field.label || receipt.field.hint || 'Application field',
      value: Array.isArray(receipt.writtenValue)
        ? receipt.writtenValue.join(', ')
        : typeof receipt.writtenValue === 'boolean' ? (receipt.writtenValue ? 'Yes' : 'No') : String(receipt.writtenValue ?? ''),
    }));
    const input = findResumeInput();
    if (input?.isConnected && resume && !input.files?.length && location.href === expectedUrl) {
      try {
        if (!resume.base64) throw new Error('No resume data');
        const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], resume.filename, { type: resume.mimeType }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const file = input.files?.[0];
        if (file?.name === resume.filename) {
          const metadata = resumeMetadata(file);
          if (metadata && file.size <= 2 * 1024 * 1024) fileEvidence.set(file, { ...metadata, base64: resume.base64 });
          filled.push({ key: 'resume-file', label: 'Resume file', value: resume.filename });
        }
      } catch {
        // A portal can require a manual upload. Leave that field in the total.
      }
    }
    const filledKeys = new Set(filled.map(f => f.key));
    const unfilled = [];
    for (const plan of plans) {
      if (!filledKeys.has(plan.field.key)) {
        unfilled.push({
          key: plan.field.key,
          label: plan.field.label || plan.field.hint || 'Application question',
          kind: plan.field.kind,
          reason: plan.reason || 'No matching saved candidate detail'
        });
      }
    }
    if (input?.isConnected && (!input.files || !input.files.length)) {
      unfilled.unshift({
        key: 'resume-file',
        label: 'Resume file',
        kind: 'file',
        reason: resume?.base64 ? 'Portal requires manual file attachment' : 'Uploaded resume unavailable'
      });
    }
    return { filled, unfilled, total: fields.length + Number(!!input) };
  }

  async function startAutofill(expectedUrl, candidate, resume, resumeDocumentId, continuation = false) {
    const result = await fill(expectedUrl, candidate, resume, continuation);
    if (result.error || !candidate.id || !discovery.observeStepTransitions || typeof chrome === 'undefined') return result;
    wizard?.disconnect();

    let pending;
    const origin = location.origin;
    const isTop = window === window.top;
    const send = (action, data) => chrome.runtime.sendMessage({ action, ...data }).catch(() => null);
    const onNext = event => {
      if (!event.isTrusted || location.origin !== origin || !location.href.startsWith('https://')) return;
      const control = event.target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]');
      if (!discovery.isStepNavigation(control)) return;
      const { fields, job } = inspect();
      const form = control.form || control.closest('form');
      if (!fields.length || form && !fields.some(field => field.element?.form === form || form.contains(field.element))) return;
      pending = { fields, deadline: Date.now() + 30000, jobId: job?.externalId };
      if (isTop) void send('queue_application_step', { candidateId: candidate.id, resumeDocumentId });
    };
    document.addEventListener('click', onNext, true);
    const observer = discovery.observeStepTransitions(document, async ({ allFields }) => {
      if (!pending || Date.now() > pending.deadline || location.origin !== origin) return;
      const jobId = inspect().job?.externalId;
      if (pending.jobId && jobId && pending.jobId !== jobId) return;
      const fields = discovery.detectNewFields(pending.fields, allFields).filter(field => !field.excluded && field.kind !== 'inaccessible');
      if (!fields.length) return;
      pending = null;
      if (isTop) void send('clear_application_step');
      const url = location.href;
      const fresh = await send('load_application_profile', { candidateId: candidate.id });
      if (fresh?.id === candidate.id && wizard === currentWizard && location.href === url) {
        await fill(url, fresh, resume, true, fields).catch(() => {});
      }
    });
    const currentWizard = { disconnect() {
      observer.disconnect();
      document.removeEventListener('click', onNext, true);
    } };
    wizard = currentWizard;
    return result;
  }

  async function resumeNextStep() {
    const step = await chrome.runtime.sendMessage({ action: 'claim_application_step' }).catch(() => null);
    if (!step?.profile || !discovery.observeStepTransitions) return;
    const url = location.href;
    const apply = () => startAutofill(url, step.profile, step.resume, step.resumeDocumentId, true).catch(() => {});
    if (inspect().fields.length) return apply();
    const observer = discovery.observeStepTransitions(document, ({ allFields }) => {
      if (location.href !== url || !allFields.some(field => !field.excluded && field.kind !== 'inaccessible')) return;
      observer.disconnect();
      clearTimeout(timer);
      void apply();
    });
    const timer = setTimeout(() => observer.disconnect(), 15000);
  }

  globalThis.NextkinApplication = {
    scan() {
      const { job, hasForm } = inspect();
      return { job, hasForm, url: location.href };
    },
    fill,
    startAutofill,
    submitApplication,
  };

  // A manually filled application can navigate away as soon as its form is submitted.
  if (typeof window !== 'undefined' && window.top === window && !globalThis.nextkinSubmitObserver
    && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    globalThis.nextkinSubmitObserver = true;
    if (typeof MutationObserver !== 'undefined' && discovery.observeStepTransitions) void resumeNextStep();
    const recordAttempt = (event, form, button) => {
      if (!event.isTrusted || !form || submitting.has(form)) return;
      if (button && !finalSubmit.test(submitLabel(button))) return;
      const { job, hasForm, url } = globalThis.NextkinApplication.scan();
      if ((!hasForm && !wizard) || (!job && !wizard && !new URLSearchParams((location.hash || '').slice(1)).has('marketing-intent'))) return;
      void prepareSubmission(form, url, job).catch(() => {});
    };
    document.addEventListener('change', event => {
      const input = event.composedPath?.()[0] || event.target;
      if (input?.type !== 'file' || input !== findResumeInput()) return;
      const file = input.files?.[0];
      if (file) void readAttachedResume(file).catch(() => {});
    }, true);
    document.addEventListener('submit', event => {
      if (event.target?.tagName === 'FORM') recordAttempt(event, event.target, event.submitter);
    }, true);
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('button[type="button"], [role="button"]');
      if (button) recordAttempt(event, button.form || button.closest('form'), button);
    }, true);
  }
})();
