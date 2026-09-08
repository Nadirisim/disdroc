/* ─── Guided product tour ────────────────────────────────────────────────────
 * An animated spotlight walkthrough that sits on top of the real app chrome —
 * not a separate mock screenshot flow. Each step measures a real element's
 * getBoundingClientRect() live (tracked every frame via rAF so it stays glued
 * to the target through resize/scroll/layout animation) and dims everything
 * else via a single oversized box-shadow on a small "spot" div (the standard
 * cutout trick — no SVG mask needed).
 *
 * Loaded after app.js (see public/app.html), so it freely uses app.js's
 * globals: state, el, t, $, isMobileLayout, closeFloatingMenus, closeModalRoot,
 * animateOut, switchToHome, switchToFriends, isBrandNewAccount,
 * NEW_ACCOUNT_SESSION_MS. These are plain top-level declarations in a classic
 * (non-module) script, so they live in the shared global scope across every
 * <script> tag on the page — same pattern voicefx.js/spatial.js already rely on.
 *
 * Reuses onboardingSteps()'s five checklist items (key/label) as the tour's
 * step order, but adds a longer body sentence per step and a live DOM target
 * resolver instead of a "does" boolean + click action.
 */

let tourState = null;

// Picks the first selector in the list whose element is actually on-screen
// right now (real getBoundingClientRect check, not just DOM presence) — the
// same node can be hidden behind a mobile/desktop breakpoint swap (e.g. the
// desktop "Add Friend" tab vs. the mobile "+" button), so callers list both
// and let layout decide which one is real at call time.
function tourFirstVisible(selectors) {
  for (const sel of selectors) {
    const node = document.querySelector(sel);
    if (node && tourIsVisible(node)) return node;
  }
  return null;
}
function tourIsVisible(node) {
  const r = node.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(node);
  if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
  return true;
}

// The DM entry for Disdroc AI lives at a chat id we only know at runtime.
function tourAiDmTarget() {
  const dm = state.chats && state.chats.find((c) => c.type === 'dm' && c.other && c.other.id === state.botUserId);
  if (!dm) return null;
  return document.querySelector('#sidebarContent [data-chat-id="' + dm.id + '"]');
}

// Root screen = rail + sidebar visible (mobile pushes a full-screen "tab
// screen" or open conversation over them otherwise; see style.css's mobile
// "three-screen stack" rules around .app.tab-screen / .app.chat-open).
function tourEnsureRootOnMobile() {
  if (!isMobileLayout()) return;
  const app = document.getElementById('app');
  if (app.classList.contains('chat-open') || app.classList.contains('tab-screen')) switchToHome();
}
function tourEnsureFriendsScreen() { switchToFriends(); }
function tourEnsureHomeSidebar() {
  if (state.view === 'server') switchToHome();
  tourEnsureRootOnMobile();
}

function tourSteps() {
  return [
    {
      key: 'profile',
      title: t('onboarding.step.profile'),
      body: t('tour.body.profile'),
      ensureView: tourEnsureRootOnMobile,
      // Desktop: the whole bottom-left user box (avatar/name/settings icon).
      // Mobile: that box is hidden entirely (.user-panel{display:none} under
      // 800px) in favour of the bottom "You" tab — spotlight that instead.
      getTarget: () => tourFirstVisible(['#userPanel', '[data-mobile-tab="you"]']),
    },
    {
      key: 'server',
      title: t('onboarding.step.server'),
      body: t('tour.body.server'),
      ensureView: tourEnsureRootOnMobile,
      getTarget: () => tourFirstVisible(['#newServerBtn']),
    },
    {
      key: 'friend',
      title: t('onboarding.step.friend'),
      body: t('tour.body.friend'),
      ensureView: tourEnsureFriendsScreen,
      getTarget: () => tourFirstVisible(['.mobile-add-friend', '.friends-tabs .add-friend']),
    },
    {
      key: 'message',
      title: t('onboarding.step.message'),
      body: t('tour.body.message'),
      ensureView: tourEnsureHomeSidebar,
      getTarget: tourAiDmTarget,
    },
    {
      key: 'ai',
      title: t('onboarding.step.ai'),
      body: t('tour.body.ai'),
      ensureView: tourEnsureHomeSidebar,
      getTarget: tourAiDmTarget,
    },
  ];
}

function tourNextFrame() { return new Promise((r) => requestAnimationFrame(r)); }
function tourWait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startTour() {
  if (tourState && tourState.active) return;
  closeFloatingMenus();
  closeModalRoot();
  const steps = tourSteps();
  if (!steps.length) return;
  const root = el('div', { class: 'tour-overlay', role: 'dialog', 'aria-live': 'polite', 'aria-label': t('tour.cta') });
  const block = el('div', { class: 'tour-block' });
  const spot = el('div', { class: 'tour-spot' });
  const tip = el('div', { class: 'tour-tip' });
  root.append(block, spot, tip);
  document.body.append(root);
  tourState = { active: true, index: 0, steps, dom: { root, block, spot, tip }, raf: null, currentTarget: null };
  document.addEventListener('keydown', tourKeydown);
  goToTourStep(0);
}

function tourKeydown(e) {
  if (!tourState || !tourState.active) return;
  if (e.key === 'Escape') { e.preventDefault(); endTour(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); tourNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tourBack(); }
}

async function goToTourStep(i) {
  const st = tourState;
  if (!st) return;
  if (i < 0) return;
  if (i >= st.steps.length) { endTour(); return; }
  st.index = i;
  const step = st.steps[i];
  try { step.ensureView && step.ensureView(); } catch {}
  // Give the view-switch re-render (and any of its CSS transitions starting)
  // a couple of frames before measuring, so we don't grab a mid-layout rect.
  await tourNextFrame(); await tourNextFrame();
  let target = null;
  try { target = step.getTarget(); } catch {}
  if (!target) { await tourWait(150); try { target = step.getTarget(); } catch {} }
  if (!st.active) return; // tour was closed while we were waiting
  if (!target) {
    // Nothing real to point at (e.g. AI DM missing) — skip rather than fake
    // a floating tooltip with no highlight.
    if (i + 1 < st.steps.length) { goToTourStep(i + 1); return; }
    endTour();
    return;
  }
  st.currentTarget = target;
  renderTourStep();
  startTourTracking();
}

function startTourTracking() {
  const st = tourState;
  if (!st) return;
  if (st.raf) cancelAnimationFrame(st.raf);
  const tick = () => {
    if (!tourState || !tourState.active) return;
    positionTourSpot();
    tourState.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}

function positionTourSpot() {
  const st = tourState;
  if (!st || !st.dom) return;
  if (!st.currentTarget || !st.currentTarget.isConnected) {
    const step = st.steps[st.index];
    const fresh = step.getTarget && step.getTarget();
    if (fresh) st.currentTarget = fresh; else return;
  }
  const pad = 8;
  const r = st.currentTarget.getBoundingClientRect();
  const { spot, tip } = st.dom;
  spot.style.top = (r.top - pad) + 'px';
  spot.style.left = (r.left - pad) + 'px';
  spot.style.width = (r.width + pad * 2) + 'px';
  spot.style.height = (r.height + pad * 2) + 'px';
  positionTourTip(r);
}

function positionTourTip(targetRect) {
  const { tip } = tourState.dom;
  const gap = 18;
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = tip.offsetWidth || 300, th = tip.offsetHeight || 150;
  const space = {
    right: vw - targetRect.right,
    bottom: vh - targetRect.bottom,
    left: targetRect.left,
    top: targetRect.top,
  };
  let side = 'right', best = space.right;
  if (space.bottom > best) { side = 'bottom'; best = space.bottom; }
  if (space.left > best) { side = 'left'; best = space.left; }
  if (space.top > best) { side = 'top'; best = space.top; }
  let top, left;
  if (side === 'right') { top = targetRect.top + targetRect.height / 2 - th / 2; left = targetRect.right + gap; }
  else if (side === 'left') { top = targetRect.top + targetRect.height / 2 - th / 2; left = targetRect.left - gap - tw; }
  else if (side === 'bottom') { top = targetRect.bottom + gap; left = targetRect.left + targetRect.width / 2 - tw / 2; }
  else { top = targetRect.top - gap - th; left = targetRect.left + targetRect.width / 2 - tw / 2; }
  const margin = 12;
  left = Math.max(margin, Math.min(left, vw - tw - margin));
  top = Math.max(margin, Math.min(top, vh - th - margin));
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}

function renderTourStep() {
  const st = tourState;
  const step = st.steps[st.index];
  const { tip } = st.dom;
  tip.innerHTML = '';
  const isLast = st.index === st.steps.length - 1;
  const isFirst = st.index === 0;
  tip.append(
    el('div', { class: 'tour-tip-head' }, [
      el('span', { class: 'tour-tip-step' }, t('tour.stepOf', { cur: st.index + 1, total: st.steps.length })),
      el('button', { type: 'button', class: 'tour-tip-close', title: t('tour.skip'), on: { click: () => endTour() } }, '✕'),
    ]),
    el('div', { class: 'tour-tip-title' }, step.title),
    el('p', { class: 'tour-tip-body' }, step.body),
    el('div', { class: 'tour-tip-actions' }, [
      el('div', { class: 'tour-dots' }, st.steps.map((_, i) => el('span', { class: 'tour-dot' + (i === st.index ? ' active' : '') }))),
      el('div', { class: 'tour-tip-buttons' }, [
        !isFirst ? el('button', { type: 'button', class: 'ghost', on: { click: () => tourBack() } }, t('tour.back')) : null,
        el('button', { type: 'button', on: { click: () => (isLast ? endTour() : tourNext()) } }, isLast ? t('tour.done') : t('tour.next')),
      ]),
    ]),
  );
  // Reposition once immediately (before the next rAF tick paints) now that the
  // tooltip has real dimensions from the content we just inserted.
  requestAnimationFrame(() => positionTourSpot());
}

function tourNext() { if (tourState) goToTourStep(tourState.index + 1); }
function tourBack() { if (tourState) goToTourStep(tourState.index - 1); }

function endTour() {
  const st = tourState;
  if (!st) return;
  st.active = false;
  if (st.raf) cancelAnimationFrame(st.raf);
  document.removeEventListener('keydown', tourKeydown);
  if (st.dom && st.dom.root) animateOut(st.dom.root, 180);
  tourState = null;
}

// Fires once per browser (localStorage, matching the existing disdroc_tried_ai
// / disdroc_last_seen_version convention of not scoping onboarding nudges per
// account) the first time a genuinely brand-new account boots the app. Reuses
// the same 7-day "brand new" window as the checklist card for the dismissed/
// account-age gate, but additionally requires the *first-ever session* window
// (NEW_ACCOUNT_SESSION_MS, ~30 min — the same constant the privacy-consent and
// event-popup gates already use for "this is their very first login") so it
// only auto-fires once, right at signup, rather than on every visit during the
// 7-day grace period. After that first session the checklist card's "Take the
// tour" button is the way back in.
const TOUR_AUTOSTART_KEY = 'disdroc_tour_autostarted';
function maybeAutoStartTour() {
  if (!state.me || state.me.onboarding_dismissed_at) return;
  if (!isBrandNewAccount(NEW_ACCOUNT_SESSION_MS)) return;
  if (localStorage.getItem(TOUR_AUTOSTART_KEY) === '1') return;
  localStorage.setItem(TOUR_AUTOSTART_KEY, '1');
  setTimeout(() => {
    if (!state.me || state.me.onboarding_dismissed_at) return;
    if (document.querySelector('#modalRoot .modal-bg, .lightbox')) return; // don't stack on another first-run popup
    startTour();
  }, 900);
}
