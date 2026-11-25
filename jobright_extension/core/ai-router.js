/**
 * NextKinHR Chrome Extension: AI Autofill Hybrid Router & Session Tracker
 *
 * 4-Mode Hybrid Routing Dispatcher:
 * - Mode 1 (Server default): Proxies via Next.js backend /api/extension/autofill/plan & choose
 * - Mode 2 (Portal BYOK): Proxies via Next.js backend with private encrypted key
 * - Mode 3 (Extension BYOK): Direct browser execution via planner-bundle.js
 * - Mode 4 (Local direct): Direct browser execution to local Ollama / LM Studio (localhost:11434)
 *
 * Session Freshness:
 * Rejects stale fill operations if tabId, documentId, or formRevision changed after planning.
 */

import {
  planFormBatch,
  chooseComboboxOption,
  ProviderClient,
} from './ai/planner-bundle.js';

/**
 * Validates whether an active autofill session remains fresh against current DOM state.
 */
export function validateSessionFreshness(session, currentState) {
  if (!session || !currentState) {
    return { fresh: false, reason: 'Missing session or current state descriptor' };
  }

  if (currentState.tabId != null && session.tabId != null && currentState.tabId !== session.tabId) {
    return { fresh: false, reason: `Tab changed: session tab ${session.tabId} != current tab ${currentState.tabId}` };
  }

  if (currentState.documentId && session.documentId && currentState.documentId !== session.documentId) {
    return { fresh: false, reason: `Document navigation detected: session doc ${session.documentId} != current doc ${currentState.documentId}` };
  }

  if (currentState.formRevision != null && session.formRevision != null && currentState.formRevision !== session.formRevision) {
    return { fresh: false, reason: `Form revision changed: session rev ${session.formRevision} != current rev ${currentState.formRevision}` };
  }

  return { fresh: true };
}

export class AIRouter {
  constructor(options = {}) {
    this.mode = options.mode || 'server'; // 'server' | 'portal_byok' | 'extension_byok' | 'local_direct'
    this.config = options.config || {};
    this.backendUrl = options.backendUrl || '';
    this.token = options.token || null;
    this.clientFactory = options.clientFactory || null;
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
    this.planFn = options.planFn || planFormBatch;
    this.chooseFn = options.chooseFn || chooseComboboxOption;
  }

  /**
   * Plans form fields using the active routing mode.
   */
  async plan(fields, facts, context = {}) {
    if (this.mode === 'local_direct' || this.mode === 'extension_byok') {
      const baseUrl = this.config.baseUrl || (this.mode === 'local_direct' ? 'http://localhost:11434' : 'https://api.openai.com/v1');
      const model = this.config.model || (this.mode === 'local_direct' ? 'llama3' : 'gpt-4o-mini');
      const apiKey = this.config.apiKey || '';

      const client = this.clientFactory
        ? this.clientFactory({ baseUrl, model, apiKey })
        : new ProviderClient({ baseUrl, model, apiKey, fetchFn: this.fetchFn });

      return await this.planFn(fields, facts, client, context);
    }

    // Modes 1 & 2: Route via Next.js backend proxy
    const baseUrl = (this.backendUrl || '').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/api/extension/autofill/plan`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const payload = {
      fields,
      facts: facts instanceof Map ? Object.fromEntries(facts) : facts,
      context,
      mode: this.mode,
    };

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Autofill planning proxy error (HTTP ${res.status})`);
    }

    return await res.json();
  }

  /**
   * Selects an exact option for combobox widgets.
   */
  async choose(question, options, facts) {
    if (this.mode === 'local_direct' || this.mode === 'extension_byok') {
      const baseUrl = this.config.baseUrl || (this.mode === 'local_direct' ? 'http://localhost:11434' : 'https://api.openai.com/v1');
      const model = this.config.model || (this.mode === 'local_direct' ? 'llama3' : 'gpt-4o-mini');
      const apiKey = this.config.apiKey || '';

      const client = this.clientFactory
        ? this.clientFactory({ baseUrl, model, apiKey })
        : new ProviderClient({ baseUrl, model, apiKey, fetchFn: this.fetchFn });

      return await this.chooseFn(question, options, facts, client);
    }

    const baseUrl = (this.backendUrl || '').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/api/extension/autofill/choose`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const payload = {
      question,
      options,
      facts: facts instanceof Map ? Object.fromEntries(facts) : facts,
      mode: this.mode,
    };

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Autofill choose proxy error (HTTP ${res.status})`);
    }

    return await res.json();
  }
}
