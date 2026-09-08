const codeInput = document.getElementById('code');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

function render(status, pendingCode) {
  statusEl.className = '';
  if (pendingCode && (!status || status.state !== 'linked')) {
    statusEl.textContent = 'Armed — waiting for music.youtube.com activity…';
    statusEl.className = 'show armed';
    return;
  }
  if (!status) { statusEl.className = ''; return; }
  if (status.state === 'linking') {
    statusEl.textContent = 'Linking…';
    statusEl.className = 'show linking';
  } else if (status.state === 'linked') {
    statusEl.textContent = '✓ Linked! You can close this popup.';
    statusEl.className = 'show linked';
  } else if (status.state === 'failed') {
    statusEl.textContent = status.message || 'Linking failed.';
    statusEl.className = 'show failed';
  }
}

function refresh() {
  chrome.storage.local.get(['status', 'pendingCode'], (r) => render(r.status, r.pendingCode));
}

saveBtn.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  chrome.storage.local.set({ pendingCode: code, status: null }, () => {
    codeInput.value = '';
    refresh();
  });
});

codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') refresh(); });

refresh();
