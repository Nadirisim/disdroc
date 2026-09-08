disdroc YouTube Music Linker
=============================

What this is
-------------
A small Chrome extension that links your real YouTube Music account to your
disdroc server without you having to manually copy request headers out of
DevTools.

How it works
------------
1. In disdroc, open the "YouTube Music" activity in a call and click
   "Get a linking code". Disdroc shows you a short code, valid for 5 minutes.
2. Click this extension's toolbar icon, paste the code in, and click
   "Link account".
3. Open (or switch to) music.youtube.com and make sure you're logged in.
   The moment the extension sees an authenticated request to
   music.youtube.com, it reads that request's headers (the same headers your
   browser is already sending — nothing new is captured) and sends them,
   together with your code, to https://disdroc.com/api/ytmusic/link-with-code
   — the exact same endpoint the manual copy-paste flow uses.
4. The code is single-use and is cleared immediately after one attempt,
   whether it succeeds or fails. The extension does nothing at all unless
   you've just armed it with a fresh code from disdroc's own page.

What it can see and where data goes
------------------------------------
- It only reads headers from requests to music.youtube.com's own API
  (music.youtube.com/youtubei/v1/*).
- It only ever sends data to https://disdroc.com — nowhere else.
- It doesn't log or store the captured headers anywhere; they exist only for
  the single outgoing request that links your account.
- It does nothing unless you've explicitly armed it with a code from
  disdroc's own UI.

Installing (not published to the Chrome Web Store)
----------------------------------------------------
This is a small self-hosted-app companion tool, not a public product, so
it isn't going through the Chrome Web Store review process. Install it as an
"unpacked" extension instead:

1. Unzip disdroc-ytmusic-linker.zip somewhere permanent (don't delete the
   folder after installing — Chrome loads the extension directly from it).
2. Open chrome://extensions in Chrome (or any Chromium-based browser: Edge,
   Brave, etc.).
3. Turn on "Developer mode" (top-right toggle).
4. Click "Load unpacked" and select the unzipped disdroc-ytmusic-linker
   folder.
5. The disdroc music-note icon should now appear in your toolbar.

Uninstalling
------------
chrome://extensions → find "disdroc YouTube Music Linker" → Remove.
