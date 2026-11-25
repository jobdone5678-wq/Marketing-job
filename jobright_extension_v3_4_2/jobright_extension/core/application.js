(function () {
  if (globalThis.NextkinApplication) return;
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  // Trusted application-level review policy. It applies to both the panel-driven first pass and
  // wizard continuations, which reload a fresh backend profile that has no such property.
  const REQUIRE_CANDIDATE_REVIEW = true;
  const manualQuestion = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
  const jobSpecific = /\b(?:this|the) (?:job|role|position|company|organization|employer|opportunity)\b|\bwhy\b|cover letter|how did you hear|\breferred\b|application source/i;
  const privateAnswer = /birth|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|signature/i;
  const finalSubmit = /^(?:submit(?:\s+(?:my |your |the )?application)?|send application|apply(?: now)?|complete application|finish application)[.!]?$/i;
  const reviewField = /\b(?:agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|signature|captcha|password|otp)\b/i;
  const fileEvidence = new WeakMap();
  const submitting = new WeakSet();
  let verifiedElements = new WeakMap();
  let reviewRequired = false;
  let questionIds = new WeakMap();
  let questionsById = new Map();
  const isAnswered = (field, value = writer.read(field)) => writer.isAnswered
    ? writer.isAnswered(field, value)
    : Array.isArray(value) ? value.length > 0 : Boolean(value);
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
      ApplicationState.SUBMITTING,
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
    if (typeof globalThis.NextkinSiteRegistry?.detectAtsProvider === 'function') {
      const detected = globalThis.NextkinSiteRegistry.detectAtsProvider(url, typeof document !== 'undefined' ? document : null);
      if (detected && detected !== 'generic') return detected;
    }
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
      this.resumeDocumentId = params.resumeDocumentId || null;
      this.jobKey = params.jobKey || params.jobUrl || null;
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
        profileVersion: this.profileVersion,
        resumeDocumentId: this.resumeDocumentId,
        jobKey: this.jobKey,
        jobUrl: this.jobUrl,
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
        resumeDocumentId: this.resumeDocumentId,
        jobKey: this.jobKey,
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
   * Persists state through the service worker in trusted extension storage
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
      const { attemptId, candidateId, profileVersion, resumeDocumentId, jobKey } = this.context;
      const payload = {
        context: { attemptId, candidateId, profileVersion, resumeDocumentId, jobKey },
        requiresReview: reviewRequired,
        application_status: this.application_status,
        sync_status: this.sync_status,
        updatedAt: new Date().toISOString(),
      };

      if (this.context.candidateId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        return chrome.runtime.sendMessage({ type: 'NEXTKIN_SAVE_ATTEMPT', payload }).catch(() => null);
      }
      return null;
    }
  }

  let currentManager = null;

  function resetAttempt() {
    const attemptId = currentManager?.getContext().attemptId;
    currentManager = null;
    verifiedElements = new WeakMap();
    reviewRequired = false;
    questionIds = new WeakMap();
    questionsById = new Map();
    wizard?.disconnect();
    wizard = null;
    writer?.clearPreservedValues?.();
    if (attemptId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      void chrome.runtime.sendMessage({ type: 'NEXTKIN_CLEAR_ATTEMPT', attemptId }).catch(() => {});
    }
  }

  async function isAutomationDisabled(url, activeOnly = false) {
    const rules = globalThis.NextkinSiteRules;
    await rules?.getCachedRules?.();
    return rules?.automationDisabled?.(url, activeOnly);
  }

  function getOrCreateManager(candidate, expectedUrl, job = null, resumeDocumentId = null, attemptIdentity = null) {

    const targetUrl = expectedUrl || (typeof location !== 'undefined' ? location.href : '');
    const activeJob = job || (capture?.read ? capture.read() : null);
    const urlKey = globalThis.NextkinSiteRegistry?.cleanApplicationUrl?.(targetUrl) || targetUrl;
    const registryId = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(targetUrl)?.requisitionId;
    const identity = registryId || activeJob?.externalId;
    const jobKey = attemptIdentity?.jobKey || (identity ? JSON.stringify([new URL(targetUrl).origin, identity]) : urlKey);
    if (currentManager && currentManager.getContext().jobKey !== jobKey) {
      if (!candidate?.id) return currentManager;
      resetAttempt();
    }

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

      if (isActive && candidate?.version && candidate.version !== currentManager.getContext().profileVersion) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The candidate profile changed. Reopen the application to start a new attempt.');
      }
      if (isActive && resumeDocumentId && currentManager.getContext().resumeDocumentId !== resumeDocumentId) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The selected resume changed. Reopen the application to start a new attempt.');
      }
      if (isActive && (!candidate?.id || candidate.id === activeCandidateId)) {
        return currentManager;
      }
      // Clear stale verified field records when starting a fresh attempt after an inactive one
      resetAttempt();
    }

    const context = new ApplicationAttemptContext({
      attemptId: attemptIdentity?.attemptId || undefined,
      applicationId: candidate?.applicationId || activeJob?.externalId || null,
      userId: candidate?.userId || candidate?.user_id || null,
      candidateId: candidate?.id || null,
      profileVersion: candidate?.version || candidate?.profileVersion || 1,
      atsProvider: detectAtsProvider(targetUrl),
      jobUrl: targetUrl,
      jobKey,
      resumeDocumentId,
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
      !manualQuestion.test(key) && !jobSpecific.test(key) &&
      !(mapping.isProtectedQuestion ? mapping.isProtectedQuestion(field) : true);
  }

  function answerFits(field, value) {
    if (value === undefined || value === null || value === '') return false;
    const type = field.element?.type || '';
    if (type === 'number' && !Number.isFinite(Number(value))) return false;
    if (type === 'date' && Number.isNaN(Date.parse(String(value)))) return false;
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) return false;
    if (type === 'url' && !mapping.candidateHttpUrl?.(String(value).trim())) return false;
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
      if (globalThis.NextkinSiteRules?.automationDisabled?.(location.href)) return { job: null, hasForm: false, fields: [] };
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

    function findResumeInput(root = discovery.scopeToApplication?.(document) || document) {
      const matches = input => {
        if (input.disabled) return false;
        const label = discovery.label(input);
        const description = [label, input.name, input.id, input.getAttribute?.('data-testid'), input.getAttribute?.('data-automation-id')]
          .join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '');
        return /\b(?:resume|curriculum vitae|cv)\b/i.test(description) && !/cover\s*letter|additional|optional document/i.test(label);
      };
      if (discovery.querySelectorAllDeep) {
        const candidates = [...discovery.querySelectorAllDeep('input[type="file"]', root)].filter(matches);
        return candidates.length === 1 ? candidates[0] : undefined;
      }
      const direct = [...root.querySelectorAll('input[type="file"]')].filter(matches);
      if (direct.length) return direct.length === 1 ? direct[0] : undefined;
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

    function verifiedField(field, value) {
      const ctx = currentManager?.getContext();
      if (field.kind === 'resume-file') return fileEvidence.get(field.element?.files?.[0])?.attemptId === ctx?.attemptId;
      const record = verifiedElements.get(field.element);
      if (!record || !ctx) return false;
      if (record.attemptId !== ctx.attemptId || record.candidateId !== ctx.candidateId || record.jobKey !== ctx.jobKey) {
        return false;
      }
      return JSON.stringify(record.value) === JSON.stringify(value);
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
      const metadata = file && resumeMetadata(file);
      const proof = file && fileEvidence.get(file);
      const appliedResume = metadata && { ...metadata, sizeBytes: file.size, resumeId: proof?.documentId };
      return { answers: [...answers.values()], ...(appliedResume ? { appliedResume } : {}) };
    }

    function prepareSubmission(form, url, job, evidence = submissionEvidence(form), automatic = false) {
      return chrome.runtime.sendMessage({ action: 'prepare_application_tracking', url, job, submitted: true, automatic,
        attemptId: currentManager?.getContext().candidateId ? currentManager.getContext().attemptId : undefined, submissionEvidence: evidence });
    }

    /**
     * Submit application to employer portal ATS while keeping user in control of final submission.
     * Runtime errors are paired with explicit state transitions to REVIEW_REQUIRED, READY_TO_SUBMIT,
     * SUBMITTING, and PENDING_VERIFICATION.
     */
    async function submitApplication(expectedUrl) {
      const manager = currentManager || getOrCreateManager(null, expectedUrl);
      if (await isAutomationDisabled(expectedUrl, true)) throw new Error('Automatic submission is disabled for this employer site.');

      if (reviewRequired || manager.getState() !== ApplicationState.READY_TO_SUBMIT || globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true)) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Review the form and submit it manually on the employer page.');
      }
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
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || element?.getAttribute?.('aria-required') === 'true' ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
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
      let staged = false;
      try {
        const file = findResumeInput(form)?.files?.[0];
        if (file && fileEvidence.get(file)?.attemptId !== manager.getContext().attemptId) {
          throw new Error('Review the attached resume and submit manually on the employer page.');
        }
        const evidence = submissionEvidence(form);

        manager.setSyncStatus(SyncStatus.SYNC_PENDING, { url: expectedUrl });
        const tracked = await prepareSubmission(form, expectedUrl, job, evidence, true);
        staged = Boolean(tracked?.tracked);

        if (!tracked?.tracked || location.href !== expectedUrl || !form.isConnected || !form.checkValidity()) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, {
            reason: 'Automatic submission could not start. Review the form and submit manually.',
            tracked: !!tracked?.tracked,
          });
          manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error || 'Tracking failed' });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Automatic submission could not start. Review the form and submit manually.');
        }

        const finalFields = discovery.discoverFields(form);
        if (currentManager !== manager || reviewRequired || !buttons[0].getClientRects().length || buttons[0].disabled ||
          !finalSubmit.test(submitLabel(buttons[0])) || globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true) ||
          finalFields.some(field => !field.excluded && (reviewField.test(field.label + ' ' + (field.hint || '')) ||
            ((field.required || field.element?.required || field.element?.getAttribute?.('aria-required') === 'true') &&
              !verifiedField(field, writer.read(field))))) ||
          file !== findResumeInput(form)?.files?.[0] || JSON.stringify(evidence.answers) !== JSON.stringify(submissionEvidence(form).answers)) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, {
            reason: 'Form values changed during autofill. Review the form and submit manually.',
          });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Form values changed during autofill. Review the form and submit manually.');
        }

        form.requestSubmit(buttons[0]);

        // Form submission dispatched -> Transition to PENDING_VERIFICATION (awaiting ATS confirmation)
        manager.transition(ApplicationState.PENDING_VERIFICATION, {
          reason: 'Form submission dispatched, awaiting ATS receipt confirmation',
        });
      } catch (error) {
        if (staged) {
          void chrome.runtime.sendMessage({
            type: 'NEXTKIN_CANCEL_SUBMISSION_ATTEMPT', attemptId: manager.getContext().attemptId,
          }).catch(() => {});
        }
        if (manager.getState() === ApplicationState.SUBMITTING) {
          manager.transition(ApplicationState.FAILED, { error: error.message });
        }
        throw error;
      } finally {
        submitting.delete(form);
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

      if (reviewRequired || globalThis.NextkinSiteRules?.automationDisabled?.(targetUrl, true)) {
        return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'Review the form and submit it manually on the employer page.' };
      }
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
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || element?.getAttribute?.('aria-required') === 'true' ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
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

    async function fill(expectedUrl, candidate, resume, continuation = false, newFields, saved = null, aiAnswers = null, resumeDocumentId = null) {
      if (isFilling) {
        let attempts = 0;
        while (isFilling && attempts < 30) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (isFilling) {
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: 0, error: 'Autofill is already in progress.' };
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

        if (await isAutomationDisabled(expectedUrl)) {
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: 0, error: 'Autofill is disabled for this employer site.' };
        }
        if (aiAnswers && globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true)) aiAnswers = null;
        const manager = getOrCreateManager(candidate, expectedUrl, null, resumeDocumentId);
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
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: page.fields.length, error: 'Save your candidate details in My Applications and Resume first.' };
        }
        const baseFields = newFields ? page.fields.filter(field => newFields.some(next =>
          next.element === field.element && next.label === field.label)) : page.fields;
        const sourceFields = continuation
          ? baseFields.filter(field => !field.element || !verifiedField(field, writer.read(field)) || !isAnswered(field))
          : baseFields;
        // Safety options are part of every live plan: the country comes only from structured job data, and
        // a continuation (wizard step) or any answer the extension did not verify must be reviewable.
        const planOptions = {
          jobCountry: globalThis.NextkinJobCapture?.verifiedCountry?.() || '',
          requireCandidateReview: REQUIRE_CANDIDATE_REVIEW || candidate?.requireCandidateReview === true
        };
        const plans = mapping.planFill(sourceFields, facts, planOptions);
      const keys = plans.map(plan => answerKey(plan.field));

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
      const questionMeta = Object.create(null);
      const hasOwn = (obj, k) => Boolean(k) && Object.prototype.hasOwnProperty.call(obj, k);

      for (const plan of plans) {
        const { field } = plan;
        const label = (field.label || field.hint || '').trim();
        const key = answerKey(field);

        if (aiAnswers && (plan.status === 'ai' || plan.status === 'needs_review' || plan.status === 'unknown')) {
          if (!field.element || label.length < 2 || key.length > 300 || !mapping.isAiEligible?.(field, plan.factKey)) continue;
          let qid = questionIds.get(field.element);
          const previousField = questionsById.get(qid);
          if (!previousField || previousField.label !== field.label || previousField.kind !== field.kind) {
            const baseQid = key.slice(0, 200);
            qid = baseQid;
            for (let suffix = 2; questionsById.has(qid); suffix++) qid = baseQid + '::' + suffix;
            questionIds.set(field.element, qid);
          }
          questionsById.set(qid, field);
          if (isAnswered(field)) continue;
          const isComboKind = field.kind === 'combobox' || field.kind === 'multi-combobox';
          const skipComboProbe = aiAnswers && Object.keys(aiAnswers).length === 0 && isComboKind;
          const choices = plan.options?.length ? plan.options
            : skipComboProbe ? []
            : (await writer.readChoices(field, () => location.href === expectedUrl && !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl))).map(option => option.label);
          const options = [...new Set(choices.filter(option => option && option.length <= 1000))].slice(0, 200);

          const aiReply = hasOwn(aiAnswers || {}, qid) ? aiAnswers[qid] : undefined;
          if (typeof aiReply === 'string') {
            if (!options.length && ['text', 'textarea'].includes(field.kind) && aiReply.trim()) {
              plan.status = 'supported';
              plan.value = aiReply.trim();
              plan.ai = true;
              continue;
            }
            const normalizedReply = aiReply.trim().toLowerCase();
            const matches = options.filter(o => o.trim().toLowerCase() === normalizedReply);
            const multi = mapping.isMultiKind(field.kind);
            if (matches.length === 1) {
              const [matchedOption] = matches;
              plan.status = 'supported';
              plan.value = multi ? [matchedOption] : matchedOption;
              plan.ai = true;
              continue;
            }
            if (multi) {
              const parts = aiReply.split(/[,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
              const groups = parts.map(part => options.filter(option => option.trim().toLowerCase() === part));
              if (parts.length && groups.every(matches => matches.length === 1)) {
                const matchedList = groups.flat();
                plan.status = 'supported';
                plan.value = [...new Set(matchedList)];
                plan.ai = true;
                continue;
              }
            }
          }

          questions.push({ id: qid, label: label.slice(0, 2000), type: field.kind, options });
          questionMeta[qid] = {
            fieldId: field.id || field.name || field.key || qid,
            combo: field.kind === 'combobox' || field.kind === 'multi-combobox',
            required: Boolean(field.required || field.element?.required || (typeof field.element?.getAttribute === 'function' && field.element.getAttribute('aria-required') === 'true')),
            planStatus: plan.status,
            factKey: plan.factKey || null,
          };
        }
      }

      const attemptContext = manager.getContext();
      const receipts = await writer.applyFill(plans, {
        sessionId: crypto.randomUUID(),
        isCurrent: () => location.href === expectedUrl &&
          currentManager === manager &&
          currentManager.getContext().attemptId === attemptContext.attemptId &&
          (!attemptContext.candidateId || currentManager.getContext().candidateId === attemptContext.candidateId) &&
          !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl),
      });
      for (const receipt of receipts) {
        if (receipt.field.element) {
          verifiedElements.set(receipt.field.element, {
            attemptId: attemptContext.attemptId,
            candidateId: attemptContext.candidateId,
            jobKey: attemptContext.jobKey,
            fieldKey: receipt.field.key,
            value: writer.read(receipt.field),
          });
        }
      }
      const filled = receipts.map(receipt => ({
        key: receipt.field.key,
        label: receipt.field.label || receipt.field.hint || 'Application field',
        value: Array.isArray(receipt.writtenValue)
          ? receipt.writtenValue.join(', ')
          : typeof receipt.writtenValue === 'boolean' ? (receipt.writtenValue ? 'Yes' : 'No') : String(receipt.writtenValue ?? ''),
        status: receipt.status,
        ai: !!receipt.ai,
        learned: !!receipt.learned,
      }));
      const input = findResumeInput();
      if (input?.isConnected && !input.files?.length && location.href === expectedUrl && !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl)) {
        const attached = await writer.attachResumeFile?.(input, resume, () => location.href === expectedUrl);
        if (attached) {
          fileEvidence.set(attached.file, { attemptId: manager.getContext().attemptId, documentId: manager.getContext().resumeDocumentId, uploadState: attached.uploadState });
          if (attached.uploadState === 'UPLOAD_PENDING') reviewRequired = true;
          filled.push({ key: 'resume-file', label: 'Resume file', value: attached.expected, uploadState: attached.uploadState });
        }
      }
      const writtenFields = new Set(receipts.map(receipt => receipt.field));
      const unverified = new Map((receipts.unverified || []).map(receipt => [receipt.field, receipt]));
      const verifiedResume = !input || fileEvidence.get(input.files?.[0])?.attemptId === manager.getContext().attemptId;
      reviewRequired ||= plans.some(plan => plan.ai) || unverified.size > 0 || !verifiedResume;
      const unfilled = [];
      for (const plan of plans) {
        if (!writtenFields.has(plan.field) && plan.field.kind !== 'resume-file') {
          unfilled.push({
            key: plan.field.key,
            label: plan.field.label || plan.field.hint || 'Application question',
            kind: plan.field.kind,
            status: unverified.get(plan.field)?.status || plan.status,
            reason: ({
              conflict: 'Existing value differs from the candidate profile.',
              preserved_user_value: 'Your existing answer was preserved. Review it before submitting.',
              partial: 'Only some requested options could be selected.',
              unverified: 'Could not verify the value on the employer form.',
            })[unverified.get(plan.field)?.status] || plan.reason || 'No matching saved candidate detail'
          });
        }
      }
      if (input?.isConnected && !verifiedResume) {
        unfilled.unshift({
          key: 'resume-file',
          label: 'Resume file',
          kind: 'file',
          reason: input.files?.length ? 'Check the existing resume belongs to this candidate.' :
            (resume?.base64 ? 'Portal requires manual file attachment' : 'Uploaded resume unavailable')
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
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || (typeof element?.getAttribute === 'function' && element.getAttribute('aria-required') === 'true') ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
      });

      if (!reviewRequired && form && buttons.length === 1 && !blocked && !incomplete && form.checkValidity()) {
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

      return { filled, unfilled, questions, questionMeta, total: sourceFields.length + Number(!!input) };
    } catch (error) {
      if (currentManager?.getState() === ApplicationState.FILLING) {
        currentManager.transition(ApplicationState.FAILED, { error: error.message });
      }
      throw error;
    } finally {
      isFilling = false;
    }
  }

  async function startAutofill(expectedUrl, candidate, resume, resumeDocumentId, continuation = false, saved = null, aiAnswers = null, attemptIdentity = null) {
    if (attemptIdentity?.attemptId || attemptIdentity?.jobKey) {
      getOrCreateManager(candidate, expectedUrl, null, resumeDocumentId, attemptIdentity);
    }
    const result = await fill(expectedUrl, candidate, resume, continuation, null, saved, aiAnswers, resumeDocumentId);
    // Keep the answer bank for later wizard steps and for a reload between steps.
    globalThis.__nextkinSavedAnswers = saved || globalThis.__nextkinSavedAnswers || null;
    await currentManager?.persist();
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
        await fill(url, fresh, resume, true, fields, globalThis.__nextkinSavedAnswers, null, resumeDocumentId).catch(() => {});
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
    const apply = () => {
      reviewRequired ||= Boolean(step.requiresReview);
      return startAutofill(url, step.profile, step.resume, step.resumeDocumentId, true,
        globalThis.__nextkinSavedAnswers, null, {
          attemptId: step.attemptId,
          jobKey: step.jobKey,
          eventKey: step.eventKey,
        }).catch(() => {});
    };
    if (inspect().fields.length) return apply();
    const observer = discovery.observeStepTransitions(document, ({ allFields }) => {
      if (location.href !== url || !allFields.some(field => !field.excluded && field.kind !== 'inaccessible')) return;
      observer.disconnect();
      clearTimeout(timer);
      void apply();
    });
    const timer = setTimeout(() => observer.disconnect(), 15000);
  }

  async function waitForDomSettlement(quietMs = 250, maxWaitMs = 1500) {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) {
      await new Promise(r => setTimeout(r, Math.min(quietMs, 200)));
      return;
    }
    await new Promise((resolve) => {
      let settled = false;
      let quietTimer = null;
      let hardTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        try { obs.disconnect(); } catch {}
        resolve();
      };
      const bump = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };
      const obs = new MutationObserver(() => bump());
      try {
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'disabled'] });
      } catch {
        finish();
        return;
      }
      hardTimer = setTimeout(finish, maxWaitMs);
      bump();
    });
  }

  async function rescanConditionalQuestions(expectedUrl, candidate, resume, maxPasses = 3) {
    const page = inspect();
    if (!page.hasForm) return null;
    let passes = 0;
    while (passes < maxPasses) {
      passes++;
      await waitForDomSettlement(250, 1400);
      if (location.href !== expectedUrl) break;
      const { fields } = inspect();
      const unfilled = fields.filter(f =>
        !f.excluded &&
        f.kind !== 'inaccessible' &&
        !isAnswered(f)
      );
      if (!unfilled.length) break;
      await fill(expectedUrl, candidate, resume, true, unfilled, globalThis.__nextkinSavedAnswers).catch(() => {});
    }
  }

  globalThis.NextkinApplication = {
    screeningField(id) {
      const field = questionsById.get(id);
      return field?.element?.isConnected && mapping.isAiEligible?.(field) ? field : null;
    },
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
    resetAttempt,
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
          manager.transition(ApplicationState.SUBMITTING, { manual: true, button: button ? submitLabel(button) : '' });
        }
        manager.transition(ApplicationState.PENDING_VERIFICATION, { manual: true });
        manager.setSyncStatus(SyncStatus.SYNC_PENDING, { manual: true });
      }

      void prepareSubmission(form, url, job).then(
        tracked => {
          if (!tracked?.tracked) manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error });
        },
        error => manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: error?.message })
      ).catch(() => {});
    };
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
