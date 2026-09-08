// disdroc YouTube Music Linker — background service worker.
//
// What this does, in full: when the popup stores a one-time code (pasted from
// disdroc's own web UI) into chrome.storage.local, this listens for the next
// outgoing request to music.youtube.com's internal API and reads that
// request's headers (which is how you're already authenticated to YouTube
// Music — nothing new is captured that the browser wasn't already sending).
// It POSTs those headers, together with the code, to disdroc's own server
// (https://disdroc.com/api/ytmusic/link-with-code) so disdroc can link your
// account the same way pasting them manually into disdroc's UI would. Then it
// immediately clears the stored code so it does not act again until you paste
// a new one. Nothing is logged, and nothing is sent anywhere except that one
// POST to your own disdroc server, and only while a code is armed.
const LINK_ENDPOINT = 'https://disdroc.com/api/ytmusic/link-with-code';

// webRequest's listener callback must decide synchronously whether to act, so
// this in-memory flag mirrors chrome.storage.local's 'pendingCode' (the
// source of truth, since a service worker can be stopped/restarted between
// requests and storage is what survives that).
let pendingCode = null;

chrome.storage.local.get('pendingCode', (r) => { pendingCode = r.pendingCode || null; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'pendingCode' in changes) pendingCode = changes.pendingCode.newValue || null;
});

function setStatus(status) {
  chrome.storage.local.set({ status: { ...status, at: Date.now() } });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!pendingCode) return;
    const code = pendingCode;
    // Consume immediately — one redemption attempt per armed code, whether it
    // succeeds or fails, so this doesn't keep firing on every subsequent
    // music.youtube.com request.
    pendingCode = null;
    chrome.storage.local.remove('pendingCode');

    const headers = {};
    for (const h of details.requestHeaders || []) {
      if (h.name && h.value != null) headers[h.name] = h.value;
    }
    if (!headers.cookie && !headers.Cookie) {
      setStatus({ state: 'failed', message: 'Could not read your session cookie from that request — make sure you are logged into music.youtube.com and try again.' });
      return;
    }

    setStatus({ state: 'linking' });
    fetch(LINK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, headers }),
    })
      .then((r) => r.json().catch(() => ({})).then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (ok && body && body.ok) setStatus({ state: 'linked' });
        else setStatus({ state: 'failed', message: (body && body.message) || 'The server rejected the link attempt.' });
      })
      .catch((e) => setStatus({ state: 'failed', message: e.message || 'Network error reaching disdroc.' }));
  },
  { urls: ['*://music.youtube.com/youtubei/v1/*'] },
  ['requestHeaders', 'extraHeaders']
);
