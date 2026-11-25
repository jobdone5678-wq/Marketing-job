(function () {
  'use strict';

  /**
   * NextKinHR MAIN-World Network Submission Interceptor (modeled on Jobright v1.27.1 ATS_SUBMISSION_SITES interceptors).
   * Observes fetch() and XMLHttpRequest responses in the page MAIN world for confirmed ATS submission API completions
   * (Workday finalize, Oracle HCM CREATE+CONFIRM, Ashby GraphQL, Greenhouse, Lever, SmartRecruiters, Workable, ClearCompany, SuccessFactors, BrassRing)
   * and emits a CustomEvent('nextkin:submission-network') to the isolated content script world.
   */

  if (window.__nextkinSubmissionNetworkHooked) return;
  window.__nextkinSubmissionNetworkHooked = true;

  const NETWORK_RULES = [
    {
      provider: 'workday',
      method: /^(POST|PUT)$/i,
      urlPattern: /\/wday\/cxs\/[^/]+\/[^/]+\/jobs\/[^/]+\/(?:apply|finalize)|\/apply\/finalize(?:\/|\?|$)/i,
      verifyJson: (data) => !data?.errors?.length && (data?.status === 'SUCCEEDED' || data?.applicationId || data?.id || true),
      extractIds: (data, reqUrl) => ({
        confirmationId: data?.applicationId || data?.confirmationNumber || data?.id || null,
        requisitionId: (reqUrl.match(/(?:\/|_|-)((?:JR\d+|R-\d+))(?:\/|$)/i) || [])[1] || null,
      }),
    },
    {
      provider: 'oraclecloud',
      method: /^POST$/i,
      urlPattern: /\/hcmRestApi\/resources\/[^/]+\/recruitingCEJobApplications/i,
      verifyJson: (data, reqBody) => {
        const bodyText = typeof reqBody === 'string' ? reqBody : '';
        // Oracle submits CREATE followed by CONFIRM or confirmed draft submission
        if (/\"SubmissionStatus\"\s*:\s*\"ORA_DRAFT\"/i.test(bodyText) && !data?.SubmissionConfirmedFlag) return false;
        return Boolean(data?.Id || data?.CandidateNumber || data?.SubmissionConfirmedFlag);
      },
      extractIds: (data) => ({
        confirmationId: data?.Id ? String(data.Id) : (data?.CandidateNumber ? String(data.CandidateNumber) : null),
        requisitionId: data?.RequisitionNumber ? String(data.RequisitionNumber) : null,
      }),
    },
    {
      provider: 'ashby',
      method: /^POST$/i,
      urlPattern: /jobs\.ashbyhq\.com\/api\/non-user-graphql/i,
      verifyRequest: (reqUrl, reqBody) => {
        const str = typeof reqBody === 'string' ? reqBody : '';
        return /applicationFormSubmit|submitApplication/i.test(reqUrl + ' ' + str);
      },
      verifyJson: (data) => {
        if (Array.isArray(data?.errors) && data.errors.length) return false;
        const submitRes = data?.data?.applicationFormSubmit;
        if (!submitRes) return false;
        if (submitRes.blockedByBot || submitRes.error) return false;
        return submitRes.submittedFormInstance?.id || submitRes.success === true || true;
      },
      extractIds: (data) => ({
        confirmationId: data?.data?.applicationFormSubmit?.submittedFormInstance?.id || null,
        requisitionId: null,
      }),
    },
    {
      provider: 'greenhouse',
      method: /^POST$/i,
      urlPattern: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/.*(?:jobs\/\d+|applications)(?:\/apply)?(?:\?|$)/i,
      verifyJson: (data) => !(data?.errors && Object.keys(data.errors).length) && data?.status !== 'error',
      extractIds: (data, reqUrl) => ({
        confirmationId: data?.id ? String(data.id) : (data?.application_id ? String(data.application_id) : null),
        requisitionId: (reqUrl.match(/\/jobs\/(\d+)/i) || [])[1] || null,
      }),
    },
    {
      provider: 'lever',
      method: /^POST$/i,
      urlPattern: /jobs\.(?:eu\.)?lever\.co\/[^/]+\/[a-f0-9-]+\/apply(?:\?|$)/i,
      verifyJson: (data) => !data?.error && data?.ok !== false,
      extractIds: (data, reqUrl) => ({
        confirmationId: data?.applicationId || null,
        requisitionId: (reqUrl.match(/\/([a-f0-9-]{36})\/apply/i) || [])[1] || null,
      }),
    },
    {
      provider: 'smartrecruiters',
      method: /^POST$/i,
      urlPattern: /(?:smartrecruiters\.com|smartr\.me)\/.*(?:oneclick-ui\/api\/.*\/apply|api\/applications)/i,
      verifyJson: (data) => !data?.errors?.length,
      extractIds: (data) => ({
        confirmationId: data?.id || data?.applicationId || null,
        requisitionId: null,
      }),
    },
    {
      provider: 'workable',
      method: /^POST$/i,
      urlPattern: /workable\.com\/api\/v\d+\/accounts\/[^/]+\/jobs\/[^/]+\/candidates/i,
      verifyJson: (data) => !data?.error && (data?.status !== 'error'),
      extractIds: (data) => ({
        confirmationId: data?.id || data?.shortcode || null,
        requisitionId: null,
      }),
    },
    {
      provider: 'clearcompany',
      method: /^POST$/i,
      urlPattern: /clearcompany\.com\/.*\/Candidate\/Submit/i,
      verifyJson: (data) => data?.Success !== false && !data?.Errors?.length,
      extractIds: (data) => ({ confirmationId: data?.ApplicationId || null, requisitionId: null }),
    },
    {
      provider: 'successfactors',
      method: /^POST$/i,
      urlPattern: /successfactors\.(?:com|eu)\/.*(?:apply\/submit|rcmCandidateApplication)/i,
      verifyJson: (data) => !data?.error,
      extractIds: () => ({ confirmationId: null, requisitionId: null }),
    },
    {
      provider: 'brassring',
      method: /^POST$/i,
      urlPattern: /brassring\.com\/.*SubmitApplication/i,
      verifyJson: (data) => !data?.error,
      extractIds: () => ({ confirmationId: null, requisitionId: null }),
    },
  ];

  function inspectNetworkCompletion(reqUrl, method, status, responseText, reqBody) {
    if (!reqUrl || status < 200 || status >= 300) return;
    const upperMethod = String(method || 'GET').toUpperCase();
    for (const rule of NETWORK_RULES) {
      if (!rule.method.test(upperMethod)) continue;
      if (!rule.urlPattern.test(reqUrl)) continue;
      if (typeof rule.verifyRequest === 'function' && !rule.verifyRequest(reqUrl, reqBody)) continue;

      let parsed = null;
      if (responseText && typeof responseText === 'string') {
        const trimmed = responseText.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { parsed = JSON.parse(trimmed); } catch {}
        }
      }
      if (typeof rule.verifyJson === 'function' && !rule.verifyJson(parsed, reqBody)) continue;

      const ids = typeof rule.extractIds === 'function' ? rule.extractIds(parsed, reqUrl) : {};
      try {
        window.dispatchEvent(new CustomEvent('nextkin:submission-network', {
          detail: {
            provider: rule.provider,
            url: reqUrl.split('?')[0],
            method: upperMethod,
            status,
            confirmationId: ids?.confirmationId || null,
            requisitionId: ids?.requisitionId || null,
            evidence: `Network ${rule.provider} ${upperMethod} (${status})`,
            timestamp: Date.now(),
          },
        }));
      } catch {}
      break;
    }
  }

  // Wrap fetch cleanly
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      let reqUrl = '';
      let method = 'GET';
      let reqBody = null;
      try {
        reqUrl = typeof input === 'string' ? input : (input?.url || '');
        method = init?.method || input?.method || 'GET';
        reqBody = init?.body || null;
      } catch {}

      const promise = nativeFetch.apply(this, arguments);
      promise.then((response) => {
        try {
          const absUrl = reqUrl ? new URL(reqUrl, location.href).href : (response?.url || '');
          const matchedRule = NETWORK_RULES.some(r => r.method.test(String(method).toUpperCase()) && r.urlPattern.test(absUrl));
          if (matchedRule && response && response.ok && typeof response.clone === 'function') {
            response.clone().text().then((text) => {
              inspectNetworkCompletion(absUrl, method, response.status, text, reqBody);
            }).catch(() => {});
          }
        } catch {}
      }).catch(() => {});
      return promise;
    };
  }

  // Wrap XMLHttpRequest cleanly
  if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this.__nkMethod = String(method || 'GET').toUpperCase();
        this.__nkUrl = url ? new URL(String(url), location.href).href : '';
      } catch {}
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        const matched = this.__nkUrl && NETWORK_RULES.some(
          r => r.method.test(this.__nkMethod || 'GET') && r.urlPattern.test(this.__nkUrl)
        );
        if (matched && !this.__nkListened) {
          this.__nkListened = true;
          this.addEventListener('load', () => {
            try {
              const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : '';
              inspectNetworkCompletion(this.__nkUrl, this.__nkMethod, this.status, text, body);
            } catch {}
          });
        }
      } catch {}
      return origSend.apply(this, arguments);
    };
  }
})();
