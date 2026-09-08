const TOKEN_KEY = 'disdroc_token';
const REFRESH_KEY = 'disdroc_refresh';
const isDesktop = navigator.userAgent.includes('Electron') || navigator.userAgent.includes('disdroc-desktop');
// Voice/video works in any secure-context browser with WebRTC (no longer desktop-only).
function voiceSupported() {
  return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (window.isSecureContext !== false));
}

const state = {
  me: null,
  view: 'home',          // 'home' | 'server'
  serverId: null,        // when view = server
  servers: [],
  serverFolders: [],
  serverDetail: null,    // { server, channels, members, role }
  chats: [],
  friends: [],
  generalId: null,
  activeChatId: null,
  activeChatType: null,
  socket: null,
  pendingAttachments: [],
  replyTo: null,
  replyPing: true, // whether the pending reply pings its author (sticky pref below)
  online: new Set(),
  activities: new Map(), // userId -> { name, since }
  voice: {
    channelId: null, channelName: null, peers: new Map(),
    localStream: null, localVideoStream: null, screenStream: null,
    screenFps: 30, // requested fps for the active share; sender tuning reads this
    ytmusicSession: null,
    micRawStream: null, // the untouched getUserMedia stream; localStream is the VoiceFX output
    muted: false, deafened: false, speaking: false, noMic: false,
    dock: null, // open in-call panel: 'fx' | 'sound' | 'screen' | 'activity' | 'people' | null
    micDeviceId: localStorage.getItem('disdroc_mic') || null,
    camDeviceId: localStorage.getItem('disdroc_cam') || null,
    outDeviceId: localStorage.getItem('disdroc_out') || null,
    analyser: null, audioCtx: null, levelTimer: null, statsTimer: null,
    stageOpen: false, focusKey: null,
    speakerOn: true, camFacing: 'user',
    watchSession: null, // shared YouTube Watch Together session (server-authoritative)
    wbSession: null, // shared whiteboard session (Activities; server-authoritative)
    gameSession: null, // embedded multiplayer game (Activities; shared room URL)
  },
  unread: new Map(),
  lastChatDate: null,
  blockedIds: new Set(),
  myEmojiGroups: [], // [{server:{id,name,icon_path}, emojis:[{id,name,stored_path}]}] — every custom emoji across all servers I'm in
  myEmojis: [],       // flattened view of myEmojiGroups, for name → path lookups
  voiceRooms: new Map(),
  voiceRingers: new Map(), // chatId -> [user objects] currently being rung in an active DM/group call
  rightPanelOpen: true,
  pinnedIds: new Set(),
  pinBarCollapsed: false,
  activeUploads: [],
  savedIds: new Set(),
  view_saved: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'on' && typeof v === 'object') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset' && typeof v === 'object') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
};
const escape = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ─── Icon set (inline SVG, Lucide-style, themed via currentColor) ─────────────
const ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'circle-plus': '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'layout-grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  gif: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9.5a2.5 2.5 0 1 0 0 5h1.5v-2.5"/><line x1="13.5" y1="9.5" x2="13.5" y2="14.5"/><path d="M16.5 14.5v-5H19"/><line x1="16.5" y1="12" x2="18.5" y2="12"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
  'mic-off': '<line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/>',
  headphones: '<path d="M3 14h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2"/>',
  'headphones-off': '<path d="M3 14h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 14.5-7.1"/><path d="M21 14v5a1 1 0 0 1-1 1h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2"/><line x1="2" y1="2" x2="22" y2="22"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
  pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'phone-off': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="3" y1="3" x2="21" y2="21"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'switch-camera': '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/>',
  'volume-x': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  chalk: '<path d="M15 4 20 9 9 20H4v-5Z"/>',
  spray: '<rect x="7" y="9" width="6" height="12" rx="1.5"/><path d="M9 9V6a1 1 0 0 1 1-1 1 1 0 0 1 1 1v3"/><circle cx="17" cy="6" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="16" cy="11" r="1"/>',
  paintbrush: '<path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 2-3 5-3 5l3 3s3-1 5-3"/><path d="M14.5 17.5 4.5 21l3.5-10"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  orbit: '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'shield-off': '<path d="M19.7 14a6.9 6.9 0 0 0 .3-2V5l-8-3-3.2 1.2"/><path d="M4.7 4.7 4 5v7c0 6 8 10 8 10a12.2 12.2 0 0 0 5.2-3.4"/><line x1="2" y1="2" x2="22" y2="22"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'bell-off': '<path d="M8.7 3A6 6 0 0 1 18 8c0 .7 0 1.3.1 1.9"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" y1="2" x2="22" y2="22"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  accessibility: '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>',
  gamepad: '<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 5-4-5-4 5-6-5z"/><path d="M5 20h14"/>',
  'corner-up-left': '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  forward: '<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  'bookmark-check': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9 10 2 2 4-4"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  play: '<polygon fill="currentColor" stroke="none" points="5 3 19 12 5 21 5 3"/>',
  pause: '<rect fill="currentColor" stroke="none" x="6" y="4" width="4" height="16"/><rect fill="currentColor" stroke="none" x="14" y="4" width="4" height="16"/>',
  // Official Spotify logo (filled, not stroked — per brand guidelines: unmodified, green or monochrome only)
  spotify: '<path fill="currentColor" stroke="none" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
};
function icon(name, size = 20) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-${name}">${ICONS[name] || ''}</svg>`;
  return wrap.firstChild;
}

function highlightCode(code, lang) {
  if (window.hljs) {
    try {
      const r = lang && window.hljs.getLanguage(lang)
        ? window.hljs.highlight(code, { language: lang, ignoreIllegals: true })
        : window.hljs.highlightAuto(code);
      return r.value;
    } catch { return escape(code); }
  }
  return escape(code);
}

// Common :shortcode: → emoji map (curated subset, like Discord's).
const SHORTCODE_EMOJI = {
  smile:'😄',smiley:'😃',grin:'😁',laughing:'😆',sweat_smile:'😅',joy:'😂',rofl:'🤣',wink:'😉',blush:'😊',slight_smile:'🙂',upside_down:'🙃',
  heart_eyes:'😍',kissing_heart:'😘',yum:'😋',stuck_out_tongue:'😛',sunglasses:'😎',nerd:'🤓',thinking:'🤔',neutral_face:'😐',no_mouth:'😶',
  smirk:'😏',unamused:'😒',roll_eyes:'🙄',grimacing:'😬',relieved:'😌',pensive:'😔',sleepy:'😪',sleeping:'😴',mask:'😷',
  cry:'😢',sob:'😭',scream:'😱',angry:'😠',rage:'😡',triumph:'😤',disappointed:'😞',confused:'😕',worried:'😟',fearful:'😨',weary:'😩',
  tired_face:'😫',flushed:'😳',dizzy_face:'😵',pleading:'🥺',cowboy:'🤠',party:'🥳',melting:'🫠',salute:'🫡',
  imp:'👿',smiling_imp:'😈',skull:'💀',poop:'💩',hankey:'💩',clown:'🤡',ghost:'👻',alien:'👽',robot:'🤖',
  heart:'❤️',orange_heart:'🧡',yellow_heart:'💛',green_heart:'💚',blue_heart:'💙',purple_heart:'💜',black_heart:'🖤',broken_heart:'💔',two_hearts:'💕',sparkling_heart:'💖',
  thumbsup:'👍','+1':'👍',thumbsdown:'👎','-1':'👎',ok_hand:'👌',punch:'👊',fist:'✊',v:'✌️',wave:'👋',raised_hands:'🙌',clap:'👏',pray:'🙏',muscle:'💪',
  point_up:'☝️',point_down:'👇',point_left:'👈',point_right:'👉',handshake:'🤝',
  fire:'🔥',sparkles:'✨',star:'⭐',star2:'🌟',boom:'💥',zap:'⚡',tada:'🎉',confetti_ball:'🎊',balloon:'🎈',gift:'🎁','100':'💯',
  eyes:'👀',eye:'👁️',brain:'🧠',tongue:'👅',ear:'👂',
  white_check_mark:'✅',heavy_check_mark:'✔️',x:'❌',warning:'⚠️',question:'❓',exclamation:'❗',no_entry:'⛔',recycle:'♻️',
  rocket:'🚀',hourglass:'⌛',alarm_clock:'⏰',moneybag:'💰',gem:'💎',crown:'👑',trophy:'🏆',medal:'🏅',bulb:'💡',lock:'🔒',key:'🔑',bell:'🔔',
  pizza:'🍕',hamburger:'🍔',fries:'🍟',coffee:'☕',beer:'🍺',beers:'🍻',cake:'🎂',cookie:'🍪',doughnut:'🍩',taco:'🌮',
  dog:'🐶',cat:'🐱',fox:'🦊',bear:'🐻',panda:'🐼',lion:'🦁',tiger:'🐯',unicorn:'🦄',monkey:'🐵',pig:'🐷',frog:'🐸',penguin:'🐧',
  soccer:'⚽',basketball:'🏀',football:'🏈',video_game:'🎮',musical_note:'🎵',notes:'🎶',headphones:'🎧',microphone:'🎤',
  sunny:'☀️',cloud:'☁️',rainbow:'🌈',snowflake:'❄️',zzz:'💤',dash:'💨',sweat_drops:'💦',
  wave_hand:'👋',ok:'🆗',new:'🆕',cool:'🆒',free:'🆓',up:'🆙',
};

// Larger categorized set powering the searchable emoji picker. [char, keywords]
const EMOJI_CATEGORIES = [
  { name: 'Smileys & Emotion', emojis: [
    ['😀','grin happy'],['😃','smiley happy'],['😄','smile happy'],['😁','beaming grin'],['😆','laughing'],['😅','sweat smile'],['🤣','rofl'],['😂','joy lol cry laugh'],['🙂','slight smile'],['🙃','upside down'],['😉','wink'],['😊','blush'],['😇','innocent halo'],
    ['🥰','smiling hearts love'],['😍','heart eyes love'],['🤩','star struck'],['😘','kiss'],['😗','kissing'],['🥲','tear smile'],['😋','yum tasty'],['😛','tongue'],['😜','wink tongue'],['🤪','zany'],['😝','squint tongue'],['🤑','money mouth'],
    ['🤗','hug'],['🤭','hand over mouth'],['🤫','shush quiet'],['🤔','thinking'],['🤐','zipper'],['🤨','raised eyebrow'],['😐','neutral'],['😑','expressionless'],['😶','no mouth'],['😏','smirk'],['😒','unamused'],['🙄','roll eyes'],['😬','grimace'],['🤥','lying'],
    ['😌','relieved'],['😔','pensive sad'],['😪','sleepy'],['🤤','drool'],['😴','sleeping zzz'],['😷','mask sick'],['🤒','sick thermometer'],['🤕','hurt bandage'],['🤢','nauseated'],['🤮','vomit'],['🤧','sneeze'],['🥵','hot heat'],['🥶','cold freezing'],['🥴','woozy'],['😵','dizzy'],['🤯','mind blown'],
    ['🤠','cowboy'],['🥳','party celebrate'],['😎','sunglasses cool'],['🤓','nerd'],['🧐','monocle'],['😕','confused'],['😟','worried'],['🙁','frown'],['😮','wow open mouth'],['😯','hushed'],['😲','astonished'],['😳','flushed'],['🥺','pleading puppy'],['😨','fearful'],['😰','anxious'],['😢','cry'],['😭','sob cry'],['😱','scream fear'],['😖','confounded'],['😣','persevere'],['😞','disappointed'],['😓','sweat'],['😩','weary'],['😫','tired'],['🥱','yawn'],
    ['😤','triumph huff'],['😡','rage angry'],['😠','angry'],['🤬','cursing swear'],['😈','devil smiling'],['👿','imp devil'],['💀','skull dead'],['☠️','skull crossbones'],['💩','poop'],['🤡','clown'],['👹','ogre'],['👻','ghost'],['👽','alien'],['👾','space invader'],['🤖','robot'],
  ]},
  { name: 'Gestures & People', emojis: [
    ['👋','wave hi bye'],['🤚','raised hand'],['✋','hand stop'],['🖐️','hand fingers'],['🖖','vulcan spock'],['👌','ok'],['🤌','pinched'],['🤏','pinch small'],['✌️','victory peace'],['🤞','crossed fingers luck'],['🤟','love you'],['🤘','rock horns'],['🤙','call me'],
    ['👈','point left'],['👉','point right'],['👆','point up'],['👇','point down'],['☝️','index up'],['👍','thumbs up yes like +1'],['👎','thumbs down no dislike -1'],['✊','fist'],['👊','punch fist bump'],['🤛','left fist'],['🤜','right fist'],['👏','clap'],['🙌','raised hands praise'],['👐','open hands'],['🤲','palms'],['🤝','handshake deal'],['🙏','pray thanks please'],
    ['💪','muscle strong flex'],['🫶','heart hands'],['🫡','salute'],['🫠','melting'],['🫢','gasp'],['👀','eyes look'],['👁️','eye'],['🧠','brain'],['👅','tongue'],['👄','lips'],['🦷','tooth'],
    ['👶','baby'],['🧒','child'],['🧑','person'],['👨','man'],['👩','woman'],['🧓','old'],['👮','police'],['🕵️','detective spy'],['👷','worker'],['🤴','prince'],['👸','princess'],['🦸','superhero'],['🦹','supervillain'],['🎅','santa'],['🧙','wizard mage'],['🧚','fairy'],['🧛','vampire'],['🧟','zombie'],['💃','dancer'],['🕺','dancing man'],['🧗','climber'],['🏃','run'],['🚶','walk'],
  ]},
  { name: 'Animals & Nature', emojis: [
    ['🐶','dog puppy'],['🐱','cat'],['🐭','mouse'],['🐹','hamster'],['🐰','rabbit bunny'],['🦊','fox'],['🐻','bear'],['🐼','panda'],['🐨','koala'],['🐯','tiger'],['🦁','lion'],['🐮','cow'],['🐷','pig'],['🐸','frog'],['🐵','monkey'],['🙈','see no evil'],['🙉','hear no evil'],['🙊','speak no evil'],
    ['🐔','chicken'],['🐧','penguin'],['🐦','bird'],['🦆','duck'],['🦅','eagle'],['🦉','owl'],['🦇','bat'],['🐺','wolf'],['🐴','horse'],['🦄','unicorn'],['🐝','bee'],['🐛','bug'],['🦋','butterfly'],['🐌','snail'],['🐞','ladybug'],['🐜','ant'],['🕷️','spider'],
    ['🐢','turtle'],['🐍','snake'],['🦖','t-rex dino'],['🐙','octopus'],['🦑','squid'],['🦐','shrimp'],['🦀','crab'],['🐠','fish tropical'],['🐬','dolphin'],['🐳','whale'],['🦈','shark'],['🐊','crocodile'],['🦓','zebra'],['🦍','gorilla'],['🐘','elephant'],['🦒','giraffe'],
    ['🌵','cactus'],['🎄','christmas tree'],['🌴','palm tree'],['🌱','seedling'],['🌿','herb'],['🍀','four leaf clover luck'],['🍁','maple leaf'],['🍄','mushroom'],['💐','bouquet'],['🌷','tulip'],['🌹','rose'],['🌺','hibiscus'],['🌻','sunflower'],['🌸','cherry blossom sakura'],['🌍','earth globe'],['🌙','moon'],['⭐','star'],['🌟','glowing star'],['✨','sparkles'],['⚡','zap lightning'],['🔥','fire lit'],['🌈','rainbow'],['☀️','sun sunny'],['☁️','cloud'],['🌧️','rain'],['⛈️','storm'],['❄️','snowflake'],['☃️','snowman'],['💧','droplet'],['🌊','wave ocean'],
  ]},
  { name: 'Food & Drink', emojis: [
    ['🍎','apple'],['🍐','pear'],['🍊','orange'],['🍋','lemon'],['🍌','banana'],['🍉','watermelon'],['🍇','grapes'],['🍓','strawberry'],['🫐','blueberries'],['🍒','cherries'],['🍑','peach'],['🥭','mango'],['🍍','pineapple'],['🥥','coconut'],['🥝','kiwi'],['🍅','tomato'],['🥑','avocado'],
    ['🍆','eggplant'],['🥔','potato'],['🥕','carrot'],['🌽','corn'],['🌶️','pepper spicy'],['🥒','cucumber'],['🥦','broccoli'],['🧄','garlic'],['🧅','onion'],['🥜','peanuts'],['🍞','bread'],['🥐','croissant'],['🥨','pretzel'],['🧀','cheese'],['🥚','egg'],['🍳','fried egg'],['🥞','pancakes'],['🧇','waffle'],['🥓','bacon'],
    ['🍔','burger hamburger'],['🍟','fries'],['🍕','pizza'],['🌭','hot dog'],['🥪','sandwich'],['🌮','taco'],['🌯','burrito'],['🧆','falafel'],['🍝','spaghetti pasta'],['🍜','ramen noodles'],['🍲','stew'],['🍛','curry'],['🍣','sushi'],['🍱','bento'],['🍚','rice'],['🍙','rice ball'],['🍤','tempura shrimp'],
    ['🍦','ice cream soft'],['🍨','ice cream'],['🎂','birthday cake'],['🍰','cake slice'],['🧁','cupcake'],['🥧','pie'],['🍭','lollipop'],['🍬','candy'],['🍫','chocolate'],['🍿','popcorn'],['🍩','doughnut donut'],['🍪','cookie'],['☕','coffee'],['🍵','tea'],['🧋','boba bubble tea'],['🥤','soda cup'],['🍺','beer'],['🍻','beers cheers'],['🥂','champagne cheers'],['🍷','wine'],['🥃','whiskey'],['🍸','cocktail'],['🍹','tropical drink'],['🍾','bottle pop'],
  ]},
  { name: 'Activities & Travel', emojis: [
    ['⚽','soccer football'],['🏀','basketball'],['🏈','football american'],['⚾','baseball'],['🎾','tennis'],['🏐','volleyball'],['🏉','rugby'],['🎱','pool 8 ball'],['🏓','ping pong'],['🏸','badminton'],['🥅','goal'],['🏒','hockey'],['🥏','frisbee'],['🎯','dart target bullseye'],['🎳','bowling'],['🥊','boxing'],['⛳','golf'],['🎣','fishing'],['🛹','skateboard'],['🎿','ski'],['🏂','snowboard'],['🏋️','weightlifting gym'],['🤸','cartwheel'],['🏆','trophy win'],['🥇','gold medal first'],['🥈','silver medal'],['🥉','bronze medal'],['🏅','medal'],
    ['🎮','video game controller'],['🕹️','joystick'],['🎲','dice'],['🧩','puzzle'],['🎰','slot machine'],['🎨','art palette'],['🎭','theater'],['🎤','microphone sing'],['🎧','headphones'],['🎵','music note'],['🎶','notes music'],['🎹','piano'],['🥁','drum'],['🎸','guitar'],['🎺','trumpet'],['🎻','violin'],['🎬','clapper movie'],['📷','camera'],['📸','camera flash'],
    ['🚗','car'],['🚕','taxi'],['🚌','bus'],['🏎️','race car'],['🚓','police car'],['🚑','ambulance'],['🚒','fire truck'],['🏍️','motorcycle'],['🚲','bike bicycle'],['✈️','airplane'],['🚀','rocket'],['🛸','ufo'],['🚁','helicopter'],['⛵','sailboat'],['🚢','ship'],['🚆','train'],['🗺️','map'],['🗽','statue liberty'],['🏰','castle'],['🎡','ferris wheel'],['🎢','roller coaster'],['⛺','tent camping'],['🏖️','beach'],['🏝️','island'],['⛰️','mountain'],['🌋','volcano'],
  ]},
  { name: 'Objects', emojis: [
    ['⌚','watch'],['📱','phone mobile'],['💻','laptop'],['⌨️','keyboard'],['🖥️','desktop computer'],['🖨️','printer'],['💾','floppy save'],['💿','cd'],['📀','dvd'],['📡','satellite'],['🔋','battery'],['🔌','plug'],['💡','bulb idea'],['🔦','flashlight'],['🕯️','candle'],['🎙️','mic studio'],['⏰','alarm clock'],['⏳','hourglass'],['📻','radio'],['☎️','telephone'],
    ['💰','money bag'],['💵','dollar money'],['💳','credit card'],['💎','gem diamond'],['⚖️','scales balance'],['🔧','wrench'],['🔨','hammer'],['🛠️','tools'],['⚙️','gear settings'],['🧲','magnet'],['💣','bomb'],['🧨','firecracker'],['🔪','knife'],['🛡️','shield'],['🔮','crystal ball'],['🧿','evil eye'],['🔭','telescope'],['🔬','microscope'],['🩹','bandage'],['💊','pill'],['💉','syringe'],['🧬','dna'],['🦠','microbe virus'],['🌡️','thermometer'],['🧹','broom'],['🧻','toilet paper'],['🔑','key'],['🚪','door'],['🛏️','bed'],['🧸','teddy bear'],['🖼️','frame picture'],['🛍️','shopping bags'],['🎁','gift present'],['🎈','balloon'],['🎀','ribbon bow'],['🎉','tada party'],['🎊','confetti'],['🪩','disco ball'],
  ]},
  { name: 'Symbols', emojis: [
    ['❤️','red heart love'],['🧡','orange heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],['🤍','white heart'],['💔','broken heart'],['💕','two hearts'],['💞','revolving hearts'],['💓','beating heart'],['💗','growing heart'],['💖','sparkling heart'],['💘','heart arrow cupid'],['💝','heart gift'],['💯','hundred 100 perfect'],['💢','anger'],['💥','boom collision'],['💫','dizzy stars'],['💦','sweat droplets'],['💨','dash wind'],['💬','speech bubble'],['💭','thought bubble'],['💤','zzz sleep'],
    ['✅','check yes done'],['☑️','checkbox'],['✔️','check mark'],['❌','x cross no wrong'],['➕','plus'],['➖','minus'],['➗','divide'],['✖️','multiply'],['❓','question'],['❗','exclamation'],['‼️','double exclamation'],['⚠️','warning caution'],['🚫','prohibited no'],['⛔','no entry'],['🔞','18 nsfw'],['☢️','radioactive'],['☣️','biohazard'],['⭕','circle o'],['🆗','ok button'],['🆕','new'],['🆒','cool'],['🆓','free'],['🔝','top'],['🔙','back'],['🔜','soon'],
    ['➡️','right arrow'],['⬅️','left arrow'],['⬆️','up arrow'],['⬇️','down arrow'],['🔄','refresh sync'],['🔁','repeat loop'],['🔀','shuffle'],['▶️','play'],['⏸️','pause'],['⏹️','stop'],['⏭️','next'],['🔍','search magnify'],['🔒','lock'],['🔓','unlock'],['🔔','bell notify'],['🔕','mute bell'],['📌','pin'],['📍','location pin'],['🚩','flag'],['🏁','checkered flag'],['🏳️‍🌈','pride rainbow flag'],['⭐','star'],['🌟','star glow'],['✨','sparkles'],['⚡','zap'],['♻️','recycle'],['🔆','bright'],['〽️','part'],['✳️','asterisk'],
  ]},
];

// Slash commands available from the composer.
const SLASH_COMMANDS = [
  { name: 'shrug', desc: 'Appends ¯\\_(ツ)_/¯' },
  { name: 'tableflip', desc: 'Appends (╯°□°）╯︵ ┻━┻' },
  { name: 'unflip', desc: 'Appends ┬─┬ ノ( ゜-゜ノ)' },
  { name: 'me', desc: 'Send an italic action message' },
  { name: 'spoiler', desc: 'Mark your message as a spoiler' },
  { name: 'giphy', desc: 'Search Giphy for a GIF' },
];
// Returns { handled:true } if the command fully consumed the input, { send } with the
// text to send, or null if `raw` isn't a recognised command (send it verbatim).
function applySlashCommand(raw) {
  const m = raw.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const rest = (m[2] || '').trim();
  const append = (art) => ({ send: (rest ? rest + ' ' : '') + art });
  switch (cmd) {
    case 'shrug': return append('¯\\_(ツ)_/¯');
    case 'tableflip': return append('(╯°□°）╯︵ ┻━┻');
    case 'unflip': return append('┬─┬ ノ( ゜-゜ノ)');
    case 'me': return { send: rest ? '*' + rest + '*' : null };
    case 'spoiler': return { send: rest ? '||' + rest + '||' : null };
    case 'giphy': openGifPicker(rest); return { handled: true };
    default: return null;
  }
}

function convertShortcodes(text) {
  if (!text || text.indexOf(':') < 0) return text;
  // Hand-typed :name: for a custom emoji becomes a self-describing <:name:path>
  // token (same as picking it from the emoji picker) so every viewer can render
  // it — even ones who aren't in the server that owns it.
  //
  // Text from the emoji picker/autocomplete already contains complete <:name:path>
  // tokens, and this function runs unconditionally on every send — so it must be
  // idempotent. Without protecting already-built tokens first, the bare :name:
  // pass below re-matches the name segment nested inside <:name:path>, replacing
  // just that inner piece and leaving the surrounding < / path> as stray text.
  const tokens = [];
  text = text.replace(/<:([a-z0-9_]{1,32}):([a-z0-9]{4,40}\.[a-z0-9]{2,5})>/gi, (m) => {
    tokens.push(m);
    return `\x00ET${tokens.length - 1}\x00`;
  });
  const customByName = {};
  for (const e of (state.myEmojis || [])) customByName[(e.name || '').toLowerCase()] = e.stored_path;
  text = text.replace(/:([a-z0-9_+-]{1,32}):/gi, (m, name) => {
    const k = name.toLowerCase();
    if (customByName[k]) return `<:${k}:${customByName[k]}>`;
    return SHORTCODE_EMOJI[k] || m;
  });
  return text.replace(/\x00ET(\d+)\x00/g, (_, i) => tokens[+i]);
}

// Replace @everyone and @RoleName with colored role-mention chips, using the roles
// of the server currently in view. `html` is already HTML-escaped at call time, so we
// match against escaped role names. No-op outside a server.
function renderRoleMentions(html) {
  if (state.view !== 'server' || !state.serverDetail || !state.serverDetail.roles) return html;
  const roles = state.serverDetail.roles;
  const myMem = state.serverDetail.members.find(m => m.id === (state.me && state.me.id));
  const myRoleIds = new Set((myMem && myMem.role_ids) || []);
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // @everyone (everyone is "pinged", so always highlight as mentions-me).
  html = html.replace(/(^|\s)@everyone(?=\s|$|[.,!?:;])/g, (m, pre) =>
    `${pre}<span class="role-mention role-mention-me" data-role-everyone="1">@everyone</span>`);
  // Named roles, longest first so a short name can't shadow a longer one.
  const named = roles.filter(r => !r.is_default && r.name).sort((a, b) => b.name.length - a.name.length);
  for (const r of named) {
    const nameEsc = escape(r.name);
    const re = new RegExp(`(^|\\s)@${reEsc(nameEsc)}(?=\\s|$|[.,!?:;])`, 'gi');
    const meCls = myRoleIds.has(r.id) ? ' role-mention-me' : '';
    const style = r.color ? ` style="color:${r.color};background:${hexToRgba(r.color, 0.14)}"` : '';
    html = html.replace(re, (m, pre) => `${pre}<span class="role-mention${meCls}" data-role-id="${r.id}"${style}>@${nameEsc}</span>`);
  }
  return html;
}

// disdroc's own pages are trusted, so links to them skip the "you're leaving" warning.
function isTrustedLinkHost(host) {
  host = (host || '').toLowerCase();
  if (host === 'disdroc.online' || host.endsWith('.disdroc.online')) return true;
  // YouTube links open straight through (no "you're leaving" interstitial).
  return host === 'youtube.com' || host.endsWith('.youtube.com') ||
         host === 'youtu.be' || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
}
// href for an outbound chat link: trusted hosts go straight there, everything else
// routes through the /leaving interstitial.
function outboundHref(url) {
  try {
    const u = new URL(url);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && isTrustedLinkHost(u.hostname)) return escape(url);
  } catch {}
  return `/leaving?url=${encodeURIComponent(url)}`;
}

function renderMessageHTML(text) {
  if (!text) return '';
  // Single-URL GIF/image → inline render, hide URL text
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/.test(trimmed) && /(\.gif(\?|$)|giphy\.com\/media|tenor\.com\/view|media\d?\.giphy\.com|i\.giphy\.com|\.(png|jpe?g|webp)(\?|$))/i.test(trimmed)) {
    if (localStorage.getItem('disdroc_inline_media') === 'off') {
      return `<a href="${outboundHref(trimmed)}" class="chat-link" target="_blank" rel="noopener noreferrer">${escape(trimmed)}</a>`;
    }
    const blur = localStorage.getItem('disdroc_blur_media') === '1' ? ' media-blur' : '';
    return `<a href="${escape(trimmed)}" target="_blank" rel="noopener noreferrer" class="inline-gif${blur}"><img src="${escape(trimmed)}" alt="gif" loading="lazy" referrerpolicy="no-referrer"></a>`;
  }
  // Multi-line code blocks first — extract and stash so other regexes don't touch them.
  const stash = [];
  let html = text.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = stash.length;
    const cls = lang ? ('hljs language-' + escape(lang)) : 'hljs';
    stash.push(`<pre class="code-block"><code class="${cls}">${highlightCode(code.replace(/\n$/, ''), lang)}</code></pre>`);
    return `\x00CB${i}\x00`;
  });
  // Block-level elements: blockquote (>), unordered list (- * +), ordered list (1.)
  // Process before escaping; apply inline formatting to inner content.
  const inlineFmt = (s) => {
    let h = escape(s);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    h = h.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
    h = h.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>');
    h = h.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
    h = h.replace(/\|\|([^|\n]+)\|\|/g, '<span class="spoiler">$1</span>');
    return h;
  };
  {
    const lines = html.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^>\s?/.test(line)) {
        const inner = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { inner.push(lines[i].replace(/^>\s?/, '')); i++; }
        const si = stash.length;
        stash.push(`<blockquote class="md-bq">${inner.map(inlineFmt).join('<br>')}</blockquote>`);
        out.push(`\x00CB${si}\x00`);
        continue;
      }
      if (/^[-*+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*+]\s+/, '')); i++; }
        const si = stash.length;
        stash.push(`<ul class="md-list">${items.map(it => `<li>${inlineFmt(it)}</li>`).join('')}</ul>`);
        out.push(`\x00CB${si}\x00`);
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
        const si = stash.length;
        stash.push(`<ol class="md-list">${items.map(it => `<li>${inlineFmt(it)}</li>`).join('')}</ol>`);
        out.push(`\x00CB${si}\x00`);
        continue;
      }
      out.push(line); i++;
    }
    html = out.join('\n');
  }
  html = escape(html);
  // Masked links [label](url) — stash before autolinking so the URL isn't re-linked.
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const i = stash.length;
    stash.push(`<a href="${outboundHref(url)}" class="chat-link" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `\x00CB${i}\x00`;
  });
  // URLs
  html = html.replace(/https?:\/\/[^\s<>"']+[a-zA-Z0-9/_]/g, (url) => {
    return `<a href="${outboundHref(url)}" class="chat-link" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
  // Code (inline)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Strikethrough
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  // Underline (__x__) — before single-underscore italic so it isn't split
  html = html.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
  // Italic (_x_ or *x*)
  html = html.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  // Spoiler
  html = html.replace(/\|\|([^|\n]+)\|\|/g, '<span class="spoiler">$1</span>');
  // Custom emoji — explicit self-describing <:name:path> token (what the picker/
  // autocomplete/typed-shortcode conversion all produce). The path alone resolves
  // the image, so this renders correctly for every viewer, even ones who aren't
  // a member of whichever server the emoji came from. Stashed like code blocks so
  // later regexes (esp. the unicode-shortcode fallback) can't re-touch the
  // name/path text sitting inside the generated tag's alt/title/data attributes.
  html = html.replace(/&lt;:([a-z0-9_]{1,32}):([a-z0-9]{4,40}\.[a-z0-9]{2,5})&gt;/gi, (m, name, path) => {
    const i = stash.length;
    stash.push(`<img class="custom-emoji" src="/api/emoji/${escape(path)}" alt=":${escape(name)}:" title=":${escape(name)}:" data-emoji-path="${escape(path)}">`);
    return `\x00CB${i}\x00`;
  });
  // Bare :name: — a custom emoji typed by hand (not converted at send time,
  // e.g. from another client) resolves only if I share a server with it.
  if (state.myEmojis && state.myEmojis.length) {
    const map = {};
    for (const e of state.myEmojis) map[e.name] = e.stored_path;
    html = html.replace(/:([a-z0-9_]{1,32}):/gi, (m, name) => {
      const path = map[name.toLowerCase()];
      if (!path) return m;
      const i = stash.length;
      stash.push(`<img class="custom-emoji" src="/api/emoji/${escape(path)}" alt=":${escape(name)}:" title=":${escape(name)}:" data-emoji-path="${escape(path)}">`);
      return `\x00CB${i}\x00`;
    });
  }
  // Unicode :shortcode: fallback (for messages stored before conversion / other clients)
  html = html.replace(/:([a-z0-9_+-]{1,32}):/gi, (m, name) => SHORTCODE_EMOJI[name.toLowerCase()] || m);
  // Role mentions (@everyone / @RoleName) — resolved against the active server. Run
  // before user mentions so multi-word role names aren't half-eaten by the @user regex.
  html = renderRoleMentions(html);
  // Mentions
  const myUsername = (state.me && state.me.username) || '';
  html = html.replace(/(^|\s)@([a-zA-Z0-9_]{3,20})\b/g, (m, pre, name) => {
    const cls = name === myUsername ? 'mention me-mention' : 'mention';
    return `${pre}<span class="${cls}" data-mention="${name}" title="View @${name}">@${name}</span>`;
  });
  // Restore code blocks
  html = html.replace(/\x00CB(\d+)\x00/g, (_, i) => stash[+i] || '');
  // YouTube → click-to-play embeds appended under the message.
  if (localStorage.getItem('disdroc_inline_media') !== 'off') {
    for (const id of youtubeIds(text)) {
      html += `<div class="yt-embed" data-yt="${id}"><img class="yt-thumb" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" loading="lazy" referrerpolicy="no-referrer" alt="YouTube video"><span class="yt-play" aria-hidden="true"></span></div>`;
    }
  }
  // disdroc server invites → a join card (filled in async by hydrateInviteEmbeds).
  for (const code of inviteCodes(text)) {
    html += `<div class="invite-embed" data-invite="${code}"><div class="ie-load">Loading invite…</div></div>`;
  }
  return html;
}

// Pull up to 3 unique YouTube video ids out of a message's text.
function youtubeIds(text) {
  const ids = [];
  const re = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s&]*&)*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
    if (ids.length >= 3) break;
  }
  return ids;
}

// Pull disdroc /invite/<code> codes out of a message's text.
function inviteCodes(text) {
  const ids = [];
  const re = /(?:https?:\/\/[^\s/]+)?\/invite\/([A-Za-z0-9_-]{3,})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
    if (ids.length >= 3) break;
  }
  return ids;
}

const _inviteCache = new Map();
function hydrateInviteEmbeds(root) {
  const nodes = (root || document).querySelectorAll('.invite-embed[data-invite]:not([data-done])');
  nodes.forEach((node) => { node.setAttribute('data-done', '1'); fillInviteEmbed(node, node.getAttribute('data-invite')); });
}
async function fillInviteEmbed(node, code) {
  let inv = _inviteCache.get(code);
  if (!inv) {
    try { inv = (await api('/api/invites/' + encodeURIComponent(code))).invite; _inviteCache.set(code, inv); }
    catch { node.innerHTML = ''; node.append(el('div', { class: 'ie-bad' }, 'This invite is invalid or has expired.')); return; }
  }
  const joined = () => state.servers.some(s => s.id === inv.server_id);
  const icon = inv.server_icon
    ? el('img', { class: 'ie-icon', src: '/api/server-icon/' + inv.server_icon, alt: '', loading: 'lazy', decoding: 'async' })
    : el('div', { class: 'ie-icon ie-initials' }, initials(inv.server_name));
  const btn = el('button', { class: 'ie-join', type: 'button' });
  const paintBtn = () => { const j = joined(); btn.textContent = j ? 'Joined' : 'Join Server'; btn.disabled = j; btn.classList.toggle('joined', j); };
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Joining…';
    try {
      const r = await api('/api/invites/' + encodeURIComponent(code) + '/accept', { method: 'POST' });
      await loadServers(); renderServerRail();
      paintBtn();
      switchToServer(r.serverId);
    } catch (e) { btn.disabled = false; btn.textContent = 'Join Server'; }
  });
  node.innerHTML = '';
  node.append(icon, el('div', { class: 'ie-info' }, [
    el('div', { class: 'ie-label' }, 'You’ve been invited to join a server'),
    el('div', { class: 'ie-name' }, inv.server_name || 'a server'),
    el('div', { class: 'ie-meta' }, (inv.member_count || 0) + ' member' + (inv.member_count === 1 ? '' : 's')),
  ]), btn);
  paintBtn();
}

function setMessageText(node, content, deleted) {
  if (deleted) { node.textContent = '(message deleted)'; return; }
  node.innerHTML = renderMessageHTML(content);
  if (node.querySelector('.invite-embed')) hydrateInviteEmbeds(node);
  // Jumbo emoji: render large when the message is only a few emoji.
  const t = (content || '').trim();
  let jumbo = false;
  if (t) {
    const stripped = t.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍\s]/gu, '');
    const count = (t.match(/\p{Extended_Pictographic}/gu) || []).length;
    jumbo = stripped === '' && count > 0 && count <= 6;
  }
  node.classList.toggle('jumbo-emoji', jumbo);
}
const initials = (s) => (s || '?').slice(0, 2).toUpperCase();
const fmtTime = (ts) => {
  const d = new Date(ts);
  const hour12 = localStorage.getItem('disdroc_time24') !== '1';
  const topt = { hour: '2-digit', minute: '2-digit', hour12 };
  const today = new Date(); today.setHours(0,0,0,0);
  if (d >= today) return d.toLocaleTimeString([], topt);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], topt);
};
const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1024*1024 ? (b/1024).toFixed(1) + ' KB' : (b/(1024*1024)).toFixed(1) + ' MB';
function userLabel(u) {
  if (!u) return '?';
  const nick = u.display_name || u.username || '?';
  const tag = u.tag;
  if (!tag) return nick;
  if (/^\d+$/.test(tag)) return `${nick}#${tag}`;
  return `${nick} · ${tag}`;
}

// ─── Server roles & permissions (mirrors server/perms.js bit values) ──────────
const SP = {
  VIEW_CHANNELS: 1, SEND_MESSAGES: 2, MANAGE_MESSAGES: 4, MANAGE_CHANNELS: 8,
  MANAGE_ROLES: 16, KICK_MEMBERS: 32, MANAGE_SERVER: 64, MENTION_EVERYONE: 128, ADMINISTRATOR: 256,
  BAN_MEMBERS: 512, MODERATE_MEMBERS: 1024,
};
const SP_INFO = [
  ['ADMINISTRATOR', 'Administrator', 'Grants every permission. Give with care.'],
  ['MANAGE_SERVER', 'Manage Server', 'Edit the server name, description, icon, and invites.'],
  ['MANAGE_ROLES', 'Manage Roles', 'Create, edit, and assign roles below their own.'],
  ['MANAGE_CHANNELS', 'Manage Channels', 'Create, rename, and delete channels.'],
  ['MANAGE_MESSAGES', 'Manage Messages', 'Delete others\' messages and pin messages.'],
  ['KICK_MEMBERS', 'Kick Members', 'Remove members from the server.'],
  ['BAN_MEMBERS', 'Ban Members', 'Permanently remove members and block them from rejoining.'],
  ['MODERATE_MEMBERS', 'Timeout Members', 'Temporarily mute members in chat and voice.'],
  ['MENTION_EVERYONE', 'Mention @everyone', 'Ping every member with @everyone.'],
  ['SEND_MESSAGES', 'Send Messages', 'Send messages in text channels.'],
  ['VIEW_CHANNELS', 'View Channels', 'See channels in this server.'],
];
const MODLOG_ICON = { kick: 'log-out', ban: 'ban', unban: 'shield', timeout: 'volume-x', untimeout: 'volume' };

// Server-wide bit for the currently open server (no per-channel overrides — good
// enough to decide whether to show a moderation control; the server always
// re-checks the exact, override-aware permission before acting on it.
function hasServerPerm(bit) {
  const p = (state.serverDetail && state.serverDetail.myPerms) || 0;
  return !!((p & SP.ADMINISTRATOR) || (p & bit));
}
// Can this user moderate messages/threads/forum posts in the current server
// (owner, admin-tier, global admin, or a custom role with Manage Messages)?
function canModerateChannel() {
  if (!state.me) return false;
  if (state.me.is_admin || state.isSuperAdmin) return true;
  if (!state.serverDetail) return false;
  const role = state.serverDetail.role;
  return role === 'owner' || role === 'admin' || hasServerPerm(SP.MANAGE_MESSAGES);
}
// Friendly text for server-moderation error codes.
function modErr(code) {
  return ({
    forbidden: 'You don\'t have permission to do that.',
    cannot_ban_higher: 'You can\'t moderate someone with an equal or higher role.',
    cannot_timeout_higher: 'You can\'t moderate someone with an equal or higher role.',
    cannot_kick_admin: 'You can\'t kick another admin.',
    cannot_ban_owner: 'You can\'t ban the server owner.',
    cannot_timeout_owner: 'You can\'t timeout the server owner.',
    cannot_ban_self: 'You can\'t ban yourself.',
    cannot_timeout_self: 'You can\'t timeout yourself.',
    not_member: 'That user is no longer in the server.',
  })[code] || (code || 'Something went wrong.');
}
function serverRoleMap() {
  const m = new Map();
  const d = state.serverDetail;
  if (d && d.roles) for (const r of d.roles) m.set(r.id, r);
  return m;
}
// Highest-positioned assigned role matching a predicate (skips @everyone).
function topRole(member, pred) {
  if (!member || !member.role_ids || !member.role_ids.length) return null;
  const map = serverRoleMap(); let best = null;
  for (const id of member.role_ids) {
    const r = map.get(id);
    if (r && !r.is_default && pred(r) && (!best || r.position > best.position)) best = r;
  }
  return best;
}
function memberColorRole(member) { return topRole(member, r => !!r.color); }
function memberHoistRole(member) { return topRole(member, r => !!r.hoist); }
// Role colour for a user's name, only meaningful inside the active server view.
function nameColorForUser(userId) {
  if (state.view !== 'server' || !state.serverDetail) return null;
  const mem = state.serverDetail.members.find(x => x.id === userId);
  const r = mem && memberColorRole(mem);
  return r ? r.color : null;
}
function iHaveServerPerm(bit) {
  const p = (state.serverDetail && state.serverDetail.myPerms) || 0;
  return !!((p & SP.ADMINISTRATOR) || (p & bit));
}
// A user's per-server nickname in the active server, if set.
function serverNickFor(userId) {
  if (state.view !== 'server' || !state.serverDetail) return null;
  const mem = state.serverDetail.members.find(x => x.id === userId);
  return (mem && mem.nickname) || null;
}
// A user's per-server avatar override in the active server, if set — same
// shape/fallback as serverNickFor, just for the avatar image (null = fall
// back to the user's global avatar_path).
function serverAvatarFor(userId) {
  if (state.view !== 'server' || !state.serverDetail) return null;
  const mem = state.serverDetail.members.find(x => x.id === userId);
  return (mem && mem.server_avatar_path) || null;
}

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function getRefresh() { return localStorage.getItem(REFRESH_KEY) || ''; }
function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); }
function saveTokens(token, refresh) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

// Stable-ish device fingerprint for loose session binding + risk scoring.
function deviceFp() {
  let fp = localStorage.getItem('disdroc_fp');
  if (!fp) {
    const seed = [navigator.userAgent, navigator.language, navigator.platform,
      screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
    let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    fp = (h >>> 0).toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('disdroc_fp', fp);
  }
  return fp;
}

// Stable opaque per-device id (X-Device-Id). Unlike deviceFp() it's a pure random
// token — it never folds in UA/screen/timezone, so a browser update or network
// change can't alter it. It's the anchor for trusted-devices + per-device geo, so
// the server won't bounce this device when you log in elsewhere on another device.
function deviceId() {
  let id = localStorage.getItem('disdroc_device_id');
  if (!id || !/^[\w.-]{8,64}$/.test(id)) {
    id = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
    localStorage.setItem('disdroc_device_id', id);
  }
  return id;
}

// Short-lived access tokens expire mid-session, so transparently rotate via the
// refresh token before giving up and bouncing to /login. Single-flight so a burst
// of 401s doesn't fire N refreshes.
let _refreshing = null;
function tryRefresh() {
  if (_refreshing) return _refreshing;
  const rt = getRefresh();
  if (!rt) return Promise.resolve(false);
  _refreshing = fetch('/api/auth/refresh', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-device-fp': deviceFp(), 'x-device-id': deviceId() },
    body: JSON.stringify({ refreshToken: rt }),
  }).then(async (res) => {
    if (res.ok) { const b = await res.json().catch(() => ({})); saveTokens(b.token, b.refreshToken); return true; }
    // ONLY a definitive auth rejection kills the session: 401 (refresh token
    // genuinely dead) or 403 (reauth_required). A 5xx / Cloudflare 521-502 means
    // the origin is momentarily down (Pi rebooting, blip) — wiping the token then
    // turns a transient outage into a forced logout, which is the #1 cause of
    // "randomly logged out" on mobile. Keep the tokens and just fail this attempt.
    if (res.status === 401 || res.status === 403) { clearToken(); return false; }
    return false; // transient — tokens preserved, caller retries later
  }).catch(() => false) // network error (offline / dropped) — keep tokens
    .finally(() => { _refreshing = null; });
  return _refreshing;
}

async function api(path, opts = {}, _retried = false) {
  const headers = { ...(opts.headers || {}), 'x-device-fp': deviceFp(), 'x-device-id': deviceId() };
  if (!headers['content-type'] && opts.body && typeof opts.body === 'string') headers['content-type'] = 'application/json';
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...opts, headers, credentials: 'include' });
  if (res.status === 401) {
    if (!_retried && await tryRefresh()) return api(path, opts, true);
    // Only bounce to /login if the refresh DEFINITIVELY failed (tryRefresh cleared
    // the token). If the token is still here, the refresh was only transiently
    // unavailable — don't nuke a valid session over a blip; surface a retryable error.
    if (!getToken()) { location.href = '/login'; return; }
    throw new Error('auth_unavailable');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 && body.error === 'banned') {
    // A ban applied mid-session (admin banned this account while it was active) —
    // bounce to the branded ban screen instead of surfacing a raw error string.
    const params = new URLSearchParams();
    if (body.reason) params.set('reason', body.reason);
    if (body.until) params.set('until', body.until);
    location.href = '/banned' + (params.toString() ? '?' + params.toString() : '');
    return new Promise(() => {}); // navigation is in flight; never resolve
  }
  if (!res.ok) throw new Error(body.error || 'request_failed');
  return body;
}

// Friendly text for the profanity-filter rejections on server name/description
// — everywhere else a bare error code is shown raw, but this one has an
// obvious human message worth the special case (same reasoning as the
// nsfw_rejected special-casing on image uploads).
function friendlyServerError(msg) {
  if (msg === 'profanity_name') return 'That server name contains blocked language — pick something else.';
  if (msg === 'profanity_description') return 'That description contains blocked language — pick different words.';
  return msg;
}

function avatarEl(user, klass = '', opts = {}) {
  // Avatar ornament (decoration) — a cosmetic spinning ring drawn via CSS keyed
  // off data-orn. Opt-in (opts.showOrn) so it only appears in the profile menus,
  // not on every chat/sidebar avatar.
  const orn = opts.showOrn && user && user.ornament && user.ornament !== 'none' ? String(user.ornament) : null;
  const attrs = { class: 'avatar ' + klass + (orn ? ' has-orn' : '') };
  if (orn) attrs['data-orn'] = orn;
  // opts.serverOverride: a per-server avatar override path (see serverAvatarFor /
  // member.server_avatar_path), resolved by the caller when it has server context.
  // Wins over the user's global avatar_path when set; everywhere else this is
  // just undefined and behavior is unchanged.
  const avatarPath = opts.serverOverride || (user && user.avatar_path);
  const inner = avatarPath
    ? el('img', { src: '/api/avatar/' + avatarPath, alt: user.username, loading: 'lazy', decoding: 'async' })
    : initials(user && (user.display_name || user.username));
  return el('div', attrs, inner);
}

// Avatar ornaments (decorations) — free for everyone, purely cosmetic. Ids must
// match the server allowlist in routes.js (ORNAMENT_IDS); visuals live in style.css.
const ORNAMENTS = [
  { id: 'none', name: 'None' },
  { id: 'gold', name: 'Gold' },
  { id: 'neon', name: 'Neon' },
  { id: 'ember', name: 'Ember' },
  { id: 'frost', name: 'Frost' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'amethyst', name: 'Amethyst' },
  { id: 'rose', name: 'Rosé' },
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'midnight', name: 'Midnight' },
];

// Inline style for a profile banner: custom image/GIF wins, then flat color,
// else '' (the CSS default gradient shows through).
function bannerStyle(u) {
  const p = u && u.banner_path;
  if (p) {
    const url = /^https?:/i.test(p) ? p : '/api/avatar/' + encodeURIComponent(p);
    return "background-image:url('" + url.replace(/'/g, '%27') + "');background-size:cover;background-position:center";
  }
  return (u && u.banner_color) ? 'background:' + u.banner_color : '';
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadMe() {
  try {
    const r = await api('/api/me');
    state.me = r.user;
    state.adminPerms = r.admin_perms || null;
    state.isSuperAdmin = !!r.is_super_admin;
    state.botUserId = r.bot_user_id || null;
  }
  catch { location.href = '/login'; }
}

// Privacy-policy consent gate. Anyone who hasn't accepted the policy yet — chiefly
// users who signed up before it existed — must accept before using the app.
// Declining returns them to the landing page. Resolves true to continue booting,
// false once we've redirected away.
function ensurePrivacyConsent() {
  if (!state.me || state.me.privacy_accepted_at) return Promise.resolve(true);
  return new Promise((resolve) => {
    const card = el('form', { class: 'modal consent-card' }, [
      el('h3', {}, t('consent.title')),
      el('div', { class: 'consent-body' }, [
        el('p', {}, t('consent.body')),
        el('p', { class: 'consent-link' }, [
          t('consent.readPrompt') + ' ',
          el('a', { href: '/privacy', target: internalPageTarget(), rel: 'noopener' }, t('consent.link')),
          '.',
        ]),
      ]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => { location.href = '/'; } } }, t('consent.decline')),
        el('button', { type: 'submit' }, t('consent.accept')),
      ]),
    ]);
    const overlay = el('div', { class: 'modal-bg consent-gate' }, card);
    card.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = card.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const r = await api('/api/privacy/accept', { method: 'POST', body: '{}' });
        state.me.privacy_accepted_at = (r && r.privacy_accepted_at) || Date.now();
        animateOut(overlay);
        resolve(true);
      } catch {
        submitBtn.disabled = false;
        let err = card.querySelector('.consent-err');
        if (!err) { err = el('div', { class: 'consent-err' }); card.querySelector('.consent-body').append(err); }
        err.textContent = 'Could not save — check your connection and try again.';
      }
    });
    document.body.append(overlay);
  });
}

// Rebrand name poll. Optional and non-blocking: ask once whether the user wants to
// suggest a new name; "yes" reveals a small input. Answering either way (or closing)
// records that we asked, so it won't nag. Shown once the app has loaded.
function maybeShowRebrandPrompt() {
  if (!state.me || state.me.rebrand_prompted_at) return;
  let answered = false;
  const remember = () => {
    if (answered) return;
    answered = true;
    state.me.rebrand_prompted_at = Date.now();
    api('/api/rebrand/dismiss', { method: 'POST', body: '{}' }).catch(() => {});
  };

  const body = el('div', { class: 'rebrand-body' });
  const card = el('div', { class: 'modal rebrand-card' }, body);
  const overlay = el('div', { class: 'modal-bg' }, card);
  const close = () => animateOut(overlay);

  function showAsk() {
    body.innerHTML = '';
    body.append(
      el('h3', {}, t('rebrand.title')),
      el('p', { class: 'rebrand-lead' }, t('rebrand.ask')),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => { remember(); close(); } } }, t('rebrand.no')),
        el('button', { type: 'button', on: { click: showInput } }, t('rebrand.yes')),
      ]),
    );
  }

  function showInput() {
    body.innerHTML = '';
    const input = el('input', { type: 'text', maxlength: '60', placeholder: t('rebrand.placeholder'), class: 'rebrand-input' });
    const errEl = el('div', { class: 'consent-err', style: { display: 'none' } });
    const send = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      sendBtn.disabled = true; errEl.style.display = 'none';
      try {
        await api('/api/rebrand/suggest', { method: 'POST', body: JSON.stringify({ name }) });
        answered = true;
        state.me.rebrand_prompted_at = Date.now();
        showThanks();
      } catch {
        sendBtn.disabled = false; errEl.style.display = ''; errEl.textContent = t('rebrand.error');
      }
    };
    const sendBtn = el('button', { type: 'button', on: { click: send } }, t('rebrand.send'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    body.append(
      el('h3', {}, t('rebrand.inputTitle')),
      el('p', { class: 'rebrand-lead' }, t('rebrand.inputLead')),
      input, errEl,
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => { remember(); close(); } } }, t('rebrand.cancel')),
        sendBtn,
      ]),
    );
    setTimeout(() => input.focus(), 0);
  }

  function showThanks() {
    body.innerHTML = '';
    body.append(
      el('h3', {}, t('rebrand.thanksTitle')),
      el('p', { class: 'rebrand-lead' }, t('rebrand.thanks')),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', on: { click: close } }, t('rebrand.done')),
      ]),
    );
  }

  // Clicking the backdrop just closes for now (no mark) — they'll get one more chance.
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  showAsk();
}

function adminCan(perm) {
  return !!(state.adminPerms && state.adminPerms[perm]);
}
async function loadServers() {
  const data = await api('/api/servers');
  state.servers = data.servers || [];
  state.serverFolders = data.folders || [];
}
async function loadFriends() {
  state.friends = (await api('/api/friends')).friends;
  updateMobileTabBadges();
}
async function loadSavedIds() {
  try {
    const r = await api('/api/saved');
    state.savedIds = new Set((r?.saved || []).map(m => m.id));
  } catch { state.savedIds = new Set(); }
}
async function loadChats() {
  const r = await api('/api/chats');
  state.chats = r.chats; state.generalId = r.generalId;
}
async function loadServer(id) {
  state.serverDetail = await api('/api/servers/' + id);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

// ─── Activity ("Playing X" rich presence) ─────────────────────────────────────
function fmtElapsed(since) {
  let s = Math.max(0, Math.floor((Date.now() - (since || 0)) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
function activityEl(userId, cls) {
  const a = state.activities.get(userId);
  if (!a || !a.name) return null;
  if (a.type === 'spotify') {
    return el('div', { class: 'activity-line spotify ' + (cls || ''), title: a.name + (a.artist ? ' — ' + a.artist : '') }, [
      el('span', { class: 'activity-game' }, [icon('spotify', 14), el('span', {}, ' ' + t('act.listening') + ' '), el('strong', {}, a.name)]),
      el('span', { class: 'activity-elapsed', dataset: { since: String(a.since) } }, fmtElapsed(a.since)),
    ]);
  }
  return el('div', { class: 'activity-line ' + (cls || '') }, [
    el('span', { class: 'activity-game' }, [icon('gamepad', 14), el('span', {}, ' Playing '), el('strong', {}, a.name)]),
    el('span', { class: 'activity-elapsed', dataset: { since: String(a.since) } }, fmtElapsed(a.since)),
  ]);
}
function refreshActivityViews() {
  if (state.view === 'server') renderRightPanel();
  else {
    const mount = document.querySelector('#rightPanel .dm-profile');
    if (mount) {
      const chat = state.chats.find(c => c.id === state.activeChatId);
      const peer = chat && chat.type === 'dm' ? dmPeerUsername(chat) : null;
      const cached = peer && _dmProfileCache.get(peer);
      if (cached) fillDmProfile(mount, cached);
    }
  }
}

function renderMe() {
  $('#meName').textContent = state.me.display_name || state.me.username;
  const meRoleEl = $('#meRole');
  const myAct = activityEl(state.me.id, 'compact');
  if (myAct) { meRoleEl.textContent = ''; meRoleEl.append(myAct); }
  else meRoleEl.textContent = state.me.tag ? (/^\d+$/.test(state.me.tag) ? '#' + state.me.tag : '@' + state.me.tag) : (state.me.is_admin ? 'admin' : '@' + state.me.username);
  const av = avatarEl(state.me, 'small');
  const m = $('#meAvatar'); m.innerHTML = ''; m.append(...av.childNodes); m.className = av.className;
  const tabAvatar = $('#mobileTabAvatar');
  if (tabAvatar) {
    const tabAv = avatarEl(state.me, 'small');
    tabAvatar.innerHTML = '';
    tabAvatar.append(...tabAv.childNodes);
    tabAvatar.className = 'mobile-tab-avatar ' + tabAv.className;
  }
  // (Admin panel link moved from the sidebar footer into User Settings' nav.)
  const dot = document.querySelector('.user-panel .up-status');
  if (dot) {
    const st = state.me.status_type || 'online';
    dot.className = 'status-dot up-status status-' + (st === 'invisible' ? 'offline' : st);
    dot.title = state.me.status_text || t('status.' + st);
  }
}

const SERVER_FOLDER_SWATCHES = [
  ['#5865f2', 'folder.colorBlue'],
  ['#00a8fc', 'folder.colorCyan'],
  ['#23a55a', 'folder.colorGreen'],
  ['#f0b232', 'folder.colorYellow'],
  ['#f23f43', 'folder.colorPink'],
  ['#bd93f9', 'folder.colorPurple'],
];
let _railDrag = null;
let _railDropHandled = false;

function railPosition(value) {
  return Number.isInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function folderServers(folderId) {
  return state.servers.filter(s => Number(s.folder_id) === folderId).sort((a, b) =>
    railPosition(a.position) - railPosition(b.position) || a.created_at - b.created_at || a.id - b.id);
}

function clearRailDropTargets() {
  for (const node of document.querySelectorAll('#serverIcons .folder-drop-target')) node.classList.remove('folder-drop-target');
}

function railDraggedNode() {
  if (!_railDrag) return null;
  if (_railDrag.type === 'folder') return document.querySelector(`#serverIcons .rail-folder[data-fid="${_railDrag.id}"]`);
  return document.querySelector(`#serverIcons .rail-icon[data-sid="${_railDrag.id}"]`);
}

function finishRailDrag() {
  const handled = _railDropHandled;
  for (const node of document.querySelectorAll('#serverIcons .dragging')) node.classList.remove('dragging');
  clearRailDropTargets();
  _railDrag = null;
  _railDropHandled = false;
  if (!handled) persistRailOrder();
}

function serverRailIcon(s, folderId) {
  const it = el('button', {
    type: 'button',
    class: 'rail-icon rail-server' + (state.view === 'server' && state.serverId === s.id ? ' active' : ''),
    title: s.name,
    dataset: { sid: String(s.id), folderId: folderId == null ? '' : String(folderId) },
    draggable: 'true',
    on: {
      click: () => switchToServer(s.id),
      contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); openServerRailMenu({ clientX: e.clientX, clientY: e.clientY }, s); },
      dragstart: (e) => {
        _railDrag = { type: 'server', id: s.id };
        _railDropHandled = false;
        it.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(s.id)); } catch {}
      },
      dragend: finishRailDrag,
      dragover: (e) => handleRailServerDragOver(e, it, folderId),
      drop: (e) => handleRailServerDrop(e, it, s.id, folderId),
    },
  }, s.icon_path
    ? el('img', { src: '/api/server-icon/' + s.icon_path, alt: s.name, loading: 'lazy', decoding: 'async' })
    : initials(s.name));
  return it;
}

function serverFolderPreview(folder, members) {
  if (!members.length) return el('span', { class: 'rail-folder-empty', title: t('folder.empty') }, initials(folder.name));
  return el('span', { class: 'rail-folder-grid' }, members.slice(0, 4).map(s =>
    s.icon_path
      ? el('img', { class: 'rail-folder-thumb', src: '/api/server-icon/' + s.icon_path, alt: s.name, loading: 'lazy', decoding: 'async' })
      : el('span', { class: 'rail-folder-thumb rail-folder-initials', title: s.name }, initials(s.name))));
}

function renderServerFolder(folder) {
  const members = folderServers(folder.id);
  const collapsed = !!folder.collapsed;
  const containsActive = state.view === 'server' && members.some(s => s.id === state.serverId);
  const memberBox = el('div', { class: 'rail-folder-members' }, members.map(s => serverRailIcon(s, folder.id)));
  const header = el('button', {
    type: 'button',
    class: 'rail-folder-header' + (containsActive ? ' contains-active' : ''),
    title: folder.name,
    'aria-label': folder.name,
    'aria-expanded': String(!collapsed),
    draggable: 'true',
    dataset: { fid: String(folder.id) },
    on: {
      click: () => toggleServerFolder(folder),
      contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); openServerFolderMenu({ clientX: e.clientX, clientY: e.clientY }, folder); },
      dragstart: (e) => {
        _railDrag = { type: 'folder', id: folder.id };
        _railDropHandled = false;
        wrapper.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'folder:' + folder.id); } catch {}
      },
      dragend: finishRailDrag,
      dragover: (e) => handleRailFolderDragOver(e, wrapper, header, folder.id),
      drop: (e) => handleRailFolderDrop(e, wrapper, header, folder.id),
    },
  }, serverFolderPreview(folder, members));
  const wrapper = el('div', {
    class: 'rail-folder ' + (collapsed ? 'collapsed' : 'expanded'),
    dataset: { fid: String(folder.id) },
    style: { '--folder-color': folder.color || SERVER_FOLDER_SWATCHES[0][0] },
    on: {
      dragover: (e) => {
        if (e.target !== wrapper || !_railDrag || _railDrag.type !== 'server') return;
        e.preventDefault(); e.stopPropagation(); clearRailDropTargets(); header.classList.add('folder-drop-target');
      },
      drop: (e) => {
        if (e.target !== wrapper || !_railDrag || _railDrag.type !== 'server') return;
        e.preventDefault(); e.stopPropagation(); _railDropHandled = true; moveRailServerToFolder(folder.id);
      },
    },
  }, [header, memberBox]);
  memberBox.addEventListener('dragover', (e) => {
    if (e.target !== memberBox || !_railDrag || _railDrag.type !== 'server') return;
    const dragging = railDraggedNode();
    if (!dragging) return;
    e.preventDefault(); e.stopPropagation(); clearRailDropTargets(); memberBox.append(dragging);
  });
  memberBox.addEventListener('drop', (e) => {
    if (e.target !== memberBox || !_railDrag || _railDrag.type !== 'server') return;
    e.preventDefault(); e.stopPropagation(); _railDropHandled = true; persistRailOrder();
  });
  return wrapper;
}

function renderServerRail() {
  const box = $('#serverIcons'); box.innerHTML = '';
  const validFolderIds = new Set(state.serverFolders.map(folder => folder.id));
  const topLevel = [
    ...state.servers.filter(s => !validFolderIds.has(Number(s.folder_id))).map(s => ({ type: 'server', data: s })),
    ...state.serverFolders.map(folder => ({ type: 'folder', data: folder })),
  ].sort((a, b) => railPosition(a.data.position) - railPosition(b.data.position)
    || a.data.created_at - b.data.created_at || a.data.id - b.data.id);
  for (const item of topLevel) {
    box.append(item.type === 'server' ? serverRailIcon(item.data, null) : renderServerFolder(item.data));
  }
  box.ondragover = (e) => {
    if (e.target !== box || !_railDrag) return;
    const dragging = railDraggedNode();
    if (!dragging) return;
    e.preventDefault(); clearRailDropTargets(); box.append(dragging);
  };
  box.ondrop = (e) => {
    if (e.target !== box || !_railDrag) return;
    e.preventDefault(); _railDropHandled = true; persistRailOrder();
  };
  for (const r of $$('.rail-icon.home')) {
    r.classList.toggle('active', state.view === 'home' || state.view === 'friends');
    r.onclick = () => switchToHome();
  }
  renderRailDots();
}

function handleRailServerDragOver(e, target, targetFolderId) {
  if (!_railDrag) return;
  e.preventDefault(); e.stopPropagation(); clearRailDropTargets();
  const dragging = railDraggedNode();
  if (!dragging || dragging === target) return;
  if (_railDrag.type === 'folder') {
    if (targetFolderId != null) return;
    const after = e.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    const box = $('#serverIcons');
    box.insertBefore(dragging, after ? target.nextSibling : target);
    return;
  }
  const rect = target.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  if (ratio >= 0.25 && ratio <= 0.75) {
    target.classList.add('folder-drop-target');
    return;
  }
  target.parentElement.insertBefore(dragging, ratio > 0.5 ? target.nextSibling : target);
}

function handleRailServerDrop(e, target, targetSid, targetFolderId) {
  if (!_railDrag) return;
  e.preventDefault(); e.stopPropagation();
  const rect = target.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  const onto = _railDrag.type === 'server' && ratio >= 0.25 && ratio <= 0.75;
  _railDropHandled = true;
  clearRailDropTargets();
  if (!onto) { persistRailOrder(); return; }
  if (targetFolderId != null) moveRailServerToFolder(targetFolderId);
  else if (_railDrag.id !== targetSid) createServerFolder(_railDrag.id, targetSid);
}

function handleRailFolderDragOver(e, wrapper, header, folderId) {
  if (!_railDrag) return;
  e.preventDefault(); e.stopPropagation(); clearRailDropTargets();
  const dragging = railDraggedNode();
  if (!dragging || dragging === wrapper) return;
  const rect = header.getBoundingClientRect();
  if (_railDrag.type === 'server') {
    const ratio = (e.clientY - rect.top) / rect.height;
    if (ratio >= 0.25 && ratio <= 0.75) { header.classList.add('folder-drop-target'); return; }
  }
  const after = e.clientY > rect.top + rect.height / 2;
  const box = $('#serverIcons');
  box.insertBefore(dragging, after ? wrapper.nextSibling : wrapper);
}

function handleRailFolderDrop(e, wrapper, header, folderId) {
  if (!_railDrag) return;
  e.preventDefault(); e.stopPropagation();
  const rect = header.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  const onto = _railDrag.type === 'server' && ratio >= 0.25 && ratio <= 0.75;
  _railDropHandled = true;
  clearRailDropTargets();
  if (onto) moveRailServerToFolder(folderId);
  else persistRailOrder();
}

function moveRailServerToFolder(folderId) {
  if (!_railDrag || _railDrag.type !== 'server') return;
  const wrapper = document.querySelector(`#serverIcons .rail-folder[data-fid="${folderId}"]`);
  const dragging = railDraggedNode();
  const members = wrapper && wrapper.querySelector('.rail-folder-members');
  if (!dragging || !members) return;
  members.append(dragging);
  persistRailOrder();
}

async function createServerFolder(sourceSid, targetSid) {
  try {
    await api('/api/servers/folders', { method: 'POST', body: JSON.stringify({ serverIds: [sourceSid, targetSid] }) });
    await loadServers();
  } catch {}
  renderServerRail();
}

async function toggleServerFolder(folder) {
  const previous = folder.collapsed;
  folder.collapsed = previous ? 0 : 1;
  renderServerRail();
  try {
    const result = await api('/api/servers/folders/' + folder.id, {
      method: 'PATCH', body: JSON.stringify({ collapsed: !!folder.collapsed }),
    });
    Object.assign(folder, result.folder);
  } catch {
    folder.collapsed = previous;
    renderServerRail();
  }
}
// Right-click menu for server icons on the left rail.
function openServerRailMenu(point, s) {
  // Same canonical list as the server-name dropdown (see serverMenuItems),
  // with mark-all-read prepended since the rail is where unread dots live.
  const hasUnread = railUnread().serverIds.has(s.id);
  const items = [
    hasUnread ? { label: t('menu.markAllRead'), icon: 'check', click: () => {
      for (const u of state.unread.values()) {
        if (u.unread && chatServerInfo(u.chat_id, u).server_id === s.id) markChatRead(u.chat_id, u.last_message_id);
      }
    } } : null,
    hasUnread ? { sep: true } : null,
    ...serverMenuItems(s),
  ];
  showFloatingMenu(point, items);
}

function openServerFolderMenu(point, folder) {
  const swatches = el('div', { class: 'fm-folder-colors' }, [
    el('div', { class: 'fm-folder-color-label' }, t('folder.color')),
    el('div', { class: 'fm-folder-swatches' }, SERVER_FOLDER_SWATCHES.map(([color, labelKey]) => el('button', {
      type: 'button',
      class: 'fm-folder-swatch' + (folder.color === color ? ' active' : ''),
      title: t(labelKey),
      'aria-label': t(labelKey),
      style: { backgroundColor: color },
      on: { click: async (e) => {
        e.stopPropagation(); closeFloatingMenus();
        try {
          const result = await api('/api/servers/folders/' + folder.id, { method: 'PATCH', body: JSON.stringify({ color }) });
          Object.assign(folder, result.folder); renderServerRail();
        } catch {}
      } },
    }))),
  ]);
  showFloatingMenu(point, [
    { label: t('folder.rename'), icon: 'pencil', click: async () => {
      const name = prompt(t('folder.renamePrompt'), folder.name);
      if (name == null || !name.trim() || name.trim() === folder.name) return;
      try {
        const result = await api('/api/servers/folders/' + folder.id, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
        Object.assign(folder, result.folder); renderServerRail();
      } catch {}
    } },
    { custom: swatches },
    { sep: true },
    { label: t('folder.remove'), icon: 'trash', danger: true, click: async () => {
      if (!(await confirmModal(t('folder.removeConfirm', { name: folder.name }), { danger: true }))) return;
      try {
        await api('/api/servers/folders/' + folder.id, { method: 'DELETE' });
        await loadServers(); renderServerRail();
      } catch {}
    } },
  ]);
}

// After a drag, read the DOM order and persist either the legacy flat array or
// the complete mixed layout when personal folders exist.
function persistRailOrder() {
  const box = $('#serverIcons');
  if (!state.serverFolders.length) {
    const order = [...box.children].filter(n => n.matches('.rail-icon[data-sid]')).map(n => +n.dataset.sid);
    if (!order.length) return;
    const same = order.length === state.servers.length && order.every((id, i) => state.servers[i] && state.servers[i].id === id);
    if (same) return;
    const byId = new Map(state.servers.map(s => [s.id, s]));
    state.servers = order.map(id => byId.get(id)).filter(Boolean);
    state.servers.forEach((server, position) => { server.position = position; server.folder_id = null; });
    return api('/api/servers/reorder', { method: 'POST', body: JSON.stringify({ order }) }).catch(() => {});
  }

  const topLevel = [...box.children].map((node) => node.matches('.rail-folder[data-fid]')
    ? { type: 'folder', id: +node.dataset.fid }
    : { type: 'server', id: +node.dataset.sid });
  const folders = [...box.children].filter(node => node.matches('.rail-folder[data-fid]')).map(node => ({
    id: +node.dataset.fid,
    serverIds: [...node.querySelector('.rail-folder-members').children].map(member => +member.dataset.sid),
  }));
  const serversById = new Map(state.servers.map(server => [server.id, server]));
  const foldersById = new Map(state.serverFolders.map(folder => [folder.id, folder]));
  const orderedServers = [];
  topLevel.forEach((item, position) => {
    if (item.type === 'server') {
      const server = serversById.get(item.id);
      if (server) { server.folder_id = null; server.position = position; orderedServers.push(server); }
    } else {
      const folder = foldersById.get(item.id);
      if (folder) folder.position = position;
      const layout = folders.find(entry => entry.id === item.id);
      (layout ? layout.serverIds : []).forEach((sid, memberPosition) => {
        const server = serversById.get(sid);
        if (server) { server.folder_id = item.id; server.position = memberPosition; orderedServers.push(server); }
      });
    }
  });
  state.servers = orderedServers;
  state.serverFolders = topLevel.filter(item => item.type === 'folder').map(item => foldersById.get(item.id)).filter(Boolean);
  return api('/api/servers/layout', { method: 'POST', body: JSON.stringify({ topLevel, folders }) }).catch(async () => {
    try { await loadServers(); } catch {}
    renderServerRail();
  });
}

// Resolve which server (if any) a chat belongs to + its type. `hint` is an
// optional object (e.g. a message:new payload) that may already carry server_id
// / chat_type; otherwise we look it up in the chats we know about.
function chatServerInfo(chatId, hint) {
  if (hint && (hint.server_id != null || hint.type != null || hint.chat_type != null)) {
    return { server_id: hint.server_id != null ? hint.server_id : null, type: hint.type || hint.chat_type || null };
  }
  const c = state.chats.find(x => x.id === chatId);
  if (c) return { server_id: c.server_id != null ? c.server_id : null, type: c.type };
  if (state.serverDetail && Array.isArray(state.serverDetail.channels)) {
    const ch = state.serverDetail.channels.find(x => x.id === chatId);
    if (ch) return { server_id: state.serverId, type: ch.type };
  }
  const u = state.unread && state.unread.get(chatId);
  if (u && (u.server_id != null || u.type)) return { server_id: u.server_id != null ? u.server_id : null, type: u.type || null };
  return { server_id: null, type: null };
}

// Which servers have unread messages, and whether any DM/group/general (home) does.
function railUnread() {
  const serverIds = new Set();
  let home = false;
  if (state.unread) {
    for (const u of state.unread.values()) {
      if (!u.unread) continue;
      if (state.generalId && u.chat_id === state.generalId) continue; // #general is muted from the dot
      const info = chatServerInfo(u.chat_id, u);
      if (info.server_id != null) serverIds.add(info.server_id);
      else home = true;
    }
  }
  return { serverIds, home };
}

// Toggle the red unread dots on the server rail (per-server icons + home button).
function renderRailDots() {
  const { serverIds, home } = railUnread();
  const setDot = (node, on) => {
    if (!node) return;
    let dot = node.querySelector(':scope > .rail-dot');
    if (on && !dot) node.append(el('span', { class: 'rail-dot' }));
    else if (!on && dot) dot.remove();
  };
  for (const r of document.querySelectorAll('#serverIcons .rail-icon[data-sid]')) {
    setDot(r, serverIds.has(+r.dataset.sid));
  }
  for (const node of document.querySelectorAll('#serverIcons .rail-folder[data-fid]')) {
    const folder = state.serverFolders.find(item => item.id === +node.dataset.fid);
    const hasUnread = !!folder && !!folder.collapsed && folderServers(folder.id).some(server => serverIds.has(server.id));
    setDot(node.querySelector('.rail-folder-header'), hasUnread);
  }
  for (const r of document.querySelectorAll('.rail-icon.home')) setDot(r, home);
}

function renderSidebar() {
  const box = $('#sidebarContent');
  box.innerHTML = '';
  if (state.view === 'home' || state.view === 'friends') renderHomeSidebar(box);
  else renderServerSidebar(box);
}

function renderHomeSidebar(box) {
  const incoming = state.friends.filter(f => f.status === 'pending' && f.direction === 'received');
  const friendsBtn = el('div', {
    class: 'list-item' + (state.view === 'friends' ? ' active' : ''),
    style: { fontWeight: '600', marginBottom: '4px' },
    on: { click: () => switchToFriends() },
  }, [
    el('span', { class: 'channel-icon' }, icon('users', 18)),
    el('span', { class: 'label' }, t('friends.header')),
    incoming.length ? el('span', { class: 'badge' }, String(incoming.length)) : null,
  ]);
  const savedBtn = el('div', {
    class: 'list-item' + (state.view_saved ? ' active' : ''),
    style: { fontWeight: '600', marginBottom: '4px' },
    on: { click: () => { if (state.view_saved) { state.view_saved = false; renderSidebar(); if (state.activeChatId) showChatView(); else switchToFriends(); } else { openSavedMessages(); } } },
  }, [
    el('span', { class: 'channel-icon' }, icon('bookmark', 18)),
    el('span', { class: 'label' }, t('saved.title', 'Kaydedilen Mesajlar')),
  ]);
  const topSec = el('div', { class: 'sidebar-section' });
  topSec.append(friendsBtn);
  topSec.append(savedBtn);
  box.append(topSec);

  // One ordered conversation list holding both 1:1 DMs and group chats. Keep
  // favorites in that same recency order, but render them only in their own
  // section so each chat appears exactly once.
  const convos = state.chats.filter(c => c.type === 'dm' || c.type === 'group');
  const favorites = convos.filter(c => c.favorite);
  const directMessages = convos.filter(c => !c.favorite);
  if (favorites.length) {
    const favSec = el('div', { class: 'sidebar-section' });
    favSec.append(el('div', { class: 'title' },
      el('span', { class: 'st-name' }, t('sidebar.favorites'))));
    for (const c of favorites) favSec.append(channelItem(c));
    box.append(favSec);
  }
  const dmSec = el('div', { class: 'sidebar-section' });
  dmSec.append(el('div', { class: 'title' }, [
    el('span', { class: 'st-name' }, t('sidebar.directMessages')),
    el('div', { class: 'st-actions' },
      el('button', { class: 'new-dm-btn', title: t('sidebar.newGroup'), on: { click: newGroupModal } }, '+')),
  ]));
  for (const c of directMessages) dmSec.append(channelItem(c));
  if (!convos.length) dmSec.append(el('div', { class: 'list-item small muted-text' }, t('sidebar.noDms')));
  box.append(dmSec);
}

// Opens (or falls back to just switching to) the DM with Disdroc AI — every
// account gets one auto-created on first /api/me call, see server/routes.js.
function openAiDm() {
  const dm = state.chats && state.chats.find(c => c.type === 'dm' && c.other && c.other.id === state.botUserId);
  if (dm) openChat(dm.id, dm);
}

function meTagText() {
  return state.me.tag ? (/^\d+$/.test(state.me.tag) ? '#' + state.me.tag : '@' + state.me.tag) : '@' + state.me.username;
}

// First-run onboarding checklist: five steps, each backed by state we already
// have loaded (no extra requests) except the last, which is a soft/optional
// nudge tracked purely client-side since "tried AI" has no server signal.
function onboardingSteps() {
  const hasProfile = !!(state.me.display_name || state.me.avatar_path);
  const hasServer = !!(state.servers && state.servers.length);
  const hasFriend = state.friends.some(f => f.status === 'accepted');
  const hasMessaged = !!(state.chats && state.chats.some(c => c.last_user_id === state.me.id));
  const triedAI = localStorage.getItem('disdroc_tried_ai') === '1';
  return [
    { key: 'profile', label: t('onboarding.step.profile'), done: hasProfile, actionLabel: t('onboarding.action.editProfile'), action: () => openSettingsModal('profile') },
    { key: 'server', label: t('onboarding.step.server'), done: hasServer, actionLabel: t('onboarding.action.createServer'), action: () => newServerModal() },
    { key: 'friend', label: t('onboarding.step.friend'), done: hasFriend, actionLabel: t('friends.addFriend'), action: () => { state.friendsTab = 'add'; renderFriendsPanel(); } },
    { key: 'message', label: t('onboarding.step.message'), done: hasMessaged, actionLabel: t('onboarding.action.sendMessage'), action: () => openAiDm() },
    { key: 'ai', label: t('onboarding.step.ai'), done: triedAI, optional: true, actionLabel: t('onboarding.action.tryAI'), action: () => { localStorage.setItem('disdroc_tried_ai', '1'); openAiDm(); } },
  ];
}

async function dismissOnboarding() {
  state.me.onboarding_dismissed_at = Date.now();
  renderFriendsPanel();
  try { await api('/api/onboarding/dismiss', { method: 'POST', body: '{}' }); } catch {}
}

function renderOnboardingCard() {
  if (!state.me || state.me.onboarding_dismissed_at) return null;
  if (!isBrandNewAccount(7 * 24 * 3600 * 1000)) return null; // only nudge for roughly the first week
  const steps = onboardingSteps();
  if (steps.filter(s => !s.optional).every(s => s.done)) { dismissOnboarding(); return null; }
  return el('div', { class: 'onboarding-card' }, [
    el('div', { class: 'onboarding-head' }, [
      el('span', { class: 'onboarding-title' }, t('onboarding.title')),
      el('div', { class: 'onboarding-head-actions' }, [
        el('button', { type: 'button', class: 'ghost onboarding-tour-btn', on: { click: () => startTour() } }, t('tour.cta')),
        el('button', { type: 'button', class: 'onboarding-close', title: t('onboarding.dismiss'), on: { click: () => dismissOnboarding() } }, '✕'),
      ]),
    ]),
    el('div', { class: 'onboarding-steps' }, steps.map(s => el('div', { class: 'onboarding-step' + (s.done ? ' done' : '') }, [
      el('span', { class: 'onboarding-check' }, s.done ? '✓' : ''),
      el('span', { class: 'onboarding-label' }, s.label),
      !s.done ? el('button', { type: 'button', class: 'ghost onboarding-action', on: { click: s.action } }, s.actionLabel) : null,
    ]))),
  ]);
}

// Stronger empty state than a single muted line: gives a brand-new (or
// friendless-again) account concrete next steps instead of a dead end.
function renderFriendsEmptyState() {
  const actions = el('div', { class: 'friends-empty-actions' }, [
    el('button', { type: 'button', on: { click: () => { state.friendsTab = 'add'; renderFriendsPanel(); } } }, t('friends.emptyAddFriend')),
    el('button', { type: 'button', class: 'ghost', on: { click: async (e) => {
      try { await navigator.clipboard.writeText(meTagText()); } catch {}
      const btn = e.currentTarget; const orig = btn.textContent;
      btn.textContent = t('friends.emptyCopyTagDone');
      setTimeout(() => { btn.textContent = orig; }, 1400);
    } } }, t('friends.emptyCopyTag')),
    state.servers && state.servers.length
      ? el('button', { type: 'button', class: 'ghost', on: { click: () => inviteModal(state.servers[0].id) } }, t('friends.emptyInvite'))
      : null,
    el('button', { type: 'button', class: 'ghost', on: { click: () => discoverServersModal() } }, t('friends.emptyDiscover')),
  ]);
  return el('div', { class: 'friends-empty' }, [
    el('p', { class: 'friends-empty-title' }, t('friends.emptyTitle')),
    el('p', { style: 'color:var(--muted);margin:0' }, t('friends.noneAll')),
    actions,
  ]);
}

function renderFriendsPanel() {
  const panel = $('#friendsPanel'); panel.innerHTML = '';
  const onboardingCard = renderOnboardingCard();
  if (onboardingCard) panel.append(onboardingCard);
  const incoming = state.friends.filter(f => f.status === 'pending' && f.direction === 'received');
  const sent = state.friends.filter(f => f.status === 'pending' && f.direction === 'sent');
  const accepted = state.friends.filter(f => f.status === 'accepted');
  const tab = state.friendsTab || 'all';

  const tabRow = el('div', { class: 'tab-row friends-tabs' }, [
    el('span', { class: 'friends-hd' }, [el('span', { class: 'fh-icon' }, icon('users', 18)), t('friends.header')]),
    el('span', { class: 'friends-sep' }),
    tabBtn(t('friends.online'), 'online', 0, tab),
    tabBtn(t('friends.all'), 'all', accepted.length, tab),
    tabBtn(t('friends.pending'), 'pending', incoming.length + sent.length, tab),
    tabBtn(t('friends.blocked'), 'blocked', 0, tab),
    addFriendBtn(tab),
  ]);
  const mobileAddFriend = addFriendBtn(tab);
  mobileAddFriend.classList.add('mobile-add-friend');
  mobileAddFriend.title = t('friends.addFriend');
  mobileAddFriend.setAttribute('aria-label', t('friends.addFriend'));
  mobileAddFriend.textContent = '+';
  panel.append(el('div', { class: 'friends-tabs-wrap' }, [tabRow, mobileAddFriend]));
  // The tab row can side-scroll on narrow screens; make sure the active tab
  // (which might be off-canvas after a switch) is actually visible.
  const activeTabEl = tabRow.querySelector('.tab.active');
  if (activeTabEl) activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  if (tab === 'online' || tab === 'all') {
    const list = tab === 'online' ? accepted.filter(f => state.online.has(f.id)) : accepted;
    const search = el('input', { class: 'friends-search', placeholder: t('chrome.search'), autocomplete: 'off' });
    const label = () => (tab === 'online' ? t('friends.online') : t('friends.allFriendsLabel'));
    const countHd = el('div', { class: 'friends-count' }, label() + ' — ' + list.length);
    const listBox = el('div', { class: 'friends-list' });
    if (!list.length) {
      listBox.append(tab === 'online'
        ? el('p', { style: 'color:var(--muted)' }, t('friends.noneOnline'))
        : renderFriendsEmptyState());
    }
    for (const f of list) {
      const online = state.online.has(f.id);
      listBox.append(el('div', { class: 'friend-row', dataset: { name: (f.username + ' ' + (f.display_name || '')).toLowerCase() } }, [
        el('div', { class: 'member-avatar-wrap' }, [ avatarEl(f, 'small'), el('span', { class: 'status-dot ' + (online ? 'status-online' : 'status-offline') }) ]),
        el('div', { class: 'fr-label' }, [ el('div', { class: 'fr-name' }, userLabel(f)), el('div', { class: 'fr-sub' }, online ? t('friends.online') : t('friends.offline')) ]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'fr-icon', title: t('friends.message'), on: { click: () => openDm(f.username) } }, icon('message', 18)),
          el('button', { class: 'fr-icon danger', title: t('friends.removeFriend'), on: { click: async () => { if (await confirmModal(t('friends.removeConfirm', { name: f.username }))) { await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: f.friendship_id }) }); await loadFriends(); renderSidebar(); renderFriendsPanel(); } } } }, '✕'),
        ]),
      ]));
    }
    panel.append(search, countHd, listBox);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const row of listBox.querySelectorAll('.friend-row')) {
        const match = !q || (row.dataset.name || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      }
      countHd.textContent = label() + ' — ' + shown;
    });
  } else if (tab === 'pending') {
    if (!incoming.length && !sent.length) panel.append(el('p', { style: 'color:var(--muted)' }, t('friends.noPending')));
    if (incoming.length) {
      panel.append(el('h3', { style: 'margin:8px 0 6px' }, t('friends.incoming', { n: incoming.length })));
      for (const f of incoming) {
        panel.append(el('div', { class: 'friend-row' }, [
          avatarEl(f, 'small'),
          el('span', { class: 'label' }, userLabel(f)),
          el('div', { class: 'actions' }, [
            el('button', { on: { click: async () => { await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ friendshipId: f.friendship_id }) }); await loadFriends(); renderSidebar(); renderFriendsPanel(); } } }, t('friends.accept')),
            el('button', { class: 'ghost', on: { click: async () => { await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: f.friendship_id }) }); await loadFriends(); renderSidebar(); renderFriendsPanel(); } } }, t('friends.decline')),
          ]),
        ]));
      }
    }
    if (sent.length) {
      panel.append(el('h3', { style: 'margin:18px 0 6px' }, t('friends.outgoing', { n: sent.length })));
      for (const f of sent) panel.append(el('div', { class: 'friend-row' }, [
        avatarEl(f, 'small'),
        el('span', { class: 'label muted-text' }, f.username),
        el('div', { class: 'actions' }, el('button', { class: 'ghost', on: { click: async () => { await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: f.friendship_id }) }); await loadFriends(); renderSidebar(); renderFriendsPanel(); } } }, t('friends.cancel'))),
      ]));
    }
  } else if (tab === 'blocked') {
    const box = el('div', { class: 'friends-list' });
    panel.append(el('div', { class: 'friends-count' }, t('friends.blocked')), box);
    box.append(el('p', { style: 'color:var(--muted)' }, t('conn.loading')));
    api('/api/blocked').then(r => {
      state.blockedList = r.blocked;
      state.blockedIds = new Set(r.blocked.map(b => b.id));
      box.innerHTML = '';
      if (!r.blocked.length) { box.append(el('p', { style: 'color:var(--muted)' }, t('blocked.none'))); return; }
      for (const b of r.blocked) {
        box.append(el('div', { class: 'friend-row' }, [
          el('div', { class: 'member-avatar-wrap' }, [avatarEl(b, 'small')]),
          el('div', { class: 'fr-label' }, [el('div', { class: 'fr-name' }, userLabel(b)), el('div', { class: 'fr-sub' }, t('blocked.tag'))]),
          el('div', { class: 'actions' }, [
            el('button', { class: 'fr-icon', title: t('friends.unblock'), on: { click: async () => { await unblockUser(b.id); renderFriendsPanel(); } } }, '✕'),
          ]),
        ]));
      }
    }).catch(e => { box.innerHTML = ''; box.append(el('p', { style: 'color:var(--danger)' }, t('sessions.failedToLoad', { error: e.message }))); });
  } else if (tab === 'add') {
    const form = el('form', { class: 'add-form' }, [
      el('input', { name: 'tag', placeholder: t('friends.tagPlaceholder'), required: true, autocomplete: 'off', maxlength: 8 }),
      el('button', { type: 'submit' }, t('friends.sendRequest')),
    ]);
    const err = el('div', { class: 'error', style: 'margin-top:8px' });
    const ok = el('div', { style: 'color:var(--ok);font-size:13px;margin-top:8px' });
    panel.append(el('p', { style: 'color:var(--muted);margin-top:0' }, t('friends.addTagHint')));
    panel.append(form);
    panel.append(err); panel.append(ok);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = ''; ok.textContent = '';
      const tag = new FormData(form).get('tag').toString().trim().replace(/^#/, '');
      if (!tag) return;
      try {
        const r = await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ tag }) });
        form.querySelector('input').value = '';
        ok.textContent = r.status === 'accepted' ? t('friends.nowFriends') : t('friends.requestSent');
        await loadFriends(); renderSidebar();
      } catch (e) { err.textContent = e.message; }
    });
    setTimeout(() => form.querySelector('input').focus(), 0);
  }
}

function tabBtn(label, key, count, currentTab) {
  return el('button', {
    class: 'tab' + (currentTab === key ? ' active' : ''),
    type: 'button',
    on: { click: () => { state.friendsTab = key; renderFriendsPanel(); } },
  }, [
    label,
    count > 0 ? el('span', { class: 'badge', style: { marginLeft: '6px' } }, String(count)) : null,
  ]);
}

function addFriendBtn(currentTab) {
  return el('button', {
    class: 'tab add-friend' + (currentTab === 'add' ? ' active' : ''),
    type: 'button',
    on: { click: () => { state.friendsTab = 'add'; renderFriendsPanel(); } },
  }, t('friends.addFriend'));
}

function switchToFriends() {
  rememberMobileRoot();
  state.view = 'friends'; state.activeChatId = null; state.view_saved = false;
  document.getElementById('mainContent').style.display = 'none';
  const friendsHost = document.getElementById('friendsPanel');
  delete friendsHost.dataset.mobileScreen;
  friendsHost.style.display = 'block';
  const _ft = document.getElementById('chatTitle'); _ft.innerHTML = ''; const _fi = document.createElement('span'); _fi.style.cssText = 'display:inline-flex;align-items:center;gap:6px'; _fi.append(icon('users', 15), t('friends.header')); _ft.append(_fi);
  document.getElementById('chatSub').textContent = '';
  const incoming = state.friends.filter(f => f.status === 'pending' && f.direction === 'received').length;
  state.friendsTab = state.friendsTab || (incoming ? 'pending' : 'all');
  renderSidebar();
  renderFriendsPanel();
  renderRightPanel();
  const app = document.getElementById('app');
  if (isMobileLayout()) {
    app.classList.remove('chat-open', 'show-sidebar');
    app.classList.add('tab-screen');
  }
  updateMobileTabbar('friends');
}

const MOBILE_SETTINGS_TABS = ['profile', 'voice', 'notifications', 'preferences', 'accessibility', 'language', 'privacy', 'security', 'sessions', 'blocked', 'updates', 'connections', 'events'];

function mountMobileTabScreen(screen, activeTab) {
  const main = document.getElementById('mainContent');
  const host = document.getElementById('friendsPanel');
  main.style.display = 'none';
  host.style.display = 'block';
  const previous = host.firstElementChild;
  const previousScreen = host.dataset.mobileScreen;
  const direction = previousScreen === 'you' && activeTab === 'settings' ? 'forward'
    : previousScreen === 'settings' && activeTab === 'you' ? 'back' : null;
  const reduceMotion = document.body.classList.contains('reduce-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Only animate the You list <-> settings drill-down. Other callers use this
  // host for unrelated tab screens and retain their existing instant mount.
  if (!previous || !direction || reduceMotion) {
    host.innerHTML = '';
    host.append(screen);
  } else {
    host.querySelectorAll('.mobile-nav-leaving').forEach((node) => node.remove());
    previous.classList.add('mobile-nav-leaving', `mobile-nav-exit-${direction}`);
    screen.classList.add(`mobile-nav-enter-${direction}`);
    host.append(screen);
    const finish = () => {
      previous.remove();
      screen.classList.remove(`mobile-nav-enter-${direction}`);
    };
    screen.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 220);
  }
  host.dataset.mobileScreen = activeTab;
  const app = document.getElementById('app');
  app.classList.remove('chat-open', 'show-sidebar');
  app.classList.add('tab-screen');
  updateMobileTabbar(activeTab === 'notifications' ? 'notifications' : 'you');
}

function showMobileYouScreen() {
  if (!isMobileLayout()) { openSettingsModal(); return; }
  rememberMobileRoot();
  stopAllMediaTests();
  closeFloatingMenus();
  state.view = 'you'; state.activeChatId = null;
  const me = state.me || {};
  const tag = me.tag ? (/^\d+$/.test(me.tag) ? '#' + me.tag : '@' + me.tag) : (me.username ? '@' + me.username : '');
  const statusKey = me.status_type || 'online';
  const statusText = me.status_text
    ? ((me.status_emoji ? me.status_emoji + ' ' : '') + me.status_text)
    : t('status.' + statusKey);
  const profile = el('button', { type: 'button', class: 'mobile-you-profile' }, [
    avatarEl(me, 'large'),
    el('div', { class: 'mobile-you-identity' }, [
      el('div', { class: 'mobile-you-name' }, userLabel(me)),
      tag ? el('div', { class: 'mobile-you-tag' }, tag) : null,
      el('div', { class: 'mobile-you-status' }, [
        el('span', { class: 'status-dot status-' + (statusKey === 'invisible' ? 'offline' : statusKey) }),
        el('span', {}, statusText),
      ]),
    ]),
    el('span', { class: 'mobile-row-chevron', 'aria-hidden': 'true' }, '›'),
  ]);
  profile.addEventListener('click', (e) => { e.stopPropagation(); openStatusPopover(profile); });

  const labels = { profile: t('tab.profile'), voice: t('tab.voice'), notifications: t('tab.notifications'), preferences: t('tab.preferences'), accessibility: t('tab.accessibility'), language: t('tab.language'), privacy: t('tab.privacy'), security: t('tab.security'), sessions: t('tab.sessions'), blocked: t('tab.blocked'), updates: t('tab.updates'), connections: t('tab.connections'), events: t('nav.events') };
  const icons = { profile: 'user', voice: 'headset', notifications: 'bell', preferences: 'paintbrush', accessibility: 'accessibility', language: 'globe', privacy: 'shield', security: 'lock', sessions: 'monitor', blocked: 'ban', updates: 'download', connections: 'link', events: 'sparkles' };
  const list = el('div', { class: 'mobile-settings-list' }, MOBILE_SETTINGS_TABS.map((tab) =>
    el('button', { type: 'button', class: 'mobile-settings-row', on: { click: () => openSettingsModal(tab) } }, [
      el('span', { class: 'mobile-settings-icon' }, icon(icons[tab], 19)),
      el('span', { class: 'mobile-settings-label' }, labels[tab]),
      el('span', { class: 'mobile-row-chevron', 'aria-hidden': 'true' }, '›'),
    ])
  ));
  list.append(el('button', { type: 'button', class: 'mobile-settings-row danger', on: { click: () => document.getElementById('logoutBtn')?.click() } }, [
    el('span', { class: 'mobile-settings-icon' }, icon('log-out', 19)),
    el('span', { class: 'mobile-settings-label' }, t('common.logout')),
  ]));
  mountMobileTabScreen(el('section', { class: 'mobile-you-screen' }, [
    el('header', { class: 'mobile-screen-titlebar' }, el('h1', {}, t('mobile.youTitle'))),
    el('div', { class: 'mobile-you-scroll' }, [profile, list]),
  ]), 'you');
}

function handleMobileTabScreenBack() {
  const host = document.getElementById('friendsPanel');
  if (!isMobileLayout() || !host) return false;
  if (host.dataset.mobileScreen === 'settings') { showMobileYouScreen(); return true; }
  return false;
}

// Where the user was standing before they stepped into a tab screen (You /
// Friends / Notifications). Backing out used to always call switchToHome(),
// which nulls serverId/serverDetail — so someone browsing a server's channel
// list who peeked at "You" got dumped on the DM list instead of the list they
// came from. Snapshot the root they left and put them back on it.
let mobileNavReturn = null;
function rememberMobileRoot() {
  if (!isMobileLayout()) return;
  const app = document.getElementById('app');
  // Already inside a tab screen — keep the original (deeper) return target.
  if (app.classList.contains('tab-screen')) return;
  mobileNavReturn = { view: state.view, serverId: state.serverId };
}
function returnFromMobileTabScreen() {
  const target = mobileNavReturn;
  mobileNavReturn = null;
  if (target && target.view === 'server' && target.serverId
      && state.servers.some((s) => s.id === target.serverId)) {
    switchToServer(target.serverId);
    return;
  }
  switchToHome();
}

// Re-tapping the tab you are already on steps back OUT of it instead of doing
// nothing: a drilled-in screen (You → a settings section) pops one level, and a
// root-level tab screen returns to the list you came from. Without this the tab
// bar was a one-way trip — tapping "You" opened the screen and tapping it again
// left you stuck there with no visible way back.
function handleMobileTabRetap(tab) {
  if (!isMobileLayout()) return false;
  const app = document.getElementById('app');
  if (tab === 'home') {
    // Home's only "one level in" is a pushed conversation.
    if (app.classList.contains('chat-open')) { showMobileRoot(); return true; }
    return false;
  }
  if (handleMobileTabScreenBack()) return true; // settings → You
  if (app.classList.contains('tab-screen') || app.classList.contains('chat-open')) {
    returnFromMobileTabScreen();
    return true;
  }
  return false;
}

// Canonical server actions — Discord keeps all of these behind the server-name
// dropdown at the top of the channel list. Shared with the rail context menu so
// there's exactly one list to maintain.
function serverMenuItems(s) {
  const isActive = state.serverId === s.id && state.serverDetail;
  const role = isActive ? state.serverDetail.role : null;
  const canManage = isActive && (role === 'owner' || role === 'admin'
    || iHaveServerPerm(SP.MANAGE_SERVER) || iHaveServerPerm(SP.MANAGE_CHANNELS) || iHaveServerPerm(SP.MANAGE_ROLES) || iHaveServerPerm(SP.KICK_MEMBERS));
  const canChannels = isActive && (role === 'owner' || role === 'admin' || iHaveServerPerm(SP.MANAGE_CHANNELS));
  return [
    { label: t('menu.invitePeople'), icon: 'link', click: () => inviteModal(s.id) },
    canManage ? { label: t('menu.serverSettings'), icon: 'settings', click: () => serverSettingsModal(s.id) } : null,
    canChannels ? { label: t('menu.createChannel'), icon: 'circle-plus', click: () => newChannelModal(s.id) } : null,
    isActive ? { label: t('menu.editNickname'), icon: 'user', click: () => serverNicknameModal(s.id) } : null,
    { sep: true },
    role !== 'owner' ? { label: t('menu.leaveServer'), icon: 'log-out', danger: true, click: async () => {
      if (!(await confirmModal(t('menu.leaveServerConfirm', { name: s.name })))) return;
      try {
        await api('/api/servers/' + s.id + '/leave', { method: 'POST' });
        if (state.serverId === s.id) switchToHome();
        state.servers = state.servers.filter(x => x.id !== s.id);
        renderServerRail();
      } catch (e2) { alert(e2.message); }
    } } : null,
  ];
}

function renderServerSidebar(box) {
  if (!state.serverDetail) return;
  const { server, channels, role } = state.serverDetail;
  const canChannels = role === 'owner' || role === 'admin' || iHaveServerPerm(SP.MANAGE_CHANNELS);
  const head = el('div', { class: 'sidebar-section' });
  // Discord-style server header: banner (when set) + the server name as one
  // clickable dropdown row holding every server action.
  const nameRow = el('button', {
    type: 'button', class: 'server-head-btn' + (server.banner_path ? ' on-banner' : ''),
    on: { click: (e) => { e.stopPropagation(); showFloatingMenu(e.currentTarget, serverMenuItems(server)); } },
  }, [
    el('span', { class: 'st-name' }, server.name),
    icon('chevron-down', 16),
  ]);
  if (server.banner_path) {
    head.append(el('div', { class: 'server-banner-head' }, [
      el('img', { src: '/api/server-banner/' + server.banner_path, alt: '', loading: 'lazy', decoding: 'async' }),
      nameRow,
    ]));
  } else {
    head.append(nameRow);
  }
  const txt = channels.filter(c => c.type === 'channel');
  const voice = channels.filter(c => c.type === 'voice');
  const forum = channels.filter(c => c.type === 'forum');
  if (txt.length || canChannels) head.append(categorySection('Text Channels', 'text', txt, 'channel', server.id, canChannels));
  if (forum.length) head.append(categorySection('Forums', 'forum', forum, 'forum', server.id, canChannels));
  if (voice.length) head.append(categorySection('Voice Channels', 'voice', voice, 'voice', server.id, canChannels));
  box.append(head);
}

// A collapsible channel category (state persisted per server + category).
// canAdd shows the Discord-style hover "+" that creates a channel of this type.
function categorySection(label, cat, items, typ, serverId, canAdd) {
  const key = 'disdroc_cat_' + serverId + '_' + cat;
  const wrap = el('div', { class: 'cat-wrap' + (localStorage.getItem(key) === '1' ? ' collapsed' : '') });
  const list = el('div', { class: 'cat-list' });
  for (const c of items) {
    list.append(channelItem({ ...c, type: typ }));
    // Show who is currently in each voice channel (Discord-style), so members see
    // how many / which people are in the call before joining.
    if (typ === 'voice') {
      const members = voiceMembersList(c.id);
      if (members) list.append(members);
    }
  }
  const hdr = el('div', { class: 'cat-head', tabindex: '0', role: 'button', 'aria-expanded': localStorage.getItem(key) === '1' ? 'false' : 'true', on: {
    click: () => {
      const collapsed = wrap.classList.toggle('collapsed');
      hdr.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      localStorage.setItem(key, collapsed ? '1' : '0');
    },
    keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hdr.click(); } },
  } }, [
    el('span', { class: 'cat-caret' }, '▾'),
    el('span', { class: 'cat-label' }, label),
    canAdd ? el('button', {
      type: 'button', class: 'cat-add', title: 'Create channel',
      on: { click: (e) => { e.stopPropagation(); newChannelModal(serverId, typ); } },
    }, '+') : null,
  ]);
  wrap.append(hdr, list);
  return wrap;
}

// The list of users currently connected to a voice channel, shown nested under
// the channel in the server sidebar. Each row shows the avatar, name and a
// mute/deafen indicator. Returns null when nobody is in the channel.
function voiceMembersList(chatId) {
  const parts = state.voiceRooms.get(chatId) || [];
  if (!parts.length) return null;
  const wrap = el('div', { class: 'voice-members' });
  for (const p of parts) {
    const status = p.deafened ? 'deafened' : (p.muted ? 'muted' : '');
    const isMe = p.id === state.me.id;
    wrap.append(el('div', {
      class: 'vmem' + (status ? ' ' + status : '') + (isMe ? ' me' : '') + (!isMe && p.username ? ' clickable' : ''),
      dataset: { uid: p.id },
      title: userLabel(p) + (p.deafened ? ' (deafened)' : p.muted ? ' (muted)' : ''),
      ...(!isMe ? { on: {
        ...(p.username ? { click: (e) => { e.stopPropagation(); openProfile(p.username); } } : {}),
        contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); openUserVoiceMenu({ clientX: e.clientX, clientY: e.clientY }, p); },
      } } : {}),
    }, [
      avatarEl(p, 'vmem-av'),
      el('span', { class: 'vmem-name' }, userLabel(p)),
      p.deafened ? el('span', { class: 'vmem-ic' }, icon('headphones-off', 12))
        : p.muted ? el('span', { class: 'vmem-ic' }, icon('mic-off', 12)) : null,
      // Per-user volume / local mute lived behind a right-click only, i.e.
      // nowhere at all on a phone. Same visible-⋯ treatment as the chat rows.
      !isMe ? el('button', {
        type: 'button', class: 'vmem-menu-btn', title: 'Options',
        on: { click: (e) => { e.stopPropagation(); openUserVoiceMenu(e.currentTarget, p); } },
      }, '⋯') : null,
    ]));
  }
  return wrap;
}

function botBadge(displayName, isSelfBot) {
  if (isSelfBot && /\bai\b\s*$/i.test((displayName || '').trim())) return null;
  return el('span', { class: 'bot-badge' }, isSelfBot ? 'AI' : 'BOT');
}

function channelItem(c) {
  let label = c.name;
  if (c.type === 'dm') {
    if (c.other) label = c.other.display_name || c.other.username || '(you)';
    else {
      const others = (c.members || '').split(',').filter(u => u && u !== state.me.username);
      label = others[0] || '(you)';
    }
  }
  if (c.type === 'general') label = 'general';
  const n = unreadCount(c.id);
  const hasUnread = n > 0 && c.id !== state.activeChatId;
  // DMs show the peer's avatar; other types show their icon.
  const iconSlot = c.type === 'dm'
    ? avatarEl(c.other || { username: label }, 'dm-av')
    : el('span', { class: 'channel-icon' }, c.type === 'voice' ? icon('volume', 16) : c.type === 'forum' ? icon('inbox', 16) : icon('hash', 16));
  // Show "Sender: preview" only on group chats with unread messages.
  let previewEl = null;
  if (c.last_content && hasUnread && c.type === 'group') {
    const isMe = state.me && c.last_user_id === state.me.id;
    const senderTag = isMe ? 'You' : (c.last_sender || null);
    if (senderTag) previewEl = el('span', { class: 'list-preview' }, senderTag + ': ' + c.last_content);
  }
  const it = el('div', {
    class: 'list-item' + (c.id === state.activeChatId ? ' active' : '') + (hasUnread ? ' has-unread' : '') + (c.id === state._bumpedChatId ? ' bumped' : ''),
    dataset: { chatId: c.id },
    on: { click: () => c.type === 'voice' ? toggleVoiceJoin(c.id, c.name) : openChat(c.id, c) },
  }, [
    iconSlot,
    el('div', { class: 'list-text' }, [
      el('span', { class: 'label' }, [label, (c.other && c.other.is_bot) ? botBadge(label, c.other.id === state.botUserId) : null]),
      previewEl,
    ]),
    c.restricted ? el('span', { class: 'chan-lock', title: 'Access limited — @everyone is restricted here' }, icon('lock', 12)) : null,
    hasUnread ? el('span', { class: 'unread-badge' }, String(n)) : null,
    el('button', {
      class: 'chan-menu-btn', title: 'More', type: 'button',
      on: { click: (e) => { e.stopPropagation(); openChatItemMenu(e.currentTarget, c, it); } },
    }, '⋯'),
  ]);
  it.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    openChatItemMenu({ clientX: e.clientX, clientY: e.clientY }, c, it);
  });
  return it;
}

// Right-click menu for sidebar chat rows (DMs, groups, server text channels).
function openChatItemMenu(point, c, rowEl) {
  // Server channels are passed to channelItem as copies — resolve the real
  // object so notif-level changes stick to the state the header reads.
  const chat = state.chats.find(x => x.id === c.id)
    || (state.serverDetail && (state.serverDetail.channels || []).find(x => x.id === c.id))
    || c;
  const u = state.unread && state.unread.get(c.id);
  const items = [
    c.type === 'voice'
      ? { label: 'Join voice', icon: 'volume', click: () => toggleVoiceJoin(c.id, c.name) }
      : { label: t('menu.open'), icon: 'message', click: () => openChat(c.id, c) },
    (u && u.unread) ? { label: t('menu.markRead'), icon: 'check', click: () => markChatRead(c.id, u.last_message_id) } : null,
    (c.type === 'dm' && c.other && c.other.username) ? { label: t('menu.viewProfile'), icon: 'user', click: () => openProfile(c.other.username) } : null,
    (c.type === 'dm' || c.type === 'group')
      ? { label: chat.favorite ? t('menu.removeFavorite') : t('menu.addFavorite'), icon: 'star', click: () => toggleChatFavorite(chat) }
      : null,
    c.type !== 'general' ? { label: t('menu.notifications') + ': ' + NOTIF_LABELS[notifLevel(chat)], icon: NOTIF_ICONS[notifLevel(chat)], click: () => openNotifMenu(chat, rowEl) } : null,
  ];
  const isServerChannel = ['channel', 'voice', 'forum'].includes(c.type) && state.view === 'server' && state.serverDetail;
  if (isServerChannel && (hasServerPerm(SP.MANAGE_ROLES) || hasServerPerm(SP.MANAGE_CHANNELS))) {
    items.push({ sep: true });
    if (hasServerPerm(SP.MANAGE_CHANNELS)) {
      items.push({ label: t('menu.editChannel'), icon: 'pencil', click: () => serverSettingsModal(state.serverDetail.server.id, 'channels') });
    }
    if (hasServerPerm(SP.MANAGE_ROLES)) {
      items.push({ label: t('menu.channelAccess'), icon: 'lock', click: () => channelAccessModal(c) });
    }
    if (hasServerPerm(SP.MANAGE_CHANNELS) && c.type !== 'general') {
      items.push({ label: t('menu.deleteChannel'), icon: 'trash', danger: true, click: async () => {
        if (!(await confirmModal('Delete #' + c.name + '? This deletes all of its messages and cannot be undone.'))) return;
        try {
          await api('/api/servers/' + state.serverDetail.server.id + '/channels/' + c.id, { method: 'DELETE' });
          if (state.activeChatId === c.id) state.activeChatId = null;
          await loadServer(state.serverDetail.server.id);
          renderSidebar();
        } catch (e2) { alert(e2.message); }
      } });
    }
  }
  if (c.type === 'group') {
    items.push({ sep: true });
    items.push({ label: t('menu.groupSettings'), icon: 'settings', click: () => groupSettingsModal(c.id) });
    items.push({ label: t('menu.leaveGroup'), icon: 'log-out', danger: true, click: async () => {
      if (!(await confirmModal(t('menu.leaveGroupConfirm')))) return;
      try {
        await api('/api/chats/' + c.id + '/leave', { method: 'POST' });
        await loadChats(); renderSidebar();
        if (state.activeChatId === c.id) switchToHome();
      } catch (e2) { alert(e2.message); }
    } });
  }
  showFloatingMenu(point, items);
}

async function toggleChatFavorite(chat) {
  const favorite = !chat.favorite;
  try {
    const r = await api('/api/chats/' + chat.id + '/favorite', {
      method: 'PATCH', body: JSON.stringify({ favorite }),
    });
    chat.favorite = r.favorite ? 1 : 0;
    renderSidebar();
  } catch (e) { alert(e.message); }
}

function renderRightPanel() {
  const r = $('#rightPanel');
  const app = document.getElementById('app');
  if (state.view === 'friends') {
    app.classList.add('with-right');
    r.innerHTML = '';
    r.append(el('button', { class: 'right-close', title: t('chrome.close'), type: 'button', on: { click: () => app.classList.remove('show-right') } }, '×'));
    renderActiveNow(r);
    return;
  }
  // DM: Discord-style profile panel for the other person.
  if (state.view !== 'server' && state.rightPanelOpen) {
    const dmChat = state.chats.find(c => c.id === state.activeChatId);
    const peer = dmChat && dmChat.type === 'dm' ? dmPeerUsername(dmChat) : null;
    if (peer) { app.classList.add('with-right'); renderDmProfilePanel(r, peer); return; }
  }
  if (state.view !== 'server' || !state.serverDetail || !state.rightPanelOpen) {
    app.classList.remove('with-right');
    app.classList.remove('show-right');
    r.innerHTML = ''; return;
  }
  app.classList.add('with-right');
  r.innerHTML = '';
  r.append(el('button', {
    class: 'right-close', title: t('chrome.close'), type: 'button',
    on: { click: closeRightPanel },
  }, '×'));
  const onlineMembers = state.serverDetail.members.filter(m => state.online.has(m.id));
  const offlineMembers = state.serverDetail.members.filter(m => !state.online.has(m.id));
  // Hoisted roles get their own heading (most-senior first); online members are
  // listed under their highest hoisted role, the rest fall under "Online".
  const hoistRoles = (state.serverDetail.roles || []).filter(rl => rl.hoist && !rl.is_default).sort((a, b) => b.position - a.position);
  const placed = new Set();
  for (const role of hoistRoles) {
    const group = onlineMembers.filter(m => !placed.has(m.id) && (memberHoistRole(m) || {}).id === role.id);
    if (!group.length) continue;
    for (const m of group) placed.add(m.id);
    r.append(el('h4', { style: role.color ? 'color:' + role.color : '' }, `${role.name} — ${group.length}`));
    for (const m of group) r.append(memberRow(m, true));
  }
  const onlineRest = onlineMembers.filter(m => !placed.has(m.id));
  if (onlineRest.length) {
    r.append(el('h4', {}, t('rightpanel.onlineCount', { n: onlineRest.length })));
    for (const m of onlineRest) r.append(memberRow(m, true));
  }
  if (offlineMembers.length) {
    r.append(el('h4', {}, t('rightpanel.offlineCount', { n: offlineMembers.length })));
    for (const m of offlineMembers) r.append(memberRow(m, false));
  }
}

function renderActiveNow(r) {
  r.append(el('h3', { class: 'active-now-title' }, t('rightpanel.activeNow')));
  const accepted = state.friends.filter(f => f.status === 'accepted');
  const online = accepted.filter(f => state.online.has(f.id));
  if (!online.length) {
    r.append(el('div', { class: 'active-now-empty' }, [
      el('div', { class: 'an-empty-title' }, t('rightpanel.activeNowEmptyTitle')),
      el('div', { class: 'an-empty-sub' }, t('rightpanel.activeNowEmptySub')),
    ]));
    return;
  }
  for (const f of online) {
    r.append(el('div', { class: 'active-card', on: { click: () => openDm(f.username) } }, [
      el('div', { class: 'member-avatar-wrap' }, [ avatarEl(f, 'small'), el('span', { class: 'status-dot status-online' }) ]),
      el('div', { class: 'ac-info' }, [
        el('div', { class: 'ac-name' }, userLabel(f)),
        el('div', { class: 'ac-sub' }, 'Online'),
      ]),
    ]));
  }
}

function dmPeerUsername(c) {
  if (!c) return null;
  if (c.other && c.other.username) return c.other.username;
  return (c.members || '').split(',').filter(u => u && u !== state.me.username)[0] || null;
}

const _dmProfileCache = new Map();
async function renderDmProfilePanel(r, username) {
  r.innerHTML = '';
  r.append(el('button', { class: 'right-close', title: t('chrome.close'), type: 'button', on: { click: closeRightPanel } }, '×'));
  const mount = el('div', { class: 'dm-profile' });
  r.append(mount);
  const cached = _dmProfileCache.get(username);
  if (cached) fillDmProfile(mount, cached);
  try {
    const info = await api('/api/users/' + encodeURIComponent(username) + '/profile');
    _dmProfileCache.set(username, info);
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat && dmPeerUsername(chat) === username) fillDmProfile(mount, info);
  } catch { /* keep cached / empty */ }
}

function fillDmProfile(mount, info) {
  const u = info.user;
  const online = state.online.has(u.id) && u.status_type !== 'offline';
  mount.innerHTML = '';
  if (u.card_color) { mount.style.setProperty('--card-accent', u.card_color); mount.classList.add('has-card-accent'); }
  else { mount.style.removeProperty('--card-accent'); mount.classList.remove('has-card-accent'); }
  mount.append(el('div', { class: 'dmp-banner', style: bannerStyle(u) }));
  mount.append(el('div', { class: 'dmp-avatar-wrap' }, [
    avatarEl(u, 'large', { showOrn: true }),
    statusDot(u, online),
  ]));
  const tag = u.tag ? (/^\d+$/.test(u.tag) ? '#' + u.tag : '@' + u.tag) : '@' + u.username;
  const card = el('div', { class: 'dmp-card' }, [
    el('div', { class: 'dmp-name' }, [
      el('span', {}, u.display_name || u.username),
      u.is_admin ? el('span', { class: 'tag ok', style: 'margin-left:6px' }, 'admin') : null,
    ]),
    el('div', { class: 'dmp-tag' }, tag),
    u.status_text ? el('div', { class: 'dmp-statustext' }, (u.status_emoji ? u.status_emoji + ' ' : '') + u.status_text) : null,
    (() => { const a = activityEl(u.id); return a ? el('div', { class: 'dmp-activity' }, [el('div', { class: 'dmp-label' }, 'Playing a Game'), a]) : null; })(),
    el('div', { class: 'dmp-divider' }),
    el('div', { class: 'dmp-label' }, 'Member Since'),
    el('div', { class: 'dmp-value' }, new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })),
    dmpStatRow('Mutual Servers', info.mutual_servers || 0),
    dmpStatRow('Mutual Friends', (info.mutuals || []).length),
    el('button', { class: 'ghost dmp-view', on: { click: () => openProfile(u.username) } }, t('dmp.viewFullProfile')),
  ]);
  mount.append(card);
}

function dmpStatRow(label, count) {
  return el('div', { class: 'dmp-stat' }, [
    el('span', { class: 'dmp-stat-label' }, `${label} — ${count}`),
    el('span', { class: 'dmp-chev' }, '›'),
  ]);
}

function renderChatActions() {
  const actions = $('#chatActions');
  if (!actions) return;
  actions.innerHTML = '';
  if (!state.activeChatId) return;
  const chatType = state.activeChatType;
  const chat = state.chats.find(c => c.id === state.activeChatId);
  const isBotDm = !!(chat && chat.type === 'dm' && chat.other && chat.other.is_bot);
  // Phones can't fit the full desktop action row beside a chat title — six
  // icons squeezed the title down to a couple of words and pushed the rest
  // into a hidden side-scroll. On mobile the secondary ones (pins, per-chat
  // notification level) move into the "⋯" sheet that already exists below.
  const compact = isMobileLayout();
  const overflow = [];
  let overflowBtn = null;
  if ((chatType === 'dm' || chatType === 'group' || chatType === 'voice') && !isBotDm) {
    const inCall = state.voice.channelId === state.activeChatId;
    const room = state.voiceRooms.get(state.activeChatId) || [];
    const others = room.filter(p => p.id !== state.me.id);
    if (others.length && !inCall) {
      actions.append(el('span', { class: 'in-call-chip', title: others.map(p => p.username).join(', ') },
        [icon('phone', 13), ' ' + t('voice.nInCall', { n: others.length })]));
    }
    actions.append(el('button', {
      class: inCall ? 'danger icon-btn' : 'ghost icon-btn',
      title: inCall ? 'Hang up' : (chatType === 'voice' ? 'Join voice' : 'Start call'),
      on: { click: () => toggleVoiceJoin(state.activeChatId, $('#chatTitle').textContent || 'Call') },
    }, icon(inCall ? 'phone-off' : 'phone')));
  }
  if (chatType === 'dm') {
    actions.append(el('button', {
      class: (rightPanelVisible() ? 'accent' : 'ghost') + ' icon-btn', title: t('chat.toggleProfile'),
      on: { click: toggleRightPanel },
    }, icon('user')));
  }
  // Threads next to Pins in the channel header (Discord-style) — it's
  // channel-contextual, not a server-name control.
  if (state.view === 'server' && state.serverDetail && (chatType === 'channel' || chatType === 'forum')) {
    actions.append(el('button', {
      class: 'ghost icon-btn', title: 'Active threads',
      on: { click: () => browseThreadsModal(state.serverDetail.server.id) },
    }, icon('message')));
  }
  // Pinned messages: header pin icon opening a popout, not an inline bar.
  if (chat || (state.view === 'server' && chatType !== 'voice')) {
    if (compact) {
      overflow.push({ label: 'Pinned messages', icon: 'pin', click: () => openPinsPanel(overflowBtn || actions) });
    } else {
      actions.append(el('button', {
        class: 'ghost icon-btn', title: 'Pinned messages',
        on: { click: (e) => { e.stopPropagation(); openPinsPanel(e.currentTarget); } },
      }, icon('pin')));
    }
  }
  if (state.view === 'server' && state.serverDetail) {
    actions.append(el('button', {
      class: (rightPanelVisible() ? 'accent' : 'ghost') + ' icon-btn', title: 'Members',
      on: { click: toggleRightPanel },
    }, icon('users')));
  }
  if (state.activeChatType === 'group') {
    actions.append(el('button', {
      class: 'ghost icon-btn', title: 'Group settings',
      on: { click: () => groupSettingsModal(state.activeChatId) },
    }, icon('settings')));
  }
  // Notification level menu (anyone, for any chat that isn't general)
  if (chat && chat.type !== 'general') {
    const lvl = notifLevel(chat);
    if (compact) {
      overflow.push({
        label: 'Notifications: ' + NOTIF_LABELS[lvl], icon: NOTIF_ICONS[lvl],
        click: () => openNotifMenu(chat, overflowBtn || actions),
      });
    } else {
      actions.append(el('button', {
        class: 'ghost icon-btn' + (lvl !== 'all' ? ' notif-dimmed' : ''),
        title: 'Notifications: ' + NOTIF_LABELS[lvl],
        on: { click: (e) => { e.stopPropagation(); openNotifMenu(chat, e.currentTarget); } },
      }, icon(NOTIF_ICONS[lvl])));
    }
  }
  // Rarely-used per-chat tools live behind one "⋯" overflow so the primary
  // header stays call / threads / pins / members / notifications, Discord-style.
  {
    if (overflow.length) overflow.push({ sep: true });
    if (isBotDm) {
      overflow.push({ label: t('chat.aiSettings'), icon: 'sliders', click: () => openAiSettingsModal() });
      overflow.push({ label: t('chat.clearConversation'), icon: 'trash', click: () => clearBotConversation() });
    }
    if (chat && canToggleChatFilter(chat)) {
      const isOn = chat.profanity_filter === 1
        || (chat.profanity_filter == null && chat.server_id && chat._serverFilterOn);
      overflow.push({
        label: 'Profanity filter: ' + (isOn ? 'ON' : 'OFF'), icon: isOn ? 'shield' : 'shield-off',
        click: () => filterToggleModal(state.activeChatId),
      });
    }
    if (chat && canLockChat(chat)) {
      overflow.push({ sep: true });
      overflow.push({
        label: chat.locked ? 'Unlock chat' : 'Lock chat (read-only)', icon: chat.locked ? 'unlock' : 'lock',
        danger: !chat.locked,
        click: async () => {
          try {
            await api('/api/chats/' + chat.id, { method: 'PATCH', body: JSON.stringify({ locked: chat.locked ? 0 : 1 }) });
            chat.locked = chat.locked ? 0 : 1;
            renderChatActions();
            renderComposerLockState();
          } catch (e) { alert(e.message); }
        },
      });
    }
    if (overflow.some(o => o && !o.sep)) {
      overflowBtn = el('button', {
        class: 'ghost icon-btn', title: 'More options',
        on: { click: (e) => { e.stopPropagation(); showFloatingMenu(e.currentTarget, overflow); } },
      }, icon('more-horizontal'));
      actions.append(overflowBtn);
    }
  }
  // On narrow viewports the action row can overflow and side-scroll (see CSS);
  // fade the trailing edge so a clipped icon (e.g. the bell) reads as
  // "scroll for more" instead of "broken/missing".
  requestAnimationFrame(() => {
    actions.classList.toggle('has-overflow', actions.scrollWidth > actions.clientWidth + 1);
  });
}
if (!window._hdActionsResizeBound) {
  window._hdActionsResizeBound = true;
  window.addEventListener('resize', () => renderChatActions());
}

// ─── Notification level (per chat) ────────────────────────────────────────────
const NOTIF_LABELS = { all: 'All messages', mentions: 'Only @mentions', nothing: 'Nothing' };
const NOTIF_ICONS = { all: 'bell', mentions: 'at', nothing: 'bell-off' };
// Effective level: explicit setting wins, else legacy mute maps to 'nothing',
// else everything notifies.
function notifLevel(chat) {
  if (!chat) return 'all';
  if (chat.notif_level && NOTIF_LABELS[chat.notif_level]) return chat.notif_level;
  return chat.muted ? 'nothing' : 'all';
}
function openNotifMenu(chat, anchor) {
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  closeFloatingMenus();
  const cur = notifLevel(chat);
  const menu = el('div', { class: 'floating-menu notif-menu' });
  menu.append(el('div', { class: 'notif-menu-head' }, 'Notification settings'));
  for (const level of ['all', 'mentions', 'nothing']) {
    menu.append(el('button', {
      type: 'button', class: level === cur ? 'active' : '',
      on: { click: async (e) => {
        e.stopPropagation(); closeFloatingMenus();
        if (level === cur) return;
        try {
          const r = await api('/api/chats/' + chat.id + '/notif', { method: 'POST', body: JSON.stringify({ level }) });
          chat.notif_level = r.level;
          chat.muted = r.muted ? 1 : 0;
          renderChatActions();
        } catch {}
      } },
    }, [icon(NOTIF_ICONS[level], 16), el('span', {}, NOTIF_LABELS[level]), level === cur ? icon('check', 15) : null]));
  }
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
}

async function clearBotConversation() {
  if (!(await confirmModal('Clear all messages with Nadirisim AI?'))) return;
  try {
    await api('/api/bot/messages', { method: 'DELETE' });
    $('#messages').innerHTML = '';
    state.lastChatDate = null;
  } catch (e) { alert(e.message); }
}

async function openAiSettingsModal() {
  let persona = '';
  try { const r = await api('/api/bot/persona'); persona = r.persona || ''; } catch {}
  const textarea = el('textarea', {
    class: 'ai-persona-input',
    placeholder: 'Leave blank for the default assistant persona.\n\nExample: You are a sarcastic pirate who only speaks in riddles.',
    maxlength: 500,
  });
  textarea.value = persona;
  const charCount = el('span', { class: 'ai-persona-count' }, persona.length + '/500');
  textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length + '/500'; });
  const close = () => animateOut(overlay);
  const modal = el('div', { class: 'modal ai-settings-modal' }, [
    el('div', { class: 'icon-heading', style: 'justify-content:space-between;margin-bottom:14px' }, [
      el('h3', { style: 'margin:0;display:flex;align-items:center;gap:7px' }, [icon('sparkles', 16), ' AI Settings']),
      el('button', { class: 'ghost icon-btn', on: { click: close } }, icon('x')),
    ]),
    el('label', { style: 'display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-muted)' }, 'Custom persona (system prompt)'),
    textarea,
    el('div', { class: 'ai-persona-footer' }, [charCount]),
    el('div', { class: 'modal-row', style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px' }, [
      el('button', { class: 'ghost', on: { click: close } }, 'Cancel'),
      el('button', {
        class: 'accent',
        on: { click: async () => {
          try {
            await api('/api/bot/persona', { method: 'POST', body: JSON.stringify({ persona: textarea.value.trim() }) });
            close();
          } catch (e) { alert(e.message); }
        } },
      }, 'Save'),
    ]),
  ]);
  const overlay = el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === overlay) close(); } } }, modal);
  document.body.append(overlay);
  textarea.focus();
}

function canLockChat(chat) {
  if (!chat || !state.me) return false;
  if (state.me.is_admin || state.isSuperAdmin) return true;
  if ((chat.type === 'channel' || chat.type === 'voice') && chat.server_id && state.serverDetail) {
    return canModerateChannel();
  }
  return false;
}

function renderComposerLockState() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  const input = $('#msgInput');
  const composer = document.querySelector('.composer');
  if (!input || !composer) return;
  const meCanBypass = state.me && (state.me.is_admin || state.isSuperAdmin);
  const role = state.serverDetail ? state.serverDetail.role : null;
  const channelBypass = chat && (chat.type === 'channel' || chat.type === 'voice') && (role === 'owner' || role === 'admin');
  if (chat && chat.locked && !meCanBypass && !channelBypass) {
    input.disabled = true;
    input.placeholder = 'This channel is locked (read-only).';
  } else {
    input.disabled = false;
    input.placeholder = 'Message…';
  }
}

function canToggleChatFilter(chat) {
  if (!chat || !state.me) return false;
  if (state.me.is_admin || state.isSuperAdmin) return true;
  if (chat.type === 'group' || chat.type === 'dm') return true;
  // channels: owner/admin handled via server settings panel; hide here.
  return false;
}

async function filterToggleModal(chatId) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  const hasServer = !!chat.server_id;
  const states = hasServer
    ? [['inherit', 'Inherit from server'], ['on', 'On'], ['off', 'Off']]
    : [['on', 'On'], ['off', 'Off']];
  const current = chat.profanity_filter === 1 ? 'on' : chat.profanity_filter === 0 ? 'off' : 'inherit';
  const root = document.createElement('div');
  root.className = 'standalone-modal-root';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:grid;place-items:center;z-index:400;padding:16px';
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:22px;width:380px;max-width:100%';
  const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin:12px 0' });
  for (const [val, label] of states) {
    const wrap = el('label', { class: 'check-row', style: 'cursor:pointer' }, [
      el('input', { type: 'radio', name: 'ftf', value: val, checked: val === current ? '' : null }),
      el('span', {}, label),
    ]);
    list.append(wrap);
  }
  card.append(
    el('h3', { style: 'margin:0 0 4px' }, 'Profanity filter for this chat'),
    el('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, 'Words on the global list get censored when this is on.'),
    list,
    el('div', { style: 'display:flex;justify-content:flex-end;gap:8px' }, [
      el('button', { type: 'button', class: 'ghost', on: { click: () => animateOut(root) } }, 'Cancel'),
      el('button', { type: 'button', on: { click: async () => {
        const checked = card.querySelector('input[name="ftf"]:checked');
        if (!checked) { animateOut(root); return; }
        const val = checked.value;
        const body = { profanity_filter: val === 'on' ? 1 : val === 'off' ? 0 : null };
        try {
          await api('/api/chats/' + chatId, { method: 'PATCH', body: JSON.stringify(body) });
          await loadChats(); renderChatActions();
          animateOut(root);
        } catch (e) { alert(e.message); }
      } } }, 'Save'),
    ]),
  );
  root.append(card);
  document.body.append(root);
  root.addEventListener('click', (e) => { if (e.target === root) animateOut(root); });
}

// Quick per-role access control for a server channel ("lock this channel").
// A thin, friendly wrapper over the existing channel_overrides API: each role
// gets one access level (Default / Full / Read only / No access) that maps to
// allow/deny bits for VIEW_CHANNELS + SEND_MESSAGES. Bits outside that mask
// (set via the advanced tri-state editor in Server Settings → Channels) are
// preserved untouched.
async function channelAccessModal(channel) {
  const sid = state.serverDetail && state.serverDetail.server.id;
  if (!sid) return;
  const MASK = SP.VIEW_CHANNELS | SP.SEND_MESSAGES;
  let data;
  try { data = await api('/api/servers/' + sid + '/channels/' + channel.id + '/overrides'); }
  catch (e) { alert(e.message); return; }
  const errBox = el('div', { class: 'error' });
  const levelOf = (o) => {
    const a = (o ? o.allow : 0) & MASK, d = (o ? o.deny : 0) & MASK;
    if (d & SP.VIEW_CHANNELS) return 'none';
    if (d & SP.SEND_MESSAGES) return 'read';
    if (a) return 'full';
    return 'default';
  };
  const LEVELS = [
    ['default', 'Default'],
    ['full', 'Full access'],
    ['read', 'Read only'],
    ['none', 'No access'],
  ];
  const BITS = {
    default: { allow: 0, deny: 0 },
    full: { allow: MASK, deny: 0 },
    read: { allow: SP.VIEW_CHANNELS, deny: SP.SEND_MESSAGES },
    none: { allow: 0, deny: MASK },
  };
  const roles = (data.roles || []).slice().sort((a, b) => (b.is_default - a.is_default) || (b.position - a.position));
  const list = el('div', { class: 'manage-list' });
  for (const role of roles) {
    const ov = (data.overrides || []).find(o => o.role_id === role.id);
    const sel = el('select', { style: 'width:auto;min-width:150px' },
      LEVELS.map(([v, lab]) => el('option', { value: v, selected: levelOf(ov) === v ? '' : null }, lab)));
    sel.addEventListener('change', async () => {
      errBox.textContent = '';
      const lv = BITS[sel.value];
      const oldAllow = (ov ? ov.allow : 0) & ~MASK, oldDeny = (ov ? ov.deny : 0) & ~MASK;
      sel.disabled = true;
      try {
        const r = await api('/api/servers/' + sid + '/channels/' + channel.id + '/overrides/' + role.id, {
          method: 'PUT', body: JSON.stringify({ allow: oldAllow | lv.allow, deny: oldDeny | lv.deny }),
        });
        data.overrides = r.overrides || data.overrides;
        loadServer(sid).then(() => { renderSidebar(); }).catch(() => {});
      } catch (e) { errBox.textContent = e.message; sel.value = levelOf(ov); }
      sel.disabled = false;
    });
    list.append(el('div', { class: 'manage-row' }, [
      el('span', { class: 'role-dot', style: 'background:' + (role.color || 'var(--muted)') }),
      el('strong', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
        role.is_default ? '@everyone' : role.name),
      sel,
    ]));
  }
  modal({
    title: 'Channel access — #' + (channel.name || ''),
    content: el('div', {}, [
      el('p', { class: 'muted-text', style: 'margin:0 0 10px;font-size:13px' },
        'Lock this channel by setting @everyone to "Read only" or "No access", then grant the roles that should keep access. Changes save instantly.'),
      list,
      el('p', { class: 'muted-text', style: 'margin:10px 0 0;font-size:12px' },
        'Per-member exceptions and other permissions live in Server Settings → Channels.'),
      errBox,
    ]),
    submitLabel: 'Done',
    onSubmit: () => true,
  });
}

function groupSettingsModal(chatId) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  const errBox = el('div', { class: 'error' });
  const nameInput = el('input', { value: chat.name || '', maxlength: 60 });
  const memberList = el('div', { class: 'gc-member-list' });
  const close = () => { closeModalRoot(); };

  const refreshMembers = async () => {
    memberList.innerHTML = '';
    try {
      const r = await api('/api/chats/' + chatId + '/members');
      const canKick = r.created_by === state.me.id || state.me.is_admin || state.isSuperAdmin;
      for (const m of r.members) {
        const isMe = m.id === state.me.id;
        memberList.append(el('div', { class: 'gc-member-row' }, [
          avatarEl(m, 'small'),
          el('span', { class: 'gc-member-name' }, m.display_name || m.username),
          m.id === r.created_by ? el('span', { class: 'gc-creator-badge' }, 'Creator') : null,
          (!isMe && canKick) ? el('button', { type: 'button', class: 'gc-kick-btn', title: 'Remove from group', on: { click: async () => {
            if (!(await confirmModal('Remove ' + (m.display_name || m.username) + ' from the group?'))) return;
            try {
              await api('/api/chats/' + chatId + '/kick', { method: 'POST', body: JSON.stringify({ userId: m.id }) });
              await refreshMembers();
            } catch (e) { errBox.textContent = e.message; }
          } } }, icon('x', 14)) : null,
        ]));
      }
    } catch { memberList.append(el('div', { class: 'error' }, 'Could not load members.')); }
  };

  const addInput = el('input', { placeholder: 'Add by username', maxlength: 32 });
  const addBtn = el('button', { type: 'button', class: 'ghost', on: { click: async () => {
    const un = addInput.value.trim();
    if (!un) return;
    errBox.textContent = '';
    try {
      await api('/api/chats/' + chatId + '/invite', { method: 'POST', body: JSON.stringify({ username: un }) });
      addInput.value = '';
      await refreshMembers();
    } catch (e) {
      errBox.textContent = e.message === 'not_friend' ? un + ' is not your friend.' : e.message === 'user_not_found' ? 'User not found.' : e.message;
    }
  } } }, 'Add');
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

  refreshMembers();

  modal({
    title: 'Group settings',
    content: el('div', {}, [
      el('label', {}, 'Group name'), nameInput, errBox,
      el('div', { class: 'gc-section-label' }, 'Members'),
      el('div', { class: 'gc-add-row' }, [addInput, addBtn]),
      memberList,
      el('div', { style: 'margin-top:16px;border-top:1px solid var(--border);padding-top:14px' }, [
        el('h4', { style: 'margin:0 0 8px;color:var(--danger);font-size:13px' }, 'Danger zone'),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          el('button', { type: 'button', class: 'ghost', on: { click: async () => {
            if (!(await confirmModal('Leave this group?'))) return;
            try {
              await api('/api/chats/' + chatId + '/leave', { method: 'POST' });
              await loadChats(); renderSidebar(); switchToHome(); close();
            } catch (e) { errBox.textContent = e.message; }
          } } }, 'Leave group'),
          el('button', { type: 'button', class: 'danger', on: { click: async () => {
            if (!(await confirmModal('Delete this group for everyone? This cannot be undone.'))) return;
            try {
              await api('/api/chats/' + chatId, { method: 'DELETE' });
              await loadChats(); renderSidebar(); switchToHome(); close();
            } catch (e) { errBox.textContent = e.message === 'only_creator_can_delete' ? 'Only the creator can delete the group.' : e.message; }
          } } }, 'Delete group'),
        ]),
      ]),
    ]),
    submitLabel: 'Save name',
    onSubmit: async () => {
      const name = nameInput.value.trim();
      if (!name) { errBox.textContent = 'Name required.'; return false; }
      try {
        await api('/api/chats/' + chatId, { method: 'PATCH', body: JSON.stringify({ name }) });
        await loadChats(); renderSidebar();
        $('#chatTitle').textContent = '# ' + name;
      } catch (e) { errBox.textContent = e.message; return false; }
    },
  });
}

function statusDot(m, online) {
  // Real presence is authoritative: a disconnected member is always shown offline,
  // even if their last stored status_type was "online". When connected, use their
  // chosen status (online/idle/dnd); invisible reads as offline.
  let s;
  if (!online) s = 'offline';
  else { s = (m && m.status_type) || 'online'; if (s === 'invisible' || s === 'offline') s = 'offline'; }
  return el('span', { class: 'status-dot status-' + s, title: m && m.status_text ? m.status_text : s });
}
function memberRow(m, online) {
  const dn = m.nickname || m.display_name || m.username;
  const colorRole = memberColorRole(m);
  const nameStyle = colorRole ? 'color:' + colorRole.color : '';
  const sub = m.status_text ? el('span', { class: 'member-status' }, m.status_text) : null;
  const label = sub
    ? el('div', { class: 'member-label-stack' }, [
        el('span', { class: 'label', style: nameStyle }, dn),
        sub,
      ])
    : el('span', { class: 'label', style: nameStyle }, dn);
  return el('div', { class: 'member', on: {
    click: () => openProfile(m.username),
    // Same menu as the call tiles — volume rows appear when they're in your call.
    contextmenu: (e) => {
      if (!state.me || m.id === state.me.id) return;
      e.preventDefault();
      openUserVoiceMenu({ clientX: e.clientX, clientY: e.clientY }, { id: m.id, username: m.username });
    },
  } }, [
    el('div', { class: 'member-avatar-wrap' }, [
      avatarEl(m, 'small', { serverOverride: m.server_avatar_path }),
      statusDot(m, online),
    ]),
    label,
    m.role === 'owner' ? el('span', { class: 'role', title: 'Server owner' }, [icon('crown', 12)]) : null,
    (m.timeout_until && m.timeout_until > Date.now())
      ? el('span', { class: 'timeout-badge', title: 'Timed out until ' + new Date(m.timeout_until).toLocaleString() }, [icon('volume-x', 12)])
      : null,
  ]);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function showChatView() {
  const friendsPanel = document.getElementById('friendsPanel');
  friendsPanel.style.display = 'none';
  delete friendsPanel.dataset.mobileScreen;
  document.getElementById('mainContent').style.display = 'flex';
}
// Single source of truth for the mobile/compact layout threshold — must match
// the CSS breakpoint (public/css/style.css, currently 800px) exactly. Having
// this duplicated inline at each call site is what let them drift out of sync
// with a CSS-only breakpoint change once already: CSS switched to mobile
// layout while JS still thought it was desktop, so the sidebar toggle button
// flipped the wrong class and did nothing.
const isMobileLayout = () => window.matchMedia('(max-width: 800px)').matches;
// Our own standalone pages (/updates, /support, …) opened in a new tab leave
// the back button with no history to walk — and inside the Android shell a new
// window has no `disdrocBack`, so back BACKGROUNDS the whole app instead of
// returning. On phones open them in place; desktop keeps the new tab.
const internalPageTarget = () => (isMobileLayout() ? '_self' : '_blank');
function updateMobileTabbar(active) {
  document.querySelectorAll('#mobileTabbar [data-mobile-tab]').forEach((button) => {
    const selected = button.dataset.mobileTab === active;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
// Unread counts on the tab bar. The tab bar hides itself inside a conversation,
// so without these there was no way to notice a new DM or a friend request
// while sitting on another tab — the desktop layout shows both in the sidebar
// that mobile replaced.
function updateMobileTabBadges() {
  const bar = document.getElementById('mobileTabbar');
  if (!bar) return;
  let unread = 0;
  // DMs and groups only — server-channel unread already shows as a dot on that
  // server's rail icon, and counting it here would badge Home for messages that
  // aren't in the DM list Home actually opens.
  if (state.unread) for (const u of state.unread.values()) if (!u.server_id) unread += (u.unread || 0);
  const requests = (state.friends || []).filter(f => f.status === 'pending' && f.direction === 'received').length;
  const paint = (tab, n) => {
    const button = bar.querySelector('[data-mobile-tab="' + tab + '"]');
    if (!button) return;
    let badge = button.querySelector('.mobile-tab-badge');
    if (!n) { if (badge) badge.remove(); return; }
    if (!badge) { badge = el('span', { class: 'mobile-tab-badge' }); button.append(badge); }
    badge.textContent = n > 99 ? '99+' : String(n);
  };
  paint('home', unread);
  paint('friends', requests);
}
function showMobileRoot() {
  const app = document.getElementById('app');
  app.classList.remove('chat-open', 'tab-screen', 'show-sidebar');
  updateMobileTabbar('home');
}
let mobileLayoutWasActive = isMobileLayout();
function reconcileMobileNavigation() {
  const mobile = isMobileLayout();
  if (mobile === mobileLayoutWasActive) return;
  mobileLayoutWasActive = mobile;
  const app = document.getElementById('app');
  app.classList.remove('show-sidebar');
  // Crossing the breakpoint rebuilds the navigation from state.view, so the
  // mobile-only bits of it (the "where did I come from" snapshot, the search
  // row) no longer describe anything real — carrying them across would send a
  // later back-tap to a root the user never entered from.
  mobileNavReturn = null;
  app.classList.remove('msearch');
  if (!mobile) {
    app.classList.remove('chat-open', 'tab-screen');
    if (state.view === 'you' || state.view === 'notifications') switchToFriends();
    return;
  }
  const desktopSettings = document.getElementById('settingsModalRoot');
  if (desktopSettings) {
    const tab = desktopSettings.querySelector('.settings-nav-item.active[data-tab]')?.dataset.tab || 'profile';
    desktopSettings.remove();
    openSettingsModal(tab);
    return;
  }
  if (state.view === 'friends') {
    app.classList.remove('chat-open');
    app.classList.add('tab-screen');
    updateMobileTabbar('friends');
  } else if (state.activeChatId) {
    app.classList.remove('tab-screen');
    app.classList.add('chat-open');
    updateMobileTabbar('home');
  } else {
    showMobileRoot();
  }
}
window.addEventListener('resize', reconcileMobileNavigation);
function closeMobileSidebar() {
  document.getElementById('app').classList.remove('show-sidebar');
}

// ─── Mobile push transition ──────────────────────────────────────────────────
// `.pushing` marks the ~0.26s a conversation spends sliding in. Its only job is
// to scope the compositor promotion hint in the stylesheet to the window where
// it is useful, instead of pinning a screen-sized layer for the whole session.
// (Deferring the message commit until after the slide was tried and dropped:
// profiled at 13 raster tasks inside the slide window either way, even with a
// 60-message channel and 150ms emulated latency, so it bought nothing and only
// delayed content.)
let _pushTimer = null;
function beginMobilePush() {
  const app = document.getElementById('app');
  app.classList.add('pushing');
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(endMobilePush, 340); // transitionend can be skipped
}
function endMobilePush() {
  clearTimeout(_pushTimer);
  document.getElementById('app').classList.remove('pushing');
}
document.querySelector('.main')?.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'transform' && e.target === e.currentTarget) endMobilePush();
});
// The mobile-only search row under the chat header (see #mobileSearchBtn).
function closeMobileSearch() {
  const app = document.getElementById('app');
  if (!app.classList.contains('msearch')) return false;
  app.classList.remove('msearch');
  const input = document.getElementById('headerSearch');
  if (input) { input.value = ''; input.blur(); }
  document.getElementById('searchDrop')?.remove();
  return true;
}
function closeRightPanel() {
  state.rightPanelOpen = false;
  const app = document.getElementById('app');
  app.classList.remove('show-right');
  app.classList.remove('with-right');
  $('#rightPanel').innerHTML = '';
  // The header's members/profile button paints itself from the panel's state —
  // closing via the × / scrim / back button left it stuck looking active.
  if (state.activeChatId) renderChatActions();
}
// Is the members / DM-profile panel actually on screen right now? Desktop docks
// it (visibility === state.rightPanelOpen), mobile slides it in as a drawer
// (visibility === .show-right). state.rightPanelOpen defaults to true, so on
// mobile a plain `!state.rightPanelOpen` toggle spent the first tap turning an
// invisible flag OFF — the Members / profile button looked dead until you tapped
// it twice. Derive both the toggle and the button's active styling from what the
// user can actually see.
function rightPanelVisible() {
  const app = document.getElementById('app');
  return isMobileLayout() ? app.classList.contains('show-right') : state.rightPanelOpen;
}
function toggleRightPanel() {
  const open = !rightPanelVisible();
  state.rightPanelOpen = open;
  document.getElementById('app').classList.toggle('show-right', open);
  renderRightPanel();
  renderChatActions();
}

async function switchToHome() {
  state.view = 'home'; state.serverId = null; state.serverDetail = null;
  if (isMobileLayout()) state.activeChatId = null;
  showChatView();
  renderServerRail(); renderSidebar(); renderRightPanel();
  if (isMobileLayout()) showMobileRoot();
  else { switchToFriends(); closeMobileSidebar(); }
}

async function switchToServer(serverId) {
  state.view = 'server'; state.serverId = serverId;
  showChatView();
  await loadServer(serverId);
  renderServerRail(); renderSidebar(); renderRightPanel();
  const firstText = state.serverDetail.channels.find(c => c.type === 'channel');
  if (firstText) openChat(firstText.id, { ...firstText, server_id: serverId }, { stayOnList: isMobileLayout() });
  if (isMobileLayout()) showMobileRoot();
  else closeMobileSidebar();
}

async function openDm(username) {
  const r = await api('/api/chats/dm', { method: 'POST', body: JSON.stringify({ username }) });
  await loadChats();
  renderSidebar();
  openChat(r.chatId, state.chats.find(c => c.id === r.chatId) || { id: r.chatId, type: 'dm' });
}

async function openChat(chatId, chatHint, opts = {}) {
  closeThreadPanel();
  saveDraft(state.activeChatId);
  showChatView();
  // Opening a real chat leaves whichever screen launched it — drop that view so
  // the "Active Now" right panel doesn't linger over the conversation, so a
  // later resize past 800px doesn't decide we're still on Friends/You/Inbox and
  // throw the open conversation away (a mention opened from the inbox used to),
  // and so opening a DM from a profile card while inside a server doesn't leave
  // the server's channel sidebar/banner stuck on screen over the DM.
  const prevView = state.view;
  if (state.view === 'friends' || state.view === 'you' || state.view === 'notifications' || state.view === 'server') {
    // chatHint usually has no server_id at all — /api/servers/:id's channel rows
    // never carry one (see routes.js), so a plain sidebar click passes the raw
    // channel object straight through. Relying on chatHint.server_id here reads
    // every ordinary channel switch as "left the server" and was flipping the
    // sidebar to the DM list on every click. Whether chatId is one of the
    // currently loaded server's own channels is the reliable signal instead.
    const sid = chatHint && chatHint.server_id;
    const inCurrentServer = state.view === 'server' && state.serverDetail
      && state.serverDetail.channels.some(c => c.id === chatId);
    // Only claim the 'server' view when its detail is actually loaded — the
    // server sidebar renders from state.serverDetail and would come up blank.
    state.view = inCurrentServer || (sid && state.serverDetail && state.serverDetail.server.id === sid)
      ? 'server' : 'home';
  }
  // The left panel is a different DOM tree per view (server channel list vs.
  // DM list) — swapping state.view without rebuilding it left the OLD tree on
  // screen (server sidebar showing while "in" a DM, or vice versa) until some
  // unrelated event happened to call renderSidebar() later (e.g. the next
  // message bump), which read as the bar randomly fixing/breaking itself.
  const viewChanged = state.view !== prevView;
  state.activeChatId = chatId;
  state.activeChatHint = chatHint;
  state.viewingHistory = false; // cleared until/unless we load a centred history window
  state.lastChatDate = null;
  state.activeChatType = (chatHint && chatHint.type) || 'channel';
  renderRightPanel();
  state.pendingAttachments = []; renderAttachPreview();
  state.oldestMsgTs = null;
  state.hasMoreMessages = true;
  state.loadingOlder = false;
  // Rebuild the sidebar only when the view actually flipped (server <-> home)
  // so it always matches state.view; otherwise the cheap path just swaps the
  // .active class instead of rebuilding the whole (unchanged) sidebar.
  if (viewChanged) renderSidebar();
  else updateSidebarActive(chatId);
  $('#chatTitle').textContent = chatTitle(chatHint);
  $('#chatSub').textContent = chatSub(chatHint);
  renderChatActions();
  renderVoiceBar(); // show the call view only on the channel you're in
  closeMobileSidebar();
  // A members/profile drawer or search row left open belongs to the chat you
  // just left — but only when we actually left it. Switching between channels
  // inside the SAME server isn't leaving anything, so keep the member list
  // open across that (matches switching channels while it's open elsewhere).
  if (isMobileLayout()) { closeMobileSearch(); if (viewChanged) document.getElementById('app').classList.remove('show-right'); }
  const willPush = isMobileLayout() && !opts.stayOnList;
  if (willPush) {
    const app = document.getElementById('app');
    // Put the screen into its *final* starting state before it begins moving:
    // clearing the previous conversation and dropping placeholders in halfway
    // through the slide is exactly the mid-flight invalidation to avoid.
    if (state.activeChatType !== 'forum') $('#messages').innerHTML = '';
    app.classList.remove('tab-screen');
    app.classList.add('chat-open');
    beginMobilePush();
    updateMobileTabbar('home');
  }

  if (state.activeChatType === 'forum') {
    // Forum channels don't have a flat message stream or composer — each
    // "post" is its own thread, browsed as a list and opened in the thread panel.
    $('#msgInput').disabled = true; $('#msgSend').disabled = true;
    $('#composer').classList.add('forum-hidden');
    await openForumChannel(chatId, chatHint);
    return;
  }
  $('#composer').classList.remove('forum-hidden');
  $('#msgInput').disabled = false; $('#msgSend').disabled = false;
  if (!willPush) $('#messages').innerHTML = '';
  renderComposerLockState();
  // Placeholders, but only if the history fetch is actually slow — showing them
  // immediately would flash on every fast (local/cached) load. A mobile push
  // already rendered them up front (they ride in with the slide instead of
  // appearing in the middle of it), so don't schedule a second pass.
  const skelTimer = willPush ? null : setTimeout(() => {
    const m = $('#messages');
    if (chatId === state.activeChatId && !m.firstChild) renderChatSkeleton(m);
  }, 150);

  state.pinnedIds = new Set();
  try {
    const [msgsR, pinsR] = await Promise.all([
      api(`/api/chats/${chatId}/messages${opts.around ? '?around=' + opts.around : ''}`),
      api(`/api/chats/${chatId}/pins`).catch(() => ({ pins: [] })),
    ]);
    clearTimeout(skelTimer);
    if (chatId !== state.activeChatId) return; // user switched again before we finished
    if (pinsR && pinsR.pins) for (const p of pinsR.pins) state.pinnedIds.add(p.id);
    const frag = document.createDocumentFragment();
    const msgsEl = $('#messages');
    const lastRead = (state.unread && (state.unread.get(chatId) || {}).last_read) || 0;
    let dividerDone = false;
    let lastDk = null;
    let prevMsg = null;
    for (const m of msgsR.messages) {
      const dk = dateKey(m.created_at);
      if (dk !== lastDk) { frag.append(makeDateSep(m.created_at)); lastDk = dk; prevMsg = null; }
      if (!dividerDone && lastRead > 0 && m.id > lastRead && m.user_id !== state.me.id) {
        frag.append(el('div', { class: 'new-divider' }, el('span', {}, 'NEW')));
        dividerDone = true;
        prevMsg = null;
      }
      frag.append(buildMessageNode(m, shouldGroupMessages(m, prevMsg)));
      prevMsg = (m.kind === 'call' || m.kind === 'system') ? null : m;
    }
    if (!msgsR.messages.length && !opts.around) frag.append(buildEmptyChatState(chatHint));
    state.lastChatDate = lastDk;
    msgsEl.innerHTML = '';
    msgsEl.classList.remove('chan-switch'); void msgsEl.offsetWidth; msgsEl.classList.add('chan-switch');
    msgsEl.append(frag);
    if (msgsR.messages.length) state.oldestMsgTs = msgsR.messages[0].created_at;
    if (state.socket) state.socket.emit('chat:join', chatId);
    restoreDraft(chatId);
    if (opts.around) {
      // A centred window almost always has older messages above; let scroll-up
      // self-correct if not. hasNewer means the live tail is below this window.
      state.hasMoreMessages = true;
      state.viewingHistory = !!msgsR.hasNewer;
      const target = msgsEl.querySelector(`.msg[data-id="${opts.around}"]`);
      if (target) { target.scrollIntoView({ block: 'center' }); flashMessage(target); }
      else pinToBottom();
    } else {
      if (msgsR.messages.length < 50) state.hasMoreMessages = false;
      pinToBottom();
    }
    updateJumpBottom();
    renderPinnedBar(pinsR && pinsR.pins ? pinsR.pins : []);
  } catch (e) {
    clearTimeout(skelTimer);
    if (chatId !== state.activeChatId) return; // stale request — don't clobber the newer chat
    $('#messages').innerHTML = `<div class="msg system">Can't open this chat: ${e.message}</div>`;
  }
}

// Fixed-height shimmer rows shown while a chat's history loads, so a slow
// fetch shows message-shaped structure instead of a blank pane.
function renderChatSkeleton(host) {
  for (const w of [62, 34, 78, 46, 68, 28]) {
    host.append(el('div', { class: 'skeleton-msg' }, [
      el('i', { class: 'skeleton sk-av' }),
      el('div', { class: 'sk-lines' }, [
        el('i', { class: 'skeleton' }),
        el('i', { class: 'skeleton', style: { width: w + '%' } }),
      ]),
    ]));
  }
}

function updateSidebarActive(chatId) {
  const items = document.querySelectorAll('#sidebarContent .list-item');
  for (const it of items) it.classList.remove('active');
  const target = document.querySelector(`#sidebarContent .list-item[data-chat-id="${chatId}"]`);
  if (target) target.classList.add('active');
}

function updateSidebarUnreadBadge(chatId) {
  const item = document.querySelector(`#sidebarContent .list-item[data-chat-id="${chatId}"]`);
  if (!item) return;
  const n = unreadCount(chatId);
  const hasUnread = n > 0 && chatId !== state.activeChatId;
  item.classList.toggle('has-unread', hasUnread);
  let badge = item.querySelector('.unread-badge');
  if (hasUnread) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'unread-badge'; item.append(badge); }
    badge.textContent = String(n);
  } else if (badge) {
    badge.remove();
  }
  // Update or remove the preview line.
  const chat = state.chats.find(c => c.id === chatId);
  const existingPreview = item.querySelector('.list-preview');
  if (chat && chat.last_content && hasUnread && chat.type === 'group') {
    const isMe = state.me && chat.last_user_id === state.me.id;
    const senderTag = isMe ? 'You' : (chat.last_sender || null);
    if (senderTag) {
      let preview = existingPreview;
      if (!preview) {
        preview = document.createElement('span');
        preview.className = 'list-preview';
        item.querySelector('.list-text')?.append(preview);
      }
      preview.textContent = senderTag + ': ' + chat.last_content;
    }
  } else if (existingPreview) {
    existingPreview.remove();
  }
}

// Pins moved from a persistent inline bar to a Discord-style header popout
// (see the pin button in renderChatActions). refreshPinnedBar stays as the
// data refresher other code calls on pin/unpin; renderPinnedBar now only
// tracks the ids (used to badge pinned messages) and keeps the old bar hidden.
async function refreshPinnedBar() {
  if (!state.activeChatId) return;
  const chatId = state.activeChatId;
  try {
    const r = await api(`/api/chats/${chatId}/pins`);
    if (chatId !== state.activeChatId) return;
    const pins = r && r.pins ? r.pins : [];
    state.pinnedIds = new Set(pins.map(p => p.id));
    renderPinnedBar(pins);
  } catch {}
}

function renderPinnedBar(pins) {
  const bar = $('#pinnedBar');
  if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
  state.currentPins = pins || [];
}

// Header pin button → floating panel listing this chat's pinned messages.
async function openPinsPanel(anchor) {
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  closeFloatingMenus();
  const chatId = state.activeChatId;
  if (!chatId) return;
  let pins = [];
  try {
    const r = await api(`/api/chats/${chatId}/pins`);
    pins = (r && r.pins) || [];
    state.pinnedIds = new Set(pins.map(p => p.id));
    state.currentPins = pins;
  } catch {}
  const menu = el('div', { class: 'floating-menu pins-panel' });
  menu.append(el('div', { class: 'pins-panel-title' }, [icon('pin', 13), ' Pinned messages']));
  if (!pins.length) {
    menu.append(el('div', { class: 'pins-panel-empty' }, 'No pinned messages yet — right-click a message → Pin.'));
  }
  for (const p of pins) {
    const text = p.deleted ? '(deleted)' : (p.content || '(attachment)').replace(/\s+/g, ' ').slice(0, 160);
    menu.append(el('button', {
      type: 'button', class: 'pin-bar-item' + (p.deleted ? ' deleted' : ''),
      on: { click: (e) => { e.stopPropagation(); closeFloatingMenus(); jumpToMessageId(chatId, p.id); } },
    }, [
      el('span', { class: 'pin-bar-author' }, userLabel(p)),
      el('span', { class: 'pin-bar-text' }, text),
    ]));
  }
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
}

function flashMessage(node) {
  if (!node) return;
  node.classList.remove('flash'); void node.offsetWidth; // restart the animation if re-jumped
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1400);
}

function jumpToMessage(id) {
  const node = $('#messages').querySelector(`.msg[data-id="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashMessage(node);
}

// Jump to any message by id — even one far back in history. If it's already on
// screen we just flash it; otherwise we open the chat and load a window centred
// on the message (see openChat's `around` option). Used by search + pins.
async function jumpToMessageId(chatId, messageId, chatHint) {
  if (chatId === state.activeChatId) {
    const existing = $('#messages').querySelector(`.msg[data-id="${messageId}"]`);
    if (existing) { existing.scrollIntoView({ behavior: 'smooth', block: 'center' }); flashMessage(existing); return; }
  }
  const hint = chatHint || state.chats.find(c => c.id === chatId) || { id: chatId };
  if (hint.server_id && state.serverId !== hint.server_id) { try { await switchToServer(hint.server_id); } catch {} }
  await openChat(chatId, hint, { around: messageId });
}

// Snap a centred history window back to the live tail (the "Jump to present" bar).
function jumpToPresent() {
  const id = state.activeChatId;
  if (!id) return;
  openChat(id, state.activeChatHint || state.chats.find(c => c.id === id) || { id });
}

// Search every message across every chat/channel the user can see. Results jump
// to the message in context via jumpToMessageId (loads a centred window).
function openGlobalSearch(initialQuery = '') {
  const root = $('#modalRoot');
  const close = () => closeModalRoot();
  const input = el('input', { class: 'gsearch-input', placeholder: t('search.placeholder'), autocomplete: 'off', spellcheck: 'false', value: initialQuery });
  const results = el('div', { class: 'gsearch-results' });
  const card = el('div', { class: 'modal panel-modal gsearch-modal', style: { maxWidth: '640px', minWidth: '320px' } }, [
    el('div', { class: 'panel-head' }, [
      el('h3', { style: 'margin:0' }, t('search.title')),
      el('button', { class: 'ghost', type: 'button', on: { click: close } }, t('search.close')),
    ]),
    el('div', { class: 'gsearch-box' }, [icon('search', 16), input]),
    el('div', { class: 'gsearch-hint' }, t('search.filterHint')),
    results,
  ]);
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card));
  const locationLabel = (m) => {
    if (m.chat_type === 'dm') return '@ ' + (m.dm_with || 'Direct Message');
    if (m.chat_type === 'group') return m.chat_name || 'Group';
    if (m.server_id) return '# ' + (m.chat_name || 'channel') + (m.server_name ? ' · ' + m.server_name : '');
    return m.chat_name || '';
  };
  const renderResults = (list, q) => {
    results.innerHTML = '';
    if (!list.length) { results.append(el('div', { class: 'gsearch-empty' }, t('search.noResults', { q }))); return; }
    // Strip from:/in:/has:/before:/after: tokens before building the highlight
    // regex — they're query syntax, not text that appears in the message body,
    // and an empty pattern (an all-filter, no-free-text query) would otherwise
    // match a zero-width string and wrap every character in <mark>.
    const freeText = q.replace(/\b(from|in|has|before|after):\S+/gi, '').trim();
    const rx = freeText ? new RegExp(freeText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
    for (const m of list) {
      const body = el('div', { class: 'gsearch-rbody' });
      // Escape first, then highlight, so message content can't inject markup.
      const escaped = escape((m.content || '').slice(0, 300));
      body.innerHTML = rx ? escaped.replace(rx, '<mark>$&</mark>') : escaped;
      const row = el('div', { class: 'gsearch-row', on: { click: () => {
        close();
        jumpToMessageId(m.chat_id, m.id, { id: m.chat_id, type: m.chat_type, name: m.chat_name, server_id: m.server_id });
      } } }, [
        avatarEl(m, 'small'),
        el('div', { class: 'gsearch-rmain' }, [
          el('div', { class: 'gsearch-rmeta' }, [
            el('strong', {}, userLabel(m)),
            el('span', { class: 'gsearch-rloc' }, locationLabel(m)),
            el('span', { class: 'gsearch-rtime' }, fmtTime(m.created_at)),
          ]),
          body,
        ]),
      ]);
      results.append(row);
    }
  };
  let timer = null, lastQ = null;
  const run = async () => {
    const q = input.value.trim();
    lastQ = q;
    const hasFilterToken = /\b(from|in|has|before|after):\S/.test(q);
    if (q.length < 2 && !hasFilterToken) { results.innerHTML = ''; results.append(el('div', { class: 'gsearch-empty' }, t('search.typeMore'))); return; }
    results.innerHTML = ''; results.append(el('div', { class: 'gsearch-empty' }, t('search.searching')));
    try {
      const r = await api('/api/search/messages?q=' + encodeURIComponent(q));
      if (input.value.trim() !== lastQ) return; // a newer keystroke superseded this
      renderResults(r.results || [], q);
    } catch { results.innerHTML = ''; results.append(el('div', { class: 'gsearch-empty' }, t('search.failed'))); }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  setTimeout(() => input.focus(), 0);
  run();
}

// Reconnect resync: refresh the sidebar (unreads, previews, new chats) and
// append any messages that arrived in the open chat while the socket was down.
// Without this, messages missed during a drop stay missing until a full reload.
async function resyncAfterReconnect() {
  try {
    const r = await api('/api/chats');
    if (r && Array.isArray(r.chats)) {
      state.chats = r.chats;
      if (r.generalId) state.generalId = r.generalId;
      if (state.view === 'home' || state.view === 'friends') renderSidebar();
    }
    const chatId = state.activeChatId;
    if (!chatId) return;
    const res = await api(`/api/chats/${chatId}/messages`);
    if (chatId !== state.activeChatId || !res || !Array.isArray(res.messages)) return;
    for (const m of res.messages) {
      if (document.querySelector(`.msg[data-id="${m.id}"]`)) continue;
      if (state.socket && state.socket._seenMsgs) state.socket._seenMsgs.add(m.id);
      appendMessage(m);
    }
  } catch {}
}

async function loadOlderMessages() {
  if (state.loadingOlder || !state.hasMoreMessages || !state.activeChatId || !state.oldestMsgTs) return;
  state.loadingOlder = true;
  const chatId = state.activeChatId;
  const before = state.oldestMsgTs;
  const messagesEl = $('#messages');
  const scrollHeightBefore = messagesEl.scrollHeight;
  const loader = el('div', { class: 'msg system' }, 'Loading older messages…');
  messagesEl.prepend(loader);
  try {
    const r = await api(`/api/chats/${chatId}/messages?before=${before}`);
    loader.remove();
    if (chatId !== state.activeChatId) return;
    if (!r.messages.length) { state.hasMoreMessages = false; state.loadingOlder = false; return; }
    // Build oldest-first so date separators read correctly, then prepend as one fragment
    const chunk = [...r.messages].reverse(); // oldest first
    // The message that was first in the DOM before this load may now need to
    // collapse into the chunk's tail group (same author, seconds apart, split
    // only by the pagination boundary) — remember it so we can fix it up after.
    let oldFirstMsgNode = null;
    for (const n of messagesEl.children) { if (n.classList.contains('msg') && n._msg) { oldFirstMsgNode = n; break; } }
    const frag = document.createDocumentFragment();
    let prevDk = null;
    let prevMsg = null;
    for (const m of chunk) {
      const dk = dateKey(m.created_at);
      if (dk !== prevDk) { frag.append(makeDateSep(m.created_at)); prevDk = dk; prevMsg = null; }
      frag.append(buildMessageNode(m, shouldGroupMessages(m, prevMsg)));
      prevMsg = (m.kind === 'call' || m.kind === 'system') ? null : m;
    }
    // Remove the existing top date sep if the last prepended date matches it (avoid duplicate)
    const existingTopSep = messagesEl.querySelector('.date-sep');
    if (existingTopSep && existingTopSep.dataset.dk === prevDk) existingTopSep.remove();
    messagesEl.prepend(frag);
    if (oldFirstMsgNode && !oldFirstMsgNode.classList.contains('grouped') &&
        dateKey(oldFirstMsgNode._msg.created_at) === prevDk &&
        shouldGroupMessages(oldFirstMsgNode._msg, prevMsg)) {
      oldFirstMsgNode.replaceWith(buildMessageNode(oldFirstMsgNode._msg, true));
    }
    state.oldestMsgTs = r.messages[0].created_at;
    if (r.messages.length < 50) state.hasMoreMessages = false;
    messagesEl.scrollTop = messagesEl.scrollHeight - scrollHeightBefore;
  } catch (e) {
    loader.textContent = 'Failed to load older messages: ' + e.message;
  } finally {
    state.loadingOlder = false;
  }
}

function fillComposer(text) {
  const input = $('#msgInput');
  if (!input) return;
  input.value = text;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function buildEmptyChatState(c) {
  const isBotDm = !!(c && c.type === 'dm' && c.other && c.other.is_bot);
  if (isBotDm) {
    return el('div', { class: 'empty-state chat-empty-state' }, [
      icon('sparkles', 40),
      el('p', { class: 'chat-empty-title' }, t('empty.aiDm.title')),
      el('p', {}, t('empty.aiDm.sub')),
      el('div', { class: 'chat-empty-prompts' }, [
        el('button', { class: 'ghost chat-empty-prompt', on: { click: () => fillComposer(t('empty.aiDm.prompt1')) } }, t('empty.aiDm.prompt1')),
        el('button', { class: 'ghost chat-empty-prompt', on: { click: () => fillComposer(t('empty.aiDm.prompt2')) } }, t('empty.aiDm.prompt2')),
        el('button', { class: 'ghost chat-empty-prompt', on: { click: () => fillComposer(t('empty.aiDm.prompt3')) } }, t('empty.aiDm.prompt3')),
      ]),
    ]);
  }
  if (c && c.type === 'dm') {
    const name = (c.other && (c.other.display_name || c.other.username)) || '';
    return el('div', { class: 'empty-state chat-empty-state' }, [
      icon('message', 40),
      el('p', { class: 'chat-empty-title' }, t('empty.dm.title', { name })),
    ]);
  }
  if (c && (c.type === 'channel' || c.type === 'group' || c.type === 'voice')) {
    return el('div', { class: 'empty-state chat-empty-state' }, [
      icon('hash', 40),
      el('p', { class: 'chat-empty-title' }, t('empty.channel.title', { name: c.name || '' })),
      el('p', {}, t('empty.channel.sub')),
    ]);
  }
  return null;
}
function chatTitle(c) {
  if (!c) return 'Welcome';
  if (c.type === 'general') return '# general';
  if (c.type === 'dm') {
    if (c.other) return '@ ' + (c.other.display_name || c.other.username || '(you)');
    const others = (c.members || '').split(',').filter(u => u && u !== state.me.username);
    return '@ ' + (others[0] || '(you)');
  }
  if (c.type === 'group') return '# ' + (c.name || '(group)');
  if (c.type === 'voice') return c.name;
  return '# ' + (c.name || '');
}
function chatSub(c) {
  if (!c) return '';
  if (c.type === 'general') return 'Anyone with an account is here.';
  if (c.type === 'group') return 'Group · ' + (c.members || '');
  if (c.type === 'channel') return c.topic || (state.serverDetail ? state.serverDetail.server.name : '');
  if (c.type === 'voice') return 'Voice channel';
  return '';
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function fmtCallDuration(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return 'a few seconds';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' minute' + (m === 1 ? '' : 's');
  const h = Math.floor(m / 60), mm = m % 60;
  return h + 'h' + (mm ? ' ' + mm + 'm' : '');
}
function callMessageInfo(m) {
  const meta = m.meta || {};
  const starter = m.display_name || m.username || 'Someone';
  const meStarted = m.user_id === state.me.id;
  const iJoined = (meta.participants || []).includes(state.me.id);
  const answered = !!meta.answered || (meta.participants || []).length > 1;
  if (!answered && !meStarted && !iJoined) {
    return { text: 'You missed a call from ' + starter, missed: true };
  }
  const dur = meta.duration_ms ? ' that lasted ' + fmtCallDuration(meta.duration_ms) : '';
  return { text: (meStarted ? 'You' : starter) + ' started a call' + dur + '.', missed: false };
}
function buildCallNode(m) {
  const info = callMessageInfo(m);
  return el('div', { class: 'msg call-msg' + (info.missed ? ' missed' : ''), dataset: { id: m.id, ts: m.created_at } }, [
    el('span', { class: 'call-msg-icon' }, icon(info.missed ? 'phone-off' : 'phone', 18)),
    el('span', { class: 'call-msg-text' }, info.text),
    el('span', { class: 'call-msg-time' }, fmtTime(m.created_at)),
  ]);
}

function systemMessageText(m) {
  const meta = m.meta || {};
  const me = state.me && state.me.id;
  const nm = (u) => !u ? 'Someone' : (u.id === me ? 'You' : (u.display_name || u.username || 'Someone'));
  const a = nm(meta.actor);
  const targetSelf = meta.target && meta.target.id === me;
  const t = targetSelf ? 'you' : nm(meta.target);
  switch (meta.action) {
    case 'create': return `${a} created the group`;
    case 'add': return `${a} added ${t}`;
    case 'remove': return `${a} removed ${t}`;
    case 'leave': return `${a} left the group`;
    case 'member_join': return `${a} joined the server 👋`;
    default: return m.content || '';
  }
}

function buildSystemNode(m) {
  return el('div', { class: 'msg system sys-event', dataset: { id: m.id, ts: m.created_at } }, [
    icon('users', 14),
    el('span', { class: 'sys-text' }, systemMessageText(m)),
    el('span', { class: 'sys-time' }, fmtTime(m.created_at)),
  ]);
}

// ─── Polls ────────────────────────────────────────────────────────────────────
// A poll is a normal message (content = question) with kind:'poll' and
// meta {options, multi, closed}; votes arrive with the message (poll_votes)
// and update live via the poll:vote broadcast.
function myPollPicks(m) {
  const myId = state.me && state.me.id;
  const mine = new Set();
  for (const [idx, uids] of Object.entries(m.poll_votes || {})) {
    if ((uids || []).includes(myId)) mine.add(+idx);
  }
  return mine;
}

function buildPollCard(m) {
  const meta = m.meta || {};
  const options = Array.isArray(meta.options) ? meta.options : [];
  const votes = m.poll_votes || {};
  const mine = myPollPicks(m);
  const voters = new Set();
  for (const uids of Object.values(votes)) for (const uid of (uids || [])) voters.add(uid);
  const total = Object.values(votes).reduce((s, u) => s + (u || []).length, 0);
  const card = el('div', { class: 'poll-card' + (meta.closed ? ' closed' : '') }, [
    el('div', { class: 'poll-head' }, [
      icon('bar-chart', 13),
      el('span', {}, meta.closed ? 'Poll — final results' : (meta.multi ? 'Poll — pick one or more' : 'Poll — pick one')),
    ]),
  ]);
  options.forEach((label, idx) => {
    const count = (votes[idx] || []).length;
    const pct = total ? Math.round(count * 100 / total) : 0;
    const row = el('button', {
      type: 'button',
      class: 'poll-opt' + (mine.has(idx) ? ' voted' : ''),
      title: meta.closed ? undefined : (mine.has(idx) ? 'Click to remove your vote' : 'Click to vote'),
      on: { click: () => { if (!meta.closed && !m.deleted) votePoll(m, idx); } },
    }, [
      el('span', { class: 'poll-fill', style: { width: pct + '%' } }),
      el('span', { class: 'poll-opt-label' }, [mine.has(idx) ? icon('check', 13) : null, label]),
      el('span', { class: 'poll-opt-count' }, total ? (pct + '% · ' + count) : ''),
    ]);
    if (meta.closed) row.disabled = true;
    card.append(row);
  });
  const foot = el('div', { class: 'poll-foot' }, [
    el('span', {}, voters.size + (voters.size === 1 ? ' voter' : ' voters')),
  ]);
  const canClose = !meta.closed && state.me && (m.user_id === state.me.id || state.me.is_admin);
  if (canClose) {
    foot.append(el('button', { type: 'button', class: 'ghost link-btn poll-close-btn', on: { click: async () => {
      if (!(await confirmModal('Close this poll? Voting stops and the results become final.'))) return;
      try { await api(`/api/messages/${m.id}/poll/close`, { method: 'POST', body: '{}' }); }
      catch (e) { alert('Could not close the poll: ' + e.message); }
    } } }, 'Close poll'));
  }
  card.append(foot);
  return card;
}

async function votePoll(m, idx) {
  const meta = m.meta || {};
  const mine = myPollPicks(m);
  if (mine.has(idx)) mine.delete(idx);
  else { if (!meta.multi) mine.clear(); mine.add(idx); }
  try {
    const r = await api(`/api/messages/${m.id}/poll/vote`, { method: 'POST', body: JSON.stringify({ options: [...mine] }) });
    if (r && r.votes) refreshPollNode(m.id, { votes: r.votes });
  } catch (e) {
    if (e.message === 'poll_closed') alert('This poll has been closed.');
  }
}

// In-place poll refresh: the message object lives on the DOM node (_pollMsg).
function refreshPollNode(messageId, { votes, meta }) {
  const node = document.querySelector(`.msg[data-id="${messageId}"]`);
  if (!node || !node._pollMsg) return;
  if (votes) node._pollMsg.poll_votes = votes;
  if (meta) node._pollMsg.meta = meta;
  node.querySelector('.poll-card')?.replaceWith(buildPollCard(node._pollMsg));
}

function openPollModal() {
  if (!state.activeChatId) return;
  const q = el('input', { class: 'input', maxlength: '300', placeholder: 'Ask a question…' });
  const optsBox = el('div', { class: 'poll-editor-opts' });
  const addOpt = (v = '') => {
    if (optsBox.children.length >= 10) return;
    const row = el('div', { class: 'poll-editor-row' }, [
      el('input', { class: 'input', maxlength: '100', placeholder: 'Option ' + (optsBox.children.length + 1), value: v }),
      el('button', { type: 'button', class: 'ghost', title: 'Remove option', on: { click: () => { if (optsBox.children.length > 2) row.remove(); } } }, '×'),
    ]);
    optsBox.append(row);
  };
  addOpt(); addOpt();
  const multi = el('input', { type: 'checkbox' });
  modal({
    title: 'Create a poll',
    content: el('div', {}, [
      el('label', {}, 'Question'), q,
      el('label', { style: 'margin-top:10px;display:block' }, 'Answers'),
      optsBox,
      el('button', { type: 'button', class: 'ghost poll-editor-add', on: { click: () => addOpt() } }, '+ Add option'),
      el('label', { class: 'check-row' }, [multi, el('span', {}, 'Allow choosing multiple answers')]),
    ]),
    submitLabel: 'Post poll',
    onSubmit: () => {
      const question = q.value.trim();
      const options = [...optsBox.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
      if (!question || options.length < 2) { alert('A poll needs a question and at least two answers.'); return false; }
      state.socket.emit('message:send', {
        chatId: state.activeChatId, content: question,
        poll: { options, multi: multi.checked },
      }, (ack) => { if (ack && ack.error) alert('Could not post the poll: ' + ack.error); });
      return true;
    },
  });
}

// Consecutive messages from the same author land in one visual "group": only
// the first shows avatar/name/time, the rest collapse into compact rows (the
// timestamp reappears in the avatar gutter on hover). Mirrors Discord's rule
// of thumb — same author, no reply/forward/pin breaking the context, within
// a few minutes of the previous message.
const MSG_GROUP_WINDOW_MS = 5 * 60 * 1000;
function shouldGroupMessages(m, prev) {
  if (!m || !prev) return false;
  if (!m.user_id || m.user_id !== prev.user_id) return false;
  if (m.reply_to || m.forwarded_from) return false;
  if (m.pinned || prev.pinned) return false;
  const gap = new Date(m.created_at) - new Date(prev.created_at);
  return gap >= 0 && gap <= MSG_GROUP_WINDOW_MS;
}
// Last rendered chat message still carrying its model (skips date/unread
// dividers and non-message rows like call/system entries).
function lastRealMessageNode(container) {
  for (let n = container && container.lastElementChild; n; n = n.previousElementSibling) {
    if (n.classList.contains('msg') && n._msg) return n;
  }
  return null;
}

function buildMessageNode(m, grouped) {
  if (m.kind === 'call') return buildCallNode(m);
  if (m.kind === 'system') return buildSystemNode(m);
  if (state.blockedIds && state.blockedIds.has(m.user_id)) {
    return el('div', { class: 'msg blocked', dataset: { id: m.id } }, [
      el('span', { class: 'muted-text' }, '🚫 message from a blocked user — '),
      el('button', { class: 'ghost link-btn', on: { click: (e) => {
        const node = e.target.closest('.msg.blocked');
        if (node) node.replaceWith(buildMessageNodeRaw(m));
      } } }, 'show'),
    ]);
  }
  return buildMessageNodeRaw(m, grouped);
}

function buildMessageNodeRaw(m, grouped) {
  if (m.pinned) state.pinnedIds.add(m.id);
  const isPinned = state.pinnedIds.has(m.id);
  // A reply pinged you when reply_ping is set and the message it replies to is yours.
  const pingedMe = !!(m.reply_ping && m.reply_to && m.reply_to.user_id === state.me?.id);
  const replyEl = m.reply_to ? el('div', {
    class: 'reply-context' + (pingedMe ? ' reply-pinged-me' : ''),
    on: { click: () => { const t = document.querySelector(`.msg[data-id="${m.reply_to.id}"]`); if (t) t.scrollIntoView({ block: 'center' }); } },
  }, [
    el('span', { class: 'reply-arrow' }, [icon('corner-up-left', 12)]),
    el('span', { class: 'reply-name' + (m.reply_ping ? ' pings' : '') }, (m.reply_ping ? '@' : '') + (m.reply_to.username || '?')),
    el('span', { class: 'reply-text' }, m.reply_to.deleted ? '(deleted)' : (m.reply_to.content || '').slice(0, 80)),
  ]) : null;
  const fwdEl = m.forwarded_from ? el('div', { class: 'forwarded-context' }, [
    el('span', {}, [icon('forward', 12), ' Forwarded from @' + (m.forwarded_from.username || '?')]),
  ]) : null;
  // Pin/reply/forward all need their own attribution line, so they never collapse.
  grouped = !!grouped && !isPinned && !replyEl && !fwdEl;
  let lead;
  if (grouped) {
    lead = el('span', { class: 'msg-lead-time', title: new Date(m.created_at).toLocaleString() }, fmtTime(m.created_at));
  } else {
    lead = avatarEl(m, '', { serverOverride: serverAvatarFor(m.user_id) });
    if (m.user_id) lead.dataset.uid = m.user_id;
    if (m.username) {
      lead.style.cursor = 'pointer';
      lead.addEventListener('click', () => openProfile(m.username));
    }
  }
  const headEl = grouped ? (m.deleted ? null : el('div', { class: 'msg-hover-actions' }, [
    el('button', {
      class: 'msg-quick-reply', title: 'Reply',
      on: { click: (e) => { e.stopPropagation(); startReply(m); document.getElementById('msgInput')?.focus(); } },
    }, [icon('corner-up-left', 13)]),
    el('button', {
      class: 'msg-menu-btn', title: 'More',
      on: { click: (e) => { e.stopPropagation(); openMessageMenu(e.currentTarget, m); } },
    }, '⋯'),
  ])) : el('div', { class: 'head' }, [
    m.pinned ? el('span', { class: 'pin-icon', title: 'Pinned' }, [icon('pin', 12)]) : null,
    (() => { const c = nameColorForUser(m.user_id); const nick = serverNickFor(m.user_id); const displayName = nick || userLabel(m); const nameEl = el('span', { class: 'name clickable', title: 'Click: profile · Shift+click: @mention', style: c ? 'color:' + c : '', on: { click: (e) => { if (e.shiftKey && m.username) { insertAtCaret(document.getElementById('msgInput'), '@' + m.username + ' '); document.getElementById('msgInput')?.focus(); return; } m.username && openProfile(m.username); } } }, displayName); if (m.is_bot || (state.botUserId && m.user_id === state.botUserId)) { const badge = botBadge(displayName, !!(state.botUserId && m.user_id === state.botUserId)); if (badge) nameEl.append(badge); } return nameEl; })(),
    el('span', { class: 'time', title: new Date(m.created_at).toLocaleString() }, fmtTime(m.created_at)),
    m.edited_at ? el('span', { class: 'edited' }, '(edited)') : null,
    !m.deleted ? el('button', {
      class: 'msg-quick-reply', title: 'Reply',
      on: { click: (e) => { e.stopPropagation(); startReply(m); document.getElementById('msgInput')?.focus(); } },
    }, [icon('corner-up-left', 13)]) : null,
    !m.deleted ? el('button', {
      class: 'msg-menu-btn', title: 'More',
      on: { click: (e) => { e.stopPropagation(); openMessageMenu(e.currentTarget, m); } },
    }, '⋯') : null,
  ]);
  const body = el('div', { class: 'body' + (grouped ? ' grouped-body' : '') }, [
    replyEl, fwdEl,
    headEl,
    (m.kind === 'embed' && !m.content) ? null : (() => { const t = el('div', { class: 'text' + (m.kind === 'poll' ? ' poll-question' : '') }); setMessageText(t, m.content, m.deleted); return t; })(),
    (grouped && m.edited_at) ? el('span', { class: 'edited grouped-edited' }, '(edited)') : null,
    (m.kind === 'poll' && !m.deleted) ? buildPollCard(m) : null,
    (m.kind === 'embed' && !m.deleted) ? buildEmbedCard(m) : null,
    m.attachments && m.attachments.length ? renderAttachments(m.attachments) : null,
    (() => {
      // Spotify links get a real player; the plain link-preview card would be redundant.
      const sp = m.deleted ? null : spotifyEmbedEl(m.content);
      if (sp) return sp;
      return m.link_preview ? renderLinkPreview(m.link_preview) : null;
    })(),
    buildReactionsBar(m),
    m.thread ? buildThreadPill(m) : null,
  ]);
  const wrap = el('div', {
    class: 'msg' + (m.deleted ? ' deleted' : '') + (isPinned ? ' pinned' : '') + (grouped ? ' grouped' : ''),
    dataset: { id: m.id, uid: m.user_id, ts: m.created_at },
  }, [lead, body]);
  wrap._raw = m.content;
  wrap._msg = m;
  if (m.kind === 'poll') wrap._pollMsg = m;
  if (!m.deleted) {
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Pending/optimistic nodes have the menu button stripped — no menu yet.
      if (!wrap.querySelector('.msg-menu-btn')) return;
      openMessageMenu({ clientX: e.clientX, clientY: e.clientY }, m);
    });
    wrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('a, button, img, .reactions-bar, .reply-context')) return;
      startReply(m);
      document.getElementById('msgInput')?.focus();
    });
  }
  return wrap;
}

// ─── Optimistic send: render a grayed-out "sending" bubble immediately, then
// swap it for the real message once the server confirms (or mark it failed).
function buildOptimisticNode(m, nonce, grouped) {
  const node = buildMessageNode(m, grouped);
  node.classList.add('pending');
  node.dataset.nonce = nonce;
  // The temp id isn't a real message yet — no context menu / reactions / contextmenu edit.
  node.querySelector('.msg-menu-btn')?.remove();
  return node;
}

// Replace a pending bubble (matched by nonce) with the confirmed message node.
// Returns true if a pending bubble was found and reconciled.
function reconcileOptimistic(m) {
  if (!m || !m.nonce) return false;
  const pending = document.querySelector(`#messages .msg[data-nonce="${cssEscape(m.nonce)}"]`);
  if (!pending) return false;
  pending.replaceWith(buildMessageNode(m, pending.classList.contains('grouped')));
  return true;
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

function markOptimisticFailed(nonce, text) {
  const pending = document.querySelector(`#messages .msg.pending[data-nonce="${cssEscape(nonce)}"]`);
  if (!pending) return;
  pending.classList.remove('pending');
  pending.classList.add('send-failed');
  playUi('error');
  const head = pending.querySelector('.head');
  if (head && !head.querySelector('.send-failed-note')) {
    head.append(el('span', { class: 'send-failed-note' }, [
      icon('alert-triangle', 12), ' Not delivered — ',
      el('button', { type: 'button', class: 'retry-send', on: { click: () => { pending.remove(); resendMessage(text); } } }, 'retry'),
      ' · ',
      el('button', { type: 'button', class: 'retry-send', on: { click: () => pending.remove() } }, 'delete'),
    ]));
  }
}

// Inline Spotify player for the first open.spotify.com link in a message.
// Respects the "Show inline images and GIFs from links" privacy toggle.
const SPOTIFY_LINK_RE = /https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/i;
function spotifyEmbedEl(content) {
  if (localStorage.getItem('disdroc_inline_media') === 'off') return null;
  const m = SPOTIFY_LINK_RE.exec(content || '');
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const tall = kind === 'album' || kind === 'playlist' || kind === 'artist' || kind === 'show';
  return el('iframe', {
    class: 'spotify-embed' + (tall ? ' tall' : ''),
    src: `https://open.spotify.com/embed/${kind}/${m[2]}`,
    loading: 'lazy',
    allow: 'encrypted-media; fullscreen',
    title: 'Spotify player',
  });
}

// Bot-sent rich card (message.kind === 'embed', meta = {title, description,
// imageUrl, color}) — used by the bot API's optional `embed` field, e.g. the
// Welcome Bot marketplace preset's greeting picture. Unlike renderLinkPreview
// (small thumbnail, auto-generated from a pasted URL) this is bot-authored and
// shows the image full-width, Discord-embed style.
function buildEmbedCard(m) {
  const e = m.meta || {};
  if (!e.title && !e.description && !e.imageUrl) return null;
  return el('div', { class: 'bot-embed', style: e.color ? `border-left-color:${e.color}` : '' }, [
    (e.title || e.description) ? el('div', { class: 'be-body' }, [
      e.title ? el('div', { class: 'be-title' }, e.title) : null,
      e.description ? el('div', { class: 'be-desc' }, e.description) : null,
    ]) : null,
    e.imageUrl ? el('div', { class: 'be-image' }, el('img', { src: e.imageUrl, loading: 'lazy', referrerpolicy: 'no-referrer' })) : null,
  ]);
}

function renderLinkPreview(p) {
  if (!p || (!p.title && !p.description && !p.image)) return null;
  return el('a', { class: 'link-preview', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, [
    p.image ? el('div', { class: 'lp-image' }, el('img', { src: p.image, loading: 'lazy', referrerpolicy: 'no-referrer' })) : null,
    el('div', { class: 'lp-body' }, [
      p.site_name ? el('div', { class: 'lp-site' }, p.site_name) : null,
      p.title ? el('div', { class: 'lp-title' }, p.title) : null,
      p.description ? el('div', { class: 'lp-desc' }, p.description) : null,
    ]),
  ]);
}

const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🎉','🔥','💀'];
const REACTION_PICKER = ['👍','👎','❤️','🔥','🎉','😂','😍','🤔','😮','😢','😡','😭','🥳','😎','😴','🙏','🙌','👏','👀','💀','💯','✨','✅','❌','🤝','🫡','🤯','🥺','😅','😤','🤩','💪'];

function buildReactionsBar(m) {
  const bar = el('div', { class: 'reactions-bar' });
  const reactions = m.reactions || {};
  const keys = Object.keys(reactions);
  if (!keys.length) return bar;
  const names = m.reactionNames || {};
  for (const emoji of keys) {
    const users = reactions[emoji] || [];
    if (!users.length) continue;
    const mine = users.includes(state.me.id);
    // Build a "who reacted" tooltip.
    const labels = users.map(uid => uid === state.me.id ? 'You' : (names[uid] || 'Someone'));
    const shown = labels.slice(0, 12).join(', ');
    const extra = labels.length > 12 ? ` and ${labels.length - 12} more` : '';
    const customName = (/^:([a-z0-9_]{1,32}):$/i.exec(emoji) || [])[1];
    const customPath = customName ? (state.myEmojis || []).find(e => e.name.toLowerCase() === customName.toLowerCase())?.stored_path : null;
    const face = customPath ? el('img', { class: 'reaction-emoji-img', src: '/api/emoji/' + customPath, alt: emoji }) : el('span', {}, emoji);
    bar.append(el('button', {
      class: 'reaction-chip' + (mine ? ' mine' : ''), type: 'button',
      title: `${shown}${extra} reacted with ${emoji}`,
      on: { click: () => state.socket.emit('message:react', { messageId: m.id, emoji }) },
    }, [face, el('span', { class: 'count' }, String(users.length))]));
  }
  return bar;
}

function openReactionPicker(m) {
  const anchor = document.querySelector(`.msg[data-id="${m.id}"]`) || document.body;
  openFloatingPicker(anchor, (e) => {
    state.socket.emit('message:react', { messageId: m.id, emoji: e.custom ? ':' + e.name + ':' : e.char });
  }, true);
}

// ─── Threads ─────────────────────────────────────────────────────────────────
// A thread is just another chat id branched off a root message in a server
// channel (see server/routes.js). The panel is a lightweight self-managed
// overlay (not panelModal) so socket pushes can append into it directly
// without a full re-render wiping scroll position.

function buildThreadPill(m) {
  const th = m.thread;
  if (!th) return null;
  const count = th.reply_count || 0;
  return el('button', {
    class: 'thread-pill', type: 'button',
    on: { click: () => openThread(m) },
  }, [
    icon('message', 14),
    el('span', { class: 'thread-pill-count' }, count === 1 ? '1 reply' : `${count} replies`),
    th.last_message_at ? el('span', { class: 'thread-pill-time' }, fmtTime(th.last_message_at)) : null,
    th.locked ? icon('lock', 12) : null,
  ]);
}

// Live-refresh the pill under a root message from a thread:created/activity push.
function updateThreadPill(parentMessageId, info) {
  const node = document.querySelector(`#messages .msg[data-id="${parentMessageId}"]`);
  if (!node) return;
  const body = node.querySelector('.body');
  if (!body) return;
  const fake = { id: parentMessageId, thread: { chatId: info.chatId, name: info.name, locked: !!info.locked, reply_count: info.reply_count, last_message_at: info.last_message_at } };
  const pill = node.querySelector('.thread-pill');
  const built = buildThreadPill(fake);
  if (pill) pill.replaceWith(built); else body.append(built);
}

async function startThread(m) {
  let thread;
  try {
    thread = (await api('/api/messages/' + m.id + '/thread', { method: 'POST', body: JSON.stringify({}) })).thread;
  } catch (e) {
    alert('Could not start a thread here.');
    return;
  }
  m.thread = { chatId: thread.chatId, name: thread.name, locked: thread.locked, reply_count: thread.reply_count, last_message_at: thread.last_message_at };
  updateThreadPill(m.id, m.thread);
  openThreadPanel({ chatId: thread.chatId, name: thread.name, parentMessageId: m.id, parentChatId: state.activeChatId, locked: thread.locked });
}

function openThread(m) {
  if (!m.thread) return;
  openThreadPanel({ chatId: m.thread.chatId, name: m.thread.name, parentMessageId: m.id, parentChatId: state.activeChatId, locked: m.thread.locked });
}

function closeThreadPanel() {
  document.querySelector('.thread-panel-bg')?.remove();
  state.threadPanel = null;
}

function canModerateThread(info) {
  if (!state.me) return false;
  if (info.createdBy && info.createdBy === state.me.id) return true;
  return canModerateChannel();
}

async function openThreadPanel(info) {
  closeThreadPanel();
  const root = $('#modalRoot');
  const msgList = el('div', { class: 'thread-messages' });
  const inputEl = el('textarea', { class: 'thread-input', placeholder: t('thread.replyPlaceholder') || 'Reply in thread…', rows: 1 });
  const sendBtn = el('button', { class: 'ghost', type: 'submit', title: 'Send' }, [icon('arrow-right', 16)]);
  const composer = el('form', { class: 'thread-composer' }, [inputEl, sendBtn]);
  const headActions = [];
  if (canModerateThread(info)) {
    headActions.push(el('button', {
      class: 'ghost icon-btn', type: 'button', title: 'Thread actions',
      on: { click: (e) => { e.stopPropagation(); openThreadModMenu(e.currentTarget, info); } },
    }, icon('more-horizontal', 16)));
  }
  headActions.push(el('button', { class: 'ghost', type: 'button', on: { click: closeThreadPanel } }, 'Close'));
  const card = el('div', { class: 'modal panel-modal thread-panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h3', { style: 'margin:0;display:flex;align-items:center;gap:8px' }, [icon('message', 18), info.name || 'Thread']),
      el('div', { style: 'display:flex;align-items:center;gap:6px' }, headActions),
    ]),
    msgList,
    info.locked ? el('div', { class: 'muted-text thread-locked-note' }, [icon('lock', 13), ' This thread is archived — replies are disabled.']) : composer,
  ]);
  root.append(el('div', { class: 'modal-bg thread-panel-bg', on: { click: (e) => { if (e.target === e.currentTarget) closeThreadPanel(); } } }, card));

  state.threadPanel = { chatId: info.chatId, parentMessageId: info.parentMessageId, parentChatId: info.parentChatId, container: msgList };
  state.socket.emit('chat:join', info.chatId);

  try {
    const { messages } = await api('/api/chats/' + info.chatId + '/messages');
    let prevMsg = null;
    for (const mm of messages) {
      msgList.append(buildMessageNode(mm, shouldGroupMessages(mm, prevMsg)));
      prevMsg = (mm.kind === 'call' || mm.kind === 'system') ? null : mm;
    }
    msgList.scrollTop = msgList.scrollHeight;
  } catch {}

  function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    const nonce = 'th' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    state.socket.emit('message:send', { chatId: info.chatId, content: text, nonce }, (ack) => {
      if (ack && ack.error === 'slowmode') showSlowmodeBanner(ack.retryAfter || 5);
      else if (ack && ack.error) alert('Message not sent: ' + ack.error);
    });
  }
  if (!info.locked) {
    composer.addEventListener('submit', (e) => { e.preventDefault(); send(); });
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }
}

function openThreadModMenu(anchor, info) {
  showFloatingMenu(anchor, [
    {
      label: info.locked ? 'Unlock thread' : 'Lock thread', icon: info.locked ? 'unlock' : 'lock',
      click: async () => {
        try {
          await api('/api/chats/' + info.chatId, { method: 'PATCH', body: JSON.stringify({ locked: info.locked ? 0 : 1 }) });
          info.locked = info.locked ? 0 : 1;
          openThreadPanel(info);
        } catch (e) { alert(e.message); }
      },
    },
    { sep: true },
    {
      label: 'Delete thread', icon: 'trash', danger: true,
      click: async () => {
        if (!(await confirmModal('Delete this thread? This removes it and every reply in it — this can\'t be undone.'))) return;
        try {
          await api('/api/chats/' + info.chatId, { method: 'DELETE' });
          closeThreadPanel();
          if (info.parentMessageId) document.querySelector(`#messages .msg[data-id="${info.parentMessageId}"] .thread-pill`)?.remove();
          info.onDeleted && info.onDeleted();
        } catch (e) { alert(e.message); }
      },
    },
  ]);
}

// ─── Forum channels ──────────────────────────────────────────────────────────
// A forum channel's "posts" are threads under the hood (see server/routes.js);
// the container itself has no message stream, so it gets its own list view
// rendered into #messages, and each post reuses openThreadPanel to view/reply.

async function openForumChannel(chatId, chatHint) {
  const msgsEl = $('#messages');
  msgsEl.innerHTML = '';
  const list = el('div', { class: 'forum-post-list' });
  const countLabel = el('div', { class: 'forum-count muted-text' });
  const wrap = el('div', { class: 'forum-view' }, [
    el('div', { class: 'forum-toolbar' }, [
      countLabel,
      el('button', { class: 'accent', type: 'button', on: { click: () => newForumPostModal(chatId, load) } }, [icon('plus', 16), 'New Post']),
    ]),
    list,
  ]);
  msgsEl.append(wrap);
  async function load() {
    list.innerHTML = '';
    let data;
    try { data = await api(`/api/servers/${state.serverId}/channels/${chatId}/posts`); } catch (e) {
      countLabel.textContent = '';
      list.append(forumEmptyState('inbox', "Couldn't load posts", 'Try again in a moment.'));
      return;
    }
    if (chatId !== state.activeChatId) return;
    if (!data.posts.length) {
      countLabel.textContent = '';
      list.append(forumEmptyState('inbox', 'No posts yet', 'Start the first discussion in this forum.'));
      return;
    }
    countLabel.textContent = `${data.posts.length} post${data.posts.length === 1 ? '' : 's'}`;
    for (const p of data.posts) list.append(forumPostRow(p, chatId, load));
  }
  await load();
}

function forumEmptyState(iconName, title, subtitle) {
  return el('div', { class: 'forum-empty' }, [icon(iconName, 32), el('p', {}, title), el('span', {}, subtitle)]);
}

function forumPostRow(p, forumChatId, onDeleted) {
  const author = p.root_display_name || p.root_username || 'someone';
  const when = p.last_message_at || p.created_at;
  return el('div', {
    class: 'forum-post-row',
    on: { click: () => openThreadPanel({
      chatId: p.chat_id, name: p.name, parentMessageId: null, parentChatId: forumChatId,
      locked: !!p.locked, createdBy: p.root_user_id, onDeleted,
    }) },
  }, [
    avatarEl({ display_name: p.root_display_name, username: p.root_username, avatar_path: p.root_avatar_path }, 'small'),
    el('div', { class: 'forum-post-body' }, [
      el('div', { class: 'forum-post-title' }, [p.locked ? icon('lock', 13) : null, p.name || '(untitled post)']),
      el('div', { class: 'forum-post-preview' }, (p.root_content || '').slice(0, 140)),
      el('div', { class: 'forum-post-meta' }, `${author} · ${fmtTime(when)}`),
    ]),
    el('div', { class: 'forum-post-replies' }, [icon('message', 13), String(p.reply_count)]),
  ]);
}

function newForumPostModal(forumChatId, onDone) {
  const errBox = el('div', { class: 'error' });
  modal({
    title: 'New Post',
    content: el('div', {}, [
      el('label', {}, 'Title'),
      el('input', { name: 'title', required: true, maxlength: 100 }),
      el('label', {}, 'Message'),
      el('textarea', { name: 'content', rows: 4, required: true, maxlength: 2000 }),
      errBox,
    ]),
    submitLabel: 'Post',
    onSubmit: async (form) => {
      const f = new FormData(form);
      try {
        await api(`/api/servers/${state.serverId}/channels/${forumChatId}/posts`, {
          method: 'POST', body: JSON.stringify({ title: f.get('title'), content: f.get('content') }),
        });
        onDone && onDone();
      } catch (e) { errBox.textContent = e.message; return false; }
    },
  });
}

// Browse every active thread in the server (most-recently-active first) —
// lets you find a live discussion without hunting through every channel.
async function browseThreadsModal(serverId) {
  panelModal({
    title: 'Active Threads',
    render: async (body, refresh, close) => {
      let data;
      try { data = await api('/api/servers/' + serverId + '/threads'); } catch { data = { threads: [] }; }
      if (!data.threads.length) {
        body.append(el('p', { class: 'muted-text' }, 'No active threads yet — right-click a message in a channel and choose "Reply in Thread" to start one.'));
        return;
      }
      const list = el('div', { class: 'manage-list' });
      for (const th of data.threads) {
        const rootAuthor = th.root_display_name || th.root_username || 'someone';
        list.append(el('div', {
          class: 'list-item', style: 'cursor:pointer',
          on: { click: () => {
            close();
            const chan = (state.serverDetail && state.serverDetail.channels || []).find(c => c.id === th.parent_chat_id);
            const info = { chatId: th.chat_id, name: th.name, parentMessageId: th.parent_message_id, parentChatId: th.parent_chat_id, locked: !!th.locked };
            if (chan) openChat(chan.id, chan).then(() => openThreadPanel(info));
            else openThreadPanel(info);
          } },
        }, [
          el('div', { class: 'list-text' }, [
            el('span', { class: 'label' }, th.name || `${rootAuthor}: ${(th.root_content || '').slice(0, 60)}`),
            el('span', { class: 'list-preview' }, `#${th.parent_channel_name || 'channel'} · ${th.reply_count} repl${th.reply_count === 1 ? 'y' : 'ies'}`),
          ]),
        ]));
      }
      body.append(list);
    },
  });
}

function openMessageMenu(anchor, m) {
  const isMine = m.user_id === state.me.id;
  const canEdit = isMine && (Date.now() - m.created_at) < 15 * 60 * 1000;
  const canDelete = isMine || canModerateChannel();
  const isSaved = state.savedIds.has(m.id);
  const items = [
    { label: t('menu.react'), icon: 'smile', click: () => openReactionPicker(m) },
    { label: t('menu.reply'), icon: 'corner-up-left', click: () => startReply(m) },
    { label: t('menu.forward'), icon: 'forward', click: () => forwardMessageDialog(m) },
    { label: isSaved ? t('menu.unsave') : t('menu.save'), icon: isSaved ? 'bookmark-check' : 'bookmark', click: () => toggleSaveMessage(m) },
    (state.activeChatType === 'channel' && !m.thread) ? { label: t('menu.startThread') || 'Reply in Thread', icon: 'message', click: () => startThread(m) } : null,
    m.thread ? { label: t('menu.openThread') || 'Open Thread', icon: 'message', click: () => openThread(m) } : null,
    { sep: true },
    m.content ? { label: t('menu.copyText'), icon: 'copy', click: () => navigator.clipboard?.writeText(m.content).catch(() => {}) } : null,
    { label: t('menu.copyId'), icon: 'hash', click: () => navigator.clipboard?.writeText(String(m.id)).catch(() => {}) },
  ];
  if (state.me.is_admin || state.isSuperAdmin || canModerateChannel()) {
    const isPinned = state.pinnedIds.has(m.id);
    items.push({ label: isPinned ? t('menu.unpin') : t('menu.pin'), icon: 'pin', click: () => state.socket.emit('message:pin', { messageId: m.id, pin: !isPinned }) });
  }
  if (canEdit) items.push({ label: t('menu.edit'), icon: 'pencil', click: () => editMessage(m) });
  items.push({ sep: true });
  if (canDelete) items.push({ label: t('menu.delete'), icon: 'trash', danger: true, click: () => deleteMessage(m) });
  if (!isMine) {
    items.push({ label: t('menu.report'), icon: 'alert-triangle', click: () => reportMessage(m) });
    items.push({ label: t('menu.block'), icon: 'ban', danger: true, click: () => blockUser(m.user_id, m.username) });
  }
  // Quick server moderation right from the message that annoyed you — timeout/kick/
  // ban the author without hunting through Server Settings → Members. The server
  // re-checks hierarchy/perms regardless of what's shown here (modErr surfaces it).
  if (!isMine && (state.activeChatType === 'channel' || state.activeChatType === 'thread') && state.serverId) {
    const authorMember = (state.serverDetail && state.serverDetail.members.find(x => x.id === m.user_id))
      || { id: m.user_id, username: m.username, display_name: m.display_name };
    if (authorMember.role !== 'owner') {
      const modItems = [];
      if (hasServerPerm(SP.MODERATE_MEMBERS)) {
        modItems.push({ label: 'Timeout', icon: 'volume-x', click: () => timeoutMemberModal(state.serverId, authorMember, () => { if (state.view === 'server') renderRightPanel(); }) });
      }
      if (hasServerPerm(SP.KICK_MEMBERS)) {
        modItems.push({ label: 'Kick from server', icon: 'log-out', danger: true, click: async () => {
          if (!(await confirmModal('Kick ' + (authorMember.display_name || authorMember.username) + ' from this server?'))) return;
          try { await api(`/api/servers/${state.serverId}/members/${authorMember.id}`, { method: 'DELETE' }); }
          catch (e) { alert(modErr(e.message)); }
        } });
      }
      if (hasServerPerm(SP.BAN_MEMBERS)) {
        modItems.push({ label: 'Ban from server', icon: 'ban', danger: true, click: () => banMemberModal(state.serverId, authorMember, () => {}) });
      }
      if (modItems.length) items.push({ sep: true }, ...modItems);
    }
  }
  showFloatingMenu(anchor, items);
}

// Shared builder for icon-row context menus. `items` is a list of
// {label, icon?, danger?, click} rows and {sep:true} separators; null/false
// entries are skipped and leading/trailing/doubled separators collapse away.
function showFloatingMenu(anchor, items, cls) {
  closeFloatingMenus();
  const rows = items.filter(Boolean);
  while (rows.length && rows[0].sep) rows.shift();
  while (rows.length && rows[rows.length - 1].sep) rows.pop();
  if (!rows.length) return;
  const menu = el('div', { class: 'floating-menu fm-icons' + (cls ? ' ' + cls : '') });
  let prevSep = false;
  for (const it of rows) {
    if (it.sep) {
      if (!prevSep) menu.append(el('div', { class: 'fm-sep' }));
      prevSep = true;
      continue;
    }
    prevSep = false;
    if (it.custom) {
      // Interactive row (e.g. the per-user volume slider). stopPropagation keeps
      // the document-level once-click closer armed for a real outside click.
      menu.append(el('div', { class: 'fm-custom', on: { click: (e) => e.stopPropagation() } }, it.custom));
      continue;
    }
    menu.append(el('button', {
      class: it.danger ? 'danger' : '', type: 'button',
      on: { click: (e) => { e.stopPropagation(); closeFloatingMenus(); it.click(); } },
    }, [it.icon ? icon(it.icon, 16) : null, el('span', { class: 'fm-label' }, it.label)]));
  }
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
  return menu;
}

const FLOATING_MENU_TRACKERS = new WeakMap();

function floatingViewportBounds() {
  const viewport = window.visualViewport;
  const left = viewport ? viewport.offsetLeft : 0;
  const top = viewport ? viewport.offsetTop : 0;
  const width = viewport ? viewport.width : window.innerWidth;
  const height = viewport ? viewport.height : window.innerHeight;
  return { left, top, right: left + width, bottom: top + height };
}

function layoutFloatingMenu(menu, anchor) {
  menu.style.position = 'fixed';
  menu.style.visibility = 'hidden';
  menu.style.top = '0px';
  menu.style.left = '0px';
  // `anchor` is either a DOM element or a {clientX, clientY} cursor point
  // (right-click menus open at the pointer, Discord-style).
  const isPoint = typeof anchor.getBoundingClientRect !== 'function';
  const r = isPoint
    ? { top: anchor.clientY, bottom: anchor.clientY, left: anchor.clientX, right: anchor.clientX }
    : anchor.getBoundingClientRect();
  // offsetWidth/Height ignore the opening scale animation, so the first
  // placement uses the menu's real final size instead of its animated frame.
  const mh = menu.offsetHeight || 200;
  const mw = menu.offsetWidth || 160;
  const viewport = floatingViewportBounds();
  const pad = 8;
  let top = r.bottom + 4;
  let flippedUp = false;
  const above = r.top - mh - 4;
  const roomBelow = viewport.bottom - pad - top;
  const roomAbove = r.top - 4 - (viewport.top + pad);
  if (top + mh > viewport.bottom - pad && roomAbove > roomBelow) {
    top = above;
    flippedUp = true;
  }
  const minTop = viewport.top + pad;
  const maxTop = Math.max(minTop, viewport.bottom - mh - pad);
  top = Math.max(minTop, Math.min(maxTop, top));
  const preferredLeft = isPoint ? r.left : r.right - mw;
  const minLeft = viewport.left + pad;
  const maxLeft = Math.max(minLeft, viewport.right - mw - pad);
  const left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
  menu.style.transformOrigin = (flippedUp ? 'bottom' : 'top') + ' ' + (isPoint ? 'left' : 'right');
  menu.style.visibility = 'visible';
}

function stopFloatingMenuTracking(menu) {
  const tracker = FLOATING_MENU_TRACKERS.get(menu);
  if (!tracker) return;
  tracker.stop();
  FLOATING_MENU_TRACKERS.delete(menu);
}

function trackFloatingMenu(menu, anchor) {
  const prior = FLOATING_MENU_TRACKERS.get(menu);
  if (prior) { prior.anchor = anchor; return; }

  const tracker = { anchor, raf: null, resizeObserver: null, domObserver: null };
  const stop = () => {
    if (tracker.raf != null) cancelAnimationFrame(tracker.raf);
    tracker.resizeObserver?.disconnect();
    tracker.domObserver?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    document.removeEventListener('scroll', schedule, true);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
  };
  const valid = () => {
    if (!menu.isConnected || menu.classList.contains('anim-out')) { stopFloatingMenuTracking(menu); return false; }
    const currentAnchor = tracker.anchor;
    if (typeof currentAnchor.getBoundingClientRect === 'function' && !currentAnchor.isConnected) {
      // Call controls are rebuilt in place. Keeping a menu tied to the removed
      // button would leave stale pixels that no longer describe any live UI.
      animateOut(menu, 180);
      return false;
    }
    return true;
  };
  const schedule = () => {
    if (!valid() || tracker.raf != null) return;
    tracker.raf = requestAnimationFrame(() => {
      tracker.raf = null;
      if (valid()) layoutFloatingMenu(menu, tracker.anchor);
    });
  };
  tracker.stop = stop;
  FLOATING_MENU_TRACKERS.set(menu, tracker);

  if (typeof ResizeObserver === 'function') {
    tracker.resizeObserver = new ResizeObserver(schedule);
    tracker.resizeObserver.observe(menu);
    if (typeof anchor.getBoundingClientRect === 'function') tracker.resizeObserver.observe(anchor);
  }
  // ResizeObserver catches content growth; this observer's separate job is to
  // notice when a call rerender detaches the button the menu was anchored to.
  tracker.domObserver = new MutationObserver(() => {
    if (!valid()) return;
    if (!tracker.resizeObserver) schedule();
  });
  tracker.domObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('scroll', schedule, true);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
}

function positionFloatingMenu(menu, anchor) {
  trackFloatingMenu(menu, anchor);
  layoutFloatingMenu(menu, anchor);
}

function closeFloatingMenus() {
  for (const m of document.querySelectorAll('.floating-menu')) animateOut(m, 180);
}

function armOutsideClose(menu) {
  setTimeout(() => {
    // NOT a one-shot listener: the in-call popovers (voice fx, soundboard,
    // people volume, screen-share options) are panels you click INSIDE several
    // times before clicking away. A {once:true} listener is spent by that first
    // inside click, after which no outside click can ever close the menu again.
    // Stay armed until the menu actually goes away.
    const off = () => document.removeEventListener('click', onDocClick, true);
    function onDocClick(e) {
      // A menu row may have closed this menu before an outside click happened.
      // Drop the stale listener, but never swallow that later click.
      if (!menu.isConnected || menu.classList.contains('anim-out')) { off(); return; }
      if (menu.contains(e.target)) return; // still open — keep listening
      off();
      e.stopPropagation();
      e.preventDefault();
      closeFloatingMenus();
    }
    document.addEventListener('click', onDocClick, { capture: true });
  }, 0);
}

// Arrow-key navigation for any open floating menu (Enter activates the
// focused row; Escape is already handled by the global key handler).
document.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const menu = document.querySelector('.floating-menu:not(.anim-out)');
  if (!menu) return;
  const btns = [...menu.querySelectorAll('button:not(:disabled)')];
  if (!btns.length) return;
  e.preventDefault();
  const cur = btns.indexOf(document.activeElement);
  let next;
  if (e.key === 'ArrowDown') next = cur < 0 ? 0 : (cur + 1) % btns.length;
  else if (e.key === 'ArrowUp') next = cur < 0 ? btns.length - 1 : (cur - 1 + btns.length) % btns.length;
  else if (e.key === 'Home') next = 0;
  else next = btns.length - 1;
  btns[next].focus();
});

// Discord-style account popover from the bottom-left user panel:
// change online/idle/dnd/invisible + set a custom status text.
function openStatusPopover(anchor) {
  if (document.querySelector('.status-popover')) { closeFloatingMenus(); return; }
  closeFloatingMenus();
  const me = state.me;
  const menu = el('div', { class: 'floating-menu status-popover' });

  menu.append(el('div', { class: 'sp-head' }, [
    avatarEl(me, 'small'),
    el('div', { class: 'sp-head-info' }, [
      el('div', { class: 'sp-name' }, userLabel(me)),
      el('div', { class: 'sp-sub' }, me.status_text ? ((me.status_emoji ? me.status_emoji + ' ' : '') + me.status_text) : t('status.' + (me.status_type || 'online'))),
    ]),
  ]));

  // Custom status text
  const customInput = el('input', { class: 'sp-custom', placeholder: 'Set a custom status', maxlength: 60, value: me.status_text || '' });
  const saveCustom = async () => {
    const text = customInput.value.trim();
    await setStatus(me.status_type || 'online', text || null);
    state.me.status_text = text || '';
    renderMe(); closeFloatingMenus();
    if (anchor.closest?.('.mobile-you-profile')) showMobileYouScreen();
  };
  customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveCustom(); } });
  menu.append(el('div', { class: 'sp-sep' }));
  menu.append(el('div', { class: 'sp-custom-row' }, [
    customInput,
    me.status_text ? el('button', { type: 'button', class: 'sp-clear', title: 'Clear status', on: { click: (e) => { e.stopPropagation(); customInput.value = ''; saveCustom(); } } }, '×') : null,
    el('button', { type: 'button', class: 'sp-save', title: 'Save', on: { click: (e) => { e.stopPropagation(); saveCustom(); } } }, '✓'),
  ]));

  // Quick custom-status presets — compact single emoji row (label via tooltip).
  const presets = [['🎮', 'Gaming'], ['📺', 'Watching'], ['🎧', 'Listening'], ['💻', 'Working'], ['📚', 'Studying'], ['💤', 'Away']];
  menu.append(el('div', { class: 'sp-presets' }, presets.map(([em, txt]) =>
    el('button', { type: 'button', class: 'sp-preset', title: txt, on: { click: async (e) => {
      e.stopPropagation();
      await setStatus(me.status_type || 'online', txt, em);
      state.me.status_text = txt; state.me.status_emoji = em;
      renderMe(); closeFloatingMenus();
      if (anchor.closest?.('.mobile-you-profile')) showMobileYouScreen();
    } } }, em)
  )));
  menu.append(el('div', { class: 'sp-sep' }));

  const options = [
    { key: 'online', label: t('status.online') },
    { key: 'idle', label: t('status.idle') },
    { key: 'dnd', label: t('status.dnd'), sub: t('status.dndSub') },
    { key: 'invisible', label: t('status.invisible'), sub: t('status.invisibleSub') },
  ];
  for (const o of options) {
    menu.append(el('button', {
      type: 'button', class: 'sp-option' + ((me.status_type || 'online') === o.key ? ' active' : ''),
      on: { click: async (e) => {
        e.stopPropagation();
        await setStatus(o.key, me.status_text || null);
        state.me.status_type = o.key;
        renderMe(); closeFloatingMenus();
        if (anchor.closest?.('.mobile-you-profile')) showMobileYouScreen();
      } },
    }, [
      el('span', { class: 'status-dot status-' + (o.key === 'invisible' ? 'offline' : o.key) }),
      el('div', { class: 'sp-opt-text' }, [ el('div', {}, o.label), o.sub ? el('div', { class: 'sp-opt-sub' }, o.sub) : null ]),
    ]));
  }

  menu.append(el('div', { class: 'sp-sep' }));
  menu.append(el('button', { type: 'button', class: 'sp-option', on: { click: (e) => { e.stopPropagation(); closeFloatingMenus(); openSettingsModal('profile'); } } }, [
    el('span', { class: 'sn-icon' }, icon('settings', 18)), el('div', { class: 'sp-opt-text' }, el('div', {}, 'Edit Profile')),
  ]));

  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  menu.addEventListener('click', (e) => e.stopPropagation());
  armOutsideClose(menu);
}

function startReply(m) {
  state.replyTo = m;
  // Default to the user's last ping choice; never ping yourself.
  state.replyPing = (m.user_id === state.me?.id) ? false : (localStorage.getItem('disdroc_reply_ping') !== 'off');
  renderAttachPreview();
  $('#msgInput').focus();
}
function clearReply() {
  state.replyTo = null;
  renderAttachPreview();
}

async function reportMessage(m) {
  const reason = prompt('Why are you reporting this message? (optional)');
  if (reason === null) return; // cancel
  try {
    await api('/api/messages/' + m.id + '/report', { method: 'POST', body: JSON.stringify({ reason: (reason || '').slice(0, 300) }) });
    alert('Thanks — admins will review this report.');
  } catch (e) {
    alert(e.message === 'already_reported' ? 'You already reported this message.' : ('Could not report: ' + e.message));
  }
}

// Cap how many message nodes live in the DOM. Long sessions in a busy chat
// otherwise grow the page without bound (nodes + decoded images = RAM). Pruned
// history isn't lost — scrolling up re-fetches it via loadOlderMessages().
const MAX_DOM_MSGS = 400;
function pruneOldMessages(msgs) {
  const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 600;
  if (!nearBottom) return; // never yank content out from under someone reading history
  let count = msgs.querySelectorAll('.msg').length;
  while (count > MAX_DOM_MSGS && msgs.firstElementChild) {
    const first = msgs.firstElementChild;
    if (first.classList.contains('msg')) count--;
    first.remove();
  }
  // Drop a now-leading date separator and fix up the "load older" bookkeeping.
  while (msgs.firstElementChild && msgs.firstElementChild.classList.contains('date-sep') &&
         msgs.firstElementChild.nextElementSibling && msgs.firstElementChild.nextElementSibling.classList.contains('date-sep')) {
    msgs.firstElementChild.remove();
  }
  const top = msgs.querySelector('.msg[data-ts]');
  if (top && top.dataset.ts) {
    state.oldestMsgTs = +top.dataset.ts;
    state.hasMoreMessages = true;
  }
}

function appendMessage(m) {
  // While viewing a centred history window (jumped via search/pin), don't splice
  // live messages onto the end — they belong at the live tail, which isn't shown.
  // They'll appear when the user hits "Jump to present".
  if (state.viewingHistory) return;
  const msgs = $('#messages');
  msgs.querySelector('.chat-empty-state')?.remove();
  const dk = dateKey(m.created_at);
  let prevNode = null;
  if (dk !== state.lastChatDate) { msgs.append(makeDateSep(m.created_at)); state.lastChatDate = dk; }
  else prevNode = lastRealMessageNode(msgs);
  const node = buildMessageNode(m, prevNode ? shouldGroupMessages(m, prevNode._msg) : false);
  node.classList.add('msg-enter');
  msgs.append(node);
  pruneOldMessages(msgs);
  // Drop the class after the entrance so re-renders/scrolling don't replay it.
  setTimeout(() => node.classList.remove('msg-enter'), 400);
}

const EXEC_RE = /\.(exe|sh|bat|cmd|msi|app|dmg|jar|deb|rpm|apk|com|scr|vbs|ps1|pkg|run|bin|elf|iso|ipa|appimage)$/i;
const SPOILER_RE = /^spoiler[-_]/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg|heic|heif)(\?|$)/i;

// How an explicit attachment should appear to the current viewer.
//   lock  = under-18 (or unknown): never load it, show a permanent hidden cover.
//   cover = blur it behind a click-to-reveal cover (adults whose "show NSFW" pref is off).
function nsfwView(a) {
  if (!a || !a.nsfw) return { nsfw: false, cover: false, lock: false };
  const adult = !!(state.me && state.me.is_adult);
  const showPref = !!(state.me && (state.me.show_nsfw === 1 || state.me.show_nsfw === true));
  return { nsfw: true, lock: !adult, cover: !(adult && showPref) };
}
function nsfwLockedTile(label) {
  return el('div', { class: 'attach-image nsfw-locked' }, [
    el('div', { class: 'nsfw-cover' }, [icon('eye-off', 20),
      el('div', { class: 'nsfw-main' }, label || 'Explicit content'),
      el('div', { class: 'nsfw-sub' }, 'Hidden — 18+ only')]),
  ]);
}

function renderAttachments(atts) {
  const box = el('div', { class: 'attachments' });
  for (const a of atts) {
    const url = '/api/attachments/' + a.id;
    const mime = a.mime_type || '';
    const isSpoiler = SPOILER_RE.test(a.filename || '');
    // Treat it as an image by extension too — some uploads (phone photos, HEIC, or
    // anything the browser sent as application/octet-stream) arrive without an
    // image/* mime and would otherwise render as a generic file icon.
    const isImage = mime.startsWith('image/') ||
      (!mime.startsWith('video/') && !mime.startsWith('audio/') && IMAGE_EXT_RE.test(a.filename || ''));
    const nv = nsfwView(a);
    if (isImage) {
      if (nv.lock) { box.append(nsfwLockedTile('Explicit image')); continue; }
      const thumbSrc = a.thumbnail_path ? '/api/thumb/' + a.thumbnail_path : url;
      const img = el('img', { src: thumbSrc, alt: nv.nsfw ? 'explicit image' : a.filename, loading: 'lazy' });
      // If a thumbnail 404s or fails to decode, fall back to the original file so a
      // missing thumb never shows up as a broken-image icon.
      if (thumbSrc !== url) img.addEventListener('error', () => { if (!img._fellBack) { img._fellBack = true; img.src = url; } });
      const covered = nv.cover || isSpoiler || localStorage.getItem('disdroc_blur_media') === '1';
      const link = el('a', {
        class: 'attach-image' + (isSpoiler ? ' spoiler-attach' : '') + (nv.nsfw ? ' nsfw-attach' : '') + (covered ? ' media-blur' : ''),
        href: url, title: nv.nsfw ? 'Explicit content' : a.filename,
        on: { click: (e) => { e.preventDefault(); if (link.classList.contains('media-blur')) { link.classList.remove('media-blur'); return; } openImageLightbox(atts, a); } },
      }, img);
      if (nv.nsfw) link.append(el('div', { class: 'nsfw-cover' }, [icon('eye-off', 20),
        el('div', { class: 'nsfw-main' }, 'Explicit content'), el('div', { class: 'nsfw-sub' }, 'Click to reveal')]));
      else if (isSpoiler) link.append(el('div', { class: 'spoiler-cover' }, 'SPOILER'));
      box.append(link);
    } else if (mime.startsWith('video/')) {
      if (nv.lock) { box.append(nsfwLockedTile('Explicit video')); continue; }
      if (nv.nsfw && nv.cover) {
        // Show a cover; swap in the real <video> only after the user reveals it.
        const holder = el('div', { class: 'attach-image nsfw-attach nsfw-tile media-blur', title: 'Explicit content' });
        holder.append(el('div', { class: 'nsfw-cover' }, [icon('eye-off', 20),
          el('div', { class: 'nsfw-main' }, 'Explicit video'), el('div', { class: 'nsfw-sub' }, 'Click to reveal')]));
        holder.addEventListener('click', () => {
          holder.classList.remove('media-blur'); holder.innerHTML = '';
          holder.append(el('video', { class: 'attach-video', src: url, controls: '', preload: 'metadata' }));
        }, { once: true });
        box.append(holder);
      } else {
        box.append(el('video', { class: 'attach-video', src: url, controls: '', preload: 'metadata' }));
      }
    } else if (mime.startsWith('audio/')) {
      const isVoiceNote = /^voicenote/i.test(a.filename || '') || /\.(webm|ogg|mp3|m4a|opus)$/i.test(a.filename) && (a.size < 1024*1024);
      box.append(el('div', { class: isVoiceNote ? 'voice-note' : '' }, [
        isVoiceNote ? el('span', { class: 'vn-icon' }, '🎙') : null,
        el('audio', { src: url, controls: '', preload: 'metadata' }),
      ]));
    } else {
      const isExec = EXEC_RE.test(a.filename);
      const wrap = el('div', { class: 'attachment-wrap' }, [
        el('a', { class: 'attachment' + (isExec ? ' warn' : ''), href: url, target: '_blank', download: a.filename, rel: 'noopener noreferrer' }, [
          el('span', { class: 'name' }, [icon(isExec ? 'alert-triangle' : 'paperclip', 13), ' ' + a.filename]),
          el('span', { class: 'size' }, fmtSize(a.size)),
        ]),
        isExec ? el('div', { class: 'attachment-warn' }, [icon('alert-triangle', 13), ' Executable file from another user. Only run files you trust.']) :
                 el('div', { class: 'attachment-note' }, 'File will be downloaded — only open from people you trust.'),
      ]);
      box.append(wrap);
    }
  }
  return box;
}

function isImageAttachment(a) {
  const mime = a.mime_type || '';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return false;
  return mime.startsWith('image/') || IMAGE_EXT_RE.test(a.filename || '');
}

function openImageLightbox(atts, current) {
  // Skip explicit images the viewer isn't allowed to reveal (under-18) so the
  // lightbox never tries to load one (the server would 403 it anyway).
  const images = (atts || []).filter(a => isImageAttachment(a) && !nsfwView(a).lock);
  if (!images.length) return;
  let idx = images.findIndex(a => a.id === current.id);
  if (idx < 0) idx = 0;

  const overlay = el('div', { class: 'lightbox' });
  const imgEl = el('img', { class: 'lightbox-img zoomable' });
  const caption = el('div', { class: 'lightbox-caption' });
  const openLink = el('a', { class: 'lightbox-open', target: '_blank', rel: 'noopener' }, 'Open original');

  // ── Zoom + pan state ──
  let scale = 1, tx = 0, ty = 0;
  const MIN = 1, MAX = 6;
  function applyTransform() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    imgEl.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    overlay.classList.toggle('zoomed', scale > 1);
  }
  function resetZoom() { scale = 1; tx = 0; ty = 0; imgEl.style.transition = 'transform .14s ease'; applyTransform(); }
  function setZoom(next, cx, cy) {
    next = Math.max(MIN, Math.min(MAX, next));
    if (next === scale) return;
    const rect = imgEl.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const ox = (cx == null ? center.x : cx) - center.x;
    const oy = (cy == null ? center.y : cy) - center.y;
    const ratio = next / scale;
    tx -= ox * (ratio - 1);
    ty -= oy * (ratio - 1);
    scale = next;
    if (scale === MIN) { tx = 0; ty = 0; }
    imgEl.style.transition = 'transform .12s ease';
    applyTransform();
  }

  function show(i) {
    idx = (i + images.length) % images.length;
    const a = images[idx];
    const full = '/api/attachments/' + a.id;
    const thumb = a.thumbnail_path ? '/api/thumb/' + a.thumbnail_path : null;
    // Prefer the full-resolution original, but if it can't be decoded (e.g. a HEIC the
    // browser can't render, or a missing file) fall back to the generated thumbnail so
    // the viewer never shows a broken-image icon.
    imgEl.onerror = () => { if (imgEl.dataset.fallback !== '1' && thumb) { imgEl.dataset.fallback = '1'; imgEl.src = thumb; } };
    imgEl.dataset.fallback = '';
    imgEl.src = full;
    caption.textContent = `${a.filename} (${idx + 1}/${images.length})`;
    openLink.href = full;
    resetZoom();
  }

  const close = () => { animateOut(overlay); document.removeEventListener('keydown', onKey); };
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === '+' || e.key === '=') setZoom(scale + 0.5);
    else if (e.key === '-' || e.key === '_') setZoom(scale - 0.5);
    else if (e.key === '0') resetZoom();
  }

  // Scroll wheel zooms toward the cursor.
  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
  }, { passive: false });
  // Double-click toggles 1× ⇄ 2.5× at the cursor.
  imgEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (scale > 1) resetZoom(); else setZoom(2.5, e.clientX, e.clientY);
  });
  // Drag to pan when zoomed in.
  let dragging = false, startX = 0, startY = 0;
  imgEl.addEventListener('pointerdown', (e) => {
    if (scale <= 1) return;
    dragging = true; startX = e.clientX - tx; startY = e.clientY - ty;
    imgEl.style.transition = 'none';
    try { imgEl.setPointerCapture(e.pointerId); } catch {}
    imgEl.style.cursor = 'grabbing'; e.preventDefault();
  });
  imgEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = e.clientX - startX; ty = e.clientY - startY; applyTransform(); imgEl.style.cursor = 'grabbing';
  });
  const endDrag = () => { if (dragging) { dragging = false; imgEl.style.cursor = scale > 1 ? 'grab' : 'zoom-in'; } };
  imgEl.addEventListener('pointerup', endDrag);
  imgEl.addEventListener('pointercancel', endDrag);
  // A plain click on the image (when not zoomed) zooms in; keep clicks from closing.
  imgEl.addEventListener('click', (e) => { e.stopPropagation(); if (scale === 1) setZoom(2.5, e.clientX, e.clientY); });

  const prevBtn = el('button', { class: 'lightbox-prev', on: { click: (e) => { e.stopPropagation(); show(idx - 1); } } }, '‹');
  const nextBtn = el('button', { class: 'lightbox-next', on: { click: (e) => { e.stopPropagation(); show(idx + 1); } } }, '›');
  if (images.length < 2) { prevBtn.style.display = 'none'; nextBtn.style.display = 'none'; }
  openLink.addEventListener('click', () => setTimeout(close, 100));

  const zoomCtrls = el('div', { class: 'lightbox-zoom' }, [
    el('button', { type: 'button', title: 'Zoom out (−)', on: { click: (e) => { e.stopPropagation(); setZoom(scale - 0.5); } } }, '−'),
    el('button', { type: 'button', title: 'Reset (0)', on: { click: (e) => { e.stopPropagation(); resetZoom(); } } }, '⤢'),
    el('button', { type: 'button', title: 'Zoom in (+)', on: { click: (e) => { e.stopPropagation(); setZoom(scale + 0.5); } } }, '+'),
  ]);

  overlay.append(
    el('button', { class: 'lightbox-close', on: { click: close } }, '×'),
    prevBtn,
    imgEl,
    nextBtn,
    caption,
    zoomCtrls,
    openLink,
  );
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  show(idx);
}

function scrollToBottom() {
  const m = $('#messages');
  m.scrollTop = m.scrollHeight;
  const jb = $('#jumpBottom'); if (jb) jb.classList.remove('is-visible');
}

// Keep the view pinned to the bottom while late content settles. A single
// scrollTop assignment isn't enough right after a chat opens: messages use
// content-visibility (heights are estimates until rendered — way off on
// narrow phones where lines wrap) and images/embeds load in afterwards, so
// scrollHeight keeps growing for a moment. Re-pin every frame until heights
// stop changing, and stop immediately if the user scrolls on their own.
let _pinCancel = null;
function pinToBottom(ms = 1500) {
  const m = $('#messages');
  if (_pinCancel) _pinCancel();
  let cancelled = false;
  const cancel = () => {
    cancelled = true; _pinCancel = null;
    m.removeEventListener('touchstart', cancel);
    m.removeEventListener('wheel', cancel);
  };
  _pinCancel = cancel;
  m.addEventListener('touchstart', cancel, { passive: true });
  m.addEventListener('wheel', cancel, { passive: true });
  const until = performance.now() + ms;
  let lastH = -1, stableFrames = 0;
  (function step() {
    if (cancelled) return;
    m.scrollTop = m.scrollHeight;
    stableFrames = (m.scrollHeight === lastH) ? stableFrames + 1 : 0;
    lastH = m.scrollHeight;
    // ~20 unchanged frames in a row = layout has settled, stop early.
    if (performance.now() >= until || stableFrames > 20) { cancel(); return; }
    requestAnimationFrame(step);
  })();
  const jb = $('#jumpBottom'); if (jb) jb.classList.remove('is-visible');
}

function editMessage(m) {
  const node = document.querySelector(`.msg[data-id="${m.id}"]`);
  // Prefer the live DOM text (node._raw is refreshed on every edit) over the
  // captured message object's .content, which is NOT updated after an edit —
  // seeding from the stale object reloads the pre-edit text and reverts the change.
  const content = (node && node._raw != null) ? node._raw : (m.content != null ? m.content : '');
  startInlineEdit(node, m.id, content);
}
async function deleteMessage(m) {
  if (!(await confirmModal('Delete this message?'))) return;
  state.socket.emit('message:delete', { messageId: m.id });
}

// ─── Composer + attachments ───────────────────────────────────────────────────

function uploadFile(file) {
  const capMB = (state.me && state.me.is_admin) ? 100 : 5;
  if (file.size > capMB * 1024 * 1024) { alert('Files must be ' + capMB + ' MB or less.'); return Promise.resolve(null); }
  const entry = { name: file.name, progress: 0 };
  state.activeUploads.push(entry);
  renderAttachPreview();
  return new Promise((resolve) => {
    const fd = new FormData(); fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) { entry.progress = Math.round(e.loaded / e.total * 100); renderAttachPreview(); }
    });
    const finish = (result) => {
      state.activeUploads = state.activeUploads.filter(u => u !== entry);
      renderAttachPreview();
      resolve(result);
    };
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { finish(JSON.parse(xhr.responseText).attachment); } catch { alert('Upload failed: invalid response'); finish(null); }
      } else {
        try {
          const j = JSON.parse(xhr.responseText);
          if (j.error === 'quota_exceeded') alert('Daily file limit reached.');
          else if (j.error === 'file_too_large') alert('That file is too large (max ' + capMB + ' MB).');
          else if (j.error === 'nsfw_minor_blocked') alert('That image/video looks explicit. You must be 18+ to send explicit media.');
          else if (j.error === 'nsfw_rejected') alert('That file looks explicit and was blocked by the content filter.');
          else alert('Upload failed: ' + (j.error || xhr.status));
        } catch { alert('Upload failed: ' + xhr.status); }
        finish(null);
      }
    });
    xhr.addEventListener('error', () => { alert('Upload failed: network error'); finish(null); });
    xhr.send(fd);
  });
}

function renderAttachPreview() {
  const p = $('#attachPreview'); p.innerHTML = '';
  if (state.replyTo) {
    const isSelf = state.replyTo.user_id === state.me?.id;
    // Discord-style ping toggle: pings the author you're replying to (lands in their
    // mentions inbox + notifies). Hidden when replying to yourself.
    const pingBtn = isSelf ? null : el('button', {
      type: 'button',
      class: 'reply-ping-toggle' + (state.replyPing ? ' on' : ''),
      title: state.replyPing ? 'Replying with a ping — click to silence' : 'Silent reply — click to ping',
      on: { click: () => {
        state.replyPing = !state.replyPing;
        localStorage.setItem('disdroc_reply_ping', state.replyPing ? 'on' : 'off');
        renderAttachPreview();
        $('#msgInput').focus();
      } },
    }, '@ ' + (state.replyPing ? 'ON' : 'OFF'));
    p.append(el('span', { class: 'chip reply-chip' }, [
      icon('corner-up-left', 12), ' Replying to @' + (state.replyTo.username || '?') + ': ' + (state.replyTo.content || '').slice(0, 60),
      pingBtn,
      el('button', { type: 'button', class: 'reply-chip-x', on: { click: clearReply } }, '×'),
    ]));
  }
  for (const u of state.activeUploads) {
    const pct = u.progress;
    const chip = el('span', { class: 'chip uploading-chip' }, [
      el('span', { class: 'upload-spinner' }),
      ' ' + u.name,
      el('span', { class: 'upload-pct' }, pct > 0 ? ' ' + pct + '%' : '…'),
    ]);
    if (pct > 0) chip.style.setProperty('--upload-pct', pct + '%');
    p.append(chip);
  }
  for (const a of state.pendingAttachments) {
    p.append(el('span', { class: 'chip' }, [
      icon('paperclip', 12), ' ' + a.filename + ' (' + fmtSize(a.size) + ')',
      el('button', { type: 'button', on: { click: () => { state.pendingAttachments = state.pendingAttachments.filter(x => x !== a); renderAttachPreview(); } } }, '×'),
    ]));
  }
}

// The "+" button opens a small menu (File / Poll / GIF / Voice note), Discord
// style — files also arrive via drag-drop and paste, so the extra click for
// uploads is cheap and polls get a discoverable home.
$('#attachBtn').addEventListener('click', () => {
  openComposerMore($('#attachBtn'));
});

function openComposerMore(anchor) {
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  closeFloatingMenus();
  const items = [
    { icon: 'circle-plus', label: 'Upload file', click: () => $('#fileInput').click() },
    { icon: 'bar-chart', label: 'Create poll', click: () => openPollModal() },
    { icon: 'gif', label: 'GIF', click: () => openGifPicker() },
    { icon: 'mic', label: voiceNoteRec ? 'Stop recording' : 'Voice message',
      click: () => (voiceNoteRec ? stopVoiceNote(true) : startVoiceNote()) },
  ];
  const menu = el('div', { class: 'floating-menu composer-more' });
  for (const it of items) {
    menu.append(el('button', {
      type: 'button',
      on: { click: (e) => { e.stopPropagation(); closeFloatingMenus(); it.click(); } },
    }, [icon(it.icon, 18), el('span', {}, it.label)]));
  }
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
}
$('#fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) {
    const a = await uploadFile(f);
    if (a) { state.pendingAttachments.push(a); renderAttachPreview(); }
  }
  e.target.value = '';
});
$('#msgInput').addEventListener('paste', async (e) => {
  if (!state.activeChatId) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const images = [];
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) images.push(it);
  }
  if (!images.length) return;
  e.preventDefault();
  for (const it of images) {
    const blob = it.getAsFile();
    if (!blob) continue;
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const named = new File([blob], `paste-${Date.now()}.${ext}`, { type: blob.type });
    const a = await uploadFile(named);
    if (a) { state.pendingAttachments.push(a); renderAttachPreview(); }
  }
});

// Drag-and-drop files anywhere over the chat area to upload them.
(function setupDropUpload() {
  const main = document.querySelector('.main');
  if (!main) return;
  main.append(el('div', { class: 'drop-overlay' }, el('div', { class: 'drop-inner' }, 'Drop files to upload')));
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let depth = 0;
  main.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !state.activeChatId) return; e.preventDefault(); depth++; main.classList.add('dragging'); });
  main.addEventListener('dragover', (e) => { if (!hasFiles(e) || !state.activeChatId) return; e.preventDefault(); });
  main.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth--; if (depth <= 0) { depth = 0; main.classList.remove('dragging'); } });
  main.addEventListener('drop', async (e) => {
    if (!hasFiles(e) || !state.activeChatId) return;
    e.preventDefault(); depth = 0; main.classList.remove('dragging');
    for (const f of e.dataTransfer.files) {
      const a = await uploadFile(f);
      if (a) { state.pendingAttachments.push(a); renderAttachPreview(); }
    }
  });
})();

// Core send path with optimistic UI. Renders a grayed-out "sending" bubble right
// away (so a flaky connection can't make the message silently vanish), then swaps
// it for the real message on confirmation, or flags it failed-with-retry if not.
function doSendMessage({ chatId, text, attachmentIds = [], optimisticAttachments = [], replyTo = null, pingReply }) {
  if ((!text && attachmentIds.length === 0) || !chatId) return;
  const nonce = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const optimistic = {
    id: nonce, nonce, chat_id: chatId,
    user_id: state.me.id, username: state.me.username,
    display_name: state.me.display_name, tag: state.me.tag, avatar_path: state.me.avatar_path,
    content: text, created_at: Date.now(),
    attachments: optimisticAttachments,
    reply_to_id: replyTo ? replyTo.id : null,
    reply_to: replyTo ? { id: replyTo.id, username: replyTo.username, content: replyTo.content, user_id: replyTo.user_id, deleted: replyTo.deleted } : null,
    reply_ping: (replyTo && pingReply !== false) ? 1 : 0,
    reactions: {},
  };
  // Only render the bubble if we're still viewing the chat we sent to.
  let shown = chatId === state.activeChatId;
  // Sending from a centred history window: snap back to the live tail so the new
  // message lands in context. The broadcast/ack renders it once we're back.
  if (shown && state.viewingHistory) { jumpToPresent(); shown = false; }
  if (shown) {
    const msgs = $('#messages');
    msgs.querySelector('.chat-empty-state')?.remove();
    const dk = dateKey(optimistic.created_at);
    let prevNode = null;
    if (dk !== state.lastChatDate) { msgs.append(makeDateSep(optimistic.created_at)); state.lastChatDate = dk; }
    else prevNode = lastRealMessageNode(msgs);
    const grouped = prevNode ? shouldGroupMessages(optimistic, prevNode._msg) : false;
    msgs.append(buildOptimisticNode(optimistic, nonce, grouped));
    pinToBottom(); playUi('send');
  }
  let settled = false;
  // Bad-wifi safety net: if neither the broadcast nor the ack arrives, surface a
  // failed state with a retry instead of leaving the user guessing.
  const failTimer = shown ? setTimeout(() => { if (!settled) { settled = true; markOptimisticFailed(nonce, text); } }, 15000) : null;
  state.socket.emit('message:send', {
    chatId, content: text, attachmentIds,
    replyToId: replyTo ? replyTo.id : null,
    pingReply, nonce,
  }, (ack) => {
    if (settled) return;
    if (ack && ack.error) {
      settled = true; if (failTimer) clearTimeout(failTimer);
      document.querySelector(`#messages .msg.pending[data-nonce="${cssEscape(nonce)}"]`)?.remove();
      const input = $('#msgInput');
      const restore = () => { if (input && !input.value) input.value = text; };
      if (ack.error === 'slowmode') { showSlowmodeBanner(ack.retryAfter || 5); restore(); return; }
      if (ack.error === 'muted') {
        const mins = Math.max(1, Math.ceil(((ack.mutedUntil || 0) - Date.now()) / 60000));
        alert(`You've been muted by an admin. Try again in ~${mins} minute${mins === 1 ? '' : 's'}.`);
        restore(); return;
      }
      if (ack.error === 'locked') {
        alert('This chat is locked — only admins can send messages.');
        const c = state.chats.find(x => x.id === chatId);
        if (c) { c.locked = 1; renderChatActions(); renderComposerLockState(); }
        restore(); return;
      }
      if (ack.error === 'no_send') { alert("You don't have permission to send messages in this channel."); restore(); return; }
      if (ack.error === 'timed_out') { alert('You\'re timed out in this server' + (ack.until ? ' until ' + new Date(ack.until).toLocaleString() : '') + ' and can\'t send messages here.'); restore(); return; }
      if (ack.error === 'rate_limited') { showSlowmodeBanner(5); restore(); return; }
      console.error('send failed:', ack.error);
      return;
    }
    // Success — dedupe against the broadcast and swap the bubble for the real one.
    settled = true; if (failTimer) clearTimeout(failTimer);
    if (ack && ack.message) {
      state.socket._seenMsgs.add(ack.message.id);
      reconcileOptimistic(ack.message);
    }
  });
}

function resendMessage(text) {
  doSendMessage({ chatId: state.activeChatId, text, attachmentIds: [] });
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (voiceNoteRec) { stopVoiceNote(true); return; }
  const input = $('#msgInput');
  closeAutocomplete();
  const raw = input.value.trim();
  const slash = raw.startsWith('/') ? applySlashCommand(raw) : null;
  if (slash && slash.handled) { input.value = ''; return; }       // e.g. /giphy opened the picker
  if (slash && slash.send == null) return;                         // e.g. /me with no text
  const text = slash ? slash.send : convertShortcodes(raw);
  if ((!text && state.pendingAttachments.length === 0) || !state.activeChatId) return;
  const chatId = state.activeChatId;
  const attachmentIds = state.pendingAttachments.map(a => a.id);
  const optimisticAttachments = state.pendingAttachments.slice();
  const replyTo = state.replyTo;
  const pingReply = replyTo ? state.replyPing : undefined;
  // Clear the composer immediately — the message lives in the (pending) bubble now.
  input.value = '';
  state.pendingAttachments = []; state.replyTo = null; renderAttachPreview();
  // Keep focus so the mobile keyboard doesn't dismiss after sending.
  input.focus();
  doSendMessage({ chatId, text, attachmentIds, optimisticAttachments, replyTo, pingReply });
});

// Tapping Send must not steal focus from the input — otherwise the mobile soft
// keyboard closes on every send. preventDefault on the press keeps focus on
// #msgInput while the click (form submit) still fires.
{
  const sendBtn = $('#msgSend');
  // mousedown (emulated on tap) is the safe place to preventDefault: it stops the
  // focus shift but still lets the click/submit fire. touchstart would cancel the tap.
  if (sendBtn) sendBtn.addEventListener('mousedown', (e) => { if (document.activeElement === $('#msgInput')) e.preventDefault(); });
}

let typingTimeout = null;
$('#msgInput').addEventListener('input', (e) => {
  updateAutocomplete();
  // Character counter — show when nearing the 2000-char limit
  const remaining = 2000 - e.target.value.length;
  const cc = $('#charCount');
  if (cc) {
    if (remaining < 400) {
      cc.style.display = '';
      cc.textContent = remaining;
      cc.className = 'char-count' + (remaining < 50 ? ' danger' : remaining < 150 ? ' warn' : '');
    } else {
      cc.style.display = 'none';
    }
  }
  if (!state.activeChatId) return;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    state.socket.emit('typing', { chatId: state.activeChatId });
  }, 80);
});
$('#msgInput').addEventListener('blur', () => setTimeout(closeAutocomplete, 120));
$('#msgInput').addEventListener('keydown', (e) => {
  // Ctrl/Cmd + B/I/` — wrap selection in markdown syntax
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    const sym = { b: '**', i: '_', '`': '`' }[e.key.toLowerCase()];
    if (sym) {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const before = ta.value.slice(0, s), sel = ta.value.slice(s, en), after = ta.value.slice(en);
      ta.value = before + sym + sel + sym + after;
      ta.selectionStart = s + sym.length;
      ta.selectionEnd = en + sym.length;
      ta.dispatchEvent(new Event('input'));
      return;
    }
  }
  if (_ac) {
    const n = _ac.items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); _ac.index = (_ac.index + 1) % n; paintAutocomplete(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); _ac.index = (_ac.index - 1 + n) % n; paintAutocomplete(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptAutocomplete(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAutocomplete(); return; }
  } else if (e.key === 'ArrowUp' && e.target.value === '' && state.activeChatId) {
    // Edit your most recent message (Discord-style).
    const mine = document.querySelectorAll(`#messages .msg[data-uid="${state.me.id}"]:not(.deleted)`);
    const last = mine[mine.length - 1];
    if (last) { e.preventDefault(); startInlineEdit(last, +last.dataset.id, last._raw || ''); }
  }
});

// Start typing anywhere (not already in a field) and the composer grabs focus,
// so the keystroke lands in the message box — no need to click it first (Discord-style).
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;          // shortcuts, not typing
  if (e.key.length !== 1) return;                          // only printable single chars
  const t = e.target;
  const tag = (t && t.tagName || '').toLowerCase();
  if (t && (t.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')) return;
  if (document.querySelector('.modal-bg, .floating-menu')) return; // don't steal from a modal/menu
  if (pttEnabled() && state.voice.channelId != null && e.code === pttKey()) return; // leave PTT key alone
  const input = document.getElementById('msgInput');
  if (!input || input.disabled || input.offsetParent === null) return; // composer not open
  input.focus();
  // Default isn't prevented, so the character is inserted into the now-focused input.
});

// ─── Date separators ──────────────────────────────────────────────────────────
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dateSepLabel(ts) {
  const d = new Date(ts);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  if (day.getTime() === now.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
function makeDateSep(ts) {
  return el('div', { class: 'date-sep', dataset: { dk: dateKey(ts) } }, [el('span', {}, dateSepLabel(ts))]);
}

// ─── Draft messages ───────────────────────────────────────────────────────────
function saveDraft(chatId) {
  const input = document.getElementById('msgInput');
  if (!input || !chatId) return;
  const val = input.value;
  if (val) localStorage.setItem('disdroc_draft_' + chatId, val);
  else localStorage.removeItem('disdroc_draft_' + chatId);
}
function restoreDraft(chatId) {
  const input = document.getElementById('msgInput');
  if (!input) return;
  const draft = localStorage.getItem('disdroc_draft_' + chatId);
  input.value = draft || '';
  if (draft) input.dispatchEvent(new Event('input'));
}

// ─── Tab title + favicon unread ───────────────────────────────────────────────
let _faviconImg = null;
function updateFavicon(hasUnread) {
  const draw = (img) => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 32, 32);
    if (hasUnread) {
      ctx.beginPath(); ctx.arc(26, 6, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#f04747'; ctx.fill();
    }
    let link = document.querySelector('link[rel="icon"][type="image/png"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.type = 'image/png'; document.head.append(link); }
    link.href = c.toDataURL();
  };
  if (_faviconImg && _faviconImg.complete) { draw(_faviconImg); return; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { _faviconImg = img; draw(img); };
  img.onerror = () => {};
  img.src = '/assets/icon-192.png';
}
function updateDocTitle() {
  let total = 0;
  if (state.unread) for (const u of state.unread.values()) total += (u.unread || 0);
  document.title = total > 0 ? `(${total > 99 ? '99+' : total}) disdroc` : 'disdroc';
  updateFavicon(total > 0);
  updateMobileTabBadges();
  updateStageUnreadBadge(total);
}

// Badges the fullscreen call stage's minimize button with the same total the
// doc title/favicon use, since the stage otherwise hides every other unread
// signal in the app behind it. No-op off-stage; cheap enough to call on every
// unread change rather than threading a stage-open check through each caller.
function updateStageUnreadBadge(total) {
  const btn = document.querySelector('#callStage .stage-minimize');
  if (!btn) return;
  if (total == null) { total = 0; if (state.unread) for (const u of state.unread.values()) total += (u.unread || 0); }
  let badge = btn.querySelector('.stage-unread-badge');
  if (total > 0) {
    if (!badge) { badge = el('span', { class: 'stage-unread-badge' }); btn.append(badge); }
    badge.textContent = total > 99 ? '99+' : String(total);
  } else if (badge) badge.remove();
}

// ─── Sockets ──────────────────────────────────────────────────────────────────

function connectSocket() {
  state.socket = io({
    auth: { token: getToken() },
    // Cloudflare supports WebSockets end-to-end. Starting there avoids the
    // extra polling handshake on the common path, while tryAllTransports keeps
    // polling as a compatibility fallback for restrictive networks/proxies.
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    rememberUpgrade: true,
  });
  state.socket.on('connect_error', async (err) => {
    if (err.message === 'unauthorized') {
      // Access token may just have expired — rotate once, re-arm auth, reconnect.
      if (!state._socketReauthed && await tryRefresh()) {
        state._socketReauthed = true;
        state.socket.auth = { token: getToken() };
        state.socket.connect();
        return;
      }
      // Only force a re-login if the refresh DEFINITIVELY failed (token cleared).
      // On mobile the socket reconnects constantly as the network flaps; a
      // transient refresh failure must NOT log the user out — let socket.io keep
      // retrying with the token we still hold (it'll succeed once back online).
      if (!getToken()) { location.href = '/login'; return; }
      state._socketReauthed = false; // allow another refresh attempt on the next retry
    }
  });
  state.socket.on('connect', () => { state._socketReauthed = false; });
  state.socket.on('connect', () => {
    closeFloatingMenus();
    if (state.activeChatId) {
      $('#msgInput').disabled = false; $('#msgSend').disabled = false;
    }
    // After a dropped connection, quietly pull anything we missed while offline.
    if (state._hadConnection) {
      resyncAfterReconnect();
      // If we were in a call, the server dropped our old socket from the voice
      // room on disconnect (everyone saw us leave) — while our UI still shows
      // the call. Re-enter the room as the new socket and redial everyone.
      if (state.voice.channelId != null) rejoinVoiceAfterReconnect();
    }
    state._hadConnection = true;
  });
  state.socket.on('disconnect', (reason) => {
    if (state.voice.channelId == null) return;
    // Invalidate an ack that belonged to the dead transport. Without this, a
    // second flap inside the old 15s "rejoin in flight" window suppressed the
    // new connection's rejoin and nothing ever scheduled another attempt.
    invalidateVoiceRejoin();
    console.warn('[voice] signalling disconnected while in call:', reason);
  });
  state.socket._seenMsgs = state.socket._seenMsgs || new Set();
  state.socket.on('message:new', (m) => {
    if (state.socket._seenMsgs.has(m.id)) return;
    state.socket._seenMsgs.add(m.id);
    if (state.socket._seenMsgs.size > 500) state.socket._seenMsgs = new Set([...state.socket._seenMsgs].slice(-200));
    // Thread messages never touch the sidebar/unread machinery — they live only
    // inside the open thread panel (if any) for this chat id.
    if (state.threadPanel && m.chat_id === state.threadPanel.chatId) {
      const prevNode = lastRealMessageNode(state.threadPanel.container);
      state.threadPanel.container.append(buildMessageNode(m, prevNode ? shouldGroupMessages(m, prevNode._msg) : false));
      state.threadPanel.container.scrollTop = state.threadPanel.container.scrollHeight;
      return;
    }
    const isActiveAndFocused = m.chat_id === state.activeChatId && document.hasFocus();
    // Our own optimistic bubble? Swap it in place instead of appending a duplicate.
    if (m.chat_id === state.activeChatId && reconcileOptimistic(m)) {
      if (document.visibilityState === 'visible') markChatRead(m.chat_id, m.id);
      // Still bubble chat to top and refresh sidebar preview for the sender.
      const _rci = state.chats.findIndex(c => c.id === m.chat_id);
      if (_rci > 0) state.chats.unshift(state.chats.splice(_rci, 1)[0]);
      const _rc = state.chats.find(c => c.id === m.chat_id);
      if (_rc) { _rc.last_sender = m.display_name || m.username || null; _rc.last_user_id = m.user_id; _rc.last_content = (m.content || '').slice(0, 120) || null; }
      if (state.view === 'home' || state.view === 'friends') { state._bumpedChatId = _rci !== 0 ? m.chat_id : null; renderSidebar(); state._bumpedChatId = null; }
      return;
    }
    if (m.chat_id === state.activeChatId) {
      // pinToBottom (not a one-shot scrollToBottom): `.msg` uses content-visibility
      // with an estimated height, so scrollHeight right after append is often too
      // short until the real content (wrapped text, an image, reactions) lays out
      // a moment later — a plain scrollToBottom left the new message just out of
      // view, requiring a manual scroll down to see it.
      appendMessage(m); pinToBottom();
      const _aci = state.chats.findIndex(c => c.id === m.chat_id);
      if (_aci > 0) state.chats.unshift(state.chats.splice(_aci, 1)[0]);
      const _ac = state.chats.find(c => c.id === m.chat_id);
      if (_ac) { _ac.last_sender = m.display_name || m.username || null; _ac.last_user_id = m.user_id; _ac.last_content = (m.content || '').slice(0, 120) || null; }
      if (state.view === 'home' || state.view === 'friends') { state._bumpedChatId = _aci !== 0 ? m.chat_id : null; renderSidebar(); state._bumpedChatId = null; }
    }
    else {
      if (state.unread) {
        const info = chatServerInfo(m.chat_id, m);
        const u = state.unread.get(m.chat_id);
        if (u) { u.unread = (u.unread || 0) + 1; if (u.server_id == null && info.server_id != null) u.server_id = info.server_id; if (!u.type && info.type) u.type = info.type; }
        else state.unread.set(m.chat_id, { chat_id: m.chat_id, unread: 1, last_message_id: m.id, last_read: 0, server_id: info.server_id, type: info.type });
        renderRailDots();
      }
      // Bubble the chat to the top so the sidebar order reflects last activity.
      const _ci = state.chats.findIndex(c => c.id === m.chat_id);
      if (_ci > 0) state.chats.unshift(state.chats.splice(_ci, 1)[0]);
      if (_ci === -1) {
        // Brand-new DM — refetch so we have the peer's display name, avatar, etc.
        loadChats().then(renderSidebar).catch(() => {});
      } else {
        // Stamp last-message preview so the sidebar shows who sent it.
        const _chat = state.chats.find(c => c.id === m.chat_id);
        if (_chat) {
          _chat.last_sender = m.display_name || m.username || null;
          _chat.last_user_id = m.user_id;
          _chat.last_content = (m.content || '').slice(0, 120) || null;
        }
        if (state.view === 'home' || state.view === 'friends') {
          state._bumpedChatId = _ci !== 0 ? m.chat_id : null; renderSidebar(); state._bumpedChatId = null;
        } else {
          updateSidebarUnreadBadge(m.chat_id);
        }
      }
    }
    updateDocTitle();
    if (!isActiveAndFocused) { maybeNotify(m); maybeMessagePing(m); }
  });
  state.socket.on('message:update', (u) => {
    const node = $('.msg[data-id="' + u.id + '"]');
    if (!node) return;
    if (u.deleted) {
      node.classList.add('deleted');
      setMessageText(node.querySelector('.text'), '', true);
      node.querySelector('.attachments')?.remove();
      node.querySelector('.link-preview')?.remove();
      node.querySelector('.reply-context')?.remove();
      node.querySelector('.forwarded-context')?.remove();
      node.querySelector('.reactions-bar')?.remove();
      node.querySelector('.poll-card')?.remove();
      node.querySelector('.msg-menu-btn')?.remove();
    }
    else if (u.content != null) {
      node._raw = u.content;
      setMessageText(node.querySelector('.text'), u.content, false);
      const head = node.querySelector('.head');
      // Insert right after .time (matching buildMessageNode's order) — a plain
      // append() here lands after the margin-left:auto reply/more buttons and
      // strands "(edited)" at the far right of the row.
      if (head && !head.querySelector('.edited')) head.querySelector('.time')?.after(el('span', { class: 'edited' }, '(edited)'));
    }
  });
  state.socket.on('thread:created', (info) => updateThreadPill(info.parentMessageId, info));
  state.socket.on('thread:activity', (info) => updateThreadPill(info.parentMessageId, info));
  state.socket.on('bot:token', ({ id, delta }) => {
    const node = $('#messages')?.querySelector(`[data-id="${id}"]`);
    if (!node) return;
    const textEl = node.querySelector('.text');
    if (!textEl) return;
    node._raw = (node._raw || '') + delta;
    textEl.classList.add('bot-streaming');
    textEl.textContent = node._raw;
  });
  state.socket.on('bot:done', ({ id, content }) => {
    const node = $('#messages')?.querySelector(`[data-id="${id}"]`);
    if (!node) return;
    const textEl = node.querySelector('.text');
    if (!textEl) return;
    textEl.classList.remove('bot-streaming');
    node._raw = content;
    setMessageText(textEl, content, false);
  });
  state.socket.on('typing', ({ chatId, username }) => {
    if (chatId !== state.activeChatId) return;
    const t2 = $('#typing');
    t2.replaceChildren(
      el('span', { class: 'typing-dots' }, [el('i'), el('i'), el('i')]),
      document.createTextNode(t('chat.typing', { name: username }))
    );
    clearTimeout(t2._timer); t2._timer = setTimeout(() => t2.replaceChildren(), 2500);
  });
  // Full list of who's already online, sent on (re)connect. Without this, friends
  // who were online before us — or before a reconnect — show as offline.
  state.socket.on('presence:snapshot', (ids) => {
    state.online = new Set(Array.isArray(ids) ? ids : []);
    if (state.view === 'server') renderRightPanel();
    renderSidebar();
    renderFriendsPanel();
  });
  state.socket.on('presence:online', ({ userId }) => {
    state.online.add(userId);
    if (state.view === 'server') renderRightPanel();
    renderSidebar();
    renderFriendsPanel();
  });
  state.socket.on('presence:offline', ({ userId }) => {
    state.online.delete(userId);
    state.activities.delete(userId);
    if (state.view === 'server') renderRightPanel();
    renderSidebar();
    renderFriendsPanel();
  });
  // Read state synced from another of your devices: clear the unread badge and raise
  // the read marker so we don't re-notify here for messages you've already seen.
  state.socket.on('chat:read', ({ chatId, lastRead }) => {
    if (!state.unread) return;
    const cur = state.unread.get(chatId);
    if (cur) { if ((lastRead || 0) > (cur.last_read || 0)) cur.last_read = lastRead; cur.unread = 0; }
    else state.unread.set(chatId, { chat_id: chatId, unread: 0, last_read: lastRead || 0, last_message_id: lastRead || 0 });
    updateSidebarUnreadBadge(chatId);
    updateDocTitle();
    renderRailDots();
  });
  // Another device of yours is actively focused — stay quiet here for a short window
  // (refreshed by its heartbeat) so you don't get duplicate alerts across devices.
  state.socket.on('presence:focus-elsewhere', () => { state.peerFocusUntil = Date.now() + 30000; });
  state.socket.on('activity:snapshot', (list) => {
    for (const { userId, activity } of (list || [])) {
      if (activity) state.activities.set(userId, activity); else state.activities.delete(userId);
    }
    refreshActivityViews();
  });
  state.socket.on('user:activity', ({ userId, activity }) => {
    if (activity) state.activities.set(userId, activity); else state.activities.delete(userId);
    if (userId === state.me.id) renderMe();
    refreshActivityViews();
  });
  state.socket.on('message:reactions', ({ messageId, reactions, reactionNames }) => {
    const node = $('.msg[data-id="' + messageId + '"]');
    if (!node) return;
    const old = node.querySelector('.reactions-bar');
    const fake = { id: messageId, reactions, reactionNames };
    const newBar = buildReactionsBar(fake);
    if (old) old.replaceWith(newBar); else node.querySelector('.body').appendChild(newBar);
  });
  state.socket.on('poll:vote', ({ messageId, votes }) => {
    refreshPollNode(messageId, { votes });
  });
  state.socket.on('poll:update', ({ messageId, meta }) => {
    refreshPollNode(messageId, { meta });
  });
  state.socket.on('message:pin', ({ messageId, pinned }) => {
    if (pinned) state.pinnedIds.add(messageId);
    else state.pinnedIds.delete(messageId);
    const node = $('.msg[data-id="' + messageId + '"]');
    // Pinning always shows a full header (see shouldGroupMessages), and unpinning
    // may make it eligible to re-collapse into the message above it — rebuild
    // rather than patch in place so grouping stays correct either way.
    if (node && node._msg) {
      node._msg.pinned = !!pinned;
      const prevNode = node.previousElementSibling;
      const prevMsg = (prevNode && prevNode.classList.contains('msg')) ? prevNode._msg : null;
      const grouped = !pinned && shouldGroupMessages(node._msg, prevMsg);
      node.replaceWith(buildMessageNode(node._msg, grouped));
    }
    refreshPinnedBar();
  });
  state.socket.on('chat:cleared', ({ chatId }) => {
    if (chatId === state.activeChatId) {
      $('#messages').innerHTML = '<div class="msg system">Messages were cleared by an admin.</div>';
    }
  });
  // You were removed from (or left) a group on another device — drop it live.
  state.socket.on('chat:removed', ({ chatId }) => {
    const idx = state.chats.findIndex(c => c.id === chatId);
    if (idx !== -1) state.chats.splice(idx, 1);
    if (state.unread) { state.unread.delete(chatId); updateDocTitle(); }
    if (state.activeChatId === chatId) switchToHome();
    renderSidebar();
  });
  state.socket.on('server:version', ({ version }) => {
    if (!state.serverVersion) { state.serverVersion = version; return; }
    if (version !== state.serverVersion) showUpdateBanner();
  });
  state.socket.on('voice:room-update', ({ chatId, participants }) => {
    if (!participants || !participants.length) state.voiceRooms.delete(chatId);
    else state.voiceRooms.set(chatId, participants);
    renderChatActions();
    renderSidebar();
    // Refresh the call tiles too — this is how a peer's mute/deafen change reaches
    // the in-call view (participants carry muted/deafened).
    if (state.voice.channelId === chatId) {
      // Reconcile tiles with the server's room list: tiles render from
      // state.voice.peers, so a voice:peer-left we missed (background-tab
      // throttling, brief disconnect) would leave a ghost participant on
      // screen forever. Anyone not in the authoritative list gets closed.
      const present = new Set((participants || []).map((p) => p.id));
      for (const [sid, p] of [...state.voice.peers]) {
        if (!present.has(p.userId)) voiceClosePeer(sid);
      }
      renderVoiceBar();
      // The music widget's listener row is drawn from this same room list, and
      // it also lives in the fullscreen stage, which renderVoiceBar doesn't touch.
      if (state.voice.ytmusicSession) renderYtMusicWidget();
    }
  });
  // Who is currently being rung in a DM/group call (for the pulsing ringing cards).
  state.socket.on('voice:ring-state', ({ chatId, ringing }) => {
    if (!ringing || !ringing.length) state.voiceRingers.delete(chatId);
    else state.voiceRingers.set(chatId, ringing);
    if (state.voice.channelId === chatId) { renderVoiceBar(); updateRingback(); }
  });
  // Initial snapshot of voice channels that already have people in them (sent on
  // connect, before any join/leave would otherwise produce a room-update). It's
  // the complete truth, so REPLACE the map — after a reconnect, rooms we still
  // remember but that emptied while we were gone must be dropped, or the people
  // who left keep showing in the sidebar/tiles forever.
  state.socket.on('voice:rooms-snapshot', (rooms) => {
    state.voiceRooms.clear();
    for (const r of (rooms || [])) {
      if (r && r.participants && r.participants.length) state.voiceRooms.set(r.chatId, r.participants);
    }
    renderChatActions();
    renderSidebar();
    if (state.voice.channelId != null) renderVoiceBar();
  });

  // Voice (perfect-negotiation pattern)
  state.socket.on('voice:peer-joined', async ({ socketId, userId, username }) => {
    if (state.voice.channelId == null) return;
    playSfx('join');
    await voiceConnectToPeer(socketId, userId, username);
    updateRingback();
  });
  state.socket.on('voice:peer-left', ({ socketId }) => {
    if (state.voice.channelId != null) playSfx('leave');
    voiceClosePeer(socketId);
    updateRingback();
  });
  state.socket.on('voice:peer-reset', async ({ socketId, userId, username }) => {
    if (state.voice.channelId == null || !socketId) return;
    const oldPeer = state.voice.peers.get(socketId);
    if (oldPeer) voiceClosePeer(socketId, oldPeer);
    await voiceConnectToPeer(socketId, userId, username);
  });
  state.socket.on('voice:ring', (payload) => { if (payload && payload.caller && payload.caller.id !== state.me.id) showIncomingCall(payload); });
  state.socket.on('voice:ring-cancel', ({ chatId }) => dismissIncomingCall(chatId));
  // Soft daily voice-usage cap reached — warn once, never cut the call.
  state.socket.on('voice:usage-warning', () => {
    if (state.voice._usageWarned) return;
    state.voice._usageWarned = true;
    console.warn('[voice] daily voice-usage soft cap reached');
    try { alert('Heads up: you\'ve used a lot of voice time today. Calls keep working, but please be mindful of server load.'); } catch {}
  });
  state.socket.on('voice:signal', async ({ from, fromUserId, fromUsername, data }) => {
    if (state.voice.channelId == null) return;
    let peer = state.voice.peers.get(from);
    if (!peer) peer = await voiceConnectToPeer(from, fromUserId, fromUsername);
    const pc = peer.pc;
    // Serialize per peer: an ICE candidate processed while setRemoteDescription
    // is still in flight throws and the candidate is lost for good — that was
    // randomly wedging calls at "connecting". Queue everything in arrival order.
    peer.sigq = (peer.sigq || Promise.resolve()).then(async () => {
      if (data.sdp) {
        const collision = data.sdp.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        if (!peer.polite && collision) return;
        if (collision) {
          try { await pc.setLocalDescription({ type: 'rollback' }); } catch {}
        }
        await pc.setRemoteDescription(data.sdp);
        // Flush candidates that raced ahead of the description.
        while (peer.pendingCands.length) {
          const c = peer.pendingCands.shift();
          try { await pc.addIceCandidate(c); } catch (e) { console.warn('ice cand (flush)', e.message); }
        }
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription();
          state.socket.emit('voice:signal', { to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        if (!pc.remoteDescription) { peer.pendingCands.push(data.candidate); return; }
        try { await pc.addIceCandidate(data.candidate); }
        catch (e) { if (!peer.makingOffer) console.warn('ice cand', e.message); }
      }
    }).catch((e) => console.warn('voice signal', e.message));
  });
  state.socket.on('voice:speaking', ({ userId, speaking }) => {
    for (const [, p] of state.voice.peers) {
      if (p.userId === userId) { p.speaking = !!speaking; applyTileSpeakingClass(userId, speaking); break; }
    }
  });
  state.socket.on('voice:video-state', ({ userId, on }) => {
    for (const [, p] of state.voice.peers) {
      if (p.userId === userId) {
        p.videoOn = !!on;
        // Drop the now-stale stream so the tile falls back to the avatar instead
        // of freezing on the camera's last frame (a fresh track re-arrives via
        // ontrack when they turn the camera back on).
        if (!on) p.videoStream = null;
        renderVoiceBar();
        break;
      }
    }
  });
  state.socket.on('voice:screen-state', ({ userId, on, streamId }) => {
    for (const [, p] of state.voice.peers) {
      if (p.userId !== userId) continue;
      if (on) {
        if (streamId) {
          p.screenIds.add(streamId);
          // If this stream already arrived and was mistaken for camera, move it.
          if (p.videoStream && p.videoStream.id === streamId) {
            p.screenStream = p.videoStream; p.screenOn = true;
            p.videoStream = null; p.videoOn = false;
          }
        }
      } else {
        p.screenOn = false; p.screenStream = null;
        if (streamId) p.screenIds.delete(streamId); else p.screenIds.clear();
      }
      renderVoiceBar();
      break;
    }
  });
  // Watch Together: the shared YouTube session changed (started, controlled, stopped).
  state.socket.on('watch:state', ({ chatId, session, by, now }) => {
    if (state.voice.channelId !== chatId) return;
    // Rebase the server's positionAt onto our clock so skew between machines
    // doesn't read as a seek (expected-time math runs on Date.now()).
    if (session && now) session.positionAt += Date.now() - now;
    applyWatchState(session, by);
  });
  // YouTube Music: the owner-controlled synced session changed.
  state.socket.on('ytmusic:state', ({ chatId, session, now }) => {
    if (state.voice.channelId !== chatId) return;
    if (session && now) session.positionAt += Date.now() - now;
    applyYtMusicState(session);
  });
  // Soundboard: someone in the call played a clip — everyone (sender included)
  // fetches and plays it locally. Deafened users hear nothing, as expected.
  state.socket.on('soundboard:play', ({ chatId, sound, by, byName }) => {
    if (state.voice.channelId !== chatId || !sound || !sound.stored_path) return;
    if (!state.voice.deafened) {
      try {
        const a = new Audio('/api/sound/' + encodeURIComponent(sound.stored_path));
        a.volume = 0.9;
        a.play().catch(() => {});
      } catch {}
    }
    if (by !== state.me.id) partyToast((sound.emoji || '🔊') + ' ' + (byName || 'Someone') + ' played "' + sound.name + '"');
  });
  // Whiteboard (Activities): full session snapshots + live stroke traffic.
  state.socket.on('wb:state', ({ chatId, session }) => {
    if (state.voice.channelId !== chatId) return;
    applyWbState(session);
  });
  state.socket.on('wb:progress', (d) => { if (state.voice.wbSession) wbDrawProgress(d); });
  state.socket.on('wb:stroke', ({ tempId, stroke }) => { if (state.voice.wbSession) wbCommitRemote(tempId, stroke); });
  state.socket.on('wb:ack', ({ tempId, id }) => {
    const s = state.voice.wbSession;
    if (!s) return;
    const st = s.strokes.find((x) => x.id === tempId);
    if (st) st.id = id; // adopt the server id so wb:remove (undo) matches later
  });
  state.socket.on('wb:remove', ({ chatId, id }) => {
    const s = state.voice.wbSession;
    if (!s || state.voice.channelId !== chatId) return;
    s.strokes = s.strokes.filter((x) => x.id !== id);
    wbRedraw();
  });
  state.socket.on('wb:clear', ({ chatId }) => {
    const s = state.voice.wbSession;
    if (!s || state.voice.channelId !== chatId) return;
    s.strokes = [];
    wbRedraw();
  });
  // Embedded games (Activities): shared room URL for everyone in the call.
  state.socket.on('game:state', ({ chatId, session, error }) => {
    if (state.voice.channelId !== chatId) return;
    if (error === 'start_failed') alert('Couldn\'t start the game — try again in a moment.');
    applyGameState(session);
  });
}

function applyTileSpeakingClass(userId, speaking) {
  // All matching tiles (voice bar and stage can coexist) plus the sidebar
  // voice-member rows nested under the channel.
  for (const n of document.querySelectorAll(`.call-tile[data-uid="${userId}"], .vmem[data-uid="${userId}"]`)) {
    n.classList.toggle('speaking', !!speaking);
  }
}

// ─── UI sound effects (synthesized — no asset files) ──────────────────────────
let _sfxCtx = null;
function sfxEnabled() { return localStorage.getItem('disdroc_sfx') !== 'off'; }
// [freq, offsetSeconds, durationSeconds?]
// ── Custom sound effects ──────────────────────────────────────────────────────
// Users can replace any built-in SFX with their own audio. Files live in IndexedDB
// (per-device, no size pressure like localStorage); we keep live object URLs in
// `_customSfx` so playSfx() stays synchronous.
const _customSfx = {}; // kind -> object URL
const SFX_DB = 'disdroc_sfx', SFX_STORE = 'sounds';
function sfxOpenDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(SFX_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(SFX_STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function sfxTx(mode, fn) {
  return sfxOpenDB().then(db => new Promise((resolve) => {
    const tx = db.transaction(SFX_STORE, mode);
    const store = tx.objectStore(SFX_STORE);
    let out = null;
    const rq = fn(store);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => resolve(null);
  })).catch(() => null);
}
async function loadCustomSfx() {
  const keys = await sfxTx('readonly', s => s.getAllKeys());
  for (const k of (keys || [])) {
    const blob = await sfxTx('readonly', s => s.get(k));
    if (blob) { if (_customSfx[k]) URL.revokeObjectURL(_customSfx[k]); _customSfx[k] = URL.createObjectURL(blob); }
  }
}
async function setCustomSfx(kind, blob) {
  await sfxTx('readwrite', s => s.put(blob, kind));
  if (_customSfx[kind]) URL.revokeObjectURL(_customSfx[kind]);
  _customSfx[kind] = URL.createObjectURL(blob);
}
async function clearCustomSfx(kind) {
  await sfxTx('readwrite', s => s.delete(kind));
  if (_customSfx[kind]) { URL.revokeObjectURL(_customSfx[kind]); delete _customSfx[kind]; }
}

const SFX = {
  join:    [[523.25, 0], [784.0, 0.1]],   // ascending C5→G5
  leave:   [[784.0, 0], [523.25, 0.1]],   // descending G5→C5
  message: [[880.0, 0, 0.12], [1174.66, 0.05, 0.14]], // soft two-step ping
  mute:    [[440.0, 0, 0.1]],
  unmute:  [[660.0, 0, 0.12]],
  // Classic "brring–brring" double trill: two quick A4↔E5 warbles, then a gap
  // before the 2.6s interval repeats. Warmer and more phone-like than a plain ping.
  ring:    [[440.0, 0, 0.18], [659.25, 0.16, 0.18], [440.0, 0.32, 0.18], [659.25, 0.48, 0.18],
            [440.0, 0.78, 0.18], [659.25, 0.94, 0.18], [440.0, 1.10, 0.18], [659.25, 1.26, 0.22]],
  // Soft single-blip "ringback" — plays on a timer for the caller while a call
  // has nobody in it yet and the other side is still being rung, like a phone's
  // waiting-for-pickup tone. Quieter/shorter than `ring` (the callee's tone) so
  // it doesn't feel like a second alarm on the caller's own screen.
  ringback: [[494.0, 0, 0.22]],
  // UI micro-sounds
  send:    [[1046.5, 0, 0.09], [1318.5, 0.04, 0.1]], // crisp C6→E6 whoosh-ping on send
  click:   [[2200.0, 0, 0.03]],                       // very short tick for buttons
  pop:     [[1567.98, 0, 0.06]],                       // menu/modal open
  toggle:  [[587.33, 0, 0.07]],                        // checkbox/switch
  error:   [[311.13, 0, 0.16], [233.08, 0.09, 0.2]],   // descending low buzz
};
// `force` plays even when call sounds are off (used by the message ping, which
// has its own toggle).
function playSfx(kind, opts) {
  if (!(opts && opts.force) && !sfxEnabled()) return;
  // A user-supplied sound for this event takes precedence over the synth.
  if (_customSfx[kind]) {
    try { const a = new Audio(_customSfx[kind]); a.volume = 0.85; a.play().catch(() => {}); return; } catch {}
  }
  const seq = SFX[kind]; if (!seq) return;
  try {
    _sfxCtx = _sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _sfxCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (const [freq, offset, dur] of seq) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + offset, len = dur || 0.22;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + len + 0.02);
    }
  } catch { /* audio not available */ }
}

// UI micro-sounds (button clicks, menu opens, sends) have their own toggle so a
// user can keep call/message sounds but silence the clicky layer. Default on.
function uiSfxEnabled() { return localStorage.getItem('disdroc_ui_sfx') !== 'off'; }
function playUi(kind) { if (uiSfxEnabled()) playSfx(kind, { force: true }); }

// One delegated listener gives every button/menu/toggle a click sound without
// touching their handlers. Wait for pointerup so touch scrolling stays silent.
const SFX_TAP_SLOP = 10;
let _sfxPointerDown = null;
document.addEventListener('pointerdown', (e) => {
  if (!uiSfxEnabled()) return;
  const t = e.target.closest('button, .settings-nav-item, .sp-option, .tab-btn, .server-icon, .sidebar-item, a.settings-nav-item');
  if (!t || t.disabled) return;
  // Checkboxes/switches get a distinct tone; destructive buttons a softer one.
  _sfxPointerDown = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    isToggle: !!(t.querySelector('input[type=checkbox]') || t.closest('label')),
  };
}, true);
document.addEventListener('pointermove', (e) => {
  const d = _sfxPointerDown;
  if (!d || d.id !== e.pointerId) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (dx * dx + dy * dy > SFX_TAP_SLOP * SFX_TAP_SLOP) _sfxPointerDown = null;
}, true);
document.addEventListener('pointerup', (e) => {
  const d = _sfxPointerDown;
  if (!d || d.id !== e.pointerId) return;
  _sfxPointerDown = null;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (dx * dx + dy * dy > SFX_TAP_SLOP * SFX_TAP_SLOP) return;
  playUi(d.isToggle ? 'toggle' : 'click');
}, true);
const cancelSfxPointer = (e) => {
  if (_sfxPointerDown && _sfxPointerDown.id === e.pointerId) _sfxPointerDown = null;
};
document.addEventListener('pointercancel', cancelSfxPointer, true);
document.addEventListener('pointerleave', cancelSfxPointer, true);

// Message ping with its own toggle + the same quiet guards as desktop notifs.
// Shared gate for message alerts (desktop notification + ping). Suppresses alerts for
// the chat you have open on this device, for messages you've already read (read state
// is synced across your devices), and while another device of yours is actively focused.
// Together these stop notifications from piling up on idle/secondary devices.
function alertSuppressed(m) {
  if (!m || !state.me || m.user_id === state.me.id) return true;
  if (m.chat_id === state.activeChatId) return true;                 // open here → you can see it
  if (Date.now() < (state.peerFocusUntil || 0)) return true;         // you're active on another device
  const rs = state.unread && state.unread.get(m.chat_id);
  if (rs && rs.last_read && m.id <= rs.last_read) return true;       // already read (maybe elsewhere)
  return false;
}

// Does this message @-mention me (by username/display name), reply-ping me, or @everyone?
function mentionsMe(m) {
  if (!m || !state.me) return false;
  if (m.mention_everyone) return true;
  if (m.reply_ping && m.reply_to && m.reply_to.user_id === state.me.id) return true;
  const content = (m.content || '').toLowerCase();
  if (!content.includes('@')) return false;
  for (const name of [state.me.username, state.me.display_name]) {
    if (!name) continue;
    const n = name.toLowerCase();
    const i = content.indexOf('@' + n);
    if (i !== -1) {
      const after = content[i + 1 + n.length];
      if (after === undefined || !/[a-z0-9_]/.test(after)) return true; // not a longer @name
    }
  }
  return false;
}

function maybeMessagePing(m) {
  if (localStorage.getItem('disdroc_msg_sound') === 'off') return;
  if (!m || m.kind === 'call' || m.kind === 'system' || !state.me || m.user_id === state.me.id) return;
  if (alertSuppressed(m)) return;
  if (state.me.status_type === 'dnd') return;
  if (state.generalId && m.chat_id === state.generalId) return;
  if (state.blockedIds && state.blockedIds.has(m.user_id)) return;
  if (m.is_bot || (state.botUserId && m.user_id === state.botUserId)) return;
  const chat = state.chats.find(c => c.id === m.chat_id);
  let level = notifLevel(chat);
  if (level === 'all' && state.me && state.me.notif_mentions_only) level = 'mentions';
  if (level === 'nothing') return;
  if (level === 'mentions' && !mentionsMe(m)) return;
  // Legacy default for server channels: only ping when mentioned.
  if (chat && chat.server_id && !chat.notif_level && !mentionsMe(m)) return;
  playSfx('message', { force: true });
}

// ─── Incoming calls (ringing) ─────────────────────────────────────────────────
let _ringTimer = null;
function startRingtone() {
  if (!sfxEnabled()) return;
  if (state.me && state.me.status_type === 'dnd') return;
  stopRingtone();
  const ring = () => playSfx('ring', { force: true });
  ring();
  _ringTimer = setInterval(ring, 2600);
}
function stopRingtone() { if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; } }

// ─── Ringback (caller-side "waiting for pickup" tone) ─────────────────────────
// While you're the only one in a call and the others are still being rung, play
// a soft repeating tone — like a phone's ringback — so it's obvious you're not
// just sitting in an empty room. Stops the moment anyone joins or the ringing
// clears (declined/timed out/call left).
let _ringbackTimer = null;
function startRingback() {
  if (_ringbackTimer || !sfxEnabled()) return;
  const tick = () => playSfx('ringback', { force: true });
  tick();
  _ringbackTimer = setInterval(tick, 3000);
}
function stopRingback() { if (_ringbackTimer) { clearInterval(_ringbackTimer); _ringbackTimer = null; } }
function updateRingback() {
  const chatId = state.voice.channelId;
  const ringing = chatId != null && state.voiceRingers.get(chatId);
  const alone = state.voice.peers.size === 0;
  if (chatId != null && alone && ringing && ringing.length) startRingback();
  else stopRingback();
}

let _incoming = null; // { chatId, timer }
function dismissIncomingCall(chatId) {
  if (chatId != null && _incoming && _incoming.chatId !== chatId) return;
  stopRingtone();
  if (_incoming) clearTimeout(_incoming.timer);
  _incoming = null;
  const o = document.getElementById('incomingCall'); if (o) o.remove();
}
// Explicit decline: tell the server so the caller's ringing card for us disappears,
// then dismiss the prompt. (Plain dismiss is used for timeouts/cancels — no signal.)
function declineIncomingCall(chatId) {
  try { state.socket && state.socket.emit('voice:decline', { chatId }); } catch {}
  dismissIncomingCall(chatId);
}
async function acceptIncomingCall(chatId, name) {
  dismissIncomingCall();
  let chat = state.chats.find(c => c.id === chatId);
  if (!chat) { try { await loadChats(); renderSidebar(); } catch {} chat = state.chats.find(c => c.id === chatId); }
  if (chat) openChat(chatId, chat);
  toggleVoiceJoin(chatId, name);
}
function showIncomingCall({ chatId, chatType, chatName, caller }) {
  if (state.voice.channelId === chatId) return;        // already in this call
  if (_incoming && _incoming.chatId === chatId) return; // already ringing this chat
  dismissIncomingCall();
  const name = (caller && (caller.display_name || caller.username)) || 'Someone';
  const overlay = el('div', { class: 'incoming-call', id: 'incomingCall' }, [
    el('div', { class: 'ic-card' }, [
      el('div', { class: 'ic-avatar ringing' }, avatarEl(caller, 'large')),
      el('div', { class: 'ic-name' }, name),
      el('div', { class: 'ic-sub' }, chatType === 'group' && chatName ? 'Incoming call · ' + chatName : 'Incoming voice call…'),
      el('div', { class: 'ic-actions' }, [
        el('button', { class: 'ic-btn ic-decline', title: 'Decline', on: { click: () => declineIncomingCall(chatId) } }, icon('phone-off', 24)),
        el('button', { class: 'ic-btn ic-accept', title: 'Accept', on: { click: () => acceptIncomingCall(chatId, name) } }, icon('phone', 24)),
      ]),
    ]),
  ]);
  overlay._disdrocClose = () => dismissIncomingCall(chatId);
  document.body.append(overlay);
  startRingtone();
  _incoming = { chatId, timer: setTimeout(() => dismissIncomingCall(chatId), 30000) };
}

// ─── Voice / Video (browser + desktop) ────────────────────────────────────────

// Safe fallback used before (or when) the authenticated server ICE config can
// be fetched. Production adds its short-lived self-hosted TURN credentials.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
// Live ICE config from the server (kept so the STUN list has a single source of
// truth); falls back to the list above if the request fails.
let _iceServers = ICE_SERVERS;
let _iceServersFetchedAt = 0;
let _iceRefreshPromise = null;
async function refreshIceServers(force = true) {
  // A group call can notice the same network failure on several peer
  // connections at once. Share one credential refresh instead of stampeding
  // /api/ice-config once per participant.
  if (_iceRefreshPromise) return _iceRefreshPromise;
  if (!force && _iceServersFetchedAt && Date.now() - _iceServersFetchedAt < 5 * 60 * 1000) return;
  // Right after a socket reconnect there's a token-refresh race (see
  // connect_error above) — a single failed attempt here would silently strand
  // the rejoin on STUN-only forever (no TURN relay), which reads as "the call
  // dropped and never came back" for anyone behind CGNAT/strict NAT. Retry a
  // couple of times before continuing with the last known ICE configuration.
  _iceRefreshPromise = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const r = await api('/api/ice-config', { signal: controller.signal });
        if (r && Array.isArray(r.iceServers) && r.iceServers.length) {
          _iceServers = r.iceServers;
          _iceServersFetchedAt = Date.now();
          return;
        }
      } catch { /* retry below */ }
      finally { clearTimeout(timeout); }
      if (attempt < 2) await new Promise((res) => setTimeout(res, 900));
    }
    // Keep a previously fetched set: a brief API outage should not discard
    // credentials that may still be valid. Recovery refreshes them whenever
    // they are more than five minutes old, well before self-hosted creds expire.
    console.warn('[voice] could not refresh TURN credentials — retaining the last ICE config');
  })();
  try { await _iceRefreshPromise; }
  finally { _iceRefreshPromise = null; }
}

async function ensureLocalMic() {
  if (state.voice.localStream) return state.voice.localStream;
  try {
    const audio = {
      echoCancellation: localStorage.getItem('disdroc_echo') !== 'off',
      noiseSuppression: localStorage.getItem('disdroc_noise') !== 'off',
      autoGainControl: localStorage.getItem('disdroc_agc') !== 'off',
    };
    if (state.voice.micDeviceId) audio.deviceId = { exact: state.voice.micDeviceId };
    const raw = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    state.voice.micRawStream = raw;
    // Everything downstream (peers, mute, speaking detection) talks to
    // localStream, so routing the mic through the effects chain here means the
    // voice changer needs no special-casing anywhere else — and because the
    // chain's output track is created once and never replaced, switching presets
    // mid-call never triggers a WebRTC renegotiation.
    state.voice.localStream = await ensureVoiceFxStream(raw);
    state.voice.noMic = false;
    applyMicState(); // honours mute + push-to-talk
    startSpeakingDetection();
    return state.voice.localStream;
  } catch {
    // No mic available — join in listen-only mode
    state.voice.noMic = true;
    state.voice.muted = true;
    return null;
  }
}

// ─── Voice changer plumbing ───────────────────────────────────────────────────
// The effects chain is attached LAZILY — a call with no effect and no noise gate
// sends the raw device track, exactly as before. Routing every call through a
// MediaStreamDestination round-trip would cost an always-running AudioContext and
// a few ms of added latency on phones for a feature most calls never touch.
//
// Switching between the raw track and the processed one mid-call uses
// RTCRtpSender.replaceTrack(), which needs no renegotiation for a same-kind
// track, so nobody in the call hears a blip when you turn an effect on.

function savedVoicePreset() { return localStorage.getItem('disdroc_vfx') || 'none'; }
function savedNoiseGate() { return localStorage.getItem('disdroc_gate') === 'on'; }

// Should the FX chain be in the path at all right now?
function voiceFxWanted() {
  return !!(window.VoiceFX && window.VoiceFX.isSupported()
    && (savedVoicePreset() !== 'none' || savedNoiseGate()));
}

async function ensureVoiceFxStream(raw) {
  if (!voiceFxWanted()) return raw;
  try {
    const out = await window.VoiceFX.attach(raw);
    window.VoiceFX.setPreset(savedVoicePreset());
    window.VoiceFX.setNoiseGate(savedNoiseGate());
    return out;
  } catch (e) {
    console.warn('voice effects unavailable', e && e.message);
    return raw;
  }
}

// Point every peer's audio sender at `track` without renegotiating.
async function swapOutgoingMicTrack(track) {
  const jobs = [];
  for (const [, peer] of state.voice.peers) {
    for (const sender of peer.pc.getSenders()) {
      if (sender.track && sender.track.kind === 'audio') jobs.push(sender.replaceTrack(track).catch(() => {}));
    }
  }
  await Promise.all(jobs);
}

// Bring the chain in or out of the mic path to match the current prefs.
async function syncVoiceFxChain() {
  const raw = state.voice.micRawStream;
  if (!raw) return; // no mic in this call — nothing to route
  const want = voiceFxWanted();
  const attached = state.voice.localStream && state.voice.localStream !== raw;

  if (want && !attached) {
    const out = await ensureVoiceFxStream(raw);
    if (out === raw) return; // attach failed; stay on the raw mic
    state.voice.localStream = out;
    await swapOutgoingMicTrack(out.getAudioTracks()[0]);
  } else if (!want && attached) {
    state.voice.localStream = raw;
    await swapOutgoingMicTrack(raw.getAudioTracks()[0]);
    try { window.VoiceFX.detach(); } catch {}
  } else if (want && attached) {
    window.VoiceFX.setPreset(savedVoicePreset());
    window.VoiceFX.setNoiseGate(savedNoiseGate());
    return; // the track never changed, so mute/detection state is still valid
  } else {
    return;
  }

  // The new track starts life enabled; re-apply mute/PTT, and re-point the
  // speaking analyser at whatever we are actually transmitting now.
  applyMicState();
  startSpeakingDetection();
}

async function setVoicePreset(id) {
  localStorage.setItem('disdroc_vfx', id || 'none');
  await syncVoiceFxChain();
  renderVoiceBar();
}

async function setNoiseGate(on) {
  localStorage.setItem('disdroc_gate', on ? 'on' : 'off');
  await syncVoiceFxChain();
}

async function ensureLocalCamera() {
  if (state.voice.localVideoStream) return state.voice.localVideoStream;
  try {
    const mobile = isMobileLayout();
    // On mobile prefer facingMode (so flip works); on desktop honour the chosen device.
    const video = (mobile && !state.voice.camDeviceId)
      ? { facingMode: { ideal: state.voice.camFacing || 'user' }, width: { ideal: 640 }, height: { ideal: 360 } }
      : state.voice.camDeviceId
        ? { deviceId: { exact: state.voice.camDeviceId }, width: 640, height: 360 }
        : { width: 640, height: 360 };
    state.voice.localVideoStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    return state.voice.localVideoStream;
  } catch (e) {
    alert('Could not access camera: ' + e.message);
    return null;
  }
}

function startSpeakingDetection() {
  stopSpeakingDetection(); // never stack two analysers/contexts
  if (!state.voice.localStream) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    state.voice.audioCtx = ctx;
    // An AudioContext created after an async gap (getUserMedia) often starts
    // "suspended"; its analyser then reads silence and the speaking indicator
    // never lights. Resume it explicitly so level detection actually runs.
    ctx.resume?.().catch(() => {});
    const source = ctx.createMediaStreamSource(state.voice.localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    state.voice.analyser = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeak = false, lastEmit = 0, quietSince = 0;
    // A timer (not requestAnimationFrame): rAF stops in background tabs, which
    // froze the indicator for everyone whenever the speaker alt-tabbed. Each
    // tick SKIPS (never kills the loop) while not ready — at join, detection
    // starts before channelId is set, and a dead first frame used to
    // permanently kill the old rAF loop so the ring never lit at all.
    state.voice.levelTimer = setInterval(() => {
      if (state.voice.audioCtx !== ctx) return; // superseded — stop() also clears us
      if (ctx.state === 'suspended') { ctx.resume?.().catch(() => {}); return; }
      if (state.voice.channelId == null) return;
      analyser.getByteFrequencyData(data);
      let sum = 0; for (const v of data) sum += v;
      const avg = sum / data.length;
      const loud = avg > 18 && !state.voice.muted;
      const now = Date.now();
      // Lights instantly, but only dims after ~500ms of continuous quiet —
      // natural gaps between words otherwise flicker the class off/on, which
      // restarts the ring's pulse animation on every syllable.
      let speaking = lastSpeak;
      if (loud) { quietSince = 0; speaking = true; }
      else if (state.voice.muted) { quietSince = 0; speaking = false; }
      else if (!quietSince) quietSince = now;
      else if (now - quietSince >= 500) speaking = false;
      if (speaking !== lastSpeak || (speaking && now - lastEmit > 1500)) {
        lastSpeak = speaking; lastEmit = now;
        state.socket.emit('voice:speaking', { speaking });
        applyTileSpeakingClass(state.me.id, speaking);
      }
    }, 80);
  } catch (e) { console.warn('speaking detect', e.message); }
}
function stopSpeakingDetection() {
  if (state.voice.levelTimer) clearInterval(state.voice.levelTimer);
  state.voice.levelTimer = null;
  if (state.voice.audioCtx) { try { state.voice.audioCtx.close(); } catch {} }
  state.voice.audioCtx = null; state.voice.analyser = null;
}

function startStatsLoop() {
  stopStatsLoop();
  state.voice.statsTimer = setInterval(async () => {
    for (const [, peer] of state.voice.peers) {
      try {
        const stats = await peer.pc.getStats();
        let loss = null;
        for (const r of stats.values()) {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            peer.rtt = r.currentRoundTripTime * 1000;
          }
          if (r.type === 'remote-inbound-rtp' && r.fractionLost != null) loss = Math.max(loss == null ? 0 : loss, r.fractionLost);
        }
        peer.loss = loss;
        adaptBitrate(peer);
      } catch {}
    }
    renderVoiceStatus();
  }, 2000);
}
function stopStatsLoop() {
  if (state.voice.statsTimer) clearInterval(state.voice.statsTimer);
  state.voice.statsTimer = null;
}

// Adaptive bitrate fallback: with no TURN relay and a plain WebRTC mesh, a
// congested uplink degrades everyone. Step the audio encoder down when we see
// packet loss / high RTT, and recover slowly once the link is clean again.
const AUDIO_BITRATE_TIERS = [0, 32000, 20000, 12000]; // 0 = browser default (no cap)
function setAudioBitrate(peer, bps) {
  for (const sender of peer.pc.getSenders()) {
    if (!sender.track || sender.track.kind !== 'audio') continue;
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    if (bps) params.encodings[0].maxBitrate = bps; else delete params.encodings[0].maxBitrate;
    // Voice must win the fight for a congested uplink — mark it high priority so
    // the browser starves the screen-share encoder before it starves Opus.
    params.encodings[0].priority = 'high';
    params.encodings[0].networkPriority = 'high';
    sender.setParameters(params).catch(() => {});
  }
}

// Screen-share encoder tuning. A mesh call encodes the share SEPARATELY for every
// viewer, so an uncapped 1080p share to N people tries to push N × ~2.5Mbit up one
// uplink: audio loses, the voice bar goes red, and the encoder (which defaults to
// keeping screens sharp rather than smooth) drops to slideshow FPS. Cap each
// sender to a slice of a fixed budget and always favor framerate over resolution.
const SCREEN_BITRATE = { hd: 2500000, sd: 1200000, floor: 300000 };
// 60fps doubles the frame count, but adjacent screen frames reuse most of their
// content; 1.6x preserves motion detail without paying a wasteful full 2x cost.
const SCREEN_60FPS_BITRATE_MULTIPLIER = 1.6;
const SCREEN_SCALE_TIERS = [1, 0.6, 0.4, 0.25]; // congestion back-off multipliers
function tuneScreenSender(peer) {
  const sender = peer.screenSender;
  if (!sender) return;
  const viewers = Math.max(1, [...state.voice.peers.values()].filter((p) => p.screenSender).length);
  const hd = !state.voice.screenPrefs || state.voice.screenPrefs.hd !== false;
  const requestedFps = state.voice.screenFps === 60 ? 60 : 30;
  const targetFps = requestedFps === 60 && peer._vFpsBackoff ? 30 : requestedFps;
  const fpsBitrateMultiplier = targetFps === 60 ? SCREEN_60FPS_BITRATE_MULTIPLIER : 1;
  const scale = SCREEN_SCALE_TIERS[Math.min(peer._vTier || 0, SCREEN_SCALE_TIERS.length - 1)];
  const params = sender.getParameters();
  if (!params.encodings || !params.encodings.length) params.encodings = [{}];
  params.degradationPreference = 'maintain-framerate';
  params.encodings[0].maxFramerate = targetFps;
  params.encodings[0].maxBitrate = Math.max(SCREEN_BITRATE.floor,
    Math.round((hd ? SCREEN_BITRATE.hd : SCREEN_BITRATE.sd) * fpsBitrateMultiplier / viewers * scale));
  sender.setParameters(params).catch(() => {});
}
function retuneScreenSenders() {
  for (const [, p] of state.voice.peers) tuneScreenSender(p);
}

function adaptBitrate(peer) {
  const congested = (peer.loss != null && peer.loss > 0.05) || (peer.rtt != null && peer.rtt > 400);
  if (peer._tier == null) peer._tier = 0;
  if (peer._vTier == null) peer._vTier = 0;
  if (congested) {
    peer._goodStreak = 0;
    // The screen share is the bandwidth hog — throttle it first and leave voice
    // alone; audio only steps down once the video is already at its floor.
    if (peer.screenSender && peer._vTier < SCREEN_SCALE_TIERS.length - 1) {
      peer._vTier++; tuneScreenSender(peer);
    } else if (peer.screenSender && state.voice.screenFps === 60 && !peer._vFpsBackoff) {
      // If even the lowest scale tier cannot carry an opted-in 60fps share,
      // halve motion before sacrificing voice quality too.
      peer._vFpsBackoff = true; tuneScreenSender(peer);
    } else if (peer._tier < AUDIO_BITRATE_TIERS.length - 1) {
      peer._tier++; setAudioBitrate(peer, AUDIO_BITRATE_TIERS[peer._tier]);
    }
  } else {
    peer._goodStreak = (peer._goodStreak || 0) + 1;
    // ~10s of clean stats before climbing back up one tier (avoid oscillation);
    // voice recovers first, video last.
    if (peer._goodStreak >= 5) {
      if (peer._tier > 0) { peer._tier--; setAudioBitrate(peer, AUDIO_BITRATE_TIERS[peer._tier]); peer._goodStreak = 0; }
      else if (peer._vTier > 0) { peer._vTier--; tuneScreenSender(peer); peer._goodStreak = 0; }
      else if (peer._vFpsBackoff) { peer._vFpsBackoff = false; tuneScreenSender(peer); peer._goodStreak = 0; }
    }
  }
}

async function toggleVoiceJoin(channelId, name) {
  if (!voiceSupported()) {
    alert('Voice/video needs a secure (HTTPS) connection and a browser with WebRTC support.');
    return;
  }
  if (state.voice.channelId === channelId) { await voiceLeave(); return; }
  if (state.voice.channelId != null) await voiceLeave();
  await ensureLocalMic(); // null = no mic; join in listen-only mode
  await refreshIceServers(); // pick up TURN credentials before building peer connections
  dismissIncomingCall(channelId);
  state.voice.channelId = channelId; state.voice.channelName = name;
  startStatsLoop();
  state.socket.emit('voice:join', { channelId, muted: !!(state.voice.muted || state.voice.noMic), deafened: !!state.voice.deafened }, async ({ peers, error }) => {
    if (error) {
      const msg = error === 'voice_join_rate' ? 'You\'re joining/leaving voice too quickly — wait a moment.'
        : error === 'muted' ? 'You\'re temporarily suspended from voice.'
        : error === 'timed_out' ? 'You\'re timed out in this server and can\'t talk in voice.' : error;
      alert('Cannot join voice: ' + msg); state.voice.channelId = null; return;
    }
    playSfx('join');
    nativeSetInCall(true);
    renderVoiceBar(); renderChatActions();
    // On phones the full-screen call view is the good experience — open it on join.
    if (isMobileLayout()) openCallStage();
    for (const p of peers) await voiceConnectToPeer(p.socketId, p.userId, p.username);
    updateRingback();
  });
}

// Re-gather a stalled peer using ONLY the TURN relay. On double-CGNAT the host
// and server-reflexive candidates can never connect, so the default 'all' policy
// sits forever in "checking". Forcing relay-only + an ICE restart drives it onto
// the relay path we verified works. Repeated failures eventually coordinate a
// fresh RTCPeerConnection on both browsers instead of deleting the peer.
function hasTurnServer() {
  return _iceServers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === 'string' && (u.startsWith('turn:') || u.startsWith('turns:')));
  });
}
function iceIsUp(pc) {
  const s = pc.iceConnectionState;
  return s === 'connected' || s === 'completed';
}
async function escalateToRelay(peer, socketId) {
  if (!peer || peer.relayForced || peer.recoveryInFlight) return;
  const pc = peer.pc;
  if (!pc || pc.signalingState === 'closed') return;
  if (iceIsUp(pc)) return; // already fine — don't force a working link onto relay
  peer.relayForced = true;
  peer.recoveryInFlight = true;
  // Long calls can outlive the six-hour self-hosted TURN username. Refresh
  // before allocating a replacement relay instead of retrying an expired
  // credential forever. The five-minute freshness gate keeps normal recovery
  // fast and deduplicates simultaneous peers above.
  try { await refreshIceServers(false); } catch {}
  if (state.voice.peers.get(socketId) !== peer || pc.signalingState === 'closed') {
    peer.recoveryInFlight = false;
    return;
  }
  // refreshIceServers can take several seconds (retries on a flaky network) —
  // ICE may have self-healed on its own while we waited. Forcing relay-only
  // now would tear down an already-working P2P link instead of saving it.
  if (iceIsUp(pc)) {
    peer.relayForced = false;
    peer.recoveryInFlight = false;
    return;
  }
  // Relay-only is only useful if a TURN server is actually configured — without
  // one it produces zero relay candidates, so forcing the policy would kill a
  // direct connection that might still succeed instead of helping it. In that
  // case just restart ICE on the existing (unrestricted) policy.
  const turnAvailable = hasTurnServer();
  if (turnAvailable) {
    // setConfiguration can throw on some browsers when iceTransportPolicy
    // changes, so swallow that but ALWAYS restart ICE.
    try { pc.setConfiguration({ iceServers: _iceServers, iceTransportPolicy: 'relay' }); }
    catch (e) { console.warn('[voice] setConfiguration(relay) rejected:', e.message); }
  }
  try { if (typeof pc.restartIce === 'function') pc.restartIce(); } catch (e) { console.warn('[voice] restartIce failed:', e.message); }
  peer.recoveryInFlight = false;
  console.warn('[voice] peer stalled —', turnAvailable ? 'forced relay path for' : 'no TURN configured, plain ICE restart for', socketId);
}

function requestVoicePeerReset(peer, socketId) {
  if (!peer || peer.resetRequested || state.voice.peers.get(socketId) !== peer) return;
  peer.resetRequested = true;
  console.warn('[voice] ICE retries exhausted — rebuilding peer connection for', socketId);
  if (state.socket && state.socket.connected) state.socket.emit('voice:peer-reset', { to: socketId });
  // If the reset signal races a signalling flap, do not delete the participant
  // or strand the tile. Re-arm ICE recovery; the socket rejoin path will rebuild
  // everything once signalling itself returns.
  peer.resetFallback = setTimeout(() => {
    peer.resetFallback = null;
    if (state.voice.peers.get(socketId) !== peer) return;
    peer.resetRequested = false;
    peer.relayForced = false;
    peer.iceDrops = 0;
    escalateToRelay(peer, socketId);
  }, 8000);
}

async function voiceConnectToPeer(socketId, userId, username) {
  if (state.voice.peers.has(socketId)) return state.voice.peers.get(socketId);
  // Same user arriving under a new socket id = they reconnected/rejoined. Drop
  // the old entry first — the server evicts their zombie socket, but if that
  // event races us (or was missed) we'd render the person twice.
  if (userId) {
    for (const [sid, p] of [...state.voice.peers]) {
      if (p.userId === userId && sid !== socketId) voiceClosePeer(sid);
    }
  }
  const pc = new RTCPeerConnection({ iceServers: _iceServers });
  const peer = {
    pc, userId, username,
    audio: null, rawAudio: null, gain: null, boost: null,
    videoStream: null, videoOn: false, speaking: false,
    screenStream: null, screenOn: false, screenIds: new Set(),
    camSender: null, screenSender: null, screenAudioSender: null,
    polite: state.me.id < (userId || 0),
    makingOffer: false, rtt: null,
    pendingCands: [], sigq: null,
    relayForced: false, recoveryInFlight: false, connectWatch: null,
    iceDrops: 0, dropWatch: null, rebuildWatch: null,
    resetRequested: false, resetFallback: null,
  };
  state.voice.peers.set(socketId, peer);

  if (state.voice.localStream) for (const t of state.voice.localStream.getTracks()) pc.addTrack(t, state.voice.localStream);
  if (state.voice.localVideoStream) {
    const vt = state.voice.localVideoStream.getVideoTracks()[0];
    if (vt) peer.camSender = pc.addTrack(vt, state.voice.localVideoStream);
  }
  if (state.voice.screenStream) {
    const st = state.voice.screenStream.getVideoTracks()[0];
    const sa = state.voice.screenStream.getAudioTracks()[0];
    if (st) peer.screenSender = pc.addTrack(st, state.voice.screenStream);
    if (sa) peer.screenAudioSender = pc.addTrack(sa, state.voice.screenStream);
    retuneScreenSenders(); // one more viewer → smaller budget slice for everyone
    state.socket.emit('voice:screen-state', { on: true, streamId: state.voice.screenStream.id });
  }

  // Guarantee at least one m-line so negotiation — and therefore ICE — always
  // starts. A listen-only peer (no mic) adds no tracks above, which means
  // onnegotiationneeded never fires, no offer is made, and the connection sits in
  // "new" forever. A recvonly audio transceiver forces the offer/answer to happen.
  if (pc.getTransceivers().length === 0) {
    try { peer.recvAudioTransceiver = pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { console.warn('addTransceiver', e.message); }
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) state.socket.emit('voice:signal', { to: socketId, data: { candidate: e.candidate } });
  };

  pc.ontrack = (e) => {
    const p = state.voice.peers.get(socketId);
    if (!p || p !== peer) return;
    const stream = e.streams[0];
    if (e.track.kind === 'audio') {
      if (!p.audio) {
        p.audio = document.createElement('audio');
        p.audio.autoplay = true; p.audio.playsInline = true;
        p.audio.muted = state.voice.deafened;
        document.body.append(p.audio);
      }
      // Per-user volume can exceed 100% (the booster), which HTMLMediaElement
      // can't do (volume caps at 1) — so route raw stream → GainNode →
      // MediaStreamDestination and let the element play the processed stream.
      // Deafen/master-volume/setSinkId all stay on the element, and Spatial
      // builds from p.audio.srcObject, so the per-user gain feeds it too.
      let outStream = stream;
      const ctx = boostCtx();
      if (ctx) {
        try {
          ctx.resume?.();
          if (p.boost) { try { p.boost.src.disconnect(); p.boost.gain.disconnect(); } catch {} }
          const ms = new MediaStream(stream.getAudioTracks());
          const src = ctx.createMediaStreamSource(ms);
          const gain = ctx.createGain();
          const dest = ctx.createMediaStreamDestination();
          src.connect(gain); gain.connect(dest);
          p.boost = { src, gain, dest, ms };
          p.gain = gain;
          outStream = dest.stream;
          // Chromium quirk (same one spatial.js works around): a remote WebRTC
          // track feeding only a MediaStreamSource pulls no samples — a muted
          // element must also hold the raw stream to keep it flowing.
          if (!p.rawAudio) {
            p.rawAudio = document.createElement('audio');
            p.rawAudio.muted = true; p.rawAudio.autoplay = true; p.rawAudio.playsInline = true;
            document.body.append(p.rawAudio);
          }
          p.rawAudio.srcObject = stream;
          p.rawAudio.play().catch(() => {});
        } catch (err) {
          console.warn('voice boost chain', err.message);
          p.gain = null; p.boost = null; outStream = stream;
        }
      }
      p.audio.srcObject = outStream;
      applyPeerGain(p);
      p.audio.play().catch(() => {});
      applyOutputDevice(p.audio);
      window.Spatial?.attach(socketId, p);
    } else if (e.track.kind === 'video') {
      if (p.screenIds.has(stream.id)) {
        p.screenStream = stream; p.screenOn = true;
        e.track.addEventListener('ended', () => { p.screenStream = null; p.screenOn = false; renderVoiceBar(); });
      } else {
        p.videoStream = stream; p.videoOn = true;
        e.track.addEventListener('ended', () => { p.videoStream = null; p.videoOn = false; renderVoiceBar(); });
      }
      renderVoiceBar();
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      state.socket.emit('voice:signal', { to: socketId, data: { sdp: pc.localDescription } });
    } catch (e) { console.warn('nego', e.message); }
    finally { peer.makingOffer = false; }
  };

  pc.oniceconnectionstatechange = () => {
    if (state.voice.peers.get(socketId) !== peer) return;
    renderVoiceStatus();
    const st = pc.iceConnectionState;
    if (st === 'connected' || st === 'completed') {
      // Clean reconnect — reset every recovery counter so a LATER drop gets the
      // full retry budget again instead of dying on the first hiccup.
      peer.iceDrops = 0;
      peer.resetRequested = false;
      if (peer.connectWatch) { clearTimeout(peer.connectWatch); peer.connectWatch = null; }
      if (peer.dropWatch) { clearTimeout(peer.dropWatch); peer.dropWatch = null; }
      if (peer.rebuildWatch) { clearTimeout(peer.rebuildWatch); peer.rebuildWatch = null; }
      if (peer.resetFallback) { clearTimeout(peer.resetFallback); peer.resetFallback = null; }
      // (Re)apply encoder params now that the transport is up — setParameters
      // calls made before the first negotiation can be silently dropped.
      setAudioBitrate(peer, AUDIO_BITRATE_TIERS[peer._tier || 0]);
      tuneScreenSender(peer);
      return;
    }
    if (st === 'disconnected') {
      // Transient drop (flaky wifi / TCP relay hiccup). It often self-heals, so
      // give it a short grace; if still down, re-grab a fresh relay allocation
      // instead of letting the call hang. Recoverable — unlike the old one-shot.
      if (!peer.dropWatch) {
        peer.dropWatch = setTimeout(() => {
          peer.dropWatch = null;
          const cur = pc.iceConnectionState;
          if (cur === 'connected' || cur === 'completed') return;
          peer.relayForced = false; // re-arm escalation for a mid-call drop
          escalateToRelay(peer, socketId);
        }, 2500);
      }
      return;
    }
    if (st === 'failed') {
      if (peer.recoveryInFlight) return;
      // First failure: the default path can't traverse this NAT — force the
      // relay-only path before anything else (this is the double-CGNAT case).
      if (!peer.relayForced) {
        escalateToRelay(peer, socketId);
        schedulePeerRebuild(15000);
      } else if ((peer.iceDrops || 0) < 3) {
        // Already relay-only — re-grab a fresh TURN allocation. Retry a few times
        // (a dropped call is far worse than a few extra restarts) before closing.
        peer.iceDrops = (peer.iceDrops || 0) + 1;
        peer.relayForced = false;
        escalateToRelay(peer, socketId);
        schedulePeerRebuild(12000);
      } else {
        requestVoicePeerReset(peer, socketId);
      }
    } else if (st === 'closed') {
      voiceClosePeer(socketId, peer);
    }
  };

  // Ask both sides to rebuild only if this PC is STILL not connected after
  // `ms`; a successful reconnect cancels the deadline above.
  function schedulePeerRebuild(ms) {
    if (peer.rebuildWatch) clearTimeout(peer.rebuildWatch);
    peer.rebuildWatch = setTimeout(() => {
      peer.rebuildWatch = null;
      const cur = pc.iceConnectionState;
      if (cur !== 'connected' && cur !== 'completed') requestVoicePeerReset(peer, socketId);
    }, ms);
  }

  // Stall watchdog: ICE can sit in "checking" for 30s+ before it ever reports
  // "failed". If we're not connected within 3s, proactively force the relay path
  // instead of waiting out the long default timeout (faster TURN fallback).
  peer.connectWatch = setTimeout(() => {
    const s = pc.iceConnectionState;
    if (s !== 'connected' && s !== 'completed') escalateToRelay(peer, socketId);
  }, 3000);

  renderVoiceBar(); renderChatActions();
  return peer;
}

function outVolume() {
  const v = parseInt(localStorage.getItem('disdroc_out_volume'), 10);
  return isNaN(v) ? 1 : Math.max(0, Math.min(1, v / 100));
}
function applyOutputVolume() {
  for (const [, p] of state.voice.peers) if (p.audio) applyPeerGain(p);
  window.Spatial?.setVolume?.(outVolume());
}

// ── Per-user volume + local mute ─────────────────────────────────────────────
// Prefs persist by userId in localStorage so they survive rejoins and apply the
// next time you share a call with that person. vol is a percent — 100 = normal,
// up to 500 through the booster (the GainNode in pc.ontrack makes >100 work).
let _boostCtx = null;
function boostCtx() {
  if (_boostCtx && _boostCtx.state !== 'closed') return _boostCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { _boostCtx = new AC(); } catch { return null; }
  return _boostCtx;
}
function userVoicePrefs() {
  try { return JSON.parse(localStorage.getItem('disdroc_user_voice') || '{}') || {}; } catch { return {}; }
}
function userVoicePref(uid) {
  const p = userVoicePrefs()[uid] || {};
  const vol = (typeof p.vol === 'number' && isFinite(p.vol)) ? Math.max(0, Math.min(500, Math.round(p.vol))) : 100;
  return { vol, muted: !!p.muted };
}
function setUserVoicePref(uid, patch) {
  const all = userVoicePrefs();
  const next = { ...userVoicePref(uid), ...patch };
  if (next.vol === 100 && !next.muted) delete all[uid]; // defaults need no entry
  else all[uid] = next;
  try { localStorage.setItem('disdroc_user_voice', JSON.stringify(all)); } catch {}
  applyUserVoicePref(uid);
}
function applyUserVoicePref(uid) {
  for (const [, p] of state.voice.peers) if (p.userId === uid) applyPeerGain(p);
  // Screen-share audio plays straight off the <video>, so it can't be boosted —
  // but volume-down and local mute should still apply to it.
  const pref = userVoicePref(uid);
  for (const v of document.querySelectorAll(`.screen-tile[data-uid="${uid}"] video`)) {
    if (v.closest('.call-tile') && !v.muted) v.volume = Math.max(0, Math.min(1, pref.muted ? 0 : pref.vol / 100));
  }
}
function applyPeerGain(p) {
  if (!p) return;
  const pref = userVoicePref(p.userId);
  const g = pref.muted ? 0 : pref.vol / 100;
  if (p.gain) {
    p.gain.gain.value = g;
    if (p.audio) p.audio.volume = outVolume(); // master stays on the element
  } else if (p.audio) {
    // No WebAudio chain (unsupported / failed) — element volume caps at 100%.
    p.audio.volume = outVolume() * Math.max(0, Math.min(1, g));
  }
}

// Right-click on a voice participant: volume slider (booster unlocks up to
// 500%), local mute, and profile shortcut. Volume rows only appear when they
// actually share our current call — that's when there's audio to control.
function openUserVoiceMenu(point, meta) {
  const uid = meta && meta.id;
  if (!uid || (state.me && uid === state.me.id)) return;
  const inMyCall = [...state.voice.peers.values()].some(p => p.userId === uid);
  const pref = userVoicePref(uid);
  const items = [];
  if (inMyCall) {
    items.push({ custom: userVolumeSliderRow(uid) });
    items.push({ sep: true });
    items.push({
      label: pref.muted ? t('menu.unmuteForMe') : t('menu.muteForMe'),
      icon: pref.muted ? 'volume' : 'volume-x',
      danger: !pref.muted,
      click: () => { setUserVoicePref(uid, { muted: !pref.muted }); renderVoiceBar(); },
    });
    if (pref.vol !== 100) items.push({
      label: t('menu.resetVolume'), icon: 'rotate-ccw',
      click: () => { setUserVoicePref(uid, { vol: 100 }); renderVoiceBar(); },
    });
    items.push({ sep: true });
  }
  if (meta.username) items.push({ label: t('menu.viewProfile'), icon: 'user', click: () => openProfile(meta.username) });
  // Quick role assignment right from the member list / voice tile — the same
  // PUT the Server Settings → Members → Roles picker uses, without making you
  // hunt through settings to find the person first.
  if (state.view === 'server' && state.serverDetail && hasServerPerm(SP.MANAGE_ROLES)) {
    const member = state.serverDetail.members.find(m => m.id === uid);
    if (member) { items.push({ sep: true }); items.push({ custom: memberRolesQuickEditor(member) }); }
  }
  showFloatingMenu(point, items, 'user-voice-menu');
}

// Caller's highest role position in the currently open server ('owner'/'admin'
// tier outrank every custom role, same as perms.highestRolePosition() server-side).
function myTopRolePosition() {
  const d = state.serverDetail;
  if (!d) return 0;
  if (d.role === 'owner' || d.role === 'admin') return Infinity;
  const me = d.members.find(m => m.id === state.me.id);
  const roleList = d.roles || [];
  return Math.max(0, ...((me && me.role_ids) || []).map(id => { const r = roleList.find(rr => rr.id === id); return r ? r.position : 0; }));
}

// Compact checkbox list for toggling a member's custom roles inline from a
// floating menu (member sidebar / voice tile right-click) — each toggle PUTs
// the member's full role set immediately, mirroring the settings-modal picker.
function memberRolesQuickEditor(member) {
  const roleList = (state.serverDetail && state.serverDetail.roles) || [];
  const assignable = roleList.filter(r => !r.is_default);
  const myTop = myTopRolePosition();
  const wrap = el('div', { class: 'fm-roles' });
  wrap.append(el('div', { class: 'fm-roles-head' }, 'Roles'));
  if (!assignable.length) {
    wrap.append(el('div', { class: 'fm-role-empty' }, 'No roles yet'));
    return wrap;
  }
  const list = el('div', { class: 'fm-roles-list' });
  let current = new Set(member.role_ids || []);
  for (const r of assignable) {
    const canAssign = r.position < myTop;
    const cb = el('input', { type: 'checkbox' });
    cb.checked = current.has(r.id);
    cb.disabled = !canAssign;
    const row = el('label', { class: 'fm-role-row' + (canAssign ? '' : ' disabled') }, [
      cb, el('span', { class: 'role-dot', style: 'background:' + (r.color || 'var(--muted)') }), r.name,
    ]);
    if (canAssign) cb.addEventListener('change', async () => {
      const next = new Set(current);
      if (cb.checked) next.add(r.id); else next.delete(r.id);
      cb.disabled = true;
      try {
        const res = await api(`/api/servers/${state.serverId}/members/${member.id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds: [...next] }) });
        current = new Set(res.role_ids || [...next]);
        member.role_ids = [...current]; // same object ref as in state.serverDetail.members
        renderRightPanel();
      } catch (e) { cb.checked = !cb.checked; alert(modErr(e.message)); }
      cb.disabled = false;
    });
    list.append(row);
  }
  wrap.append(list);
  return wrap;
}

function userVolumeSliderRow(uid) {
  const pref = userVoicePref(uid);
  const boosted = pref.vol > 200;
  const val = el('span', { class: 'fm-vol-val' + (pref.vol > 100 ? ' hot' : '') }, pref.vol + '%');
  const slider = el('input', { type: 'range', min: '0', max: boosted ? '500' : '200', step: '5', value: String(pref.vol) });
  const boost = el('button', {
    type: 'button', class: 'fm-boost' + (boosted ? ' on' : ''), title: t('menu.booster'),
    on: { click: (e) => {
      e.stopPropagation();
      const on = boost.classList.toggle('on');
      slider.max = on ? '500' : '200';
      if (!on && parseInt(slider.value, 10) > 200) { slider.value = '200'; slider.dispatchEvent(new Event('input')); }
    } },
  }, [icon('zap', 13)]);
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) || 0;
    val.textContent = v + '%';
    val.classList.toggle('hot', v > 100);
    setUserVoicePref(uid, { vol: v });
  });
  // Repaint tiles once on release — not per drag tick, that would rebuild
  // video elements dozens of times a second.
  slider.addEventListener('change', () => renderVoiceBar());
  return el('div', { class: 'fm-volume' }, [
    el('div', { class: 'fm-vol-head' }, [el('span', { class: 'fm-vol-label' }, t('menu.userVolume')), boost, val]),
    slider,
  ]);
}
function applyOutputDevice(audioEl) {
  if (!state.voice.outDeviceId || !audioEl.setSinkId) return;
  audioEl.setSinkId(state.voice.outDeviceId).catch(() => {});
}

function voiceClosePeer(socketId, expectedPeer = null) {
  const p = state.voice.peers.get(socketId);
  if (!p || (expectedPeer && p !== expectedPeer)) return;
  // Remove first and detach callbacks before close(). Some browsers dispatch a
  // delayed "closed" ICE event; it must not find and destroy a replacement PC
  // that has already been installed under this same socket id.
  state.voice.peers.delete(socketId);
  if (p.connectWatch) { clearTimeout(p.connectWatch); p.connectWatch = null; }
  if (p.dropWatch) { clearTimeout(p.dropWatch); p.dropWatch = null; }
  if (p.rebuildWatch) { clearTimeout(p.rebuildWatch); p.rebuildWatch = null; }
  if (p.resetFallback) { clearTimeout(p.resetFallback); p.resetFallback = null; }
  window.Spatial?.detach(socketId);
  p.pc.oniceconnectionstatechange = null;
  p.pc.onconnectionstatechange = null;
  p.pc.onicecandidate = null;
  p.pc.onnegotiationneeded = null;
  p.pc.ontrack = null;
  try { p.pc.close(); } catch {}
  if (p.boost) { try { p.boost.src.disconnect(); p.boost.gain.disconnect(); } catch {} p.boost = null; p.gain = null; }
  if (p.rawAudio) { p.rawAudio.remove(); p.rawAudio = null; }
  if (p.audio) p.audio.remove();
  if (state.voice.screenStream) retuneScreenSenders(); // fewer viewers → bigger slice each
  renderVoiceBar();
}

// Called from the socket 'connect' handler when we reconnect mid-call. Our old
// peer connections are tied to the dead socket id (every peer already tore theirs
// down when the server broadcast our disconnect), so close them all, re-join the
// room under the new socket, and dial the current occupants fresh. Local mic/cam/
// screen streams are untouched — voiceConnectToPeer re-attaches their tracks.
function invalidateVoiceRejoin() {
  state.voice._rejoinGeneration = (state.voice._rejoinGeneration || 0) + 1;
  state.voice._rejoinInFlight = null;
  if (state.voice._rejoinRetryTimer) {
    clearTimeout(state.voice._rejoinRetryTimer);
    state.voice._rejoinRetryTimer = null;
  }
}

function scheduleVoiceRejoin(channelId, generation, attempt, delay) {
  if (state.voice._rejoinRetryTimer) clearTimeout(state.voice._rejoinRetryTimer);
  state.voice._rejoinRetryTimer = setTimeout(() => {
    state.voice._rejoinRetryTimer = null;
    if (state.voice.channelId === channelId && state.socket.connected
      && (state.voice._rejoinGeneration || 0) === generation) {
      rejoinVoiceAfterReconnect(attempt, generation);
    }
  }, delay);
}

async function rejoinVoiceAfterReconnect(attempt = 0, generation = state.voice._rejoinGeneration || 0) {
  const channelId = state.voice.channelId;
  if (channelId == null) return;
  if (!state.socket.connected || (state.voice._rejoinGeneration || 0) !== generation) return;
  if (state.voice._rejoinInFlight === generation) return;
  state.voice._rejoinInFlight = generation;
  if (attempt === 0) for (const sid of [...state.voice.peers.keys()]) voiceClosePeer(sid);
  try { await refreshIceServers(attempt === 0); } catch {}
  if (state.voice.channelId !== channelId || !state.socket.connected
    || (state.voice._rejoinGeneration || 0) !== generation) {
    if (state.voice._rejoinInFlight === generation) state.voice._rejoinInFlight = null;
    return;
  }
  state.socket.timeout(10000).emit('voice:join', {
    channelId,
    muted: !!(state.voice.muted || state.voice.noMic),
    deafened: !!state.voice.deafened,
    rejoin: true,
  }, async (ackError, response) => {
    if ((state.voice._rejoinGeneration || 0) !== generation) return;
    state.voice._rejoinInFlight = null;
    if (state.voice.channelId !== channelId || !state.socket.connected) return;
    const peers = (response && response.peers) || [];
    const error = ackError ? 'ack_timeout' : response && response.error;
    if (error) {
      // Ack timeouts are transport failures, not proof that the user left the
      // call. Retry on this same healthy socket; a later disconnect invalidates
      // the generation immediately and lets its replacement start fresh.
      if ((error === 'voice_join_rate' || error === 'ack_timeout') && attempt < 5) {
        const delay = error === 'voice_join_rate' ? 7000 : Math.min(10000, 1500 * (attempt + 1));
        scheduleVoiceRejoin(channelId, generation, attempt + 1, delay);
        return;
      }
      console.warn('[voice] rejoin after reconnect failed:', error);
      await voiceLeave();
      alert('Lost the voice connection and couldn\'t rejoin the call automatically. You\'ve been removed from the call — rejoin when ready.');
      return;
    }
    console.log('[voice] rejoined channel', channelId, 'after reconnect —', (peers || []).length, 'peer(s)');
    for (const p of peers) await voiceConnectToPeer(p.socketId, p.userId, p.username);
    renderVoiceBar(); renderChatActions();
    updateRingback();
  });
}

async function voiceLeave() {
  if (state.voice.channelId == null) return;
  invalidateVoiceRejoin();
  playSfx('leave');
  stopRingback();
  state.socket.emit('voice:leave');
  for (const sid of [...state.voice.peers.keys()]) voiceClosePeer(sid);
  // Detach the effects chain first so it releases the device stream before we
  // stop the tracks; leaving it running would keep an AudioContext (and on
  // Android the mic indicator) alive for the rest of the session.
  try { window.VoiceFX?.detach(); } catch {}
  if (state.voice.micRawStream) {
    for (const t of state.voice.micRawStream.getTracks()) t.stop();
    state.voice.micRawStream = null;
  }
  if (state.voice.localStream) {
    for (const t of state.voice.localStream.getTracks()) t.stop();
    state.voice.localStream = null;
  }
  if (state.voice.localVideoStream) {
    for (const t of state.voice.localVideoStream.getTracks()) t.stop();
    state.voice.localVideoStream = null;
  }
  if (state.voice.screenStream || _nativeScreen) stopScreenShare();
  stopSpeakingDetection();
  stopStatsLoop();
  nativeSetInCall(false);
  if (state.voice.stageOpen) closeCallStage();
  window.Spatial?.teardown();
  teardownWatch();
  teardownWb();
  teardownGame();
  teardownYtMusic();
  state.voiceRingers.delete(state.voice.channelId);
  state.voice.channelId = null; state.voice.channelName = null;
  state.voice.muted = false; state.voice.deafened = false; state.voice.noMic = false;
  closeFloatingMenus();
  renderVoiceBar();
  renderChatActions();
}

function renderUserPanelVoice() {
  const mic = document.getElementById('panelMicBtn');
  const deaf = document.getElementById('panelDeafenBtn');
  if (mic) {
    const noMic = state.voice.noMic;
    mic.classList.toggle('muted', state.voice.muted || noMic);
    mic.classList.toggle('no-mic', noMic);
    mic.title = noMic ? t('chrome.enableMicrophone') : (state.voice.muted ? t('chrome.unmute') : t('chrome.mute'));
    mic.innerHTML = ''; mic.append(icon('mic-off'));
    if (!noMic && !state.voice.muted) { mic.innerHTML = ''; mic.append(icon('mic')); }
  }
  if (deaf) { deaf.classList.toggle('muted', state.voice.deafened); deaf.title = state.voice.deafened ? t('chrome.undeafen') : t('chrome.deafen'); deaf.innerHTML = ''; deaf.append(icon(state.voice.deafened ? 'headphones-off' : 'headphones')); }
}

function pttEnabled() { return localStorage.getItem('disdroc_ptt') === 'on' && !!localStorage.getItem('disdroc_ptt_key'); }
function pttKey() { return localStorage.getItem('disdroc_ptt_key') || ''; }
let _pttHeld = false;
function applyMicState() {
  if (!state.voice.localStream) return;
  const on = !state.voice.muted && (!pttEnabled() || _pttHeld);
  for (const t of state.voice.localStream.getAudioTracks()) t.enabled = on;
}

// Acquire a microphone after already being in the call (joined listen-only, or
// the mic was denied/not ready at join). Reuses the recvonly transceiver added
// for listen-only mode so we just start sending instead of adding a new m-line.
async function enableMicMidCall() {
  if (state.voice.channelId == null) return;
  const stream = await ensureLocalMic();
  if (!stream) {
    alert('Could not open a microphone. Check this site\'s mic permission in your browser, make sure no other app is using the mic, then click the mic button again.');
    renderVoiceBar(); renderUserPanelVoice();
    return;
  }
  const track = stream.getAudioTracks()[0];
  if (!track) return;
  state.voice.noMic = false;
  state.voice.muted = false;
  for (const [, peer] of state.voice.peers) {
    const pc = peer.pc;
    try {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) { await sender.replaceTrack(track); continue; }
      if (peer.recvAudioTransceiver && peer.recvAudioTransceiver.sender) {
        await peer.recvAudioTransceiver.sender.replaceTrack(track);
        try { peer.recvAudioTransceiver.direction = 'sendrecv'; } catch {} // triggers renegotiation
      } else {
        pc.addTrack(track, stream); // no transceiver to reuse — new m-line, renegotiates
      }
    } catch (e) { console.warn('enable mic', e.message); }
  }
  applyMicState();
  startSpeakingDetection();
  emitVoiceSelfState();
  if (state.voice.channelId != null) playSfx('unmute');
  renderVoiceBar(); renderUserPanelVoice();
}

// Broadcast our mute/deafen status to everyone in the channel (no mic counts as
// muted). The server re-fans it via voice:room-update so both the call tiles and
// the sidebar voice-member list show who's muted/deafened.
function emitVoiceSelfState() {
  if (state.voice.channelId == null || !state.socket) return;
  state.socket.emit('voice:self-state', {
    muted: !!(state.voice.muted || state.voice.noMic),
    deafened: !!state.voice.deafened,
  });
}

function toggleMute() {
  if (state.voice.noMic) { enableMicMidCall(); return; }
  state.voice.muted = !state.voice.muted;
  if (state.voice.channelId != null) playSfx(state.voice.muted ? 'mute' : 'unmute');
  applyMicState();
  if (!state.voice.muted && state.voice.deafened) {
    state.voice.deafened = false;
    const spatial = window.Spatial?.isEnabled();
    for (const [, peer] of state.voice.peers) if (peer.audio) peer.audio.muted = !!spatial;
    window.Spatial?.setMasterMuted(false);
  }
  emitVoiceSelfState();
  renderVoiceBar();
  renderUserPanelVoice();
}

function toggleDeafen() {
  state.voice.deafened = !state.voice.deafened;
  if (state.voice.channelId != null) playSfx(state.voice.deafened ? 'mute' : 'unmute');
  if (state.voice.deafened && !state.voice.muted) {
    state.voice.muted = true;
    if (state.voice.localStream) for (const t of state.voice.localStream.getAudioTracks()) t.enabled = false;
  }
  // When spatial audio is on, the element stays muted (playback goes through the
  // Web Audio graph); deafen is applied to the spatial master gain instead.
  const spatial = window.Spatial?.isEnabled();
  for (const [, peer] of state.voice.peers) if (peer.audio) peer.audio.muted = spatial ? true : state.voice.deafened;
  window.Spatial?.setMasterMuted(state.voice.deafened);
  emitVoiceSelfState();
  renderVoiceBar();
  renderUserPanelVoice();
}

async function toggleVideo() {
  if (state.voice.channelId == null) return;
  if (state.voice.localVideoStream) {
    for (const [, peer] of state.voice.peers) {
      if (peer.camSender) { try { peer.pc.removeTrack(peer.camSender); } catch {} peer.camSender = null; }
    }
    for (const t of state.voice.localVideoStream.getTracks()) t.stop();
    state.voice.localVideoStream = null;
    state.socket.emit('voice:video-state', { on: false });
    renderVoiceBar();
    return;
  }
  const stream = await ensureLocalCamera();
  if (!stream) return;
  const vt = stream.getVideoTracks()[0];
  for (const [, peer] of state.voice.peers) {
    if (vt) peer.camSender = peer.pc.addTrack(vt, stream);
  }
  state.socket.emit('voice:video-state', { on: true });
  renderVoiceBar();
}

// Flip between front and back camera (mobile). Swaps the outgoing video track
// on every peer with replaceTrack — no renegotiation needed.
async function switchCamera() {
  if (state.voice.channelId == null) return;
  if (!state.voice.localVideoStream) { await toggleVideo(); return; }
  const next = state.voice.camFacing === 'environment' ? 'user' : 'environment';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: next }, width: { ideal: 640 }, height: { ideal: 360 } }, audio: false,
    });
  } catch (e) {
    alert('Could not switch camera: ' + e.message);
    return;
  }
  state.voice.camFacing = next;
  const newTrack = stream.getVideoTracks()[0];
  for (const [, peer] of state.voice.peers) {
    if (peer.camSender && newTrack) { try { await peer.camSender.replaceTrack(newTrack); } catch {} }
  }
  for (const t of state.voice.localVideoStream.getTracks()) t.stop();
  state.voice.localVideoStream = stream;
  renderVoiceBar(); renderCallStage();
}

// Earpiece ↔ loudspeaker. Only meaningful in the native Android app (the web
// can't route audio output to the earpiece), where DisdrocNative bridges to
// AudioManager. Elsewhere the button is hidden.
function toggleSpeaker() {
  state.voice.speakerOn = !state.voice.speakerOn;
  try { window.DisdrocNative && window.DisdrocNative.setSpeaker(state.voice.speakerOn); } catch {}
  renderVoiceBar(); renderCallStage(); renderUserPanelVoice();
}

// Tell the native app to enter/leave "in communication" audio mode (so the
// earpiece/speaker routing + echo cancellation behave like a real call). Default
// to loudspeaker on join — disdroc calls are usually group/hands-free.
function nativeSetInCall(on) {
  try {
    if (!window.DisdrocNative) return;
    window.DisdrocNative.setInCall(on);
    if (on) { state.voice.speakerOn = true; window.DisdrocNative.setSpeaker(true); }
  } catch {}
}

function aggregateVoiceState() {
  if (state.voice.peers.size === 0) return { label: t('voice.waitingForOthers'), cls: 'alone' };
  let connecting = 0, connected = 0, failed = 0, disconnected = 0;
  for (const [, p] of state.voice.peers) {
    const s = p.pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') connected++;
    else if (s === 'failed') failed++;
    else if (s === 'disconnected') disconnected++;
    else connecting++;
  }
  if (failed > 0) return { label: t('voice.connectionLost'), cls: 'failed' };
  if (disconnected > 0) return { label: t('voice.reconnecting'), cls: 'reconnecting' };
  if (connecting > 0) return { label: t('voice.rtcConnecting'), cls: 'connecting' };
  return { label: t('voice.connected'), cls: 'ok' };
}

function bestRtt() {
  let min = null;
  for (const [, p] of state.voice.peers) {
    if (p.rtt != null && (min == null || p.rtt < min)) min = p.rtt;
  }
  return min;
}
function pingBars(rtt) {
  // 3 bars; <100ms=3, <250ms=2, otherwise 1; null=0
  const wrap = el('span', { class: 'ping-bars' });
  let lit = 0;
  if (rtt != null) lit = rtt < 100 ? 3 : rtt < 250 ? 2 : 1;
  for (let i = 1; i <= 3; i++) {
    wrap.append(el('span', { class: 'bar' + (i <= lit ? ' lit' : '') }));
  }
  if (rtt != null) wrap.title = Math.round(rtt) + 'ms';
  return wrap;
}

function renderVoiceStatus() {
  const st = aggregateVoiceState();
  const rtt = bestRtt();

  // Top call-view status (only visible on the channel you're in).
  const head = $('#voiceBar .voice-head');
  if (head) {
    const statusEl = head.querySelector('.voice-status');
    if (statusEl) {
      statusEl.className = 'voice-status ' + st.cls;
      statusEl.textContent = st.label;
    }
    const pingHolder = head.querySelector('.ping-holder');
    if (pingHolder) {
      pingHolder.innerHTML = '';
      pingHolder.append(pingBars(rtt));
    }
  }

  // Sidebar "Voice Connected" panel (bottom-left). It's driven by the same
  // aggregate state, so keep it in lockstep here — otherwise it only refreshes
  // on a full renderVoiceBar() and can stick on a stale "RTC Connecting…".
  const vp = document.getElementById('voicePanel');
  if (vp && vp.style.display !== 'none') {
    const connected = st.cls === 'ok' || st.cls === 'alone';
    const sig = vp.querySelector('.vp-signal');
    if (sig) sig.className = 'vp-signal ' + st.cls;
    const lbl = vp.querySelector('.vp-status-label');
    if (lbl) {
      lbl.className = 'vp-status-label ' + st.cls;
      lbl.textContent = connected ? 'Voice Connected' : st.label;
    }
    const ph = vp.querySelector('.ping-holder');
    if (ph) {
      ph.innerHTML = '';
      ph.append(pingBars(rtt));
    }
  }
}

function renderVoiceBar() {
  renderUserPanelVoice();
  renderVoicePanel();
  renderMobileCallBanner();
  const bar = $('#voiceBar');
  if (state.voice.channelId == null) {
    bar.style.display = 'none'; bar.innerHTML = '';
    if (state.voice.stageOpen) closeCallStage();
    return;
  }
  renderCallStage();
  // The big call view only belongs on the channel you're actually in — when you
  // browse to another chat the call keeps running, shown via the sidebar panel.
  if (state.voice.channelId !== state.activeChatId) {
    bar.style.display = 'none'; bar.innerHTML = '';
    return;
  }
  // Mobile calls live in the fullscreen stage (auto-opened on join, see
  // toggleVoiceJoin). This inline bar's tiles+controls were only ever a
  // fallback for when the stage gets closed, and it's a broken one: the call
  // controls end up stranded mid-screen between the tiles and the message
  // list instead of anchored anywhere, overlapping the composer below them.
  // Minimizing out of the stage on mobile should reach the banner above, not
  // this.
  if (isMobileLayout() && !state.voice.stageOpen) {
    bar.style.display = 'none'; bar.innerHTML = '';
    return;
  }
  bar.style.display = 'flex'; bar.innerHTML = '';
  bar.classList.toggle('watching', !!(state.voice.watchSession || state.voice.wbSession || state.voice.gameSession || state.voice.ytmusicSession));
  const st = aggregateVoiceState();
  bar.append(el('div', { class: 'voice-head' }, [
    el('span', { class: 'vlabel' }, [icon('volume', 16), ' ', state.voice.channelName || t('voice.genericLabel')]),
    el('span', { class: 'voice-status ' + st.cls }, st.label),
    el('span', { class: 'ping-holder' }, pingBars(bestRtt())),
  ]));
  // Placeholder the fixed Watch Together overlay position-tracks. The player
  // iframe can't live here directly: this container is rebuilt on every room
  // update and reparenting an iframe reloads it (restarting the video).
  if (state.voice.watchSession) bar.append(el('div', { class: 'watch-slot' }));
  if (state.voice.wbSession) bar.append(el('div', { class: 'watch-slot wb-slot' }));
  if (state.voice.gameSession) bar.append(el('div', { class: 'watch-slot game-slot' }));
  if (state.voice.ytmusicSession) {
    const slot = el('div', { class: 'watch-slot ytm-slot' });
    bar.append(slot);
    renderYtMusicWidget(slot);
  }
  const tiles = el('div', { class: 'call-tiles' });
  for (const t of collectTiles(false)) tiles.append(t);
  bar.append(tiles);
  bar.append(callControls(false));
}

// Discord-style "Voice Connected" panel docked above the user panel in the sidebar.
function renderVoicePanel() {
  const vp = document.getElementById('voicePanel');
  if (!vp) return;
  if (state.voice.channelId == null) { vp.style.display = 'none'; vp.innerHTML = ''; return; }
  vp.style.display = 'flex'; vp.innerHTML = '';
  const st = aggregateVoiceState();
  const connected = st.cls === 'ok' || st.cls === 'alone';
  vp.append(el('div', { class: 'vp-top' }, [
    el('div', { class: 'vp-info' }, [
      el('div', { class: 'vp-status' }, [
        el('span', { class: 'vp-signal ' + st.cls }),
        el('span', { class: 'vp-status-label ' + st.cls }, connected ? t('voice.connectedHeading') : st.label),
      ]),
      el('div', { class: 'vp-chan' }, [icon('volume', 13), ' ', state.voice.channelName || t('voice.genericLabel')]),
    ]),
    el('span', { class: 'ping-holder' }, pingBars(bestRtt())),
  ]));
  const ctr = el('div', { class: 'vp-controls' });
  ctr.append(el('button', { class: 'ghost icon-btn' + (state.voice.localVideoStream ? ' on' : ''), title: state.voice.localVideoStream ? t('chrome.stopVideo') : t('chrome.turnOnCamera'), on: { click: toggleVideo } }, icon('video', 18)));
  // This panel lives in the sidebar, away from the call view the dock belongs to,
  // so it toggles the share directly instead of opening a panel somewhere else.
  ctr.append(el('button', { class: 'ghost icon-btn' + (state.voice.screenStream ? ' on' : ''), title: state.voice.screenStream ? t('chrome.stopSharing') : t('chrome.shareScreen'), on: { click: (e) => toggleScreenShare(e.currentTarget) } }, icon('monitor', 18)));
  ctr.append(el('button', { class: 'ghost icon-btn', title: t('chrome.openFullView'), on: { click: openCallStage } }, icon('maximize', 18)));
  ctr.append(el('button', { class: 'vp-leave', title: t('chrome.disconnect'), on: { click: voiceLeave } }, icon('phone-off', 18)));
  vp.append(ctr);
}

// Builds all the tiles for the current call (self cam/screen + each peer cam/screen).
// `forStage` adds click-to-focus and double-click-to-fullscreen behaviour.
function collectTiles(forStage) {
  const out = [];
  const selfMeta = {
    id: state.me.id, username: state.me.username, display_name: state.me.display_name,
    avatar_path: state.me.avatar_path, tag: state.me.tag,
  };
  out.push(decorateTile(callTile(selfMeta, state.voice.localVideoStream, true, state.voice.muted, state.voice.deafened), 'self:cam', forStage));
  if (state.voice.screenStream) {
    out.push(decorateTile(screenTile(selfMeta, state.voice.screenStream, true), 'self:screen', forStage));
  }
  const room = state.voiceRooms.get(state.voice.channelId) || [];
  for (const [, peer] of state.voice.peers) {
    const meta = room.find(p => p.id === peer.userId) || { username: peer.username, id: peer.userId };
    const t = callTile(meta, peer.videoOn ? peer.videoStream : null, false, !!meta.muted, !!meta.deafened);
    if (peer.speaking) t.classList.add('speaking');
    out.push(decorateTile(t, peer.userId + ':cam', forStage));
    if (peer.screenOn && peer.screenStream) {
      out.push(decorateTile(screenTile(meta, peer.screenStream, false), peer.userId + ':screen', forStage));
    }
  }
  // Pulsing "ringing" cards for members who've been rung but haven't joined yet
  // (DM/group calls only). They vanish when the person joins or declines.
  const ringers = (state.voiceRingers && state.voiceRingers.get(state.voice.channelId)) || [];
  const peerIds = new Set([...state.voice.peers.values()].map(p => p.userId));
  for (const ru of ringers) {
    if (ru.id === state.me.id || peerIds.has(ru.id)) continue;
    out.push(decorateTile(ringingTile(ru), 'ring:' + ru.id, forStage));
  }
  return out;
}

// A pulsing placeholder card for a member who is being rung but hasn't joined.
function ringingTile(meta) {
  const tile = el('div', { class: 'call-tile ringing', dataset: { uid: meta.id } });
  tile.append(el('div', { class: 'tile-avatar' }, [el('span', { class: 'ring-wave' }), avatarEl(meta, 'large')]));
  const name = el('span', {
    class: 'tile-uname' + (meta.username ? ' clickable' : ''),
    ...(meta.username ? { title: t('menu.viewProfile'), on: { click: (e) => { e.stopPropagation(); openProfile(meta.username); } } } : {}),
  }, userLabel(meta));
  tile.append(el('div', { class: 'tile-name' }, [name, el('span', { class: 'ring-label' }, [icon('phone', 12), ' Ringing…'])]));
  return tile;
}

function decorateTile(tile, key, forStage) {
  tile.dataset.tileKey = key;
  if (forStage) {
    if (state.voice.focusKey === key) tile.classList.add('focused');
    tile.addEventListener('click', () => {
      state.voice.focusKey = state.voice.focusKey === key ? null : key;
      renderCallStage();
    });
    tile.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      // Fullscreen the tile (not the bare <video>) so the name bar and the
      // speaking ring stay visible; double-click again (or Esc) exits.
      if (!tile.querySelector('video')) return;
      if (document.fullscreenElement === tile) document.exitFullscreen?.().catch(() => {});
      else if (tile.requestFullscreen) tile.requestFullscreen().catch(() => {});
    });
  }
  return tile;
}

// Desktop call control bar.
//
// Laid out as three groups of buttons rather than one undifferentiated row,
// because the buttons answer three different questions:
//   1. can I hear / be heard?      mic · deafen
//   2. what am I putting into the call?   camera · screen share · activities ·
//      voice fx · sounds · people
//   3. what about the call itself?        overflow (•••) · full view · leave
// The button ORDER is the one people already have in their fingers; only the
// gaps moved. Camera sits with screen share rather than with the mic because
// it is a thing you broadcast, not a thing you monitor — and because the two of
// them light up the same green when live, so splitting them across a group
// boundary made the boundary disappear exactly when it mattered.
// The gap between groups does the work a divider used to do, and the leave
// button gets an extra gap of its own so it is never a mis-click away from
// anything.
//
// There used to be one shared panel behind these (a tab strip: voice fx /
// sounds / screen / activities / people, docked in-flow or floated over the
// video) — it always cost the video real width or height to stay open even
// when you only wanted one thing out of it. Each of those five now has its
// own button and opens ONLY its own small popover (see toggleCallPopover),
// same as every other floating menu in the app — nothing reserves permanent
// space anymore. One-shot actions that never needed a whole popover (flip
// camera, spatial audio, ring people, voice settings) stay in the ••• menu
// (see openCallMoreMenu).
function callControls(inStage) {
  if (isMobileLayout()) return mobileCallControls();
  const v = state.voice;
  const ctrls = el('div', { class: 'call-controls' });
  const btn = (cls, title, click, ic, size) =>
    el('button', { class: cls, title, on: { click } }, icon(ic, size));
  const popoverOpen = (key) => !!document.querySelector('.call-popover[data-key="' + key + '"]:not(.anim-out)');
  const popoverBtn = (key, cls, title, click, ic) => el('button', {
    class: cls + (popoverOpen(key) ? ' accent' : ''), title, dataset: { popoverKey: key },
    on: { click },
  }, icon(ic));
  const group = (kids) => el('div', { class: 'cc-group' }, kids.filter(Boolean));

  // ── 1. can I hear / be heard ──────────────────────────────────────────────
  ctrls.append(group([
    btn((v.muted || v.noMic) ? 'danger' : 'ghost',
      v.noMic ? t('chrome.enableMicrophone') : (v.muted ? t('chrome.unmute') : t('chrome.mute')),
      toggleMute, (v.muted || v.noMic) ? 'mic-off' : 'mic'),
    btn(v.deafened ? 'danger' : 'ghost', v.deafened ? t('chrome.undeafen') : t('chrome.deafen'),
      toggleDeafen, v.deafened ? 'headphones-off' : 'headphones'),
  ]));

  // ── 2. what you put into the call ─────────────────────────────────────────
  // "live" (green) rather than "danger" (red) for a running camera/share/
  // activity: it is a state you chose, not a warning — red is reserved for the
  // two things that ARE warnings, muted and leaving.
  const activityLive = !!(v.watchSession || v.wbSession || v.gameSession || v.ytmusicSession);
  ctrls.append(group([
    btn(v.localVideoStream ? 'live' : 'ghost', v.localVideoStream ? t('chrome.stopVideo') : t('chrome.startVideo'),
      toggleVideo, 'video'),
    // Opens the small Screen popover to pick a source (or, if already sharing,
    // shows what's live and a Stop button) — it used to jump straight into
    // getDisplayMedia's own picker with your last-used source/audio/quality,
    // which was one click faster but left no way to change any of that
    // without a right-click nobody would discover.
    popoverBtn('screen', v.screenStream ? 'live' : 'ghost',
      v.screenStream ? t('chrome.stopSharing') : t('chrome.shareScreen'),
      (e) => { e.stopPropagation(); toggleCallPopover('screen', e.currentTarget); }, 'monitor'),
    popoverBtn('activity', activityLive ? 'live' : 'ghost', t('dock.tabActivities'),
      (e) => { e.stopPropagation(); toggleCallPopover('activity', e.currentTarget); }, 'sparkles'),
    popoverBtn('fx', 'ghost', t('dock.tabVoice'),
      (e) => { e.stopPropagation(); toggleCallPopover('fx', e.currentTarget); }, 'sliders'),
    popoverBtn('sound', 'ghost', t('dock.tabSoundsTitle'),
      (e) => { e.stopPropagation(); toggleCallPopover('sound', e.currentTarget); }, 'music'),
    popoverBtn('people', 'ghost', t('dock.tabPeopleTitle'),
      (e) => { e.stopPropagation(); toggleCallPopover('people', e.currentTarget); }, 'users'),
  ]));

  // ── 3. the call itself ────────────────────────────────────────────────────
  ctrls.append(group([
    btn('ghost', t('chrome.moreOptions'), (e) => { e.stopPropagation(); openCallMoreMenu(e.currentTarget); }, 'more-horizontal'),
    btn('ghost', inStage ? t('chrome.exitFullView') : t('chrome.fullView'),
      inStage ? closeCallStage : openCallStage, inStage ? 'minimize' : 'maximize'),
    btn('danger leave', t('chrome.leaveCall'), voiceLeave, 'phone-off', 20),
  ]));
  return ctrls;
}

// The overflow menu behind the call bar's "•••".
//
// A .floating-menu, not a dock tab: every row in it is a one-shot action — flip
// the camera, ring someone, open a settings modal — which is what a menu is for
// and what a persistent panel is wasted on. It also means phones get the app's
// existing bottom-sheet treatment for free (the ≤800px .floating-menu rules):
// it slides up from the bottom edge, dims the call behind it, and closes on a
// tap outside or on any row. That is the gesture people already expect here.
//
// On phones the menu doubles as the launcher for the tabs that DO need to stay a
// panel — a slider you drag or a soundboard you fire repeatedly cannot live in a
// sheet that an outside tap dismisses — so those rows open the dock and the
// sheet gets out of the way. Desktop has bar buttons for all of that, so desktop
// only sees the one-shot rows.
function openCallMoreMenu(anchor) {
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  const v = state.voice;
  const mobile = isMobileLayout();
  const menu = el('div', { class: 'floating-menu fm-icons call-more-menu' });
  const head = (label) => menu.append(el('div', { class: 'fm-head' }, label));
  const row = (ic, label, onClick, opts = {}) => menu.append(el('button', {
    type: 'button', class: (opts.on ? 'on' : '') + (opts.danger ? ' danger' : ''),
    on: { click: (e) => { e.stopPropagation(); closeFloatingMenus(); onClick(); } },
  }, [icon(ic, 16), el('span', { class: 'fm-label' }, label), opts.on ? el('span', { class: 'fm-on' }, t('more.on')) : null]));

  if (mobile) {
    head(t('more.inThisCall'));
    // No "On" flag on rows whose own label already changes with the state
    // ("Stop sharing", "Undeafen") — it would just say the same thing twice.
    row('monitor', v.screenStream ? t('chrome.stopSharing') : t('chrome.shareScreen'),
      toggleScreenShare, { danger: !!v.screenStream });
    row('sparkles', t('dock.tabActivities'), () => toggleCallPopover('activity', anchor),
      { on: !!(v.watchSession || v.wbSession || v.gameSession || v.ytmusicSession) });
    row('music', t('dock.tabSoundsTitle'), () => toggleCallPopover('sound', anchor));
    row('users', t('more.peopleVolume'), () => toggleCallPopover('people', anchor));
    menu.append(el('div', { class: 'fm-sep' }));
  }

  head(t('more.callOptions'));
  // Deafen has its own button in the roomy desktop bar; only phones need it here.
  if (mobile) row(v.deafened ? 'headphones-off' : 'headphones', v.deafened ? t('chrome.undeafen') : t('chrome.deafen'),
    toggleDeafen, { danger: v.deafened });
  // Desktop's Screen button now shares in one click, which leaves the audio /
  // 1080p-vs-720p knobs with no obvious door: this is it. (Phones have exactly
  // one knob and it lives next to the one thing they can share, so the phone
  // sheet doesn't carry a second screen row.)
  if (!mobile) row('monitor', t('more.shareOptions'), () => toggleCallPopover('screen', anchor));
  if (v.localVideoStream) row('switch-camera', t('dock.flipCamera'), switchCamera);
  row('orbit', t('dock.spatialAudio'), () => window.Spatial?.openPanel(),
    { on: !!(v.spatial && v.spatial.enabled) });
  if (isDmGroupCall()) row('phone', t('dock.addRingPeople'), () => openRingPeopleModal(v.channelId));
  row('settings', t('dock.voiceSettings'), () => openSettingsModal('voice'));

  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
}

// True when the active call is a DM or group (where ringing specific people makes
// sense — server voice channels don't ring).
function isDmGroupCall() {
  if (state.voice.channelId == null) return false;
  const c = state.chats.find(x => x.id === state.voice.channelId);
  return !!(c && (c.type === 'dm' || c.type === 'group'));
}

// In-call "add people" picker: lists members not already in the call and lets any
// participant ring them (server emits voice:ring to those users).
async function openRingPeopleModal(chatId) {
  if (chatId == null) return;
  let members = [];
  try { members = (await api('/api/chats/' + chatId + '/members')).members || []; } catch (e) { alert('Could not load members: ' + e.message); return; }
  const inCall = new Set([state.me.id, ...[...state.voice.peers.values()].map(p => p.userId)]);
  const ringing = new Set(((state.voiceRingers.get(chatId)) || []).map(r => r.id));
  const candidates = members.filter(m => !inCall.has(m.id) && m.id !== state.botUserId);
  const body = el('div', {});
  if (!candidates.length) {
    body.append(el('p', { class: 'muted-text' }, t('ring.everyoneAlready')));
  } else {
    body.append(el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, t('ring.intro')));
    const list = el('div', { class: 'manage-list' });
    for (const m of candidates) {
      const isRinging = ringing.has(m.id);
      const btn = el('button', { type: 'button', class: isRinging ? 'ghost' : '', disabled: isRinging,
        on: { click: () => {
          try { state.socket.emit('voice:ring-users', { chatId, userIds: [m.id] }); } catch {}
          btn.textContent = t('ring.ringing'); btn.disabled = true; btn.classList.add('ghost');
        } } }, isRinging ? t('ring.ringing') : [icon('phone', 14), ' ' + t('ring.ring')]);
      list.append(el('div', { class: 'manage-row member-manage-row' }, [
        avatarEl(m, 'small'),
        el('div', { style: 'flex:1;min-width:0' }, [el('strong', {}, m.display_name || m.username)]),
        btn,
      ]));
    }
    body.append(list);
  }
  modal({ title: t('ring.title'), content: body, submitLabel: t('common.done'), onSubmit: () => true });
}

// Touch-friendly call controls for phones: large round buttons with labels.
// Only ever rendered inside the full-screen stage (calls open full-screen on
// phones by default), so there's no separate inStage variant to switch on.
function mobileCallControls() {
  const v = state.voice;
  const ctrls = el('div', { class: 'call-controls mobile-call-controls' });
  const item = (iconName, label, onClick, opts = {}) => {
    const b = el('button', {
      class: 'mcc-btn' + (opts.active ? ' active' : '') + (opts.danger ? ' danger' : '') + (opts.leave ? ' leave' : ''),
      ...(opts.popoverKey ? {
        dataset: { popoverKey: opts.popoverKey, popoverActiveClass: 'active' },
      } : {}),
      title: label, on: { click: onClick },
    }, icon(iconName, 22));
    return el('div', { class: 'mcc-item' }, [b, el('span', { class: 'mcc-label' }, label)]);
  };
  // Primary row only — everything else lives behind "More" (a bottom-sheet
  // menu on phones), so the bar never crams more than 6 buttons.
  ctrls.append(item(
    (v.muted || v.noMic) ? 'mic-off' : 'mic',
    v.noMic ? t('chrome.unmute') : (v.muted ? t('chrome.unmute') : t('chrome.mute')),
    toggleMute, { danger: v.muted || v.noMic }));
  // Speaker / earpiece — native app only
  if (window.DisdrocNative) {
    ctrls.append(item(v.speakerOn ? 'volume' : 'volume-x', v.speakerOn ? t('chrome.speaker') : t('chrome.earpiece'),
      toggleSpeaker, { active: v.speakerOn }));
  }
  // Camera on/off
  ctrls.append(item('video', t('chrome.video'), toggleVideo, { active: !!v.localVideoStream }));
  // Voice changer sits in the primary row on phones rather than behind an
  // overflow: it is the feature people came for, and burying it behind a "More"
  // sheet was exactly the popup-in-front-of-the-call problem we're removing.
  if (window.VoiceFX && window.VoiceFX.isSupported()) {
    ctrls.append(item('sliders', t('dock.tabVoice'), (e) => { e.stopPropagation(); toggleCallPopover('fx', e.currentTarget); },
      { active: !!document.querySelector('.call-popover[data-key="fx"]:not(.anim-out)') || savedVoicePreset() !== 'none', popoverKey: 'fx' }));
  }
  // No expand/minimize button here — calls on phones open full-screen by
  // default (this row only ever renders inside that view), and the stage
  // header already has its own minimize button at the top right.
  //
  // "More" opens the slide-up sheet (openCallMoreMenu) rather than a row of
  // extra icons crammed into this bar. The sheet comes up from under your
  // thumb, lists everything in words, and closes itself the moment you pick
  // something — including when what you picked is one of the popovers, which
  // it then opens for you (as a bottom sheet too, same as this menu itself).
  const moreOn = !!(v.screenStream || v.watchSession || v.wbSession || v.gameSession || v.ytmusicSession);
  ctrls.append(item('more-horizontal', t('chrome.more'),
    (e) => { e.stopPropagation(); openCallMoreMenu(e.currentTarget); }, { active: moreOn }));
  // Leave
  ctrls.append(item('phone-off', t('chrome.leave'), voiceLeave, { leave: true }));
  return ctrls;
}

function openCallStage() {
  state.voice.stageOpen = true;
  // Allow the phone to rotate during the call so you can hold it sideways.
  try { window.DisdrocNative && window.DisdrocNative.setSensorRotation(true); } catch {}
  renderVoiceBar();
}
function closeCallStage() {
  state.voice.stageOpen = false; state.voice.focusKey = null;
  try { window.DisdrocNative && window.DisdrocNative.setSensorRotation(false); } catch {}
  document.body.classList.remove('stage-open');
  const s = document.getElementById('callStage'); if (s) s.remove();
  // Neither the inline bar (dock reattachment) nor the mobile banner used to
  // get rebuilt here — they'd just sit stale until some unrelated event (a
  // peer join, a mute toggle...) happened to trigger the next renderVoiceBar().
  renderVoiceBar();
}

// Slim top banner shown on mobile whenever a call is running but the fullscreen
// stage isn't up (minimized via the stage's own close button, or just browsing
// elsewhere) — mobile has no sidebar "Voice Connected" panel to serve that role.
// Tapping it re-opens the stage.
function renderMobileCallBanner() {
  let bnr = document.getElementById('mobileCallBanner');
  const show = isMobileLayout() && state.voice.channelId != null && !state.voice.stageOpen;
  if (!show) { if (bnr) bnr.remove(); return; }
  if (!bnr) {
    bnr = el('button', { type: 'button', id: 'mobileCallBanner', class: 'mobile-call-banner', on: { click: openCallStage } });
    document.body.append(bnr);
  }
  bnr.innerHTML = '';
  bnr.append(
    el('span', { class: 'mcb-dot' }),
    el('span', { class: 'mcb-text' }, t('chrome.onACall', { name: state.voice.channelName || t('voice.genericLabel') })),
    el('span', { class: 'mcb-tap' }, t('chrome.tapToReturn')),
  );
}

function renderCallStage() {
  let stage = document.getElementById('callStage');
  if (!state.voice.stageOpen || state.voice.channelId == null) {
    if (stage) stage.remove();
    document.body.classList.remove('stage-open');
    return;
  }
  if (!stage) { stage = el('div', { id: 'callStage', class: 'call-stage' }); document.body.append(stage); }
  document.body.classList.add('stage-open');
  stage.innerHTML = '';
  const st = aggregateVoiceState();
  const stageParts = state.voiceRooms.get(state.voice.channelId) || [];
  stage.append(el('div', { class: 'stage-head' }, [
    el('div', { class: 'stage-title' }, [
      el('span', { class: 'stage-channel' }, [
        icon('volume', 14),
        el('span', { class: 'stage-channel-name' }, state.voice.channelName || ''),
      ]),
      stageParts.length ? el('span', { class: 'stage-count', title: t('voice.nInCall', { n: stageParts.length }) }, [icon('users', 13), ' ' + stageParts.length]) : null,
      el('span', { class: 'voice-status ' + st.cls }, st.label),
    ]),
    el('button', {
      class: 'ghost icon-btn stage-minimize', title: t('chrome.minimize'), 'aria-label': t('chrome.minimize'),
      on: { click: closeCallStage },
    }, icon('minimize')),
  ]));
  // The stage covers the whole app (position:fixed; inset:0), so without this a
  // message arriving elsewhere is invisible until the call is minimized.
  updateStageUnreadBadge();
  const hasActivity = !!(state.voice.watchSession || state.voice.wbSession || state.voice.gameSession || state.voice.ytmusicSession);
  stage.classList.toggle('watching', hasActivity);
  const body = el('div', { class: 'stage-body' });
  const main = el('div', { class: 'stage-main' });
  // Activity slots: the fixed overlays (player/whiteboard/game) position-track these.
  if (state.voice.watchSession) main.append(el('div', { class: 'watch-slot' }));
  if (state.voice.wbSession) main.append(el('div', { class: 'watch-slot wb-slot' }));
  if (state.voice.gameSession) main.append(el('div', { class: 'watch-slot game-slot' }));
  if (state.voice.ytmusicSession) {
    const slot = el('div', { class: 'watch-slot ytm-slot' });
    main.append(slot);
    renderYtMusicWidget(slot);
  }
  const tileList = collectTiles(true);
  const grid = el('div', { class: 'stage-grid n' + Math.min(tileList.length, 9) + (state.voice.focusKey && !hasActivity ? ' has-focus' : '') });
  for (const t of tileList) grid.append(t);
  main.append(grid);
  body.append(main);
  stage.append(body);
  stage.append(callControls(true));
}

function callTile(meta, videoStream, isSelf, muted, deafened) {
  const tile = el('div', { class: 'call-tile' + (isSelf ? ' self' : ''), dataset: { uid: meta.id } });
  if (videoStream) {
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true;
    v.setAttribute('autoplay', '');
    v.setAttribute('playsinline', '');
    if (isSelf) { v.muted = true; v.setAttribute('muted', ''); }
    v.srcObject = videoStream;
    setTimeout(() => v.play().catch(() => {}), 0);
    tile.append(v);
    tile.classList.add('camera-on');
  } else {
    tile.append(el('div', { class: 'tile-avatar' }, avatarEl(meta, 'large')));
  }
  // Click a peer's name (or avatar) to open their profile. stopPropagation keeps
  // it from also toggling the stage focus when this tile lives in the call stage.
  const openable = !isSelf && meta.username;
  const nameSpan = el('span', {
    class: 'tile-uname' + (openable ? ' clickable' : ''),
    ...(openable ? { title: t('menu.viewProfile'), on: { click: (e) => { e.stopPropagation(); openProfile(meta.username); } } } : {}),
  }, userLabel(meta) + (isSelf ? ' (you)' : ''));
  if (openable) {
    const av = tile.querySelector('.tile-avatar');
    if (av) { av.classList.add('clickable'); av.title = t('menu.viewProfile'); av.addEventListener('click', (e) => { e.stopPropagation(); openProfile(meta.username); }); }
  }
  const localPref = !isSelf && meta.id ? userVoicePref(meta.id) : null;
  tile.append(el('div', { class: 'tile-name' }, [
    nameSpan,
    muted ? el('span', { class: 'tile-icon' }, icon('mic-off', 13)) : null,
    deafened ? el('span', { class: 'tile-icon' }, icon('headphones-off', 13)) : null,
    (localPref && localPref.muted) ? el('span', { class: 'tile-icon local-muted', title: t('menu.mutedForYou') }, icon('volume-x', 13)) : null,
    (localPref && !localPref.muted && localPref.vol !== 100) ? el('span', { class: 'tile-icon local-vol' + (localPref.vol > 100 ? ' hot' : ''), title: t('menu.userVolume') }, localPref.vol + '%') : null,
  ]));
  if (!isSelf && meta.id) {
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      openUserVoiceMenu({ clientX: e.clientX, clientY: e.clientY }, meta);
    });
  }
  return tile;
}

function screenTile(meta, stream, isSelf) {
  const tile = el('div', { class: 'call-tile screen-tile camera-on', dataset: { uid: meta.id } });
  const v = document.createElement('video');
  v.autoplay = true; v.playsInline = true;
  // Self-tile muted to avoid hearing your own screen audio; remote tiles let audio through.
  v.muted = isSelf;
  v.setAttribute('autoplay', ''); v.setAttribute('playsinline', '');
  if (isSelf) v.setAttribute('muted', '');
  if (!isSelf && meta && meta.id) {
    // Per-user volume applies to their screen audio too (capped at 100% here —
    // the element can't boost; the GainNode chain only carries voice).
    const pref = userVoicePref(meta.id);
    v.volume = Math.max(0, Math.min(1, pref.muted ? 0 : pref.vol / 100));
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      openUserVoiceMenu({ clientX: e.clientX, clientY: e.clientY }, meta);
    });
  }
  v.srcObject = stream;
  setTimeout(() => v.play().catch(() => {}), 0);
  tile.append(v);
  const hasAudio = stream.getAudioTracks().length > 0;
  tile.append(el('div', { class: 'tile-name' }, [
    icon('monitor', 13), ' ', isSelf ? t('voice.yourScreen') : t('voice.peerScreen', { name: userLabel(meta) }),
    hasAudio ? el('span', { class: 'screen-audio-badge', title: t('voice.sharingAudio') }, [icon('volume', 11)]) : null,
  ]));
  return tile;
}

async function voiceSettingsModal() {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); }
  catch (e) { alert('Cannot list devices: ' + e.message); return; }
  const mics = devices.filter(d => d.kind === 'audioinput');
  const cams = devices.filter(d => d.kind === 'videoinput');
  const outs = devices.filter(d => d.kind === 'audiooutput');
  function pick(name, list, current) {
    const sel = el('select', { name });
    sel.append(el('option', { value: '' }, t('dock.systemDefault')));
    for (const d of list) {
      const opt = el('option', { value: d.deviceId }, d.label || (name + ' ' + d.deviceId.slice(0, 6)));
      if (d.deviceId === current) opt.selected = true;
      sel.append(opt);
    }
    return sel;
  }
  const micSel = pick('mic', mics, state.voice.micDeviceId);
  const camSel = pick('cam', cams, state.voice.camDeviceId);
  const outSel = pick('out', outs, state.voice.outDeviceId);
  const note = el('p', { style: 'color:var(--muted);font-size:12px;margin:8px 0 0' },
    outs.length ? t('dock.speakerNoteChromium') : t('dock.speakerNoteNoOutputs'));
  modal({
    title: t('dock.voiceVideoTitle'),
    content: el('div', {}, [
      el('label', {}, t('dock.microphone')), micSel,
      el('label', {}, t('dock.camera')), camSel,
      el('label', {}, t('dock.speakers')), outSel,
      note,
    ]),
    submitLabel: t('common.save'),
    onSubmit: async () => {
      const mic = micSel.value || null;
      const cam = camSel.value || null;
      const out = outSel.value || null;
      const micChanged = mic !== state.voice.micDeviceId;
      const camChanged = cam !== state.voice.camDeviceId;
      const outChanged = out !== state.voice.outDeviceId;
      state.voice.micDeviceId = mic; state.voice.camDeviceId = cam; state.voice.outDeviceId = out;
      if (mic) localStorage.setItem('disdroc_mic', mic); else localStorage.removeItem('disdroc_mic');
      if (cam) localStorage.setItem('disdroc_cam', cam); else localStorage.removeItem('disdroc_cam');
      if (out) localStorage.setItem('disdroc_out', out); else localStorage.removeItem('disdroc_out');
      if (outChanged) {
        for (const [, p] of state.voice.peers) if (p.audio) applyOutputDevice(p.audio);
      }
      if (state.voice.channelId != null) {
        if (micChanged && state.voice.localStream) {
          const fxAttached = state.voice.micRawStream && state.voice.localStream !== state.voice.micRawStream;
          // Stop the *device* stream, never the effects output: a stopped
          // MediaStreamDestination track is dead for good and the call would go
          // permanently silent.
          const old = state.voice.micRawStream || state.voice.localStream;
          for (const t of old.getTracks()) t.stop();
          state.voice.micRawStream = null;
          if (!fxAttached) state.voice.localStream = null;
          stopSpeakingDetection();

          if (fxAttached) {
            // Re-open the device and hand it to the chain. The outgoing track is
            // the chain's, which never changed, so peers need no replaceTrack.
            const audio = {
              echoCancellation: localStorage.getItem('disdroc_echo') !== 'off',
              noiseSuppression: localStorage.getItem('disdroc_noise') !== 'off',
              autoGainControl: localStorage.getItem('disdroc_agc') !== 'off',
            };
            if (mic) audio.deviceId = { exact: mic };
            try {
              const raw = await navigator.mediaDevices.getUserMedia({ audio, video: false });
              state.voice.micRawStream = raw;
              window.VoiceFX.setSource(raw);
              applyMicState();
              startSpeakingDetection();
            } catch {
              state.voice.noMic = true; state.voice.muted = true;
            }
          } else {
            await ensureLocalMic();
            const newTrack = state.voice.localStream && state.voice.localStream.getAudioTracks()[0];
            if (newTrack) {
              for (const [, p] of state.voice.peers) {
                const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (sender) sender.replaceTrack(newTrack);
              }
            }
          }
        }
        if (camChanged && state.voice.localVideoStream) {
          for (const t of state.voice.localVideoStream.getTracks()) t.stop();
          state.voice.localVideoStream = null;
          await ensureLocalCamera();
          const newTrack = state.voice.localVideoStream.getVideoTracks()[0];
          for (const [, p] of state.voice.peers) {
            const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newTrack);
          }
          renderVoiceBar();
        }
      }
    },
  });
}

// ─── PWA install prompt ───────────────────────────────────────────────────────

let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  // Show the install button wherever it's rendered in settings.
  document.querySelectorAll('.pwa-install-btn').forEach(b => b.style.display = '');
});
window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  document.querySelectorAll('.pwa-install-btn').forEach(b => b.style.display = 'none');
});

async function triggerInstall() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  const { outcome } = await _installPrompt.userChoice;
  if (outcome === 'accepted') _installPrompt = null;
}

// ─── Push notifications ───────────────────────────────────────────────────────

async function setupPush() {
  if (!('serviceWorker' in navigator)) return;
  // Always register the SW — needed for PWA installability and offline caching,
  // not just for push. Do it early and unconditionally.
  let reg;
  try { reg = await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn('SW registration failed:', e.message); return; }

  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  if (!('PushManager' in window) || Notification.permission !== 'granted') return;
  try {
    const { publicKey } = await api('/api/push/key');
    if (!publicKey) return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
  } catch (e) { console.warn('push setup failed:', e.message); }
}

// Native desktop notification for incoming messages.
// Skipped for: own messages, #general, blocked senders, muted chats, when window focused AND chat is open.
function maybeNotify(m) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;
  if (!m || m.kind === 'call' || m.kind === 'system' || !state.me || m.user_id === state.me.id) return;
  if (alertSuppressed(m)) return;
  if (state.generalId && m.chat_id === state.generalId) return;
  if (state.blockedIds && state.blockedIds.has(m.user_id)) return;
  const chat = state.chats.find(c => c.id === m.chat_id);
  let level = notifLevel(chat);
  // Global "only notify me for @mentions" (Settings → Notifications) tightens
  // every chat's effective level to at most 'mentions' — it can only make
  // notifications quieter than a chat's own setting, never louder.
  if (level === 'all' && state.me && state.me.notif_mentions_only) level = 'mentions';
  if (level === 'nothing') return;
  if (level === 'mentions' && !mentionsMe(m)) return;
  if (chat && chat.server_id && !chat.notif_level && !mentionsMe(m)) return;
  let title;
  if (chat && chat.type === 'dm') {
    title = m.display_name || m.username || 'New message';
  } else if (chat && chat.type === 'group') {
    title = (m.display_name || m.username || '?') + ' · ' + (chat.name || 'Group');
  } else if (chat && (chat.type === 'channel' || chat.type === 'voice')) {
    title = (m.display_name || m.username || '?') + ' · #' + (chat.name || 'channel');
  } else {
    title = m.display_name || m.username || 'New message';
  }
  let body = (m.content || '').slice(0, 200);
  if (!body && Array.isArray(m.attachments) && m.attachments.length) body = t('chat.attachment');
  if (!body && m.forwarded_from) body = t('chat.forwarded');
  try {
    const n = new Notification(title, {
      body, icon: '/assets/icon-192.png', tag: 'msg-' + m.chat_id, renotify: true, silent: false,
    });
    n.onclick = () => {
      window.focus();
      try {
        const c = state.chats.find(x => x.id === m.chat_id);
        if (c) openChat(m.chat_id, c);
      } catch {}
      n.close();
    };
  } catch (e) { /* ignore */ }
}
function urlBase64ToUint8Array(s) {
  const padding = '='.repeat((4 - s.length % 4) % 4);
  const base64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ─── Modals ───────────────────────────────────────────────────────────────────

// Styled stand-in for window.confirm() — same on-brand modal chrome as
// everything else instead of a jarring native browser dialog, which reads as
// broken right at the moment (destructive/irreversible actions) a confident
// UI matters most. Usage: `if (!(await confirmModal('Delete this?'))) return;`
function confirmModal(message, opts = {}) {
  const { title = t('confirm.title'), confirmLabel = t('confirm.yes'), danger = true } = opts;
  return new Promise((resolve) => {
    const root = $('#modalRoot');
    let settled = false;
    const close = (result) => { if (settled) return; settled = true; closeModalRoot(); resolve(result); };
    const overlay = el('div', {
      class: 'modal-bg',
      on: {
        click: (e) => { if (e.target === e.currentTarget) close(false); },
        keydown: (e) => { if (e.key === 'Escape') close(false); },
      },
    }, el('div', { class: 'modal confirm-modal' }, [
      el('h3', {}, title),
      el('p', { class: 'confirm-modal-body' }, message),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => close(false) } }, t('confirm.cancel')),
        el('button', { type: 'button', class: danger ? 'danger' : '', on: { click: () => close(true) } }, confirmLabel),
      ]),
    ]));
    root.innerHTML = '';
    root.append(overlay);
  });
}

// ─── Overlay exit animations ──────────────────────────────────────────────────
// Fade an overlay/modal/menu out (CSS .anim-out), then remove it. Instant when
// reduced motion is on. closeModalRoot only removes the nodes present at call
// time, so a new modal opened synchronously right after close() never gets
// clobbered by the delayed removal.
function animateOut(node, ms = 150) {
  if (!node) return;
  if (node.classList?.contains('floating-menu')) stopFloatingMenuTracking(node);
  if (document.body.classList.contains('reduce-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) { node.remove(); return; }
  if (node.classList.contains('anim-out')) return;
  node.classList.add('anim-out');
  setTimeout(() => node.remove(), ms);
}
function closeModalRoot() {
  for (const n of [...$('#modalRoot').children]) animateOut(n, 150);
}

function modal({ title, content, onSubmit, submitLabel = 'OK', wide = false }) {
  const root = $('#modalRoot');
  const close = () => closeModalRoot();
  const form = el('form', {
    class: 'modal', style: wide ? { maxWidth: '600px' } : null,
    on: { submit: async (e) => { e.preventDefault(); const ok = await onSubmit(form); if (ok !== false) close(); } },
  }, [
    el('h3', {}, title), content,
    el('div', { class: 'row' }, [
      el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Cancel'),
      el('button', { type: 'submit' }, submitLabel),
    ]),
  ]);
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, form));
  setTimeout(() => form.querySelector('input,textarea')?.focus(), 0);
  return close;
}

// Scan a QR login code shown on another device's login page. Self-contained
// overlay (not the shared modal() helper) since it's appended straight to
// <body> — modal() clears #modalRoot on close, which would also nuke the
// Settings modal this is opened from if it shared that container.
let jsQrLoadPromise = null;
function ensureJsQr() {
  if (typeof window.jsQR === 'function') return Promise.resolve(window.jsQR);
  if (jsQrLoadPromise) return jsQrLoadPromise;
  jsQrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/js/vendor/jsQR.js';
    script.async = true;
    script.onload = () => typeof window.jsQR === 'function'
      ? resolve(window.jsQR)
      : reject(new Error('QR scanner did not initialize'));
    script.onerror = () => reject(new Error('QR scanner could not be loaded'));
    document.head.append(script);
  }).catch((err) => {
    jsQrLoadPromise = null;
    throw err;
  });
  return jsQrLoadPromise;
}

function scanQrLoginModal() {
  const video = el('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;border-radius:8px;background:#000' });
  const canvas = document.createElement('canvas');
  const statusEl = el('div', { class: 'muted-text', style: 'margin-top:10px;text-align:center' }, 'Point your camera at the QR code.');
  const errBox = el('div', { class: 'error', style: 'text-align:center' });
  let stream = null, raf = null, stopped = false, lastTried = null;

  function close() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    animateOut(overlay);
  }

  function tick() {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const cctx = canvas.getContext('2d');
      cctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = cctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      if (code && code.data && code.data !== lastTried) {
        lastTried = code.data;
        errBox.textContent = '';
        statusEl.textContent = 'Logging in that device…';
        api('/api/auth/qr/approve', { method: 'POST', body: JSON.stringify({ token: code.data }) }).then(() => {
          statusEl.textContent = 'Done — check the other device.';
          if (stream) stream.getTracks().forEach((tr) => tr.stop());
          stopped = true;
          setTimeout(close, 1200);
        }).catch((e) => {
          statusEl.textContent = 'Point your camera at the QR code.';
          errBox.textContent = e.message === 'invalid_or_expired' ? 'That code expired — refresh it and try again.'
            : e.message === 'already_used' ? 'That code was already used.' : 'Login failed: ' + e.message;
        });
      }
    }
    raf = requestAnimationFrame(tick);
  }

  const overlay = el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, [
    el('div', { class: 'modal', style: 'max-width:380px;text-align:center' }, [
      el('h3', {}, 'Scan QR code'),
      video, statusEl, errBox,
      el('div', { class: 'row' }, [el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Close')]),
    ]),
  ]);
  overlay._disdrocClose = close;
  document.body.append(overlay);

  ensureJsQr()
    .then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }))
    .then((s) => {
      if (stopped) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stream = s;
      video.srcObject = s;
      raf = requestAnimationFrame(tick);
    })
    .catch((e) => { errBox.textContent = 'QR scanner failed: ' + e.message; });
}

// Timeout (temporary server mute) picker: choose a duration, or lift an active one.
function timeoutMemberModal(serverId, member, onDone) {
  const active = member.timeout_until && member.timeout_until > Date.now();
  const DURATIONS = [['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes'], ['3600', '1 hour'], ['86400', '1 day'], ['604800', '1 week']];
  let chosen = '600';
  const sel = el('select', { class: 'input' }, DURATIONS.map(([v, l]) => el('option', { value: v }, l)));
  sel.value = chosen; sel.addEventListener('change', () => { chosen = sel.value; });
  const errBox = el('div', { class: 'error' });
  const apply = async (minutes) => {
    try {
      await api(`/api/servers/${serverId}/members/${member.id}/timeout`, { method: 'POST', body: JSON.stringify({ minutes }) });
    } catch (e) { errBox.textContent = modErr(e.message); throw e; }
  };
  let closeFn = null;
  closeFn = modal({
    title: 'Timeout ' + (member.display_name || member.username),
    content: el('div', {}, [
      active ? el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, 'Timed out until ' + new Date(member.timeout_until).toLocaleString() + '. A timed-out member can\'t send messages or talk in voice in this server.')
             : el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, 'They won\'t be able to send messages or talk in voice in this server until it expires.'),
      el('label', {}, 'Duration'), sel,
      active ? el('button', { type: 'button', class: 'ghost', style: 'margin-top:10px', on: { click: async () => { try { await apply(0); closeFn && closeFn(); onDone && onDone(); } catch {} } } }, 'Remove timeout now') : null,
      errBox,
    ]),
    submitLabel: 'Apply timeout',
    onSubmit: async () => {
      try { await apply(Math.round(parseInt(chosen, 10) / 60)); onDone && onDone(); return true; } catch { return false; }
    },
  });
}

// Ban picker: duration (permanent or timed) + reason. Shared by the members-tab
// Ban button and the message-menu quick-moderation Ban action.
function banMemberModal(serverId, member, onDone) {
  const DURATIONS = [['0', 'Permanent'], ['3600', '1 hour'], ['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days'], ['31536000', '365 days']];
  let chosen = '0';
  const sel = el('select', { class: 'input' }, DURATIONS.map(([v, l]) => el('option', { value: v }, l)));
  sel.value = chosen; sel.addEventListener('change', () => { chosen = sel.value; });
  const reasonInput = el('textarea', { rows: 2, maxlength: 300, placeholder: 'Reason (shown to the user)' });
  const errBox = el('div', { class: 'error' });
  let closeFn = null;
  closeFn = modal({
    title: 'Ban ' + (member.display_name || member.username),
    content: el('div', {}, [
      el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, 'They\'ll be removed from the server and blocked from rejoining until unbanned.'),
      el('label', {}, 'Duration'), sel,
      el('label', { style: 'margin-top:8px' }, 'Reason'), reasonInput,
      errBox,
    ]),
    submitLabel: 'Ban',
    onSubmit: async () => {
      try {
        const minutes = Math.round(parseInt(chosen, 10) / 60);
        await api(`/api/servers/${serverId}/members/${member.id}/ban`, { method: 'POST', body: JSON.stringify({ reason: reasonInput.value, minutes }) });
        onDone && onDone();
        return true;
      } catch (e) { errBox.textContent = modErr(e.message); return false; }
    },
  });
}

function serverNicknameModal(serverId) {
  const meMem = (state.serverDetail && state.serverDetail.members.find(m => m.id === state.me.id)) || {};
  const input = el('input', { name: 'nickname', maxlength: 32, value: meMem.nickname || '', placeholder: state.me.display_name || state.me.username });

  // Per-server avatar override — same upload/preview/clear pattern as the global
  // avatar editor in account settings (POST/DELETE /me/avatar), just scoped to
  // this one server (POST/DELETE /servers/:id/avatar). File picked here isn't
  // uploaded until Save, same as the account settings flow; Remove clears the
  // override on the server immediately, same as the account settings flow too.
  const avatarFileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
  const avatarPreview = avatarEl(state.me, 'large', { serverOverride: meMem.server_avatar_path });
  const pickAvatarBtn = el('button', { type: 'button', class: 'ghost', on: { click: () => avatarFileInput.click() } }, 'Change avatar');
  const removeAvatarBtn = el('button', {
    type: 'button', class: 'danger', style: meMem.server_avatar_path ? '' : 'display:none',
    on: { click: async () => {
      if (!(await confirmModal('Remove your avatar for this server? You\'ll show your normal avatar again.'))) return;
      try {
        await api('/api/servers/' + serverId + '/avatar', { method: 'DELETE' });
        meMem.server_avatar_path = null;
        avatarPreview.innerHTML = '';
        avatarPreview.append(avatarEl(state.me, 'large').firstChild);
        removeAvatarBtn.style.display = 'none';
        await loadServer(serverId);
        renderRightPanel();
        const ch = state.serverDetail.channels.find(c => c.id === state.activeChatId);
        if (ch) openChat(ch.id, ch);
      } catch (e) { alert(e.message); }
    },
  } }, 'Remove');
  avatarFileInput.addEventListener('change', () => {
    const f = avatarFileInput.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { avatarPreview.innerHTML = ''; avatarPreview.append(el('img', { src: reader.result })); };
    reader.readAsDataURL(f);
  });

  modal({
    title: 'Server nickname',
    content: el('div', {}, [
      el('label', {}, 'Avatar for this server'),
      el('div', { class: 'avatar-edit-row' }, [ avatarPreview, el('div', { class: 'avatar-edit-actions' }, [pickAvatarBtn, removeAvatarBtn]), avatarFileInput ]),
      el('label', { style: 'margin-top:14px' }, 'Nickname for this server'), input,
      el('p', { class: 'muted-text', style: 'margin-top:6px' }, 'Shown only in this server. Leave blank to use your normal name or avatar.'),
    ]),
    submitLabel: 'Save',
    onSubmit: async () => {
      try {
        await api('/api/servers/' + serverId + '/nick', { method: 'PATCH', body: JSON.stringify({ nickname: input.value.trim() }) });
        if (avatarFileInput.files[0]) {
          const fd = new FormData(); fd.append('avatar', avatarFileInput.files[0]);
          const r = await fetch('/api/servers/' + serverId + '/avatar', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'nsfw_rejected' ? 'That image looks explicit and was blocked by the content filter.' : (j.error || 'avatar_upload_failed')); }
        }
        await loadServer(serverId);
        renderRightPanel();
        const ch = state.serverDetail.channels.find(c => c.id === state.activeChatId);
        if (ch) openChat(ch.id, ch); // refresh visible message author names/avatars
      } catch (e) { alert(e.message); return false; }
    },
  });
}

function addFriendModal() {
  const errBox = el('div', { class: 'error' });
  modal({
    title: 'Add a friend',
    content: el('div', {}, [el('label', {}, 'Username'), el('input', { name: 'username', required: true }), errBox]),
    submitLabel: 'Send request',
    onSubmit: async (form) => {
      const u = new FormData(form).get('username').toString().trim();
      try { await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ username: u }) }); }
      catch (e) { errBox.textContent = e.message; return false; }
      loadFriends().then(renderSidebar);
    },
  });
}

function newGroupModal() {
  const errBox = el('div', { class: 'error' });
  const chips = el('div', { class: 'chip-list' });
  const selected = new Set();
  function refreshChips() {
    chips.innerHTML = '';
    for (const u of selected) chips.append(el('span', { class: 'chip' }, [u, el('button', { type: 'button', on: { click: () => { selected.delete(u); refreshChips(); } } }, '×')]));
  }
  const friendsList = el('div', { class: 'chip-list' });
  for (const f of state.friends.filter(x => x.status === 'accepted')) {
    friendsList.append(el('button', { type: 'button', class: 'chip', on: { click: () => { selected.add(f.username); refreshChips(); } } }, '+ ' + f.username));
  }
  modal({
    title: 'New group chat',
    content: el('div', {}, [
      el('label', {}, 'Group name'), el('input', { name: 'name', required: true, maxlength: 60 }),
      el('label', {}, 'Add friends'), friendsList,
      el('label', {}, 'Members'), chips, errBox,
    ]),
    submitLabel: 'Create',
    onSubmit: async (form) => {
      const name = new FormData(form).get('name').toString().trim();
      if (!name || selected.size === 0) { errBox.textContent = 'Pick a name and at least one friend.'; return false; }
      try {
        const r = await api('/api/chats/group', { method: 'POST', body: JSON.stringify({ name, usernames: [...selected] }) });
        await loadChats(); renderSidebar(); openChat(r.chatId, state.chats.find(c => c.id === r.chatId));
      } catch (e) { errBox.textContent = e.message; return false; }
    },
  });
}

function newServerModal() {
  const root = $('#modalRoot');
  const close = () => { closeModalRoot(); };
  const card = el('div', { class: 'modal create-server' });
  root.innerHTML = '';
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card));

  let view = 'choose';
  const header = (title, sub) => el('div', { class: 'cs-head' }, [
    el('button', { class: 'pp-close', type: 'button', title: t('chrome.close'), on: { click: close } }, icon('x', 18)),
    el('h3', { class: 'cs-title' }, title),
    sub ? el('p', { class: 'cs-sub' }, sub) : null,
  ]);

  function renderChoose() {
    card.append(
      header('Create your server', 'Your server is where you and your friends hang out. Make yours and start talking.'),
      el('div', { class: 'cs-options' }, [
        el('button', { type: 'button', class: 'cs-option', on: { click: () => { view = 'create'; render(); } } }, [
          el('span', { class: 'cs-option-ic' }, icon('plus', 22)),
          el('span', { class: 'cs-option-label' }, 'Create My Own'),
          el('span', { class: 'cs-chev' }, '›'),
        ]),
        el('button', { type: 'button', class: 'cs-option', on: { click: () => { view = 'join'; render(); } } }, [
          el('span', { class: 'cs-option-ic' }, icon('message', 22)),
          el('span', { class: 'cs-option-label' }, 'Join a Server'),
          el('span', { class: 'cs-chev' }, '›'),
        ]),
      ]),
      el('div', { class: 'cs-foot-note' }, 'Have an invite already? Pick “Join a Server”.'),
    );
  }

  function renderCreate() {
    const errBox = el('div', { class: 'error' });
    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
    const iconPick = el('button', { type: 'button', class: 'cs-icon-pick', title: 'Upload icon', on: { click: () => fileInput.click() } },
      el('span', { class: 'cs-icon-ph' }, [icon('plus', 18), el('span', {}, 'UPLOAD')]));
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { iconPick.innerHTML = ''; iconPick.append(el('img', { src: reader.result, class: 'cs-icon-img' })); };
      reader.readAsDataURL(f);
    });
    const nameInput = el('input', { value: (state.me.display_name || state.me.username) + "'s server", maxlength: 60 });
    const createBtn = el('button', { class: 'cs-create-btn', on: { click: async () => {
      const name = nameInput.value.trim();
      if (!name) { errBox.textContent = 'Give your server a name.'; return; }
      createBtn.disabled = true;
      try {
        const r = await api('/api/servers', { method: 'POST', body: JSON.stringify({ name }) });
        if (fileInput.files[0]) {
          try {
            const fd = new FormData(); fd.append('icon', fileInput.files[0]);
            await fetch('/api/servers/' + r.serverId + '/icon', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
          } catch {}
        }
        await loadServers(); renderServerRail(); switchToServer(r.serverId); close();
      } catch (e) { errBox.textContent = friendlyServerError(e.message); createBtn.disabled = false; }
    } } }, 'Create Server');
    card.append(
      header('Customize your server', 'Give your new server a personality with a name and an icon. You can always change it later.'),
      el('div', { class: 'cs-body' }, [
        el('div', { class: 'cs-icon-row' }, [iconPick, fileInput]),
        el('label', { class: 'cs-field-label' }, 'SERVER NAME'),
        nameInput,
        errBox,
      ]),
      el('div', { class: 'cs-footer' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => { view = 'choose'; render(); } } }, 'Back'),
        createBtn,
      ]),
    );
  }

  function renderJoin() {
    const errBox = el('div', { class: 'error' });
    const codeInput = el('input', { placeholder: 'https://disdroc.com/invite/abc123', maxlength: 200 });
    const joinBtn = el('button', { class: 'cs-create-btn', on: { click: async () => {
      let code = codeInput.value.trim();
      if (!code) { errBox.textContent = 'Enter an invite link or code.'; return; }
      code = code.replace(/\/+$/, '').split('/').pop().split('?')[0];
      joinBtn.disabled = true;
      try {
        const r = await api('/api/invites/' + encodeURIComponent(code) + '/accept', { method: 'POST' });
        await loadServers(); renderServerRail(); switchToServer(r.serverId); close();
      } catch (e) {
        errBox.textContent = e.message === 'not_found' ? 'Invalid invite.' : e.message === 'expired' ? 'This invite has expired.' : e.message;
        joinBtn.disabled = false;
      }
    } } }, 'Join Server');
    card.append(
      header('Join a Server', 'Enter an invite link below to join an existing server.'),
      el('div', { class: 'cs-body' }, [
        el('label', { class: 'cs-field-label' }, 'INVITE LINK'),
        codeInput, errBox,
      ]),
      el('div', { class: 'cs-footer' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: () => { view = 'choose'; render(); } } }, 'Back'),
        joinBtn,
      ]),
    );
  }

  function render() {
    card.innerHTML = '';
    if (view === 'create') renderCreate();
    else if (view === 'join') renderJoin();
    else renderChoose();
  }
  render();
}

// Browse servers whose owners have chosen to list them publicly (Server settings
// → Overview → "List this server publicly"). Full-screen page (like the settings
// modal), not a small popup — a card grid deserves the room. One card per server:
// banner, icon, name, description, member count, and a Join button.
function discoverServersModal() {
  const root = $('#modalRoot');
  const close = () => {
    const e = document.getElementById('discoverModalRoot');
    if (!e || e.classList.contains('closing')) return;
    e.classList.add('closing');
    setTimeout(() => e.remove(), 200);
  };
  const search = el('input', { class: 'discover-search', placeholder: t('discover.search'), autocomplete: 'off', spellcheck: 'false' });
  const grid = el('div', { class: 'discover-grid' });
  const empty = el('p', { class: 'muted-text' }, t('discover.empty'));
  let servers = [];

  const cardFor = (s) => {
    const joinBtn = s.is_member
      ? el('button', { type: 'button', class: 'ghost', on: { click: () => { close(); switchToServer(s.id); } } }, t('discover.open'))
      : el('button', { type: 'button', on: { click: async (ev) => {
          ev.currentTarget.disabled = true;
          try {
            await api('/api/servers/' + s.id + '/join', { method: 'POST' });
            await loadServers(); renderServerRail(); loadMyEmojis().catch(() => {});
            close(); switchToServer(s.id);
          } catch (e) { alert(e.message); ev.currentTarget.disabled = false; }
        } } }, t('discover.join'));
    return el('div', { class: 'discover-card' }, [
      el('div', { class: 'discover-card-banner' },
        s.banner_path ? el('img', { src: '/api/server-banner/' + s.banner_path, alt: '', loading: 'lazy' }) : null),
      el('div', { class: 'discover-card-body' }, [
        el('div', { class: 'discover-card-head' }, [
          s.icon_path
            ? el('img', { class: 'discover-card-icon', src: '/api/server-icon/' + s.icon_path, alt: '' })
            : el('span', { class: 'discover-card-icon discover-card-icon-ph' }, initials(s.name)),
          el('div', { class: 'discover-card-title-wrap' }, [
            el('div', { class: 'discover-card-title' }, s.name),
            el('div', { class: 'discover-card-members' }, t(s.member_count === 1 ? 'discover.member' : 'discover.members', { n: s.member_count })),
          ]),
        ]),
        s.description ? el('p', { class: 'discover-card-desc' }, s.description) : null,
        joinBtn,
      ]),
    ]);
  };

  const paint = (q) => {
    q = (q || '').trim().toLowerCase();
    grid.innerHTML = '';
    const shown = servers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    for (const s of shown) grid.append(cardFor(s));
    grid.style.display = shown.length ? '' : 'none';
    empty.textContent = servers.length && !shown.length ? t('discover.noMatch') : t('discover.empty');
    empty.style.display = shown.length ? 'none' : '';
  };
  search.addEventListener('input', () => paint(search.value));

  root.append(el('div', { class: 'modal-bg discover-fullscreen', id: 'discoverModalRoot', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } },
    el('div', { class: 'discover-shell' }, [
      el('div', { class: 'discover-shell-head' }, [
        el('div', { class: 'discover-shell-title' }, [
          el('h2', {}, t('discover.title')),
          el('p', { class: 'muted-text', style: 'margin:4px 0 0' }, t('discover.subtitle')),
        ]),
        search,
        el('button', { type: 'button', class: 'settings-close', title: t('chrome.close'), on: { click: close } }, '✕'),
      ]),
      el('div', { class: 'discover-shell-body' }, [grid, empty]),
    ])
  ));

  (async () => {
    try { servers = (await api('/api/discover/servers')).servers || []; } catch {}
    paint(search.value);
  })();
}

function newChannelModal(serverId, defaultType) {
  const errBox = el('div', { class: 'error' });
  modal({
    title: 'New channel',
    content: el('div', {}, [
      el('label', {}, 'Channel name'),
      el('input', { name: 'name', required: true, maxlength: 30 }),
      el('label', {}, 'Type'),
      (() => {
        const sel = el('select', { name: 'type' });
        sel.append(el('option', { value: 'channel' }, 'Text'));
        sel.append(el('option', { value: 'voice' }, 'Voice'));
        sel.append(el('option', { value: 'forum' }, 'Forum'));
        if (defaultType && ['channel', 'voice', 'forum'].includes(defaultType)) sel.value = defaultType;
        return sel;
      })(),
      errBox,
    ]),
    submitLabel: 'Create',
    onSubmit: async (form) => {
      const f = new FormData(form);
      try {
        await api('/api/servers/' + serverId + '/channels', { method: 'POST', body: JSON.stringify({ name: f.get('name'), type: f.get('type') }) });
        await loadServer(serverId); renderSidebar();
      } catch (e) { errBox.textContent = e.message; return false; }
    },
  });
}

async function inviteModal(serverId) {
  let result = null;
  modal({
    title: 'Invite link',
    content: (() => {
      const wrap = el('div', {});
      const hoursInput = el('input', { name: 'hours', type: 'number', min: 1, max: 720, value: 24 });
      const neverCb = el('input', { name: 'never', type: 'checkbox' });
      neverCb.addEventListener('change', () => { hoursInput.disabled = neverCb.checked; });
      wrap.append(el('label', {}, 'Expires in (hours)'), hoursInput);
      wrap.append(el('label', { style: 'display:flex;align-items:center;gap:6px;margin-top:8px' }, [neverCb, 'Never expires']));
      const out = el('div', { style: { marginTop: '12px', minHeight: '24px', fontFamily: 'monospace', wordBreak: 'break-all' } });
      wrap.append(out);
      wrap._out = out;
      return wrap;
    })(),
    submitLabel: 'Generate',
    onSubmit: async (form) => {
      const fd = new FormData(form);
      const hours = fd.get('never') ? null : +fd.get('hours');
      try {
        const r = await api('/api/servers/' + serverId + '/invites', { method: 'POST', body: JSON.stringify({ hours }) });
        const url = `${location.origin}/invite/${r.code}`;
        form.querySelector('div[style*="monospace"]').textContent = url;
        navigator.clipboard?.writeText(url);
        return false;
      } catch (e) { alert(e.message); return false; }
    },
  });
}

function panelModal({ title, render, wide = true }) {
  const root = $('#modalRoot');
  const close = () => closeModalRoot();
  const body = el('div', {});
  const card = el('div', {
    class: 'modal panel-modal', style: wide ? { maxWidth: '900px', minWidth: '320px' } : null,
  }, [
    el('div', { class: 'panel-head' }, [
      el('h3', { style: 'margin:0' }, title),
      el('button', { class: 'ghost', type: 'button', on: { click: close } }, 'Close'),
    ]),
    body,
  ]);
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card));
  const refresh = async () => { body.innerHTML = ''; await render(body, refresh, close); };
  refresh();
  return { close, refresh };
}

async function serverSettingsModal(serverId, initialTab) {
  let detail = await api('/api/servers/' + serverId);
  let tab = initialTab || 'overview';
  let editingRoleId = null;       // Roles tab: which role's editor is open
  let editingMemberRolesId = null; // Members tab: which member's role picker is open
  let memberSearchQuery = ''; // Members tab: current name filter (survives re-renders)
  let editingChannelPermsId = null; // Channels tab: which channel's override editor is open
  let pendingMemberOverridePick = null; // Channel perms: member picked in "Add member override" but not yet set
  const ROLE_COLORS = ['#f23f43', '#f0b232', '#23a55a', '#00a8fc', '#5865f2', '#7c5cff', '#eb459e', '#11806a', '#e67e22', '#95a5a6'];

  const close = () => {
    const e = document.getElementById('serverSettingsRoot');
    if (!e || e.classList.contains('closing')) return;
    e.classList.add('closing');
    setTimeout(() => e.remove(), 200);
  };

  const TAB_LABELS = {
    overview: 'Overview', safety: 'Safety', channels: 'Channels', members: 'Members',
    emojis: 'Emojis', soundboard: 'Soundboard', roles: 'Roles', bans: 'Bans',
    modlog: 'Mod Log', invites: 'Invites', danger: 'Danger Zone',
  };

  // .settings-panel's layout CSS (label/h4/button spacing) targets direct
  // children, so — same as user settings — the whole panel (back button,
  // title, and tab body) is rebuilt as one flat node on every tab switch
  // rather than refreshed inside a nested wrapper div.
  const contentInner = el('div', { class: 'settings-content-inner' });

  const reload = async () => { detail = await api('/api/servers/' + serverId); await refresh(); };
  const refresh = async () => {
    const panel = el('div', { class: 'settings-panel' }, [
      el('button', {
        type: 'button', class: 'settings-back',
        on: { click: () => document.querySelector('#serverSettingsRoot .settings-shell')?.classList.replace('s-panel', 's-list') },
      }, [icon('chevron-left', 18), 'Server settings']),
      el('h2', { class: 'settings-title' }, TAB_LABELS[tab] || ''),
    ]);
    await renderTab(panel);
    contentInner.innerHTML = '';
    contentInner.append(panel);
  };

  async function renderTab(body) {
      const { server, channels, members, role } = detail;
      const isOwner = role === 'owner';
      const myPerms = detail.myPerms || 0;
      const hasPerm = (b) => !!((myPerms & SP.ADMINISTRATOR) || (myPerms & b));
      const roleList = detail.roles || [];
      const meMember = members.find(x => x.id === state.me.id);
      const myTopPos = (role === 'owner' || role === 'admin')
        ? Infinity
        : Math.max(0, ...(((meMember && meMember.role_ids) || []).map(id => { const r = roleList.find(rr => rr.id === id); return r ? r.position : 0; })));
      const roleById = (id) => roleList.find(r => r.id === id);

      if (tab === 'emojis') {
        let einfo = { emojis: [] };
        try { einfo = await api('/api/servers/' + serverId + '/emojis'); } catch {}
        body.append(el('p', { class: 'muted-text', style: 'margin:0 0 12px' },
          'Custom emoji members of this server can use anywhere in the app — chats, DMs, and reactions. ' +
          'PNG, JPG, GIF (animated GIFs keep moving), or WebP · max 256 KB each.'));
        const list = el('div', { class: 'manage-list emoji-manage-list' });
        for (const em of einfo.emojis) {
          list.append(el('div', { class: 'manage-row' }, [
            el('img', { class: 'emoji-manage-preview', src: '/api/emoji/' + em.stored_path, alt: em.name }),
            el('strong', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, ':' + em.name + ':'),
            el('button', { type: 'button', class: 'ghost danger', on: { click: async () => {
              if (!(await confirmModal('Delete the emoji :' + em.name + ':?'))) return;
              try { await api('/api/servers/' + serverId + '/emojis/' + em.id, { method: 'DELETE' }); loadMyEmojis().catch(() => {}); }
              catch (e) { alert('Could not delete: ' + e.message); }
              await refresh();
            } } }, 'Delete'),
          ]));
        }
        if (!einfo.emojis.length) list.append(el('p', { class: 'muted-text' }, 'No custom emoji yet — add the first one below.'));
        body.append(list);
        const errBox = el('div', { class: 'error' });
        const nameIn = el('input', { placeholder: 'Emoji name (letters, numbers, underscore)', maxlength: 32, style: 'flex:1' });
        const fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
        const addBtn = el('button', { type: 'button', on: { click: async () => {
          errBox.textContent = '';
          const f = fileIn.files && fileIn.files[0];
          if (!f) { errBox.textContent = 'Pick an image first.'; return; }
          if (!nameIn.value.trim()) { errBox.textContent = 'Give it a name.'; return; }
          const fd = new FormData();
          fd.append('name', nameIn.value.trim());
          fd.append('emoji', f);
          addBtn.disabled = true;
          try {
            await api('/api/servers/' + serverId + '/emojis', { method: 'POST', body: fd });
            loadMyEmojis().catch(() => {});
            await refresh();
          } catch (e) {
            errBox.textContent = e.message === 'nsfw_rejected' ? 'That image looks explicit and was blocked by the content filter.' : 'Upload failed: ' + e.message;
            addBtn.disabled = false;
          }
        } } }, 'Add emoji');
        body.append(
          el('label', { style: 'margin-top:14px' }, 'Add an emoji'),
          el('div', { class: 'row', style: 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [nameIn, fileIn, addBtn]),
          errBox,
        );
      }

      if (tab === 'soundboard') {
        let info = { sounds: [], limit: 12 };
        try { info = await api('/api/servers/' + serverId + '/soundboard'); } catch {}
        body.append(el('p', { class: 'muted-text', style: 'margin:0 0 12px' },
          'Short audio clips members of this server can play in any voice call. ' +
          info.sounds.length + '/' + info.limit + ' slots used · max 512 KB per sound.'));
        const list = el('div', { class: 'manage-list' });
        for (const s of info.sounds) {
          list.append(el('div', { class: 'manage-row' }, [
            el('span', { class: 'sb-emoji', style: 'font-size:16px' }, s.emoji || '🔊'),
            el('strong', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, s.name),
            el('button', { type: 'button', class: 'ghost', title: 'Preview (only you hear it)', on: { click: () => {
              try { new Audio('/api/sound/' + encodeURIComponent(s.stored_path)).play().catch(() => {}); } catch {}
            } } }, icon('volume', 15)),
            el('button', { type: 'button', class: 'ghost danger', on: { click: async () => {
              if (!(await confirmModal('Delete the sound "' + s.name + '"?'))) return;
              try { await api('/api/servers/' + serverId + '/soundboard/' + s.id, { method: 'DELETE' }); } catch (e) { alert('Could not delete: ' + e.message); }
              await refresh();
            } } }, 'Delete'),
          ]));
        }
        if (!info.sounds.length) list.append(el('p', { class: 'muted-text' }, 'No sounds yet — add the first one below.'));
        body.append(list);
        if (info.sounds.length < info.limit) {
          const errBox = el('div', { class: 'error' });
          const nameIn = el('input', { placeholder: 'Sound name (optional — file name is used)', maxlength: 32, style: 'flex:1' });
          const fileIn = el('input', { type: 'file', accept: 'audio/*' });
          const emojiPick = soundEmojiPickEl();
          const addBtn = el('button', { type: 'button', on: { click: async () => {
            errBox.textContent = '';
            const f = fileIn.files && fileIn.files[0];
            if (!f) { errBox.textContent = 'Pick an audio file first.'; return; }
            const fd = new FormData();
            fd.append('name', nameIn.value);
            fd.append('emoji', emojiPick.get());
            fd.append('sound', f);
            addBtn.disabled = true;
            try { await api('/api/servers/' + serverId + '/soundboard', { method: 'POST', body: fd }); await refresh(); }
            catch (e) { errBox.textContent = 'Upload failed: ' + e.message; addBtn.disabled = false; }
          } } }, 'Add sound');
          body.append(
            el('label', { style: 'margin-top:14px' }, 'Add a sound'),
            el('div', { style: 'display:flex;gap:8px;align-items:center' }, [emojiPick.node, nameIn]),
            el('div', { class: 'row', style: 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [fileIn, addBtn]),
            errBox,
          );
        }
      }

      if (tab === 'overview') {
        const errBox = el('div', { class: 'error' });
        const nameInput = el('input', { value: server.name, maxlength: 60 });
        const descInput = el('textarea', { maxlength: 500 }, server.description || '');
        // Welcome messages channel — where "X joined the server" gets posted.
        const sysChanSel = el('select', {}, [
          el('option', { value: '' }, 'None (no join messages)'),
          ...channels.filter(c => c.type === 'channel').map(c =>
            el('option', { value: String(c.id), selected: server.system_channel_id === c.id ? '' : null }, '#' + c.name)),
        ]);
        const iconInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
        const iconPreview = el('div', { class: 'icon-preview' },
          server.icon_path
            ? el('img', { src: '/api/server-icon/' + server.icon_path, alt: '', loading: 'lazy', decoding: 'async' })
            : el('span', {}, initials(server.name)));
        body.append(
          el('label', {}, 'Icon'),
          el('div', { class: 'icon-row' }, [
            iconPreview,
            iconInput,
            server.icon_path ? el('button', { type: 'button', class: 'ghost', on: { click: async () => {
              await api('/api/servers/' + serverId + '/icon', { method: 'DELETE' });
              await loadServers(); await loadServer(serverId);
              renderServerRail();
              detail = state.serverDetail; await refresh();
            } } }, 'Remove') : null,
          ]),
          el('label', {}, 'Server name'), nameInput,
          el('label', {}, 'Description'), descInput,
          el('label', {}, 'Welcome messages channel'),
          sysChanSel,
          el('p', { class: 'muted-text', style: 'margin:4px 0 0;font-size:12px' }, 'New members get a "joined the server" message posted here.'),
          errBox,
          el('div', { class: 'row' }, [
            el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Cancel'),
            el('button', { type: 'button', on: { click: async () => {
              try {
                await api('/api/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ name: nameInput.value, description: descInput.value, system_channel_id: sysChanSel.value ? +sysChanSel.value : null }) });
                if (iconInput.files[0]) {
                  const fd = new FormData(); fd.append('icon', iconInput.files[0]);
                  const r = await fetch('/api/servers/' + serverId + '/icon', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
                  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'nsfw_rejected' ? 'That image looks explicit and was blocked by the content filter.' : (j.error || 'icon_upload_failed')); }
                }
                await loadServers(); await loadServer(serverId);
                renderServerRail(); renderSidebar();
                detail = state.serverDetail; await refresh();
              } catch (e) { errBox.textContent = friendlyServerError(e.message); }
            } } }, 'Save'),
          ]),
        );
      }

      if (tab === 'safety') {
        const errBox = el('div', { class: 'error' });
        const profanityToggle = el('input', { type: 'checkbox' });
        if (server.profanity_filter) profanityToggle.checked = true;
        const bannerInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
        const bannerPreview = el('div', { class: 'discover-banner-preview' },
          server.banner_path ? el('img', { src: '/api/server-banner/' + server.banner_path, alt: '', loading: 'lazy' }) : el('span', { class: 'muted-text' }, 'No banner'));
        const publicToggle = el('input', { type: 'checkbox' });
        if (server.is_public) publicToggle.checked = true;
        body.append(
          el('h4', { style: 'margin:0 0 8px' }, 'Content'),
          el('label', { class: 'check-row' }, [profanityToggle, el('span', {}, 'Filter English + Turkish profanity in messages')]),
          el('hr', { style: 'border:none;border-top:1px solid var(--border);margin:16px 0' }),
          el('h4', { style: 'margin:0 0 8px' }, 'Discover Servers'),
          el('label', { class: 'check-row' }, [publicToggle, el('span', {}, 'List this server publicly in Discover Servers — anyone can view and join it')]),
          el('label', {}, 'Banner (shown on the Discover card)'),
          bannerPreview,
          el('div', { class: 'icon-row' }, [
            bannerInput,
            server.banner_path ? el('button', { type: 'button', class: 'ghost', on: { click: async () => {
              await api('/api/servers/' + serverId + '/banner', { method: 'DELETE' });
              detail = await api('/api/servers/' + serverId); await refresh();
            } } }, 'Remove') : null,
          ]),
          errBox,
          el('div', { class: 'row' }, [
            el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Cancel'),
            el('button', { type: 'button', on: { click: async () => {
              try {
                // name is required on every PATCH — pass the unchanged current name through.
                await api('/api/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ name: server.name, profanity_filter: profanityToggle.checked, is_public: publicToggle.checked }) });
                if (bannerInput.files[0]) {
                  const fd = new FormData(); fd.append('banner', bannerInput.files[0]);
                  const r = await fetch('/api/servers/' + serverId + '/banner', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
                  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'nsfw_rejected' ? 'That image looks explicit and was blocked by the content filter.' : (j.error || 'banner_upload_failed')); }
                }
                await loadServers(); await loadServer(serverId);
                renderServerRail(); renderSidebar();
                detail = state.serverDetail; await refresh();
              } catch (e) { errBox.textContent = friendlyServerError(e.message); }
            } } }, 'Save'),
          ]),
        );
      }

      if (tab === 'danger' && isOwner) {
        body.append(el('p', { class: 'muted-text', style: 'margin:0 0 14px' },
          'Deleting a server is permanent — every channel, message, role, and file in it is gone for all members.'));
        body.append(el('button', { class: 'danger', on: { click: async () => {
          const tt = prompt(`Type the server name "${server.name}" to confirm deletion:`);
          if (tt !== server.name) return;
          await api('/api/servers/' + serverId, { method: 'DELETE' });
          await loadServers(); renderServerRail();
          switchToHome();
          close();
        } } }, 'Delete this server'));
      }

      if (tab === 'channels') {
        const editChan = editingChannelPermsId ? channels.find(c => c.id === editingChannelPermsId) : null;
        if (!editChan) editingChannelPermsId = null;
        if (editChan && hasPerm(SP.MANAGE_ROLES)) {
          // ── Per-channel permission overrides ──
          body.append(el('button', { type: 'button', class: 'ghost', style: 'margin-bottom:12px', on: { click: () => { editingChannelPermsId = null; pendingMemberOverridePick = null; refresh(); } } }, '← Back to channels'));
          body.append(el('h4', { style: 'margin:0 0 4px' }, [el('span', { style: 'opacity:.6;margin-right:4px' }, [editChan.type === 'voice' ? icon('volume', 14) : '#']), editChan.name, ' — permissions']));
          body.append(el('p', { class: 'muted-text', style: 'margin:0 0 12px' }, 'Override what each role can do in this channel. Allow ✓ / inherit – / deny ✗. (Server admins always bypass.)'));
          const CHAN_PERMS = [['VIEW_CHANNELS', 'View Channel'], ['SEND_MESSAGES', 'Send Messages'], ['MANAGE_MESSAGES', 'Manage Messages']];
          let data;
          try { data = await api(`/api/servers/${serverId}/channels/${editChan.id}/overrides`); }
          catch (e) { body.append(el('p', { class: 'error' }, e.message)); data = null; }
          if (data) {
            const ovByRole = {}; for (const o of data.overrides) ovByRole[o.role_id] = o;
            const setOverride = async (rid, ov, bit, stateVal) => {
              let allow = ov.allow & ~bit, deny = ov.deny & ~bit;
              if (stateVal === 'allow') allow |= bit; else if (stateVal === 'deny') deny |= bit;
              try { await api(`/api/servers/${serverId}/channels/${editChan.id}/overrides/${rid}`, { method: 'PUT', body: JSON.stringify({ allow, deny }) }); await refresh(); }
              catch (e) { alert(e.message); }
            };
            for (const r of data.roles) {
              const ov = ovByRole[r.id] || { allow: 0, deny: 0 };
              const section = el('div', { class: 'chan-perm-role' }, [
                el('div', { class: 'chan-perm-role-head' }, [el('span', { class: 'role-dot', style: 'background:' + (r.color || 'var(--muted)') }), el('span', { style: r.color ? 'color:' + r.color : '' }, r.name)]),
              ]);
              for (const [key, label] of CHAN_PERMS) {
                const bit = SP[key];
                const cur = (ov.allow & bit) ? 'allow' : (ov.deny & bit) ? 'deny' : 'neutral';
                const tri = el('div', { class: 'perm-tri' }, ['deny', 'neutral', 'allow'].map(s => el('button', {
                  type: 'button', class: 'perm-tri-btn pt-' + s + (cur === s ? ' active' : ''),
                  title: s === 'allow' ? 'Allow' : s === 'deny' ? 'Deny' : 'Inherit',
                  on: { click: () => setOverride(r.id, ov, bit, s) },
                }, s === 'allow' ? '✓' : s === 'deny' ? '✗' : '–')));
                section.append(el('div', { class: 'chan-perm-row' }, [el('span', { class: 'chan-perm-label' }, label), tri]));
              }
              body.append(section);
            }
            // ── Per-member overrides ("whitelist"/"blacklist" a specific person,
            // regardless of their roles) — highest precedence, applied after roles. ──
            body.append(el('h4', { style: 'margin:16px 0 4px' }, 'Members'));
            body.append(el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, 'Overrides a specific member\'s access here, beating any role override — e.g. hide this channel from everyone except one person.'));
            const ovByUser = {}; for (const o of (data.memberOverrides || [])) ovByUser[o.user_id] = o;
            const setMemberOverride = async (uid, ov, bit, stateVal) => {
              let allow = ov.allow & ~bit, deny = ov.deny & ~bit;
              if (stateVal === 'allow') allow |= bit; else if (stateVal === 'deny') deny |= bit;
              try {
                await api(`/api/servers/${serverId}/channels/${editChan.id}/overrides/user/${uid}`, { method: 'PUT', body: JSON.stringify({ allow, deny }) });
                pendingMemberOverridePick = null;
                await refresh();
              } catch (e) { alert(e.message); }
            };
            const overriddenIds = new Set((data.memberOverrides || []).map(o => o.user_id));
            const rowsToShow = (data.memberOverrides || []).slice();
            if (pendingMemberOverridePick && !overriddenIds.has(pendingMemberOverridePick)) {
              const mm = members.find(x => x.id === pendingMemberOverridePick);
              if (mm) rowsToShow.push({ user_id: mm.id, username: mm.username, display_name: mm.display_name, avatar_path: mm.avatar_path, allow: 0, deny: 0 });
            }
            for (const o of rowsToShow) {
              const ov = ovByUser[o.user_id] || { allow: o.allow || 0, deny: o.deny || 0 };
              const section = el('div', { class: 'chan-perm-role' }, [
                el('div', { class: 'chan-perm-role-head' }, [avatarEl(o, 'small'), el('span', {}, o.display_name || o.username)]),
              ]);
              for (const [key, label] of CHAN_PERMS) {
                const bit = SP[key];
                const cur = (ov.allow & bit) ? 'allow' : (ov.deny & bit) ? 'deny' : 'neutral';
                const tri = el('div', { class: 'perm-tri' }, ['deny', 'neutral', 'allow'].map(s => el('button', {
                  type: 'button', class: 'perm-tri-btn pt-' + s + (cur === s ? ' active' : ''),
                  title: s === 'allow' ? 'Allow' : s === 'deny' ? 'Deny' : 'Inherit',
                  on: { click: () => setMemberOverride(o.user_id, ov, bit, s) },
                }, s === 'allow' ? '✓' : s === 'deny' ? '✗' : '–')));
                section.append(el('div', { class: 'chan-perm-row' }, [el('span', { class: 'chan-perm-label' }, label), tri]));
              }
              body.append(section);
            }
            const availableMembers = members.filter(m => !overriddenIds.has(m.id) && m.id !== pendingMemberOverridePick);
            if (availableMembers.length) {
              const sel = el('select', { class: 'input', style: 'margin-top:4px' }, [
                el('option', { value: '' }, '+ Add member override'),
                ...availableMembers.map(m => el('option', { value: m.id }, m.display_name || m.username)),
              ]);
              sel.addEventListener('change', () => { if (sel.value) { pendingMemberOverridePick = +sel.value; refresh(); } });
              body.append(sel);
            }
          }
        } else {
          body.append(el('p', { class: 'muted-text', style: 'color:var(--muted);margin:0 0 10px' }, 'Rename, set a topic/slowmode, delete, or set per-role permissions for channels.'));
          const SLOWMODES = [[0, 'Slowmode off'], [5, '5s slowmode'], [10, '10s slowmode'], [30, '30s slowmode'], [60, '1m slowmode'], [120, '2m slowmode'], [300, '5m slowmode'], [600, '10m slowmode']];
          const list = el('div', { class: 'manage-list' });
          for (const c of channels) {
            const nameInput = el('input', { value: c.name, maxlength: 30, style: 'flex:1' });
            const topicInput = c.type === 'channel'
              ? el('input', { value: c.topic || '', maxlength: 200, placeholder: 'Topic — shown under the channel name', style: 'flex:1' })
              : null;
            const slowSel = c.type === 'channel'
              ? el('select', { class: 'input', title: 'Slowmode: how often non-admins can send' }, SLOWMODES.map(([v, l]) => el('option', { value: v }, l)))
              : null;
            if (slowSel) slowSel.value = String(c.slowmode_seconds || 0);
            list.append(el('div', { class: 'manage-row', style: 'flex-wrap:wrap' }, [
              el('span', { class: 'channel-icon', style: 'width:20px' }, c.type === 'voice' ? icon('volume', 16) : icon('hash', 16)),
              nameInput,
              hasPerm(SP.MANAGE_ROLES) ? el('button', { type: 'button', class: 'ghost', title: 'Channel permissions', on: { click: () => { editingChannelPermsId = c.id; refresh(); } } }, 'Perms') : null,
              el('button', { type: 'button', on: { click: async () => {
                try {
                  await api(`/api/servers/${serverId}/channels/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name: nameInput.value }) });
                  if (topicInput || slowSel) {
                    const settings = {};
                    if (topicInput) settings.topic = topicInput.value.trim();
                    if (slowSel) settings.slowmode_seconds = +slowSel.value;
                    await api(`/api/servers/${serverId}/channels/${c.id}/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
                  }
                  await reload();
                  await loadServer(serverId); renderSidebar();
                } catch (e) { alert(e.message); }
              } } }, 'Save'),
              el('button', { type: 'button', class: 'danger', on: { click: async () => {
                if (!(await confirmModal('Delete channel "' + c.name + '"? Messages will be lost.'))) return;
                await api(`/api/servers/${serverId}/channels/${c.id}`, { method: 'DELETE' });
                await reload();
                await loadServer(serverId); renderSidebar();
              } } }, 'Delete'),
              topicInput ? el('div', { style: 'display:flex;gap:6px;width:100%;padding-left:26px' }, [topicInput, slowSel]) : null,
            ]));
          }
          body.append(list);
          body.append(el('button', { type: 'button', style: 'margin-top:14px',
            on: { click: () => { close(); newChannelModal(serverId); } } }, '+ New channel'));
        }
      }

      if (tab === 'members') {
        const editMember = editingMemberRolesId ? members.find(m => m.id === editingMemberRolesId) : null;
        if (!editMember) editingMemberRolesId = null;
        if (editMember && hasPerm(SP.MANAGE_ROLES)) {
          // ── Per-member role picker ──
          body.append(el('button', { type: 'button', class: 'ghost', style: 'margin-bottom:12px', on: { click: () => { editingMemberRolesId = null; refresh(); } } }, '← Back to members'));
          body.append(el('div', { class: 'manage-row', style: 'margin-bottom:12px' }, [
            avatarEl(editMember, 'small'),
            el('strong', {}, editMember.display_name || editMember.username),
          ]));
          const assignable = roleList.filter(r => !r.is_default);
          if (!assignable.length) body.append(el('p', { class: 'muted-text' }, 'No roles yet — create some in the Roles tab.'));
          const boxes = {};
          for (const r of assignable) {
            const cb = el('input', { type: 'checkbox' });
            cb.checked = (editMember.role_ids || []).includes(r.id);
            const canAssign = r.position < myTopPos;
            if (!canAssign) cb.disabled = true;
            boxes[r.id] = cb;
            body.append(el('label', { class: 'check-row' }, [
              cb,
              el('span', { style: r.color ? 'color:' + r.color : '' }, [el('span', { class: 'role-dot', style: 'background:' + (r.color || 'var(--muted)') + ';margin-right:8px' }), r.name, canAssign ? '' : el('span', { class: 'muted-text', style: 'margin-left:8px;font-size:11px' }, '(above your role)')]),
            ]));
          }
          const errBox = el('div', { class: 'error' });
          body.append(errBox);
          body.append(el('button', { type: 'button', style: 'margin-top:10px', on: { click: async () => {
            const roleIds = Object.keys(boxes).filter(id => boxes[id].checked && !boxes[id].disabled).map(Number);
            // preserve any disabled (above-my-level) roles already on the member
            for (const r of assignable) if (boxes[r.id].disabled && (editMember.role_ids || []).includes(r.id)) roleIds.push(r.id);
            try {
              await api(`/api/servers/${serverId}/members/${editMember.id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }) });
              await loadServer(serverId); detail = state.serverDetail; renderRightPanel();
              editingMemberRolesId = null; await refresh();
            } catch (e) { errBox.textContent = e.message; }
          } } }, 'Save roles'));
        } else {
          body.append(el('p', { class: 'muted-text', style: 'color:var(--muted);margin:0 0 10px' },
            isOwner ? 'You can promote, demote, kick, or assign roles to members.' : 'Manage members you have permission to.'));
          const memberManageRow = (m) => {
            const isMe = m.id === state.me.id;
            const isThisOwner = m.role === 'owner';
            const isAdmin = m.role === 'admin';
            const chips = (m.role_ids || []).map(id => roleById(id)).filter(r => r && !r.is_default)
              .sort((a, b) => b.position - a.position)
              .map(r => el('span', { class: 'role-chip', style: r.color ? 'border-color:' + r.color + ';color:' + r.color : '' }, [el('span', { class: 'role-dot', style: 'background:' + (r.color || 'var(--muted)') }), r.name]));
            return el('div', { class: 'manage-row member-manage-row' }, [
              avatarEl(m, 'small'),
              el('div', { style: 'flex:1;min-width:0' }, [
                el('div', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, [
                  el('strong', {}, m.display_name || m.username),
                  m.role !== 'member' ? el('span', { class: 'muted', style: 'color:var(--muted);margin-left:6px;font-size:12px' }, m.role) : null,
                ]),
                chips.length ? el('div', { class: 'member-role-chips' }, chips) : null,
              ]),
              hasPerm(SP.MANAGE_ROLES) ? el('button', { type: 'button', class: 'ghost', on: { click: () => { editingMemberRolesId = m.id; refresh(); } } }, 'Roles') : null,
              !isMe && !isThisOwner && isOwner ? el('button', { type: 'button', class: 'ghost',
                on: { click: async () => {
                  await api(`/api/servers/${serverId}/members/${m.id}/role`, { method: 'POST', body: JSON.stringify({ role: isAdmin ? 'member' : 'admin' }) });
                  await reload();
                } } }, isAdmin ? 'Demote' : 'Promote') : null,
              !isMe && !isThisOwner && hasPerm(SP.MODERATE_MEMBERS) ? el('button', { type: 'button', class: 'ghost',
                title: m.timeout_until && m.timeout_until > Date.now() ? 'Currently timed out — click to manage' : 'Timeout (temporary mute)',
                on: { click: () => timeoutMemberModal(serverId, m, reload) } },
                m.timeout_until && m.timeout_until > Date.now() ? 'Timed out' : 'Timeout') : null,
              !isMe && !isThisOwner && (isOwner || (role === 'admin' && !isAdmin) || hasPerm(SP.KICK_MEMBERS)) ? el('button', { type: 'button', class: 'danger',
                on: { click: async () => {
                  if (!(await confirmModal('Kick ' + (m.display_name || m.username) + '?'))) return;
                  try { await api(`/api/servers/${serverId}/members/${m.id}`, { method: 'DELETE' }); } catch (e) { alert(modErr(e.message)); }
                  await reload();
                } } }, 'Kick') : null,
              !isMe && !isThisOwner && hasPerm(SP.BAN_MEMBERS) ? el('button', { type: 'button', class: 'danger',
                on: { click: () => banMemberModal(serverId, m, reload) } }, 'Ban') : null,
            ]);
          };
          const list = el('div', { class: 'manage-list' });
          const empty = el('p', { class: 'muted-text' }, 'No members match your search.');
          const paintMembers = (q) => {
            memberSearchQuery = q;
            const query = q.trim().toLowerCase();
            const shown = !query ? members : members.filter(m =>
              (m.display_name || '').toLowerCase().includes(query) ||
              (m.username || '').toLowerCase().includes(query) ||
              (m.nickname || '').toLowerCase().includes(query));
            list.innerHTML = '';
            for (const m of shown) list.append(memberManageRow(m));
            empty.style.display = shown.length ? 'none' : '';
          };
          // Only worth showing past a handful of members — keeps small servers' tab uncluttered.
          if (members.length > 8) {
            const search = el('input', { type: 'search', placeholder: 'Search members by name…', value: memberSearchQuery, style: 'margin-bottom:10px;width:100%' });
            search.addEventListener('input', () => paintMembers(search.value));
            body.append(search);
          }
          body.append(list, empty);
          paintMembers(memberSearchQuery);
        }
      }

      if (tab === 'bans') {
        body.append(el('p', { class: 'muted-text', style: 'color:var(--muted);margin:0 0 10px' },
          'Banned users are removed from the server and can\'t rejoin until unbanned.'));
        let bans = [];
        try { bans = (await api(`/api/servers/${serverId}/bans`)).bans || []; } catch {}
        if (!bans.length) body.append(el('div', { class: 'muted-text', style: 'opacity:.7;padding:14px 0' }, 'No bans.'));
        const list = el('div', { class: 'manage-list' });
        for (const b of bans) {
          list.append(el('div', { class: 'manage-row member-manage-row' }, [
            avatarEl(b, 'small'),
            el('div', { style: 'flex:1;min-width:0' }, [
              el('div', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, [el('strong', {}, b.display_name || b.username)]),
              el('div', { class: 'muted-text', style: 'font-size:12px;opacity:.75' },
                (b.until ? (b.until > Date.now() ? 'Until ' + new Date(b.until).toLocaleString() : 'Expired ' + new Date(b.until).toLocaleString()) : 'Permanent') + (b.reason ? ' — ' + b.reason : '')),
            ]),
            el('button', { type: 'button', class: 'ghost', on: { click: async () => {
              if (!(await confirmModal('Unban ' + (b.display_name || b.username) + '?'))) return;
              try { await api(`/api/servers/${serverId}/bans/${b.id}`, { method: 'DELETE' }); } catch (e) { alert(modErr(e.message)); }
              await refresh();
            } } }, 'Unban'),
          ]));
        }
        body.append(list);
      }

      if (tab === 'modlog') {
        body.append(el('p', { class: 'muted-text', style: 'color:var(--muted);margin:0 0 10px' }, 'Recent moderation actions in this server.'));
        let log = [];
        try { log = (await api(`/api/servers/${serverId}/modlog`)).log || []; } catch {}
        if (!log.length) body.append(el('div', { class: 'muted-text', style: 'opacity:.7;padding:14px 0' }, 'No moderation actions yet.'));
        const list = el('div', { class: 'manage-list' });
        const verb = { kick: 'kicked', ban: 'banned', unban: 'unbanned', timeout: 'timed out', untimeout: 'removed timeout from' };
        for (const e of log) {
          let extra = '';
          if (e.action === 'timeout' && e.detail) { try { const d = JSON.parse(e.detail); if (d.until) extra = ' until ' + new Date(d.until).toLocaleString(); } catch {} }
          const actor = e.actor_name || e.actor_username || 'Someone';
          const target = e.target_name || e.target_username || 'a user';
          list.append(el('div', { class: 'manage-row', style: 'align-items:flex-start;gap:8px' }, [
            el('span', { class: 'modlog-icon', style: 'flex:0 0 auto;margin-top:2px;color:var(--muted)' }, icon(MODLOG_ICON[e.action] || 'shield', 16)),
            el('div', { style: 'flex:1;min-width:0' }, [
              el('div', {}, [el('strong', {}, actor), ' ' + (verb[e.action] || e.action) + ' ', el('strong', {}, target), extra]),
              e.reason ? el('div', { class: 'muted-text', style: 'font-size:12px;opacity:.75' }, '“' + e.reason + '”') : null,
              el('div', { class: 'muted-text', style: 'font-size:11px;opacity:.6' }, new Date(e.created_at).toLocaleString()),
            ]),
          ]));
        }
        body.append(list);
      }

      if (tab === 'roles') {
        const role = editingRoleId ? roleById(editingRoleId) : null;
        if (!role) editingRoleId = null;
        if (!editingRoleId) {
          // ── Role list ──
          body.append(el('p', { class: 'muted-text', style: 'margin:0 0 10px' },
            'Members use the colour of their highest role. Drag order = hierarchy; you can only manage roles below your own.'));
          body.append(el('button', { type: 'button', style: 'margin-bottom:12px', on: { click: async () => {
            const r = await api('/api/servers/' + serverId + '/roles', { method: 'POST', body: JSON.stringify({ name: 'new role' }) });
            await reload(); editingRoleId = r.role.id; await refresh();
          } } }, '+ Create role'));
          const list = el('div', { class: 'role-mgmt-list' });
          for (const rl of roleList) {
            const canEdit = rl.position < myTopPos;
            const permCount = rl.permissions & SP.ADMINISTRATOR ? 'Administrator' : (SP_INFO.filter(([k]) => rl.permissions & SP[k]).length + ' permissions');
            list.append(el('div', { class: 'role-mgmt-row' }, [
              el('span', { class: 'role-dot', style: 'background:' + (rl.color || 'var(--muted)') }),
              el('span', { class: 'role-mgmt-name', style: rl.color ? 'color:' + rl.color : '' }, rl.name),
              el('span', { class: 'muted-text', style: 'margin-left:auto;font-size:12px' }, permCount),
              !rl.is_default && canEdit ? el('button', { type: 'button', class: 'ghost icon-btn', title: 'Move up', on: { click: async () => { await api(`/api/servers/${serverId}/roles/${rl.id}/move`, { method: 'POST', body: JSON.stringify({ dir: 'up' }) }); await reload(); } } }, '↑') : null,
              !rl.is_default && canEdit ? el('button', { type: 'button', class: 'ghost icon-btn', title: 'Move down', on: { click: async () => { await api(`/api/servers/${serverId}/roles/${rl.id}/move`, { method: 'POST', body: JSON.stringify({ dir: 'down' }) }); await reload(); } } }, '↓') : null,
              canEdit || rl.is_default ? el('button', { type: 'button', class: 'ghost', on: { click: () => { editingRoleId = rl.id; refresh(); } } }, 'Edit') : el('span', { class: 'muted-text', style: 'font-size:12px' }, 'locked'),
            ]));
          }
          body.append(list);
        } else {
          // ── Role editor ──
          const isEveryone = !!role.is_default;
          body.append(el('button', { type: 'button', class: 'ghost', style: 'margin-bottom:12px', on: { click: () => { editingRoleId = null; refresh(); } } }, '← Back to roles'));
          const errBox = el('div', { class: 'error' });
          const nameInput = el('input', { value: role.name, maxlength: 40, disabled: isEveryone || undefined });
          if (!isEveryone) body.append(el('label', {}, 'Role name'), nameInput);

          let chosenColor = role.color || null;
          if (!isEveryone) {
            body.append(el('label', {}, 'Role color'));
            const colorRow = el('div', { class: 'accent-row' });
            const mark = () => colorRow.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('active', s.dataset.c === (chosenColor || '')));
            for (const c of ROLE_COLORS) {
              colorRow.append(el('button', { type: 'button', class: 'accent-swatch', dataset: { c }, style: 'background:' + c, on: { click: () => { chosenColor = c; mark(); } } }));
            }
            colorRow.append(el('button', { type: 'button', class: 'accent-swatch accent-reset', dataset: { c: '' }, title: 'No color', on: { click: () => { chosenColor = null; mark(); } } }, '↺'));
            body.append(colorRow); mark();
          }

          const hoistCb = el('input', { type: 'checkbox' }); hoistCb.checked = !!role.hoist;
          const mentCb = el('input', { type: 'checkbox' }); mentCb.checked = !!role.mentionable;
          if (!isEveryone) {
            body.append(el('label', { class: 'check-row' }, [hoistCb, el('span', {}, 'Display role members separately from online members')]));
            body.append(el('label', { class: 'check-row' }, [mentCb, el('span', {}, 'Allow anyone to @mention this role')]));
          }

          body.append(el('h4', { style: 'margin:16px 0 8px' }, 'Permissions'));
          const permBoxes = {};
          for (const [key, label, desc] of SP_INFO) {
            const cb = el('input', { type: 'checkbox' }); cb.checked = !!(role.permissions & SP[key]);
            permBoxes[key] = cb;
            body.append(el('label', { class: 'check-row perm-row' }, [cb, el('div', {}, [el('div', {}, label), el('div', { class: 'muted-text', style: 'font-size:12px' }, desc)])]));
          }
          body.append(errBox);
          body.append(el('div', { class: 'row', style: 'margin-top:12px' }, [
            !isEveryone ? el('button', { type: 'button', class: 'danger', on: { click: async () => {
              if (!(await confirmModal('Delete the "' + role.name + '" role? Members will lose it.'))) return;
              try { await api(`/api/servers/${serverId}/roles/${role.id}`, { method: 'DELETE' }); editingRoleId = null; await reload(); await refresh(); }
              catch (e) { errBox.textContent = e.message; }
            } } }, 'Delete role') : null,
            el('button', { type: 'button', on: { click: async () => {
              let permissions = 0;
              for (const [key] of SP_INFO) if (permBoxes[key].checked) permissions |= SP[key];
              const payload = { permissions };
              if (!isEveryone) { payload.name = nameInput.value; payload.color = chosenColor; payload.hoist = hoistCb.checked; payload.mentionable = mentCb.checked; }
              try {
                await api(`/api/servers/${serverId}/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
                await loadServer(serverId); detail = state.serverDetail; renderRightPanel();
                editingRoleId = null; await refresh();
              } catch (e) { errBox.textContent = e.message; }
            } } }, 'Save role'),
          ]));
        }
      }

      if (tab === 'invites') {
        let invites = [];
        try { invites = (await api('/api/servers/' + serverId + '/invites')).invites; } catch (e) {}
        body.append(el('p', { style: 'color:var(--muted);margin:0 0 10px' }, 'Active invite links.'));
        const list = el('div', { class: 'manage-list' });
        if (!invites.length) list.append(el('p', { style: 'color:var(--muted)' }, 'No active invites.'));
        for (const i of invites) {
          const url = `${location.origin}/invite/${i.code}`;
          list.append(el('div', { class: 'manage-row' }, [
            el('input', { value: url, readonly: true, style: 'flex:1;font-family:monospace' }),
            el('span', { class: 'muted', style: 'color:var(--muted);font-size:12px' }, 'expires ' + (i.expires_at ? fmtTime(i.expires_at) : 'never')),
            el('button', { type: 'button', class: 'ghost', on: { click: () => navigator.clipboard?.writeText(url) } }, 'Copy'),
            el('button', { type: 'button', class: 'danger', on: { click: async () => {
              await api(`/api/servers/${serverId}/invites/${i.code}`, { method: 'DELETE' });
              await refresh();
            } } }, 'Revoke'),
          ]));
        }
        body.append(list);
        body.append(el('button', { type: 'button', style: 'margin-top:14px',
          on: { click: () => { close(); inviteModal(serverId); } } }, '+ New invite'));
      }
  }

  // Sidebar tab list is built once from the permissions this session opened
  // with (mirrors how the user-settings nav is built once too) — a role
  // change mid-session just needs the modal reopened to pick it up.
  const isOwner = detail.role === 'owner';
  const myPerms0 = detail.myPerms || 0;
  const hasPerm0 = (b) => !!((myPerms0 & SP.ADMINISTRATOR) || (myPerms0 & b));
  const tabDefs = [['overview', 'Overview', 'settings'], ['safety', 'Safety', 'lock'], ['channels', 'Channels', 'hash'], ['members', 'Members', 'users']];
  if (isOwner || detail.role === 'admin') tabDefs.push(['emojis', 'Emojis', 'smile']);
  if (isOwner || detail.role === 'admin') tabDefs.push(['soundboard', 'Soundboard', 'volume']);
  if (hasPerm0(SP.MANAGE_ROLES)) tabDefs.push(['roles', 'Roles', 'shield']);
  if (hasPerm0(SP.BAN_MEMBERS)) tabDefs.push(['bans', 'Bans', 'ban']);
  if (hasPerm0(SP.KICK_MEMBERS) || hasPerm0(SP.BAN_MEMBERS) || hasPerm0(SP.MODERATE_MEMBERS) || hasPerm0(SP.MANAGE_SERVER)) tabDefs.push(['modlog', 'Mod Log', 'inbox']);
  tabDefs.push(['invites', 'Invites', 'link']);

  const switchTab = (k) => {
    tab = k;
    editingRoleId = null; editingMemberRolesId = null; editingChannelPermsId = null; pendingMemberOverridePick = null;
    nav.querySelectorAll('.settings-nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === k));
    document.querySelector('#serverSettingsRoot .settings-shell')?.classList.replace('s-list', 's-panel');
    refresh();
  };

  const nav = el('div', { class: 'settings-nav' });
  nav.append(el('div', { class: 'settings-nav-group' }, 'Server Settings'));
  for (const [k, lbl, ic] of tabDefs) {
    nav.append(el('button', {
      type: 'button', class: 'settings-nav-item' + (k === tab ? ' active' : ''), dataset: { tab: k },
      on: { click: () => switchTab(k) },
    }, [el('span', { class: 'sn-icon' }, icon(ic, 18)), lbl]));
  }
  nav.append(el('div', { class: 'settings-nav-sep' }));
  if (isOwner) {
    nav.append(el('button', {
      type: 'button', class: 'settings-nav-item danger', dataset: { tab: 'danger' },
      on: { click: () => switchTab('danger') },
    }, [el('span', { class: 'sn-icon' }, icon('trash', 18)), 'Danger Zone']));
  } else {
    nav.append(el('button', {
      type: 'button', class: 'settings-nav-item danger',
      on: { click: async () => {
        if (!(await confirmModal('Leave ' + detail.server.name + '?'))) return;
        await api('/api/servers/' + serverId + '/leave', { method: 'POST' });
        close();
        switchToHome();
        state.servers = state.servers.filter(s => s.id !== serverId);
        renderServerRail();
      } },
    }, [el('span', { class: 'sn-icon' }, icon('log-out', 18)), 'Leave Server']));
  }
  nav.prepend(el('div', { class: 'settings-nav-mobile-head' }, [
    el('h2', {}, 'Server settings'),
    el('button', { type: 'button', class: 'settings-close settings-close-list', title: t('chrome.close'), on: { click: close } }, '✕'),
  ]));

  const isMobile = isMobileLayout();
  const root = $('#modalRoot');
  root.innerHTML = '';
  root.append(el('div', { class: 'modal-bg settings-fullscreen', id: 'serverSettingsRoot', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } },
    el('div', { class: 'settings-shell ' + (isMobile ? 's-list' : 's-panel') }, [
      el('div', { class: 'settings-sidebar' }, el('div', { class: 'settings-sidebar-inner' }, nav)),
      el('div', { class: 'settings-content' }, [
        el('button', { type: 'button', class: 'settings-close', title: t('chrome.close'), on: { click: close } }, '✕'),
        contentInner,
      ]),
    ])
  ));

  await refresh();
}

async function openProfile(username) {
  let info;
  try { info = await api('/api/users/' + encodeURIComponent(username) + '/profile'); }
  catch { return; }
  const root = $('#modalRoot');
  const close = () => { closeModalRoot(); };
  let tab = 'activity';
  const card = el('div', { class: 'modal profile-pop' });
  root.innerHTML = '';
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card));

  const reload = async () => {
    try { info = await api('/api/users/' + encodeURIComponent(username) + '/profile'); } catch {}
    render();
  };

  function render() {
    const target = info.user;
    const isMe = target.username === state.me.username;
    const online = isMe ? (state.me.status_type !== 'offline') : (state.online.has(target.id) && target.status_type !== 'offline');
    const muts = info.mutuals || [];
    const servers = info.mutual_server_list || [];
    card.innerHTML = '';
    if (target.card_color) { card.style.setProperty('--card-accent', target.card_color); card.classList.add('has-card-accent'); }
    else { card.style.removeProperty('--card-accent'); card.classList.remove('has-card-accent'); }
    card.append(el('button', { class: 'pp-close', type: 'button', title: t('chrome.close'), on: { click: close } }, icon('x', 18)));

    // ── Left column ──
    const handle = el('div', { class: 'pp-handle' }, [
      el('span', {}, target.username),
      (target.display_name && target.display_name !== target.username) ? el('span', { class: 'pp-sep' }, '•') : null,
      (target.display_name && target.display_name !== target.username) ? el('span', {}, target.display_name) : null,
      target.tag && /^\d+$/.test(target.tag) ? el('span', { class: 'pp-sep' }, '·' + target.tag) : null,
      target.is_admin ? el('span', { class: 'tag ok pp-badge' }, 'admin') : null,
    ]);
    const left = el('div', { class: 'pp-left' }, [
      el('div', { class: 'pp-banner', style: bannerStyle(target) }),
      el('div', { class: 'pp-avatar-wrap' }, [ avatarEl(target, 'large', { showOrn: true }), statusDot(target, online) ]),
      el('div', { class: 'pp-left-body' }, [
        el('div', { class: 'pp-name' }, target.display_name || target.username),
        handle,
        profileActionRow(target, info, isMe, username, close, reload),
        el('div', { class: 'pp-divider' }),
        target.about_me ? el('div', { class: 'pp-about' }, [el('div', { class: 'pp-label' }, 'About Me'), el('div', { class: 'pp-bio' }, target.about_me)]) : null,
        target.bio ? el('div', { class: 'pp-bio' }, target.bio)
          : (isMe && !target.about_me ? el('div', { class: 'pp-bio muted-text' }, 'You haven\'t written a bio yet.') : null),
        el('div', { class: 'pp-label' }, 'Member Since'),
        el('div', { class: 'pp-value' }, new Date(target.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })),
        profileNote(target),
      ]),
    ]);

    // ── Right column ──
    const tabDefs = [['activity', 'Activity']];
    if (!isMe) {
      tabDefs.push(['friends', `${muts.length} Mutual Friends`]);
      tabDefs.push(['servers', `${servers.length} Mutual Servers`]);
    }
    const tabRow = el('div', { class: 'pp-tabs' }, tabDefs.map(([k, lbl]) =>
      el('button', { class: 'pp-tab' + (tab === k ? ' active' : ''), type: 'button', on: { click: () => { tab = k; render(); } } }, lbl)));
    const content = el('div', { class: 'pp-tab-content' });
    if (tab === 'activity') {
      const act = state.activities.get(target.id) || info.activity;
      if (act && act.name && act.type === 'spotify') {
        content.append(el('div', { class: 'pp-activity-card spotify' }, [
          el('div', { class: 'pp-act-head' }, t('act.spotifyHead')),
          el('div', { class: 'pp-act-game' }, [
            act.art
              ? el('img', { class: 'pp-act-art', src: act.art, alt: act.album || '', loading: 'lazy', referrerpolicy: 'no-referrer' })
              : el('div', { class: 'pp-act-icon spotify' }, icon('spotify', 28)),
            el('div', {}, [
              act.url
                ? el('a', { class: 'pp-act-name', href: act.url, target: '_blank', rel: 'noopener noreferrer' }, act.name)
                : el('div', { class: 'pp-act-name' }, act.name),
              act.artist ? el('div', { class: 'pp-act-artist' }, act.artist) : null,
              el('div', { class: 'pp-act-elapsed activity-elapsed', dataset: { since: String(act.since), suffix: ' elapsed' } }, fmtElapsed(act.since) + ' elapsed'),
            ]),
          ]),
        ]));
      } else if (act && act.name) {
        content.append(el('div', { class: 'pp-activity-card' }, [
          el('div', { class: 'pp-act-head' }, 'PLAYING A GAME'),
          el('div', { class: 'pp-act-game' }, [
            el('div', { class: 'pp-act-icon' }, icon('gamepad', 28)),
            el('div', {}, [
              el('div', { class: 'pp-act-name' }, act.name),
              el('div', { class: 'pp-act-elapsed activity-elapsed', dataset: { since: String(act.since), suffix: ' elapsed' } }, fmtElapsed(act.since) + ' elapsed'),
            ]),
          ]),
        ]));
      } else {
        const who = isMe ? 'You don\'t' : (target.display_name || target.username) + ' doesn\'t';
        content.append(el('div', { class: 'pp-activity' }, [
          el('div', { class: 'pp-activity-title' }, `${who} have any activity to share here`),
          el('div', { class: 'pp-activity-sub' }, 'No game or rich presence to show right now.'),
          isMe ? null : el('button', { class: 'pp-msg-big', on: { click: () => { close(); openDm(target.username); } } }, [icon('message', 16), ' Message']),
        ]));
      }
    } else if (tab === 'friends') {
      if (!muts.length) content.append(el('div', { class: 'pp-empty' }, 'No friends in common.'));
      else for (const mu of muts) content.append(el('div', { class: 'mutual-row', on: { click: () => openProfile(mu.username) } }, [ avatarEl(mu, 'small'), el('span', {}, userLabel(mu)) ]));
    } else if (tab === 'servers') {
      if (!servers.length) content.append(el('div', { class: 'pp-empty' }, 'No servers in common.'));
      else for (const s of servers) content.append(el('div', { class: 'mutual-row' }, [ serverIconEl(s), el('span', {}, s.name) ]));
    }
    const right = el('div', { class: 'pp-right' }, [tabRow, content]);

    card.append(left, right);
  }
  render();
}

function serverIconEl(s) {
  if (s.icon_path) return el('div', { class: 'avatar small' }, el('img', { src: '/api/server-icon/' + s.icon_path, alt: s.name, loading: 'lazy', decoding: 'async' }));
  return el('div', { class: 'avatar small' }, (s.name || '?').slice(0, 2).toUpperCase());
}

function profileNote(target) {
  const key = 'disdroc_note_' + target.id;
  const ta = el('textarea', { class: 'pp-note-input', rows: 1, maxlength: 256, placeholder: 'Click to add a note' }, localStorage.getItem(key) || '');
  ta.addEventListener('input', () => localStorage.setItem(key, ta.value));
  return el('div', { class: 'pp-note' }, [ el('div', { class: 'pp-label' }, 'Note (only visible to you)'), ta ]);
}

function profileActionRow(target, info, isMe, username, close, reload) {
  const row = el('div', { class: 'pp-actions' });
  if (isMe) {
    row.append(el('button', { class: 'pp-primary', on: { click: () => { close(); editProfileModal(); } } }, 'Edit Profile'));
    return row;
  }
  row.append(el('button', { class: 'pp-primary', on: { click: () => { close(); openDm(target.username); } } }, [icon('message', 16), ' Message']));
  const friendApi = async (path, body) => {
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); await loadFriends(); renderSidebar(); await reload(); }
    catch (e) { alert(e.message); }
  };
  if (info.friend_status === 'accepted') {
    row.append(el('button', { class: 'ghost icon-btn', title: 'Remove friend', on: { click: async () => {
      if (await confirmModal('Remove ' + target.username + ' as a friend?')) friendApi('/api/friends/decline', { friendshipId: info.friendship_id });
    } } }, icon('ban', 18)));
  } else if (info.friend_status === 'pending' && info.direction === 'sent') {
    row.append(el('button', { class: 'ghost', on: { click: () => friendApi('/api/friends/decline', { friendshipId: info.friendship_id }) } }, 'Cancel request'));
  } else if (info.friend_status === 'pending' && info.direction === 'received') {
    row.append(el('button', { on: { click: () => friendApi('/api/friends/accept', { friendshipId: info.friendship_id }) } }, 'Accept'));
    row.append(el('button', { class: 'ghost', on: { click: () => friendApi('/api/friends/decline', { friendshipId: info.friendship_id }) } }, 'Ignore'));
  } else {
    row.append(el('button', { class: 'ghost icon-btn', title: 'Add friend', on: { click: () => {
      const tag = target.tag && /^\d+$/.test(target.tag) ? target.tag : null;
      friendApi('/api/friends/request', tag ? { tag } : { username: target.username });
    } } }, icon('plus', 18)));
  }
  return row;
}


// Banner editor: live preview + upload / GIF-picker / color controls.
// Every action applies immediately (its own request). reopen() rebuilds the
// host UI after the GIF picker (which wipes #modalRoot) hands back a URL.
function bannerEditorEl(reopen) {
  const BANNER_COLORS = ['#5865f2', '#7c5cff', '#eb459e', '#23a55a', '#f0b232', '#f23f43', '#00a8fc', '#11806a', '#e67e22', '#1abc9c'];
  const err = el('div', { class: 'error' });
  const preview = el('div', { class: 'banner-edit-preview' });
  const paint = () => preview.setAttribute('style', bannerStyle(state.me));
  // PATCH /me always writes display_name+bio, so a banner-only change must
  // send the current values along or it would blank them.
  const patchMe = (body) => api('/api/me', { method: 'PATCH', body: JSON.stringify({ display_name: state.me.display_name, bio: state.me.bio, ...body }) });
  const refresh = async () => { await loadMe(); renderMe(); paint(); mark(); };
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    err.textContent = '';
    const fd = new FormData(); fd.append('banner', f);
    try {
      const r = await fetch('/api/me/banner', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error === 'file_too_large_max_8mb' ? t('acct.tooBig') : j.error === 'nsfw_rejected' ? t('acct.nsfwRejected') : (j.error || 'banner_upload_failed'));
      await refresh();
    } catch (e) { err.textContent = e.message; }
    fileInput.value = '';
  });
  const swatches = el('div', { class: 'accent-row' });
  const mark = () => swatches.querySelectorAll('.accent-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.c === (state.me.banner_color || '')));
  const setColor = (c) => async () => {
    try { await patchMe({ banner_color: c }); await refresh(); } catch (e) { err.textContent = e.message; }
  };
  for (const c of BANNER_COLORS) swatches.append(el('button', { type: 'button', class: 'accent-swatch', dataset: { c }, style: 'background:' + c, on: { click: setColor(c) } }));
  swatches.append(el('button', { type: 'button', class: 'accent-swatch accent-reset', dataset: { c: '' }, title: t('acct.noBannerColor'), on: { click: setColor(null) } }, '\u21ba'));
  const actions = el('div', { class: 'banner-edit-actions' }, [
    fileInput,
    el('button', { type: 'button', class: 'ghost', on: { click: () => fileInput.click() } }, t('acct.uploadImageGif')),
    el('button', { type: 'button', class: 'ghost', on: { click: () => openGifPicker('', async (url) => {
      try { await patchMe({ banner_url: url }); await loadMe(); renderMe(); } catch {}
      if (reopen) reopen();
    }) } }, t('acct.pickGif')),
    el('button', { type: 'button', class: 'ghost', on: { click: async () => {
      try { await api('/api/me/banner', { method: 'DELETE' }); await refresh(); } catch (e) { err.textContent = e.message; }
    } } }, t('acct.removeImage')),
  ]);
  paint(); mark();
  return el('div', { class: 'banner-editor' }, [preview, actions, swatches, err]);
}

// Profile-card accent colour picker — themes the profile popout + DM panel via
// the `card_color` field (separate from the banner colour). Mirrors the banner
// swatch flow and shows a live mini-card preview.
function cardColorEditorEl() {
  const CARD_COLORS = ['#5865f2', '#7c5cff', '#eb459e', '#23a55a', '#f0b232', '#f23f43', '#00a8fc', '#11806a', '#e67e22', '#1abc9c'];
  const err = el('div', { class: 'error' });
  const patchMe = (body) => api('/api/me', { method: 'PATCH', body: JSON.stringify({ display_name: state.me.display_name, bio: state.me.bio, ...body }) });
  const preview = el('div', { class: 'card-color-preview' }, [
    el('div', { class: 'ccp-row' }, [
      el('div', { class: 'ccp-av' }),
      el('div', { class: 'ccp-lines' }, [el('div', { class: 'ccp-l1' }), el('div', { class: 'ccp-l2' })]),
    ]),
    el('div', { class: 'ccp-activity' }, t('acct.activityStaysDefault')),
  ]);
  const paint = () => preview.style.setProperty('--card-accent', state.me.card_color || 'var(--accent)');
  const swatches = el('div', { class: 'accent-row' });
  const mark = () => swatches.querySelectorAll('.accent-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.c === (state.me.card_color || '')));
  const setColor = (c) => async () => {
    try { await patchMe({ card_color: c }); await loadMe(); renderMe(); paint(); mark(); custom.value = state.me.card_color || '#5865f2'; }
    catch (e) { err.textContent = e.message; }
  };
  for (const c of CARD_COLORS) swatches.append(el('button', { type: 'button', class: 'accent-swatch', dataset: { c }, style: 'background:' + c, on: { click: setColor(c) } }));
  swatches.append(el('button', { type: 'button', class: 'accent-swatch accent-reset', dataset: { c: '' }, title: t('acct.noCardColor'), on: { click: setColor(null) } }, '↺'));
  // Free-form custom colour.
  const custom = el('input', { type: 'color', class: 'card-color-input', title: t('acct.customColor'), value: state.me.card_color || '#5865f2' });
  custom.addEventListener('change', (e) => setColor(e.target.value)());
  paint(); mark();
  return el('div', { class: 'card-color-editor' }, [preview, swatches, custom, err]);
}

function editProfileModal() {
  const errBox = el('div', { class: 'error' });
  const avatarInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', name: 'avatar' });
  const avatarRow = el('div', { class: 'icon-row' }, [
    avatarEl(state.me, 'small'),
    avatarInput,
    state.me.avatar_path ? el('button', { type: 'button', class: 'ghost', on: { click: async () => {
      if (!(await confirmModal('Remove your current profile picture?'))) return;
      await api('/api/me/avatar', { method: 'DELETE' });
      await loadMe(); renderMe();
      closeModalRoot();
      editProfileModal();
    } } }, 'Remove') : null,
  ]);
  modal({
    title: 'Edit profile',
    content: el('div', {}, [
      el('label', {}, 'Display name'), el('input', { name: 'display_name', maxlength: 40, value: state.me.display_name || '' }),
      el('label', {}, 'About Me'), el('textarea', { name: 'about_me', maxlength: 400, placeholder: 'Tell people a bit about yourself' }, state.me.about_me || ''),
      el('label', {}, 'Bio (short tagline)'), el('textarea', { name: 'bio', maxlength: 240 }, state.me.bio || ''),
      el('label', {}, 'Profile banner'), bannerEditorEl(() => { closeModalRoot(); editProfileModal(); }),
      el('label', {}, 'Profile card color'), cardColorEditorEl(),
      el('label', {}, 'Avatar (PNG/JPG/WEBP/GIF · max 3 MB)'), avatarRow, errBox,
    ]),
    submitLabel: 'Save',
    onSubmit: async (form) => {
      const f = new FormData(form);
      try {
        await api('/api/me', { method: 'PATCH', body: JSON.stringify({ display_name: f.get('display_name'), bio: f.get('bio'), about_me: f.get('about_me') }) });
        if (avatarInput.files[0]) {
          const fd = new FormData(); fd.append('avatar', avatarInput.files[0]);
          const r = await fetch('/api/me/avatar', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'nsfw_rejected' ? 'That image looks explicit and was blocked by the content filter.' : (j.error || 'avatar_upload_failed')); }
        }
        await loadMe(); renderMe();
      } catch (e) { errBox.textContent = e.message; return false; }
    },
  });
}

// ─── Update banner ────────────────────────────────────────────────────────────

function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBanner';
  bar.className = 'update-banner';
  bar.innerHTML = '<span>A new version of disdroc is available.</span>';
  const btn = document.createElement('button');
  btn.textContent = 'Reload';
  btn.onclick = () => { location.reload(); };
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

// ─── Announcements ────────────────────────────────────────────────────────────

async function loadAnnouncements() {
  try {
    const { announcements } = await api('/api/announcements/active');
    const banner = $('#announceBanner');
    if (!announcements.length) { banner.style.display = 'none'; document.getElementById('app').classList.remove('has-banner'); return; }
    const dismissed = JSON.parse(localStorage.getItem('disdroc_dismissed_announce') || '[]');
    const fresh = announcements.find(a => !dismissed.includes(a.id));
    if (!fresh) { banner.style.display = 'none'; document.getElementById('app').classList.remove('has-banner'); return; }
    banner.innerHTML = '';
    banner.append(el('span', {}, fresh.content));
    banner.append(el('button', { class: 'close', on: { click: () => {
      dismissed.push(fresh.id);
      localStorage.setItem('disdroc_dismissed_announce', JSON.stringify(dismissed));
      loadAnnouncements();
    } } }, 'Dismiss'));
    banner.style.display = 'flex';
    document.getElementById('app').classList.add('has-banner');
  } catch {}
}

// ─── Events (admin-designed popups) ─────────────────────────────────────────────

// Per-event "dismissed" tracking. An event keeps popping on every login until
// the user actually closes/acknowledges it — so people who were offline when it
// was created still see it when they next log in. (An admin re-pop force-shows
// it again even after dismissal.)
function eventDismissed(id) {
  try { return JSON.parse(localStorage.getItem('disdroc_dismissed_events') || '[]').includes(id); } catch { return false; }
}
function markEventDismissed(id) {
  try {
    const s = JSON.parse(localStorage.getItem('disdroc_dismissed_events') || '[]');
    if (!s.includes(id)) { s.push(id); localStorage.setItem('disdroc_dismissed_events', JSON.stringify(s.slice(-200))); }
  } catch {}
}

// Account age gate for the very first session, so a brand-new signup isn't hit
// with the privacy-consent gate AND an event popup in the same few seconds —
// the event is still reachable normally (banner/next login) once this passes.
const NEW_ACCOUNT_SESSION_MS = 30 * 60 * 1000;
function isBrandNewAccount(windowMs = NEW_ACCOUNT_SESSION_MS) {
  return !!(state.me && state.me.created_at && (Date.now() - state.me.created_at) < windowMs);
}

// Bump alongside public/js/updates.js RELEASES[0].ver at every release — see
// the release checklist that already bumps package.json + adds a RELEASES
// entry. Deliberately a short, hand-written summary rather than pulling the
// full changelog HTML in here: updates.js isn't loaded on this page, and
// duplicating just the version + one line is far lower-risk than importing
// its whole render pipeline into the app shell.
const WHATS_NEW_VERSION = 'v1.2.7';

// Compact, dismissible, non-blocking "what's new" nudge — shown once per
// device per version, never for a brand-new account (they have nothing to
// compare "new" against, and Phase 2 already trims what a first session sees).
function maybeShowWhatsNew() {
  const seenKey = 'disdroc_last_seen_version';
  if (localStorage.getItem(seenKey) === WHATS_NEW_VERSION) return;
  if (isBrandNewAccount(7 * 24 * 3600 * 1000)) { localStorage.setItem(seenKey, WHATS_NEW_VERSION); return; }
  localStorage.setItem(seenKey, WHATS_NEW_VERSION);
  const close = () => animateOut(overlay);
  const card = el('div', { class: 'modal whats-new-card' }, [
    el('div', { class: 'whats-new-head' }, [
      el('span', { class: 'whats-new-title' }, t('whatsnew.title', { ver: WHATS_NEW_VERSION })),
      el('button', { type: 'button', class: 'onboarding-close', title: t('onboarding.dismiss'), on: { click: close } }, '✕'),
    ]),
    el('p', {}, t('whatsnew.body')),
    el('div', { class: 'row' }, [
      el('a', { href: '/updates', target: internalPageTarget(), rel: 'noopener', class: 'ghost', style: 'text-decoration:none;text-align:center' }, t('whatsnew.viewFull')),
      el('button', { type: 'button', on: { click: close } }, t('whatsnew.dismiss')),
    ]),
  ]);
  const overlay = el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card);
  document.body.append(overlay);
}

async function loadEvents() {
  try {
    const { events } = await api('/api/events/active');
    if (!events || !events.length) return;
    if (isBrandNewAccount()) return; // don't pop a modal on top of a first-ever session
    // On every login, show the newest active event the user hasn't dismissed yet.
    const fresh = events.find((e) => !eventDismissed(e.id));
    if (fresh) showEventModal(fresh);
  } catch {}
}

function showEventModal(ev, { force = false } = {}) {
  if (!ev) return;
  if (!force && eventDismissed(ev.id)) return;
  // Don't stack: if this exact event is already open, leave it.
  const existing = document.querySelector('.event-modal-root');
  if (existing) { if (existing.dataset.eid === String(ev.id)) return; existing.remove(); }

  const accent = ev.accent || '#5865f2';
  const root = el('div', { class: 'event-modal-root', dataset: { eid: String(ev.id) } });
  const close = () => { markEventDismissed(ev.id); animateOut(root); };
  const card = el('div', { class: 'ev-modal-card' });
  // CSS custom properties must be set via setProperty — Object.assign on .style ignores them.
  card.style.setProperty('--ev-accent', accent);
  card.append(el('div', { class: 'ev-modal-accent' }));
  const body = el('div', { class: 'ev-modal-body' });

  const closeBtn = el('button', { class: 'ev-modal-close', title: 'Close', on: { click: close } }, '✕');
  body.append(closeBtn);
  body.append(el('h3', { class: 'ev-modal-title' }, ev.title || 'Event'));
  if (ev.description) body.append(el('p', { class: 'ev-modal-desc' }, ev.description));

  if (ev.fields && ev.fields.length) {
    const fieldsWrap = el('div', { class: 'ev-modal-fields' });
    for (const f of ev.fields) {
      const field = el('div', { class: 'ev-field' + (f.copyable ? ' copyable' : '') });
      if (f.label) field.append(el('div', { class: 'ev-field-label' }, f.label));
      const valRow = el('div', { class: 'ev-field-value' }, f.value || '');
      if (f.copyable && f.value) {
        const hint = el('span', { class: 'ev-copy-hint' }, 'click to copy');
        valRow.append(hint);
        field.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(f.value); }
          catch {
            const ta = document.createElement('textarea'); ta.value = f.value; document.body.append(ta);
            ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
          }
          field.classList.add('copied');
          hint.textContent = 'copied!';
          setTimeout(() => { field.classList.remove('copied'); hint.textContent = 'click to copy'; }, 1400);
        });
      }
      field.append(valRow);
      fieldsWrap.append(field);
    }
    body.append(fieldsWrap);
  }

  body.append(el('button', { class: 'ev-modal-ok', on: { click: close } }, 'Got it'));
  card.append(body);
  root.append(card);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  root._disdrocClose = close;
  document.body.append(root);
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

async function loadPendingWarnings() {
  try {
    const { warnings } = await api('/api/me/warnings');
    if (!warnings) return;
    const pending = warnings.filter(w => !w.acknowledged);
    if (pending.length) showWarningModal(pending);
  } catch {}
}

function showWarningModal(warnings) {
  if (!Array.isArray(warnings)) warnings = [warnings];
  if (!warnings.length) return;
  // If one is already open, ignore duplicate triggers (modal listener will pick up backlog).
  if (document.querySelector('.warning-modal-root')) return;
  const root = document.createElement('div');
  root.className = 'warning-modal-root';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:grid;place-items:center;z-index:5000;padding:16px';
  const card = document.createElement('div');
  card.className = 'warning-modal';
  card.style.cssText = 'background:var(--bg-2);border:2px solid var(--warn);border-radius:12px;padding:24px;width:520px;max-width:100%;max-height:80vh;overflow:auto';
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin:14px 0';
  for (const w of warnings) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:12px;background:var(--bg-3);border-left:3px solid var(--warn);border-radius:6px';
    const date = new Date(w.created_at).toLocaleString();
    item.innerHTML = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">From <strong>${(w.admin_username || 'admin')}</strong> · ${date}</div>
      <div style="white-space:pre-wrap">${(w.reason || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])}</div>`;
    list.append(item);
  }
  card.innerHTML = `<h2 style="margin:0;color:var(--warn);display:flex;align-items:center;gap:8px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${warnings.length > 1 ? warnings.length + ' warnings' : 'Warning from staff'}</h2>
    <p class="muted" style="font-size:13px;margin:8px 0 0">Please read carefully. Repeated violations may lead to a ban.</p>`;
  card.append(list);
  const ackBtn = document.createElement('button');
  ackBtn.type = 'button';
  ackBtn.className = 'warn-btn';
  ackBtn.style.cssText = 'width:100%;padding:10px;font-size:14px';
  ackBtn.textContent = 'I understand';
  ackBtn.onclick = async () => {
    for (const w of warnings) {
      try { await api('/api/me/warnings/' + w.id + '/ack', { method: 'POST', body: '{}' }); } catch {}
    }
    animateOut(root);
  };
  card.append(ackBtn);
  root.append(card);
  document.body.append(root);
}

// ─── Wire-up ──────────────────────────────────────────────────────────────────

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  clearToken(); location.href = '/';
});
$('#newServerBtn').addEventListener('click', newServerModal);
{ const db2 = $('#discoverServersBtn'); if (db2) { db2.append(icon('globe', 22)); db2.addEventListener('click', discoverServersModal); } }
$('#profileBtn').addEventListener('click', editProfileModal);

window.addEventListener('focus', () => { closeFloatingMenus(); beatFocus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) closeFloatingMenus(); });

// A handful of self-contained dialogs intentionally live directly under body
// (some can open above a #modalRoot settings shell). Keep them in the same
// back-stack without forcing them into modalRoot and destroying that shell.
function closeTopBodyPopup() {
  const popups = [...document.body.children].filter((node) =>
    !node.classList.contains('anim-out') && (
      node.classList.contains('modal-bg') ||
      node.classList.contains('event-modal-root') ||
      node.classList.contains('warning-modal-root') ||
      node.classList.contains('standalone-modal-root') ||
      node.classList.contains('incoming-call')
    ));
  const popup = popups[popups.length - 1];
  if (!popup) return false;
  if (typeof popup._disdrocClose === 'function') popup._disdrocClose();
  else animateOut(popup);
  return true;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.fullscreenElement) return; // let the browser exit fullscreen first
  const lb = document.querySelector('.lightbox:not(.anim-out)');
  if (lb) { animateOut(lb); return; }
  // Menus/popovers sit on top of everything (incl. the call stage) — close first.
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  if (closeTopBodyPopup()) return;
  if (state.voice.stageOpen) { closeCallStage(); return; }
  const root = $('#modalRoot');
  if (root && [...root.children].some((n) => !n.classList.contains('anim-out'))) {
    closeModalRoot();
    // The generic wipe also takes the thread panel with it — keep state in sync
    // so incoming thread events don't target a detached container.
    if (state.threadPanel) state.threadPanel = null;
    return;
  }
  const app = document.getElementById('app');
  if (app.classList.contains('show-right')) { closeRightPanel(); return; }
  if (isMobileLayout() && closeMobileSearch()) return;
  if (isMobileLayout() && app.classList.contains('chat-open')) { showMobileRoot(); return; }
  if (isMobileLayout() && app.classList.contains('tab-screen')) {
    if (!handleMobileTabScreenBack()) returnFromMobileTabScreen();
    return;
  }
  if (app.classList.contains('show-sidebar')) { closeMobileSidebar(); return; }
});

// ─── Modal focus trap ──────────────────────────────────────────────────────
// Keyboard-only users could Tab straight out of an open modal onto whatever
// sits behind the overlay (e.g. Create Server → next Tab lands on Discover
// Servers). There are ~10 places across the file that build their own
// `.modal-bg` overlay rather than going through modal()/panelModal(), so
// instead of patching each one, this observes the two containers every one
// of them appends into and arms a trap on whatever `.modal-bg` shows up —
// new call sites get it for free.
function focusableEls(container) {
  return Array.from(container.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter((e) => e.offsetParent !== null);
}
function armModalFocusTrap(overlay) {
  const panel = overlay.firstElementChild;
  if (!panel) return;
  const items = focusableEls(panel);
  (items[0] || panel).focus?.();
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = focusableEls(panel);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
function watchForModals(container) {
  if (!container) return;
  new MutationObserver((muts) => {
    for (const m of muts) for (const node of m.addedNodes) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('modal-bg')) {
        setTimeout(() => armModalFocusTrap(node), 0);
      }
    }
  }).observe(container, { childList: true });
}
watchForModals(document.getElementById('modalRoot'));
watchForModals(document.body);

// Android hardware/gesture back — called by the native shell (MainActivity).
// Closes the topmost layer like Escape does and returns true; returns false
// only when there is nothing left to close, in which case the native side
// backgrounds the app (moveTaskToBack) instead of killing it.
window.disdrocBack = () => {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return true; }
  const lb = document.querySelector('.lightbox:not(.anim-out)');
  if (lb) { animateOut(lb); return true; }
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return true; }
  if (closeTopBodyPopup()) return true;
  // Two-pane settings modals (user settings, server settings) — on mobile,
  // step from the detail panel back to the nav list first, same as tapping
  // the in-panel back arrow, instead of closing the whole modal.
  const settingsShell = document.querySelector('#modalRoot .settings-shell.s-panel');
  if (settingsShell) { settingsShell.classList.replace('s-panel', 's-list'); return true; }
  const root = $('#modalRoot');
  if (root && root.firstChild) {
    root.innerHTML = '';
    if (state.threadPanel) state.threadPanel = null; // wiped with the rest of modalRoot
    return true;
  }
  if (state.voice.stageOpen) { closeCallStage(); return true; }
  const app = document.getElementById('app');
  if (app.classList.contains('show-right')) { closeRightPanel(); return true; }
  if (isMobileLayout() && closeMobileSearch()) return true;
  if (isMobileLayout() && app.classList.contains('chat-open')) { showMobileRoot(); return true; }
  if (isMobileLayout() && app.classList.contains('tab-screen')) {
    if (!handleMobileTabScreenBack()) returnFromMobileTabScreen();
    return true;
  }
  return false;
};
$('#messages').addEventListener('click', (e) => {
  const blurred = e.target.closest('.inline-gif.media-blur');
  if (blurred) { e.preventDefault(); blurred.classList.remove('media-blur'); return; }
  const ce = e.target.closest('img.custom-emoji[data-emoji-path]');
  if (ce) { e.preventDefault(); emojiInfoModal(ce.dataset.emojiPath); return; }
  const men = e.target.closest('.mention[data-mention]');
  if (men) { e.preventDefault(); openProfile(men.dataset.mention); return; }
  const yt = e.target.closest('.yt-embed[data-yt]');
  if (yt && !yt.classList.contains('playing')) {
    e.preventDefault();
    const id = yt.dataset.yt;
    yt.classList.add('playing');
    yt.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    return;
  }
  const gif = e.target.closest('.inline-gif:not(.media-blur)');
  if (gif && e.target.tagName === 'IMG') { e.preventDefault(); openLightbox(e.target.getAttribute('src')); return; }
  const sp = e.target.closest('.spoiler');
  if (sp && !sp.classList.contains('revealed')) sp.classList.add('revealed');
});
$('#messages').addEventListener('scroll', () => {
  if ($('#messages').scrollTop < 80) loadOlderMessages();
  updateJumpBottom();
});
function updateJumpBottom() {
  const m = $('#messages'), jb = $('#jumpBottom');
  if (!m || !jb) return;
  // In a centred history window the live tail is always "below", so keep the
  // jump-to-present bar visible regardless of scroll position.
  if (state.viewingHistory) { jb.classList.add('is-visible'); return; }
  jb.classList.toggle('is-visible', m.scrollHeight - m.scrollTop - m.clientHeight > 240);
}
$('#jumpBottom').addEventListener('click', () => {
  if (state.viewingHistory) jumpToPresent();
  else pinToBottom(800);
});

// ─── Hidden brand easter egg: a spark shockwave from screen centre, found by
// either the Konami code or clicking the settings version number 7 times —
// no slash command, no visible hint. ───────────────────────────────────────
function partyToast(text) {
  const t = el('div', { class: 'egg-toast' }, text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function sparkShockwave() {
  const ring1 = el('div', { class: 'egg-shock' });
  const ring2 = el('div', { class: 'egg-shock egg-shock-2' });
  document.body.appendChild(ring1);
  document.body.appendChild(ring2);
  setTimeout(() => ring1.remove(), 950);
  setTimeout(() => ring2.remove(), 1150);
  const colors = ['#5865f2', '#00a8fc', '#ffd25c', '#c05cff'];
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const dist = 140 + Math.random() * 220;
    const p = el('div', { class: 'egg-spark' });
    p.style.left = '50vw'; p.style.top = '50vh';
    const col = colors[Math.floor(Math.random() * colors.length)];
    p.style.color = col; p.style.background = col;
    p.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
    p.style.setProperty('--dy', (Math.sin(ang) * dist) + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
  partyToast('⚡ you found the disdroc easter egg');
}
// Celebratory emoji in a message that just arrived in the open chat fires an
// Konami code (↑↑↓↓←→←→ B A) → spark shockwave. Ignored while typing so
// composing a message with arrow-key cursor moves can't false-trigger it.
(function () {
  const SEQ = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
  let pos = 0;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    const k = (e.key || '').toLowerCase();
    pos = (k === SEQ[pos]) ? pos + 1 : (k === SEQ[0] ? 1 : 0);
    if (pos === SEQ.length) { pos = 0; sparkShockwave(); }
  });
})();

// Fullscreen image viewer for inline images/GIFs.
function openLightbox(src) {
  if (!src) return;
  const ov = el('div', { class: 'lightbox' });
  const close = () => animateOut(ov);
  ov.append(
    el('img', { src, on: { click: (e) => e.stopPropagation() } }),
    el('button', { class: 'lightbox-close', title: 'Close (Esc)', on: { click: close } }, '✕'),
  );
  ov.addEventListener('click', close);
  document.body.append(ov);
}

$('#sidebarToggle').addEventListener('click', () => {
  const app = document.getElementById('app');
  if (isMobileLayout()) {
    if (app.classList.contains('chat-open')) showMobileRoot();
  } else {
    app.classList.toggle('no-sidebar');
  }
});
$('#sidebarScrim').addEventListener('click', closeMobileSidebar);

// Phones: an edge swipe right from a pushed conversation returns to its list.
(function setupSwipeNav() {
  let sx = 0, sy = 0, edge = false, live = false;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { live = false; return; }
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; edge = sx < 30; live = true;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!live) return; live = false;
    if (!isMobileLayout()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 56 || Math.abs(dy) > Math.abs(dx)) return;
    const app = document.getElementById('app');
    if (dx <= 0 || !edge) return;
    if (document.querySelector('#modalRoot .modal-bg, .lightbox, .floating-menu')) return;
    if (app.classList.contains('show-right')) { closeRightPanel(); return; }
    if (app.classList.contains('chat-open')) { showMobileRoot(); return; }
    // Tab screens (You, a settings section, Friends, the inbox) are pushed the
    // same way a conversation is, so the same swipe should back out of them.
    if (app.classList.contains('tab-screen')) {
      if (!handleMobileTabScreenBack()) returnFromMobileTabScreen();
    }
  }, { passive: true });
})();
$('#rightScrim').addEventListener('click', closeRightPanel);

// ─── Block users ──────────────────────────────────────────────────────────────

async function loadBlocked() {
  try {
    const r = await api('/api/blocked');
    state.blockedIds = new Set(r.blocked.map(b => b.id));
    state.blockedList = r.blocked;
  } catch { state.blockedIds = new Set(); state.blockedList = []; }
}
async function blockUser(userId, username) {
  if (!(await confirmModal(`Block @${username || userId}? You won't see their messages.`))) return;
  try {
    await api('/api/users/' + userId + '/block', { method: 'POST' });
    state.blockedIds.add(userId);
    // Re-render visible messages
    for (const node of document.querySelectorAll('.msg')) {
      const id = +node.dataset.id;
      if (!id) continue;
      // we can't easily replay; just hide
      // Simpler: reload current chat
    }
    if (state.activeChatId) openChat(state.activeChatId, state.chats.find(c => c.id === state.activeChatId));
  } catch (e) { alert('Block failed: ' + e.message); }
}
async function unblockUser(userId) {
  try {
    await api('/api/users/' + userId + '/block', { method: 'DELETE' });
    state.blockedIds.delete(userId);
    await loadBlocked();
  } catch (e) { alert('Unblock failed: ' + e.message); }
}

// ─── Saved messages ───────────────────────────────────────────────────────────

async function toggleSaveMessage(m) {
  const isSaved = state.savedIds.has(m.id);
  if (isSaved) {
    await api(`/api/messages/${m.id}/save`, { method: 'DELETE' });
    state.savedIds.delete(m.id);
  } else {
    await api(`/api/messages/${m.id}/save`, { method: 'POST' });
    state.savedIds.add(m.id);
  }
  // Update bookmark indicator on the message node
  const node = document.querySelector(`#messages .msg[data-id="${m.id}"]`);
  if (node) {
    node.querySelector('.saved-indicator')?.remove();
    if (state.savedIds.has(m.id)) {
      const ind = el('span', { class: 'saved-indicator', title: 'Saved' }, icon('bookmark-check', 12));
      node.querySelector('.head')?.append(ind);
    }
  }
}

async function openSavedMessages() {
  state.view_saved = true;
  document.getElementById('mainContent').style.display = 'none';
  renderSidebar();
  const panel = $('#mainPanel') || $('#friendsPanel');
  const target = document.getElementById('friendsPanel');
  if (!target) return;
  target.style.display = 'flex';
  target.innerHTML = '';

  const hd = el('div', { class: 'tab-row friends-tabs' }, [
    el('span', { class: 'friends-hd' }, [el('span', { class: 'fh-icon' }, icon('bookmark', 18)), t('saved.title', 'Kaydedilen Mesajlar')]),
  ]);
  target.append(hd);

  const body = el('div', { class: 'saved-msgs-body' });
  target.append(body);
  body.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Loading…</div>';

  const r = await api('/api/saved');
  const saved = r?.saved || [];
  body.innerHTML = '';

  if (!saved.length) {
    body.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-icon' }, icon('bookmark', 40)),
      el('p', {}, t('saved.empty', 'Henüz kaydedilen mesaj yok. Kaydetmek için herhangi bir mesaja sağ tıklayın.')),
    ]));
    return;
  }

  for (const m of saved) {
    const chatLabel = m.chat_type === 'dm' ? `DM`
      : m.chat_type === 'group' ? (m.chat_name || 'Group')
      : m.chat_type === 'channel' ? `#${m.chat_name}${m.server_name ? ' · ' + m.server_name : ''}`
      : (m.chat_name || 'Chat');

    const msgEl = el('div', { class: 'saved-msg-item' }, [
      el('div', { class: 'saved-msg-meta' }, [
        avatarEl(m, 'small'),
        el('div', { class: 'saved-msg-info' }, [
          el('span', { class: 'saved-msg-author' }, userLabel(m)),
          el('span', { class: 'saved-msg-chat' }, chatLabel),
          el('span', { class: 'saved-msg-time' }, new Date(m.created_at).toLocaleString()),
        ]),
        el('button', {
          class: 'ghost saved-unsave-btn', title: 'Unsave',
          on: { click: async () => {
            await api(`/api/messages/${m.id}/save`, { method: 'DELETE' });
            state.savedIds.delete(m.id);
            msgEl.remove();
            if (!body.children.length) {
              body.append(el('div', { class: 'empty-state' }, [
                el('div', { class: 'empty-icon' }, icon('bookmark', 40)),
                el('p', {}, t('saved.empty')),
              ]));
            }
          }},
        }, icon('trash', 14)),
      ]),
      el('div', { class: 'saved-msg-content' }, (() => {
        const t2 = el('div', { class: 'text' });
        setMessageText(t2, m.content, m.deleted);
        return t2;
      })()),
      m.attachments?.length ? renderAttachments(m.attachments) : null,
    ]);
    body.append(msgEl);
  }
}

// ─── Forward message ──────────────────────────────────────────────────────────

function forwardMessageDialog(m) {
  const errBox = el('div', { class: 'error' });
  const candidates = [];
  for (const c of state.chats) {
    if (c.type === 'dm') {
      const name = (c.other && (c.other.display_name || c.other.username))
        || (c.members || '').split(',').filter(u => u && u !== state.me.username)[0]
        || '(you)';
      candidates.push({ id: c.id, label: '@ ' + name, type: 'dm' });
    } else if (c.type === 'group') {
      candidates.push({ id: c.id, label: '# ' + (c.name || 'group'), type: 'group' });
    }
  }
  for (const s of state.servers) {
    candidates.push({ id: null, label: '— ' + s.name + ' —', divider: true });
  }
  const select = el('select', {}, candidates.map(c =>
    c.divider ? el('option', { disabled: true }, c.label) : el('option', { value: c.id }, c.label)
  ));
  modal({
    title: 'Forward message',
    content: el('div', {}, [
      el('div', { class: 'forwarded-preview' }, [
        el('div', { style: 'color:var(--muted);font-size:12px' }, 'Forwarding from @' + (m.username || '?')),
        el('div', { class: 'fp-text' }, (m.content || '').slice(0, 160) || '(attachment)'),
      ]),
      el('label', {}, 'Send to'),
      select,
      errBox,
    ]),
    submitLabel: 'Forward',
    onSubmit: () => {
      const id = +select.value;
      if (!id) { errBox.textContent = 'Pick a destination'; return false; }
      state.socket.emit('message:send', {
        chatId: id, content: m.content || '', forwardedFromId: m.id, attachmentIds: [],
      });
    },
  });
}

// ─── Voice notes ──────────────────────────────────────────────────────────────

let voiceNoteRec = null;
let voiceNoteChunks = [];
let voiceNoteStart = 0;
let voiceNoteTimer = null;
let voiceNoteCanceled = false;

async function startVoiceNote() {
  if (voiceNoteRec) return stopVoiceNote(true);
  if (!navigator.mediaDevices || !window.MediaRecorder) { alert('Voice notes need a modern browser.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '');
    voiceNoteRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    voiceNoteChunks = [];
    voiceNoteCanceled = false;
    voiceNoteStart = Date.now();
    voiceNoteRec.ondataavailable = (e) => { if (e.data && e.data.size) voiceNoteChunks.push(e.data); };
    voiceNoteRec.onstop = async () => {
      for (const t of stream.getTracks()) t.stop();
      const wasCanceled = voiceNoteCanceled;
      const chunks = voiceNoteChunks;
      const recMime = voiceNoteRec ? voiceNoteRec.mimeType : 'audio/webm';
      voiceNoteRec = null;
      voiceNoteChunks = [];
      clearInterval(voiceNoteTimer); voiceNoteTimer = null;
      renderVoiceNoteIndicator();
      if (wasCanceled) return;
      const blob = new Blob(chunks, { type: recMime || 'audio/webm' });
      if (blob.size < 1024) return;
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `voicenote-${Date.now()}.${ext}`, { type: blob.type });
      const a = await uploadFile(file);
      if (a) {
        state.socket.emit('message:send', {
          chatId: state.activeChatId, content: '', attachmentIds: [a.id],
        });
      }
    };
    voiceNoteRec.start();
    voiceNoteTimer = setInterval(renderVoiceNoteIndicator, 250);
    renderVoiceNoteIndicator();
  } catch (e) { alert('Cannot record: ' + e.message); voiceNoteRec = null; }
}
function stopVoiceNote(send = true) {
  if (!voiceNoteRec) return;
  voiceNoteCanceled = !send;
  try { voiceNoteRec.stop(); } catch {}
}
function renderVoiceNoteIndicator() {
  // Recording starts from the composer "+" menu; the standalone mic button no
  // longer exists on desktop, so the button handling below is null-tolerant.
  const ind = $('#voiceNoteIndicator');
  const btn = $('#voiceNoteBtn');
  if (!ind) return;
  if (voiceNoteRec) {
    if (btn) { btn.classList.add('recording'); btn.textContent = '⏹'; btn.title = 'Stop and send'; }
    const sec = Math.floor((Date.now() - voiceNoteStart) / 1000);
    ind.innerHTML = '';
    ind.append(
      el('span', { class: 'vn-dot' }, '●'),
      el('span', { class: 'vn-timer' }, `Recording ${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`),
      el('button', { type: 'button', class: 'cancel-vn', on: { click: () => stopVoiceNote(false) } }, '✕ Cancel'),
      el('button', { type: 'button', class: 'send-vn', on: { click: () => stopVoiceNote(true) } }, 'Send ▶'),
    );
    ind.style.display = 'flex';
  } else {
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙'; btn.title = 'Voice note'; }
    ind.innerHTML = ''; ind.style.display = 'none';
  }
}

// ─── GIF picker (Tenor) ───────────────────────────────────────────────────────

async function openGifPicker(initialQuery, onPick) {
  // onPick: when set, the chosen GIF URL goes to the callback (banner picker)
  // instead of being sent to the active chat.
  const errBox = el('div', { class: 'error' });
  const input = el('input', { placeholder: 'Search GIFs…', autocomplete: 'off', value: initialQuery || '' });
  const grid = el('div', { class: 'gif-grid' });
  async function search(q) {
    grid.innerHTML = '';
    grid.append(el('div', { class: 'muted-text' }, 'Loading…'));
    try {
      const r = await fetch('/api/giphy/search?q=' + encodeURIComponent(q || ''), { credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
      const j = await r.json();
      if (!r.ok || (j.meta && j.meta.status && j.meta.status >= 400)) {
        grid.innerHTML = '';
        errBox.textContent = j.error === 'giphy_not_configured' ? 'GIFs are not configured on this server.' : ('Giphy error: ' + (j.meta && j.meta.msg || j.error || r.status));
        return;
      }
      grid.innerHTML = '';
      for (const g of (j.data || [])) {
        const tiny = g.images && (g.images.fixed_width_small || g.images.fixed_width);
        const full = g.images && (g.images.downsized_medium || g.images.original);
        if (!tiny || !full) continue;
        grid.append(el('button', {
          type: 'button', class: 'gif-item',
          on: { click: () => { closeModalRoot(); if (onPick) onPick(full.url); else sendGifAttachment(full.url); } },
        }, el('img', { src: tiny.url, loading: 'lazy' })));
      }
      if (!grid.children.length) grid.append(el('div', { class: 'muted-text' }, 'No results'));
    } catch (e) { errBox.textContent = 'GIF search failed: ' + e.message; }
  }
  modal({
    title: 'GIF picker',
    wide: true,
    content: el('div', {}, [input, errBox, grid]),
    submitLabel: 'Close',
    onSubmit: () => {},
  });
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value.trim()), 250); });
  search(initialQuery || '');
}
async function sendGifAttachment(url) {
  if (!state.activeChatId) return;
  state.socket.emit('message:send', {
    chatId: state.activeChatId, content: url, attachmentIds: [],
  });
}

// ─── Custom emoji picker ──────────────────────────────────────────────────────

// Loads every custom emoji from every server the user is a member of (not just
// whichever server happens to be open) so the picker/autocomplete can offer all
// of them, grouped by server so it's clear where each one comes from.
async function loadMyEmojis() {
  try {
    const r = await api('/api/emojis/mine');
    state.myEmojiGroups = r.groups || [];
  } catch { state.myEmojiGroups = []; }
  const flat = [];
  for (const g of state.myEmojiGroups) {
    for (const e of g.emojis) flat.push({ ...e, server_id: g.server.id, server_name: g.server.name, server_icon: g.server.icon_path });
  }
  state.myEmojis = flat;
}

// Build a searchable, categorized emoji picker. onPick gets {char} or {custom,name,path}.
// Custom emoji are grouped under a header per server (icon + name) so it's always
// clear where each one comes from — you have emoji from every server you're in here,
// not just whichever one is currently open.
function buildEmojiPicker(onPick) {
  const wrap = el('div', { class: 'emoji-pop' });
  const search = el('input', { class: 'emoji-search', placeholder: 'Search emoji…', autocomplete: 'off', spellcheck: 'false' });
  const body = el('div', { class: 'emoji-body' });
  const emojiBtn = (char, title) => el('button', { type: 'button', class: 'emoji', title, on: { click: () => onPick({ char }) } }, char);
  const customBtn = (e) => el('button', { type: 'button', class: 'emoji custom', title: ':' + e.name + ':', on: { click: () => onPick({ custom: true, name: e.name, path: e.stored_path }) } }, el('img', { src: '/api/emoji/' + e.stored_path, alt: e.name, loading: 'lazy' }));
  const serverHeader = (server) => el('div', { class: 'emoji-cat-h emoji-cat-h-server' }, [
    server.icon_path
      ? el('img', { class: 'emoji-cat-h-icon', src: '/api/server-icon/' + server.icon_path, alt: '' })
      : el('span', { class: 'emoji-cat-h-icon emoji-cat-h-icon-ph' }, initials(server.name)),
    el('span', {}, server.name),
  ]);
  function render(q) {
    q = (q || '').trim().toLowerCase();
    body.innerHTML = '';
    for (const g of (state.myEmojiGroups || [])) {
      const items = g.emojis.filter(e => !q || (e.name || '').toLowerCase().includes(q));
      if (!items.length) continue;
      body.append(serverHeader(g.server));
      const grid = el('div', { class: 'emoji-grid emoji-grid-custom' });
      items.forEach(e => grid.append(customBtn(e)));
      body.append(grid);
    }
    for (const cat of EMOJI_CATEGORIES) {
      const items = cat.emojis.filter(([ch, kw]) => !q || kw.includes(q) || ch === q);
      if (!items.length) continue;
      body.append(el('div', { class: 'emoji-cat-h' }, cat.name));
      const g = el('div', { class: 'emoji-grid' });
      items.forEach(([ch, kw]) => g.append(emojiBtn(ch, kw.split(' ')[0])));
      body.append(g);
    }
    if (!body.children.length) body.append(el('div', { class: 'emoji-empty' }, 'No emoji found'));
  }
  search.addEventListener('input', () => render(search.value));
  wrap.append(search, body);
  render('');
  return { wrap, search };
}

// Open the picker as a floating menu near `anchor`. closeOnPick=true for reactions.
function openFloatingPicker(anchor, onPick, closeOnPick) {
  closeFloatingMenus();
  const menu = el('div', { class: 'floating-menu emoji-picker-v2' });
  function close() { animateOut(menu, 180); }
  const { wrap, search } = buildEmojiPicker((e) => { onPick(e); if (closeOnPick) close(); });
  menu.append(wrap);
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
  setTimeout(() => search.focus(), 0);
}

function openEmojiPicker(anchor) {
  openFloatingPicker(anchor, (e) => {
    insertAtCaret($('#msgInput'), e.custom ? `<:${e.name}:${e.path}> ` : e.char);
  }, false);
}
function insertAtCaret(input, text) {
  if (!input) return;
  const s = input.selectionStart, e = input.selectionEnd;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  input.selectionStart = input.selectionEnd = s + text.length;
  input.focus();
}

// Clicking a custom emoji anywhere in a message — including ones from a server
// you're not a member of — shows where it came from, with a one-click Join if
// that server has been made public (see Discover Servers).
async function emojiInfoModal(path) {
  const root = $('#modalRoot');
  const close = () => { closeModalRoot(); };
  root.innerHTML = '';
  const card = el('div', { class: 'modal emoji-info-modal' }, [el('p', { class: 'muted-text' }, 'Loading…')]);
  root.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, card));
  let info;
  try { info = await api('/api/emoji/' + encodeURIComponent(path) + '/info'); }
  catch {
    card.innerHTML = '';
    card.append(el('p', { class: 'error' }, 'Could not load this emoji.'),
      el('div', { class: 'row' }, [el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Close')]));
    return;
  }
  const { emoji, server, isMember } = info;
  card.innerHTML = '';
  card.append(
    server.banner_path ? el('img', { class: 'ei-banner', src: '/api/server-banner/' + server.banner_path, alt: '' }) : null,
    el('div', { class: 'ei-head' }, [
      el('img', { class: 'ei-emoji', src: '/api/emoji/' + emoji.stored_path, alt: emoji.name }),
      el('div', {}, [
        el('div', { class: 'ei-name' }, ':' + emoji.name + ':'),
        el('div', { class: 'muted-text' }, 'Custom emoji'),
      ]),
    ]),
    el('div', { class: 'ei-server' }, [
      server.icon_path
        ? el('img', { class: 'ei-server-icon', src: '/api/server-icon/' + server.icon_path, alt: '' })
        : el('span', { class: 'ei-server-icon ei-server-icon-ph' }, initials(server.name)),
      el('div', {}, [
        el('div', { class: 'ei-server-name' }, server.name),
        el('div', { class: 'muted-text', style: 'font-size:12px' },
          `${server.member_count} member${server.member_count === 1 ? '' : 's'} · ${server.is_public ? 'Public server' : 'Private server'}`),
      ]),
    ]),
    server.description ? el('p', { class: 'ei-desc' }, server.description) : null,
    el('div', { class: 'row', style: 'margin-top:14px' }, [
      el('button', { type: 'button', class: 'ghost', on: { click: close } }, 'Close'),
      isMember
        ? el('button', { type: 'button', on: { click: () => { close(); switchToServer(server.id); } } }, 'Go to server')
        : (server.is_public ? el('button', { type: 'button', on: { click: async (ev) => {
            ev.currentTarget.disabled = true;
            try {
              await api('/api/servers/' + server.id + '/join', { method: 'POST' });
              await loadServers(); renderServerRail(); loadMyEmojis().catch(() => {});
              close(); switchToServer(server.id);
            } catch (e2) { alert(e2.message); ev.currentTarget.disabled = false; }
          } } }, 'Join Server') : null),
    ]),
  );
}

// ─── Composer autocomplete (@mentions + :emoji:) ──────────────────────────────
let _ac = null; // { mode, start, items, index, box }
function closeAutocomplete() { if (_ac && _ac.box) _ac.box.remove(); _ac = null; }

function mentionCandidates(query) {
  const q = query.toLowerCase();
  const seen = new Set(); const out = [];
  // Role mentions first (server view only): @everyone if you may ping it, plus any
  // role that's mentionable (or all roles if you can Manage Roles).
  if (state.view === 'server' && state.serverDetail && state.serverDetail.roles) {
    if ('everyone'.startsWith(q) && iHaveServerPerm(SP.MENTION_EVERYONE)) out.push({ roleMention: true, everyone: true, name: 'everyone' });
    for (const r of state.serverDetail.roles) {
      if (r.is_default || !r.name) continue;
      if (!(r.mentionable || iHaveServerPerm(SP.MANAGE_ROLES))) continue;
      if (q && !r.name.toLowerCase().startsWith(q)) continue;
      out.push({ roleMention: true, id: r.id, name: r.name, color: r.color });
    }
  }
  const add = (u) => {
    if (!u || !u.username || seen.has(u.username) || u.username === state.me.username) return;
    if (q && !u.username.toLowerCase().startsWith(q) && !((u.display_name || '').toLowerCase().startsWith(q))) return;
    seen.add(u.username); out.push(u);
  };
  if (state.view === 'server' && state.serverDetail) {
    for (const m of state.serverDetail.members) add(m);
  } else {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat && chat.members) for (const uname of chat.members.split(',')) add(state.friends.find(x => x.username === uname) || { username: uname });
    for (const f of state.friends) if (f.status === 'accepted') add(f);
  }
  return out.slice(0, 8);
}

function emojiCandidates(query) {
  const q = query.toLowerCase();
  const out = [];
  for (const e of (state.myEmojis || [])) if (e.name && e.name.toLowerCase().startsWith(q)) out.push({ custom: true, name: e.name, path: e.stored_path, serverName: e.server_name });
  for (const name of Object.keys(SHORTCODE_EMOJI)) {
    if (name.startsWith(q)) out.push({ name, char: SHORTCODE_EMOJI[name] });
    if (out.length >= 10) break;
  }
  return out.slice(0, 8);
}

function updateAutocomplete() {
  const input = $('#msgInput');
  if (!input || document.activeElement !== input) { closeAutocomplete(); return; }
  const caret = input.selectionStart;
  const before = input.value.slice(0, caret);
  // Slash commands: only at the very start of the message.
  const sm = before.match(/^\/(\w*)$/);
  if (sm) {
    // Built-ins first, then bot-registered commands for the active server (if any).
    const botCmds = (state.view === 'server' && state.serverDetail && state.serverDetail.botCommands) || [];
    const all = SLASH_COMMANDS.concat(botCmds);
    const items = all.filter(c => c.name.startsWith(sm[1].toLowerCase())).map(c => ({ slash: true, name: c.name, desc: c.description || c.desc }));
    if (items.length) return openAutocomplete('slash', 0, items);
    closeAutocomplete(); return;
  }
  const mm = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  const em = before.match(/(?:^|\s):([a-z0-9_+-]{1,})$/i);
  if (mm) {
    const start = caret - mm[1].length - 1;
    const items = mentionCandidates(mm[1]);
    if (items.length) openAutocomplete('mention', start, items); else closeAutocomplete();
    // Also search the server so users not in our local cache (e.g. someone who
    // joined after we loaded, or a non-friend) still turn up.
    if (mm[1].length >= 1) searchMentionUsers(mm[1], start);
    return;
  }
  if (em) { const items = emojiCandidates(em[1].toLowerCase()); if (items.length) return openAutocomplete('emoji', caret - em[1].length - 1, items); }
  closeAutocomplete();
}

let _mentionSeq = 0;
async function searchMentionUsers(query, start) {
  const seq = ++_mentionSeq;
  let users = [];
  try { const r = await api('/api/users/search?q=' + encodeURIComponent(query)); users = (r && r.users) || []; }
  catch { return; }
  if (seq !== _mentionSeq) return;                       // a newer keystroke superseded us
  const input = $('#msgInput');
  if (!input || document.activeElement !== input) return;
  const before = input.value.slice(0, input.selectionStart);
  const mm = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (!mm || mm[1] !== query) return;                    // the @query changed while we waited
  const merged = mentionCandidates(query);
  const seen = new Set(merged.map(u => u.username));
  for (const u of users) {
    if (!u.username || u.username === state.me.username || seen.has(u.username)) continue;
    seen.add(u.username); merged.push(u);
  }
  const items = merged.slice(0, 8);
  if (items.length) openAutocomplete('mention', start, items); else closeAutocomplete();
}

function openAutocomplete(mode, start, items) {
  const keep = (_ac && _ac.mode === mode) ? Math.min(_ac.index, items.length - 1) : 0;
  closeAutocomplete();
  const box = el('div', { class: 'ac-pop' });
  _ac = { mode, start, items, index: keep < 0 ? 0 : keep, box };
  paintAutocomplete();
  const r = $('#msgInput').getBoundingClientRect();
  box.style.left = r.left + 'px';
  box.style.width = Math.min(Math.max(r.width, 220), 380) + 'px';
  box.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  document.body.append(box);
}

function paintAutocomplete() {
  if (!_ac) return;
  const box = _ac.box; box.innerHTML = '';
  box.append(el('div', { class: 'ac-head' }, _ac.mode === 'mention' ? 'MEMBERS' : _ac.mode === 'slash' ? 'COMMANDS' : 'EMOJI'));
  _ac.items.forEach((it, i) => {
    let left, label;
    if (_ac.mode === 'slash') { left = el('span', { class: 'ac-slash' }, '/'); label = el('span', {}, [el('strong', {}, it.name), el('span', { class: 'muted-text', style: 'margin-left:8px;font-size:12px' }, it.desc)]); }
    else if (_ac.mode === 'mention' && it.roleMention) { left = el('span', { class: 'ac-role-dot', style: 'background:' + (it.color || 'var(--accent)') }); label = '@' + it.name; }
    else if (_ac.mode === 'mention') { left = avatarEl(it, 'small'); label = (it.display_name ? it.display_name + '  ' : '') + '@' + it.username; }
    else if (it.custom) {
      left = el('img', { class: 'ac-emoji-img', src: '/api/emoji/' + it.path });
      label = el('span', {}, [':' + it.name + ':', it.serverName ? el('span', { class: 'muted-text', style: 'margin-left:8px;font-size:12px' }, it.serverName) : null]);
    }
    else { left = el('span', { class: 'ac-emoji-char' }, it.char); label = ':' + it.name + ':'; }
    box.append(el('div', { class: 'ac-item' + (i === _ac.index ? ' active' : ''), on: {
      mousedown: (e) => { e.preventDefault(); acceptAutocomplete(i); },
      mouseenter: () => { _ac.index = i; paintAutocomplete(); },
    } }, [left, el('span', { class: 'ac-label' }, label)]));
  });
}

function acceptAutocomplete(i) {
  if (!_ac) return;
  const it = _ac.items[i != null ? i : _ac.index];
  const input = $('#msgInput');
  if (!it) { closeAutocomplete(); return; }
  const caret = input.selectionStart, val = input.value;
  const rep = _ac.mode === 'slash'
    ? '/' + it.name + ' '
    : _ac.mode === 'mention'
      ? '@' + (it.roleMention ? it.name : it.username) + ' '
      : (it.custom ? `<:${it.name}:${it.path}> ` : it.char + ' ');
  input.value = val.slice(0, _ac.start) + rep + val.slice(caret);
  input.selectionStart = input.selectionEnd = _ac.start + rep.length;
  closeAutocomplete();
  input.focus();
}

// ─── Inline message editing ───────────────────────────────────────────────────
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; }
// Walk to the previous (-1) / next (+1) of your own non-deleted messages, so
// ArrowUp/Down inside an edit box hops between them (Discord-style) instead of
// scrolling the page.
function adjacentOwnMessage(node, dir) {
  const mine = [...document.querySelectorAll(`#messages .msg[data-uid="${state.me.id}"]:not(.deleted)`)];
  const i = mine.indexOf(node);
  if (i === -1) return null;
  return mine[i + dir] || null;
}

function startInlineEdit(node, id, content) {
  if (!node) return;
  const textEl = node.querySelector('.text');
  if (!textEl) return;
  // Already editing this message — focus the open box instead of bailing
  // silently (a silent no-op feels like the Edit click did nothing).
  const open = node.querySelector('.edit-wrap');
  if (open) { open.querySelector('.edit-box')?.focus(); return; }
  const box = el('textarea', { class: 'edit-box', rows: 1 }, content || '');
  const wrap = el('div', { class: 'edit-wrap' }, [box, el('div', { class: 'edit-hint' }, 'escape to cancel • enter to save')]);
  textEl.style.display = 'none';
  textEl.after(wrap);
  box.focus(); box.setSelectionRange((content || '').length, (content || '').length); autoGrow(box);
  const cancel = () => { wrap.remove(); textEl.style.display = ''; };
  const save = () => { const v = convertShortcodes(box.value.trim()); if (v && v !== content) state.socket.emit('message:edit', { messageId: id, content: v }); cancel(); };
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    // ArrowUp at the very start → edit the message above. ArrowDown at the very
    // end → edit the one below, or exit to the composer if this is the last.
    // Only fires on a collapsed caret at the boundary, so normal multi-line
    // cursor movement is untouched — and the page never scrolls.
    if (e.key === 'ArrowUp' && box.selectionStart === 0 && box.selectionEnd === 0) {
      const prev = adjacentOwnMessage(node, -1);
      if (prev) { e.preventDefault(); cancel(); startInlineEdit(prev, +prev.dataset.id, prev._raw || ''); }
    } else if (e.key === 'ArrowDown' && box.selectionStart === box.value.length && box.selectionEnd === box.value.length) {
      const next = adjacentOwnMessage(node, 1);
      e.preventDefault(); cancel();
      if (next) startInlineEdit(next, +next.dataset.id, next._raw || '');
      else document.getElementById('msgInput')?.focus();
    }
  });
  box.addEventListener('input', () => autoGrow(box));
}

// ─── Status / Idle detection ─────────────────────────────────────────────────

let idleTimer = null;
let currentStatus = 'online';
// Announce that this device is actively focused so your *other* devices stay quiet
// (see presence:focus-elsewhere). Throttled; safe to call often.
let _lastFocusBeat = 0;
function beatFocus() {
  if (!state.socket || !state.socket.connected) return;
  if (document.hidden || !document.hasFocus()) return;
  const now = Date.now();
  if (now - _lastFocusBeat < 12000) return;
  _lastFocusBeat = now;
  try { state.socket.emit('presence:focus'); } catch {}
}

function bumpIdle() {
  clearTimeout(idleTimer);
  if (currentStatus !== 'online' && currentStatus !== 'idle') return;
  if (currentStatus === 'idle') setStatus('online');
  idleTimer = setTimeout(() => setStatus('idle'), 5 * 60 * 1000);
}
async function setStatus(type, text, emoji) {
  currentStatus = type;
  try { await api('/api/me/status', { method: 'PATCH', body: JSON.stringify({ type, text: text || null, emoji: emoji || null }) }); } catch {}
}

// ─── Quick switcher (Ctrl+K) ──────────────────────────────────────────────────

function openQuickSwitcher() {
  if ($('#qsModal')) return;
  const items = [];
  for (const c of state.chats) {
    if (c.type === 'dm') {
      const name = (c.other && (c.other.display_name || c.other.username))
        || (c.members || '').split(',').filter(u => u && u !== state.me.username)[0]
        || '?';
      items.push({ kind: 'dm', id: c.id, label: '@ ' + name, sub: 'DM', go: () => openChat(c.id, c) });
    } else if (c.type === 'group') {
      items.push({ kind: 'group', id: c.id, label: '# ' + (c.name || 'group'), sub: 'Group', go: () => openChat(c.id, c) });
    }
  }
  for (const s of state.servers) {
    items.push({ kind: 'server', id: s.id, label: s.name, sub: 'Server', go: () => switchToServer(s.id) });
  }
  for (const f of state.friends) {
    if (f.status === 'accepted') items.push({ kind: 'friend', id: f.id, label: userLabel(f), sub: 'Friend', go: () => openDm(f.username) });
  }
  const root = $('#modalRoot');
  const input = el('input', { class: 'qs-input', placeholder: 'Jump to channel, DM, server, friend…', autocomplete: 'off' });
  const list = el('div', { class: 'qs-list' });
  let cursor = 0;
  function render(filter) {
    list.innerHTML = '';
    const lc = filter.toLowerCase();
    const filtered = lc ? items.filter(it => it.label.toLowerCase().includes(lc) || it.sub.toLowerCase().includes(lc)) : items;
    cursor = Math.min(cursor, filtered.length - 1);
    filtered.slice(0, 12).forEach((it, i) => {
      list.append(el('div', {
        class: 'qs-item' + (i === cursor ? ' active' : ''),
        on: { click: () => { close(); it.go(); } },
      }, [el('span', { class: 'qs-label' }, it.label), el('span', { class: 'qs-sub' }, it.sub)]));
    });
    list._filtered = filtered.slice(0, 12);
  }
  function close() { closeModalRoot(); }
  const bg = el('div', { class: 'modal-bg qs-bg', id: 'qsModal', on: { click: (e) => { if (e.target === bg) close(); } } });
  bg.append(el('div', { class: 'qs-panel' }, [input, list]));
  root.append(bg);
  input.addEventListener('input', () => render(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { cursor = Math.min((list._filtered||[]).length - 1, cursor + 1); render(input.value.trim()); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cursor = Math.max(0, cursor - 1); render(input.value.trim()); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = (list._filtered||[])[cursor]; if (it) { close(); it.go(); } e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
  });
  render('');
  setTimeout(() => input.focus(), 0);
}

// ─── Settings modal (sessions, password, TOTP, delete, blocks) ────────────────

// ─── Mic / camera test (settings) ─────────────────────────────────────────────
let _mediaTests = [];
function stopAllMediaTests() { for (const s of _mediaTests.splice(0)) { try { s(); } catch {} } }
async function toggleMediaTest(kind, btn, container) {
  if (btn._stop) { btn._stop(); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'cam'
      ? { video: state.voice.camDeviceId ? { deviceId: { exact: state.voice.camDeviceId } } : true }
      : { audio: state.voice.micDeviceId ? { deviceId: { exact: state.voice.micDeviceId } } : true });
  } catch (e) { alert('Could not access ' + (kind === 'cam' ? 'camera' : 'microphone') + ': ' + e.message); return; }
  let raf = null, ctx = null;
  if (kind === 'cam') {
    const v = document.createElement('video'); v.autoplay = true; v.muted = true; v.playsInline = true; v.srcObject = stream;
    container.innerHTML = ''; container.append(v); v.play().catch(() => {});
  } else {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const fill = container.querySelector('.mic-meter-fill');
    const loop = () => { an.getByteFrequencyData(data); let s = 0; for (const x of data) s += x; if (fill) fill.style.transform = 'scaleX(' + Math.min(1, (s / data.length) * 0.016) + ')'; raf = requestAnimationFrame(loop); };
    loop();
  }
  btn.textContent = kind === 'cam' ? 'Stop camera test' : 'Stop testing';
  btn.classList.add('danger');
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    try { ctx && ctx.close(); } catch {}
    for (const t of stream.getTracks()) t.stop();
    if (kind === 'cam') container.innerHTML = '';
    else { const f = container.querySelector('.mic-meter-fill'); if (f) f.style.transform = 'scaleX(0)'; }
    btn.textContent = kind === 'cam' ? 'Test camera' : 'Test microphone';
    btn.classList.remove('danger');
    btn._stop = null;
    _mediaTests = _mediaTests.filter(x => x !== stop);
  };
  btn._stop = stop;
  _mediaTests.push(stop);
}

// ─── Theme / appearance ───────────────────────────────────────────────────────
const THEMES = ['dark', 'light', 'midnight', 'crimson', 'aurora', 'forest', 'sunset', 'dracula', 'rose', 'slate'];
function applyTheme(t) {
  document.body.classList.remove(...THEMES.map(x => 'theme-' + x));
  if (t && t !== 'dark' && THEMES.includes(t)) document.body.classList.add('theme-' + t);
  localStorage.setItem('disdroc_theme', t || 'dark');
}
const CHAT_FONTS = ['default', 'serif', 'mono', 'rounded'];
function applyFont(f) {
  document.body.classList.remove(...CHAT_FONTS.map(x => 'font-' + x));
  if (f && f !== 'default' && CHAT_FONTS.includes(f)) document.body.classList.add('font-' + f);
  localStorage.setItem('disdroc_font', f || 'default');
}
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function applyTextSize(size) {
  document.body.classList.remove('text-small', 'text-large');
  if (size === 'small') document.body.classList.add('text-small');
  else if (size === 'large') document.body.classList.add('text-large');
  localStorage.setItem('disdroc_text_size', size || 'default');
}
function applyAccent(c) {
  const root = document.documentElement.style;
  if (c) {
    root.setProperty('--accent', c);
    root.setProperty('--accent-hover', c);
    root.setProperty('--accent-soft', hexToRgba(c, 0.15));
    localStorage.setItem('disdroc_accent', c);
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--accent-hover');
    root.removeProperty('--accent-soft');
    localStorage.removeItem('disdroc_accent');
  }
}

// The sound events a user can override, in the order shown in settings.
const SFX_KINDS = ['message', 'send', 'join', 'leave', 'ring', 'mute', 'unmute', 'click', 'pop', 'toggle', 'error'];

function customSoundsSection() {
  const wrap = el('div', { class: 'sfx-custom' });
  for (const kind of SFX_KINDS) {
    const fileInput = el('input', { type: 'file', accept: 'audio/*', style: 'display:none' });
    const status = el('span', { class: 'sfx-status' });
    const resetBtn = el('button', { type: 'button', class: 'ghost sfx-reset', title: t('sfx.reset') }, '↺');
    const refresh = () => {
      const custom = !!_customSfx[kind];
      status.textContent = custom ? t('sfx.custom') : t('sfx.default');
      status.classList.toggle('on', custom);
      resetBtn.style.display = custom ? '' : 'none';
    };
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0]; fileInput.value = '';
      if (!f) return;
      if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|webm|m4a|opus|aac|flac)$/i.test(f.name)) { alert(t('sfx.notAudio')); return; }
      if (f.size > 1024 * 1024) { alert(t('sfx.tooBig')); return; }
      try { await setCustomSfx(kind, f); refresh(); playSfx(kind, { force: true }); }
      catch { alert(t('sfx.saveFailed')); }
    });
    resetBtn.addEventListener('click', async () => { await clearCustomSfx(kind); refresh(); });
    const row = el('div', { class: 'sfx-row' }, [
      el('span', { class: 'sfx-name' }, t('sfx.' + kind)),
      status,
      el('button', { type: 'button', class: 'ghost', title: t('sfx.preview'), on: { click: () => playSfx(kind, { force: true }) } }, '▶'),
      el('button', { type: 'button', class: 'ghost', on: { click: () => fileInput.click() } }, t('sfx.upload')),
      resetBtn, fileInput,
    ]);
    refresh();
    wrap.append(row);
  }
  return wrap;
}

// Sample-chat card used by the Appearance + Accessibility previews. Reflects live theme,
// accent, message density and chat text size (all driven by body classes / CSS vars).
function settingsChatPreview({ compact = false, accentMention = false } = {}) {
  const dpMsg = (initial, color, name, time, text) => el('div', { class: 'dp-msg' }, [
    el('div', { class: 'dp-av', style: 'background:' + color }, initial),
    el('div', { class: 'dp-body' }, [
      el('div', { class: 'dp-name' }, [name, el('span', { class: 'dp-time' }, time)]),
      el('div', { class: 'dp-text' }, text),
    ]),
  ]);
  const line2 = accentMention
    ? [el('span', { class: 'dp-mention' }, '@Karahan'), ' love the accent color!']
    : 'Clean! Compact mode tightens all of this up.';
  return el('div', { class: 'density-preview' + (compact ? ' is-compact' : '') }, [
    el('div', { class: 'dp-head' }, 'Preview'),
    dpMsg('K', 'var(--accent)', 'Karahan', '12:30', 'Check out the new settings switches.'),
    dpMsg('A', '#23a55a', 'Aria', '12:31', line2),
  ]);
}

async function openSettingsModal(tab) {
  stopAllMediaTests(); // release any mic/cam test from a previous tab
  const errBox = el('div', { class: 'error' });
  const tabs = ['profile', 'events', 'connections', 'voice', 'notifications', 'preferences', 'accessibility', 'language', 'privacy', 'keybinds', 'updates', 'security', 'sessions', 'blocked'];
  const labels = { profile: t('tab.profile'), events: t('nav.events'), connections: t('tab.connections'), voice: t('tab.voice'), notifications: t('tab.notifications'), preferences: t('tab.preferences'), accessibility: t('tab.accessibility'), language: t('tab.language'), privacy: t('tab.privacy'), keybinds: t('tab.keybinds'), updates: t('tab.updates'), security: t('tab.security'), sessions: t('tab.sessions'), blocked: t('tab.blocked') };
  const icons = { profile: 'user', events: 'sparkles', connections: 'link', voice: 'headset', notifications: 'bell', preferences: 'paintbrush', accessibility: 'accessibility', language: 'globe', privacy: 'shield', keybinds: 'keyboard', updates: 'download', security: 'lock', sessions: 'monitor', blocked: 'ban' };
  const cur = tabs.includes(tab) ? tab : 'profile';
  // On phones, opening settings with no specific tab lands on the nav list
  // first (two-level navigation, like Discord mobile); picking an item slides
  // to the panel, which carries a back button. Desktop keeps the split view.
  const isMobile = isMobileLayout();
  const listView = isMobile && tab == null;

  const panel = el('div', { class: 'settings-panel' });
  panel.append(el('button', {
    type: 'button', class: 'settings-back',
    on: { click: () => isMobileLayout() ? showMobileYouScreen() : document.querySelector('#settingsModalRoot .settings-shell')?.classList.replace('s-panel', 's-list') },
  }, [icon('chevron-left', 18), t('chrome.userSettings')]));
  panel.append(el('h2', { class: 'settings-title' }, labels[cur]));

  if (cur === 'profile') {
    const me = state.me;
    // Account overview card
    const tagText = me.tag ? (/^\d+$/.test(me.tag) ? '#' + me.tag : '@' + me.tag) : '';
    const infoRow = (label, valNode) => el('div', { class: 'acct-row' }, [el('span', { class: 'acct-label' }, label), el('span', { class: 'acct-val' }, valNode)]);
    const copyBtn = (text) => el('button', { type: 'button', class: 'ghost acct-copy', title: t('common.copy'), on: { click: () => { navigator.clipboard?.writeText(String(text)).then(() => {}, () => {}); } } }, t('common.copy'));
    panel.append(el('div', { class: 'acct-card' }, [
      infoRow(t('acct.username'), el('span', {}, (me.username || '') + (tagText ? ' ' + tagText : ''))),
      infoRow(t('acct.email'), el('span', { class: 'acct-email' }, me.email ? [
        el('span', {}, me.email),
        me.email_verified ? el('span', { class: 'tag ok' }, t('acct.verified')) : el('span', { class: 'tag warn' }, t('acct.unverified')),
        me.pending_email ? el('span', { class: 'tag warn' }, t('acct.changePending')) : null,
      ] : [el('span', { class: 'muted-text' }, t('acct.noEmail'))])),
      infoRow(t('acct.userId'), el('span', { class: 'acct-id' }, [el('code', {}, String(me.id)), copyBtn(me.id)])),
      infoRow(t('acct.2fa'), el('span', {}, me.totp_enabled ? el('span', { class: 'tag ok' }, t('acct.enabled')) : el('span', { class: 'tag warn' }, t('acct.disabled')))),
      me.is_admin ? infoRow(t('acct.role'), el('span', { class: 'tag ok' }, t('acct.admin'))) : null,
    ]));
    panel.append(el('h4', { style: 'margin-top:20px' }, t('acct.profileBanner')));
    panel.append(bannerEditorEl(() => openSettingsModal('profile')));
    panel.append(el('h4', { style: 'margin-top:20px' }, t('acct.profileCardColor')));
    panel.append(cardColorEditorEl());
    panel.append(el('h4', { style: 'margin-top:20px' }, t('acct.editProfile')));
    const dn = el('input', { value: me.display_name || '', maxlength: 40 });
    const bio = el('textarea', { maxlength: 240 }, me.bio || '');
    const status = el('input', { value: me.status_text || '', maxlength: 60, placeholder: t('acct.statusTextPlaceholder') });
    const stype = el('select', {}, ['online','idle','dnd','invisible'].map(s => {
      const o = el('option', { value: s }, t('status.' + s));
      if ((me.status_type || 'online') === s) o.selected = true;
      return o;
    }));
    // Avatar / profile picture
    const avatarInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
    const avatarPreview = avatarEl(me, 'large');
    const pickBtn = el('button', { type: 'button', class: 'ghost', on: { click: () => avatarInput.click() } }, t('acct.changeAvatar'));
    const removeBtn = me.avatar_path ? el('button', { type: 'button', class: 'danger', on: { click: async () => {
      if (!(await confirmModal(t('acct.removeAvatarConfirm')))) return;
      try { await api('/api/me/avatar', { method: 'DELETE' }); await loadMe(); renderMe(); openSettingsModal('profile'); }
      catch (e) { errBox.textContent = e.message; }
    } } }, t('common.remove')) : null;
    avatarInput.addEventListener('change', () => {
      const f = avatarInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { avatarPreview.innerHTML = ''; avatarPreview.append(el('img', { src: reader.result })); };
      reader.readAsDataURL(f);
    });
    // Avatar ornament picker — a grid of live mini-previews; click to select.
    let selectedOrnament = me.ornament || 'none';
    const ornGrid = el('div', { class: 'orn-grid' });
    const ornPreviewUser = () => ({ avatar_path: me.avatar_path, display_name: me.display_name, username: me.username });
    for (const o of ORNAMENTS) {
      const ornName = t('ornament.' + o.id);
      const prev = avatarEl({ ...ornPreviewUser(), ornament: o.id }, 'orn-preview', { showOrn: true });
      const cell = el('button', {
        type: 'button', class: 'orn-cell' + (selectedOrnament === o.id ? ' active' : ''), title: ornName,
        on: { click: () => { selectedOrnament = o.id; ornGrid.querySelectorAll('.orn-cell').forEach(c => c.classList.toggle('active', c === cell)); } },
      }, [prev, el('span', { class: 'orn-name' }, ornName)]);
      ornGrid.append(cell);
    }
    panel.append(
      el('label', {}, t('acct.profilePicture')),
      el('div', { class: 'avatar-edit-row' }, [ avatarPreview, el('div', { class: 'avatar-edit-actions' }, [pickBtn, removeBtn]), avatarInput ]),
      el('label', {}, t('acct.avatarOrnament')), ornGrid,
      el('label', {}, t('acct.displayName')), dn,
      el('label', {}, t('acct.bio')), bio,
      el('label', {}, t('acct.status')), stype,
      el('label', {}, t('acct.statusText')), status,
    );
    panel.append(el('div', { class: 'row', style: 'margin-top:14px' }, [
      el('button', { on: { click: async () => {
        try {
          // Save status FIRST, then profile. The /me PATCH broadcasts user:profile-changed
          // which triggers loadMe() — so by then the status row is already up-to-date.
          await api('/api/me/status', { method: 'PATCH', body: JSON.stringify({ type: stype.value, text: status.value || null }) });
          await api('/api/me', { method: 'PATCH', body: JSON.stringify({ display_name: dn.value, bio: bio.value, ornament: selectedOrnament }) });
          if (avatarInput.files[0]) {
            const fd = new FormData(); fd.append('avatar', avatarInput.files[0]);
            const r = await fetch('/api/me/avatar', { method: 'POST', body: fd, credentials: 'include', headers: { authorization: 'Bearer ' + getToken() } });
            if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'nsfw_rejected' ? t('acct.nsfwRejected') : (j.error || 'avatar_upload_failed')); }
          }
          await loadMe();
          renderMe();
          alert(t('acct.saved'));
        } catch (e) { errBox.textContent = e.message; }
      } } }, t('acct.saveProfile')),
    ]));
  } else if (cur === 'preferences') {
    // Live preview — reflects theme + accent changes (and current density) as you pick them.
    panel.append(settingsChatPreview({ accentMention: true, compact: localStorage.getItem('disdroc_density') === 'compact' }));
    // Theme
    panel.append(el('h4', { style: 'margin-top:18px' }, t('appearance.theme')));
    const curTheme = localStorage.getItem('disdroc_theme') || 'dark';
    const themeRow = el('div', { class: 'theme-row' });
    for (const [val, label] of [['dark', t('theme.dark')], ['light', t('theme.light')], ['midnight', t('theme.midnight')], ['crimson', 'Crimson'], ['aurora', 'Aurora'], ['forest', 'Forest'], ['sunset', 'Sunset'], ['dracula', 'Dracula'], ['rose', 'Rosé'], ['slate', 'Slate']]) {
      const sw = el('button', {
        type: 'button', class: 'theme-swatch theme-prev-' + val + (curTheme === val ? ' active' : ''),
        on: { click: () => {
          applyTheme(val);
          themeRow.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('active'));
          sw.classList.add('active');
        } },
      }, [el('span', { class: 'ts-dot' }), el('span', { class: 'ts-label' }, label)]);
      themeRow.append(sw);
    }
    panel.append(themeRow);

    // Accent color
    panel.append(el('h4', { style: 'margin-top:22px' }, t('appearance.accent')));
    const curAccent = localStorage.getItem('disdroc_accent') || '';
    const accentRow = el('div', { class: 'accent-row' });
    const accents = ['#5865f2', '#7c5cff', '#eb459e', '#23a55a', '#f0b232', '#f23f43', '#00a8fc', '#11806a'];
    const clearActive = () => accentRow.querySelectorAll('.accent-swatch').forEach(x => x.classList.remove('active'));
    for (const c of accents) {
      const sw = el('button', {
        type: 'button', class: 'accent-swatch' + (curAccent.toLowerCase() === c ? ' active' : ''),
        style: 'background:' + c, title: c,
        on: { click: () => { applyAccent(c); clearActive(); sw.classList.add('active'); } },
      });
      accentRow.append(sw);
    }
    const resetSw = el('button', {
      type: 'button', class: 'accent-swatch accent-reset' + (curAccent === '' ? ' active' : ''), title: t('appearance.accentDefault'),
      on: { click: () => { applyAccent(''); clearActive(); resetSw.classList.add('active'); } },
    }, '↺');
    accentRow.append(resetSw);
    panel.append(accentRow);

    // Voice call sounds
    panel.append(el('h4', { style: 'margin-top:22px' }, t('appearance.sounds')));
    const sfxWrap = el('label', { class: 'check-row' });
    const sfxToggle = el('input', { type: 'checkbox' });
    sfxToggle.checked = sfxEnabled();
    sfxToggle.addEventListener('change', () => {
      localStorage.setItem('disdroc_sfx', sfxToggle.checked ? 'on' : 'off');
      if (sfxToggle.checked) playSfx('join');
    });
    sfxWrap.append(sfxToggle, el('span', {}, t('appearance.sfxLabel')));
    panel.append(sfxWrap);

    // UI click / interaction sounds
    const uiWrap = el('label', { class: 'check-row' });
    const uiToggle = el('input', { type: 'checkbox' });
    uiToggle.checked = uiSfxEnabled();
    uiToggle.addEventListener('change', () => {
      localStorage.setItem('disdroc_ui_sfx', uiToggle.checked ? 'on' : 'off');
      if (uiToggle.checked) playSfx('click', { force: true });
    });
    uiWrap.append(uiToggle, el('span', {}, t('appearance.uiSfxLabel')));
    panel.append(uiWrap);

    // Custom sound effects — replace any built-in sound with your own audio.
    panel.append(el('h4', { style: 'margin-top:22px' }, t('appearance.customSounds')));
    panel.append(el('p', { class: 'settings-hint' }, t('appearance.customSoundsHint')));
    panel.append(customSoundsSection());

    // Chat font
    panel.append(el('h4', { style: 'margin-top:22px' }, 'Chat font'));
    const curFont = localStorage.getItem('disdroc_font') || 'default';
    const fontRow = el('div', { class: 'theme-row' });
    for (const [val, label] of [['default', 'Default'], ['serif', 'Serif'], ['mono', 'Mono'], ['rounded', 'Rounded']]) {
      const b = el('button', { type: 'button', class: 'size-swatch font-prev-' + val + (curFont === val ? ' active' : ''), on: { click: () => {
        applyFont(val);
        fontRow.querySelectorAll('.size-swatch').forEach(x => x.classList.remove('active')); b.classList.add('active');
      } } }, label);
      fontRow.append(b);
    }
    panel.append(fontRow);
  } else if (cur === 'voice') {
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:14px' }, t('voice.deviceHint')));
    const devBox = el('div', {});
    panel.append(devBox);
    devBox.append(el('div', { class: 'muted-text' }, t('voice.loadingDevices')));
    (async () => {
      let devices = [];
      try { devices = await navigator.mediaDevices.enumerateDevices(); } catch {}
      const mk = (title, kind, lsKey, stateKey) => {
        const list = devices.filter(d => d.kind === kind);
        const sel = el('select', {});
        sel.append(el('option', { value: '' }, t('voice.default')));
        const cur2 = localStorage.getItem(lsKey) || '';
        list.forEach((d, i) => {
          const o = el('option', { value: d.deviceId }, d.label || (title + ' ' + (i + 1)));
          if (d.deviceId === cur2) o.selected = true;
          sel.append(o);
        });
        sel.addEventListener('change', () => {
          if (sel.value) localStorage.setItem(lsKey, sel.value); else localStorage.removeItem(lsKey);
          state.voice[stateKey] = sel.value || null;
        });
        return el('div', { style: 'margin-bottom:6px' }, [el('h4', {}, title), sel]);
      };
      const frag = el('div', {}, [
        mk(t('voice.inputDevice'), 'audioinput', 'disdroc_mic', 'micDeviceId'),
        mk(t('voice.camera'), 'videoinput', 'disdroc_cam', 'camDeviceId'),
        mk(t('voice.outputDevice'), 'audiooutput', 'disdroc_out', 'outDeviceId'),
      ]);
      devBox.innerHTML = ''; devBox.append(frag);
    })();

    // Output volume
    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.outputVolume')));
    const volVal = el('span', { class: 'slider-val' }, (localStorage.getItem('disdroc_out_volume') || '100') + '%');
    const volSlider = el('input', { type: 'range', min: '0', max: '100', step: '1', value: localStorage.getItem('disdroc_out_volume') || '100' });
    volSlider.addEventListener('input', () => { localStorage.setItem('disdroc_out_volume', volSlider.value); volVal.textContent = volSlider.value + '%'; applyOutputVolume(); });
    panel.append(el('div', { class: 'slider-row' }, [volSlider, volVal]));

    // Mic test (live input meter)
    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.micTest')));
    const meter = el('div', { class: 'mic-meter' }, el('div', { class: 'mic-meter-fill' }));
    const micBtn = el('button', { class: 'ghost' }, t('voice.testMic'));
    micBtn.addEventListener('click', () => toggleMediaTest('mic', micBtn, meter));
    panel.append(micBtn, meter);

    // Camera test (preview)
    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.cameraTest')));
    const camPreview = el('div', { class: 'cam-preview' });
    const camBtn = el('button', { class: 'ghost' }, t('voice.testCamera'));
    camBtn.addEventListener('click', () => toggleMediaTest('cam', camBtn, camPreview));
    panel.append(camBtn, camPreview);

    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.audioProcessing')));
    for (const [key, lbl] of [['disdroc_echo', t('voice.echoCancellation')], ['disdroc_noise', t('voice.noiseSuppression')], ['disdroc_agc', t('voice.automaticGainControl')]]) {
      const w = el('label', { class: 'check-row' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = localStorage.getItem(key) !== 'off';
      cb.addEventListener('change', () => localStorage.setItem(key, cb.checked ? 'on' : 'off'));
      w.append(cb, el('span', {}, lbl));
      panel.append(w);
    }

    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.pushToTalk')));
    const pttWrap = el('label', { class: 'check-row' });
    const pttCb = el('input', { type: 'checkbox' });
    pttCb.checked = localStorage.getItem('disdroc_ptt') === 'on';
    pttCb.addEventListener('change', () => { localStorage.setItem('disdroc_ptt', pttCb.checked ? 'on' : 'off'); applyMicState(); });
    pttWrap.append(pttCb, el('span', {}, t('voice.pushToTalkHint')));
    panel.append(pttWrap);
    const keyLabel = () => { const k = localStorage.getItem('disdroc_ptt_key'); return k ? t('voice.keybindLabel', { key: k }) : t('voice.setKeybind'); };
    const keyBtn = el('button', { class: 'ghost', style: 'margin-top:8px' }, keyLabel());
    keyBtn.addEventListener('click', () => {
      keyBtn.textContent = t('voice.pressAnyKey');
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation();
        localStorage.setItem('disdroc_ptt_key', e.code);
        keyBtn.textContent = keyLabel();
        window.removeEventListener('keydown', onKey, true);
      };
      window.addEventListener('keydown', onKey, true);
    });
    panel.append(keyBtn);
    panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('voice.pttHint')));

    panel.append(el('h4', { style: 'margin-top:18px' }, t('voice.spatialAudio')));
    const spRow = el('label', { class: 'check-row' });
    const spCb = el('input', { type: 'checkbox' });
    spCb.checked = !!(window.Spatial && window.Spatial.isEnabled());
    spCb.addEventListener('change', () => { const ok = window.Spatial?.setEnabled(spCb.checked); spCb.checked = !!ok; });
    spRow.append(spCb, el('span', {}, t('voice.spatialAudioHint')));
    panel.append(spRow);
    panel.append(el('button', { class: 'ghost', style: 'margin-top:10px', on: { click: () => window.Spatial?.openPanel() } }, t('voice.openSpatialRoom')));
  } else if (cur === 'notifications') {
    panel.append(el('h4', {}, t('notif.desktop')));
    const permState = ('Notification' in window) ? Notification.permission : 'unsupported';
    const notifLine = el('div', { class: 'muted-text', style: 'margin-bottom:8px' });
    const setLine = () => {
      const s = ('Notification' in window) ? Notification.permission : 'unsupported';
      notifLine.innerHTML = '';
      if (s === 'granted') { notifLine.append(icon('check-circle', 14), ' ' + t('notif.granted')); }
      else if (s === 'denied') { notifLine.append(icon('x-circle', 14), ' ' + t('notif.blocked')); }
      else if (s === 'unsupported') { notifLine.textContent = t('notif.unsupported'); }
      else { notifLine.textContent = t('notif.off'); }
    };
    setLine();
    panel.append(notifLine);
    const notifBtn = el('button', { class: 'ghost', on: { click: async () => {
      if (!('Notification' in window)) return;
      try {
        const p = await Notification.requestPermission();
        setLine();
        if (p === 'granted') { try { new Notification('disdroc', { body: t('notif.enabled'), icon: '/assets/icon-192.png' }); } catch {} }
      } catch {}
    } } }, t('notif.enable'));
    if (permState === 'granted' || permState === 'denied' || permState === 'unsupported') notifBtn.disabled = true;
    const testBtn = el('button', { class: 'ghost', on: { click: () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') { alert(t('notif.testNeedsPermission')); return; }
      try { new Notification(t('notif.testTitle'), { body: t('notif.testBody'), icon: '/assets/icon-192.png' }); } catch {}
    } } }, t('notif.sendTest'));
    // one row, not two right-floated stacked buttons at different widths
    panel.append(el('div', { class: 'settings-actions' }, [notifBtn, testBtn]));

    panel.append(el('h4', { style: 'margin-top:22px' }, t('notif.globalDefault')));
    const moWrap = el('label', { class: 'check-row' });
    const moCb = el('input', { type: 'checkbox' });
    moCb.checked = !!(state.me && state.me.notif_mentions_only);
    moCb.addEventListener('change', async () => {
      state.me.notif_mentions_only = moCb.checked ? 1 : 0;
      try { await api('/api/me/notif-prefs', { method: 'POST', body: JSON.stringify({ mentionsOnly: moCb.checked }) }); }
      catch { moCb.checked = !moCb.checked; state.me.notif_mentions_only = moCb.checked ? 1 : 0; }
    });
    moWrap.append(moCb, el('span', {}, t('notif.mentionsOnlyGlobal')));
    panel.append(moWrap);
    panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('notif.mentionsOnlyGlobalHint')));

    panel.append(el('h4', { style: 'margin-top:22px' }, t('notif.messageSounds')));
    const msWrap = el('label', { class: 'check-row' });
    const msCb = el('input', { type: 'checkbox' });
    msCb.checked = localStorage.getItem('disdroc_msg_sound') !== 'off';
    msCb.addEventListener('change', () => {
      localStorage.setItem('disdroc_msg_sound', msCb.checked ? 'on' : 'off');
      if (msCb.checked) playSfx('message', { force: true });
    });
    msWrap.append(msCb, el('span', {}, t('notif.playSound')));
    panel.append(msWrap);
    panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('notif.mutedHint')));

    panel.append(el('h4', { style: 'margin-top:22px' }, t('notif.gameActivity')));
    const gaWrap = el('label', { class: 'check-row' });
    const gaCb = el('input', { type: 'checkbox' });
    gaCb.checked = localStorage.getItem('disdroc_share_activity') !== 'off';
    gaCb.addEventListener('change', () => {
      localStorage.setItem('disdroc_share_activity', gaCb.checked ? 'on' : 'off');
      if (!gaCb.checked) {
        state.activities.delete(state.me.id);
        try { state.socket && state.socket.emit('presence:activity', null); } catch {}
        renderMe(); refreshActivityViews();
      }
    });
    gaWrap.append(gaCb, el('span', {}, t('notif.shareGame')));
    panel.append(gaWrap);
    if (!window.disdrocDesktop) panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('notif.gameActivityHint')));
  } else if (cur === 'accessibility') {
    panel.append(el('h4', {}, t('a11y.textSize')));
    const sizeRow = el('div', { class: 'theme-row' });
    const curSize = localStorage.getItem('disdroc_text_size') || 'default';
    for (const [val, label] of [['small', t('size.small')], ['default', t('size.default')], ['large', t('size.large')]]) {
      const b = el('button', { type: 'button', class: 'size-swatch' + (curSize === val ? ' active' : ''), on: { click: () => {
        applyTextSize(val);
        sizeRow.querySelectorAll('.size-swatch').forEach(x => x.classList.remove('active')); b.classList.add('active');
      } } }, label);
      sizeRow.append(b);
    }
    panel.append(sizeRow);

    panel.append(el('h4', { style: 'margin-top:22px' }, t('a11y.density')));
    // Live preview of how the chat spacing changes — updates as the switch flips.
    const isCompact = localStorage.getItem('disdroc_density') === 'compact';
    const densityPreview = settingsChatPreview({ compact: isCompact });
    panel.append(densityPreview);
    const compactWrap = el('label', { class: 'check-row' });
    const compactToggle = el('input', { type: 'checkbox' });
    compactToggle.checked = isCompact;
    compactToggle.addEventListener('change', () => {
      if (compactToggle.checked) { localStorage.setItem('disdroc_density', 'compact'); document.body.classList.add('density-compact'); }
      else { localStorage.removeItem('disdroc_density'); document.body.classList.remove('density-compact'); }
      densityPreview.classList.toggle('is-compact', compactToggle.checked);
    });
    compactWrap.append(compactToggle, el('span', {}, t('a11y.compact')));
    panel.append(compactWrap);

    panel.append(el('h4', { style: 'margin-top:22px' }, t('a11y.motion')));
    const rmWrap = el('label', { class: 'check-row' });
    const rmCb = el('input', { type: 'checkbox' });
    rmCb.checked = localStorage.getItem('disdroc_reduce_motion') === '1';
    rmCb.addEventListener('change', () => {
      localStorage.setItem('disdroc_reduce_motion', rmCb.checked ? '1' : '0');
      document.body.classList.toggle('reduce-motion', rmCb.checked);
    });
    rmWrap.append(rmCb, el('span', {}, t('a11y.reduceMotion')));
    panel.append(rmWrap);

    panel.append(el('h4', { style: 'margin-top:22px' }, t('a11y.timeFormat')));
    const t24Wrap = el('label', { class: 'check-row' });
    const t24Cb = el('input', { type: 'checkbox' });
    t24Cb.checked = localStorage.getItem('disdroc_time24') === '1';
    t24Cb.addEventListener('change', () => { localStorage.setItem('disdroc_time24', t24Cb.checked ? '1' : '0'); });
    t24Wrap.append(t24Cb, el('span', {}, t('a11y.time24')));
    panel.append(t24Wrap);
  } else if (cur === 'language') {
    panel.append(el('h4', {}, t('language.heading')));
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:14px' }, t('language.desc')));
    // If we adopted this language from the visitor's location (and they never picked
    // one themselves), say so — and reassure them their choice will stick.
    if (window.disdrocI18N.wasAutodetected()) {
      panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:14px;color:var(--accent)' }, '🌍 ' + t('language.autodetectNote')));
    }
    const curLang = window.disdrocI18N.getLang();
    const langRow = el('div', { class: 'lang-row' });
    for (const l of window.disdrocI18N.LANGS) {
      const active = curLang === l.code;
      const b = el('button', {
        type: 'button', class: 'lang-swatch' + (active ? ' active' : ''),
        on: { click: () => {
          if (window.disdrocI18N.getLang() === l.code) { window.disdrocI18N.setLang(l.code); return; }
          window.disdrocI18N.setLang(l.code); // records the explicit choice, then reload to re-render every string
          location.reload();
        } },
      }, [
        el('span', { class: 'lang-flag' }, l.flag),
        el('span', { class: 'lang-text' }, [
          el('span', { class: 'lang-native' }, l.native),
          el('span', { class: 'lang-en' }, l.name),
        ]),
        active ? el('span', { class: 'lang-check' }, icon('check', 18)) : null,
      ]);
      langRow.append(b);
    }
    panel.append(langRow);
  } else if (cur === 'connections') {
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:14px' }, t('conn.intro')));
    const card = el('div', { class: 'acct-card conn-card' });
    card.append(el('div', { class: 'muted-text' }, t('conn.loading')));
    panel.append(card);
    (async () => {
      let st = null;
      try { st = await api('/api/spotify/status'); } catch {}
      card.innerHTML = '';
      card.append(el('div', { class: 'conn-head' }, [
        el('span', { class: 'conn-logo spotify' }, icon('spotify', 26)),
        el('strong', {}, 'Spotify'),
        st && st.connected ? el('span', { class: 'tag ok', style: 'margin-left:auto' }, t('conn.connectedTag')) : null,
      ]));
      if (!st || !st.configured) {
        card.append(el('p', { class: 'muted-text', style: 'margin:10px 0 0' }, t('conn.notConfigured')));
        return;
      }
      if (st.connected) {
        card.append(el('p', { style: 'margin:10px 0 6px' }, t('conn.connectedAs', { name: st.spotify_name || 'Spotify' })));
        card.append(el('p', { class: 'muted-text', style: 'margin:0 0 12px' }, t('conn.connectedDesc')));
        card.append(el('button', { type: 'button', class: 'danger', on: { click: async () => {
          try { await api('/api/spotify', { method: 'DELETE' }); openSettingsModal('connections'); }
          catch (e) { errBox.textContent = e.message; }
        } } }, t('conn.disconnect')));
      } else {
        card.append(el('p', { class: 'muted-text', style: 'margin:10px 0 12px' }, t('conn.connectDesc')));
        card.append(el('button', { type: 'button', class: 'conn-connect-btn', on: { click: () => { location.href = '/api/spotify/connect'; } } }, [icon('spotify', 16), ' ' + t('conn.connectBtn')]));
      }
    })();
    panel.append(el('p', { class: 'muted-text', style: 'margin-top:18px' }, t('conn.embedTip')));
  } else if (cur === 'privacy') {
    panel.append(el('h4', {}, t('privacy.media')));
    const mkToggle = (key, label, def, onChange) => {
      const w = el('label', { class: 'check-row' });
      const cb = el('input', { type: 'checkbox' });
      const v = localStorage.getItem(key);
      cb.checked = v == null ? def : (v === '1' || v === 'on');
      cb.addEventListener('change', () => { localStorage.setItem(key, cb.checked ? (key === 'disdroc_inline_media' ? 'on' : '1') : (key === 'disdroc_inline_media' ? 'off' : '0')); if (onChange) onChange(cb.checked); });
      w.append(cb, el('span', {}, label));
      return w;
    };
    panel.append(mkToggle('disdroc_inline_media', t('privacy.showInlineMedia'), true));
    panel.append(mkToggle('disdroc_blur_media', t('privacy.blurExplicit'), false));
    panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('privacy.mediaRefreshHint')));

    // Explicit (NSFW) media controls — explicit photos/videos are allowed but shown
    // blurred behind a click-to-reveal cover; revealing + sending is adults-only.
    panel.append(el('h4', { style: 'margin-top:22px' }, t('privacy.explicitContent')));
    if (state.me && state.me.is_adult) {
      const w = el('label', { class: 'check-row' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!(state.me.show_nsfw === 1 || state.me.show_nsfw === true);
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        try { const r = await api('/api/me/nsfw-pref', { method: 'POST', body: JSON.stringify({ show: cb.checked }) }); state.me.show_nsfw = r.show_nsfw; }
        catch (e) { cb.checked = !cb.checked; alert(t('privacy.couldNotSave', { error: e.message || 'error' })); }
        finally { cb.disabled = false; }
      });
      w.append(cb, el('span', {}, t('privacy.showExplicit')));
      panel.append(w);
      panel.append(el('p', { class: 'muted-text', style: 'margin-top:6px' }, t('privacy.blurOffHint')));
    } else {
      panel.append(el('p', { class: 'muted-text' }, t('privacy.explicitHiddenMinor')));
    }
    // Accounts created before the age gate have no DOB on file — let them set it once.
    if (state.me && !state.me.birthdate) {
      const wrap = el('div', { style: 'margin-top:12px' });
      wrap.append(el('p', { class: 'muted-text', style: 'margin:0 0 6px' }, t('privacy.noDobHint')));
      const inp = el('input', { type: 'date' });
      const btn = el('button', { type: 'button', class: 'ghost', style: 'margin-left:8px', on: { click: async () => {
        if (!inp.value) return;
        btn.disabled = true;
        try {
          const r = await api('/api/me/birthdate', { method: 'POST', body: JSON.stringify({ birthdate: inp.value }) });
          state.me.birthdate = r.birthdate; state.me.is_adult = r.is_adult; openSettingsModal('privacy');
        } catch (e) { btn.disabled = false; alert(e.message === 'invalid_birthdate' ? t('privacy.invalidDate') : t('privacy.couldNotSave', { error: e.message || 'error' })); }
      } } }, t('common.save'));
      wrap.append(inp, btn);
      panel.append(wrap);
    }

    panel.append(el('h4', { style: 'margin-top:22px' }, t('privacy.safety')));
    panel.append(el('p', { class: 'muted-text' }, t('privacy.safetyHint')));
  } else if (cur === 'keybinds') {
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:14px' }, t('keybinds.intro')));
    const binds = [
      [t('keybinds.quickSwitcher'), 'Ctrl / ⌘ + K'],
      [t('keybinds.boldItalic'), 'Ctrl + B / I / `'],
      [t('keybinds.editLast'), '↑  (empty composer)'],
      [t('keybinds.replyMsg'), 'Double-click message'],
      [t('keybinds.mentionUser'), 'Shift + click username'],
      [t('keybinds.acceptSuggestion'), 'Tab  or  Enter'],
      [t('keybinds.sendMessage'), 'Enter'],
      [t('keybinds.newLine'), 'Shift + Enter'],
      [t('keybinds.saveEdit'), 'Enter'],
      [t('keybinds.cancelEdit'), 'Escape'],
      [t('keybinds.revealSpoiler'), 'Click'],
      [t('keybinds.pushToTalk'), pttKey() ? pttKey() : t('keybinds.setInVoice')],
    ];
    const list = el('div', { class: 'keybinds' });
    for (const [desc, key] of binds) list.append(el('div', { class: 'keybind-row' }, [el('span', {}, desc), el('kbd', {}, key)]));
    panel.append(list);
  } else if (cur === 'updates') {
    // Web app version card
    const verCard = el('div', { class: 'acct-card', style: 'margin-bottom:16px' });
    const verRow = el('div', { class: 'acct-row' });
    verRow.append(el('span', { class: 'acct-label' }, t('updates.serverVersion')));
    const verVal = el('span', { class: 'acct-val' }, t('conn.loading'));
    // Hidden easter egg: tap the version number 7 times in a row (each tap
    // must land within 900ms of the last) to fire the spark shockwave —
    // same "tap the build number" trick as Android's developer options.
    let _verTaps = 0, _verTapAt = 0;
    verVal.addEventListener('click', () => {
      const now = Date.now();
      _verTaps = (now - _verTapAt < 900) ? _verTaps + 1 : 1;
      _verTapAt = now;
      if (_verTaps >= 7) { _verTaps = 0; sparkShockwave(); }
    });
    verRow.append(verVal);
    verCard.append(verRow);
    panel.append(verCard);
    api('/api/version').then(r => {
      const v = (r.version || '').split('+')[0] || r.version || 'unknown';
      verVal.textContent = t('updates.versionLabel', { v });
    }).catch(() => { verVal.textContent = 'disdroc'; });

    // What's new link
    const whatsNewBtn = el('a', {
      href: '/updates', target: internalPageTarget(),
      class: 'button',
      style: 'display:inline-flex;align-items:center;gap:8px;margin-bottom:20px;text-decoration:none',
    }, [icon('sparkles', 16), el('span', {}, t('updates.whatsNew'))]);
    panel.append(whatsNewBtn);

    // Hard refresh — mobile browsers have no Ctrl+Shift+R, so give users a
    // button that wipes the service worker + cached files and reloads fresh.
    panel.append(el('h4', { style: 'margin:4px 0 8px' }, t('updates.troubleshooting')));
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:10px' },
      t('updates.troubleshootHint')));
    const hrStatus = el('div', { class: 'muted-text', style: 'margin-top:8px' });
    const hrBtn = el('button', { style: 'display:flex;align-items:center;gap:8px' }, [icon('rotate-ccw', 16), t('updates.hardRefresh')]);
    hrBtn.addEventListener('click', async () => {
      hrBtn.disabled = true; hrStatus.textContent = t('updates.clearingCache');
      try {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      hrStatus.textContent = t('updates.reloading');
      location.replace('/app?cb=' + Date.now());
    });
    panel.append(hrBtn, hrStatus, el('div', { style: 'height:22px' }));

    // PWA install button — only visible when browser has an install prompt ready
    const installBtn = el('button', {
      class: 'pwa-install-btn',
      style: 'margin-bottom:20px; display:none; align-items:center; gap:8px',
      on: { click: triggerInstall },
    }, [icon('download', 16), t('updates.installApp')]);
    panel.append(installBtn);
    if (_installPrompt) installBtn.style.display = '';

    // Desktop app section
    panel.append(el('h4', { style: 'margin-bottom:8px' }, t('updates.desktopApp')));
    const desktopVer = (window.disdrocDesktop && window.disdrocDesktop.version) || '—';
    panel.append(el('div', { class: 'acct-card', style: 'margin-bottom:14px' }, [
      el('div', { class: 'acct-row' }, [el('span', { class: 'acct-label' }, t('updates.installedVersion')), el('span', { class: 'acct-val' }, t('updates.desktopVersionLabel', { v: desktopVer }))]),
    ]));
    panel.append(el('p', { class: 'muted-text', style: 'margin-bottom:10px' },
      t('updates.desktopCheckHint')));
    const status = el('div', { class: 'muted-text', style: 'margin-top:10px' });
    const btn = el('button', { style: 'margin-top:6px; display:flex; align-items:center; gap:8px' }, [icon('download', 16), t('updates.checkForUpdates')]);
    btn.addEventListener('click', async () => {
      if (!window.disdrocDesktop || !window.disdrocDesktop.checkForUpdates) {
        status.textContent = t('updates.desktopOnly');
        return;
      }
      btn.disabled = true; status.textContent = t('updates.launching');
      try {
        const r = await window.disdrocDesktop.checkForUpdates();
        if (r && r.ok) status.textContent = t('updates.runningWindow');
        else status.textContent = r && r.error ? t('updates.checkFailedReason', { reason: r.error }) : t('updates.checkFailed') + '.';
      } catch (e) {
        status.textContent = t('updates.checkFailedException', { error: (e && e.message) || e });
      } finally {
        setTimeout(() => { btn.disabled = false; }, 2000);
      }
    });
    panel.append(btn, status);
  } else if (cur === 'security') {
    const mkEye = (inp) => {
      const btn = el('button', { type: 'button', class: 'pw-toggle', title: t('sec.showHide'), on: { click: () => {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.innerHTML = ''; btn.append(icon(inp.type === 'text' ? 'eye-off' : 'eye', 15));
      } } }, icon('eye', 15));
      return el('div', { class: 'pw-field' }, [inp, btn]);
    };

    // username section
    {
      const me = state.me;
      const nameInp = el('input', { value: me.username || '', maxlength: 20 });
      const pwInp = el('input', { type: 'password', placeholder: t('sec.currentPassword') });
      const nameErr = el('div', { class: 'error' });
      panel.append(el('div', { class: 'settings-section' }, [
        el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sec.username'))]),
        el('p', { class: 'settings-hint' }, t('sec.usernameHint')),
        nameInp,
        el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin:10px 0 6px' }, t('sec.currentPassword')),
        mkEye(pwInp),
        nameErr,
        el('div', { style: 'display:flex;justify-content:flex-end;margin-top:10px' }, [
          el('button', { on: { click: async () => {
            try {
              await api('/api/me/username', { method: 'POST', body: JSON.stringify({ newUsername: nameInp.value, password: pwInp.value }) });
              await loadMe(); renderMe();
              alert(t('sec.usernameUpdated'));
              openSettingsModal('security');
            } catch (e) {
              nameErr.textContent = ({
                invalid_username: t('sec.usernameHint'),
                wrong_password: t('sec.wrongPassword'),
                same_username: t('sec.sameUsername'),
                username_taken: t('sec.usernameTaken'),
                username_not_allowed: t('sec.usernameNotAllowed'),
              })[e.message] || e.message;
            }
          } } }, t('sec.changeUsername')),
        ]),
      ]));
    }

    // password section
    const cur1 = el('input', { type: 'password', placeholder: t('sec.currentPassword') });
    const new1 = el('input', { type: 'password', placeholder: t('sec.newPasswordPlaceholder') });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sec.password'))]),
      el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin-bottom:6px' }, t('sec.currentPassword')),
      mkEye(cur1),
      el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin:10px 0 6px' }, t('sec.newPasswordLabel')),
      mkEye(new1),
      el('div', { style: 'display:flex;justify-content:flex-end;margin-top:10px' }, [
        el('button', { on: { click: async () => {
          try {
            await api('/api/me/password', { method: 'POST', body: JSON.stringify({ current: cur1.value, next: new1.value }) });
            alert(t('sec.passwordChanged'));
            cur1.value = new1.value = '';
          } catch (e) {
            errBox.textContent = ({
              invalid_password: t('sec.invalidPassword'),
              weak_password: t('sec.weakPassword'),
              wrong_current_password: t('sec.wrongCurrentPassword'),
            })[e.message] || e.message;
          }
        } } }, t('sec.updatePassword')),
      ]),
    ]));

    // email section
    {
      const me = state.me;
      const emailErr = el('div', { class: 'error' });
      const section = el('div', { class: 'settings-section' }, [
        el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sec.email'))]),
      ]);
      if (me.pending_email) {
        const codeInp = el('input', { placeholder: t('sec.sixDigitCode'), maxlength: 6, inputmode: 'numeric' });
        section.append(
          el('p', { class: 'settings-hint' }, [t('sec.confirmCodeSentPrefix'), el('b', {}, me.pending_email), t('sec.confirmCodeSentSuffix')]),
          codeInp,
          emailErr,
          el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px' }, [
            el('button', { class: 'ghost', on: { click: async () => {
              try { await api('/api/me/email/request', { method: 'POST', body: JSON.stringify({ newEmail: me.pending_email, password: prompt(t('sec.reenterPasswordPrompt')) || '' }) }); alert(t('sec.codeResent')); }
              catch (e) { emailErr.textContent = e.message; }
            } } }, t('sec.resendCode')),
            el('button', { on: { click: async () => {
              try {
                await api('/api/me/email/confirm', { method: 'POST', body: JSON.stringify({ code: codeInp.value }) });
                await loadMe(); renderMe();
                alert(t('sec.emailUpdated'));
                openSettingsModal('security');
              } catch (e) {
                emailErr.textContent = ({ invalid_code: t('sec.invalidCode'), no_pending_email: t('sec.noPendingEmail') })[e.message] || e.message;
              }
            } } }, t('common.confirm')),
          ]),
        );
      } else {
        const newEmailInp = el('input', { type: 'email', placeholder: t('sec.newEmailPlaceholder') });
        const pwInp = el('input', { type: 'password', placeholder: t('sec.currentPassword') });
        section.append(
          el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin-bottom:6px' }, t('sec.currentEmailLabel')),
          el('div', { class: 'muted-text', style: 'margin-bottom:10px' }, me.email || t('acct.noEmail')),
          el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin-bottom:6px' }, t('sec.newEmailLabel')),
          newEmailInp,
          el('label', { style: 'display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin:10px 0 6px' }, t('sec.currentPassword')),
          mkEye(pwInp),
          emailErr,
          el('div', { style: 'display:flex;justify-content:flex-end;margin-top:10px' }, [
            el('button', { on: { click: async () => {
              try {
                const r = await api('/api/me/email/request', { method: 'POST', body: JSON.stringify({ newEmail: newEmailInp.value, password: pwInp.value }) });
                if (r.needsVerification) { await loadMe(); openSettingsModal('security'); }
                else { await loadMe(); renderMe(); alert(t('sec.emailUpdated')); openSettingsModal('security'); }
              } catch (e) {
                emailErr.textContent = ({
                  invalid_email: t('sec.invalidEmail'),
                  wrong_password: t('sec.wrongPassword'),
                  same_email: t('sec.sameEmail'),
                  email_taken: t('sec.emailTaken'),
                })[e.message] || e.message;
              }
            } } }, t('sec.changeEmail')),
          ]),
        );
      }
      panel.append(section);
    }

    // 2FA section
    const totpCard = el('div', { class: 'sec-card muted-text' }, t('conn.loading'));
    const emailCard = el('div', { class: 'sec-card' });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sec.twoFactor'))]),
      totpCard,
      emailCard,
    ]));

    api('/api/me/full').then(m => {
      totpCard.className = m.totp_enabled ? 'sec-card ok' : 'sec-card warn';
      totpCard.innerHTML = '';
      if (m.totp_enabled) {
        const pwInp = el('input', { type: 'password', placeholder: t('sec.passwordToDisable'), style: 'width:100%;margin-top:8px' });
        totpCard.append(
          el('div', { class: 'sec-card-body' }, [
            el('div', { class: 'sec-card-title' }, [icon('lock', 15), t('sec.totpTitle'), el('span', { class: 'tag ok' }, t('acct.enabled'))]),
            el('div', { class: 'sec-card-sub' }, t('sec.totpSubEnabled')),
            pwInp,
          ]),
          el('div', { class: 'sec-card-actions' }, [
            el('button', { class: 'ghost', style: 'font-size:13px;padding:6px 10px', on: { click: async () => {
              const codes = await api('/api/me/totp/backup-codes/regenerate', { method: 'POST' });
              showBackupCodes(codes.backup_codes);
            } } }, t('sec.backupCodes')),
            el('button', { class: 'danger', style: 'font-size:13px;padding:6px 10px', on: { click: async () => {
              try { await api('/api/me/totp/disable', { method: 'POST', body: JSON.stringify({ password: pwInp.value }) }); alert(t('sec.twoFaDisabled')); openSettingsModal('security'); }
              catch (e) { errBox.textContent = e.message; }
            } } }, t('sec.disable')),
          ]),
        );
      } else {
        totpCard.append(
          el('div', { class: 'sec-card-body' }, [
            el('div', { class: 'sec-card-title' }, [icon('lock', 15), t('sec.totpTitle'), el('span', { class: 'tag warn' }, t('acct.disabled'))]),
            el('div', { class: 'sec-card-sub' }, t('sec.totpSubDisabled')),
          ]),
          el('div', { class: 'sec-card-actions' }, [
            el('button', { style: 'font-size:13px;padding:6px 14px', on: { click: setupTotp } }, t('sec.enable2fa')),
          ]),
        );
      }
      emailCard.innerHTML = '';
      if (m.email_2fa_enabled) {
        emailCard.className = 'sec-card ok';
        emailCard.style.marginTop = '8px';
        emailCard.append(el('div', { class: 'sec-card-body' }, [
          el('div', { class: 'sec-card-title' }, [icon('at', 15), t('sec.email2fa'), el('span', { class: 'tag ok' }, t('acct.enabled'))]),
          el('div', { class: 'sec-card-sub' }, t('sec.email2faSubEnabled')),
        ]));
      } else {
        emailCard.className = 'sec-card';
        emailCard.style.marginTop = '8px';
        emailCard.append(el('div', { class: 'sec-card-body' }, [
          el('div', { class: 'sec-card-title' }, [icon('at', 15), t('sec.email2fa'), el('span', { class: 'tag' }, t('acct.disabled'))]),
          el('div', { class: 'sec-card-sub' }, t('sec.notConfiguredServer')),
        ]));
      }
    }).catch(e => { totpCard.className = 'sec-card'; totpCard.textContent = t('sec.couldNotLoad', { error: e.message }); });

    // login history
    const histBox = el('div', { class: 'history-table' });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sec.loginHistory'))]),
      histBox,
    ]));
    api('/api/me/login-history').then(r => {
      histBox.innerHTML = '';
      if (!r.history.length) { histBox.append(el('div', { style: 'padding:12px;color:var(--muted);font-size:13px' }, t('sec.noHistory'))); return; }
      for (const h of r.history) {
        histBox.append(el('div', { class: 'history-row' + (h.success ? '' : ' fail') }, [
          el('div', { class: 'hist-dot' }),
          el('span', {}, fmtTime(h.created_at)),
          el('span', {}, h.ip || '?'),
          el('span', { class: 'ua' }, (h.user_agent || '').slice(0, 50)),
        ]));
      }
    }).catch(() => { histBox.textContent = t('sec.failedLoadHistory'); });

    // danger zone
    const delPw = el('input', { type: 'password', placeholder: t('sec.confirmPasswordPlaceholder') });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'danger-zone' }, [
        el('div', { class: 'danger-zone-head' }, [icon('alert-triangle', 13), t('sec.dangerZone')]),
        el('p', { class: 'muted-text' }, t('sec.deleteAccountHint')),
        mkEye(delPw),
        el('div', { style: 'margin-top:10px' }, [
          el('button', { class: 'danger', on: { click: async () => {
            if (!(await confirmModal(t('sec.deleteAccountConfirm')))) return;
            try {
              await api('/api/me', { method: 'DELETE', body: JSON.stringify({ password: delPw.value }) });
              clearToken(); location.href = '/';
            } catch (e) { errBox.textContent = e.message; }
          } } }, t('sec.deleteAccount')),
        ]),
      ]),
    ]));
  } else if (cur === 'sessions') {
    const sessBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    const revokeAll = el('button', { class: 'ghost', style: 'font-size:13px;padding:6px 12px', on: { click: async () => {
      if (!(await confirmModal(t('sessions.signOutAllConfirm')))) return;
      await api('/api/me/sessions/revoke-others', { method: 'POST' });
      openSettingsModal('sessions');
    } } }, t('sessions.signOutAllOthers'));
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sessions.active')), revokeAll]),
      sessBox,
    ]));
    api('/api/me/sessions').then(r => {
      sessBox.innerHTML = '';
      const isMobile = ua => /iPhone|iPad|Android|Mobile/i.test(ua || '');
      for (const s of r.sessions) {
        sessBox.append(el('div', { class: 'session-card' + (s.current ? ' current' : '') }, [
          el('div', { class: 'session-card-icon' }, [icon(isMobile(s.user_agent) ? 'smartphone' : 'monitor', 18)]),
          el('div', { class: 'session-card-body' }, [
            el('div', { class: 'session-card-name' }, [
              s.current ? t('sessions.thisDevice') : t('sessions.anotherDevice'),
              s.current ? el('span', { class: 'tag ok', style: 'font-size:10px;padding:1px 6px' }, t('sessions.current')) : null,
            ]),
            el('div', { class: 'session-card-meta' }, (s.user_agent || t('sessions.unknown')).slice(0, 60)),
            el('div', { class: 'session-card-meta' }, (s.ip || '?') + ' · ' + t('sessions.activeAt', { time: fmtTime(s.last_seen) })),
          ]),
          !s.current ? el('div', { class: 'session-card-actions' }, [
            el('button', { class: 'danger', style: 'font-size:13px;padding:6px 12px', on: { click: async () => {
              await api('/api/me/sessions/' + s.id, { method: 'DELETE' });
              openSettingsModal('sessions');
            } } }, t('sessions.revoke')),
          ]) : null,
        ]));
      }
    }).catch(e => { sessBox.textContent = t('sessions.failedToLoad', { error: e.message }); });

    // QR login — scan a code shown on another device's login page to log it in
    // directly (no password/2FA re-entry there — this session already did that).
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sessions.loginAnotherDevice'))]),
      el('div', { class: 'settings-hint', style: 'margin:-2px 0 8px;font-size:12px;opacity:.7' },
        t('sessions.scanHint')),
      el('button', { class: 'ghost', style: 'font-size:13px;padding:6px 12px', on: { click: scanQrLoginModal } }, t('sessions.scanQr')),
    ]));

    // Trusted devices — per-device identities exempt from risk/geo forced logout.
    const devBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('sessions.trusted'))]),
      el('div', { class: 'settings-hint', style: 'margin:-2px 0 8px;font-size:12px;opacity:.7' },
        t('sessions.trustedHint')),
      devBox,
    ]));
    api('/api/me/devices').then(r => {
      devBox.innerHTML = '';
      if (!r.devices || !r.devices.length) { devBox.append(el('div', { class: 'session-card-meta' }, t('sessions.noTrusted'))); return; }
      const isMob = lbl => /Android|iOS|iPhone|iPad/i.test(lbl || '');
      for (const d of r.devices) {
        devBox.append(el('div', { class: 'session-card' + (d.current ? ' current' : '') }, [
          el('div', { class: 'session-card-icon' }, [icon(isMob(d.label) ? 'smartphone' : 'monitor', 18)]),
          el('div', { class: 'session-card-body' }, [
            el('div', { class: 'session-card-name' }, [
              d.label || t('sessions.device'),
              d.current ? el('span', { class: 'tag ok', style: 'font-size:10px;padding:1px 6px' }, t('sessions.thisDeviceTag')) : null,
            ]),
            el('div', { class: 'session-card-meta' }, (d.last_country ? d.last_country + ' · ' : '') + t('sessions.lastUsed', { time: fmtTime(d.last_seen) })),
          ]),
          !d.current ? el('div', { class: 'session-card-actions' }, [
            el('button', { class: 'danger', style: 'font-size:13px;padding:6px 12px', on: { click: async () => {
              if (!(await confirmModal(t('sessions.removeConfirm')))) return;
              await api('/api/me/devices/' + d.id, { method: 'DELETE' });
              openSettingsModal('sessions');
            } } }, t('common.remove')),
          ]) : null,
        ]));
      }
    }).catch(e => { devBox.textContent = t('sessions.failedToLoad', { error: e.message }); });
  } else if (cur === 'blocked') {
    const blockBox = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    const countTag = el('span', { class: 'tag', style: 'font-size:12px' });
    panel.append(el('div', { class: 'settings-section' }, [
      el('div', { class: 'settings-section-head' }, [el('h4', {}, t('blocked.title')), countTag]),
      blockBox,
    ]));
    api('/api/blocked').then(r => {
      state.blockedList = r.blocked;
      state.blockedIds = new Set(r.blocked.map(b => b.id));
      blockBox.innerHTML = '';
      countTag.textContent = r.blocked.length ? t('blocked.count', { n: r.blocked.length }) : '';
      if (!r.blocked.length) {
        blockBox.append(el('div', { class: 'empty-state' }, [icon('ban', 40), el('p', {}, t('blocked.none'))]));
        return;
      }
      for (const b of r.blocked) {
        blockBox.append(el('div', { class: 'blocked-row' }, [
          avatarEl(b, 'small'),
          el('div', { class: 'blocked-row-info' }, [
            el('div', { class: 'blocked-row-name' }, userLabel(b)),
            el('div', { class: 'blocked-row-sub' }, t('blocked.tag')),
          ]),
          el('button', { class: 'ghost', style: 'font-size:13px;padding:6px 12px', on: { click: async () => { await unblockUser(b.id); openSettingsModal('blocked'); } } }, t('blocked.unblock')),
        ]));
      }
    }).catch(e => { blockBox.textContent = t('sessions.failedToLoad', { error: e.message }); });
  } else if (cur === 'events') {
    panel.append(el('p', { class: 'muted', style: 'margin-top:-4px' }, t('events.intro')));
    const list = el('div', { class: 'events-settings-list' }, el('div', { class: 'muted' }, t('conn.loading')));
    panel.append(list);
    api('/api/events/active').then(({ events }) => {
      list.innerHTML = '';
      if (!events || !events.length) {
        list.append(el('div', { class: 'empty-state' }, [icon('sparkles', 40), el('p', {}, t('events.none'))]));
        return;
      }
      for (const ev of events) {
        const accent = ev.accent || '#5865f2';
        const card = el('div', { class: 'event-list-card' });
        card.style.setProperty('--ev-accent', accent);
        const head = el('div', { class: 'event-list-head' }, [
          el('div', {}, [
            el('div', { class: 'event-list-title' }, ev.title || t('events.defaultTitle')),
            ev.description ? el('div', { class: 'event-list-desc' }, ev.description) : null,
          ]),
          el('button', { class: 'ghost', style: 'flex-shrink:0', on: { click: () => showEventModal(ev, { force: true }) } }, t('events.view')),
        ]);
        card.append(head);
        if (ev.fields && ev.fields.length) {
          const tags = el('div', { class: 'event-list-fields' });
          for (const f of ev.fields) {
            if (!f.value) continue;
            const chipText = (f.label ? f.label + ': ' : '') + f.value;
            const chip = el('span', { class: 'event-list-field' + (f.copyable ? ' copyable' : ''), title: f.copyable ? t('events.clickToCopy') : '' }, chipText);
            if (f.copyable) chip.addEventListener('click', () => {
              navigator.clipboard?.writeText(f.value).then(() => {}, () => {});
              chip.classList.add('copied'); chip.textContent = t('events.copied');
              setTimeout(() => { chip.classList.remove('copied'); chip.textContent = chipText; }, 1200);
            });
            tags.append(chip);
          }
          card.append(tags);
        }
        list.append(card);
      }
    }).catch((e) => { list.innerHTML = ''; list.append(el('div', { class: 'muted' }, t('sessions.failedToLoad', { error: e.message }))); });
  }

  panel.append(errBox);

  // Mobile settings use the same fully-functional section body assembled above,
  // but mount it in purpose-built tab-screen chrome instead of the desktop
  // split-view overlay. Desktop continues through the unchanged modal path.
  if (isMobile) {
    panel.querySelector(':scope > .settings-back')?.remove();
    panel.querySelector(':scope > .settings-title')?.remove();
    panel.prepend(el('header', { class: 'mobile-settings-titlebar' }, [
      el('button', { type: 'button', class: 'mobile-screen-back', title: t('common.back'), on: { click: showMobileYouScreen } }, '←'),
      el('h1', {}, labels[cur]),
    ]));
    mountMobileTabScreen(el('section', { class: 'mobile-settings-screen', dataset: { settingsTab: cur } }, panel), 'settings');
    return;
  }

  // If the settings modal is already open, swap the content in place (no
  // teardown/rebuild flash) and just move the active highlight in the nav.
  const existing = document.getElementById('settingsModalRoot');
  if (existing) {
    // A tab was picked — on mobile that means leaving the nav list for the panel.
    existing.querySelector('.settings-shell')?.classList.replace('s-list', 's-panel');
    const inner = existing.querySelector('.settings-content-inner');
    if (inner) { inner.innerHTML = ''; inner.append(panel); }
    existing.querySelector('.settings-content')?.scrollTo?.(0, 0);
    existing.querySelectorAll('.settings-nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === cur));
    return;
  }

  const root = $('#modalRoot');
  const close = () => {
    const e = document.getElementById('settingsModalRoot');
    if (!e || e.classList.contains('closing')) return;
    e.classList.add('closing');
    setTimeout(() => e.remove(), 200);
  };

  const groups = [
    { title: t('nav.userSettings'), items: ['profile', 'events', 'connections', 'privacy', 'security', 'sessions', 'blocked'] },
    { title: t('nav.appSettings'), items: ['voice', 'notifications', 'preferences', 'accessibility', 'language', 'keybinds', 'updates'] },
  ];
  const nav = el('div', { class: 'settings-nav' });
  for (const g of groups) {
    nav.append(el('div', { class: 'settings-nav-group' }, g.title));
    for (const t of g.items) {
      nav.append(el('button', {
        type: 'button', class: 'settings-nav-item' + (t === cur ? ' active' : ''),
        dataset: { tab: t },
        on: { click: () => openSettingsModal(t) },
      }, [el('span', { class: 'sn-icon' }, icon(icons[t], 18)), labels[t]]));
    }
  }
  nav.append(el('div', { class: 'settings-nav-sep' }));
  nav.append(el('a', {
    class: 'settings-nav-item', href: '/developers', target: internalPageTarget(), rel: 'noopener',
  }, [el('span', { class: 'sn-icon' }, icon('code', 18)), t('nav.developerPortal')]));
  nav.append(el('a', {
    class: 'settings-nav-item', href: '/bots', target: internalPageTarget(), rel: 'noopener',
  }, [el('span', { class: 'sn-icon' }, icon('shopping-bag', 18)), t('nav.botMarketplace')]));
  nav.append(el('a', {
    class: 'settings-nav-item', href: '/support', target: internalPageTarget(), rel: 'noopener',
  }, [el('span', { class: 'sn-icon' }, icon('message', 18)), t('tab.support')]));
  if (state.me && (state.me.is_admin || state.isSuperAdmin)) {
    nav.append(el('a', {
      class: 'settings-nav-item', href: '/admin', target: '_blank', rel: 'noopener',
    }, [el('span', { class: 'sn-icon' }, icon('shield', 18)), 'Admin panel']));
  }
  nav.append(el('button', {
    type: 'button', class: 'settings-nav-item danger',
    on: { click: () => document.getElementById('logoutBtn')?.click() },
  }, [el('span', { class: 'sn-icon' }, icon('log-out', 18)), t('common.logout')]));
  // Mobile list view header: title + close (the content ✕ is hidden with the content).
  nav.prepend(el('div', { class: 'settings-nav-mobile-head' }, [
    el('h2', {}, t('chrome.userSettings')),
    el('button', { type: 'button', class: 'settings-close settings-close-list', title: t('common.close'), on: { click: close } }, '✕'),
  ]));

  root.append(el('div', { class: 'modal-bg settings-fullscreen', id: 'settingsModalRoot', on: { click: (e) => { if (e.target === e.currentTarget) close(); } } },
    el('div', { class: 'settings-shell ' + (listView ? 's-list' : 's-panel') }, [
      el('div', { class: 'settings-sidebar' }, el('div', { class: 'settings-sidebar-inner' }, nav)),
      el('div', { class: 'settings-content' }, [
        el('button', { type: 'button', class: 'settings-close', title: t('common.close'), on: { click: close } }, '✕'),
        el('div', { class: 'settings-content-inner' }, panel),
      ]),
    ])
  ));
}

async function setupTotp() {
  try {
    const r = await api('/api/me/totp/setup', { method: 'POST' });
    const errBox = el('div', { class: 'error' });
    const codeInp = el('input', { placeholder: t('sec.enable2faCodePlaceholder'), maxlength: 6, autocomplete: 'off' });
    const qrDiv = el('div', { id: 'qrCanvas', style: 'display:flex;justify-content:center;margin:14px 0' });
    // Generate QR via lightweight inline lib using google chart fallback
    const otpauthUrl = r.otpauth_url;
    const img = new Image();
    img.alt = 'QR code';
    img.style.width = '180px'; img.style.height = '180px';
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(otpauthUrl);
    img.onerror = () => { qrDiv.textContent = otpauthUrl; };
    qrDiv.append(img);
    modal({
      title: t('sec.enable2fa'),
      content: el('div', {}, [
        el('p', {}, t('sec.enable2faStep1')),
        qrDiv,
        el('p', { class: 'muted-text', style: 'font-size:11px;word-break:break-all' }, t('sec.enable2faManual', { secret: r.secret })),
        el('p', {}, t('sec.enable2faStep2')),
        codeInp, errBox,
      ]),
      submitLabel: t('sec.enable2faSubmit'),
      onSubmit: async () => {
        try {
          const e = await api('/api/me/totp/enable', { method: 'POST', body: JSON.stringify({ code: codeInp.value.trim() }) });
          closeModalRoot();
          showBackupCodes(e.backup_codes);
        } catch (err) { errBox.textContent = err.message; return false; }
      },
    });
  } catch (e) { alert(t('sec.enable2faSetupFailed', { error: e.message })); }
}

// Deliberately NOT the shared modal() helper: by the time this shows, 2FA is
// already enabled server-side (setupTotp's /totp/enable call already flipped
// it before returning these codes) — so unlike every other modal(), there's
// no safe "Cancel"/backdrop-click dismissal here. If someone closes this
// without saving the codes, they've got live 2FA with an unrecoverable backup
// set the moment they lose their authenticator. Done stays disabled until
// they explicitly confirm they saved the codes.
function showBackupCodes(codes) {
  const checkbox = el('input', { type: 'checkbox', id: 'bkSavedCheck' });
  const doneBtn = el('button', { type: 'button', disabled: true }, t('sec.backupCodesDone'));
  const card = el('div', { class: 'modal' }, [
    el('h3', {}, t('sec.backupCodesTitle')),
    el('p', {}, t('sec.backupCodesHint')),
    el('pre', { class: 'backup-codes' }, codes.join('\n')),
    el('button', { type: 'button', class: 'ghost', on: { click: () => { navigator.clipboard.writeText(codes.join('\n')); alert(t('sec.copied')); } } }, t('sec.copyToClipboard')),
    el('label', { style: 'display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;cursor:pointer' }, [
      checkbox, t('sec.backupCodesConfirmLabel'),
    ]),
    el('div', { class: 'row' }, [doneBtn]),
  ]);
  const overlay = el('div', { class: 'modal-bg' }, card);
  checkbox.addEventListener('change', () => { doneBtn.disabled = !checkbox.checked; });
  doneBtn.addEventListener('click', () => animateOut(overlay));
  document.body.append(overlay);
}

// ─── Unread badges ────────────────────────────────────────────────────────────

async function loadUnread() {
  try {
    const r = await api('/api/me/unread');
    state.unread = new Map(r.unread.map(u => [u.chat_id, u]));
  } catch { state.unread = new Map(); }
  try { renderRailDots(); } catch {}
  // Boot loads friends + unread concurrently; whichever finishes last has to be
  // the one that paints, or the mobile tab badges show a stale (usually empty)
  // count until the next socket event happens to refresh them.
  try { updateDocTitle(); } catch {}
}
function unreadCount(chatId) {
  const u = state.unread && state.unread.get(chatId);
  return u ? u.unread : 0;
}
async function markChatRead(chatId, messageId) {
  try {
    await api('/api/chats/' + chatId + '/read', { method: 'POST', body: JSON.stringify({ messageId: messageId || 0 }) });
    if (state.unread) {
      const cur = state.unread.get(chatId);
      if (cur) { cur.unread = 0; cur.last_read = messageId || cur.last_message_id; }
    }
    updateSidebarUnreadBadge(chatId);
    updateDocTitle();
    renderRailDots();
  } catch {}
}

// ─── Mentions inbox ───────────────────────────────────────────────────────────
async function jumpToMention(m) {
  const chat = state.chats.find(c => c.id === m.chat_id) || { id: m.chat_id, type: m.chat_type, name: m.chat_name, server_id: m.server_id };
  await jumpToMessageId(m.chat_id, m.id, chat);
}
function openInbox() {
  const mobile = isMobileLayout();
  if (mobile) rememberMobileRoot();
  const body = el('div', { class: 'inbox-screen-body' }, el('div', { class: 'muted-text' }, t('inbox.loading')));
  let overlay = null;
  const close = () => {
    if (mobile) { returnFromMobileTabScreen(); return; }
    if (!overlay || overlay.classList.contains('closing')) return;
    overlay.classList.add('closing');
    setTimeout(() => overlay?.remove(), 200);
  };
  const screen = el('section', { class: 'inbox-screen' }, [
    el('header', { class: 'inbox-screen-head' }, [
      el('button', { type: 'button', class: 'inbox-screen-close', title: t('common.close'), on: { click: close } }, mobile ? '←' : '✕'),
      el('h1', {}, t('inbox.title')),
    ]),
    body,
  ]);
  if (mobile) {
    state.view = 'notifications'; state.activeChatId = null;
    mountMobileTabScreen(screen, 'notifications');
  } else {
    overlay = el('div', { class: 'modal-bg inbox-fullscreen', id: 'inboxScreenRoot' }, screen);
    document.getElementById('modalRoot').append(overlay);
  }
  api('/api/me/mentions').then((r) => {
    body.innerHTML = '';
    const list = r.mentions || [];
    if (!list.length) {
      body.append(el('div', { class: 'inbox-empty' }, [icon('inbox', 42), el('p', {}, t('inbox.empty'))]));
      return;
    }
    for (const m of list) {
      const ctx = m.chat_type === 'dm' ? t('inbox.directMessage')
        : m.chat_type === 'general' ? t('inbox.general')
        : m.chat_type === 'group' ? (m.chat_name || t('inbox.group'))
        : '# ' + (m.chat_name || t('inbox.channel'));
      body.append(el('button', { type: 'button', class: 'inbox-item', on: { click: () => { if (!mobile) close(); jumpToMention(m); } } }, [
        avatarEl(m, 'small'),
        el('div', { class: 'inbox-body' }, [
          el('div', { class: 'inbox-top' }, [
            el('span', { class: 'inbox-name' }, userLabel(m)),
            el('span', { class: 'inbox-ctx' }, ctx),
            el('span', { class: 'inbox-time' }, fmtTime(m.created_at)),
          ]),
          el('div', { class: 'inbox-text' }, (m.content || '').slice(0, 140)),
        ]),
      ]));
    }
  }).catch(() => {
    body.innerHTML = '';
    body.append(el('div', { class: 'inbox-empty' }, t('inbox.loadFailed')));
  });
}

// ─── Slowmode banner ──────────────────────────────────────────────────────────

function showSlowmodeBanner(seconds) {
  const ind = $('#slowmodeBanner');
  if (!ind) return;
  ind.style.display = 'block';
  ind.textContent = `⏳ Slowmode: wait ${seconds}s before sending another message.`;
  clearTimeout(ind._t);
  ind._t = setTimeout(() => { ind.style.display = 'none'; }, seconds * 1000);
}

// ─── Screen sharing ───────────────────────────────────────────────────────────

function screenShareSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || nativeScreenSupported();
}

// The Android app captures the screen natively (MediaProjection) and hands the
// frames to us, because Android's WebView has no getDisplayMedia at all.
function nativeScreenSupported() {
  try { return !!(window.DisdrocNative && window.DisdrocNative.screenCaptureSupported()); } catch { return false; }
}

// Screen-share dock view: pick what to share, whether to bring audio, and at what
// quality — then a clear Stop while sharing. Replaces the old floating menu, which
// on a phone covered the call it was configuring.
function renderScreenDock(host) {
  // Persisted preferences for the next share.
  const prefs = state.voice.screenPrefs || (state.voice.screenPrefs = { audio: true, fps: 30 });
  if (prefs.fps !== 60) prefs.fps = 30;

  // Already sharing → show what's live and how to stop it.
  if (state.voice.screenStream) {
    const tr = state.voice.screenStream.getVideoTracks()[0];
    const s = (tr && tr.getSettings) ? tr.getSettings() : {};
    host.append(el('div', { class: 'dock-note' }, [
      icon('monitor', 16),
      el('span', {}, t('dock.sharingScreen')
        + (s.width && s.height ? ' — ' + s.width + '×' + s.height : '')
        + (state.voice.screenStream.getAudioTracks().length ? ' ' + t('dock.withAudio') : '')),
    ]));
    host.append(el('button', {
      type: 'button', class: 'dock-action danger',
      on: { click: () => { stopScreenShare(); refreshDock(); } },
    }, [icon('monitor', 16), el('span', {}, t('chrome.stopSharing'))]));
    return;
  }

  const webCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  if (!webCapture && !nativeScreenSupported()) {
    host.append(el('p', { class: 'muted-text' }, isMobileLayout()
      ? t('dock.noCaptureMobile')
      : t('dock.noCaptureDesktop')));
    return;
  }

  const grid = el('div', { class: 'ss-grid' });
  const pick = (ic, label, sub, onClick) => el('button', {
    type: 'button', class: 'ss-source', on: { click: onClick },
  }, [
    el('span', { class: 'ss-source-ic' }, icon(ic, 20)),
    el('span', { class: 'ss-source-txt' }, [
      el('strong', {}, label),
      el('span', { class: 'ss-source-sub' }, sub),
    ]),
  ]);

  if (webCapture) {
    grid.append(pick('monitor', t('dock.entireScreen'), t('dock.entireScreenSub'),
      () => startScreenShare({ displaySurface: 'monitor', audio: prefs.audio, fps: prefs.fps, hd: prefs.hd })));
    grid.append(pick('maximize', t('dock.aWindow'), t('dock.aWindowSub'),
      () => startScreenShare({ displaySurface: 'window', audio: prefs.audio, fps: prefs.fps, hd: prefs.hd })));
    grid.append(pick('globe', t('dock.aBrowserTab'), t('dock.aBrowserTabSub'),
      () => startScreenShare({ displaySurface: 'browser', audio: prefs.audio, fps: prefs.fps, hd: prefs.hd })));
  } else {
    grid.append(pick('smartphone', t('dock.thisPhoneScreen'), t('dock.thisPhoneScreenSub'),
      () => startNativeScreenShare({ fps: prefs.mobileFps || 12 })));
  }
  host.append(grid);

  const opts = el('div', { class: 'dock-opts' });

  if (webCapture) {
    opts.append(dockToggle(t('dock.shareAudioToo'), prefs.audio, (on) => { prefs.audio = on; }));
    opts.append(dockChoice(t('dock.quality'), [
      { v: true, label: '1080p' },
      { v: false, label: '720p' },
    ], prefs.hd !== false, (v) => { prefs.hd = v; }));
    opts.append(dockChoice(t('dock.frameRate'), [
      { v: 30, label: '30 fps' },
      { v: 60, label: '60 fps' },
    ], prefs.fps, (v) => { prefs.fps = v; }));
  } else {
    // Phone capture is CPU-and-battery bound, not bandwidth bound: every frame is
    // JPEG-encoded natively and re-decoded in the WebView, so framerate is the
    // dial that matters and 12 is the sweet spot on a mid-range device.
    opts.append(dockChoice(t('dock.smoothness'), [
      { v: 8, label: t('dock.batterySaver') },
      { v: 12, label: t('dock.balanced') },
      { v: 20, label: t('dock.smooth') },
    ], prefs.mobileFps || 12, (v) => { prefs.mobileFps = v; }));
  }
  host.append(opts);
}

// Small labelled on/off row used by the dock panels. Not a checkbox: it needs to
// read at a glance and be hit with a thumb.
function dockToggle(label, initial, onChange) {
  let on = !!initial;
  const btn = el('button', { type: 'button', class: 'dock-toggle' + (on ? ' on' : '') }, [
    el('span', { class: 'dock-toggle-label' }, label),
    el('span', { class: 'dock-switch' }, el('span', { class: 'dock-knob' })),
  ]);
  btn.addEventListener('click', () => { on = !on; btn.classList.toggle('on', on); onChange(on); });
  return btn;
}

// A labelled segmented control (2–4 options). Used instead of a <select>, which
// opens a native popup list — the thing we are getting rid of.
function dockChoice(label, options, current, onChange) {
  const seg = el('div', { class: 'dock-seg' });
  const btns = options.map((o) => {
    const b = el('button', { type: 'button', class: 'dock-seg-btn' + (o.v === current ? ' on' : '') }, o.label);
    b.addEventListener('click', () => {
      for (const other of btns) other.classList.remove('on');
      b.classList.add('on');
      onChange(o.v);
    });
    return b;
  });
  for (const b of btns) seg.append(b);
  return el('div', { class: 'dock-opt-row' }, [el('span', { class: 'dock-opt-label' }, label), seg]);
}

function stopScreenShare() {
  if (_nativeScreen) teardownNativeScreen();
  if (!state.voice.screenStream) return;
  const streamId = state.voice.screenStream.id;
  for (const t of state.voice.screenStream.getTracks()) t.stop();
  state.voice.screenStream = null;
  state.voice.screenFps = 30;
  for (const [, peer] of state.voice.peers) {
    if (peer.screenSender) { try { peer.pc.removeTrack(peer.screenSender); } catch {} peer.screenSender = null; }
    if (peer.screenAudioSender) { try { peer.pc.removeTrack(peer.screenAudioSender); } catch {} peer.screenAudioSender = null; }
    peer._vTier = 0; // fresh back-off budget for the next share
    peer._vFpsBackoff = false;
  }
  state.socket.emit('voice:screen-state', { on: false, streamId });
  renderVoiceBar();
  refreshDock();
}

async function startScreenShare(opts = {}) {
  if (state.voice.channelId == null) { alert('Join a voice channel first.'); return; }
  if (state.voice.screenStream) return; // already sharing
  if (!screenShareSupported()) {
    alert('Screen sharing isn’t available on phones — Android doesn’t let apps capture the screen into a call. Use disdroc on a computer (browser or desktop app) to share your screen.');
    return;
  }
  const hd = opts.hd !== false;
  const fps = Number(opts.fps) === 60 ? 60 : 30;
  const video = { frameRate: { ideal: fps, max: fps },
    width: { ideal: hd ? 1920 : 1280 }, height: { ideal: hd ? 1080 : 720 } };
  // displaySurface is a hint that pre-selects a tab in the browser's picker.
  if (opts.displaySurface) video.displaySurface = opts.displaySurface;
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video,
      // suppressLocalAudioPlayback prevents the captured audio from looping back through
      // the sharer's own speakers — share a specific window/tab to avoid echo for others.
      audio: opts.audio === false ? false : { suppressLocalAudioPlayback: true, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    // NotAllowedError / AbortError = the user dismissed the picker — stay silent.
    if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;
    console.warn('screen share failed', e);
    alert('Could not start screen sharing: ' + ((e && e.message) || e));
    return;
  }
  // audioTrack is present only if the user allowed audio and the browser supports it.
  adoptScreenStream(stream, stream.getAudioTracks()[0], fps);
}

// Publish a finished screen stream to every peer. Shared by the desktop
// getDisplayMedia path and the phone's canvas-backed native capture, so both get
// identical bitrate tiering and signalling.
function adoptScreenStream(stream, audioTrack, fps = 30) {
  state.voice.screenStream = stream;
  state.voice.screenFps = fps === 60 ? 60 : 30;
  const track = stream.getVideoTracks()[0];
  try { track.contentHint = 'motion'; } catch {}
  // Native "Stop sharing" button (browser UI) ends the track → tear down.
  track.addEventListener('ended', () => { if (state.voice.screenStream === stream) stopScreenShare(); });
  for (const [, peer] of state.voice.peers) {
    peer._vFpsBackoff = false;
    peer.screenSender = peer.pc.addTrack(track, stream);
    if (audioTrack) peer.screenAudioSender = peer.pc.addTrack(audioTrack, stream);
  }
  retuneScreenSenders();
  // Tell peers which stream id is a screen share so they render it as such.
  state.socket.emit('voice:screen-state', { on: true, streamId: stream.id });
  renderVoiceBar();
  refreshDock();
}

// The single binary action behind every "share screen" button — the sidebar
// voice panel, the call bar's own Screen button and the ••• menu's row.
// "Share what?" is answered by the browser's picker (or Android's consent
// dialog), so one click is genuinely enough; the dock's Screen tab is only there
// for the audio/quality knobs, and for telling an unsupported browser why it
// can't share — which is where a click lands when there is nothing to start.
async function toggleScreenShare(anchor) {
  if (state.voice.screenStream) { stopScreenShare(); return; }
  if (!screenShareSupported()) { toggleCallPopover('screen', anchor || document.body); return; }
  const p = state.voice.screenPrefs || (state.voice.screenPrefs = { audio: true, fps: 30 });
  if (!navigator.mediaDevices?.getDisplayMedia) {
    // Native capture is framerate-bound, not bandwidth-bound: it has its own
    // saved dial and must not inherit the desktop share's 30fps.
    await startNativeScreenShare({ fps: p.mobileFps || 12 });
    return;
  }
  await startScreenShare({ audio: p.audio !== false, fps: p.fps, hd: p.hd });
}

// ─── Phone screen share (Android app) ─────────────────────────────────────────
// Android's WebView implements no getDisplayMedia, so the app captures the screen
// natively with MediaProjection and hands us JPEG frames. We paint those into a
// <canvas> and take canvas.captureStream() — which is a perfectly ordinary
// MediaStreamTrack, so every line of peer/signalling/bitrate code below treats a
// phone share exactly like a desktop one.
let _nativeScreen = null;

function startNativeScreenShare(opts = {}) {
  if (state.voice.channelId == null) { alert('Join a voice channel first.'); return; }
  if (state.voice.screenStream || _nativeScreen) return;
  if (!nativeScreenSupported()) return;

  return new Promise((resolve) => {
    const fps = Math.max(5, Math.min(30, opts.fps || 12));
    let settled = false;
    const fail = (msg) => {
      if (settled) return; settled = true;
      teardownNativeScreen();
      if (msg) alert('Could not start screen sharing: ' + msg);
      refreshDock(); resolve();
    };

    // The user still has to accept Android's system consent dialog, so give up
    // rather than hang forever if nothing comes back.
    const timeout = setTimeout(() => fail(null), 45000);

    window.__disdrocScreenStarted = (statusJson) => {
      if (settled) return; settled = true;
      clearTimeout(timeout);
      let st = {};
      try { st = JSON.parse(statusJson || '{}'); } catch {}
      try { attachNativeScreenCanvas(st, fps); } catch (e) { fail(e.message); return; }
      refreshDock(); resolve();
    };
    window.__disdrocScreenStopped = (reason) => {
      clearTimeout(timeout);
      // "user" = they hit Stop in Android's own notification/status bar. Mirror
      // the desktop behaviour where killing the share from browser chrome tears
      // the whole thing down here too.
      if (!settled) { settled = true; resolve(); }
      if (state.voice.screenStream || _nativeScreen) stopScreenShare();
      if (reason && reason.indexOf('error:') === 0) console.warn('screen capture', reason);
    };

    try {
      window.DisdrocNative.startScreenCapture(JSON.stringify({
        fps, maxWidth: 1280, quality: 45,
      }));
    } catch (e) { clearTimeout(timeout); fail(e.message); }
  });
}

function attachNativeScreenCanvas(status, fps) {
  const w = Math.max(2, status.width || 720);
  const h = Math.max(2, status.height || 1280);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const st = { canvas, ctx, img: null, timer: null, transport: status.transport || 'mjpeg' };
  _nativeScreen = st;

  if (st.transport === 'mjpeg') {
    // The <img> updates itself as the multipart response streams in; our only job
    // is to copy whatever it currently shows into the canvas.
    const img = document.createElement('img');
    img.decoding = 'sync';
    img.src = status.url || '/__disdroc_screen.mjpeg';
    st.img = img;
    st.draw = () => {
      if (_nativeScreen !== st || !img.naturalWidth) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    // setInterval, never requestAnimationFrame: rAF stops dead the moment the
    // WebView stops being the visible window — which for a *phone* screen share
    // is the normal case, since the whole point is that you switched to another
    // app. The native side also pokes __disdrocScreenTick per captured frame, so
    // this timer is only the fallback for when the app is in the foreground.
    st.timer = setInterval(st.draw, Math.round(1000 / fps));
    window.__disdrocScreenTick = () => { try { st.draw(); } catch {} };
  } else {
    // Fallback transport: base64 JPEG pushed one frame at a time over the JS
    // bridge. No timer at all — we draw exactly when a frame arrives, which also
    // makes it immune to background timer throttling.
    const img = new Image();
    st.img = img;
    let pending = null, decoding = false;
    const pump = () => {
      if (_nativeScreen !== st || decoding || !pending) return;
      decoding = true;
      const data = pending; pending = null;
      img.onload = () => {
        decoding = false;
        if (_nativeScreen === st) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        pump();
      };
      img.onerror = () => { decoding = false; pump(); };
      img.src = 'data:image/jpeg;base64,' + data;
    };
    window.__disdrocScreenFrame = (b64) => { pending = b64; pump(); };
  }

  const stream = canvas.captureStream(fps);
  st.stream = stream;
  adoptScreenStream(stream, null);
}

function teardownNativeScreen() {
  const st = _nativeScreen;
  _nativeScreen = null;
  if (st) {
    if (st.timer) clearInterval(st.timer);
    if (st.img) { st.img.onload = st.img.onerror = null; st.img.src = ''; }
    if (st.stream) for (const t of st.stream.getTracks()) t.stop();
  }
  window.__disdrocScreenTick = null;
  window.__disdrocScreenFrame = null;
  try { window.DisdrocNative && window.DisdrocNative.stopScreenCapture(); } catch {}
}

// ─── Bandwidth meter in voice stats ───────────────────────────────────────────

async function fetchBandwidth(peer) {
  try {
    const stats = await peer.pc.getStats();
    let outBytes = 0, inBytes = 0;
    for (const r of stats.values()) {
      if (r.type === 'outbound-rtp' && r.kind === 'video' || r.kind === 'audio') outBytes += r.bytesSent || 0;
      if (r.type === 'inbound-rtp' && r.kind === 'video' || r.kind === 'audio') inBytes += r.bytesReceived || 0;
    }
    if (peer._lastBytes) {
      const dt = (Date.now() - peer._lastBytes.ts) / 1000;
      peer.kbpsUp = ((outBytes - peer._lastBytes.up) / dt / 1024) | 0;
      peer.kbpsDown = ((inBytes - peer._lastBytes.down) / dt / 1024) | 0;
    }
    peer._lastBytes = { up: outBytes, down: inBytes, ts: Date.now() };
  } catch {}
}
const _origStatsLoop = typeof startStatsLoop === 'function' ? startStatsLoop : null;

// ─── IndexedDB message cache ──────────────────────────────────────────────────

const IDB_NAME = 'disdroc';
const IDB_VERSION = 1;
let idbReady = null;
function openIdb() {
  if (idbReady) return idbReady;
  idbReady = new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'chatId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return idbReady;
}
async function cacheChatMessages(chatId, messages) {
  const db = await openIdb(); if (!db) return;
  try {
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put({ chatId, messages: messages.slice(-50), updatedAt: Date.now() });
  } catch {}
}
async function getCachedMessages(chatId) {
  const db = await openIdb(); if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('messages', 'readonly');
      const req = tx.objectStore('messages').get(chatId);
      req.onsuccess = () => resolve(req.result ? req.result.messages : null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

// ─── Message virtualization (prune top when too many) ────────────────────────

const MAX_RENDERED_MESSAGES = 300;
function prune() {
  const m = $('#messages');
  if (!m) return;
  const nodes = m.querySelectorAll('.msg');
  if (nodes.length <= MAX_RENDERED_MESSAGES) return;
  const toRemove = nodes.length - MAX_RENDERED_MESSAGES;
  for (let i = 0; i < toRemove; i++) nodes[i].remove();
  state.hasMoreMessages = true;
  state.oldestMsgTs = +(m.querySelector('.msg')?.dataset.id ? 0 : 0); // forces server re-fetch via id timestamp
}

// ─── Wire-up new socket handlers ──────────────────────────────────────────────

function attachNewSocketHandlers() {
  if (!state.socket) return;
  const refreshFriends = async () => {
    try {
      await loadFriends(); renderSidebar();
      if ($('#friendsPanel')) renderFriendsPanel();
    } catch {}
  };
  state.socket.on('friend:request', refreshFriends);
  state.socket.on('friend:accepted', refreshFriends);
  state.socket.on('friend:removed', refreshFriends);
  // Joined a server (via an invite, on any of this user's sessions) → refresh the rail live.
  state.socket.on('server:joined', async () => {
    try { await loadServers(); renderServerRail(); loadMyEmojis().catch(() => {}); } catch {}
  });
  // You were kicked or banned from a server — tell them why, then drop it from the rail live.
  state.socket.on('server:removed', async ({ serverId, action, reason }) => {
    try {
      const name = (state.servers.find(s => s.id === serverId) || {}).name || 'a server';
      const wasActive = state.view === 'server' && state.serverId === serverId;
      state.servers = (state.servers || []).filter(s => s.id !== serverId);
      if (wasActive) switchToHome();
      renderServerRail();
      loadMyEmojis().catch(() => {});
      if (action === 'ban') alert('You\'ve been banned from ' + name + (reason ? ':\n' + reason : '.'));
      else if (action === 'kick') alert('You\'ve been kicked from ' + name + (reason ? ':\n' + reason : '.'));
    } catch {}
  });
  // A moderator timed you out (or lifted it) in a server.
  state.socket.on('server:timeout', ({ serverId, until }) => {
    if (until && until > Date.now()) {
      const name = (state.servers.find(s => s.id === serverId) || {}).name || 'this server';
      try { alert('You\'ve been timed out in ' + name + ' until ' + new Date(until).toLocaleString() + '. You can\'t send messages or talk in voice there until then.'); } catch {}
    }
  });
  // An admin banned this account platform-wide while it was live (idle tab, an
  // open call, etc). The server has already force-closed this socket right
  // after emitting this — bounce to the branded ban screen immediately instead
  // of waiting for the user's next API call to hit the 403 'banned' check.
  state.socket.on('account:banned', ({ reason, until } = {}) => {
    try { clearToken(); } catch {}
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    if (until) params.set('until', until);
    location.href = '/banned' + (params.toString() ? '?' + params.toString() : '');
  });
  // Someone's roster/roles changed (joined, left, kicked, banned, timed out,
  // promoted/demoted, or role-assigned/edited) — live-refresh the member list
  // instead of leaving it stale until the next manual reload.
  const refreshServerRoster = async (serverId) => {
    if (state.view !== 'server' || state.serverId !== serverId) return;
    try { await loadServer(serverId); renderRightPanel(); } catch {}
  };
  state.socket.on('server:members_updated', ({ serverId }) => refreshServerRoster(serverId));
  state.socket.on('server:roles_updated', ({ serverId }) => refreshServerRoster(serverId));
  // A channel was created/renamed/deleted somewhere in this server — live-refresh
  // the sidebar instead of leaving it stale until the next manual reload.
  state.socket.on('server:channels_updated', async ({ serverId }) => {
    if (state.view !== 'server' || state.serverId !== serverId) return;
    try { await loadServer(serverId); renderSidebar(); } catch {}
  });
  state.socket.on('message:preview', ({ messageId, preview }) => {
    const node = $('.msg[data-id="' + messageId + '"]');
    if (!node) return;
    if (node.querySelector('.link-preview') || node.querySelector('.spotify-embed')) return;
    const body = node.querySelector('.body');
    const ra = node.querySelector('.reactions-bar');
    const lp = renderLinkPreview(preview);
    if (lp) ra ? body.insertBefore(lp, ra) : body.append(lp);
  });
  state.socket.on('user:warned', (w) => {
    showWarningModal([w]);
  });
  state.socket.on('event:new', (ev) => {
    // An admin published/re-popped an event — force it to show even if seen before.
    showEventModal(ev, { force: true });
  });
  state.socket.on('user:status', ({ userId, status_type, status_text, status_emoji }) => {
    // Patch in-memory server members so re-renders pick up the change.
    if (state.serverDetail && state.serverDetail.members) {
      for (const mem of state.serverDetail.members) {
        if (mem.id === userId) {
          mem.status_type = status_type;
          mem.status_text = status_text;
          mem.status_emoji = status_emoji;
        }
      }
    }
    if (state.view === 'server') renderRightPanel();
  });
  state.socket.on('user:profile-changed', (info) => {
    (async () => {
      try {
        if (info && info.userId === (state.me && state.me.id)) {
          await loadMe(); renderMe();
        }
        await loadChats(); await loadFriends();
        renderSidebar();
        // Refresh the open chat header in case it's a DM with the user whose profile changed.
        if (state.activeChatId) {
          const c = state.chats.find(x => x.id === state.activeChatId);
          if (c) $('#chatTitle').textContent = chatTitle(c);
        }
        if (state.view === 'server') renderRightPanel();
        // Update avatars and names already rendered in the visible chat.
        if (info && info.userId) {
          const newAvatar = info.avatar_path == null ? null : '/api/avatar/' + info.avatar_path;
          for (const node of document.querySelectorAll('.msg .avatar')) {
            const userId = node.dataset.uid;
            if (userId && +userId === +info.userId) {
              const img = node.querySelector('img');
              if (newAvatar && img) img.src = newAvatar;
              else if (newAvatar && !img) {
                node.innerHTML = '';
                node.append(el('img', { src: newAvatar, alt: '' }));
              } else if (!newAvatar) {
                node.innerHTML = ''; node.textContent = initials(info.display_name || info.username || '?');
              }
            }
          }
        }
      } catch {}
    })();
  });
}

// ─── Init augment ─────────────────────────────────────────────────────────────

const _origConnectSocket = connectSocket;
connectSocket = function() { _origConnectSocket(); attachNewSocketHandlers(); };

const _origOpenChat = openChat;
openChat = async function(chatId, hint) {
  await _origOpenChat(chatId, hint);
  // Mark latest message as read
  const lastNode = $('#messages').querySelector('.msg:last-child');
  if (lastNode && lastNode.dataset.id) markChatRead(chatId, +lastNode.dataset.id);
};

const _origAppendMessage = appendMessage;
appendMessage = function(m) {
  _origAppendMessage(m);
  // Update unread + read mark
  if (m.chat_id === state.activeChatId) {
    markChatRead(m.chat_id, m.id);
  }
  // Slowmode hint: nothing here (server returns ack)
  // Virtualize
  prune();
};


// ─── Idle wiring ─────────────────────────────────────────────────────────────

['mousemove','keydown','click','touchstart'].forEach(ev => document.addEventListener(ev, bumpIdle, { passive: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { bumpIdle(); beatFocus(); } });

// Push-to-talk: transmit only while the chosen key is held (when in a call).
document.addEventListener('keydown', (e) => {
  if (!pttEnabled() || state.voice.channelId == null || e.code !== pttKey()) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  if (!_pttHeld) { _pttHeld = true; applyMicState(); }
}, true);
document.addEventListener('keyup', (e) => {
  if (e.code !== pttKey()) return;
  if (_pttHeld) { _pttHeld = false; applyMicState(); }
}, true);

// Release mic/camera test streams when the settings modal closes.
// subtree:true so the check also fires the moment a closing modal gains
// .anim-out — mic/cam test streams stop at close, not after the fade.
new MutationObserver(() => { if (![...$('#modalRoot').children].some((n) => !n.classList.contains('anim-out'))) stopAllMediaTests(); }).observe($('#modalRoot'), { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });

// Tick all visible "Playing X" elapsed timers once a second.
setInterval(() => {
  document.querySelectorAll('.activity-elapsed[data-since]').forEach((elm) => {
    const since = +elm.dataset.since;
    if (since) elm.textContent = fmtElapsed(since) + (elm.dataset.suffix || '');
  });
}, 1000);

// Desktop game tracker bridge: the Electron wrapper reports the active game here.
if (window.disdrocDesktop && window.disdrocDesktop.onActivity && !window._disdrocActBound) {
  window._disdrocActBound = true;
  window.disdrocDesktop.onActivity((a) => {
    if (!state.me) return;
    const share = localStorage.getItem('disdroc_share_activity') !== 'off';
    const act = (share && a && a.name) ? { name: String(a.name), since: a.since || Date.now() } : null;
    if (act) state.activities.set(state.me.id, act); else state.activities.delete(state.me.id);
    try { state.socket && state.socket.emit('presence:activity', act); } catch {}
    renderMe(); refreshActivityViews();
  });
}

// ─── Settings + quick-switcher hotkeys ────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openQuickSwitcher();
  }
  if (voiceNoteRec && e.key === 'Escape') {
    stopVoiceNote(false);
  }
});

// Alt+↑/↓ — navigate the visible channels in the open server.
// Add Shift to skip channels without unread messages.
document.addEventListener('keydown', (e) => {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  const t = e.target;
  if ((state.view !== 'server' && state.view !== 'home' && state.view !== 'friends')
    || document.querySelector('.modal-bg, dialog[open], .floating-menu')
    || (t && t.closest && t.closest('input, textarea, select, [contenteditable], .CodeMirror, .monaco-editor, .ace_editor'))) return;
  const dir = e.key === 'ArrowDown' ? 1 : -1;
  const rows = [...document.querySelectorAll('#sidebarContent .list-item[data-chat-id]')]
    .filter(row => !row.closest('.cat-wrap.collapsed'))
    .filter(row => !e.shiftKey || unreadCount(Number(row.dataset.chatId)) > 0);
  if (!rows.length) return;
  e.preventDefault();
  const cur = rows.findIndex(row => Number(row.dataset.chatId) === state.activeChatId);
  rows[(cur + dir + rows.length) % rows.length].click();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// Translate the static chrome baked into app.html (titles, placeholders, button
// text). Dynamic UI uses t() at render time; this covers the markup that ships
// pre-rendered in the HTML so it's localized on first paint.
function applyStaticChrome() {
  const T = (k) => t(k);
  const setText = (sel, k) => { const e = $(sel); if (e) e.textContent = T(k); };
  const setAttr = (sel, attr, k) => { const e = $(sel); if (e) e.setAttribute(attr, T(k)); };
  setText('#sidebarSearch', 'chrome.findConversation');
  setAttr('#headerSearch', 'placeholder', 'chrome.search');
  setAttr('#msgInput', 'placeholder', 'chrome.message');
  setText('#msgSend .send-label', 'chrome.send');
  setText('[data-tab-label="home"]', 'tabbar.home');
  setText('[data-tab-label="friends"]', 'tabbar.friends');
  setText('[data-tab-label="notifications"]', 'tabbar.inbox');
  setText('[data-tab-label="you"]', 'tabbar.you');
  setAttr('#mobileTabbar', 'aria-label', 'tabbar.navigation');
  setAttr('#settingsBtn', 'title', 'chrome.userSettings');
  setAttr('.rail-icon.home', 'title', 'chrome.home');
  setAttr('#inboxBtn', 'title', 'chrome.inbox');
  setAttr('#panelMicBtn', 'title', 'chrome.mute');
  setAttr('#panelDeafenBtn', 'title', 'chrome.deafen');
  setAttr('#logoutBtn', 'title', 'chrome.logout');
  setAttr('#sidebarToggle', 'title', 'chrome.toggleSidebar');
  setAttr('#emojiBtn', 'title', 'chrome.emoji');
  setAttr('#voiceNoteBtn', 'title', 'chrome.voiceNote');
  setAttr('#attachBtn', 'title', 'chrome.attachFile');
  const jb = $('#jumpBottom span'); if (jb) jb.textContent = T('chrome.jumpToPresent');
}

function hideAppLoading() {
  const ld = document.getElementById('appLoading');
  if (!ld) return;
  ld.style.opacity = '0';
  ld.style.pointerEvents = 'none';
  setTimeout(() => ld.remove(), 280);
}

(async function init() {
  // Authentication and the core navigation datasets do not depend on one
  // another. Start all of them immediately so boot pays one network round trip
  // instead of /api/me followed by another round for servers/chats/friends.
  // Attach a handler now to avoid an unhandled rejection while language and
  // privacy setup run; awaiting the original promise below still surfaces it.
  const meLoad = loadMe();
  const coreLoad = Promise.all([loadServers(), loadChats(), loadFriends(), loadBlocked(), loadUnread()]);
  coreLoad.catch(() => {});
  // First-run language auto-detect (geo/IP via /api/geo, then browser locale).
  // No-op once a language is stored, so an explicit choice is never overridden.
  try { await window.disdrocI18N.autodetect(); } catch {}
  applyStaticChrome();
  // Apply saved density preference before anything renders.
  if (localStorage.getItem('disdroc_density') === 'compact') document.body.classList.add('density-compact');
  // Apply saved theme + accent.
  applyTheme(localStorage.getItem('disdroc_theme') || 'dark');
  { const a = localStorage.getItem('disdroc_accent'); if (a) applyAccent(a); }
  // Apply saved accessibility prefs.
  applyTextSize(localStorage.getItem('disdroc_text_size') || 'default');
  applyFont(localStorage.getItem('disdroc_font') || 'default');
  if (localStorage.getItem('disdroc_reduce_motion') === '1') document.body.classList.add('reduce-motion');
  loadCustomSfx().catch(() => {}); // restore any user-set sound effects (non-blocking)
  await meLoad;
  if (!state.me) return;
  // Gate the app behind privacy-policy consent — declining bounces to the landing page.
  if (!(await ensurePrivacyConsent())) return;
  renderMe();
  // Only data needed to paint the first useful screen blocks startup. Banners,
  // events, warnings, saved-message metadata, and custom emoji continue in the
  // background instead of holding the whole interface behind the loader.
  void Promise.allSettled([
    loadAnnouncements(), loadEvents(), loadPendingWarnings(), loadSavedIds(), loadMyEmojis(),
  ]);
  await coreLoad;
  renderServerRail(); renderSidebar();
  connectSocket();
  if (isMobileLayout()) switchToHome(); else switchToFriends();
  hideAppLoading();
  const initialChatId = Number(new URLSearchParams(location.search).get('chat'));
  if (initialChatId) {
    const initialChat = state.chats.find((chat) => chat.id === initialChatId);
    if (initialChat) openChat(initialChatId, initialChat);
    else {
      // Server channels never appear in state.chats — find the owning server.
      for (const s of state.servers) {
        try {
          const detail = await api('/api/servers/' + s.id);
          const chan = (detail.channels || []).find((c) => c.id === initialChatId);
          if (chan) {
            state.view = 'server'; state.serverId = s.id; state.serverDetail = detail;
            renderServerRail(); renderSidebar(); renderRightPanel();
            openChat(initialChatId, { ...chan, server_id: s.id });
            break;
          }
        } catch { /* not a member / gone — keep looking */ }
      }
    }
  }
  setupPush();
  bumpIdle();
  beatFocus();
  // Keep announcing focus so other devices stay quiet while this one is in use.
  setInterval(beatFocus, 15000);
  maybeShowWhatsNew();
  maybeAutoStartTour();
  // Rebrand to disdroc is complete — poll retired, no longer prompting.
  // maybeShowRebrandPrompt();
  // Returning from the Spotify OAuth flow → reopen Connections with the result.
  {
    const sp = new URLSearchParams(location.search).get('spotify');
    if (sp) {
      history.replaceState(null, '', '/app');
      openSettingsModal('connections');
      if (sp === 'error') alert('Spotify connection failed — please try again.');
    }
  }
  // Native Android call bridge: lets the native IncomingCallActivity drive the
  // web app into the call when the user taps "Answer" (works app-closed too,
  // via a deep link ?accept_call=<chatId> or the global disdrocAcceptCall()).
  window.disdrocAcceptCall = function(chatId) {
    chatId = Number(chatId);
    if (!chatId) return;
    dismissIncomingCall();              // native already showed the ring UI
    try { acceptIncomingCall(chatId); } catch (e) {}
  };
  // Tapped a native message notification → open that chat (loadChats first if
  // it's a brand-new DM/group we don't have yet).
  window.disdrocOpenChat = function(chatId) {
    chatId = Number(chatId);
    if (!chatId) return;
    const go = () => { const c = state.chats.find(x => x.id === chatId); if (c) openChat(chatId, c); };
    if (state.chats.find(x => x.id === chatId)) go();
    else loadChats().then(() => { renderSidebar(); go(); }).catch(() => {});
  };
  {
    const ac = new URLSearchParams(location.search).get('accept_call');
    if (ac) {
      history.replaceState(null, '', '/app');
      const id = Number(ac);
      if (id) setTimeout(() => window.disdrocAcceptCall(id), 700);
    }
  }
  // Wire settings button (if HTML has it)
  const sb = $('#settingsBtn');
  if (sb) sb.addEventListener('click', () => openSettingsModal()); // no tab → nav list on mobile, profile on desktop
  const ib = $('#inboxBtn');
  if (ib) ib.addEventListener('click', openInbox);
  document.querySelectorAll('#mobileTabbar [data-tab-icon]').forEach((mount) => mount.append(icon(mount.dataset.tabIcon, 22)));
  const mobileTabbar = $('#mobileTabbar');
  if (mobileTabbar) mobileTabbar.addEventListener('click', (e) => {
    const button = e.target.closest('[data-mobile-tab]');
    if (!button) return;
    const tab = button.dataset.mobileTab;
    if (button.classList.contains('active') && handleMobileTabRetap(tab)) return;
    if (tab === 'home') switchToHome();
    else if (tab === 'friends') switchToFriends();
    else if (tab === 'notifications') openInbox();
    else if (tab === 'you') showMobileYouScreen();
  });
  // Sidebar search → quick switcher
  const ssBtn = $('#sidebarSearch');
  if (ssBtn) ssBtn.addEventListener('click', () => openQuickSwitcher());
  // Bottom user panel → status / custom status popover
  const upMe = $('#userPanelMe');
  if (upMe) upMe.addEventListener('click', (e) => { e.stopPropagation(); openStatusPopover(upMe); });
  // Fill any static [data-icon] buttons with real SVG icons
  document.querySelectorAll('[data-icon]').forEach(b => { b.textContent = ''; b.append(icon(b.dataset.icon)); });
  // User-panel mic / deafen controls (Discord)
  const micBtn = $('#panelMicBtn');
  if (micBtn) micBtn.addEventListener('click', () => toggleMute());
  const deafBtn = $('#panelDeafenBtn');
  if (deafBtn) deafBtn.addEventListener('click', () => toggleDeafen());
  renderUserPanelVoice();
  // Chat header search — server-side full-history search with dropdown results.
  const hs = $('#headerSearch');
  if (hs) {
    let _srTimer = null;
    let _srDrop = null;
    const closeDrop = () => { if (_srDrop) { _srDrop.remove(); _srDrop = null; } };
    const showDrop = (results, q) => {
      closeDrop();
      _srDrop = el('div', { class: 'search-drop', id: 'searchDrop' });
      if (!results.length) {
        _srDrop.append(el('div', { class: 'search-drop-empty' }, t('search.noResultsInChat', { q })));
      } else {
        for (const m of results) {
          const row = el('div', { class: 'search-drop-row', on: { click: () => {
            closeDrop(); hs.value = '';
            jumpToMessageId(m.chat_id, m.id, state.chats.find(c => c.id === m.chat_id));
          }}});
          const meta = el('div', { class: 'search-drop-meta' });
          meta.append(el('strong', {}, m.username || t('search.unknown')));
          meta.append(el('span', { class: 'search-drop-time' }, ' · ' + fmtTime(m.created_at)));
          const body = el('div', { class: 'search-drop-body' });
          // Escape content before injecting the <mark> highlight (no raw HTML).
          // Strip filter tokens (from:/in:/has:/before:/after:) first — they're
          // query syntax, not text in the message body.
          const freeText = q.replace(/\b(from|in|has|before|after):\S+/gi, '').trim();
          const escaped = escape((m.content || '').slice(0, 200));
          body.innerHTML = freeText ? escaped.replace(new RegExp(freeText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<mark>$&</mark>') : escaped;
          row.append(meta, body);
          _srDrop.append(row);
        }
      }
      // Footer: escalate to searching every chat/channel (also via Enter).
      _srDrop.append(el('div', { class: 'search-drop-all', on: { click: () => { const v = hs.value.trim(); closeDrop(); hs.value = ''; openGlobalSearch(v); } } }, [
        icon('search', 13), el('span', {}, t('search.searchAllChats', { q })), el('kbd', {}, 'Enter'),
      ]));
      const wrap = hs.closest('.header-search') || hs.parentElement;
      // Only promote a static wrapper: on mobile the search row is already
      // absolutely positioned (full-width under the header), and stamping an
      // inline position:relative on it knocked it back into the header's flex
      // row the moment the first result arrived.
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      wrap.append(_srDrop);
    };
    hs.addEventListener('input', () => {
      clearTimeout(_srTimer);
      const q = hs.value.trim();
      if (!q) { closeDrop(); return; }
      _srTimer = setTimeout(async () => {
        const chatId = state.activeChatId;
        if (!chatId) return;
        try {
          const r = await api('/api/chats/' + chatId + '/search?q=' + encodeURIComponent(q));
          if (hs.value.trim() !== q) return;
          showDrop(r.messages || [], q);
        } catch {}
      }, 280);
    });
    hs.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDrop(); hs.value = ''; }
      else if (e.key === 'Enter') {
        const v = hs.value.trim();
        if (v.length >= 2) { closeDrop(); hs.value = ''; openGlobalSearch(v); }
      }
    });
    document.addEventListener('mousedown', (e) => { if (_srDrop && !_srDrop.contains(e.target) && e.target !== hs) closeDrop(); }, true);
  }
  // Phones hide the always-open header search input (no room for it beside the
  // title), which left in-chat + global message search with no entry point at
  // all on mobile. This button drops the same input in as a full-width row
  // under the header and focuses it; tapping again (or Escape/back) hides it.
  const msBtn = $('#mobileSearchBtn');
  if (msBtn) msBtn.addEventListener('click', () => {
    if (closeMobileSearch()) return;
    document.getElementById('app').classList.add('msearch');
    setTimeout(() => $('#headerSearch')?.focus(), 0);
  });
  // Voice note button
  const vnBtn = $('#voiceNoteBtn');
  if (vnBtn) vnBtn.addEventListener('click', () => voiceNoteRec ? stopVoiceNote(true) : startVoiceNote());
  // GIF button
  const gifBtn = $('#gifBtn');
  if (gifBtn) gifBtn.addEventListener('click', () => openGifPicker());
  // Emoji button
  const emBtn = $('#emojiBtn');
  if (emBtn) emBtn.addEventListener('click', (e) => openEmojiPicker(e.currentTarget));
  // Screen share button placement in voice bar handled in renderVoiceBar
})();

// ─── Watch Together: shared YouTube playback in voice calls ───────────────────
// Discord-style activity: everyone in the call sees the same video, and any
// participant's play/pause/seek/volume applies for the whole room. The player is
// YouTube's own embed UI (youtube-nocookie.com, already allowed by our CSP
// frame-src) driven over the embed's postMessage protocol — no external script.
// The iframe lives in a fixed overlay (#watchOverlay) that position-tracks a
// .watch-slot placeholder inside the voice bar / call stage, because those
// containers are rebuilt constantly and reparenting an iframe reloads it.
const YT_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
let _watchOverlay = null;      // the fixed wrapper (header + iframe)
let _watchFrame = null;        // the <iframe>
let _watchPosRaf = null;       // rAF loop syncing overlay position to the slot
let _watchSyncTimer = null;    // interval comparing local player state to the session
let _watchListenTimer = null;  // retries the 'listening' handshake until the widget answers
let _watchGestureTimer = null; // shows the click-to-start fallback if autoplay is blocked
let _watchInfo = { state: -1, time: 0, volume: null, muted: false, ready: false };
let _watchPrevPoll = { time: 0, at: 0, state: -1 };

function watchExpectedTime(s) {
  return Math.max(0, s.position + (s.playing ? (Date.now() - s.positionAt) / 1000 : 0));
}

function ytCmd(func, args) {
  try { _watchFrame && _watchFrame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), YT_EMBED_ORIGIN); } catch {}
}

// Widget messages: the embed pushes onReady/onStateChange/infoDelivery (time,
// playerState, volume, muted) once we announce ourselves with 'listening'.
window.addEventListener('message', (e) => {
  if (e.origin !== YT_EMBED_ORIGIN || !_watchFrame || e.source !== _watchFrame.contentWindow) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!d || !d.event) return;
  if (!_watchInfo.ready) {
    _watchInfo.ready = true;
    if (_watchListenTimer) { clearInterval(_watchListenTimer); _watchListenTimer = null; }
  }
  const info = d.info;
  if ((d.event === 'infoDelivery' || d.event === 'initialDelivery' || d.event === 'onReady') && info && typeof info === 'object') {
    if (typeof info.currentTime === 'number') _watchInfo.time = info.currentTime;
    if (typeof info.playerState === 'number') _watchInfo.state = info.playerState;
    if (typeof info.volume === 'number') _watchInfo.volume = info.volume;
    if (typeof info.muted === 'boolean') _watchInfo.muted = info.muted;
  } else if (d.event === 'onStateChange' && typeof info === 'number') {
    _watchInfo.state = info;
    handleLocalWatchStateChange(info);
  } else if (d.event === 'onError') {
    const t = _watchOverlay && _watchOverlay.querySelector('.watch-title');
    if (t) t.textContent = 'This video can\'t be embedded — pick another one.';
  }
  if (_watchInfo.state === 1 || _watchInfo.state === 3) hideWatchGesture();
});

// Immediate play/pause propagation (state changes we didn't apply ourselves).
// Note: no time-based suppression here — applyRemoteWatchPlayback() already
// updates s.playing synchronously before it ever calls playVideo/pauseVideo,
// so the echo of our own remote-applied command always fails the s.playing
// comparison below and is dropped on that basis. A blanket _watchSuppressUntil
// check here used to also swallow a genuine local pause/play that happened to
// land within ~1.8-3s of any unrelated remote update (e.g. the other person
// tweaking volume) — that's the "pause doesn't propagate" bug.
function handleLocalWatchStateChange(st) {
  const s = state.voice.watchSession;
  if (!s) return;
  if (st === 1 && !s.playing) sendWatchControl({ playing: true, position: _watchInfo.time });
  else if (st === 2 && s.playing) sendWatchControl({ playing: false, position: _watchInfo.time });
  // Ended (state 0) was never handled: s.playing stayed true forever, so
  // watchExpectedTime() kept climbing past the video's length and every future
  // remote update seekTo'd everyone to that huge, out-of-range position — which
  // YouTube clamps by snapping back near the start, "stuck" replaying the first
  // few seconds. Broadcast a real paused-at-0 state the moment either side sees
  // the video end, same as any other pause.
  else if (st === 0 && s.playing) sendWatchControl({ playing: false, position: 0 });
}

function sendWatchControl(patch) {
  const s = state.voice.watchSession;
  if (!s || !state.socket || (s.locked && s.setBy !== state.me.id)) return;
  if (typeof patch.playing === 'boolean') s.playing = patch.playing;
  if (typeof patch.position === 'number') { s.position = patch.position; s.positionAt = Date.now(); }
  if (typeof patch.volume === 'number') s.volume = patch.volume;
  state.socket.emit('watch:control', patch);
}

// Server said the session changed. `by === me` means it's the echo of our own
// watch:set (controls are never echoed) — load, but don't "apply" on top.
function applyWatchState(session, by) {
  const prev = state.voice.watchSession;
  state.voice.watchSession = session || null;
  refreshDock();
  if (!session) { teardownWatch(); renderVoiceBar(); return; }
  if (!prev || prev.videoId !== session.videoId || !_watchFrame) {
    ensureWatchOverlay();
    loadWatchVideo(session);
    renderVoiceBar();
    return;
  }
  if (by === state.me.id) { updateWatchHeader(); return; }
  applyRemoteWatchPlayback(session);
}

function loadWatchVideo(s) {
  _watchInfo = { state: -1, time: 0, volume: null, muted: false, ready: false };
  _watchPrevPoll = { time: 0, at: 0, state: -1 };
  const t = Math.round(watchExpectedTime(s));
  const params = new URLSearchParams({
    enablejsapi: '1', playsinline: '1', rel: '0', autoplay: s.playing ? '1' : '0',
    origin: location.origin, widget_referrer: location.origin,
  });
  if (t > 2) params.set('start', String(t));
  _watchFrame.src = YT_EMBED_ORIGIN + '/embed/' + s.videoId + '?' + params.toString();
  // Handshake: keep announcing until the widget starts talking back.
  if (_watchListenTimer) clearInterval(_watchListenTimer);
  _watchListenTimer = setInterval(() => {
    if (_watchInfo.ready || !_watchFrame) { clearInterval(_watchListenTimer); _watchListenTimer = null; return; }
    try { _watchFrame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'nadwatch', channel: 'widget' }), YT_EMBED_ORIGIN); } catch {}
  }, 350);
  if (!_watchSyncTimer) _watchSyncTimer = setInterval(watchSyncTick, 700);
  // Autoplay fallback: if the browser refused to start the video without a
  // gesture, show a click-to-start button (the click seeks to the live position).
  if (_watchGestureTimer) clearTimeout(_watchGestureTimer);
  if (s.playing) {
    _watchGestureTimer = setTimeout(() => {
      const cur = state.voice.watchSession;
      if (cur && cur.playing && _watchInfo.state !== 1 && _watchInfo.state !== 3) showWatchGesture();
    }, 3500);
  }
  updateWatchHeader();
}

function applyRemoteWatchPlayback(s) {
  if (!_watchInfo.ready) return; // sync loop reconciles once the widget is up
  const expected = watchExpectedTime(s);
  if (Math.abs(_watchInfo.time - expected) > 1.2) ytCmd('seekTo', [expected, true]);
  if (s.playing && _watchInfo.state !== 1 && _watchInfo.state !== 3) ytCmd('playVideo');
  // Unconditional pause: seekTo can kick a cued video into playing, and pausing
  // an already-paused/cued player is harmless.
  if (!s.playing) ytCmd('pauseVideo');
  // Re-baseline watchSyncTick's seek-detection to the position/state we just
  // told the player to be at. Previously this used a blanket _watchSuppressUntil
  // window that skipped seek-detection entirely for ~1.8-3s after any remote
  // update — but _watchPrevPoll still got overwritten during that window
  // regardless, so a genuine local seek made in that window was silently lost
  // forever instead of merely delayed. Baselining here means the next tick
  // compares against where we actually are, so our own correction isn't
  // mistaken for a local seek, without ever skipping real local input.
  _watchPrevPoll = { time: expected, at: Date.now(), state: s.playing ? 1 : 2 };
  if (typeof s.volume === 'number' && _watchInfo.volume != null) {
    const localVol = _watchInfo.muted ? 0 : _watchInfo.volume;
    if (Math.abs(localVol - s.volume) > 2) {
      if (s.volume > 0 && _watchInfo.muted) ytCmd('unMute');
      ytCmd('setVolume', [s.volume]);
    }
  }
  updateWatchHeader();
}

// Runs every 700ms while a video is loaded. Detects LOCAL user actions (seeks by
// time-jump, volume changes) and broadcasts them; corrects our own slow drift
// (e.g. after a buffering stall) toward the shared position.
function watchSyncTick() {
  const s = state.voice.watchSession;
  if (!s || !_watchInfo.ready) return;
  // First tick after the widget comes up: adopt the shared state (volume,
  // position, play state) instead of treating our defaults as local changes.
  if (!_watchInfo.applied) {
    _watchInfo.applied = true;
    applyRemoteWatchPlayback(s);
    return;
  }
  const now = Date.now();
  const t = _watchInfo.time, st = _watchInfo.state;
  const prev = _watchPrevPoll;
  if (prev.at) {
    const dtSec = (now - prev.at) / 1000;
    // A time jump that playback alone can't explain = the user dragged the bar.
    const seekedPlaying = st === 1 && prev.state === 1 && Math.abs(t - (prev.time + dtSec)) > 2.5;
    const seekedPaused = st === 2 && prev.state === 2 && Math.abs(t - prev.time) > 0.8;
    // Scrubbing can put the YouTube widget into buffering (state 3) before its
    // infoDelivery message reports the new time. The old stable-state-only
    // checks missed that jump, then overwrote `prev` while buffering; when the
    // widget returned to playing/paused there was no jump left to detect. Catch
    // the same impossible time movement on either side of that transient state.
    const transientSeek = (st === 3 || prev.state === 3)
      && Math.abs(t - (prev.time + (s.playing ? dtSec : 0))) > (s.playing ? 2.5 : 0.8);
    if (seekedPlaying || seekedPaused || transientSeek) {
      sendWatchControl({ playing: st === 1 ? true : st === 2 ? false : s.playing, position: t });
    } else if (prev.state !== st) {
      // Backstop for a bare play<->pause/ended transition that never reached us
      // as a distinct 'onStateChange' postMessage — infoDelivery (which feeds
      // `st` here via the 'message' listener) is the one push this widget
      // protocol reliably sends, so relying on 'onStateChange' alone silently
      // drops the pause the instant it doesn't fire. Reuses
      // handleLocalWatchStateChange's own guard, so this is a no-op whenever
      // the transition was already handled (by 'onStateChange' or a prior
      // tick) — s.playing has already been flipped by then.
      handleLocalWatchStateChange(st);
    } else if (s.playing && st === 1) {
      // Drifted well off the shared clock (buffered, throttled tab) → catch up.
      const expected = watchExpectedTime(s);
      if (Math.abs(t - expected) > 4) {
        ytCmd('seekTo', [expected, true]);
        // Baseline immediately so this self-correction isn't mistaken for a
        // local seek on the next tick (see applyRemoteWatchPlayback for why
        // this replaced a blanket _watchSuppressUntil window).
        _watchPrevPoll = { time: expected, at: now, state: st };
        return;
      }
    }
    // Shared volume: local slider/mute change goes out to the room.
    if (_watchInfo.volume != null && typeof s.volume === 'number') {
      const localVol = _watchInfo.muted ? 0 : _watchInfo.volume;
      if (Math.abs(localVol - s.volume) > 2) sendWatchControl({ volume: localVol, position: t });
    }
  }
  _watchPrevPoll = { time: t, at: now, state: st };
}

function ensureWatchOverlay() {
  if (_watchOverlay) return;
  _watchFrame = document.createElement('iframe');
  _watchFrame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
  _watchFrame.setAttribute('allowfullscreen', '');
  _watchFrame.title = 'Watch Together';
  _watchOverlay = el('div', { id: 'watchOverlay', class: 'watch-hidden' }, [
    el('div', { class: 'watch-head' }, [
      el('span', { class: 'watch-head-icon' }, icon('youtube', 16)),
      el('span', { class: 'watch-title' }, ''),
      el('button', {
        type: 'button', title: 'Search again', 'aria-label': 'Search again',
        on: { click: () => openWatchSearch() },
      }, icon('search', 16)),
      el('button', {
        type: 'button', class: 'watch-lock-toggle',
        title: t('watch.anyoneCanControl'), 'aria-label': t('watch.anyoneCanControl'),
        on: { click: () => {
          const s = state.voice.watchSession;
          if (s && s.setBy === state.me.id) state.socket.emit('watch:lock', { locked: !s.locked });
        } },
      }, icon('unlock', 16)),
      el('button', {
        type: 'button', title: 'Stop (for everyone)', 'aria-label': 'Stop for everyone',
        on: { click: () => state.socket.emit('watch:stop') },
      }, icon('x', 16)),
    ]),
    el('div', { class: 'watch-body' }, _watchFrame),
  ]);
  document.body.append(_watchOverlay);
  // Track whichever .watch-slot is on screen (stage wins over the voice bar).
  // No slot (browsing another chat, stage closed) → park offscreen; the iframe
  // stays alive so audio keeps playing, Discord-style.
  const track = () => {
    if (!_watchOverlay) return;
    const slot = document.querySelector('#callStage .watch-slot:not(.wb-slot):not(.game-slot)') || document.querySelector('#voiceBar .watch-slot:not(.wb-slot):not(.game-slot)');
    if (!slot) {
      _watchOverlay.classList.add('watch-hidden');
    } else {
      const r = slot.getBoundingClientRect();
      _watchOverlay.classList.remove('watch-hidden');
      const st = _watchOverlay.style;
      st.left = r.left + 'px'; st.top = r.top + 'px';
      st.width = r.width + 'px'; st.height = r.height + 'px';
    }
    _watchPosRaf = requestAnimationFrame(track);
  };
  _watchPosRaf = requestAnimationFrame(track);
}

function updateWatchHeader() {
  const s = state.voice.watchSession;
  if (!_watchOverlay || !s) return;
  const title = _watchOverlay.querySelector('.watch-title');
  if (title) title.textContent = s.title ? s.title + (s.author ? ' — ' + s.author : '') : 'YouTube';
  const lock = _watchOverlay.querySelector('.watch-lock-toggle');
  if (lock) {
    const isOwner = s.setBy === state.me.id;
    const label = !s.locked ? t('watch.anyoneCanControl')
      : isOwner ? t('watch.onlyYouControl') : t('watch.onlyStarterControls', { name: s.setByName });
    lock.title = isOwner ? t('watch.toggleControlLock', { mode: label }) : label;
    lock.disabled = !isOwner;
    lock.setAttribute('aria-label', lock.title);
    lock.replaceChildren(icon(s.locked ? 'lock' : 'unlock', 16));
  }
}

function showWatchGesture() {
  if (!_watchOverlay || _watchOverlay.querySelector('.watch-gesture')) return;
  const btn = el('button', { type: 'button' }, '▶ Click to start watching');
  btn.addEventListener('click', () => {
    const s = state.voice.watchSession;
    if (s) {
      const expected = watchExpectedTime(s);
      ytCmd('seekTo', [expected, true]);
      ytCmd('playVideo');
      _watchPrevPoll = { time: expected, at: Date.now(), state: 1 };
    }
    hideWatchGesture();
  });
  _watchOverlay.querySelector('.watch-body').append(el('div', { class: 'watch-gesture' }, btn));
}
function hideWatchGesture() {
  const g = _watchOverlay && _watchOverlay.querySelector('.watch-gesture');
  if (g) g.remove();
}

function teardownWatch() {
  state.voice.watchSession = null;
  if (_watchPosRaf) { cancelAnimationFrame(_watchPosRaf); _watchPosRaf = null; }
  if (_watchSyncTimer) { clearInterval(_watchSyncTimer); _watchSyncTimer = null; }
  if (_watchListenTimer) { clearInterval(_watchListenTimer); _watchListenTimer = null; }
  if (_watchGestureTimer) { clearTimeout(_watchGestureTimer); _watchGestureTimer = null; }
  if (_watchOverlay) { _watchOverlay.remove(); _watchOverlay = null; }
  _watchFrame = null;
  _watchInfo = { state: -1, time: 0, volume: null, muted: false, ready: false };
  const stage = document.getElementById('callStage'); if (stage) stage.classList.remove('watching');
  const bar = document.getElementById('voiceBar'); if (bar) bar.classList.remove('watching');
}

// The YouTube button in the call controls: straight to search when nothing is
// playing; a small menu (change / stop) while a session is active.
function openWatchMenu(anchor) {
  if (!state.voice.watchSession) { openWatchSearch(); return; }
  if (document.querySelector('.floating-menu:not(.anim-out)')) { closeFloatingMenus(); return; }
  const s = state.voice.watchSession;
  const isOwner = s.setBy === state.me.id;
  const controlLabel = !s.locked ? t('watch.anyoneCanControl')
    : isOwner ? t('watch.onlyYouControl') : t('watch.onlyStarterControls', { name: s.setByName });
  const menu = el('div', { class: 'floating-menu ss-menu' });
  menu.append(el('button', { type: 'button', on: { click: () => { closeFloatingMenus(); openWatchSearch(); } } },
    [icon('search', 16), el('span', {}, 'Change video')]));
  menu.append(el('button', {
    type: 'button', disabled: !isOwner,
    title: isOwner ? t('watch.toggleControlLock', { mode: controlLabel }) : controlLabel,
    on: { click: () => {
      if (!isOwner) return;
      closeFloatingMenus();
      state.socket.emit('watch:lock', { locked: !s.locked });
    } },
  }, [icon(s.locked ? 'lock' : 'unlock', 16), el('span', {}, controlLabel)]));
  menu.append(el('button', { type: 'button', class: 'ss-stop', on: { click: () => { closeFloatingMenus(); state.socket.emit('watch:stop'); } } },
    [icon('x', 16), el('span', {}, 'Stop watching for everyone')]));
  document.body.append(menu);
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
}

// ─── YouTube Music (real account, owner-controlled) ──────────────────────────
// A user links their own account (paste-headers auth — see server/ytmusic/
// bridge.py) and browses their real home feed/playlists/search; picking a
// track starts a session synced to the room over the socket (ytmusic:*,
// server/sockets.js), the same "server is the source of truth" mechanism
// Watch Together uses. Playback itself is NOT WebRTC: every participant's own
// <audio> element streams the track directly from /api/ytmusic/stream/:id and
// is kept in sync via position/state broadcasts. Only the owner can control
// it — everyone else gets a read-only widget and their own local volume.
let _ytAudio = null;        // shared <audio> element, alive whenever a session is loaded
let _ytSyncTimer = null;
let _ytLoadedVideoId = null;

function ytExpectedPosition(s) {
  return Math.max(0, s.position + (s.playing ? (Date.now() - s.positionAt) / 1000 : 0));
}

function sendYtControl(patch) {
  const s = state.voice.ytmusicSession;
  if (!s || s.ownerId !== state.me.id || !state.socket) return;
  if (typeof patch.playing === 'boolean') s.playing = patch.playing;
  if (typeof patch.position === 'number') { s.position = patch.position; s.positionAt = Date.now(); }
  state.socket.emit('ytmusic:control', patch);
}

function ensureYtAudio() {
  if (_ytAudio) return;
  _ytAudio = new Audio();
  _ytAudio.preload = 'auto';
  const savedVol = parseFloat(localStorage.getItem('disdroc_ytm_vol'));
  _ytAudio.volume = Number.isFinite(savedVol) ? savedVol : 1;
  // A track ending naturally only matters to the owner — they're the one whose
  // element drives the shared position, so only they should push the stop.
  _ytAudio.addEventListener('ended', () => {
    const s = state.voice.ytmusicSession;
    if (s && s.ownerId === state.me.id) sendYtControl({ playing: false, position: 0 });
  });
  if (!_ytSyncTimer) _ytSyncTimer = setInterval(ytMusicSyncTick, 1000);
}

// Server said the session changed (started, controlled, stopped).
function applyYtMusicState(session) {
  state.voice.ytmusicSession = session || null;
  if (!session) { teardownYtMusic(); renderVoiceBar(); refreshDock(); return; }
  ensureYtAudio();
  if (_ytLoadedVideoId !== session.videoId) {
    _ytLoadedVideoId = session.videoId;
    _ytAudio.src = '/api/ytmusic/stream/' + encodeURIComponent(session.videoId);
    _ytAudio.currentTime = ytExpectedPosition(session);
  }
  // The picker starts the owner's audio inside the original click gesture, but
  // state can also arrive after a reload/reconnect. In that case the owner must
  // follow the broadcast just like listeners; previously only non-owners called
  // play(), so a newly selected track stayed paused until Play was clicked twice.
  if (session.playing && _ytAudio.paused) _ytAudio.play().catch(() => {});
  if (!session.playing && !_ytAudio.paused) _ytAudio.pause();
  renderYtMusicWidget();
  renderVoiceBar();
  refreshDock();
}

// Runs every second while a session is loaded. The owner's <audio> element IS
// the shared clock (no correction needed, just keep the widget current); every
// other listener gently nudges their own element back in line with the
// broadcast position if it's drifted (buffering, a slow tick, etc.) — a hard
// reseek every tick would be audible, so this only steps in past a threshold.
function ytMusicSyncTick() {
  const s = state.voice.ytmusicSession;
  if (!s || !_ytAudio) return;
  if (s.ownerId !== state.me.id) {
    const expected = ytExpectedPosition(s);
    if (Math.abs(_ytAudio.currentTime - expected) > 2.5) _ytAudio.currentTime = expected;
  }
  updateYtWidgetProgress();
}

function teardownYtMusic() {
  state.voice.ytmusicSession = null;
  if (_ytSyncTimer) { clearInterval(_ytSyncTimer); _ytSyncTimer = null; }
  if (_ytAudio) { try { _ytAudio.pause(); _ytAudio.src = ''; } catch {} _ytAudio = null; }
  _ytLoadedVideoId = null;
}

function fmtYtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  sec = Math.floor(sec);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function ytVideoThumbnail(videoId) {
  return /^[a-zA-Z0-9_-]{6,20}$/.test(String(videoId || ''))
    ? 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg'
    : '';
}

function ytThumbnailImage(videoId, thumbnail, className) {
  const fallback = ytVideoThumbnail(videoId);
  const img = el('img', {
    class: className, src: thumbnail || fallback, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => {
    // Music search/recommendation thumbnails occasionally expire or reject a
    // fresh hotlink even though the cached picker image was visible. Retry the
    // stable video thumbnail, then show a deliberate placeholder rather than a
    // broken-image glyph if YouTube has no thumbnail for that ID either.
    if (fallback && img.src !== fallback) { img.src = fallback; return; }
    const empty = el('div', { class: className + ' ytm-cover-empty' }, icon('music', 24));
    img.replaceWith(empty);
  }, { once: false });
  return img;
}

// Who is hearing this right now. Everyone in the call streams the same track
// (see applyYtMusicState), so the voice room list IS the listener list — no
// separate presence to track. The owner floats to the front and is marked as
// the one actually driving playback.
function ytListenerRow(s) {
  const room = state.voiceRooms.get(state.voice.channelId) || [];
  // Falls back to just me: the room snapshot can lag a beat behind a fresh join,
  // and an empty listener row under the card reads as "nobody's here".
  const people = room.length ? [...room] : [{
    id: state.me.id, username: state.me.username, display_name: state.me.display_name,
    avatar_path: state.me.avatar_path, tag: state.me.tag,
  }];
  people.sort((a, b) => (b.id === s.ownerId) - (a.id === s.ownerId));
  const MAX = 5;
  const row = el('div', { class: 'ytm-listeners' }, [
    el('span', { class: 'ytm-listeners-label' }, [icon('headset', 13), el('span', {}, t('ytm.listening'))]),
  ]);
  for (const p of people.slice(0, MAX)) {
    const isHost = p.id === s.ownerId;
    row.append(el('span', {
      class: 'ytm-listener' + (isHost ? ' host' : ''),
      title: userLabel(p) + (isHost ? ' — ' + t('ytm.hostTitle') : ''),
    }, [
      avatarEl(p, 'ytm-listener-av'),
      el('span', { class: 'ytm-listener-name' }, p.id === state.me.id ? t('ytm.you') : (p.display_name || p.username)),
      isHost ? icon('music', 12) : null,
    ]));
  }
  if (people.length > MAX) {
    row.append(el('span', { class: 'ytm-listener ytm-listener-more' }, t('ytm.plusMore', { n: people.length - MAX })));
  }
  return row;
}

// A ±10s jump button. Deliberately NOT prev/next: there's no queue in this
// feature (a session is one track someone picked), so a "next" button would be
// a control that does nothing. Seeking is a real thing the owner can do, and it
// gives the transport row the three-button shape it wants.
function ytSkipButton(s, delta) {
  const back = delta < 0;
  const btn = el('button', {
    type: 'button', class: 'ytm-tbtn', title: back ? t('ytm.back10') : t('ytm.forward10'),
    'aria-label': back ? t('ytm.back10') : t('ytm.forward10'),
    on: { click: () => {
      const base = _ytAudio ? _ytAudio.currentTime : ytExpectedPosition(s);
      const max = s.duration || Infinity;
      const pos = Math.max(0, Math.min(max, base + delta));
      if (_ytAudio) _ytAudio.currentTime = pos;
      sendYtControl({ position: pos });
      updateYtWidgetProgress();
    } },
  });
  const glyph = el('span', { class: 'ytm-skip-glyph' + (back ? '' : ' ytm-flip') }, icon('rotate-ccw', 20));
  btn.append(glyph, el('span', { class: 'ytm-skip-n' }, '10'));
  return btn;
}

// The listener-local volume control (never broadcast — see ensureYtAudio).
// The speaker icon doubles as a mute toggle so there's a one-tap way to shut
// the music up without dragging a slider to zero.
function ytVolumeControl() {
  const wrap = el('div', { class: 'ytm-vol-wrap' });
  const vol = () => (_ytAudio ? _ytAudio.volume : 1);
  const slider = el('input', {
    type: 'range', min: 0, max: 100, step: 1, class: 'ytm-range ytm-vol',
    title: t('ytm.localVolume'), 'aria-label': t('ytm.localVolume'),
    value: Math.round(vol() * 100),
  });
  const btn = el('button', { type: 'button', class: 'ytm-vol-btn', title: t('ytm.localVolume') });
  const paint = () => {
    const v = vol();
    slider.style.setProperty('--pct', Math.round(v * 100));
    btn.replaceChildren(icon(v > 0 ? 'volume' : 'volume-x', 16));
    btn.classList.toggle('muted', v === 0);
  };
  const setVol = (v) => {
    if (_ytAudio) _ytAudio.volume = v;
    localStorage.setItem('disdroc_ytm_vol', String(v));
    slider.value = Math.round(v * 100);
    paint();
  };
  let lastAudible = vol() || 1;
  slider.addEventListener('input', () => {
    const v = (+slider.value) / 100;
    if (v > 0) lastAudible = v;
    setVol(v);
  });
  btn.addEventListener('click', () => setVol(vol() > 0 ? 0 : (lastAudible || 1)));
  paint();
  wrap.append(btn, slider);
  return wrap;
}

function renderYtMusicWidget(slot) {
  const s = state.voice.ytmusicSession;
  if (!s || state.voice.channelId == null) return;
  const slots = slot
    ? [slot]
    : [...document.querySelectorAll('#callStage .ytm-slot, #voiceBar .ytm-slot')];
  if (!slots.length) return;
  const isOwner = s.ownerId === state.me.id;
  for (const target of slots) {
    // Owner drives a real range input; everyone else gets a read-only fill bar,
    // because their position is the broadcast one and scrubbing it would only
    // desync them from the room.
    const progress = isOwner
      ? el('input', {
          type: 'range', class: 'ytm-range ytm-progress', min: 0, max: Math.max(1, s.duration || 0), step: 1,
          value: Math.round(_ytAudio ? _ytAudio.currentTime : ytExpectedPosition(s)),
          title: t('ytm.seek'), 'aria-label': t('ytm.seek'),
        })
      : el('div', { class: 'ytm-progress-ro' }, el('div', { class: 'ytm-progress-fill' }));
    if (isOwner) {
      // While a drag is in flight the sync tick must not write the value back
      // out from under the thumb — activeElement misses touch drags, so the
      // pointer flag carries it.
      progress.addEventListener('pointerdown', () => { progress.dataset.dragging = '1'; });
      const endDrag = () => { delete progress.dataset.dragging; };
      progress.addEventListener('pointerup', endDrag);
      progress.addEventListener('pointercancel', endDrag);
      progress.addEventListener('input', () => {
        const pos = +progress.value;
        const dur = s.duration || 0;
        progress.style.setProperty('--pct', dur ? (pos / dur) * 100 : 0);
        if (_ytAudio) _ytAudio.currentTime = pos;
        sendYtControl({ position: pos });
        const cur = target.querySelector('.ytm-time-cur');
        if (cur) cur.textContent = fmtYtTime(pos);
      });
    }

    const eq = el('span', { class: 'ytm-eq' + (s.playing ? '' : ' paused'), 'aria-hidden': 'true' });
    eq.append(el('i'), el('i'), el('i'));

    const head = el('div', { class: 'ytm-head' }, [
      el('span', { class: 'ytm-brand' }, [
        el('span', { class: 'ytm-brand-mark' }, icon('music', 14)),
        el('span', { class: 'ytm-brand-name' }, t('watch.ytMusicTitle')),
        eq,
      ]),
      el('span', { class: 'ytm-head-spacer' }),
      ytVolumeControl(),
    ]);
    if (isOwner) {
      head.append(el('button', {
        type: 'button', class: 'ytm-head-end', title: t('act.end'), 'aria-label': t('act.end'),
        on: { click: () => state.socket.emit('ytmusic:stop') },
      }, icon('x', 16)));
    }

    const info = el('div', { class: 'ytm-info' }, [
      el('div', { class: 'ytm-title', title: s.title || '' }, s.title || t('ytm.unknownTrack')),
      s.artist ? el('div', { class: 'ytm-artist', title: s.artist }, s.artist) : null,
      !isOwner ? el('div', { class: 'ytm-host-line' }, t('ytm.by', { name: s.ownerName })) : null,
    ]);

    if (isOwner) {
      const playBtn = el('button', {
        type: 'button', class: 'ytm-tbtn ytm-play',
        title: s.playing ? t('ytm.pause') : t('ytm.play'),
        'aria-label': s.playing ? t('ytm.pause') : t('ytm.play'),
        on: { click: () => {
          const playing = !s.playing;
          if (_ytAudio) { if (playing) _ytAudio.play().catch(() => {}); else _ytAudio.pause(); }
          sendYtControl({ playing, position: _ytAudio ? _ytAudio.currentTime : s.position });
          renderYtMusicWidget();
        } },
      }, icon(s.playing ? 'pause' : 'play', 20));
      info.append(el('div', { class: 'ytm-transport' }, [
        ytSkipButton(s, -10), playBtn, ytSkipButton(s, 10),
      ]));
    } else {
      info.append(el('div', { class: 'ytm-synced' }, [
        icon('users', 13),
        el('span', {}, s.playing ? t('ytm.syncedPlaying') : t('ytm.syncedPaused')),
      ]));
    }

    const card = el('div', { class: 'ytm-card' }, [
      head,
      el('div', { class: 'ytm-body' }, [
        el('div', { class: 'ytm-cover-wrap' }, [
          (s.thumbnail || s.videoId) ? ytThumbnailImage(s.videoId, s.thumbnail, 'ytm-cover')
            : el('div', { class: 'ytm-cover ytm-cover-empty' }, icon('music', 30)),
        ]),
        info,
      ]),
      el('div', { class: 'ytm-seek' }, [
        progress,
        el('div', { class: 'ytm-times' }, [
          el('span', { class: 'ytm-time-cur' }, '0:00'),
          el('span', { class: 'ytm-time-dur' }, s.duration ? fmtYtTime(s.duration) : '--:--'),
        ]),
      ]),
    ]);

    target.replaceChildren(card, ytListenerRow(s));
  }
  updateYtWidgetProgress();
}

// Cheap per-tick update that only touches the progress bar/time text, so it
// doesn't fight an owner mid-drag or thrash the DOM every second.
function updateYtWidgetProgress() {
  const s = state.voice.ytmusicSession;
  if (!s) return;
  const isOwner = s.ownerId === state.me.id;
  const cur = isOwner ? (_ytAudio ? _ytAudio.currentTime : ytExpectedPosition(s)) : ytExpectedPosition(s);
  const dur = s.duration || 0;
  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
  for (const card of document.querySelectorAll('.ytm-slot .ytm-card')) {
    const curEl = card.querySelector('.ytm-time-cur');
    if (curEl) curEl.textContent = fmtYtTime(cur);
    const durEl = card.querySelector('.ytm-time-dur');
    if (durEl) durEl.textContent = dur ? fmtYtTime(dur) : '--:--';
    if (isOwner) {
      const bar = card.querySelector('.ytm-progress');
      if (bar && !bar.dataset.dragging && document.activeElement !== bar) {
        bar.value = Math.round(cur);
        bar.style.setProperty('--pct', pct);
      }
    } else {
      const fill = card.querySelector('.ytm-progress-fill');
      if (fill && dur) fill.style.width = pct + '%';
    }
  }
}

// Activities dock entry point + the browse/setup panel.
// Polls linking status after handing out a code — the extension links in the
// background with no page of its own to redirect back to, so this is how the
// modal notices it happened and switches itself over to the browse UI.
// Self-limits to the code's ~5 minute lifetime; a stray poll or two after the
// modal's been closed is a harmless couple of lightweight status checks.
function pollYtLinkStatus(onLinked, host) {
  let attempts = 0;
  const timer = setInterval(async () => {
    if (++attempts > 150 || (host && !host.isConnected)) { clearInterval(timer); return; }
    try {
      const r = await api('/api/ytmusic/status');
      if (r.linked) { clearInterval(timer); await onLinked(); }
    } catch { clearInterval(timer); }
  }, 2000);
}

// Google's device-code flow (POST /api/ytmusic/oauth/start → the user types the
// code on google.com/device on whatever device they like). There's no redirect
// back to us, so approval can only be noticed by asking — at the interval
// Google handed us, until the code's own expiry. Stops the moment the panel it
// belongs to leaves the DOM, so closing the dialog really does stop it.
function pollYtOAuth({ deviceCode, interval, expiresIn, host, onLinked, onExpired, onError }) {
  const startedAt = Date.now();
  const step = Math.max(2, Number(interval) || 5) * 1000;
  const ttl = Math.max(60, Number(expiresIn) || 300) * 1000;
  const tick = async () => {
    if (!host.isConnected) return;
    if (Date.now() - startedAt > ttl) { onExpired(); return; }
    try {
      const r = await api('/api/ytmusic/oauth/poll', { method: 'POST', body: JSON.stringify({ deviceCode }) });
      if (!host.isConnected) return;
      if (r && r.linked) { await onLinked(); return; }
      setTimeout(tick, Math.max(step, (Number(r && r.retryAfter) || 0) * 1000));
    } catch (e) {
      if (!host.isConnected) return;
      onError(e);
    }
  };
  setTimeout(tick, step);
}

// Small "click to copy" affordance used by both linking flows. Falls back to
// selecting the text when the clipboard API isn't available (non-secure origin,
// older webviews) so there's always a way to get the value out.
function ytCopyButton(getText) {
  const btn = el('button', { type: 'button', class: 'ghost ytm-copy' }, t('ytm.copy'));
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); } catch { return; }
    btn.textContent = t('ytm.copied');
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = t('ytm.copy'); btn.classList.remove('done'); }, 1600);
  });
  return btn;
}

function openYtMusicModal() {
  if (state.voice.channelId == null) { alert(t('ytm.joinFirst')); return; }
  if (state.voice.watchSession) { alert(t('act.endWatchFirst')); return; }
  let tab = 'home'; // 'home' | 'playlists' | 'search'
  let playlistView = null; // { playlistId, title } once drilled into a playlist
  let searchQuery = '';
  let linked = null; // resolved on first render
  let oauthAvailable = false; // whether this server has Google credentials configured
  let picker = null;
  let startingTrack = false;

  const playTrack = (track) => {
    if (state.voice.watchSession) { alert(t('act.endWatchFirst')); return; }
    if (startingTrack) return;
    startingTrack = true;
    const thumbnail = track.thumbnail || ytVideoThumbnail(track.videoId);

    // Start from the row's trusted click/keyboard gesture. Waiting for the
    // socket round-trip loses browser user activation and autoplay is blocked,
    // which made the first click only create the session and the second click
    // actually start it.
    ensureYtAudio();
    _ytLoadedVideoId = track.videoId;
    _ytAudio.src = '/api/ytmusic/stream/' + encodeURIComponent(track.videoId);
    _ytAudio.currentTime = 0;
    _ytAudio.play().catch(() => {});

    state.socket.emit('ytmusic:set', {
      videoId: track.videoId, title: track.title, artist: track.artist,
      thumbnail, duration: track.durationSeconds || null,
    });
    picker?.close();
  };

  const trackRow = (track, canPlay, ownerName) => el('div', {
    class: 'ytm-track-row' + (canPlay ? '' : ' disabled'), role: 'button', tabindex: '0',
    on: {
      click: () => { canPlay ? playTrack(track) : alert(t('ytm.someoneElse', { name: ownerName })); },
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); canPlay ? playTrack(track) : alert(t('ytm.someoneElse', { name: ownerName })); } },
    },
  }, [
    ytThumbnailImage(track.videoId, track.thumbnail, 'ytm-track-thumb'),
    el('div', { class: 'ytm-track-meta' }, [
      el('div', { class: 'ytm-track-title' }, track.title),
      el('div', { class: 'ytm-track-artist' }, track.artist || ''),
    ]),
    track.duration ? el('div', { class: 'ytm-track-dur' }, track.duration) : null,
  ]);

  // Home-feed and playlist-library cards both look like a track row but open
  // a playlist instead of playing — same markup, different affordance (an
  // arrow instead of a duration) and click target.
  const playlistCardRow = (pl, onOpen) => el('div', {
    class: 'ytm-track-row', role: 'button', tabindex: '0',
    on: {
      click: onOpen,
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
    },
  }, [
    el('img', { class: 'ytm-track-thumb', src: pl.thumbnail || '', alt: '', loading: 'lazy' }),
    el('div', { class: 'ytm-track-meta' }, [
      el('div', { class: 'ytm-track-title' }, pl.title),
      pl.artist ? el('div', { class: 'ytm-track-artist' }, pl.artist) : (pl.count ? el('div', { class: 'ytm-track-artist' }, pl.count + ' tracks') : null),
    ]),
    icon('arrow-right', 16),
  ]);

  // Home items can be either a playable track or a playlist/album card (see
  // server/ytmusic/bridge.py's norm_home_item) — dispatch on kind. Opening a
  // playlist from Home reuses the Playlists tab's own drill-down view rather
  // than inventing a parallel one.
  const homeItemRow = (item, canPlay, ownerName, doRefresh) => item.kind === 'playlist'
    ? playlistCardRow(item, () => { tab = 'playlists'; playlistView = { playlistId: item.playlistId, title: item.title }; doRefresh(); })
    : trackRow(item, canPlay, ownerName);

  // The linking screen. One headline action (approve disdroc on Google) and
  // everything else folded away behind a disclosure — the extension and the
  // paste-the-headers path still work exactly as before, they're just no longer
  // the first thing a new user has to reason about.
  function renderSetup(body, doRefresh) {
    const wrap = el('div', { class: 'ytm-setup' });
    body.append(wrap);
    wrap.append(el('p', { class: 'ytm-setup-intro' }, t('ytm.setupIntro')));

    // ── Secondary: extension + manual paste, built first so the OAuth branch
    //    can reveal it when one-click linking isn't available here. ──────────
    const altBody = el('div', { class: 'ytm-alt-body' });
    const altToggle = el('button', { type: 'button', class: 'ytm-alt-toggle' }, [
      icon('chevron-down', 16), el('span', {}, t('ytm.altToggle')),
    ]);
    const setAltOpen = (open) => {
      altBody.style.display = open ? '' : 'none';
      altToggle.classList.toggle('open', open);
      altToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    altToggle.addEventListener('click', () => setAltOpen(altBody.style.display === 'none'));

    // The companion browser extension + a one-time code: it captures the real
    // request headers itself the next time it sees music.youtube.com activity,
    // so there's nothing for the user to copy-paste.
    const codeBox = el('div', { class: 'ytm-code-box' });
    const getCodeBtn = el('button', { type: 'button', class: 'ghost', on: { click: async () => {
      getCodeBtn.disabled = true;
      try {
        const r = await api('/api/ytmusic/link-code', { method: 'POST' });
        codeBox.replaceChildren(
          el('div', { class: 'ytm-code-row' }, [el('div', { class: 'ytm-code' }, r.code), ytCopyButton(() => r.code)]),
          el('p', { class: 'ytm-hint' }, t('ytm.codeHint')),
        );
        pollYtLinkStatus(async () => { linked = true; await doRefresh(); }, wrap);
      } catch (e) {
        codeBox.replaceChildren(el('p', { class: 'error' }, e.message));
      } finally { getCodeBtn.disabled = false; }
    } } }, t('ytm.getCode'));
    altBody.append(el('div', { class: 'ytm-alt-option' }, [
      el('h4', { class: 'ytm-alt-title' }, t('ytm.extensionTitle')),
      el('p', { class: 'ytm-alt-desc' }, t('ytm.extensionDesc')),
      el('div', { class: 'ytm-alt-actions' }, [
        el('a', {
          href: '/downloads/disdroc-ytmusic-linker.zip', download: '', class: 'ghost ytm-download',
        }, t('ytm.downloadExtension')),
        getCodeBtn,
      ]),
      codeBox,
    ]));

    // Last resort for anyone who'd rather not install anything: manual paste.
    const pasteBody = el('div', { class: 'ytm-paste-body', style: 'display:none' });
    const pasteToggle = el('button', { type: 'button', class: 'ytm-alt-toggle sub' }, [
      icon('chevron-down', 16), el('span', {}, t('ytm.advancedToggle')),
    ]);
    pasteToggle.addEventListener('click', () => {
      const open = pasteBody.style.display === 'none';
      pasteBody.style.display = open ? '' : 'none';
      pasteToggle.classList.toggle('open', open);
    });
    pasteBody.append(el('ol', { class: 'ytm-setup-steps' }, [
      el('li', {}, t('ytm.setupStep1')),
      el('li', {}, t('ytm.setupStep2')),
      el('li', {}, t('ytm.setupStep3')),
    ]));
    const ta = el('textarea', { placeholder: t('ytm.pastePlaceholder'), rows: 8, class: 'ytm-paste' });
    const errBox = el('div', { class: 'error' });
    const btn = el('button', { type: 'button', on: { click: async () => {
      errBox.textContent = '';
      if (!ta.value.trim()) { errBox.textContent = t('ytm.pasteEmpty'); return; }
      btn.disabled = true; btn.textContent = t('ytm.connecting');
      try {
        await api('/api/ytmusic/link', { method: 'POST', body: JSON.stringify({ headers: ta.value }) });
        linked = true;
        await doRefresh();
      } catch (e) {
        errBox.textContent = t('ytm.connectFailed', { error: e.message });
        btn.disabled = false; btn.textContent = t('ytm.connect');
      }
    } } }, t('ytm.connect'));
    pasteBody.append(el('label', { class: 'ytm-paste-label' }, t('ytm.pasteLabel')), ta, errBox,
      el('div', { class: 'row', style: 'margin-top:10px' }, [btn]));
    altBody.append(el('div', { class: 'ytm-alt-option' }, [pasteToggle, pasteBody]));

    // ── Headline: one-click Google linking ────────────────────────────────
    const oauthBody = el('div', { class: 'ytm-oauth-body' });
    const connectBtn = el('button', { type: 'button', class: 'ytm-connect-btn' }, t('ytm.oauthConnect'));
    const connectCard = el('div', { class: 'ytm-connect-card' }, [
      el('span', { class: 'ytm-connect-mark' }, icon('link', 20)),
      el('div', { class: 'ytm-connect-main' }, [
        el('h4', { class: 'ytm-connect-title' }, t('ytm.oauthTitle')),
        el('p', { class: 'ytm-connect-desc' }, t('ytm.oauthDesc')),
        oauthBody,
      ]),
    ]);
    wrap.append(connectCard, altToggle, altBody);

    // No Google credentials on this server: say so plainly and open the path
    // that does work, rather than offering a button that can only 503.
    const showUnavailable = () => {
      connectCard.classList.add('unavailable');
      oauthBody.replaceChildren(el('p', { class: 'ytm-note' }, t('ytm.oauthUnavailable')));
      setAltOpen(true);
    };

    const showDeviceCode = (r) => {
      const url = r.verification_url || 'https://www.google.com/device';
      const code = r.user_code || '';
      const waiting = el('div', { class: 'ytm-waiting' }, [
        el('span', { class: 'ytm-spinner', 'aria-hidden': 'true' }),
        el('span', {}, t('ytm.oauthWaiting')),
      ]);
      oauthBody.replaceChildren(el('div', { class: 'ytm-steps' }, [
        el('div', { class: 'ytm-step' }, [
          el('span', { class: 'ytm-step-n' }, '1'),
          el('div', { class: 'ytm-step-main' }, [
            el('div', {}, t('ytm.oauthStep1')),
            el('div', { class: 'ytm-code-row' }, [
              el('a', { class: 'ytm-verify-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, url.replace(/^https?:\/\//, '')),
              ytCopyButton(() => url),
            ]),
          ]),
        ]),
        el('div', { class: 'ytm-step' }, [
          el('span', { class: 'ytm-step-n' }, '2'),
          el('div', { class: 'ytm-step-main' }, [
            el('div', {}, t('ytm.oauthStep2')),
            el('div', { class: 'ytm-code-row' }, [el('div', { class: 'ytm-code' }, code), ytCopyButton(() => code)]),
          ]),
        ]),
      ]), waiting);

      const restart = (message) => {
        connectBtn.disabled = false;
        connectBtn.textContent = t('ytm.oauthConnect');
        oauthBody.replaceChildren(el('p', { class: 'error' }, message), connectBtn);
      };
      pollYtOAuth({
        deviceCode: r.device_code, interval: r.interval, expiresIn: r.expires_in, host: wrap,
        onLinked: async () => {
          waiting.replaceChildren(icon('check-circle', 15), el('span', {}, t('ytm.oauthDone')));
          waiting.classList.add('done');
          linked = true;
          await doRefresh();
        },
        onExpired: () => restart(t('ytm.oauthExpired')),
        onError: (e) => {
          if (e.message === 'oauth_not_configured') { showUnavailable(); return; }
          restart(t('ytm.oauthFailed', { error: e.message }));
        },
      });
    };

    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = t('ytm.oauthStarting');
      try {
        showDeviceCode(await api('/api/ytmusic/oauth/start', { method: 'POST', body: '{}' }));
      } catch (e) {
        connectBtn.disabled = false;
        connectBtn.textContent = t('ytm.oauthConnect');
        if (e.message === 'oauth_not_configured') { showUnavailable(); return; }
        oauthBody.replaceChildren(connectBtn, el('p', { class: 'error' }, t('ytm.oauthFailed', { error: e.message })));
      }
    });

    if (oauthAvailable) { oauthBody.append(connectBtn); setAltOpen(false); }
    else showUnavailable();
  }

  picker = panelModal({
    title: t('watch.ytMusicTitle'),
    wide: true,
    render: async (body, doRefresh) => {
      if (linked === null) {
        try {
          const st = await api('/api/ytmusic/status');
          linked = !!st.linked;
          oauthAvailable = !!st.oauthConfigured;
        } catch { linked = false; oauthAvailable = false; }
      }
      const ys = state.voice.ytmusicSession;
      if (ys && ys.ownerId !== state.me.id) {
        body.append(el('div', { class: 'ytm-banner' }, t('ytm.someoneElse', { name: ys.ownerName })));
      }
      if (!linked) { renderSetup(body, doRefresh); return; }

      const canPlay = !ys || ys.ownerId === state.me.id;

      body.append(el('div', { class: 'ytm-unlink-row' }, [
        el('button', { type: 'button', class: 'ghost', style: 'font-size:12px', on: { click: async () => {
          if (!(await confirmModal(t('ytm.unlinkConfirm')))) return;
          await api('/api/ytmusic/link', { method: 'DELETE' });
          linked = false;
          await doRefresh();
        } } }, t('ytm.unlink')),
      ]));

      body.append(el('div', { class: 'ytm-tabs' }, [
        ['home', t('ytm.tabHome')], ['playlists', t('ytm.tabPlaylists')], ['search', t('ytm.tabSearch')],
      ].map(([id, label]) => el('button', {
        type: 'button', class: 'ytm-tab' + (tab === id ? ' active' : ''),
        on: { click: () => { tab = id; playlistView = null; doRefresh(); } },
      }, label))));

      const listHost = el('div', { class: 'ytm-list-host' });
      body.append(listHost);

      if (tab === 'home') {
        listHost.append(el('p', { class: 'muted-text' }, t('watch.searching')));
        try {
          const { sections } = await api('/api/ytmusic/home');
          listHost.innerHTML = '';
          if (!sections.length) listHost.append(el('p', { class: 'muted-text' }, t('ytm.nothingFound')));
          for (const sec of sections) {
            listHost.append(el('h4', { class: 'ytm-section-title' }, sec.title));
            for (const tr of sec.tracks) listHost.append(homeItemRow(tr, canPlay, ys && ys.ownerName, doRefresh));
          }
        } catch (e) { listHost.innerHTML = ''; listHost.append(el('p', { class: 'error' }, e.message)); }
      } else if (tab === 'playlists' && playlistView) {
        listHost.append(el('button', { type: 'button', class: 'ghost', style: 'margin-bottom:10px', on: { click: () => { playlistView = null; doRefresh(); } } }, '← ' + t('ytm.tabPlaylists')));
        const trackHost = el('div', {});
        listHost.append(trackHost);
        trackHost.append(el('p', { class: 'muted-text' }, t('watch.searching')));
        try {
          const { tracks } = await api('/api/ytmusic/playlist/' + encodeURIComponent(playlistView.playlistId));
          trackHost.innerHTML = '';
          for (const tr of tracks) trackHost.append(trackRow(tr, canPlay, ys && ys.ownerName));
          if (!tracks.length) trackHost.append(el('p', { class: 'muted-text' }, t('ytm.nothingFound')));
        } catch (e) { trackHost.innerHTML = ''; trackHost.append(el('p', { class: 'error' }, e.message)); }
      } else if (tab === 'playlists') {
        listHost.append(el('p', { class: 'muted-text' }, t('watch.searching')));
        try {
          const { playlists } = await api('/api/ytmusic/playlists');
          listHost.innerHTML = '';
          for (const pl of playlists) {
            listHost.append(playlistCardRow(pl, () => { playlistView = { playlistId: pl.playlistId, title: pl.title }; doRefresh(); }));
          }
          if (!playlists.length) listHost.append(el('p', { class: 'muted-text' }, t('ytm.nothingFound')));
        } catch (e) { listHost.innerHTML = ''; listHost.append(el('p', { class: 'error' }, e.message)); }
      } else if (tab === 'search') {
        // Only the results div gets rebuilt per keystroke — rebuilding the whole
        // panel (like every other tab does via doRefresh) would tear down and
        // recreate this very input, dropping focus after every character.
        const input = el('input', { placeholder: t('watch.musicSearchPlaceholder'), autocomplete: 'off', value: searchQuery, style: 'width:100%;margin-bottom:10px' });
        const results = el('div', {});
        listHost.append(input, results);
        let seq = 0;
        const runSearch = async (q) => {
          const my = ++seq;
          results.innerHTML = '';
          if (!q) { results.append(el('p', { class: 'muted-text' }, t('watch.typeToSearch'))); return; }
          results.append(el('p', { class: 'muted-text' }, t('watch.searching')));
          try {
            const { tracks } = await api('/api/ytmusic/search?q=' + encodeURIComponent(q));
            if (my !== seq) return;
            results.innerHTML = '';
            for (const tr of tracks) results.append(trackRow(tr, canPlay, ys && ys.ownerName));
            if (!tracks.length) results.append(el('p', { class: 'muted-text' }, t('watch.noResults')));
          } catch (e) {
            if (my !== seq) return;
            results.innerHTML = ''; results.append(el('p', { class: 'error' }, e.message));
          }
        };
        let deb = null;
        input.addEventListener('input', () => { searchQuery = input.value.trim(); clearTimeout(deb); deb = setTimeout(() => runSearch(searchQuery), 400); });
        runSearch(searchQuery);
        setTimeout(() => input.focus(), 0);
      }
    },
  });
}

// ─── Activities: the call-controls hub for shared call activities ────────────
// YouTube (Watch Together, embedded), Twitch (embedded), and Whiteboard
// (built-in shared canvas). Everything here runs inside the app — Gartic Phone
// was dropped 2026-07-25 because garticphone.com sends X-Frame-Options:
// SAMEORIGIN, so its "activity" could never be more than an open-in-tab link.
const YT_LOGO_SVG = '<svg width="42" height="30" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><path fill="#FF0000" d="M27.4 3.1a3.5 3.5 0 0 0-2.5-2.4C22.7 0 14 0 14 0S5.3 0 3.1.7A3.5 3.5 0 0 0 .6 3.1 36.8 36.8 0 0 0 0 10a36.8 36.8 0 0 0 .6 6.9 3.5 3.5 0 0 0 2.5 2.4C5.3 20 14 20 14 20s8.7 0 10.9-.7a3.5 3.5 0 0 0 2.5-2.4A36.8 36.8 0 0 0 28 10a36.8 36.8 0 0 0-.6-6.9z"/><path fill="#fff" d="M11.2 14.3 18.5 10l-7.3-4.3z"/></svg>';
// Official Twitch glitch mark (simple-icons path), purple on the white tile.
const TWITCH_LOGO_SVG = '<svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9146FF" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>';

// Activities dock view. The picker itself is just a list of rows, so it belongs
// in the dock like everything else in the call; the individual activities still
// open their own search/config dialogs, which are real tasks rather than menus.
function renderActivityDock(host) {
  const close = () => closeFloatingMenus();
  const ws = state.voice.watchSession, wb = state.voice.wbSession;

  const row = ({ logo, name, desc, live, click, disabled, endLabel, onEnd }) => {
    const card = el('div', {
      class: 'activity-row' + (disabled ? ' disabled' : ''), role: 'button', tabindex: disabled ? '-1' : '0',
      'aria-disabled': disabled ? 'true' : 'false',
      style: disabled ? 'opacity:.45;cursor:not-allowed' : '',
      on: {
        click: () => { if (!disabled) click(); },
        keydown: (e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); click(); } },
      },
    }, [
      logo,
      el('div', { class: 'activity-meta' }, [
        el('div', { class: 'activity-name' }, [el('span', {}, name), live ? el('span', { class: 'activity-live' }, t('act.live')) : null]),
        el('div', { class: 'activity-desc' }, desc),
      ]),
      onEnd ? el('button', {
        type: 'button', class: 'activity-end',
        on: { click: (e) => { e.stopPropagation(); onEnd(); } },
      }, endLabel || t('act.end')) : icon('arrow-right', 18),
    ]);
    return card;
  };

  const svgLogo = (cls, svg) => { const s = el('span', { class: 'activity-logo ' + cls }); s.innerHTML = svg; return s; };

  const gs = state.voice.gameSession;
  const ys = state.voice.ytmusicSession;

  const list = el('div', { class: 'activity-list' }, [
    row({
      logo: svgLogo('yt', YT_LOGO_SVG),
      name: 'YouTube',
      desc: ws ? t('act.youtubeNowPlaying', { title: ws.title || t('act.aVideo') }) : t('act.youtubeDesc'),
      live: !!ws,
      disabled: !!ys,
      // Always straight to the search — when something is already playing, the
      // row's own End button covers the only other thing the old menu offered.
      click: () => { close(); openWatchSearch(); },
      ...(ws ? { endLabel: t('act.end'), onEnd: () => { state.socket.emit('watch:stop'); refreshDock(); } } : {}),
    }),
    row({
      logo: el('span', { class: 'activity-logo music' }, icon('music', 27)),
      name: t('watch.ytMusicTitle'),
      desc: ys ? t('act.ytMusicNowPlaying', { title: ys.title || t('act.aSong') }) : t('act.ytMusicDesc'),
      live: !!ys,
      disabled: !!ws,
      click: () => { close(); openYtMusicModal(); },
      ...(ys && ys.ownerId === state.me.id ? { endLabel: t('act.end'), onEnd: () => { state.socket.emit('ytmusic:stop'); refreshDock(); } } : {}),
    }),
    row({
      logo: svgLogo('twitch', TWITCH_LOGO_SVG),
      name: 'Twitch',
      desc: (gs && gs.key === 'twitch') ? t('act.twitchWatching', { channel: gs.channel || t('act.aStream') })
        : t('act.twitchDesc'),
      live: !!(gs && gs.key === 'twitch'),
      click: () => { close(); openTwitchModal(); },
      ...(gs && gs.key === 'twitch' ? { endLabel: t('act.end'), onEnd: () => { state.socket.emit('game:stop'); close(); } } : {}),
    }),
    row({
      logo: el('span', { class: 'activity-logo wb' }, icon('pencil', 27)),
      name: t('act.whiteboard'),
      desc: wb ? t('act.whiteboardOpen') : t('act.whiteboardDesc'),
      live: !!wb,
      click: () => { if (!state.voice.wbSession) state.socket.emit('wb:start'); close(); },
      ...(wb ? { endLabel: t('act.end'), onEnd: () => { state.socket.emit('wb:stop'); close(); } } : {}),
    }),
    row({
      logo: el('span', { class: 'activity-logo draw' }, el('img', { src: '/assets/activities/scribblers.png', alt: t('act.sketchGuess') })),
      name: t('act.sketchGuess'),
      desc: (gs && gs.key === 'draw') ? t('act.drawRunning') : t('act.drawDesc'),
      live: !!(gs && gs.key === 'draw'),
      click: () => { if (!(gs && gs.key === 'draw')) state.socket.emit('game:start', { game: 'draw' }); close(); },
      ...(gs && gs.key === 'draw' ? { endLabel: t('act.end'), onEnd: () => { state.socket.emit('game:stop'); close(); } } : {}),
    }),
  ]);

  host.append(list);
}

// ─── Call popovers ────────────────────────────────────────────────────────────
// Voice fx, soundboard, screen-share options, activities and people-volume each
// get their own small popover off their own bar button — the same
// .floating-menu mechanism every other menu in the app already uses
// (positionFloatingMenu/armOutsideClose), which also means phones get the
// existing bottom-sheet treatment for free, no separate mobile layout needed.
// This replaces an earlier single shared panel (a tab strip switching between
// all five) that always cost the video real width or height to stay open even
// when you only wanted one of the five — see disdroc-project memory for why
// that got pulled back out.

// Popover key → the render function that fills it (unchanged from before;
// only the container around them changed). Each just appends into `host`.
const CALL_POPOVER_VIEWS = {
  fx: renderVoiceFxDock,
  sound: renderSoundboardDock,
  screen: renderScreenDock,
  activity: renderActivityDock,
  people: renderPeopleDock,
};

// Keep only the five popover launchers' open state in sync. Re-rendering the
// call surface here would replace every <video>, reassign srcObject and flash
// the camera/share just to change one button class.
function refreshCallPopoverButtons() {
  const menu = document.querySelector('.floating-menu.call-popover:not(.anim-out)');
  const openKey = menu ? menu.dataset.key : null;
  for (const button of document.querySelectorAll('.call-controls button[data-popover-key]')) {
    const isOpen = button.dataset.popoverKey === openKey;
    const activeClass = button.dataset.popoverActiveClass || 'accent';
    // Mobile Voice FX also stays highlighted while an effect is enabled; that
    // persistent state is independent from whether its popover is open.
    const persistent = button.dataset.popoverKey === 'fx' && activeClass === 'active'
      && savedVoicePreset() !== 'none';
    button.classList.toggle(activeClass, isOpen || persistent);
  }
}

// Open (or close, if it's already the one open) a popover anchored to a bar
// button. Only one is ever open at a time, same convention every other
// floating menu in the app already follows.
function toggleCallPopover(key, anchor) {
  if (state.voice.channelId == null) return;
  const existing = document.querySelector('.floating-menu:not(.anim-out)');
  const wasSameKey = existing && existing.classList.contains('call-popover') && existing.dataset.key === key;
  if (existing) closeFloatingMenus();
  if (wasSameKey) { refreshCallPopoverButtons(); return; }
  const view = CALL_POPOVER_VIEWS[key];
  if (!view) return;
  const menu = el('div', { class: 'floating-menu call-popover call-popover-' + key, dataset: { key } });
  document.body.append(menu);
  const out = view(menu);
  if (out && typeof out.then === 'function') {
    menu.append(el('p', { class: 'muted-text dock-loading' }, t('conn.loading')));
    out.finally(() => {
      menu.querySelector('.dock-loading')?.remove();
      const anchorLive = typeof anchor.getBoundingClientRect !== 'function' || anchor.isConnected;
      if (menu.isConnected && !menu.classList.contains('anim-out') && anchorLive) layoutFloatingMenu(menu, anchor);
    });
  }
  positionFloatingMenu(menu, anchor);
  armOutsideClose(menu);
  // Catch every OTHER way this popover can go away — an outside click, Escape,
  // a different popover opening over it, leaving the call — so the button
  // that opened it always reflects reality, not just on a same-button click.
  const obs = new MutationObserver(() => {
    if (!menu.isConnected) { obs.disconnect(); refreshCallPopoverButtons(); }
  });
  obs.observe(document.body, { childList: true });
  refreshCallPopoverButtons();
}

// Re-render whichever call-options surface is currently open in place. The
// legacy name remains so unrelated state-change call sites do not need churn.
function refreshDock() {
  for (const menu of document.querySelectorAll('.call-popover:not(.anim-out)')) {
    const view = CALL_POPOVER_VIEWS[menu.dataset.key];
    if (!view) continue;
    menu.innerHTML = '';
    view(menu);
  }
}

// People dock view: everyone in the call with their per-person volume. This used
// to be reachable only by right-clicking a tile, which is not a gesture a phone
// has — so "turn that one loud person down" was desktop-only until now.
function renderPeopleDock(host) {
  const room = state.voiceRooms.get(state.voice.channelId) || [];
  const peers = [...state.voice.peers.values()];
  if (!peers.length) {
    host.append(el('p', { class: 'muted-text' }, t('dock.nobodyElse')));
    return;
  }
  const list = el('div', { class: 'dock-people' });
  for (const peer of peers) {
    const meta = room.find((p) => p.id === peer.userId) || { username: peer.username, id: peer.userId };
    const pref = userVoicePref(peer.userId);
    const val = el('span', { class: 'vfx-val' }, pref.muted ? t('dock.mutedShort') : pref.vol + '%');
    const slider = el('input', {
      type: 'range', class: 'vfx-slider', min: '0', max: '200', step: '5',
      value: String(pref.vol), disabled: pref.muted ? '' : undefined,
    });
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      val.textContent = v + '%';
      setUserVoicePref(peer.userId, { vol: v });
    });
    const muteBtn = el('button', {
      type: 'button', class: 'dock-icon-btn' + (pref.muted ? ' on' : ''),
      title: pref.muted ? t('menu.unmuteForMe') : t('menu.muteForMe'),
      on: { click: () => { setUserVoicePref(peer.userId, { muted: !pref.muted }); renderVoiceBar(); host.innerHTML = ''; renderPeopleDock(host); } },
    }, icon(pref.muted ? 'volume-x' : 'volume', 16));
    list.append(el('div', { class: 'dock-person' }, [
      avatarEl(meta, 'small'),
      el('div', { class: 'dock-person-main' }, [
        el('span', { class: 'dock-person-name' }, userLabel(meta)),
        el('div', { class: 'dock-person-vol' }, [slider, val]),
      ]),
      muteBtn,
    ]));
  }
  host.append(list);
}

// ─── Voice changer ────────────────────────────────────────────────────────────
// Deliberately the same shape as the soundboard: a grid of emoji + label tiles
// you tap, with the controls for the current pick underneath. Two panels that do
// "pick a thing that changes how you sound" should not look like two different
// features, and the soundboard grid is already the thing people know.

// voicefx.js's PRESETS/params are plain English data (it's a self-contained Web
// Audio engine with no i18n access, deliberately kept that way) — these map its
// ids/label text to translated display strings for this dock view only.
const VFX_PRESET_NAME_KEYS = {
  none: 'vfx.none', helium: 'vfx.helium', deep: 'vfx.deep', robot: 'vfx.robot',
  alien: 'vfx.alien', radio: 'vfx.radio', megaphone: 'vfx.megaphone', cave: 'vfx.cave',
  underwater: 'vfx.underwater', demon: 'vfx.demon', chipmunk: 'vfx.chipmunk', whisper: 'vfx.whisper',
};
const VFX_PARAM_LABEL_KEYS = {
  Pitch: 'vfx.pPitch', Bass: 'vfx.pBass', Carrier: 'vfx.pCarrier', Metal: 'vfx.pMetal',
  Vibrato: 'vfx.pVibrato', Drive: 'vfx.pDrive', Static: 'vfx.pStatic', Slapback: 'vfx.pSlapback',
  Size: 'vfx.pSize', Echo: 'vfx.pEcho', Wet: 'vfx.pWet', Muffle: 'vfx.pMuffle',
  Motion: 'vfx.pMotion', Double: 'vfx.pDouble', Presence: 'vfx.pPresence', Air: 'vfx.pAir', Breath: 'vfx.pBreath',
};
function vfxPresetName(p) { return t(VFX_PRESET_NAME_KEYS[p.id] || p.id) || p.name; }
function vfxParamLabel(param) { const k = VFX_PARAM_LABEL_KEYS[param.label]; return k ? t(k) : param.label; }

function renderVoiceFxDock(host) {
  const VFX = window.VoiceFX;
  if (!VFX || !VFX.isSupported()) {
    host.append(el('p', { class: 'muted-text' }, t('dock.vfxUnsupported')));
    return;
  }

  const current = savedVoicePreset();

  const grid = el('div', { class: 'sb-grid vfx-grid' });
  for (const p of VFX.PRESETS) {
    const name = vfxPresetName(p);
    grid.append(el('button', {
      type: 'button',
      class: 'sb-sound vfx-preset' + (p.id === current ? ' on' : ''),
      title: p.id === 'none' ? t('dock.sendNormalVoice') : t('dock.soundLike', { name }),
      on: { click: async () => {
        await setVoicePreset(p.id);
        host.innerHTML = ''; renderVoiceFxDock(host); // reflect the new pick + swap in its sliders
      } },
    }, [el('span', { class: 'sb-emoji' }, p.emoji), el('span', { class: 'sb-name' }, name)]));
  }
  host.append(grid);

  const info = VFX.PRESETS.find((p) => p.id === current);
  const tuning = el('div', { class: 'vfx-tuning' });

  if (info && info.params.length) {
    const vals = VFX.getParams(current);
    for (const param of info.params) {
      const out = el('span', { class: 'vfx-val' }, String(vals[param.key]) + (param.unit || ''));
      const slider = el('input', {
        type: 'range', class: 'vfx-slider',
        min: String(param.min), max: String(param.max), step: String(param.step),
        value: String(vals[param.key]),
      });
      // 'input' (not 'change') so it moves while you drag — you are listening to
      // yourself through the monitor and want to hear the sweep, not the result.
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        out.textContent = (Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')) + (param.unit || '');
        VFX.setParam(current, param.key, v);
      });
      tuning.append(el('label', { class: 'vfx-row' }, [
        el('span', { class: 'vfx-label' }, vfxParamLabel(param)), slider, out,
      ]));
    }
    tuning.append(el('button', {
      type: 'button', class: 'vfx-reset',
      on: { click: () => { VFX.resetParams(current); host.innerHTML = ''; renderVoiceFxDock(host); } },
    }, [icon('rotate-ccw', 14), el('span', {}, t('dock.resetLabel'))]));
  } else if (current === 'none') {
    tuning.append(el('p', { class: 'muted-text vfx-hint' }, t('dock.pickEffectHint')));
  }
  host.append(tuning);

  const toggles = el('div', { class: 'dock-opts' });
  toggles.append(dockToggle(t('dock.hearYourself'), VFX.isMonitoring(), (on) => { VFX.setMonitor(on); }));
  toggles.append(dockToggle(t('dock.noiseGate'), savedNoiseGate(), (on) => { setNoiseGate(on); }));
  host.append(toggles);
  host.append(el('p', { class: 'muted-text vfx-foot' }, t('dock.noiseGateFoot')));
}

// ─── Soundboard ───────────────────────────────────────────────────────────────
// Discord-style panel: a search bar on top, then one section per server the
// user is in (with "+ Add Sound" for owners/admins), then the site-wide
// default sounds. Every sound has an emoji shown on its button (🔊 fallback).

// Small "pick an emoji" control for the sound upload forms.
// Returns { node, get } — a button showing the current pick.
function soundEmojiPickEl(initial) {
  let val = initial || '';
  const btn = el('button', {
    type: 'button', class: 'sb-emoji-pick', title: 'Pick an emoji',
    on: { click: (e) => {
      e.stopPropagation();
      openFloatingPicker(btn, (em) => { if (em.char) { val = em.char; btn.textContent = em.char; } }, true);
    } },
  }, val || '🔊');
  return { node: btn, get: () => val };
}

// Soundboard dock view: a search bar on top, then one section per server you are
// in, then the site-wide defaults. Playing a sound leaves the panel exactly where
// it is — that is the whole point of docking it instead of using a popover, since
// a soundboard is something you mash repeatedly while the call carries on.
// Sounds are added in Server settings → Soundboard, not from here.
async function renderSoundboardDock(host) {
  let data = { defaults: [], servers: [] };
  try { data = await api('/api/soundboard'); } catch {}

  const soundBtn = (s) => {
    const b = el('button', {
      type: 'button', class: 'sb-sound', title: t('dock.playSoundTitle', { name: s.name }),
      dataset: { q: (s.name + ' ' + (s.emoji || '')).toLowerCase() },
      on: { click: () => {
        try { state.socket.emit('soundboard:play', { soundId: s.id }); } catch {}
        // Mirror the server's 1.5s anti-spam window so mashing doesn't feel broken.
        b.disabled = true;
        setTimeout(() => { b.disabled = false; }, 1500);
      } },
    }, [el('span', { class: 'sb-emoji' }, s.emoji || '🔊'), el('span', { class: 'sb-name' }, s.name)]);
    return b;
  };

  const sections = [];
  const body = el('div', { class: 'sb-body' });
  // Server sections first (Discord order), then the site defaults.
  for (const sv of (data.servers || [])) {
    if (!(sv.sounds || []).length) continue;
    const sec = el('div', { class: 'sb-section' }, [
      el('div', { class: 'sb-head' }, [
        sv.icon_path
          ? el('img', { class: 'sb-srv-icon', src: '/api/server-icon/' + sv.icon_path, alt: '', loading: 'lazy' })
          : el('span', { class: 'sb-srv-icon sb-srv-initial' }, initials(sv.name)),
        el('span', { class: 'sb-head-name' }, sv.name),
      ]),
      el('div', { class: 'sb-grid' }, sv.sounds.map(soundBtn)),
    ]);
    sections.push(sec); body.append(sec);
  }
  if (data.defaults && data.defaults.length) {
    const sec = el('div', { class: 'sb-section' }, [
      el('div', { class: 'sb-head' }, [
        el('span', { class: 'sb-srv-icon sb-srv-initial' }, '🔊'),
        el('span', { class: 'sb-head-name' }, t('dock.disdrocSounds')),
      ]),
      el('div', { class: 'sb-grid' }, data.defaults.map(soundBtn)),
    ]);
    sections.push(sec); body.append(sec);
  }
  if (!body.childElementCount) {
    body.append(el('p', { class: 'muted-text', style: 'margin:6px 0' }, t('dock.noSoundsYet')));
  }

  // Live search over every section; sections with no matches collapse.
  const search = el('input', { class: 'sb-search-input', placeholder: t('dock.searchForSound'), autocomplete: 'off' });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const sec of sections) {
      let any = false;
      for (const b of sec.querySelectorAll('.sb-sound')) {
        const show = !q || (b.dataset.q || '').includes(q);
        b.style.display = show ? '' : 'none';
        if (show) any = true;
      }
      sec.style.display = any ? '' : 'none';
    }
  });

  host.append(el('div', { class: 'sb-pane' }, [
    el('div', { class: 'sb-search' }, [search, icon('search', 15)]),
    body,
  ]));
  // Don't steal focus on phones — the on-screen keyboard would slide up over the
  // sound grid the moment you open the panel.
  if (!isMobileLayout()) setTimeout(() => search.focus(), 0);
}

// Twitch watch-together: pick a channel, everyone's call embeds the official
// player (live streams are inherently in sync — no playback syncing needed).
function openTwitchModal() {
  if (state.voice.channelId == null) { alert(t('twitch.joinFirst')); return; }
  const gs = state.voice.gameSession;
  const input = el('input', {
    placeholder: t('twitch.channelPlaceholder'), autocomplete: 'off',
    value: (gs && gs.key === 'twitch' && gs.channel) || '',
  });
  modal({
    title: t('twitch.title'),
    content: el('div', {}, [
      el('p', { class: 'muted-text', style: 'margin:0 0 10px' }, t('twitch.hint')),
      el('label', {}, t('twitch.channel')), input,
    ]),
    submitLabel: t('twitch.watch'),
    onSubmit: () => {
      // Accept "xqc", "twitch.tv/xqc", or a full URL with junk after the name.
      let c = input.value.trim();
      const m = c.match(/twitch\.tv\/([A-Za-z0-9_]+)/i);
      if (m) c = m[1];
      if (!/^[A-Za-z0-9_]{3,25}$/.test(c)) { alert(t('twitch.notAChannel')); return false; }
      state.socket.emit('game:start', { game: 'twitch', channel: c });
      return true;
    },
  });
}

// ─── Whiteboard: shared drawing board in voice calls ─────────────────────────
// Same slot-tracking overlay pattern as Watch Together (see the comment there).
// Strokes live server-side per call; points are normalized 0..1 in a fixed 16:9
// board space that gets letterboxed into whatever size the slot happens to be,
// so every participant sees identical geometry. In-flight strokes stream over
// wb:progress for live drawing; the finished stroke commits via wb:stroke.
const WB_ASPECT = 16 / 9;
const WB_BG = '#f6f7f4'; // board background; the eraser paints with this
const WB_COLORS = [
  '#1f2430', '#e5484d', '#f0883e', '#eac54f', '#46a758', '#3e8ef7', '#8e4ec6', '#e93d82',
  '#ffffff', '#6b7280', '#14b8a6', '#84cc16', '#1e3a8a', '#065f46', '#78350f', '#db2777',
];
const WB_SIZES = [3, 6, 10, 14, 20]; // logical px relative to a 900-tall board
// Four pencil textures, all rendered client-side from the same normalized
// point stream — no extra network cost beyond the one 'tex' string per
// stroke. 'spray' seeds its scatter from the stroke id + point coordinates
// (both already identical on every client) so the dot pattern matches
// exactly across everyone's canvas without transmitting individual dots.
const WB_TEXTURES = ['pencil', 'marker', 'chalk', 'spray'];
let _wbOverlay = null, _wbCanvas = null, _wbCtx = null, _wbPosRaf = null;
let _wbDrawing = null;          // local in-flight stroke {id,c,w,erase,tex,pts,sent,lastFlush}
let _wbLive = new Map();        // tempId -> {c,w,erase,tex,last,drawn} remote in-flight strokes
let _wbTool = { c: WB_COLORS[0], w: WB_SIZES[1], erase: false, tex: 'pencil' };
let _wbSeq = 0;

function wbHashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function wbSeededRand(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

// Scatters small dots around each point instead of stroking a path — the
// 'spray'/airbrush texture. `id` + each point's own coordinates seed the
// scatter, so remote clients (who receive the same id/points) draw the
// identical dots without the dots themselves ever going over the wire.
function wbPaintSpray(ctx, id, pts, color, width) {
  ctx.save();
  ctx.fillStyle = color;
  const idHash = wbHashStr(id || '');
  const dotsPerPoint = 6;
  const radius = width * 1.1;
  for (const p of pts) {
    const baseSeed = idHash + p.nx * 99991 + p.ny * 104729;
    for (let k = 0; k < dotsPerPoint; k++) {
      const angle = wbSeededRand(baseSeed + k * 13.37) * Math.PI * 2;
      const dist = wbSeededRand(baseSeed + k * 7.91 + 1) * radius;
      const dotR = Math.max(0.5, width * 0.12);
      ctx.beginPath();
      ctx.arc(p.px + Math.cos(angle) * dist, p.py + Math.sin(angle) * dist, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Pencil = plain solid line (original behavior). Marker = thicker + partly
// transparent so overlapping strokes visibly build up. Chalk = dashed with
// slightly reduced opacity for a grainy broken-line look. Spray is handled
// separately by wbPaintSpray (no continuous path at all).
function wbStrokeTexturedPath(ctx, boardPts, color, width, tex) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (tex === 'marker') {
    ctx.lineWidth = width * 1.35;
    ctx.globalAlpha = 0.55;
  } else if (tex === 'chalk') {
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([Math.max(4, width * 1.6), Math.max(3, width * 1.1)]);
  }
  ctx.beginPath();
  ctx.moveTo(boardPts[0].px, boardPts[0].py);
  if (boardPts.length === 1) ctx.lineTo(boardPts[0].px + 0.01, boardPts[0].py);
  for (let i = 1; i < boardPts.length; i++) ctx.lineTo(boardPts[i].px, boardPts[i].py);
  ctx.stroke();
  ctx.restore();
}

function applyWbState(session) {
  const had = !!state.voice.wbSession;
  state.voice.wbSession = session ? { strokes: session.strokes || [], startedBy: session.startedBy } : null;
  if (!session) { teardownWb(); renderVoiceBar(); return; }
  ensureWbOverlay();
  wbRedraw();
  if (!had) { renderVoiceBar(); }
}

// The largest 16:9 rect centered inside the canvas, in device pixels.
function wbBoardRect() {
  const cw = _wbCanvas.width, ch = _wbCanvas.height;
  let w = cw, h = cw / WB_ASPECT;
  if (h > ch) { h = ch; w = ch * WB_ASPECT; }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function wbRedraw() {
  if (!_wbCtx || !_wbCanvas) return;
  const s = state.voice.wbSession;
  const ctx = _wbCtx;
  ctx.clearRect(0, 0, _wbCanvas.width, _wbCanvas.height);
  const r = wbBoardRect();
  ctx.fillStyle = WB_BG;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (!s) return;
  for (const st of s.strokes) wbPaintStroke(st, r);
  if (_wbDrawing) wbPaintStroke(_wbDrawing, r);
  // Remote strokes still in flight were painted incrementally and got wiped by
  // the clear above — their accumulated points aren't kept, so just reset them
  // (the final wb:stroke commit repaints the full thing anyway).
  _wbLive.clear();
}

function wbToBoardPts(pts, r) {
  return pts.map((p) => ({ nx: p[0], ny: p[1], px: r.x + p[0] * r.w, py: r.y + p[1] * r.h }));
}

function wbPaintStroke(st, r) {
  const ctx = _wbCtx;
  if (!st.pts || !st.pts.length) return;
  const erase = st.erase;
  const tex = erase ? 'pencil' : (st.tex || 'pencil');
  const color = erase ? WB_BG : st.c;
  const width = Math.max(1, (erase ? st.w * 4 : st.w) * (r.h / 900));
  const boardPts = wbToBoardPts(st.pts, r);
  if (!erase && tex === 'spray') wbPaintSpray(ctx, st.id, boardPts, color, width);
  else wbStrokeTexturedPath(ctx, boardPts, color, width, tex);
}

// Incremental segment for live strokes (local while dragging, remote via
// wb:progress) — draws from the stroke's previous point through the new ones.
function wbPaintSegment(from, pts, c, w, erase, tex, id) {
  if (!_wbCtx || !pts.length) return;
  const r = wbBoardRect();
  const ctx = _wbCtx;
  const effTex = erase ? 'pencil' : (tex || 'pencil');
  const color = erase ? WB_BG : c;
  const width = Math.max(1, (erase ? w * 4 : w) * (r.h / 900));
  if (!erase && effTex === 'spray') {
    wbPaintSpray(ctx, id, wbToBoardPts(pts, r), color, width);
    return;
  }
  const boardPts = wbToBoardPts(from ? [from, ...pts] : pts, r);
  if (!from && boardPts.length === 1) {
    wbStrokeTexturedPath(ctx, [boardPts[0], { ...boardPts[0], px: boardPts[0].px + 0.01 }], color, width, effTex);
    return;
  }
  wbStrokeTexturedPath(ctx, boardPts, color, width, effTex);
}

function wbDrawProgress(d) {
  if (!d || !Array.isArray(d.pts) || !d.pts.length) return;
  let live = _wbLive.get(d.id);
  if (!live) { live = { c: d.c, w: d.w, erase: d.erase, tex: d.tex, last: null, drawn: 0 }; _wbLive.set(d.id, live); }
  wbPaintSegment(live.last, d.pts, live.c, live.w, live.erase, live.tex, d.id);
  live.last = d.pts[d.pts.length - 1];
  live.drawn += d.pts.length;
}

function wbCommitRemote(tempId, stroke) {
  const s = state.voice.wbSession;
  if (!s || !stroke) return;
  s.strokes.push(stroke);
  const live = _wbLive.get(tempId);
  _wbLive.delete(tempId);
  // If the live preview already painted every point, the pixels are correct;
  // otherwise (joined mid-stroke, dropped progress packet) repaint fully.
  if (!live || live.drawn !== stroke.pts.length) wbRedraw();
}

function wbPointerPos(e) {
  const rect = _wbCanvas.getBoundingClientRect();
  const dpr = _wbCanvas.width / rect.width;
  const r = wbBoardRect();
  const x = ((e.clientX - rect.left) * dpr - r.x) / r.w;
  const y = ((e.clientY - rect.top) * dpr - r.y) / r.h;
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}

function wbFlushProgress(final) {
  const d = _wbDrawing;
  if (!d) return;
  const fresh = d.pts.slice(d.sent);
  if (fresh.length) {
    state.socket.emit('wb:progress', { id: d.id, c: d.c, w: d.w, erase: d.erase, tex: d.tex, pts: fresh });
    d.sent = d.pts.length;
  }
  if (final) state.socket.emit('wb:stroke', { id: d.id, c: d.c, w: d.w, erase: d.erase, tex: d.tex, pts: d.pts });
}

function ensureWbOverlay() {
  if (_wbOverlay) return;
  _wbCanvas = el('canvas', { class: 'wb-canvas' });
  _wbCtx = _wbCanvas.getContext('2d');

  _wbCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!state.voice.wbSession) return;
    e.preventDefault();
    try { _wbCanvas.setPointerCapture(e.pointerId); } catch {}
    const pt = wbPointerPos(e);
    _wbDrawing = {
      id: 't' + state.me.id + '-' + Date.now() + '-' + (++_wbSeq),
      c: _wbTool.c, w: _wbTool.w, erase: _wbTool.erase, tex: _wbTool.tex,
      pts: [pt], sent: 0, lastFlush: Date.now(), last: pt,
    };
    wbPaintSegment(null, [pt], _wbDrawing.c, _wbDrawing.w, _wbDrawing.erase, _wbDrawing.tex, _wbDrawing.id);
  });
  _wbCanvas.addEventListener('pointermove', (e) => {
    const d = _wbDrawing;
    if (!d) return;
    e.preventDefault();
    const pt = wbPointerPos(e);
    // Skip sub-pixel jitter — keeps strokes light for the relay and the redraw.
    if (Math.abs(pt[0] - d.last[0]) < 0.0015 && Math.abs(pt[1] - d.last[1]) < 0.0015) return;
    wbPaintSegment(d.last, [pt], d.c, d.w, d.erase, d.tex, d.id);
    d.pts.push(pt); d.last = pt;
    if (d.pts.length - d.sent >= 10 || Date.now() - d.lastFlush > 80) {
      wbFlushProgress(false);
      d.lastFlush = Date.now();
    }
  });
  const finish = (e) => {
    const d = _wbDrawing;
    if (!d) return;
    e.preventDefault();
    wbFlushProgress(true);
    // Keep it locally under the temp id — wb:ack swaps in the server id.
    const s = state.voice.wbSession;
    if (s && s.strokes.length < 4000) s.strokes.push({ id: d.id, by: state.me.id, c: d.c, w: d.w, erase: d.erase, tex: d.tex, pts: d.pts });
    _wbDrawing = null;
  };
  _wbCanvas.addEventListener('pointerup', finish);
  _wbCanvas.addEventListener('pointercancel', finish);

  const tools = el('div', { class: 'wb-tools' });
  const WB_TEX_META = {
    pencil: { icon: 'pencil', label: 'Pencil' },
    marker: { icon: 'paintbrush', label: 'Marker' },
    chalk: { icon: 'chalk', label: 'Chalk' },
    spray: { icon: 'spray', label: 'Spray' },
  };
  const sync = () => {
    for (const b of tools.querySelectorAll('.wb-swatch')) b.classList.toggle('sel', !_wbTool.erase && b.dataset.c === _wbTool.c);
    for (const b of tools.querySelectorAll('.wb-size')) b.classList.toggle('sel', +b.dataset.w === _wbTool.w);
    for (const b of tools.querySelectorAll('.wb-texture')) b.classList.toggle('sel', !_wbTool.erase && b.dataset.tex === _wbTool.tex);
    const er = tools.querySelector('.wb-eraser'); if (er) er.classList.toggle('sel', _wbTool.erase);
  };
  for (const tex of WB_TEXTURES) {
    const meta = WB_TEX_META[tex];
    tools.append(el('button', {
      type: 'button', class: 'wb-tool wb-texture', dataset: { tex }, title: meta.label, 'aria-label': meta.label,
      on: { click: () => { _wbTool.tex = tex; _wbTool.erase = false; sync(); } },
    }, icon(meta.icon, 15)));
  }
  for (const c of WB_COLORS) {
    tools.append(el('button', {
      type: 'button', class: 'wb-swatch', dataset: { c }, title: 'Pen color', 'aria-label': 'Pen color ' + c,
      style: { background: c }, on: { click: () => { _wbTool.c = c; _wbTool.erase = false; sync(); } },
    }));
  }
  tools.append(el('span', { class: 'wb-gap' }));
  for (const w of WB_SIZES) {
    tools.append(el('button', {
      type: 'button', class: 'wb-size', dataset: { w }, title: 'Pen size', 'aria-label': 'Pen size ' + w,
      on: { click: () => { _wbTool.w = w; sync(); } },
    }, el('i', { style: { width: (4 + w) + 'px', height: (4 + w) + 'px' } })));
  }
  tools.append(el('button', {
    type: 'button', class: 'wb-tool wb-eraser', title: 'Eraser', 'aria-label': 'Eraser',
    on: { click: () => { _wbTool.erase = !_wbTool.erase; sync(); } },
  }, icon('ban', 15)));
  tools.append(el('button', {
    type: 'button', class: 'wb-tool wb-random', title: 'Random color', 'aria-label': 'Random color',
    on: {
      click: () => {
        const others = WB_COLORS.filter((c) => c !== _wbTool.c);
        _wbTool.c = others[Math.floor(Math.random() * others.length)] || WB_COLORS[0];
        _wbTool.erase = false;
        sync();
      },
    },
  }, icon('shuffle', 15)));

  _wbOverlay = el('div', { id: 'wbOverlay', class: 'watch-hidden' }, [
    el('div', { class: 'watch-head' }, [
      icon('pencil', 15),
      el('span', { class: 'watch-title' }, t('act.whiteboard')),
      el('button', {
        type: 'button', title: 'Undo my last stroke', 'aria-label': 'Undo my last stroke',
        on: { click: () => state.socket.emit('wb:undo') },
      }, icon('rotate-ccw', 15)),
      el('button', {
        type: 'button', title: 'Clear the board (for everyone)', 'aria-label': 'Clear the board for everyone',
        on: { click: async () => { if (await confirmModal('Clear the whiteboard for everyone?')) state.socket.emit('wb:clear'); } },
      }, icon('trash', 15)),
      el('button', {
        type: 'button', title: 'End whiteboard (for everyone)', 'aria-label': 'End whiteboard for everyone',
        on: { click: () => state.socket.emit('wb:stop') },
      }, icon('x', 16)),
    ]),
    el('div', { class: 'wb-body' }, _wbCanvas),
    tools,
  ]);
  document.body.append(_wbOverlay);
  sync();

  // Track the .wb-slot placeholder (stage wins over voice bar), resizing the
  // canvas backing store — with a full redraw — whenever the slot size changes.
  const track = () => {
    if (!_wbOverlay) return;
    const slot = document.querySelector('#callStage .wb-slot') || document.querySelector('#voiceBar .wb-slot');
    if (!slot) {
      _wbOverlay.classList.add('watch-hidden');
    } else {
      const r = slot.getBoundingClientRect();
      _wbOverlay.classList.remove('watch-hidden');
      const st = _wbOverlay.style;
      st.left = r.left + 'px'; st.top = r.top + 'px';
      st.width = r.width + 'px'; st.height = r.height + 'px';
      const body = _wbOverlay.querySelector('.wb-body');
      const br = body.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.round(br.width * dpr)), ch = Math.max(1, Math.round(br.height * dpr));
      if (_wbCanvas.width !== cw || _wbCanvas.height !== ch) {
        _wbCanvas.width = cw; _wbCanvas.height = ch;
        wbRedraw();
      }
    }
    _wbPosRaf = requestAnimationFrame(track);
  };
  _wbPosRaf = requestAnimationFrame(track);
}

function teardownWb() {
  state.voice.wbSession = null;
  if (_wbPosRaf) { cancelAnimationFrame(_wbPosRaf); _wbPosRaf = null; }
  if (_wbOverlay) { _wbOverlay.remove(); _wbOverlay = null; }
  _wbCanvas = null; _wbCtx = null; _wbDrawing = null;
  _wbLive.clear();
}

// ─── Embedded games: shared game room in an iframe (Activities) ──────────────
// Same slot-tracking overlay pattern as Watch Together/Whiteboard. The server
// hands every participant the same room URL; the iframe src is only set when
// the URL actually changes so re-renders never reload the game mid-round.
let _gameOverlay = null, _gameFrame = null, _gamePosRaf = null;

function applyGameState(session) {
  const prev = state.voice.gameSession;
  state.voice.gameSession = session || null;
  if (!session) { teardownGame(); renderVoiceBar(); return; }
  ensureGameOverlay();
  if (!prev || prev.url !== session.url) _gameFrame.src = session.url;
  const t = _gameOverlay.querySelector('.watch-title');
  if (t) t.textContent = session.name || 'Game';
  if (!prev || prev.url !== session.url) renderVoiceBar();
}

function ensureGameOverlay() {
  if (_gameOverlay) return;
  _gameFrame = document.createElement('iframe');
  _gameFrame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write');
  _gameFrame.setAttribute('allowfullscreen', '');
  _gameFrame.title = 'Activity';
  _gameOverlay = el('div', { id: 'gameOverlay', class: 'watch-hidden' }, [
    el('div', { class: 'watch-head' }, [
      icon('sparkles', 16),
      el('span', { class: 'watch-title' }, 'Activity'),
      el('button', {
        type: 'button', title: 'Open in its own tab',
        on: { click: () => { const s = state.voice.gameSession; if (s) window.open(s.url, '_blank', 'noopener'); } },
      }, icon('maximize', 15)),
      el('button', {
        type: 'button', title: 'End the game (for everyone)',
        on: { click: () => state.socket.emit('game:stop') },
      }, icon('x', 16)),
    ]),
    el('div', { class: 'watch-body' }, _gameFrame),
  ]);
  document.body.append(_gameOverlay);
  const track = () => {
    if (!_gameOverlay) return;
    const slot = document.querySelector('#callStage .game-slot') || document.querySelector('#voiceBar .game-slot');
    if (!slot) {
      _gameOverlay.classList.add('watch-hidden');
    } else {
      const r = slot.getBoundingClientRect();
      _gameOverlay.classList.remove('watch-hidden');
      const st = _gameOverlay.style;
      st.left = r.left + 'px'; st.top = r.top + 'px';
      st.width = r.width + 'px'; st.height = r.height + 'px';
    }
    _gamePosRaf = requestAnimationFrame(track);
  };
  _gamePosRaf = requestAnimationFrame(track);
}

function teardownGame() {
  state.voice.gameSession = null;
  if (_gamePosRaf) { cancelAnimationFrame(_gamePosRaf); _gamePosRaf = null; }
  if (_gameOverlay) { _gameOverlay.remove(); _gameOverlay = null; }
  _gameFrame = null;
}

function openWatchSearch() {
  if (state.voice.channelId == null) { alert(t('watch.joinFirst')); return; }
  if (state.voice.ytmusicSession) { alert(t('act.endMusicFirst')); return; }
  const input = el('input', { placeholder: t('watch.searchPlaceholder'), autocomplete: 'off' });
  const list = el('div', { class: 'watch-results' });
  let closeFn = null;
  let seq = 0;
  async function run(q) {
    const my = ++seq;
    list.innerHTML = '';
    if (!q) { list.append(el('p', { class: 'muted-text', style: 'margin:6px 2px' }, t('watch.typeToSearch'))); return; }
    list.append(el('p', { class: 'muted-text', style: 'margin:6px 2px' }, t('watch.searching')));
    // Pasted YouTube link → offer it directly (works even if search is down).
    const pasted = youtubeIds(q);
    try {
      const r = await api('/api/youtube/search?q=' + encodeURIComponent(q));
      if (my !== seq) return;
      list.innerHTML = '';
      for (const id of pasted) renderWatchResult(list, { videoId: id, title: t('watch.pastedLink'), author: '' }, closeFn);
      const results = (r.results || []).filter(v => !pasted.includes(v.videoId));
      if (!results.length && !pasted.length) list.append(el('p', { class: 'muted-text' }, t('watch.noResults')));
      for (const v of results) renderWatchResult(list, v, closeFn);
    } catch (e) {
      if (my !== seq) return;
      list.innerHTML = '';
      for (const id of pasted) renderWatchResult(list, { videoId: id, title: t('watch.pastedLink'), author: '' }, closeFn);
      if (!pasted.length) list.append(el('p', { class: 'error' }, t('watch.searchFailed', { error: e.message })));
    }
  }
  let deb = null;
  input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => run(input.value.trim()), 450); });
  closeFn = modal({
    title: t('watch.title'),
    wide: true,
    content: el('div', {}, [
      input,
      el('p', { class: 'muted-text', style: 'margin:8px 2px 0;font-size:12px' }, t('watch.sharedHint')),
      list,
    ]),
    submitLabel: t('watch.search'),
    onSubmit: () => { run(input.value.trim()); return false; },
  });
  run('');
}

function renderWatchResult(list, v, closeFn) {
  list.append(el('div', { class: 'watch-result', on: { click: () => {
    state.socket.emit('watch:set', { videoId: v.videoId, title: v.title, author: v.author });
    closeFn && closeFn();
  } } }, [
    el('div', { class: 'watch-thumb' }, [
      el('img', { src: 'https://i.ytimg.com/vi/' + v.videoId + '/mqdefault.jpg', loading: 'lazy', alt: '' }),
      v.duration ? el('span', { class: 'watch-dur' }, v.duration) : null,
    ]),
    el('div', { class: 'watch-meta' }, [
      el('div', { class: 'watch-rtitle' }, v.title || v.videoId),
      el('div', { class: 'watch-rsub' }, [v.author, v.views].filter(Boolean).join(' · ')),
    ]),
  ]));
}
