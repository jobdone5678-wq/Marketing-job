// Capture the dashboard link before the employer's router can replace its fragment.
(function () {
  try {
    if (window.top !== window) {
      void chrome.runtime.sendMessage({ type: 'embedded-application-document' }).catch(() => {});
    } else {
      const hashParams = new URLSearchParams((location.hash || '').slice(1));
      const preserved = globalThis.NextkinRuntimeGate?.getPreservedIntent?.();
      const marketingIntent = hashParams.get('marketing-intent') || preserved?.marketingIntent;
      if (marketingIntent) {
        let intentUrl = location.href;
        if (!hashParams.has('marketing-intent') && preserved?.marketingIntent) {
          try {
            const reconstructed = new URL(location.href);
            const h = new URLSearchParams(reconstructed.hash.slice(1));
            h.set('marketing-intent', preserved.marketingIntent);
            reconstructed.hash = h.toString();
            intentUrl = reconstructed.href;
          } catch {}
        }
        void chrome.runtime.sendMessage({ type: 'application-intent-opened', url: intentUrl }).catch(() => {});
      }
    }
  } catch {}
})();
