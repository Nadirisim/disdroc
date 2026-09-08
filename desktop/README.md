# disdroc desktop client

Thin Electron wrapper that loads `https://disdroc.online/app`.

## Build

```
npm install
npm run build:win     # produces a portable .exe
npm run build:mac     # produces a .dmg (mac host required)
npm run build:linux   # produces an AppImage
```

Drop the resulting binaries into `../public/downloads/` so the website's download page can serve them.
