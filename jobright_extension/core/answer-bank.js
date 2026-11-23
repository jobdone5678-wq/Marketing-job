(function(root) {
  'use strict';

  function normalizeQuestion(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const SENSITIVE_PATTERNS = [
    /\b(consent|agree|terms|privacy|policy|arbitration|acknowledg\w*|certify|declare|confirm|signature|sign\s+here)\b/i,
    /\b(race|ethnicity|hispanic|latino|gender|sex|veteran|disability|handicap)\b/i,
    /\b(ssn|social\s+security|background\s+check|drug\s+screen)\b/i
  ];

  function isSensitiveQuestion(question) {
    if (!question || typeof question !== 'string') return false;
    return SENSITIVE_PATTERNS.some(re => re.test(question));
  }

  function matchAnswer(field, answers, companySlug = null) {
    if (!field || !Array.isArray(answers) || answers.length === 0) return null;

    const rawQuestion = field.label || field.name || field.hint || '';
    if (isSensitiveQuestion(rawQuestion)) return null;

    const normQ = normalizeQuestion(rawQuestion);
    if (!normQ) return null;

    const normalizedSlug = companySlug ? String(companySlug).toLowerCase().trim() : null;

    // Filter out any sensitive stored entries
    const safeAnswers = answers.filter(a => !isSensitiveQuestion(a.question) && !isSensitiveQuestion(a.question_normalized));

    // 1. Look for company-scoped match
    let matched = null;
    if (normalizedSlug) {
      matched = safeAnswers.find(a => {
        const aScope = a.company_scope ? String(a.company_scope).toLowerCase().trim() : null;
        return aScope === normalizedSlug && (a.question_normalized === normQ || normalizeQuestion(a.question) === normQ);
      });
    }

    // 2. If no company match, look for universal match (company_scope is null/undefined/'')
    if (!matched) {
      matched = safeAnswers.find(a => {
        const aScope = a.company_scope ? String(a.company_scope).toLowerCase().trim() : null;
        return !aScope && (a.question_normalized === normQ || normalizeQuestion(a.question) === normQ);
      });
    }

    if (!matched) return null;
    const ans = matched.answer !== undefined ? matched.answer : matched.answer_text;
    if (ans === undefined || ans === null) return null;

    // Validate options if field is choice/select
    if (Array.isArray(field.options) && field.options.length > 0) {
      const matchOpt = field.options.find(opt => {
        const optText = String(opt.label || opt.text || opt.value || '').trim().toLowerCase();
        const ansText = String(ans).trim().toLowerCase();
        return optText === ansText || opt.value === ans;
      });
      if (!matchOpt) return null;
    }

    return {
      answer: ans,
      entry: matched,
      source: 'answer_bank',
      companyScope: matched.company_scope || null
    };
  }

  class AnswerBankClient {
    constructor(options = {}) {
      this.storage = options.storage || (typeof chrome !== 'undefined' && chrome.storage?.local) || null;
      this.api = options.api || null;
      this.cacheKey = options.cacheKey || 'nextkin_answer_bank_cache';
    }

    async getAnswers(companySlug = null, forceSync = false) {
      let cached = [];
      if (this.storage) {
        try {
          const res = await this.storage.get(this.cacheKey);
          if (Array.isArray(res[this.cacheKey])) {
            cached = res[this.cacheKey];
          }
        } catch {
          // ignore storage read error
        }
      }

      if ((cached.length === 0 || forceSync) && typeof this.api === 'function') {
        try {
          const query = companySlug ? `?companyScope=${encodeURIComponent(companySlug)}` : '';
          const res = await this.api(`answer-bank${query}`, { method: 'GET' });
          if (res && Array.isArray(res.answers)) {
            cached = res.answers;
            if (this.storage) {
              await this.storage.set({ [this.cacheKey]: cached }).catch(() => {});
            }
          }
        } catch {
          // fall back to cached
        }
      }

      return cached;
    }

    async saveAnswer({ question, answer, companyScope = null, candidateId = null }) {
      if (isSensitiveQuestion(question)) {
        return { error: 'Sensitive disclosure cannot be saved to Answer Bank' };
      }

      const payload = {
        question: String(question).trim(),
        answer: String(answer).trim(),
        companyScope: companyScope ? String(companyScope).toLowerCase().trim() : null,
        candidateId
      };

      let apiSaved = null;
      if (typeof this.api === 'function') {
        try {
          const res = await this.api('answer-bank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          apiSaved = res?.answer || payload;
        } catch (err) {
          return { error: err.message };
        }
      } else {
        apiSaved = { ...payload, id: 'local_' + Date.now(), question_normalized: normalizeQuestion(payload.question) };
      }

      // Update local storage cache
      if (this.storage) {
        try {
          const res = await this.storage.get(this.cacheKey);
          let list = Array.isArray(res[this.cacheKey]) ? res[this.cacheKey] : [];
          const normQ = normalizeQuestion(payload.question);
          list = list.filter(item => {
            const sameQ = (item.question_normalized === normQ || normalizeQuestion(item.question) === normQ);
            const itemScope = item.company_scope ? String(item.company_scope).toLowerCase().trim() : null;
            const sameScope = itemScope === payload.companyScope;
            return !(sameQ && sameScope);
          });
          list.unshift(apiSaved);
          await this.storage.set({ [this.cacheKey]: list });
        } catch {
          // ignore cache error
        }
      }

      return apiSaved;
    }

    async removeAnswer(id) {
      if (!id) return;
      if (typeof this.api === 'function') {
        try {
          await this.api(`answer-bank?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch {
          // ignore
        }
      }
      if (this.storage) {
        try {
          const res = await this.storage.get(this.cacheKey);
          if (Array.isArray(res[this.cacheKey])) {
            const filtered = res[this.cacheKey].filter(a => a.id !== id);
            await this.storage.set({ [this.cacheKey]: filtered });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  const NextkinAnswerBank = {
    normalizeQuestion,
    isSensitiveQuestion,
    matchAnswer,
    AnswerBankClient
  };

  root.NextkinAnswerBank = NextkinAnswerBank;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NextkinAnswerBank;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
