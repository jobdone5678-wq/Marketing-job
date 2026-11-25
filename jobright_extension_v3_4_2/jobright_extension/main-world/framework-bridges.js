(function () {
  'use strict';

  /**
   * NextKinHR MAIN-World Framework Bridges (modeled on Jobright v1.27.1 Fiber / Custom Picker Bridges).
   * Runs only when injected in MAIN world and communicates over custom DOM events:
   * - react-select-set: finds React Fiber props (selectOption / onChange / onSelect) on React Select containers
   */

  if (window.__nextkinFrameworkBridgeLoaded) return;
  window.__nextkinFrameworkBridgeLoaded = true;

  function findReactProps(el) {
    if (!el || typeof el !== 'object') return null;
    for (const key of Object.keys(el)) {
      if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
        return el[key];
      }
    }
    for (const key of Object.keys(el)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        let fiber = el[key];
        for (let depth = 0; fiber && depth < 12; depth++) {
          const props = fiber.memoizedProps;
          if (props && (typeof props.selectOption === 'function' || typeof props.onChange === 'function' || Array.isArray(props.options))) {
            return props;
          }
          fiber = fiber.return;
        }
      }
    }
    return null;
  }

  function invokeReactSelect(targetEl, desiredValue) {
    if (!targetEl || desiredValue == null) return { ok: false, reason: 'missing_target' };
    const norm = s => String(s || '').trim().toLowerCase();
    const targetNorm = norm(desiredValue);

    let cur = targetEl;
    for (let depth = 0; cur && depth < 6; depth++) {
      const props = findReactProps(cur);
      if (props) {
        const options = Array.isArray(props.options) ? props.options : null;
        if (options && typeof props.onChange === 'function') {
          const matches = options.filter(opt => {
            const label = typeof opt === 'string' ? opt : (opt?.label ?? opt?.name ?? opt?.text ?? opt?.value);
            return norm(label) === targetNorm;
          });
          if (matches.length === 1) {
            const [match] = matches;
            try {
              props.onChange(match, { action: 'select-option', option: match });
              return { ok: true, method: 'react-onChange' };
            } catch {}
          }
        }
      }
      cur = cur.parentElement;
    }
    return { ok: false, reason: 'no_react_handler' };
  }

  window.addEventListener('nextkin:bridge-request', (event) => {
    const detail = event?.detail;
    if (!detail || !detail.requestId) return;
    let result = { ok: false, reason: 'unknown_action' };
    try {
      if (detail.action === 'react-select-set') {
        const el = detail.bridgeAttr
          ? document.querySelector(`[data-nextkin-bridge-target="${CSS.escape(String(detail.bridgeAttr))}"]`)
          : null;
        result = invokeReactSelect(el, detail.valueLabel);
      }
    } catch (err) {
      result = { ok: false, reason: err?.message || 'bridge_error' };
    }
    try {
      window.dispatchEvent(new CustomEvent('nextkin:bridge-response', {
        detail: { requestId: detail.requestId, ...result },
      }));
    } catch {}
  });
})();
