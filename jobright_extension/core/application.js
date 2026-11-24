(function () {
  if (globalThis.NextkinApplication) return;
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  const manualQuestion = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
  const jobSpecific = /\b(?:this|the) (?:job|role|position|company|organization|employer|opportunity)\b|\bwhy\b|cover letter|how did you hear|\breferred\b|application source/i;
  const privateAnswer = /birth|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|signature/i;
  const finalSubmit = /^(?:submit(?:\s+(?:my |your |the )?application)?|send application|apply(?: now)?|complete application|finish application)[.!]?$/i;
  const reviewField = /\b(?:agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|signature|captcha|password|otp)\b/i;
  const fileEvidence = new WeakMap();
  const submitting = new WeakSet();
  const seenElements = new WeakSet();
  let isFilling = false;
  let wizard;
  const answerKey = field => field.label.normalize('NFKC').toLowerCase().replace(/[?*:.!]+$/g, '').trim().replace(/\s+/g, ' ');

  // ============================================================================
  // Application Lifecycle State & Attempt Management
  // ============================================================================

  // 8 explicit application lifecycle states representing what happened on the ATS
  const ApplicationState = Object.freeze({
    DRAFT: 'DRAFT',
    FILLING: 'FILLING',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    READY_TO_SUBMIT: 'READY_TO_SUBMIT',
    SUBMITTING: 'SUBMITTING',
    SUBMITTED: 'SUBMITTED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
    FAILED: 'FAILED',
  });

  // NextKinHR platform synchronization states representing backend API delivery status
  const SyncStatus = Object.freeze({
    LOCAL_ONLY: 'LOCAL_ONLY',
    SYNC_PENDING: 'SYNC_PENDING',
    SYNCED: 'SYNCED',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    FORBIDDEN: 'FORBIDDEN',
    CONFLICT_NEEDS_RESOLVE: 'CONFLICT_NEEDS_RESOLVE',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    SYNC_FAILED: 'SYNC_FAILED',
  });

  const VALID_TRANSITIONS = Object.freeze({
    [ApplicationState.DRAFT]: [
      ApplicationState.FILLING,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.SUBMITTING,
      ApplicationState.FAILED,
    ],
    [ApplicationState.FILLING]: [
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.FAILED,
    ],
    [ApplicationState.REVIEW_REQUIRED]: [
      ApplicationState.FILLING,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.FAILED,
    ],
    [ApplicationState.READY_TO_SUBMIT]: [
      ApplicationState.SUBMITTING,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.FILLING,
      ApplicationState.FAILED,
    ],
    [ApplicationState.SUBMITTING]: [
      ApplicationState.SUBMITTED,
      ApplicationState.PENDING_VERIFICATION,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.FAILED,
    ],
    [ApplicationState.PENDING_VERIFICATION]: [
      ApplicationState.SUBMITTED,
      ApplicationState.SUBMITTING,
      ApplicationState.FAILED,
      ApplicationState.REVIEW_REQUIRED,
    ],
    [ApplicationState.SUBMITTED]: [
      ApplicationState.SUBMITTED,
    ],
    [ApplicationState.FAILED]: [
      ApplicationState.DRAFT,
      ApplicationState.FILLING,
      ApplicationState.REVIEW_REQUIRED,
    ],
  });

  class ApplicationStateError extends Error {
    constructor(state, message, details = {}) {
      super(message);
      this.name = 'ApplicationStateError';
      this.state = state;
      this.details = details;
    }
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function detectAtsProvider(url) {
    if (!url) return 'generic';
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (/(^|\.)(myworkdayjobs|myworkdaysite)\.com$/i.test(hostname)) return 'workday';
      if (/(^|\.)greenhouse\.io$/i.test(hostname)) return 'greenhouse';
      if (/(^|\.)lever\.co$/i.test(hostname)) return 'lever';
      if (/(^|\.)ashbyhq\.com$/i.test(hostname)) return 'ashby';
      if (/(^|\.)(smartrecruiters\.com|smartr\.me)$/i.test(hostname)) return 'smartrecruiters';
      if (/(^|\.)linkedin\.com$/i.test(hostname)) return 'linkedin';
      if (/(^|\.)workable\.com$/i.test(hostname)) return 'workable';
      if (/(^|\.)taleo\.net$/i.test(hostname)) return 'taleo';
      if (/(^|\.)icims\.com$/i.test(hostname)) return 'icims';
      if (/(^|\.)jobvite\.com$/i.test(hostname)) return 'jobvite';
      if (/(^|\.)bamboohr\.com$/i.test(hostname)) return 'bamboohr';
      if (/(^|\.)teamtailor\.com$/i.test(hostname)) return 'teamtailor';
      if (/(^|\.)personio\.(?:com|de)$/i.test(hostname)) return 'personio';
      if (/(^|\.)recruitee\.com$/i.test(hostname)) return 'recruitee';
      if (/(^|\.)pinpointhq\.com$/i.test(hostname)) return 'pinpoint';
      if (/(^|\.)breezy\.hr$/i.test(hostname)) return 'breezy';
      if (/(^|\.)catsone\.com$/i.test(hostname)) return 'catsone';
      if (/(^|\.)jazzhr\.com$/i.test(hostname)) return 'jazzhr';
      if (/(^|\.)clearcompany\.com$/i.test(hostname)) return 'clearcompany';
      if (/(^|\.)dayforce(hcm)?\.com$/i.test(hostname)) return 'dayforce';
    } catch {}
    return 'generic';
  }

  /**
   * Immutable attempt context binding an application attempt to candidate and job.
   * Candidate identity cannot be mutated mid-attempt if the user switches candidates.
   */
  class ApplicationAttemptContext {
    constructor(params = {}) {
      const now = new Date().toISOString();
      this.applicationId = params.applicationId || null;
      this.attemptId = params.attemptId || generateUUID();
      this.userId = params.userId || null;
      this.candidateId = params.candidateId || null;
      this.profileVersion = params.profileVersion ?? 1;
      this.atsProvider = params.atsProvider || detectAtsProvider(params.jobUrl || (typeof location !== 'undefined' ? location.href : ''));
      this.jobUrl = params.jobUrl || (typeof location !== 'undefined' ? location.href : '');
      this.companyName = params.companyName || '';
      this.jobTitle = params.jobTitle || '';
      this.tabId = params.tabId ?? null;
      this.createdAt = params.createdAt || now;
      this.updatedAt = params.updatedAt || now;

      // Deeply freeze attempt context to guarantee immutability
      Object.freeze(this);
    }

    withUpdate(updates = {}) {
      if (updates.candidateId && updates.candidateId !== this.candidateId) {
        throw new ApplicationStateError(
          ApplicationState.FAILED,
          `Candidate identity cannot be mutated mid-attempt (bound to ${this.candidateId}, received ${updates.candidateId})`
        );
      }
      return new ApplicationAttemptContext({
        ...this.toJSON(),
        ...updates,
        candidateId: this.candidateId,
        attemptId: this.attemptId,
        createdAt: this.createdAt,
        updatedAt: updates.updatedAt || new Date().toISOString(),
      });
    }

    toJSON() {
      return {
        applicationId: this.applicationId,
        attemptId: this.attemptId,
        userId: this.userId,
        candidateId: this.candidateId,
        profileVersion: this.profileVersion,
        atsProvider: this.atsProvider,
        jobUrl: this.jobUrl,
        companyName: this.companyName,
        jobTitle: this.jobTitle,
        tabId: this.tabId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    }

    static fromJSON(data) {
      if (!data) return null;
      return new ApplicationAttemptContext(data);
    }
  }

  /**
   * ApplicationStateManager manages explicit lifecycle states and NextKinHR sync status.
   * Persists minimal durable state in chrome.storage.session and window.sessionStorage
   * without storing raw DOM nodes.
   */
  class ApplicationStateManager {
    constructor(attemptContext, options = {}) {
      if (!attemptContext) {
        throw new Error('ApplicationStateManager requires an ApplicationAttemptContext');
      }
      this.context = attemptContext instanceof ApplicationAttemptContext
        ? attemptContext
        : new ApplicationAttemptContext(attemptContext);
      this.application_status = options.initialState || ApplicationState.DRAFT;
      this.sync_status = options.initialSyncStatus || SyncStatus.LOCAL_ONLY;
      this.history = options.history ? [...options.history] : [
        {
          type: 'application',
          from: null,
          to: this.application_status,
          timestamp: new Date().toISOString(),
          details: { initial: true },
        }
      ];
      this.listeners = new Set();
      this.storageKey = options.storageKey || `nextkin_application_state_${this.context.attemptId}`;
      this.persist();
    }

    getContext() {
      return this.context;
    }

    getState() {
      return this.application_status;
    }

    getSyncStatus() {
      return this.sync_status;
    }

    getStatus() {
      return {
        application_status: this.application_status,
        sync_status: this.sync_status,
        attemptId: this.context.attemptId,
        candidateId: this.context.candidateId,
        profileVersion: this.context.profileVersion,
        atsProvider: this.context.atsProvider,
        jobUrl: this.context.jobUrl,
        companyName: this.context.companyName,
        jobTitle: this.context.jobTitle,
        tabId: this.context.tabId,
        updatedAt: this.context.updatedAt,
      };
    }

    addListener(listener) {
      if (typeof listener === 'function') {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      return () => {};
    }

    _notify(event) {
      for (const listener of this.listeners) {
        try { listener(event, this); } catch {}
      }
    }

    transition(targetState, details = {}) {
      if (!ApplicationState[targetState]) {
        throw new Error(`Invalid target application state: ${targetState}`);
      }
      const current = this.application_status;
      if (current === targetState) {
        this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
        this.persist();
        return current;
      }

      const allowed = VALID_TRANSITIONS[current] || [];
      if (!allowed.includes(targetState)) {
        throw new ApplicationStateError(
          current,
          `Illegal application state transition from ${current} to ${targetState}`,
          { current, target: targetState, details }
        );
      }

      this.application_status = targetState;
      this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
      this.history.push({
        type: 'application',
        from: current,
        to: targetState,
        timestamp: new Date().toISOString(),
        details,
      });
      this.persist();
      this._notify({ type: 'application_state_change', from: current, to: targetState, details });
      return this.application_status;
    }

    setSyncStatus(targetSyncStatus, details = {}) {
      if (!SyncStatus[targetSyncStatus]) {
        throw new Error(`Invalid sync status: ${targetSyncStatus}`);
      }
      const prev = this.sync_status;
      if (prev === targetSyncStatus) return prev;

      this.sync_status = targetSyncStatus;
      this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
      this.history.push({
        type: 'sync',
        from: prev,
        to: targetSyncStatus,
        timestamp: new Date().toISOString(),
        details,
      });
      this.persist();
      this._notify({ type: 'sync_status_change', from: prev, to: targetSyncStatus, details });
      return this.sync_status;
    }

    /**
     * Persist minimal durable state without saving raw DOM nodes.
     */
    persist() {
      const payload = {
        attemptId: this.context.attemptId,
        context: this.context.toJSON(),
        application_status: this.application_status,
        sync_status: this.sync_status,
        history: this.history.slice(-25),
        updatedAt: new Date().toISOString(),
      };

      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('nextkin_application_attempt_state', JSON.stringify(payload));
          if (this.context.attemptId) {
            window.sessionStorage.setItem(`nextkin_attempt_${this.context.attemptId}`, JSON.stringify(payload));
          }
          if (this.context.tabId != null) {
            window.sessionStorage.setItem(`nextkin_attempt_tab_${this.context.tabId}`, JSON.stringify(payload));
          }
        }
      } catch {}

      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
          const key = this.storageKey || `application_attempt_${this.context.attemptId}`;
          const toSet = { [key]: payload, 'application-state-active': payload };
          if (this.context.tabId != null) {
            toSet[`application-state:${this.context.tabId}`] = payload;
          }
          chrome.storage.session.set(toSet).catch(() => {});
        }
      } catch {}
    }

    static restore(options = {}) {
      const { attemptId, tabId } = options;
      let raw = null;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          if (attemptId) raw = window.sessionStorage.getItem(`nextkin_attempt_${attemptId}`);
          if (!raw && tabId != null) raw = window.sessionStorage.getItem(`nextkin_attempt_tab_${tabId}`);
          if (!raw) raw = window.sessionStorage.getItem('nextkin_application_attempt_state');
        }
      } catch {}

      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data?.context) {
            const context = ApplicationAttemptContext.fromJSON(data.context);
            return new ApplicationStateManager(context, {
              initialState: data.application_status,
              initialSyncStatus: data.sync_status,
              history: data.history,
            });
          }
        } catch {}
      }
      return null;
    }
  }

  let currentManager = null;

  function getOrCreateManager(candidate, expectedUrl, job = null) {
    if (!currentManager) {
      currentManager = ApplicationStateManager.restore();
    }

    const targetUrl = expectedUrl || (typeof location !== 'undefined' ? location.href : '');
    const activeJob = job || (capture?.read ? capture.read() : null);

    if (currentManager) {
      const activeCandidateId = currentManager.getContext().candidateId;
      const activeState = currentManager.getState();
      const isActive = [
        ApplicationState.FILLING,
        ApplicationState.REVIEW_REQUIRED,
        ApplicationState.READY_TO_SUBMIT,
        ApplicationState.SUBMITTING,
        ApplicationState.PENDING_VERIFICATION,
      ].includes(activeState);

      // Multi-tab candidate isolation: cannot mutate candidate identity mid-attempt
      if (isActive && activeCandidateId && candidate?.id && candidate.id !== activeCandidateId) {
        throw new ApplicationStateError(
          ApplicationState.FAILED,
          `Candidate identity cannot be mutated mid-attempt (bound to ${activeCandidateId}, received ${candidate.id})`
        );
      }

      if (isActive && (!candidate?.id || candidate.id === activeCandidateId)) {
        return currentManager;
      }
    }

    const context = new ApplicationAttemptContext({
      applicationId: candidate?.applicationId || activeJob?.externalId || null,
      userId: candidate?.userId || candidate?.user_id || null,
      candidateId: candidate?.id || null,
      profileVersion: candidate?.version || candidate?.profileVersion || 1,
      atsProvider: detectAtsProvider(targetUrl),
      jobUrl: targetUrl,
      companyName: activeJob?.company || '',
      jobTitle: activeJob?.title || '',
    });

    currentManager = new ApplicationStateManager(context, {
      initialState: ApplicationState.DRAFT,
      initialSyncStatus: SyncStatus.LOCAL_ONLY,
    });

    return currentManager;
  }

  // Reusable answers are keyed by the question they ask, never by its wording on a
  // particular portal. Profile-owned facts and one-off/job-specific questions are
  // deliberately excluded: a saved answer must never overwrite a profile value.
  function answerType(field) {
    if (mapping.isMultiKind(field.kind)) return 'multiple';
    if (field.kind === 'checkbox') return 'boolean';
    return mapping.isChoiceKind(field.kind) ? 'choice' : 'text';
  }

  function reusable(plan, keys) {
    const { field } = plan;
    const key = answerKey(field);
    return key.length >= 5 && key.length <= 200 && keys.indexOf(key) === keys.lastIndexOf(key) &&
      !plan.factKey && plan.status !== 'manual' && !field.excluded &&
      !mapping.isUrlField?.(field) &&
      !/Repeated history|Job target/.test(plan.reason || '') &&
      !manualQuestion.test(key) && !jobSpecific.test(key);
  }

  function answerFits(field, value) {
    const options = (field.options || []).map(option => option.label).filter(Boolean);
    if (!options.length) return true;
    const bool = mapping.normalizeBoolean(value);
    if (bool !== null && options.some(option => mapping.normalizeBoolean(option) === bool)) return true;
    const text = String(value).toLowerCase();
    return options.some(option => option.toLowerCase() === text);
  }

  // Read the answers the candidate has already given on this form so they can be
  // saved once and replayed on later applications (the freehire answer-bank rule).
  // Evidence that the candidate actually engaged with the form, not merely saw it.
  // Mirrors freehire's leftAnApplication(): an untouched form is not an application.
  function hasAnswers() {
    const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
    return fields.some(field => {
      const value = writer.read(field);
      return Array.isArray(value) ? value.length > 0
        : typeof value === 'boolean' ? value
          : String(value ?? '').trim().length > 0;
    });
  }

  function savedAnswers(expectedUrl, candidate) {
    if (location.href !== expectedUrl) return [];
    const page = inspect();
    const plans = mapping.planFill(page.fields, candidate);
    const keys = plans.map(plan => answerKey(plan.field));
    return plans.filter(plan => reusable(plan, keys)).flatMap(plan => {
      const { field } = plan;
      const value = writer.read(field);
      if (typeof value === 'string' && (!value || value.length > 2000) || Array.isArray(value) && !value.length) return [];
      if (Array.isArray(value) && (value.length > 50 || value.some(item => item.length > 200))) return [];
      return [{ key: answerKey(field), label: field.label, type: answerType(field), value }];
    }).slice(0, 100);
  }

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

  /**
   * Submit application to employer portal ATS while keeping user in control of final submission.
   * Runtime errors are paired with explicit state transitions to REVIEW_REQUIRED, READY_TO_SUBMIT,
   * SUBMITTING, and PENDING_VERIFICATION.
   */
  async function submitApplication(expectedUrl) {
    const manager = currentManager || getOrCreateManager(null, expectedUrl);

    if (location.href !== expectedUrl) {
      manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The application page changed.' });
      throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The application page changed.');
    }

    const { job, hasForm, fields } = inspect();
    const forms = new Set(fields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
    const [form] = forms;

    if (!hasForm || forms.size !== 1 || submitting.has(form) || typeof form.requestSubmit !== 'function') {
      manager.transition(ApplicationState.REVIEW_REQUIRED, {
        reason: 'Submit manually on the employer page. A single final application form is required.',
        hasForm,
        formsCount: forms.size,
      });
      throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Submit manually on the employer page. A single final application form is required.');
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
      manager.transition(ApplicationState.REVIEW_REQUIRED, {
        reason: 'Review and complete the employer form, then submit it manually.',
        buttonsCount: buttons.length,
        blocked: !!blocked,
        incomplete,
        valid: form.checkValidity(),
      });
      throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Review and complete the employer form, then submit it manually.', {
        buttonsCount: buttons.length,
        blocked: !!blocked,
        incomplete,
      });
    }

    // Validated -> Transition to READY_TO_SUBMIT
    manager.transition(ApplicationState.READY_TO_SUBMIT, {
      validated: true,
      button: submitLabel(buttons[0]),
    });

    // Submit action begins -> Transition to SUBMITTING
    manager.transition(ApplicationState.SUBMITTING, {
      submittedAt: new Date().toISOString(),
      formUrl: expectedUrl,
    });

    submitting.add(form);
    try {
      const file = findResumeInput(form)?.files?.[0];
      if (file) await readAttachedResume(file).catch(() => {});
      const evidence = submissionEvidence(form);

      manager.setSyncStatus(SyncStatus.SYNC_PENDING, { url: expectedUrl });
      const tracked = await prepareSubmission(form, expectedUrl, job, evidence);

      if (!tracked?.tracked || location.href !== expectedUrl || !form.isConnected || !form.checkValidity()) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          reason: 'Automatic submission could not start. Review the form and submit manually.',
          tracked: !!tracked?.tracked,
        });
        manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error || 'Tracking failed' });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Automatic submission could not start. Review the form and submit manually.');
      }

      if (file !== findResumeInput(form)?.files?.[0] || JSON.stringify(evidence.answers) !== JSON.stringify(submissionEvidence(form).answers)) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          reason: 'Form values changed during autofill. Review the form and submit manually.',
        });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Form values changed during autofill. Review the form and submit manually.');
      }

      manager.setSyncStatus(SyncStatus.SYNCED, { outsideJobUrl: tracked.outsideJobUrl });
      form.requestSubmit(buttons[0]);

      // Form submission dispatched -> Transition to PENDING_VERIFICATION (awaiting ATS confirmation)
      manager.transition(ApplicationState.PENDING_VERIFICATION, {
        reason: 'Form submission dispatched, awaiting ATS receipt confirmation',
      });
    } catch (error) {
      submitting.delete(form);
      if (manager.getState() === ApplicationState.SUBMITTING) {
        manager.transition(ApplicationState.FAILED, { error: error.message });
      }
      throw error;
    }
  }

  function submitLabel(button) {
    return String(button.innerText || button.value || button.getAttribute?.('aria-label') || '').trim();
  }

  /**
   * Non-throwing pre-submission validation query.
   * Keeps user in control of final submission by surfacing missing fields and terms.
   */
  function validateForSubmission(expectedUrl) {
    const targetUrl = expectedUrl || (typeof location !== 'undefined' ? location.href : '');
    const manager = currentManager || getOrCreateManager(null, targetUrl);

    if (location.href !== targetUrl) {
      manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The application page changed.' });
      return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'The application page changed.' };
    }

    const { hasForm, fields } = inspect();
    const forms = new Set(fields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
    const [form] = forms;

    if (!hasForm || forms.size !== 1 || submitting.has(form) || typeof form.requestSubmit !== 'function') {
      manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'A single final application form is required.' });
      return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'Submit manually on the employer page. A single final application form is required.' };
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
      manager.transition(ApplicationState.REVIEW_REQUIRED, {
        reason: 'Review and complete the employer form, then submit it manually.',
        blocked: !!blocked,
        incomplete,
        buttonsCount: buttons.length,
      });
      return {
        ready: false,
        state: ApplicationState.REVIEW_REQUIRED,
        reason: 'Review and complete the employer form, then submit it manually.',
        blocked: !!blocked,
        incomplete,
        buttonsCount: buttons.length,
      };
    }

    manager.transition(ApplicationState.READY_TO_SUBMIT, { validated: true, button: submitLabel(buttons[0]) });
    return {
      ready: true,
      state: ApplicationState.READY_TO_SUBMIT,
      button: submitLabel(buttons[0]),
    };
  }

  function confirmSubmission(evidence = {}) {
    if (currentManager) {
      if (currentManager.getState() !== ApplicationState.SUBMITTED) {
        currentManager.transition(ApplicationState.SUBMITTED, { evidence, confirmedAt: new Date().toISOString() });
      }
      return currentManager.getStatus();
    }
    return null;
  }

  function failSubmission(reason = '') {
    if (currentManager) {
      currentManager.transition(ApplicationState.FAILED, { reason, failedAt: new Date().toISOString() });
      return currentManager.getStatus();
    }
    return null;
  }

  async function fill(expectedUrl, candidate, resume, continuation = false, newFields, saved = null, aiAnswers = null) {
    if (isFilling) {
      let attempts = 0;
      while (isFilling && attempts < 30) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (isFilling) {
        return { filled: [], unfilled: [], questions: [], total: 0, error: 'Autofill is already in progress.' };
      }
    }
    isFilling = true;
    try {
      // Older callers pass `saved` and `aiAnswers` as the fourth and fifth arguments.
      // Accept both shapes so an extension or a test bundle built at either version works.
      if (typeof continuation !== 'boolean') {
        const legacySaved = continuation;
        const legacyAi = newFields;
        continuation = false;
        newFields = null;
        saved = legacySaved;
        aiAnswers = legacyAi;
      }

      const manager = getOrCreateManager(candidate, expectedUrl);
      manager.transition(ApplicationState.FILLING, { url: expectedUrl, continuation });

      if (location.href !== expectedUrl) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The page changed. Open the application form and try again.' });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The page changed. Open the application form and try again.');
      }
      const page = inspect();
      if (!page.hasForm && (!continuation || !page.fields.length)) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'Open the job application form before using autofill.' });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Open the job application form before using autofill.');
      }
      const facts = candidate?.provenance_status === 'confirmed' ? candidate.confirmed_facts : candidate;
      if (!facts || !Object.values(facts).some(value =>
        typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' && value.trim()
      )) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'Save your candidate details in My Applications and Resume first.' });
        return { filled: [], unfilled: [], questions: [], total: page.fields.length, error: 'Save your candidate details in My Applications and Resume first.' };
      }
      const baseFields = newFields ? page.fields.filter(field => newFields.some(next =>
        next.element === field.element && next.label === field.label)) : page.fields;
      const sourceFields = continuation
        ? baseFields.filter(field => !field.element || !seenElements.has(field.element))
        : baseFields;
      for (const field of sourceFields) {
        if (field.element && typeof field.element === 'object') {
          seenElements.add(field.element);
        }
        if (Array.isArray(field.elements)) {
          for (const el of field.elements) {
            if (el && typeof el === 'object') seenElements.add(el);
          }
        }
      }
      const plans = mapping.planFill(sourceFields, facts);
    const keys = plans.map(plan => answerKey(plan.field));
    const values = mapping.buildValues(facts);

    // Replay reusable answers from the answer bank. Profile-owned facts always win,
    // and a saved answer is never applied to a job-specific or protected question.
    if (saved && typeof saved === 'object') {
      for (const plan of plans) {
        const key = answerKey(plan.field);
        if (plan.factKey || !reusable(plan, keys)) continue;
        const entry = saved[key];
        if (!entry) continue;
        const value = entry && typeof entry === 'object' ? entry.value : entry;
        if (value === undefined || value === null || value === '') continue;
        if (entry && typeof entry === 'object' && entry.type && entry.type !== answerType(plan.field)) continue;
        if (!answerFits(plan.field, value)) continue;
        plan.status = 'supported';
        plan.value = value;
        plan.learned = true;
      }
    }

    const questions = [];
    for (const plan of plans) {
      const { field } = plan;
      const label = (field.label || field.hint || '').trim();
      const key = answerKey(field);

      if (plan.status === 'ai' || plan.status === 'needs_review' || plan.status === 'unknown') {
        if (mapping.isUrlField?.(field)) continue;
        // Missing DOB, citizenship and work-authorization facts must not be
        // guessed from a resume or replaced with an unrelated generic answer.
        if (['date_of_birth', 'citizenship_status', 'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization'].includes(plan.factKey)) continue;
        if (label.length < 2 || key.length > 300 || manualQuestion.test(label) || writer.read(field)) continue;
        const choices = plan.options?.length ? plan.options : (await writer.readChoices(field, () => location.href === expectedUrl))
          .map(option => option.label);
        const options = [...new Set(choices.filter(option => option && option.length <= 1000))].slice(0, 200);

        // 1. If explicit AI answer was provided via API
        if (aiAnswers && typeof aiAnswers[key] === 'string' && (!options.length || options.includes(aiAnswers[key]))) {
          plan.status = 'supported';
          plan.value = aiAnswers[key];
          plan.ai = true;
          continue;
        }

        // 2. Dynamic resume-grounded answers based strictly on candidate's uploaded resume
        let autoValue = null;
        let fromFact = false;
        const ql = label.toLowerCase();

        const candEmployer = values.current_employer || candidate.current_company || candidate.company || '';
        const candSkills = values.primary_skills || candidate.secondary_skills || '';
        const skillsList = Array.isArray(candSkills) ? candSkills : String(candSkills).split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
        const skillsStr = skillsList.join(', ');
        const candCity = values.current_city || candidate.city || '';
        const candState = values.current_state || candidate.state || '';
        const candDegree = values.highest_education || candidate.highest_qualification || candidate.degree || '';
        const candGradYear = values.graduation_year || candidate.graduation_year || '';
        const candSummary = values.summary || values.bio || '';
        const candResumeText = (resume?.raw_text || resume?.source_text || candidate.source_text || '').toLowerCase();
        const activeJobData = capture?.read ? capture.read() : null;
        const companyName = activeJobData?.company || '';

        if (mapping.isChoiceKind(field.kind)) {
          const targetVisa = values.visa_status || candidate.visa_status || values.work_authorization || candidate.work_authorization || '';
          if (!/sponsor|citizenship|citizen\?/i.test(ql) &&
            (/(visa status|immigration status|work authorization status|work authorization type|type of visa)/i.test(ql) ||
              (/(authoriz|visa)/i.test(ql) && options.some(o => /citizen|green card|permanent|h-?1b|opt|stem|f-?1|ead/i.test(o))))) {
            if (targetVisa) {
              const tvNorm = targetVisa.toLowerCase();
              const matches = options.filter(o => {
                const ot = String(o).toLowerCase();
                if (/stem\s*opt/i.test(tvNorm)) return /stem\s*opt/i.test(ot);
                if (/\bopt\b/i.test(tvNorm)) return /\bopt\b/i.test(ot) && !/stem/i.test(ot);
                if (/h-?1b/i.test(tvNorm)) return /h-?1b/i.test(ot);
                if (/f-?1\b/i.test(tvNorm)) return /f-?1\b/i.test(ot) && !/opt|stem/i.test(ot);
                if (/green card|permanent resident/i.test(tvNorm)) return /green card|permanent resident/i.test(ot);
                return ot.trim() === tvNorm.trim();
              });
              if (matches.length === 1) {
                autoValue = matches[0];
                fromFact = true;
              }
            }
          } else if (/(authoriz|eligible|legal right)/i.test(ql) && !/(require|need|sponsor|citizen)/i.test(ql)) {
            if (values.authorized_in_usa !== undefined && values.authorized_in_usa !== null && values.authorized_in_usa !== '') {
              const affirmative = values.authorized_in_usa === true || values.authorized_in_usa === 'true';
              autoValue = options.find(o => mapping.normalizeBoolean(o) === affirmative) || (affirmative ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || affirmative;
              fromFact = true;
            }
          } else if (/(full-time|onsite|internship|summer internship|start date.*internship)/i.test(ql)) {
            if (values.availability || candidate.availability || values.authorized_in_usa !== undefined) {
              autoValue = options.find(o => mapping.normalizeBoolean(o) === true) || options.find(o => /^yes\b/i.test(o)) || true;
              fromFact = true;
            }
          } else if (/(currently enrolled|phd program|degree program)/i.test(ql)) {
            if (candDegree || candResumeText) {
              const hasProgram = /phd|doctor|master|bachelor|student|enrolled/i.test(candDegree) || /phd|doctor|master|bachelor|enrolled/i.test(candResumeText);
              if (hasProgram) {
                autoValue = options.find(o => mapping.normalizeBoolean(o) === true) || options.find(o => /^yes\b/i.test(o)) || true;
                fromFact = true;
              }
            }
          } else if (/(require|need).*(sponsor|visa)/i.test(ql)) {
            if (values.needs_sponsorship !== undefined && values.needs_sponsorship !== null && values.needs_sponsorship !== '') {
              const needSponsor = values.needs_sponsorship === true || values.needs_sponsorship === 'true';
              autoValue = options.find(o => mapping.normalizeBoolean(o) === needSponsor) || (needSponsor ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || needSponsor;
              fromFact = true;
            }
          } else if (/(worked for|worked before|employee or a contractor)/i.test(ql)) {
            if (candEmployer || (Array.isArray(candidate.employment_history) && candidate.employment_history.length > 0)) {
              const workedThere = Boolean(
                companyName && (
                  (candEmployer && candEmployer.toLowerCase().includes(companyName.toLowerCase())) ||
                  (Array.isArray(candidate.employment_history) && candidate.employment_history.some(e => (e.company || '').toLowerCase().includes(companyName.toLowerCase())))
                )
              );
              autoValue = options.find(o => mapping.normalizeBoolean(o) === workedThere) || (workedThere ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || workedThere;
              fromFact = true;
            }
          } else if (/(gender|sex)/i.test(ql)) {
            const candGender = candidate.gender || candidate.confirmed_facts?.gender || values.gender;
            if (candGender) {
              autoValue = options.find(o => new RegExp(`^${candGender}\\b`, 'i').test(o)) || options.find(o => new RegExp(candGender, 'i').test(o)) || candGender;
              fromFact = true;
            }
          } else if (/(hispanic|latino)/i.test(ql) && !/(race|ethnic)/i.test(ql)) {
            const candRace = candidate.race || candidate.race_ethnicity || candidate.confirmed_facts?.race || candidate.confirmed_facts?.race_ethnicity || values.race;
            if (candRace) {
              const crNorm = String(candRace || '').toLowerCase();
              if (crNorm.includes('hispanic') && !crNorm.includes('not hispanic') && !crNorm.includes('not latino')) {
                autoValue = options.find(o => /^(yes|true)/i.test(o)) || 'Yes';
              } else if (crNorm.includes('decline') || crNorm.includes('prefer not') || crNorm.includes('choose not')) {
                autoValue = options.find(o => /decline|prefer not|choose not|do not wish/i.test(o)) || options.find(o => /^no\b/i.test(o)) || 'Decline';
              } else {
                autoValue = options.find(o => /^(no|false)/i.test(o)) || 'No';
              }
              fromFact = true;
            }
          } else if (/(race|ethnic)/i.test(ql)) {
            const candRace = candidate.race || candidate.race_ethnicity || candidate.confirmed_facts?.race || candidate.confirmed_facts?.race_ethnicity || values.race;
            if (candRace) {
              const crNorm = String(candRace).trim().toLowerCase();
              const crClean = crNorm.replace(/\(not hispanic or latino\)/gi, '').trim();
              let matched = null;

              // 1. Direct match
              matched = options.find(o => o.trim().toLowerCase() === crNorm);

              // 2. Semantic EEOC category matching
              if (!matched) {
                if ((crNorm.includes('hispanic') || crNorm.includes('latino')) && !crNorm.includes('not hispanic') && !crNorm.includes('not latino')) {
                  matched = options.find(o => {
                    const ot = o.toLowerCase();
                    return (ot.includes('hispanic') || ot.includes('latino')) && !ot.includes('not hispanic') && !ot.includes('not latino');
                  });
                } else if (crClean.includes('white') || crClean.includes('caucasian')) {
                  matched = options.find(o => /white|caucasian/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('black') || crClean.includes('african')) {
                  matched = options.find(o => /black|african[ -]?american/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('hawaiian') || crClean.includes('pacific islander')) {
                  matched = options.find(o => /hawaiian|pacific\s*islander/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('asian')) {
                  matched = options.find(o => {
                    const otClean = o.replace(/\(not hispanic or latino\)/gi, '').toLowerCase();
                    return /asian/i.test(otClean) && !/pacific/i.test(otClean);
                  });
                } else if (crClean.includes('american indian') || crClean.includes('alaska') || crClean.includes('indigenous') || crClean.includes('native american')) {
                  matched = options.find(o => /american\s*indian|alaska|native\s*american|indigenous/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('two or more') || crClean.includes('multiracial')) {
                  matched = options.find(o => /two\s*or\s*more|multiracial/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('decline') || crClean.includes('prefer not') || crClean.includes('choose not') || crClean.includes('not self-identify') || crClean.includes('do not wish')) {
                  matched = options.find(o => /decline|prefer not|choose not|do not wish/i.test(o));
                }
              }

              // 3. Prefix or fuzzy fallback
              if (!matched) {
                matched = options.find(o => {
                  const otClean = o.replace(/\(not hispanic or latino\)/gi, '').trim().toLowerCase();
                  return otClean && (otClean.startsWith(crClean) || crClean.startsWith(otClean));
                });
              }

              autoValue = matched || candRace;
              fromFact = true;
            }
          } else if (/(veteran)/i.test(ql)) {
            const candVet = candidate.veteran || candidate.veteran_status || candidate.confirmed_facts?.veteran || candidate.confirmed_facts?.veteran_status || values.veteran;
            if (candVet) {
              const cvNorm = candVet.toLowerCase();
              if (cvNorm.includes('not a protected veteran') || cvNorm.includes('not a veteran')) {
                autoValue = options.find(o => /not a (?:protected )?veteran|^no\b|neither|do not identify|not a veteran/i.test(o)) || candVet;
              } else if (cvNorm.includes('identify as one or more') || cvNorm.includes('protected veteran')) {
                autoValue = options.find(o => /i identify as one or more|protected veteran|active duty|veteran\b/i.test(o) && !/not a/i.test(o)) || candVet;
              } else if (cvNorm.includes('do not wish') || cvNorm.includes('prefer not')) {
                autoValue = options.find(o => /prefer not|choose not|decline|do not wish/i.test(o)) || candVet;
              } else {
                autoValue = options.find(o => new RegExp(candVet.slice(0, 15), 'i').test(o)) || candVet;
              }
              fromFact = true;
            }
          } else if (/(disabil)/i.test(ql)) {
            const candDis = candidate.disability || candidate.disability_status || candidate.confirmed_facts?.disability || candidate.confirmed_facts?.disability_status || values.disability;
            if (candDis) {
              const cdNorm = candDis.toLowerCase();
              if (cdNorm.includes('not have a disability') || cdNorm.includes('no disability')) {
                autoValue = options.find(o => /no,? (?:i )?do not have|no disability|^no\b/i.test(o)) || candDis;
              } else if (cdNorm.includes('have a disability') && !cdNorm.includes('not')) {
                autoValue = options.find(o => /yes,? (?:i )?(?:have|do have)|have a disability|^yes\b/i.test(o)) || candDis;
              } else if (cdNorm.includes('do not wish') || cdNorm.includes('prefer not')) {
                autoValue = options.find(o => /prefer not|choose not|decline|do not wish/i.test(o)) || candDis;
              } else {
                autoValue = options.find(o => new RegExp(candDis.slice(0, 15), 'i').test(o)) || candDis;
              }
              fromFact = true;
            }
          } else if (/(pronoun)/i.test(ql)) {
            const explicit = candidate.pronouns || values.pronouns || '';
            if (explicit) {
              autoValue = options.find(o => new RegExp(explicit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o)) || explicit;
              fromFact = true;
            } else if (candidate.gender || values.gender) {
              const g = String(candidate.gender || values.gender || '').toLowerCase();
              if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
                autoValue = options.find(o => /she\/her/i.test(o));
              } else if (g.includes('non-binary') || g.includes('they')) {
                autoValue = options.find(o => /they\/them/i.test(o));
              } else if (g.startsWith('m') || g.includes('man') || g.includes('male')) {
                autoValue = options.find(o => /he\/him/i.test(o));
              }
              if (autoValue) fromFact = true;
            }
          } else if (/(degree|education|bachelor|master|phd|doctor|college|university|qualification)/i.test(ql)) {
            const isYesNo = options.some(o => /^(yes|true)$/i.test(o)) && options.some(o => /^(no|false)$/i.test(o));
            if (isYesNo) {
              const candidateHasBachelor = /bachelor|b\.?tech|b\.?s|b\.?a|undergraduate/i.test(candDegree) || /bachelor/i.test(candResumeText);
              const candidateHasMaster = /master|m\.?s|m\.?tech|mba/i.test(candDegree) || /master/i.test(candResumeText);
              const candidateHasDoctorate = /phd|doctor/i.test(candDegree);

              let satisfies = false;
              if (/(master|graduate degree)/i.test(ql)) {
                satisfies = candidateHasMaster || candidateHasDoctorate;
              } else if (/(phd|doctorate)/i.test(ql)) {
                satisfies = candidateHasDoctorate;
              } else if (/(bachelor|undergraduate|degree|education|college|university|completed.*degree)/i.test(ql)) {
                satisfies = candidateHasBachelor || candidateHasMaster || candidateHasDoctorate;
              }

              if (satisfies) {
                autoValue = options.find(o => /^(yes|true)$/i.test(o)) || true;
              } else {
                autoValue = options.find(o => /^(no|false)$/i.test(o)) || false;
              }
            } else {
              if (/master/i.test(candDegree)) {
                autoValue = options.find(o => /master/i.test(o));
              } else if (/phd|doctor/i.test(candDegree)) {
                autoValue = options.find(o => /phd|doctor/i.test(o));
              } else if (/bachelor|b\.?tech|b\.?s|b\.?a/i.test(candDegree) || /bachelor/i.test(candResumeText)) {
                autoValue = options.find(o => /bachelor|undergraduate|b\.?s|b\.?a|b\.?tech/i.test(o)) || options.find(o => /college|degree/i.test(o));
              } else if (candDegree) {
                autoValue = options.find(o => new RegExp(candDegree.slice(0, 15), 'i').test(o));
              }
            }
          } else if (/(country)/i.test(ql)) {
            const targetCountry = values.country || candidate.country || '';
            if (targetCountry) {
              autoValue = options.find(o => new RegExp(`^${targetCountry}$`, 'i').test(o)) || options.find(o => new RegExp(targetCountry, 'i').test(o)) || targetCountry;
            }
          } else if (/(where do you intend to work|intend to work|work location)/i.test(ql)) {
            const pref = candidate.preferred_work_type || candidate.work_location_preference || '';
            if (pref) {
              autoValue = options.find(o => new RegExp(pref, 'i').test(o));
              fromFact = true;
            }
          } else if (/(location|city)/i.test(ql)) {
            if (candCity) {
              autoValue = options.find(o => new RegExp(`\\b${candCity}\\b`, 'i').test(o));
            }
          } else if (/(graduate|graduation|year)/i.test(ql)) {
            if (candGradYear) {
              autoValue = options.find(o => o.includes(candGradYear));
            }
          } else if (/(hear|source|how did you)/i.test(ql)) {
            const src = values.how_heard || candidate.how_heard || '';
            if (src) {
              autoValue = options.find(o => new RegExp(src, 'i').test(o)) || src;
            }
          }
        } else if (field.kind === 'text' || field.kind === 'textarea') {
          // Bio / summary / statement / cover letter
          if (/(additional information|cover letter|anything else|share with us|bio|biography|about\s*(you|yourself)?|summary|statement)/i.test(ql)) {
            if (candSummary) {
              autoValue = candSummary;
            }
          }
          // Salary / compensation
          else if (/(salary|compensation|rate|gross salary|pay expectation)/i.test(ql)) {
            if (values.salary_expectation || candidate.salary_expectation) {
              autoValue = values.salary_expectation || candidate.salary_expectation;
            }
          }
          // Start date / availability
          else if (/(start date|notice|available|availability|when can you start)/i.test(ql)) {
            if (values.availability || candidate.availability) {
              autoValue = values.availability || candidate.availability;
            }
          }
          // Source / How did you hear
          else if (/(hear|source|referral)/i.test(ql)) {
            if (values.how_heard || candidate.how_heard) {
              autoValue = values.how_heard || candidate.how_heard;
            }
          }
          // Skills / Tech stack overview
          else if (/(experience with|skills with|tech stack|technologies have you used|tools and frameworks)/i.test(ql)) {
            if (skillsStr) {
              autoValue = skillsStr;
            }
          }
          // LinkedIn profile
          else if (/(linkedin|linked\s*in)/i.test(ql)) {
            if (values.linkedin_url || candidate.linkedin_url) {
              autoValue = values.linkedin_url || candidate.linkedin_url;
            }
          }
          // Location / City
          else if (/(current location|city|where are you located|present location)/i.test(ql) && !/(relocat|work location)/i.test(ql)) {
            if (values.current_location || values.location || candCity) {
              autoValue = values.current_location || values.location || candCity;
            }
          }
          // Work authorization & Visa text
          else if (/(work authorization|visa status|immigration status|work permit)/i.test(ql)) {
            if (values.work_authorization || values.visa_status || candidate.work_authorization || candidate.visa_status) {
              autoValue = values.work_authorization || values.visa_status || candidate.work_authorization || candidate.visa_status;
            }
          }
        } else if (field.kind === 'checkbox') {
          const groupQuestion = (field.element?.closest('.application-question, fieldset, [role="group"], .form-group, .question')
            ?.querySelector('.application-label, legend, .question-title, [class*="label" i]')?.innerText || '').toLowerCase();
          const checkLabel = ql;
          const combined = `${groupQuestion} ${checkLabel}`;

          // 1. Legal / Consent / Terms / Acknowledgment / Arbitration / Future Contact
          if (/(agree|consent|terms|privacy|arbitration|acknowledg|certify|declare|confirm.*(?:terms|agreement|policy)|contact me|receive updates|future job)/i.test(combined)) {
            autoValue = true;
          }
          // 2. Languages: Check ONLY languages present on candidate's uploaded resume/profile
          else if (/language/i.test(combined)) {
            const candLangs = Array.isArray(candidate.languages) ? candidate.languages.map(l => String(l).toLowerCase()) : [];
            if (candLangs.length > 0) {
              autoValue = candLangs.some(l => checkLabel.includes(l));
            }
          }
          // 3. Start Date Cohort Windows: Check only if candidate declared an availability date
          else if (/(cohort|dates|available dates|what are the dates|start date)/i.test(groupQuestion) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(checkLabel)) {
            if (values.availability || candidate.availability || candidate.available_to_join) {
              const targetAvail = String(values.availability || candidate.availability || candidate.available_to_join).toLowerCase();
              autoValue = targetAvail.includes(checkLabel) || checkLabel.includes(targetAvail);
            }
          }
          // 4. Skills / Technologies Checklist: Check ONLY if present in candidate's skills or resume text
          else if (/(skill|technolog|tech stack|tools|frameworks|programming)/i.test(groupQuestion)) {
            const skillsText = `${candSkills} ${candSummary} ${candResumeText}`.toLowerCase();
            const cleanCheck = checkLabel.replace(/\([^)]*\)/g, '').trim().toLowerCase();
            autoValue = cleanCheck.length >= 2 && skillsText.includes(cleanCheck);
          }
          // 5. Pronouns
          else if (/(pronoun|he\/him|she\/her|they\/them)/i.test(combined)) {
            const explicit = candidate.pronouns || values.pronouns || '';
            const g = String(candidate.gender || values.gender || '').toLowerCase();
            if (explicit) {
              autoValue = new RegExp(explicit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(checkLabel);
            } else if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
              autoValue = /she\/her/i.test(checkLabel);
            } else if (g.includes('non-binary') || g.includes('they')) {
              autoValue = /they\/them/i.test(checkLabel);
            } else if (g.startsWith('m') || g.includes('man') || g.includes('male')) {
              autoValue = /he\/him/i.test(checkLabel);
            }
          }
          // 6. Demographics / Decline disclosure options
          else if (/choose not to disclose|decline to state|prefer not to/i.test(checkLabel)) {
            autoValue = false;
          }
          // 7. General unknown checkbox: Default to FALSE based on resume
          else {
            autoValue = false;
          }
        }

        if (autoValue !== null && autoValue !== undefined) {
          plan.status = 'supported';
          plan.value = autoValue;
          plan.ai = !fromFact;
        } else if (aiAnswers) {
          questions.push({ id: key.slice(0, 200), label: label.slice(0, 2000), type: field.kind, options });
        }
      }
    }

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
      ai: !!receipt.ai,
      learned: !!receipt.learned,
    }));
    const input = findResumeInput();
    if (input?.isConnected && !input.files?.length && location.href === expectedUrl) {
      if (resume?.base64) {
        try {
          const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], resume.filename || 'Resume.pdf', { type: resume.mimeType || 'application/pdf' }));
          input.files = transfer.files;
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          const file = input.files?.[0];
          if (file?.name === resume.filename) {
            const metadata = resumeMetadata(file);
            if (metadata && file.size <= 2 * 1024 * 1024) fileEvidence.set(file, { ...metadata, base64: resume.base64 });
            filled.push({ key: 'resume-file', label: 'Resume file', value: resume.filename });
          }
        } catch {}
      } else if (writer?.attachResumeFile) {
        try {
          const attachRes = await writer.attachResumeFile(input, candidate?.id);
          if (attachRes?.file) {
            filled.push({ key: 'resume-file', label: 'Resume file', value: attachRes.expected });
          }
        } catch {}
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

    // Evaluate form readiness after autofill
    const { fields: pageFields } = inspect();
    const forms = new Set(pageFields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
    const [form] = forms;
    const buttons = form ? [...form.elements].filter(b => b.type === 'submit' && !b.disabled && !b.formNoValidate && b.getClientRects?.().length && finalSubmit.test(submitLabel(b))) : [];
    const blocked = form?.querySelector?.('[data-sitekey], iframe[src*="captcha" i], [name*="captcha" i], input[type="password"]');

    const incomplete = pageFields.some(field => {
      const element = field.element;
      const value = typeof writer?.read === 'function' ? writer.read(field) : element?.value;
      const label = field.label + ' ' + (field.hint || '');
      if (reviewField.test(label) && field.kind === 'checkbox') return value !== true;
      const required = element?.required || (typeof element?.getAttribute === 'function' && element.getAttribute('aria-required') === 'true') ||
        field.options?.some(option => option.element?.required) || reviewField.test(label);
      return required && (value === '' || value == null || value === false || Array.isArray(value) && !value.length);
    });

    if (form && buttons.length === 1 && !blocked && !incomplete && form.checkValidity()) {
      manager.transition(ApplicationState.READY_TO_SUBMIT, { filledCount: filled.length, total: sourceFields.length });
    } else {
      manager.transition(ApplicationState.REVIEW_REQUIRED, {
        filledCount: filled.length,
        unfilledCount: unfilled.length,
        unfilled,
        questions,
        incomplete,
        blocked: !!blocked,
        buttonsCount: buttons.length,
      });
    }

      return { filled, unfilled, questions, total: sourceFields.length + Number(!!input) };
    } finally {
      isFilling = false;
    }
  }

  async function startAutofill(expectedUrl, candidate, resume, resumeDocumentId, continuation = false, saved = null, aiAnswers = null) {
    const result = await fill(expectedUrl, candidate, resume, continuation, null, saved, aiAnswers);
    // Keep the answer bank for later wizard steps and for a reload between steps.
    globalThis.__nextkinSavedAnswers = saved || globalThis.__nextkinSavedAnswers || null;
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
        if (isFilling) {
          let attempts = 0;
          while (isFilling && attempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (isFilling) return;
        }
        await fill(url, fresh, resume, true, fields, globalThis.__nextkinSavedAnswers).catch(() => {});
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
    const apply = () => startAutofill(url, step.profile, step.resume, step.resumeDocumentId, true,
      globalThis.__nextkinSavedAnswers).catch(() => {});
    if (inspect().fields.length) return apply();
    const observer = discovery.observeStepTransitions(document, ({ allFields }) => {
      if (location.href !== url || !allFields.some(field => !field.excluded && field.kind !== 'inaccessible')) return;
      observer.disconnect();
      clearTimeout(timer);
      void apply();
    });
    const timer = setTimeout(() => observer.disconnect(), 15000);
  }

  async function rescanConditionalQuestions(expectedUrl, candidate, resume, maxPasses = 3) {
    const page = inspect();
    if (!page.hasForm) return null;
    let passes = 0;
    while (passes < maxPasses) {
      passes++;
      const { fields } = inspect();
      const unfilled = fields.filter(f => !f.excluded && f.kind !== 'inaccessible' && !writer.read(f));
      if (!unfilled.length) break;
      await fill(expectedUrl, candidate, resume, true, unfilled, globalThis.__nextkinSavedAnswers).catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }
  }

  globalThis.NextkinApplication = {
    scan() {
      const { job, hasForm } = inspect();
      return { job, hasForm, url: location.href };
    },
    fill,
    rescanConditionalQuestions,
    savedAnswers,
    hasAnswers,
    startAutofill,
    submitApplication,
    validateForSubmission,
    confirmSubmission,
    failSubmission,
    ApplicationState,
    SyncStatus,
    ApplicationAttemptContext,
    ApplicationStateManager,
    ApplicationStateError,
    getStateManager() { return currentManager; },
    getAttemptContext() { return currentManager?.getContext() || null; },
    getState() { return currentManager?.getState() || ApplicationState.DRAFT; },
    getSyncStatus() { return currentManager?.getSyncStatus() || SyncStatus.LOCAL_ONLY; },
    resetAttempt() { currentManager = null; },
  };

  globalThis.ApplicationAttemptContext = ApplicationAttemptContext;
  globalThis.ApplicationStateManager = ApplicationStateManager;
  globalThis.ApplicationState = ApplicationState;
  globalThis.SyncStatus = SyncStatus;
  globalThis.ApplicationStateError = ApplicationStateError;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ...globalThis.NextkinApplication,
      NextkinApplication: globalThis.NextkinApplication,
      ApplicationAttemptContext,
      ApplicationStateManager,
      ApplicationState,
      SyncStatus,
      ApplicationStateError,
    };
  }

  // A manually filled application can navigate away as soon as its form is submitted.
  if (typeof window !== 'undefined' && !globalThis.nextkinSubmitObserver
    && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    globalThis.nextkinSubmitObserver = true;
    const embedded = window.top !== window;
    if (!embedded && typeof MutationObserver !== 'undefined' && discovery.observeStepTransitions) void resumeNextStep();
    const recordAttempt = (event, form, button) => {
      if (!event.isTrusted || !form || submitting.has(form)) return;
      if (button && !finalSubmit.test(submitLabel(button))) return;
      const { job, hasForm, url } = globalThis.NextkinApplication.scan();
      if ((!hasForm && !wizard) || (!job && !wizard && !new URLSearchParams((location.hash || '').slice(1)).has('marketing-intent'))) return;

      const manager = currentManager || getOrCreateManager(null, url, job);
      if (manager.getState() !== ApplicationState.SUBMITTED) {
        if (manager.getState() !== ApplicationState.SUBMITTING) {
          manager.transition(ApplicationState.SUBMITTING, { manual: true, button: submitLabel(button) });
        }
        manager.transition(ApplicationState.PENDING_VERIFICATION, { manual: true });
        manager.setSyncStatus(SyncStatus.SYNC_PENDING, { manual: true });
      }

      void prepareSubmission(form, url, job).then(
        tracked => {
          if (tracked?.tracked) manager.setSyncStatus(SyncStatus.SYNCED, { outsideJobUrl: tracked.outsideJobUrl });
          else manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error });
        },
        error => manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: error?.message })
      ).catch(() => {});
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
      const selector = embedded
        ? 'button[type="button"], [role="button"], button[type="submit"], input[type="submit"]'
        : 'button[type="button"], [role="button"]';
      const button = event.target?.closest?.(selector);
      if (!button) return;
      const form = button.form || button.closest('form');
      if (embedded && form && button.type === 'submit') return;
      recordAttempt(event, form || (embedded ? document : null), button);
    }, true);
  }
})();
