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
    const rawMode = options.mode || 'server'; // 'server' | 'portal_byok' | 'extension_byok' | 'local_direct' ('local' alias supported)
    this.mode = rawMode === 'local' ? 'local_direct' : rawMode;
    this.config = options.config || {};
    this.backendUrl = options.backendUrl || '';
    this.token = options.token || null;
    this.candidateId = options.candidateId ?? null;
    this.answerBank = options.answerBank ?? undefined;
    this.clientFactory = options.clientFactory || null;
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
    this.planFn = options.planFn || planFormBatch;
    this.chooseFn = options.chooseFn || chooseComboboxOption;
  }

  _isDirectMode() {
    return this.mode === 'local_direct' || this.mode === 'extension_byok';
  }

  /**
   * Normalizes either a legacy Map<string, VerifiedFact> or a payload object
   * { facts?, candidateId?, answerBank? } into a uniform structure.
   */
  _unpackInput(factsOrPayload) {
    if (factsOrPayload instanceof Map) {
      return {
        facts: factsOrPayload,
        candidateId: this.candidateId,
        answerBank: this.answerBank,
      };
    }

    return {
      facts: factsOrPayload?.facts instanceof Map ? factsOrPayload.facts : new Map(),
      candidateId: factsOrPayload?.candidateId ?? this.candidateId,
      answerBank: factsOrPayload?.answerBank ?? this.answerBank,
    };
  }

  _createDirectClient() {
    const isLocal = this.mode === 'local_direct';
    const baseUrl = this.config.baseUrl || (isLocal ? 'http://localhost:11434' : 'https://api.openai.com/v1');
    const model = this.config.model || (isLocal ? 'llama3' : 'gpt-4o-mini');
    const apiKey = this.config.apiKey || '';

    return this.clientFactory
      ? this.clientFactory({ baseUrl, model, apiKey })
      : new ProviderClient({ baseUrl, model, apiKey, fetchFn: this.fetchFn });
  }

  async _postProxy(path, payload, errorLabel) {
    const baseUrl = (this.backendUrl || '').replace(/\/+$/, '');
    const endpoint = `${baseUrl}${path}`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `${errorLabel} (HTTP ${res.status})`);
    }

    return await res.json();
  }

  /**
   * Plans form fields using the active routing mode.
   */
  async plan(fields, factsOrPayload, context = {}) {
    const { facts, candidateId, answerBank } = this._unpackInput(factsOrPayload);

    if (this._isDirectMode()) {
      const client = this._createDirectClient();
      return await this.planFn(fields, facts, client, context);
    }

    // Modes 1 & 2: Route via Next.js backend proxy (PlanApiRequest)
    return await this._postProxy(
      '/api/extension/autofill/plan',
      { candidateId, fields, context, answerBank },
      'Autofill planning proxy error',
    );
  }

  /**
   * Selects an exact option for combobox widgets.
   */
  async choose(question, options, factsOrPayload, context = {}) {
    const { facts, candidateId, answerBank } = this._unpackInput(factsOrPayload);

    if (this._isDirectMode()) {
      const client = this._createDirectClient();
      return await this.chooseFn(question, options, facts, client);
    }

    // Modes 1 & 2: Route via Next.js backend proxy (ChooseApiRequest)
    return await this._postProxy(
      '/api/extension/autofill/choose',
      { candidateId, question, options, context, answerBank },
      'Autofill choose proxy error',
    );
  }

  /**
   * Generates open-ended prose directly in the browser for Stage B fields
   * in extension_byok and local_direct modes.
   */
  async generateTextAnswer(systemPrompt, userPrompt, options = {}) {
    if (!this._isDirectMode()) {
      throw new Error(
        `generateTextAnswer is only supported in extension_byok or local_direct modes (current mode: ${this.mode})`,
      );
    }

    const client = this._createDirectClient();
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt || '' });

    const completion = await client.generateChatCompletion(messages, {
      responseFormat: 'text',
      maxTokens: options.maxTokens ?? 1500,
      temperature: options.temperature ?? 0.7,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    const rawText = typeof completion?.text === 'string' ? completion.text.trim() : '';
    const answer = rawText.replace(/^["']|["']$/g, '').trim();
    if (!answer) {
      throw new Error('AI provider returned an empty response.');
    }

    return { ok: true, answer };
  }
}
