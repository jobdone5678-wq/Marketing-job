// Capture the dashboard link before the employer's router can replace its fragment.
if (window.top !== window) {
  void chrome.runtime.sendMessage({ type: 'embedded-application-document' }).catch(() => {});
} else if (new URLSearchParams(location.hash.slice(1)).has('marketing-intent')) {
  void chrome.runtime.sendMessage({ type: 'application-intent-opened', url: location.href }).catch(() => {});
}
