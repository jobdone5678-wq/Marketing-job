const connectedCard = document.getElementById('connected-card');
const disconnectedCard = document.getElementById('disconnected-card');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const portalUrlEl = document.getElementById('portal-url');
const candidateCountEl = document.getElementById('candidate-count');
const originInput = document.getElementById('origin-input');
const codeInput = document.getElementById('code-input');
const toastEl = document.getElementById('toast');
const manualToggle = document.getElementById('toggle-manual');
const manualSection = document.getElementById('manual-section');

function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.style.color = isError ? '#f87171' : '#34d399';
  setTimeout(() => {
    toastEl.textContent = '';
  }, 5000);
}

async function renderState() {
  const data = await chrome.storage.local.get(['origin', 'token', 'user', 'candidates']);
  if (data.token && data.user) {
    connectedCard.style.display = 'block';
    disconnectedCard.style.display = 'none';
    userNameEl.textContent = data.user.name || data.user.email;
    userEmailEl.textContent = data.user.email;
    portalUrlEl.textContent = data.origin || 'http://localhost:3000';
    candidateCountEl.textContent = String((data.candidates || []).length);
  } else {
    connectedCard.style.display = 'none';
    disconnectedCard.style.display = 'block';
    if (data.origin) {
      originInput.value = data.origin;
    } else {
      // Auto-detect if user has the portal open in active tab
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) {
          const u = new URL(activeTab.url);
          if (u.protocol.startsWith('http') && (u.pathname.includes('dashboard') || u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
            originInput.value = u.origin;
          }
        }
      } catch {}
    }
  }
}

// 1-Click Auto Connect (Directly queries portal and uses active cookies)
document.getElementById('btn-auto-connect').addEventListener('click', async () => {
  const origin = (originInput.value.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  showToast('Connecting to ' + origin + '...');

  try {
    // 1. Collect cookies for the portal origin
    let cookiesList = [];
    try {
      const foundCookies = await chrome.cookies.getAll({ url: origin });
      cookiesList = (foundCookies || []).map(c => ({ name: c.name, value: c.value }));
    } catch (cookieErr) {
      console.warn('Could not read cookies via chrome.cookies:', cookieErr);
    }

    // 2. Call quick-pair endpoint
    const response = await fetch(origin + '/api/extension/quick-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cookies: cookiesList })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to connect. Please sign in to the portal at ' + origin + ' first.');
    }

    // 3. Save connection state locally
    await chrome.storage.local.set({
      origin,
      token: data.token,
      credentialId: data.credentialId,
      user: data.user
    });

    // 4. Pre-fetch bench candidates
    try {
      const cRes = await fetch(origin + '/api/extension/candidates', {
        headers: { Authorization: 'Bearer ' + data.token }
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        await chrome.storage.local.set({ candidates: cData.candidates || [] });
      }
    } catch (_) {}

    showToast('Connected as ' + (data.user.name || data.user.email) + '!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Refresh Candidates
document.getElementById('btn-sync-candidates').addEventListener('click', async () => {
  showToast('Refreshing bench candidates...');
  try {
    const { origin = 'http://localhost:3000', token } = await chrome.storage.local.get(['origin', 'token']);
    if (!token) throw new Error('Not connected to portal.');

    const res = await fetch(origin + '/api/extension/candidates', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch candidates.');

    await chrome.storage.local.set({ candidates: data.candidates || [] });
    showToast('Synced ' + (data.candidates || []).length + ' candidates!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Open Submissions
document.getElementById('btn-open-portal').addEventListener('click', async () => {
  const { origin = 'http://localhost:3000' } = await chrome.storage.local.get('origin');
  chrome.tabs.create({ url: origin + '/dashboard/submissions' });
});

// Disconnect
document.getElementById('btn-disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'credentialId', 'user', 'candidates', 'outbox']);
  showToast('Disconnected locally.');
  await renderState();
});

// Manual Pairing Section Toggle
manualToggle.addEventListener('click', () => {
  const current = manualSection.style.display;
  manualSection.style.display = current === 'block' ? 'none' : 'block';
});

// Manual Pairing with 5-minute code
document.getElementById('btn-manual-pair').addEventListener('click', async () => {
  const origin = (originInput.value.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  const code = codeInput.value.trim();
  if (!code) {
    showToast('Please enter the pairing code from the portal.', true);
    return;
  }
  showToast('Pairing with code...');
  try {
    const r = await fetch(origin + '/api/extension/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Pairing failed');
    await chrome.storage.local.set({
      origin,
      token: data.token,
      credentialId: data.credentialId
    });
    codeInput.value = '';
    // Pre-fetch profile & candidates
    try {
      const cRes = await fetch(origin + '/api/extension/candidates', {
        headers: { Authorization: 'Bearer ' + data.token }
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        await chrome.storage.local.set({ candidates: cData.candidates || [] });
      }
    } catch (_) {}

    showToast('Pairing successful!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Initial render
void renderState();