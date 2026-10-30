# disdroc — client source

[github.com/nadirisim/disdroc](https://github.com/nadirisim/disdroc) — this is
the client source for [disdroc](https://disdroc.com), a free chat platform
(servers, channels, DMs, voice/video, a local AI assistant) built and run by
**nadirisim** — a solo project, not a company. See
[disdroc.com/who-we-are](https://disdroc.com/who-we-are) for the full story.

## What's in this repo

Everything that actually ships to a browser, the desktop app, or the Android
app — the code that talks to disdroc.com and renders the UI:

- `public/` — the website and web app: HTML pages, CSS, and client-side JS
  (`public/js/`). No build step required to read it — it's what your browser
  already downloads when you open disdroc.com.
- `desktop/` — the Electron wrapper used to build the Windows/Linux desktop
  app (a thin shell that loads the live web app).
- `browser-extension/` — a small companion browser extension.
- `scripts/` — the asset build tooling (minification) used before a deploy.

## What's *not* in this repo, on purpose

The server that runs the live service is not published. Specifically kept
closed:

- Authentication, session handling, and 2FA (`server/auth.js`, `totp.js`)
- Anti-abuse, moderation, and NSFW-detection internals (`server/moderation*.js`,
  `server/nsfw*.js`, `server/policy.js`)
- Rate-limiting and account-security logic (`server/security.js`)
- The sandboxed community-bot-hosting runner
- The admin panel (ban tools, moderation actions)

Publishing the exact detection thresholds, auth flows, or sandbox internals
wouldn't help anyone *use* disdroc — it would mainly help someone break in or
dodge the safety filters, and the live service (and its real users) would pay
for that. The rest of the server's shape — routes, data model, the Bot API —
is documented separately for anyone building on top of disdroc: see
[disdroc.com/bot-docs](https://disdroc.com/bot-docs) and
[disdroc.com/developers](https://disdroc.com/developers).

No account data (messages, files, the user database) is or was ever part of
this repo either way.

## You can't host disdroc yourself

disdroc is one service, and it runs only at [disdroc.com](https://disdroc.com).
There is no self-hosted version, no federation, and no way to connect your own
server to disdroc. A "server" inside disdroc is a community you create in the
app, not a machine you run.

This repo is not a server. `public/` needs disdroc's private backend, which
serves the `/api/*` routes the client calls. No server or local dev setup is
included. The repo is here to be read, audited and, if something is broken,
patched with a pull request.

## Contributing

Bug reports and pull requests against the client (UI, accessibility, i18n,
front-end bugs) are welcome. Please don't open issues asking for the private
server code, auth internals, or moderation thresholds — see above for why
those stay closed.

## License

[GNU AGPL-3.0](./LICENSE). The license covers this client code only. It does
not give access to the disdroc service, its servers or its accounts.

---

disdroc — built by [nadirisim](https://github.com/nadirisim). Community: [r/disdrocapp](https://www.reddit.com/r/disdrocapp/).
