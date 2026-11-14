/*
 * Codelingo client app. Call mount(rootElement, { apiUrl }) to render it;
 * the returned function unmounts it and removes every listener it added.
 *
 * Offline-first:
 *  - Students download courses while online; full course content is kept in IndexedDB
 *    (offline.js) and opened from there, so lessons work with no connection.
 *  - The app itself is cached by a service worker (public/sw.js), so it loads offline.
 *  - Progress is saved on the device immediately and queued; it syncs to the server
 *    (which merges devices) as soon as the connection returns.
 */
import { createApi } from './api';
import { createEditor, createRunners, consoleView, tabs } from './code';
import {
  downloads, meta, storageEstimate, requestPersistence, registerServiceWorker,
  appOfflineStatus, installState, promptInstall,
} from './offline';
import { BADGES, XP_PER_MINUTE, computeStats, qualifiedBadges, awardBadges, learningHistory, keyOf } from './gamify';
import { renderAdminList, renderEditor } from './admin';
import {
  $, $$, esc, debounce, localISO, md, toast, fmtBytes, fmtMinutes, timeAgo, thumbHTML,
  SUBJECTS, DIFFICULTIES, ITEM_TYPES,
} from './util';

export const THEME_KEY = 'codesprout-theme';
const SESSION_KEY = 'codesprout-session';
const PASS_PERCENT = 70;
const SYNC_DELAY = 1500;
const RETRY_EVERY = 30_000;

export function mount(root, { apiUrl }) {
  const cleanups = [];
  let disposed = false;
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };
  const runners = createRunners();
  cleanups.push(runners.dispose);

  const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  /* ================= Session ================= */
  let session = (() => {
    const s = readJSON(SESSION_KEY);
    return s && typeof s.token === 'string' && s.user?.username ? s : null;
  })();
  const api = createApi(apiUrl, () => session?.token);
  const isAdmin = () => session?.user.role === 'admin' || session?.user.role === 'superuser';
  const firstName = () => (session?.user.display_name || '').split(/\s+/)[0] || session?.user.username;

  function setSession(s) {
    session = s;
    if (s) writeJSON(SESSION_KEY, s);
    else try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  /* ================= Per-learner state (saved on this device) ================= */
  const emptyProgress = () => ({ done: {}, code: {}, quiz: {}, days: [], badges: {}, last: null, play: {} });
  let store = emptyProgress();
  let syncState = { pending: 0, lastSync: null };
  const userKey = (name) => `codesprout-${name}:${session.user.username.toLowerCase()}`;

  function loadLearner() {
    store = Object.assign(emptyProgress(), readJSON(userKey('progress')) || {});
    syncState = Object.assign({ pending: 0, lastSync: null }, readJSON(userKey('sync')) || {});
  }
  function persistLearner() {
    if (!session) return;
    writeJSON(userKey('progress'), store);
    writeJSON(userKey('sync'), syncState);
  }

  /** Same rules as the server's merge: nothing completed on any device is ever lost. */
  function mergeRemote(remote) {
    if (!remote) return;
    for (const [k, at] of Object.entries(remote.done || {})) {
      const mine = store.done[k];
      if (!mine || mine === true || (typeof at === 'string' && at < mine)) store.done[k] = at;
    }
    for (const [k, r] of Object.entries(remote.quiz || {})) {
      const mine = store.quiz[k];
      store.quiz[k] = !mine || r.at > mine.at ? { ...r, best: Math.max(r.best, mine?.best || 0) } : { ...mine, best: Math.max(r.best, mine.best) };
    }
    for (const [k, at] of Object.entries(remote.badges || {})) if (!store.badges[k] || at < store.badges[k]) store.badges[k] = at;
    store.days = [...new Set([...(remote.days || []), ...store.days])].sort();
    store.code = { ...(remote.code || {}), ...store.code };
    const play = { ...(remote.play || {}), ...store.play };
    for (const [k, v] of Object.entries(remote.play || {})) {
      // Arcade saves: keep whichever device saved most recently.
      if (k.startsWith('game:') && saveTime(v) > saveTime(store.play[k])) play[k] = v;
    }
    store.play = play;
    store.last = store.last || remote.last || null;
  }

  /* ================= Connectivity & sync queue ================= */
  let online = navigator.onLine;
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;

  function setOnline(value) {
    if (online === value) return;
    online = value;
    renderSyncPill();
    if (value) { syncNow(); refreshCatalog(); }
    refreshView();
  }

  /** Record a local change: saved on the device now, queued for the server. */
  function saveProgress() {
    syncState.pending++;
    persistLearner();
    renderSyncPill();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, SYNC_DELAY);
  }

  async function syncNow({ keepalive = false } = {}) {
    clearTimeout(syncTimer);
    syncTimer = null;
    if (!session) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    renderSyncPill();
    const sent = syncState.pending;
    // Browsers cap keepalive requests at 64 KB; larger saves go as normal requests.
    const small = keepalive && JSON.stringify(store).length < 60_000;
    try {
      const merged = await api.syncProgress(store, { keepalive: small });
      if (disposed || !session) return;
      const before = JSON.stringify(store);
      mergeRemote(merged); // picks up what other devices synced
      if (JSON.stringify(store) !== before) { checkBadges(); refreshView(); }
      syncState.pending = Math.max(0, syncState.pending - sent);
      syncState.lastSync = new Date().toISOString();
      persistLearner();
      online = true;
    } catch (err) {
      if (disposed) return;
      if (err.status === 401) { syncing = false; return sessionExpired(); }
      if (err.offline) online = false;
    } finally {
      syncing = false;
      if (!disposed && session) {
        renderSyncPill();
        if (syncAgain) { syncAgain = false; syncNow(); }
        if (current?.name === 'offline') refreshView();
      }
    }
  }

  function syncLabel() {
    if (syncing) return { state: 'syncing', text: 'Syncing…', icon: '⟳' };
    if (!online) return { state: 'offline', text: syncState.pending ? `Offline · ${syncState.pending} queued` : 'Offline', icon: '⚠' };
    if (syncState.pending) return { state: 'queued', text: `Queued · ${syncState.pending}`, icon: '⏳' };
    return { state: 'online', text: 'Online', icon: '●' };
  }

  function renderSyncPill() {
    const el = $('#sync-pill', root);
    if (!el) return;
    const s = syncLabel();
    el.dataset.state = s.state;
    el.innerHTML = `<span aria-hidden="true">${s.icon}</span> <span class="sync-text">${esc(s.text)}</span>`;
    el.title = s.state === 'online' ? 'All progress synced' : s.text;
  }

  /* ================= Catalog & downloads ================= */
  let catalog = [];            // published course summaries (cached for offline)
  let catalogLoaded = false;   // fetched from the server at least once this visit
  const downloaded = new Map();  // id -> { id, version, bytes, downloadedAt, course }
  const memoryCourses = new Map(); // full courses opened online but not downloaded
  const busyDownloads = new Set();

  const summaryOf = (course) => ({
    id: course.id, version: course.version, title: course.title, description: course.description,
    subject: course.subject, difficulty: course.difficulty, icon: course.icon, thumbnail: course.thumbnail,
    items: course.items.map(({ id, type, title, minutes }) => ({ id, type, title, minutes })),
    minutes: course.items.reduce((s, i) => s + i.minutes, 0),
  });

  /** Every course this learner can see: the catalog plus downloads no longer (or not yet) in it. */
  function allCourses() {
    const ids = new Set(catalog.map((c) => c.id));
    const extra = [...downloaded.values()].filter((r) => !ids.has(r.id) && !catalogLoaded).map((r) => summaryOf(r.course));
    return [...catalog, ...extra];
  }
  const findCourse = (id) => allCourses().find((c) => c.id === id);

  async function refreshCatalog() {
    if (!session) return;
    try {
      const list = await api.getCourses();
      if (disposed) return;
      catalog = list;
      catalogLoaded = true;
      online = true;
      renderSyncPill();
      meta.set('catalog', list).catch(() => {});
      checkBadges();
      refreshView();
    } catch (err) {
      if (disposed) return;
      if (err.status === 401) return sessionExpired();
      if (err.offline) { online = false; renderSyncPill(); refreshView(); }
    }
  }

  async function getFullCourse(id) {
    const rec = downloaded.get(id);
    if (rec) return rec.course;
    if (memoryCourses.has(id)) return memoryCourses.get(id);
    const course = await api.getCourse(id);
    memoryCourses.set(id, course);
    return course;
  }

  async function downloadCourse(id) {
    if (busyDownloads.has(id)) return;
    busyDownloads.add(id);
    refreshView();
    try {
      const course = await api.getCourse(id);
      const rec = await downloads.save(course);
      downloaded.set(id, rec);
      memoryCourses.delete(id);
      requestPersistence();
      toast(`✓ "${course.title}" is ready to use offline`);
    } catch (err) {
      if (err?.offline) { setOnline(false); toast("You're offline. Connect to the internet to download courses."); }
      else if (err?.status === 404) toast('This course is no longer available.');
      else if (err?.name === 'QuotaExceededError') toast('Not enough storage space. Delete a downloaded course and try again.');
      else toast(`Download failed: ${err?.message || err}`);
    } finally {
      busyDownloads.delete(id);
      refreshView();
    }
  }

  async function removeDownload(id) {
    const rec = downloaded.get(id);
    if (!rec || !confirm(`Remove the offline copy of "${rec.course.title}"? Your progress is kept.`)) return;
    await downloads.remove(id).catch(() => {});
    downloaded.delete(id);
    toast('Offline copy removed');
    refreshView();
  }

  function downloadState(c) {
    const rec = downloaded.get(c.id);
    if (busyDownloads.has(c.id)) return 'busy';
    if (!rec) return 'none';
    const live = catalog.find((x) => x.id === c.id);
    if (catalogLoaded && !live) return 'retired';
    return live && live.version > rec.version ? 'update' : 'ready';
  }

  function offlineBadge(c) {
    const s = downloadState(c);
    if (s === 'ready') return '<span class="tag tag-offline">✓ Available offline</span>';
    if (s === 'update') return '<span class="tag tag-update">⟳ Update available</span>';
    if (s === 'retired') return '<span class="tag tag-update">No longer published</span>';
    if (s === 'busy') return '<span class="tag">Downloading…</span>';
    return '<span class="tag tag-muted">Online only</span>';
  }

  function downloadButton(c, { small = true } = {}) {
    const sm = small ? ' btn-sm' : '';
    const s = downloadState(c);
    if (s === 'busy') return `<button class="btn${sm}" type="button" disabled>Downloading…</button>`;
    if (s === 'update') return `<button class="btn btn-warn${sm}" type="button" data-download="${esc(c.id)}" ${online ? '' : 'disabled'}>⟳ Update</button>`;
    if (s === 'ready' || s === 'retired') return `<button class="btn btn-ghost${sm}" type="button" data-remove-download="${esc(c.id)}" title="Remove offline copy">✓ Downloaded</button>`;
    return `<button class="btn${sm}" type="button" data-download="${esc(c.id)}" ${online ? '' : 'disabled title="Connect to download"'}>⬇ Download</button>`;
  }

  const canOpen = (c) => online || downloaded.has(c.id) || memoryCourses.has(c.id);

  /* ================= Progress helpers ================= */
  const stats = () => computeStats(store, allCourses());

  function nextItem(course) {
    return course.items.find((i) => !store.done[keyOf(course.id, i.id)]) || null;
  }

  function continueTarget() {
    const courses = allCourses();
    if (store.last) {
      const [cid, iid] = store.last.split('/');
      const c = courses.find((x) => x.id === cid);
      const idx = c ? c.items.findIndex((i) => i.id === iid) : -1;
      if (idx >= 0) {
        const item = store.done[store.last] ? (c.items.slice(idx + 1).find((i) => !store.done[keyOf(c.id, i.id)]) || nextItem(c)) : c.items[idx];
        if (item) return { course: c, item };
      }
    }
    for (const c of courses) {
      const item = nextItem(c);
      if (item && Object.keys(store.done).some((k) => k.startsWith(c.id + '/'))) return { course: c, item };
    }
    return null;
  }

  function checkBadges() {
    if (!session) return [];
    const earned = awardBadges(store, stats());
    if (earned.length) saveProgress();
    return earned;
  }

  function markComplete(course, item) {
    const key = keyOf(course.id, item.id);
    const first = !store.done[key];
    if (first) {
      store.done[key] = new Date().toISOString();
      const today = localISO(new Date());
      if (!store.days.includes(today)) store.days.push(today);
      toast(`🎉 ${ITEM_TYPES[item.type].label} complete! +${item.minutes * XP_PER_MINUTE} XP`);
      const st = stats().perCourse.get(course.id);
      if (st && st.done === st.total) setTimeout(() => toast(`🏆 You finished "${course.title}"!`), 500);
    }
    const earned = awardBadges(store, stats());
    earned.forEach((b, n) => setTimeout(() => toast(`🏅 Badge earned: ${b.name}`, { kind: 'toast-badge' }), 900 + n * 700));
    if (first || earned.length) saveProgress(); // re-passing a finished lesson changes nothing
    return first;
  }

  /* ================= Shell & router ================= */
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/"><img class="brand-logo" src="/logo-96.png" alt="" width="40" height="40"><span>Codelingo</span></a>
      <nav class="nav" id="nav" aria-label="Main"></nav>
      <div class="top-actions" id="top-actions"></div>
    </header>
    <main id="app" tabindex="-1"></main>`;
  const app = $('#app', root);

  function renderHeader() {
    const nav = $('#nav', root);
    const actions = $('#top-actions', root);
    const theme = '<button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>';
    if (!session) {
      nav.innerHTML = '';
      actions.innerHTML = `<button class="btn btn-sm btn-install" id="install-btn" type="button" hidden>⬇ Install app</button><a class="nav-plain" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/signup">Sign up</a>${theme}`;
    } else {
      const link = (nav, href, icon, label) => `<a href="${href}" data-nav="${nav}"><span class="nav-ico" aria-hidden="true">${icon}</span><span>${label}</span></a>`;
      nav.innerHTML = [
        link('home', '#/', '📚', 'Courses'),
        link('offline', '#/offline', '📥', 'Offline'),
        link('leaderboard', '#/leaderboard', '🏆', 'Rankings'),
        link('playground', '#/playground', '🧪', 'Playground'),
        link('arcade', '#/arcade', '🎮', 'Arcade'),
        isAdmin() ? link('admin', '#/admin', '🛠️', 'Manage') : '',
      ].join('');
      const initials = (session.user.display_name || session.user.username).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      actions.innerHTML = `
        <button class="btn btn-sm btn-install" id="install-btn" type="button" hidden>⬇ Install app</button>
        <a class="sync-pill" id="sync-pill" href="#/offline" aria-live="polite"></a>
        <a class="avatar-link" href="#/profile" data-nav="profile" title="Your profile" aria-label="Your profile"><span class="avatar">${esc(initials)}</span></a>
        ${theme}`;
      renderSyncPill();
    }
    $('#theme-toggle', root).addEventListener('click', toggleTheme);
    $('#install-btn', root).addEventListener('click', installApp);
    renderInstallButton();
    markNav();
  }

  /* ================= Install (Progressive Web App) ================= */
  function renderInstallButton() {
    const btn = $('#install-btn', root);
    if (btn) btn.hidden = installState() !== 'available';
  }

  async function installApp() {
    if (installState() !== 'available') { location.hash = '#/offline'; return; }
    const accepted = await promptInstall();
    renderInstallButton();
    if (accepted) toast('🎉 Codelingo is installed. Open it from your home screen or apps, even offline.');
    refreshView();
  }

  /** Install instructions for the current browser (used on the landing page and Offline Center). */
  function installHelpHTML() {
    const state = installState();
    if (state === 'installed') return '<p class="install-ok">✓ Installed. You\'re using the Codelingo app.</p>';
    if (state === 'available') return '<button class="btn btn-primary" type="button" data-install>⬇ Install Codelingo</button>';
    if (state === 'ios') return '<p class="small">On iPhone or iPad: tap <b>Share</b> <span aria-hidden="true">⎋</span> then <b>Add to Home Screen</b>.</p>';
    return '<p class="small">In Chrome or Edge, open the browser menu (⋮ or …) and choose <b>Install Codelingo</b> or <b>Add to Home screen</b>. Safari on Mac: <b>File → Add to Dock</b>.</p>';
  }

  function markNav() {
    const name = current?.nav;
    $$('[data-nav]', root).forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  }

  function toggleTheme() {
    const html = document.documentElement;
    const cur = html.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }

  let current = null;    // { name, nav, params }
  let generation = 0;    // bumps on every navigation, so late async renders can bail out
  let teardown = () => {};
  let leaveGuard = null; // () => true when the page has unsaved changes
  let currentHash = location.hash;

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [a, b, c] = parts;
    if (!session) {
      if (a === 'login' || a === 'signup') return { name: a, nav: a, params: {} };
      return { name: 'landing', nav: '', params: {} };
    }
    if (a === 'course' && b) return { name: 'course', nav: 'home', params: { id: b } };
    if (a === 'learn' && b) return { name: 'learn', nav: 'home', params: { courseId: b, itemId: c } };
    if (a === 'offline') return { name: 'offline', nav: 'offline', params: {} };
    if (a === 'profile') return { name: 'profile', nav: 'profile', params: {} };
    if (a === 'leaderboard') return { name: 'leaderboard', nav: 'leaderboard', params: {} };
    if (a === 'playground') return { name: 'playground', nav: 'playground', params: {} };
    if (a === 'arcade') return GAMES[b] ? { name: 'game', nav: 'arcade', params: { id: b } } : { name: 'arcade', nav: 'arcade', params: {} };
    if (a === 'admin' && isAdmin()) {
      if (b === 'new') return { name: 'admin-edit', nav: 'admin', params: { id: null } };
      if (b === 'edit' && c) return { name: 'admin-edit', nav: 'admin', params: { id: c } };
      return { name: 'admin', nav: 'admin', params: {} };
    }
    return { name: 'home', nav: 'home', params: {} };
  }

  function route({ keepScroll = false } = {}) {
    teardown();
    teardown = () => {};
    leaveGuard = null;
    currentHash = location.hash;
    generation++;
    current = parseRoute();
    markNav();
    const p = current.params;
    switch (current.name) {
      case 'landing': renderLanding(); break;
      case 'login': case 'signup': renderAuth(current.name); break;
      case 'course': renderCourse(p.id); break;
      case 'learn': renderPlayer(p.courseId, p.itemId); break;
      case 'offline': renderOffline(); break;
      case 'profile': renderProfile(); break;
      case 'leaderboard': renderLeaderboard(); break;
      case 'playground': renderPlayground(); break;
      case 'arcade': renderArcade(); break;
      case 'game': renderGame(p.id); break;
      case 'admin': renderAdminList(adminCtx()); break;
      case 'admin-edit': renderEditor(adminCtx(), p.id); break;
      default: renderHome();
    }
    if (!keepScroll) window.scrollTo(0, 0);
  }

  /** Re-render passive pages after data changes, keeping the scroll position. */
  function refreshView() {
    if (disposed || !current) return;
    if (['home', 'course', 'offline', 'profile', 'arcade', 'landing'].includes(current.name)) {
      const y = window.scrollY;
      route({ keepScroll: true });
      window.scrollTo(0, y);
    }
  }

  on(window, 'hashchange', () => {
    if (leaveGuard?.() && !confirm('You have unsaved changes. Leave without saving?')) {
      history.replaceState(null, '', currentHash || '#/');
      return;
    }
    route();
  });
  on(window, 'beforeunload', (e) => { if (leaveGuard?.()) e.preventDefault(); });

  function adminCtx() {
    const gen = generation;
    return {
      app, api, toast, runners,
      setLeaveGuard: (fn) => { leaveGuard = fn; },
      onCatalogChanged: () => { memoryCourses.clear(); refreshCatalog(); },
      isStale: () => gen !== generation || disposed,
      rememberHash: () => { currentHash = location.hash; },
    };
  }

  // Delegated buttons that appear on several pages.
  on(app, 'click', (e) => {
    const dl = e.target.closest('[data-download]');
    if (dl) { e.preventDefault(); downloadCourse(dl.dataset.download); return; }
    const rm = e.target.closest('[data-remove-download]');
    if (rm) { e.preventDefault(); removeDownload(rm.dataset.removeDownload); }
  });

  const loading = (msg) => { app.innerHTML = `<div class="state"><div class="spinner" aria-hidden="true"></div><p>${esc(msg)}</p></div>`; };

  /* ================= Landing (logged out) ================= */
  function renderLanding() {
    document.title = 'Codelingo: learn anywhere, even offline';
    app.innerHTML = `
      <div class="home">
        <section class="hero">
          <h1>Learn anywhere. <em>Even offline.</em></h1>
          <p>Download courses in coding, math and science while you're connected, keep learning with no internet, and your progress syncs automatically when you're back online.</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/signup">Create a free account</a>
            <a class="btn btn-lg" href="#/login">Log in</a>
          </div>
          <div class="hero-install">${installHelpHTML()}</div>
        </section>
        <section class="steps">
          <div class="step"><div class="num">⬇</div><b>Install & download</b><span>Install Codelingo like an app and save whole courses while you have internet.</span></div>
          <div class="step"><div class="num">📴</div><b>Learn offline</b><span>Lessons, quizzes, activities and coding games all work with no connection.</span></div>
          <div class="step"><div class="num">🔄</div><b>Sync automatically</b><span>Progress is saved on your device and syncs when you reconnect.</span></div>
          <div class="step"><div class="num">🎮</div><b>Play to learn</b><span>Explore Code Dungeon and grow Pixel Farm by writing real code.</span></div>
        </section>
      </div>`;
    $('[data-install]', app)?.addEventListener('click', installApp);
  }

  /* ================= Sign up / log in ================= */
  const ROLE_TITLES = ['Student', 'Teacher', 'Ed Farm Contributor', 'School Administrator', 'Community Partner', 'Volunteer Mentor'];

  function renderAuth(mode) {
    const signup = mode === 'signup';
    document.title = `${signup ? 'Create an account' : 'Log in'} · Codelingo`;
    app.innerHTML = `
      <div class="auth">
        <form class="auth-card" id="auth-form" novalidate>
          <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
          <p class="auth-sub">${signup ? 'Save your progress and pick up where you left off on any device.' : 'Log in to continue learning.'}</p>
          ${signup ? `
          <label for="auth-name">Your name</label>
          <input id="auth-name" name="display_name" autocomplete="name" maxlength="60" required>
          <label for="auth-role">I am a…</label>
          <select id="auth-role" name="title">${ROLE_TITLES.map((t) => `<option>${t}</option>`).join('')}</select>` : ''}
          <label for="auth-user">Username</label>
          <input id="auth-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="32">
          ${signup ? '<small>3–32 characters: letters, numbers, <code>_</code> <code>.</code> <code>-</code></small>' : ''}
          <label for="auth-pass">Password</label>
          <input id="auth-pass" name="password" type="password" required maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}">
          ${signup ? '<small>At least 8 characters</small>' : ''}
          <p class="auth-error" id="auth-error" role="alert"></p>
          <button class="btn btn-primary btn-lg" id="auth-submit" type="submit">${signup ? 'Create account' : 'Log in'}</button>
          <p class="auth-switch">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Create an account</a>'}</p>
        </form>
      </div>`;

    const form = $('#auth-form');
    const errorEl = $('#auth-error');
    const submit = $('#auth-submit');
    (signup ? $('#auth-name') : $('#auth-user')).focus();
    const roleSelect = $('#auth-role'); // not form.title: that is the form's own title attribute

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = form.username.value.trim();
      const password = form.password.value;
      errorEl.textContent = '';
      if (signup) {
        if (!form.display_name.value.trim()) { errorEl.textContent = 'Enter your name'; return; }
        if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) { errorEl.textContent = 'Username must be 3–32 letters, numbers, _ . or -'; return; }
        if (password.length < 8) { errorEl.textContent = 'Password must be at least 8 characters'; return; }
      } else if (!username || !password) {
        errorEl.textContent = 'Enter your username and password'; return;
      }
      submit.disabled = true;
      submit.textContent = signup ? 'Creating account…' : 'Logging in…';
      try {
        const result = signup
          ? await api.register({ username, password, display_name: form.display_name.value.trim(), title: roleSelect.value })
          : await api.login(username, password);
        if (disposed) return;
        setSession({ token: result.token, user: result.user });
        await startLearner();
        location.hash = '#/';
        route();
        toast(signup ? `Welcome, ${firstName()}! 👋` : `Welcome back, ${firstName()}!`);
      } catch (err) {
        if (disposed) return;
        errorEl.textContent = err.offline ? "You're offline. Logging in needs a connection the first time." : err.message;
        submit.disabled = false;
        submit.textContent = signup ? 'Create account' : 'Log in';
      }
    });
  }

  async function logOut() {
    if (syncState.pending && online) await syncNow();
    if (syncState.pending && !confirm(`${syncState.pending} change${syncState.pending === 1 ? ' hasn\'t' : 's haven\'t'} synced yet. They stay saved on this device and sync next time you log in here. Log out anyway?`)) return;
    closePage();
    api.logout().catch(() => {});
    setSession(null);
    store = emptyProgress();
    renderHeader();
    location.hash = '#/';
    route();
    toast('Logged out');
  }

  /** Let the open page save its work (e.g. unsaved code) while the learner is still known. */
  function closePage() {
    teardown();
    teardown = () => {};
    persistLearner();
  }

  function sessionExpired() {
    if (!session) return;
    closePage();
    setSession(null);
    renderHeader();
    location.hash = '#/login';
    route();
    toast('Your session expired. Log in again. Progress saved on this device is kept.');
  }

  /* ================= Home: course catalog ================= */
  let filter = 'all';

  function courseCard(c, st) {
    const p = st.perCourse.get(c.id) || { done: 0, total: c.items.length, pct: 0 };
    const next = nextItem(c);
    const openable = canOpen(c);
    const action = !openable
      ? '<span class="btn btn-sm" aria-disabled="true" title="Download this course while online to use it offline">Needs connection</span>'
      : `<a class="btn btn-primary btn-sm" href="#/learn/${esc(c.id)}/${esc((next || c.items[0])?.id || '')}">${!next ? 'Review' : p.done ? 'Continue' : 'Start'}</a>`;
    return `
      <article class="course-card ${openable ? '' : 'is-unavailable'}">
        <a href="#/course/${esc(c.id)}" class="card-thumb" tabindex="-1" aria-hidden="true">${thumbHTML(c)}</a>
        <div class="card-body">
          <div class="card-tags">
            <span class="tag tag-subject" style="--h:${(SUBJECTS[c.subject] || SUBJECTS.other).hue}">${esc(SUBJECTS[c.subject]?.label || 'Other')}</span>
            <span class="tag">${esc(DIFFICULTIES[c.difficulty] || '')}</span>
            ${offlineBadge(c)}
          </div>
          <h3><a href="#/course/${esc(c.id)}">${esc(c.title)}</a></h3>
          <p class="card-desc">${esc(c.description)}</p>
          <div class="card-meta"><span>📚 ${c.items.length} lesson${c.items.length === 1 ? '' : 's'}</span><span>⏱ ${fmtMinutes(c.minutes)}</span></div>
          <div class="progress-label"><span>${p.done} of ${p.total} complete</span><span>${p.pct}%</span></div>
          <div class="progress" role="progressbar" aria-label="${esc(c.title)} progress" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.pct}%"></span></div>
          <div class="card-actions">${action}${downloadButton(c)}</div>
        </div>
      </article>`;
  }

  function renderHome() {
    document.title = 'Courses · Codelingo';
    const courses = allCourses();
    if (!courses.length) {
      if (online && !catalogLoaded) return loading('Loading courses…');
      app.innerHTML = online
        ? '<div class="state"><div class="state-icon">📚</div><h1>No courses yet</h1><p>Check back soon. Your teachers are preparing courses.</p></div>'
        : `<div class="state"><div class="state-icon">📡</div><h1>You're offline</h1><p>No courses are downloaded on this device yet. Connect to the internet and download courses to learn offline.</p><button class="btn btn-primary" type="button" id="retry">Try again</button></div>`;
      $('#retry')?.addEventListener('click', refreshCatalog);
      return;
    }
    const st = stats();
    const cont = continueTarget();
    const shown = courses.filter((c) => filter === 'all' || (filter === 'downloaded' ? downloaded.has(c.id) : c.subject === filter));
    const chips = [['all', 'All'], ...Object.entries(SUBJECTS).filter(([k]) => courses.some((c) => c.subject === k)).map(([k, v]) => [k, v.label]), ['downloaded', '📥 Downloaded']];

    app.innerHTML = `
      <div class="home">
        <section class="welcome">
          <div>
            <h1>Hi, ${esc(firstName())} 👋</h1>
            <p class="muted">${st.lessons ? 'Ready to keep going?' : 'Pick a course to start learning.'}</p>
          </div>
          ${cont ? `<a class="btn btn-primary btn-lg" href="#/learn/${esc(cont.course.id)}/${esc(cont.item.id)}" ${canOpen(cont.course) ? '' : 'aria-disabled="true"'}>Continue: ${esc(cont.item.title)} →</a>` : ''}
        </section>

        ${['available', 'ios'].includes(installState()) && !readJSON('codelingo-install-dismissed') ? `
        <div class="install-banner">
          <img src="/logo-96.png" alt="" width="44" height="44">
          <div><b>Install Codelingo</b><span>Open it like an app and keep learning with no internet.</span></div>
          ${installState() === 'available' ? '<button class="btn btn-primary btn-sm" type="button" data-install>Install</button>' : '<span class="small">Tap <b>Share</b> → <b>Add to Home Screen</b></span>'}
          <button class="icon-btn icon-sm" type="button" data-dismiss-install aria-label="Dismiss">✕</button>
        </div>` : ''}

        <section class="stats" aria-label="Your progress">
          <a class="stat" href="#/profile"><b>${st.xp}</b><span>XP</span></a>
          <a class="stat" href="#/profile"><b>${st.streak}${st.streak ? ' 🔥' : ''}</b><span>day streak</span></a>
          <a class="stat" href="#/profile"><b>${st.lessons}</b><span>lessons done</span></a>
          <a class="stat" href="#/profile"><b>${Object.keys(store.badges).length}<small>/${BADGES.length}</small></b><span>badges</span></a>
        </section>

        ${!online ? `<div class="notice notice-offline">📴 <span><b>You're offline.</b> Courses you've downloaded work normally, and your progress is queued until you reconnect.</span></div>` : ''}

        <div class="section-head">
          <h2 class="section-title">Courses</h2>
          <div class="chips" role="group" aria-label="Filter courses">
            ${chips.map(([k, label]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${filter === k}">${esc(label)}</button>`).join('')}
          </div>
        </div>
        <section class="course-grid">
          ${shown.length ? shown.map((c) => courseCard(c, st)).join('') : `<p class="empty-card">${filter === 'downloaded' ? 'No downloaded courses yet. Use ⬇ Download on a course to save it for offline use.' : 'No courses here yet.'}</p>`}
        </section>
      </div>`;

    $$('[data-filter]', app).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; refreshView(); }));
    $('[data-install]', app)?.addEventListener('click', installApp);
    $('[data-dismiss-install]', app)?.addEventListener('click', () => { writeJSON('codelingo-install-dismissed', true); refreshView(); });
  }

  /* ================= Course overview ================= */
  function renderCourse(id) {
    const c = findCourse(id);
    if (!c) {
      if (online && !catalogLoaded) return loading('Loading course…');
      app.innerHTML = '<div class="state"><h1>Course not found</h1><p>It may have been unpublished.</p><a class="btn" href="#/">Back to courses</a></div>';
      return;
    }
    document.title = `${c.title} · Codelingo`;
    const st = stats();
    const p = st.perCourse.get(c.id);
    const next = nextItem(c);
    const openable = canOpen(c);
    const rec = downloaded.get(c.id);
    app.innerHTML = `
      <div class="page course-page">
        <a class="back-link" href="#/">← All courses</a>
        <section class="course-hero">
          ${thumbHTML(c, 'thumb thumb-hero')}
          <div class="course-hero-body">
            <div class="card-tags">
              <span class="tag tag-subject" style="--h:${(SUBJECTS[c.subject] || SUBJECTS.other).hue}">${esc(SUBJECTS[c.subject]?.label || 'Other')}</span>
              <span class="tag">${esc(DIFFICULTIES[c.difficulty] || '')}</span>
              ${offlineBadge(c)}
            </div>
            <h1>${esc(c.title)}</h1>
            <p>${esc(c.description)}</p>
            <div class="card-meta"><span>📚 ${c.items.length} lessons</span><span>⏱ ${fmtMinutes(c.minutes)}</span>${c.size ? `<span>💾 ${fmtBytes(rec?.bytes || c.size)}</span>` : ''}</div>
            <div class="progress-label"><span>${p.done} of ${p.total} complete</span><span>${p.pct}%</span></div>
            <div class="progress"><span style="width:${p.pct}%"></span></div>
            <div class="card-actions">
              ${openable ? `<a class="btn btn-primary" href="#/learn/${esc(c.id)}/${esc((next || c.items[0]).id)}">${!next ? 'Review course' : p.done ? 'Continue' : 'Start course'} →</a>` : '<span class="muted">Connect to the internet to open this course, or download it while online.</span>'}
              ${downloadButton(c, { small: false })}
            </div>
          </div>
        </section>
        <h2 class="section-title">What's inside</h2>
        <ol class="outline">
          ${c.items.map((item, i) => {
            const done = store.done[keyOf(c.id, item.id)];
            const t = ITEM_TYPES[item.type];
            const inner = `<span class="dot ${done ? 'done' : ''}">${done ? '✓' : ''}</span><span class="outline-title">${i + 1}. ${esc(item.title)}</span><span class="tag">${t.icon} ${t.label}</span><span class="mins">${item.minutes} min</span>`;
            return `<li>${openable ? `<a href="#/learn/${esc(c.id)}/${esc(item.id)}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
          }).join('')}
        </ol>
      </div>`;
  }

  /* ================= Player: lessons, quizzes and activities ================= */
  function outlineHTML(course, currentId) {
    return `<h2>${esc(course.title)}</h2><ol>${course.items.map((item, i) => {
      const done = store.done[keyOf(course.id, item.id)];
      const cur = item.id === currentId;
      return `<li><a href="#/learn/${esc(course.id)}/${esc(item.id)}" class="${cur ? 'current' : ''}" ${cur ? 'aria-current="page"' : ''}><span class="dot ${done ? 'done' : ''}">${done ? '✓' : ''}</span><span>${i + 1}. ${esc(item.title)}</span><span class="side-ico" title="${ITEM_TYPES[item.type].label}">${ITEM_TYPES[item.type].icon}</span></a></li>`;
    }).join('')}</ol>`;
  }

  async function renderPlayer(courseId, itemId) {
    const gen = generation;
    let course;
    const summary = findCourse(courseId);
    if (!downloaded.has(courseId) && !memoryCourses.has(courseId)) loading('Opening lesson…');
    try {
      course = await getFullCourse(courseId);
    } catch (err) {
      if (gen !== generation) return;
      if (err.offline) {
        setOnline(false);
        app.innerHTML = `<div class="state"><div class="state-icon">📡</div><h1>This course isn't downloaded</h1><p>You're offline, and "${esc(summary?.title || 'this course')}" hasn't been saved to this device. Download it next time you're online to use it anywhere.</p><a class="btn btn-primary" href="#/offline">Go to Offline Center</a></div>`;
      } else {
        app.innerHTML = `<div class="state"><h1>Couldn't open this course</h1><p>${esc(err.message)}</p><a class="btn" href="#/">Back to courses</a></div>`;
      }
      return;
    }
    if (gen !== generation || disposed) return;
    const idx = Math.max(0, course.items.findIndex((i) => i.id === itemId));
    const item = course.items[idx];
    if (!item) {
      app.innerHTML = '<div class="state"><h1>This course has no lessons yet</h1><a class="btn" href="#/">Back to courses</a></div>';
      return;
    }
    const key = keyOf(course.id, item.id);
    if (store.last !== key) { store.last = key; persistLearner(); }
    document.title = `${item.title} · Codelingo`;
    const prev = course.items[idx - 1];
    const next = course.items[idx + 1];
    const rec = downloaded.get(course.id);
    const live = catalog.find((c) => c.id === course.id);
    const updateNote = rec && live && live.version > rec.version && online
      ? `<div class="notice">⟳ A newer version of this course is available. <button class="btn btn-sm btn-warn" type="button" data-download="${esc(course.id)}">Update</button></div>` : '';

    const head = `
      <div class="mobile-picker">
        <label class="sr-only" for="lesson-picker">Jump to lesson</label>
        <select id="lesson-picker">${course.items.map((l, i) => `<option value="#/learn/${esc(course.id)}/${esc(l.id)}" ${l.id === item.id ? 'selected' : ''}>${store.done[keyOf(course.id, l.id)] ? '✓ ' : ''}${i + 1}. ${esc(l.title)}</option>`).join('')}</select>
      </div>
      ${updateNote}
      <div class="crumb">${esc(course.icon)} ${esc(course.title)} · ${ITEM_TYPES[item.type].icon} ${ITEM_TYPES[item.type].label} ${idx + 1} of ${course.items.length} · ~${item.minutes} min</div>
      <h1>${esc(item.title)}</h1>`;
    const navHTML = `
      <nav class="lesson-nav">
        ${prev ? `<a class="btn" href="#/learn/${esc(course.id)}/${esc(prev.id)}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn" href="#/learn/${esc(course.id)}/${esc(next.id)}">${esc(next.title)} →</a>` : `<a class="btn" href="#/course/${esc(course.id)}">Course overview</a>`}
      </nav>`;
    const ctx = { course, item, key, next, head, navHTML };
    const refreshSidebar = () => { const s = $('.sidebar'); if (s) s.innerHTML = outlineHTML(course, item.id); };
    ctx.complete = () => { const first = markComplete(course, item); refreshSidebar(); return first; };
    ctx.nextAction = () => {
      const after = next || course.items.find((i) => !store.done[keyOf(course.id, i.id)]);
      return after
        ? `<a class="btn btn-primary" href="#/learn/${esc(course.id)}/${esc(after.id)}">${next ? 'Next' : 'Finish remaining'}: ${esc(after.title)} →</a>`
        : `<a class="btn btn-primary" href="#/course/${esc(course.id)}">🏆 Course complete! View course</a>`;
    };

    if (item.type === 'code') renderCodeItem(ctx);
    else renderReadingItem(ctx);
    $('#lesson-picker').addEventListener('change', (e) => { location.hash = e.target.value; });
  }

  function readingLayout(ctx, inner) {
    app.innerHTML = `
      <div class="lesson-page reading">
        <aside class="sidebar" aria-label="Lessons">${outlineHTML(ctx.course, ctx.item.id)}</aside>
        <section class="reading-main">
          <div class="reading-inner">${ctx.head}${inner}<div id="done-box"></div>${ctx.navHTML}</div>
        </section>
      </div>`;
  }

  function renderReadingItem(ctx) {
    const { item, key } = ctx;
    if (item.type === 'lesson') {
      readingLayout(ctx, `<div class="prose">${md(item.body)}</div>`);
      const box = $('#done-box');
      const show = () => {
        box.innerHTML = store.done[key]
          ? `<div class="banner ok"><span>✓ Completed</span><span class="spacer"></span>${ctx.nextAction()}</div>`
          : '<button class="btn btn-primary btn-lg" id="mark-done" type="button">✓ Mark as complete</button>';
        $('#mark-done')?.addEventListener('click', () => { ctx.complete(); show(); });
      };
      show();
    } else if (item.type === 'task') {
      readingLayout(ctx, `
        <div class="prose">${md(item.body)}</div>
        ${item.task ? `<div class="task prose"><div class="task-label">Your activity</div>${md(item.task)}</div>` : ''}
        <label class="field" for="task-response"><span class="field-label">Your response</span>
          <textarea id="task-response" rows="5" placeholder="Write what you did, found or learned…">${esc(store.code[key] || '')}</textarea>
          <small>Saved on this device as you type.</small>
        </label>`);
      const ta = $('#task-response');
      const box = $('#done-box');
      const persist = debounce(() => { store.code[key] = ta.value; saveProgress(); }, 500);
      const show = () => {
        const done = store.done[key];
        box.innerHTML = done
          ? `<div class="banner ok"><span>✓ Activity complete</span><span class="spacer"></span>${ctx.nextAction()}</div>`
          : `<button class="btn btn-primary btn-lg" id="mark-done" type="button" ${ta.value.trim() ? '' : 'disabled'}>✓ Mark activity complete</button>`;
        $('#mark-done')?.addEventListener('click', () => { persist.cancel(); store.code[key] = ta.value; ctx.complete(); show(); });
      };
      ta.addEventListener('input', () => { persist(); const b = $('#mark-done'); if (b) b.disabled = !ta.value.trim(); });
      teardown = () => { persist.cancel(); if (ta.value !== (store.code[key] || '')) { store.code[key] = ta.value; saveProgress(); } };
      show();
    } else if (item.type === 'quiz') {
      renderQuiz(ctx);
    }
  }

  function renderQuiz(ctx) {
    const { item, key } = ctx;
    const prior = store.quiz[key];
    readingLayout(ctx, `
      ${item.body ? `<div class="prose">${md(item.body)}</div>` : ''}
      ${prior ? `<p class="muted">Best score so far: <b>${prior.best}/${prior.total}</b>${store.done[key] ? ' · ✓ Passed' : ''}</p>` : ''}
      <form id="quiz" class="quiz">
        ${item.questions.map((q, qi) => `
          <fieldset class="quiz-q" data-q="${qi}">
            <legend><span class="q-num">${qi + 1}</span> ${esc(q.prompt)}</legend>
            ${q.choices.map((ch, ci) => `
              <label class="quiz-choice"><input type="radio" name="q${qi}" value="${ci}"><span>${esc(ch)}</span></label>`).join('')}
            <div class="quiz-feedback" aria-live="polite"></div>
          </fieldset>`).join('')}
        <div class="quiz-actions">
          <button class="btn btn-primary btn-lg" type="submit" id="quiz-submit">Check answers</button>
          <span class="muted small" id="quiz-hint">Answer every question, then check. You need ${PASS_PERCENT}% to pass.</span>
        </div>
      </form>`);

    const form = $('#quiz');
    const box = $('#done-box');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.dataset.graded) { // "Try again"
        form.reset();
        delete form.dataset.graded;
        $$('.quiz-q', form).forEach((f) => { f.className = 'quiz-q'; $('.quiz-feedback', f).innerHTML = ''; });
        $$('input', form).forEach((i) => { i.disabled = false; });
        $$('.quiz-choice', form).forEach((l) => l.classList.remove('is-correct', 'is-wrong'));
        $('#quiz-submit').textContent = 'Check answers';
        box.innerHTML = '';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const answers = item.questions.map((_, qi) => form[`q${qi}`].value);
      const missing = answers.findIndex((a) => a === '');
      if (missing >= 0) {
        $('#quiz-hint').textContent = `Question ${missing + 1} still needs an answer.`;
        $(`[data-q="${missing}"]`, form).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      let score = 0;
      item.questions.forEach((q, qi) => {
        const f = $(`[data-q="${qi}"]`, form);
        const chosen = Number(answers[qi]);
        const right = chosen === q.answer;
        if (right) score++;
        f.className = `quiz-q ${right ? 'q-right' : 'q-wrong'}`;
        $$('.quiz-choice', f).forEach((label, ci) => {
          label.classList.toggle('is-correct', ci === q.answer);
          label.classList.toggle('is-wrong', ci === chosen && !right);
        });
        $('.quiz-feedback', f).innerHTML = `<b>${right ? '✓ Correct' : `✕ The answer is: ${esc(q.choices[q.answer])}`}</b>${q.explanation ? ` · ${esc(q.explanation)}` : ''}`;
      });
      $$('input', form).forEach((i) => { i.disabled = true; });
      form.dataset.graded = '1';
      const total = item.questions.length;
      const pct = Math.round((score / total) * 100);
      const passed = pct >= PASS_PERCENT;
      const prev = store.quiz[key];
      store.quiz[key] = { score, total, best: Math.max(score, prev?.best || 0), at: new Date().toISOString() };
      if (passed) ctx.complete(); else saveProgress();
      $('#quiz-submit').textContent = 'Try again';
      $('#quiz-hint').textContent = '';
      box.innerHTML = passed
        ? `<div class="banner ok pop"><span>🎉 ${score}/${total} (${pct}%). You passed!</span><span class="spacer"></span>${ctx.nextAction()}</div>`
        : `<div class="banner bad pop"><span>${score}/${total} (${pct}%). You need ${PASS_PERCENT}% to pass. Review the answers above and try again.</span></div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function renderCodeItem(ctx) {
    const { course, item: lesson, key } = ctx;
    const isWeb = lesson.lang === 'html';
    app.innerHTML = `
      <div class="lesson-page">
        <aside class="sidebar" aria-label="Lessons">${outlineHTML(course, lesson.id)}</aside>
        <section class="instructions">
          ${ctx.head}
          <div class="prose">${md(lesson.body)}</div>
          <div class="task prose"><div class="task-label">Your task</div>${md(lesson.task)}</div>
          <div id="hint-box"></div>
          ${ctx.navHTML}
        </section>
        <section class="workspace" aria-label="Code editor">
          <div class="toolbar">
            <span class="file-tab">${isWeb ? 'index.html' : 'script.js'}</span>
            <span class="spacer"></span>
            ${lesson.hint ? '<button class="btn btn-ghost" id="btn-hint" type="button">💡 Hint</button>' : ''}
            ${lesson.solution ? '<button class="btn btn-ghost" id="btn-solution" type="button">Solution</button>' : ''}
            <button class="btn btn-ghost" id="btn-reset" type="button" title="Restore the starter code">Reset</button>
            <button class="btn btn-primary" id="btn-run" type="button">▶ ${isWeb ? 'Check' : 'Run'} <kbd>Ctrl ↵</kbd></button>
          </div>
          <div id="editor-host"></div>
          <div class="output">
            <div class="output-tabs" role="tablist">
              ${isWeb ? '<button role="tab" data-tab="preview" aria-selected="true">Preview</button>' : '<button role="tab" data-tab="console" aria-selected="true">Console</button>'}
              <button role="tab" data-tab="checks" aria-selected="false">Checks <span class="badge" id="check-badge">0/${lesson.checks.length}</span></button>
            </div>
            ${isWeb
              ? '<div class="panel" data-panel="preview"><iframe class="preview-frame" title="Preview of your page" sandbox="allow-scripts"></iframe></div>'
              : '<div class="panel" data-panel="console" id="console-host"></div>'}
            <div class="panel is-hidden" data-panel="checks"><div id="banner-host"></div><ul class="checks" id="checks-list"></ul></div>
          </div>
        </section>
      </div>`;

    const selectTab = tabs($('.output'));
    const checksList = $('#checks-list');
    const badge = $('#check-badge');
    const bannerHost = $('#banner-host');
    const frame = $('.preview-frame');
    const cons = isWeb ? null : consoleView($('#console-host'));
    if (cons) cons.clear('Press Run to see your output here.');

    const renderChecks = (results) => {
      checksList.innerHTML = lesson.checks.map((c, i) => {
        const state = results ? (results[i] ? 'pass' : 'fail') : '';
        return `<li class="${state}"><span class="mark" aria-hidden="true">${state === 'pass' ? '✓' : state === 'fail' ? '✕' : ''}</span><span>${esc(c.label)}<span class="sr-only">${state ? (state === 'pass' ? ' (passing)' : ' (not passing yet)') : ''}</span></span></li>`;
      }).join('');
      const passed = results ? results.filter(Boolean).length : 0;
      badge.textContent = `${passed}/${lesson.checks.length}`;
      badge.className = 'badge' + (results ? (passed === lesson.checks.length ? ' ok' : ' bad') : '');
      return passed === lesson.checks.length;
    };
    renderChecks(null);
    const showBanner = (kind, html) => { bannerHost.innerHTML = kind ? `<div class="banner ${kind} pop" role="status">${html}</div>` : ''; };

    let runId = 0;
    const run = async (explicit) => {
      if (explicit) livePreview.cancel();
      const id = ++runId;
      let res;
      if (isWeb) {
        res = await runners.runWeb(frame, editor.value, lesson.checks);
      } else {
        cons.clear('Running…');
        let logged = false;
        res = await runners.runJS(editor.value, lesson.checks, (level, text) => {
          if (!logged) { cons.clear(); logged = true; }
          cons.log(level, text);
        });
        if (id === runId && !logged) cons.clear(res.error ? 'Your code stopped with an error.' : 'Your code ran, but nothing was logged.');
      }
      if (id !== runId || disposed) return;
      const allPass = renderChecks(res.results);
      if (allPass) {
        const first = ctx.complete();
        showBanner('ok', `<span>🎉 All checks passed${first ? '!' : '. Nice work.'}</span><span class="spacer"></span>${ctx.nextAction()}`);
        selectTab('checks');
      } else if (explicit) {
        if (!res.results) {
          showBanner('bad', '⚠ Your code has an error. Check the console, fix it and run again.');
          selectTab(isWeb ? 'checks' : 'console');
        } else {
          const n = res.results.filter(Boolean).length;
          showBanner('bad', `${n} of ${lesson.checks.length} checks passing. Keep going!`);
          selectTab('checks');
        }
      } else {
        showBanner(null);
      }
    };

    const persist = debounce((v) => { store.code[key] = v; saveProgress(); }, 600);
    const livePreview = debounce(() => run(false), 450);
    const editor = createEditor($('#editor-host'), {
      value: store.code[key] != null ? store.code[key] : lesson.starter,
      label: `Code editor for ${lesson.title}. Press Escape then Tab to move focus out.`,
      onChange: (v) => { persist(v); if (isWeb) livePreview(); },
      onRun: () => run(true),
    });

    $('#btn-run').addEventListener('click', () => run(true));
    $('#btn-hint')?.addEventListener('click', () => {
      const box = $('#hint-box');
      box.innerHTML = box.innerHTML ? '' : `<div class="hint pop"><strong>Hint:</strong> ${esc(lesson.hint)}</div>`;
    });
    $('#btn-solution')?.addEventListener('click', () => {
      if (!confirm('Replace your code with the solution? Try the hint first if you haven\'t!')) return;
      editor.value = lesson.solution;
      run(true);
    });
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Reset the editor to the starter code?')) return;
      editor.value = lesson.starter;
      showBanner(null);
      renderChecks(null);
      if (isWeb) run(false);
    });

    if (isWeb) run(false);
    teardown = () => { runId++; livePreview.cancel(); persist.cancel(); if (editor.value !== (store.code[key] ?? lesson.starter)) { store.code[key] = editor.value; saveProgress(); } };
  }

  /* ================= Offline Center ================= */
  function renderOffline() {
    document.title = 'Offline Center · Codelingo';
    const courses = allCourses();
    const recs = [...downloaded.values()].sort((a, b) => a.course.title.localeCompare(b.course.title));
    const notDownloaded = courses.filter((c) => !downloaded.has(c.id));
    const updates = recs.filter((r) => downloadState({ id: r.id }) === 'update');
    const used = recs.reduce((s, r) => s + r.bytes, 0);
    const s = syncLabel();
    const states = [
      ['online', '●', 'Online', 'Connected, everything synced'],
      ['offline', '⚠', 'Offline', 'No connection, saving on this device'],
      ['syncing', '⟳', 'Syncing', 'Sending your progress'],
      ['queued', '⏳', 'Queued', 'Changes waiting to sync'],
    ];

    app.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <h1>Offline Center</h1>
            <p class="muted">Download courses while you're connected, then learn anywhere. Progress is saved on this device and syncs automatically.</p>
          </div>
          <div class="row-gap">
            <button class="btn" type="button" id="sync-now" ${syncing ? 'disabled' : ''}>⟳ Sync now</button>
            ${updates.length ? `<button class="btn btn-warn" type="button" id="update-all" ${online ? '' : 'disabled'}>Update all (${updates.length})</button>` : ''}
            ${notDownloaded.length ? `<button class="btn btn-primary" type="button" id="download-all" ${online ? '' : 'disabled'}>⬇ Download all</button>` : ''}
          </div>
        </div>

        <section class="app-card">
          <div class="app-card-main">
            <span class="oc-label">Codelingo on this device</span>
            <ul class="app-checks">
              <li id="app-files"><span class="check-dot" aria-hidden="true">…</span><span>Checking whether the app is saved for offline use…</span></li>
              <li class="${installState() === 'installed' ? 'is-ok' : ''}"><span class="check-dot" aria-hidden="true">${installState() === 'installed' ? '✓' : '○'}</span><span>${installState() === 'installed' ? 'Installed as an app' : 'Not installed yet. Installing adds Codelingo to your home screen or apps, and it opens with no internet.'}</span></li>
            </ul>
          </div>
          <div class="app-card-action">${installHelpHTML()}</div>
        </section>

        <section class="oc-grid">
          <div class="oc-card oc-status" data-state="${s.state}">
            <span class="oc-label">Sync status</span>
            <b class="oc-big"><span aria-hidden="true">${s.icon}</span> ${esc(s.text)}</b>
            <ul class="state-legend">${states.map(([k, icon, label, desc]) => `<li class="${k === s.state ? 'is-current' : ''}" data-state="${k}"><span aria-hidden="true">${icon}</span><b>${label}</b><span>${desc}</span></li>`).join('')}</ul>
          </div>
          <div class="oc-card">
            <span class="oc-label">Last sync</span>
            <b class="oc-big">${esc(timeAgo(syncState.lastSync))}</b>
            <span class="muted small">${syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : 'Not synced from this device yet'}</span>
            <span class="oc-label oc-gap">Queued changes</span>
            <b class="oc-big">${syncState.pending}</b>
            <span class="muted small">${syncState.pending ? (online ? 'Syncing shortly' : 'Will sync when you reconnect') : 'Nothing waiting'}</span>
          </div>
          <div class="oc-card">
            <span class="oc-label">Downloaded courses</span>
            <b class="oc-big">${recs.length} <small>· ${fmtBytes(used)}</small></b>
            <span class="oc-label oc-gap">Device storage</span>
            <div id="storage-box"><span class="muted small">Checking…</span></div>
          </div>
        </section>

        <h2 class="section-title">Downloaded courses</h2>
        ${recs.length ? `
        <div class="dl-list">
          ${recs.map((r) => {
            const c = findCourse(r.id) || summaryOf(r.course);
            const state = downloadState({ id: r.id });
            return `
              <div class="dl-row">
                ${thumbHTML(r.course, 'thumb thumb-sm')}
                <div class="dl-main">
                  <a href="#/course/${esc(r.id)}"><b>${esc(r.course.title)}</b></a>
                  <span class="muted small">v${r.version} · ${fmtBytes(r.bytes)} · ${r.course.items.length} lessons · downloaded ${esc(timeAgo(r.downloadedAt))}</span>
                </div>
                <div class="dl-state">${state === 'update' ? `<span class="tag tag-update">⟳ v${catalog.find((x) => x.id === r.id).version} available</span>` : state === 'retired' ? '<span class="tag tag-update">No longer published</span>' : '<span class="tag tag-offline">✓ Up to date</span>'}</div>
                <div class="row-gap">
                  ${state === 'update' ? `<button class="btn btn-sm btn-warn" type="button" data-download="${esc(r.id)}" ${online ? '' : 'disabled'}>Update</button>` : ''}
                  <a class="btn btn-sm" href="#/learn/${esc(r.id)}/${esc((nextItem(c) || c.items[0] || {}).id || '')}">Open</a>
                  <button class="btn btn-sm btn-ghost danger" type="button" data-delete="${esc(r.id)}">Delete</button>
                </div>
              </div>`;
          }).join('')}
        </div>` : '<p class="empty-card">Nothing downloaded yet. Download a course below to use it without internet.</p>'}

        ${notDownloaded.length ? `
        <h2 class="section-title">Available to download</h2>
        <div class="dl-list">
          ${notDownloaded.map((c) => `
            <div class="dl-row">
              ${thumbHTML(c, 'thumb thumb-sm')}
              <div class="dl-main">
                <a href="#/course/${esc(c.id)}"><b>${esc(c.title)}</b></a>
                <span class="muted small">${c.items.length} lessons · ${fmtMinutes(c.minutes)}${c.size ? ` · ${fmtBytes(c.size)}` : ''}</span>
              </div>
              <div class="dl-state"><span class="tag tag-muted">Online only</span></div>
              <div class="row-gap">${downloadButton(c)}</div>
            </div>`).join('')}
        </div>` : ''}
      </div>`;

    $('[data-install]', app)?.addEventListener('click', installApp);
    const ocGen = generation;
    appOfflineStatus().then((st) => {
      const el = $('#app-files');
      if (!el || ocGen !== generation) return;
      const line = {
        ready: ['✓', 'is-ok', `App saved for offline use: Codelingo and both Arcade games open with no internet (${st.files} files).`],
        preparing: ['…', '', 'Saving the app for offline use. Keep this page open for a moment while you\'re connected.'],
        dev: ['i', '', 'Offline app saving runs in the deployed app (npm run build / Vercel), not in npm run dev.'],
        unsupported: ['!', 'is-warn', 'This browser can\'t save the app for offline use. Try Chrome, Edge or Safari.'],
      }[st.state];
      el.className = line[1];
      el.innerHTML = `<span class="check-dot" aria-hidden="true">${line[0]}</span><span>${esc(line[2])}</span>`;
    });

    $('#sync-now').addEventListener('click', async () => {
      if (!navigator.onLine) { toast("You're offline. Your changes will sync automatically when you reconnect."); }
      await syncNow();
      await refreshCatalog();
      toast(online ? (syncState.pending ? 'Some changes are still waiting to sync' : '✓ Everything is synced') : "Still offline. We'll keep trying.");
      refreshView();
    });
    $('#download-all')?.addEventListener('click', async () => {
      for (const c of notDownloaded) await downloadCourse(c.id);
    });
    $('#update-all')?.addEventListener('click', async () => {
      for (const r of updates) await downloadCourse(r.id);
    });
    $$('[data-delete]', app).forEach((b) => b.addEventListener('click', () => removeDownload(b.dataset.delete)));

    const gen = generation;
    storageEstimate().then(({ usage, quota, supported }) => {
      if (gen !== generation) return;
      const el = $('#storage-box');
      if (!el) return;
      if (!supported || !quota) { el.innerHTML = '<span class="muted small">Your browser doesn\'t report storage space.</span>'; return; }
      const pct = Math.min(100, (usage / quota) * 100);
      el.innerHTML = `
        <div class="progress progress-storage" role="progressbar" aria-label="Storage used" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(pct, 1)}%"></span></div>
        <div class="storage-row"><span><b>${fmtBytes(usage)}</b> used</span><span><b>${fmtBytes(Math.max(0, quota - usage))}</b> remaining</span></div>`;
    });
  }

  /* ================= Profile ================= */
  function renderProfile() {
    const u = session.user;
    document.title = `${u.display_name} · Codelingo`;
    const courses = allCourses();
    const st = stats();
    const qualified = new Set(qualifiedBadges(st));
    const hist = learningHistory(store, courses);
    const recs = [...downloaded.values()];
    const initials = (u.display_name || u.username).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const badgeProgress = {
      'first-lesson': `${Math.min(st.lessons, 1)}/1 lesson`,
      'coding-explorer': `${Math.min(st.codingDone, 5)}/5 coding lessons`,
      'math-master': 'Finish a Math course',
      'science-star': 'Finish a Science course',
      'streak-7': `Best streak ${Math.min(st.bestStreak, 7)}/7 days`,
      'streak-30': `Best streak ${Math.min(st.bestStreak, 30)}/30 days`,
    };
    const dayLabel = (iso) => {
      if (!iso) return 'Earlier';
      const d = localISO(new Date(iso));
      const today = localISO(new Date());
      const y = new Date(); y.setDate(y.getDate() - 1);
      return d === today ? 'Today' : d === localISO(y) ? 'Yesterday' : new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    };
    const groups = [];
    for (const h of hist.slice(0, 60)) {
      const label = dayLabel(h.at);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, entries: [] });
      groups[groups.length - 1].entries.push(h);
    }

    app.innerHTML = `
      <div class="page profile">
        <section class="profile-card">
          <span class="avatar avatar-lg" aria-hidden="true">${esc(initials)}</span>
          <div class="profile-id">
            <h1>${esc(u.display_name)}</h1>
            <p class="muted">${esc(u.title)} · @${esc(u.username)}</p>
            <p id="rank-line" class="rank-line"></p>
          </div>
          <button class="btn btn-logout" id="logout" type="button"><span aria-hidden="true">⏻</span> Log out</button>
        </section>

        <section class="stats stats-5" aria-label="Your stats">
          <div class="stat"><b>${st.xp}</b><span>XP</span></div>
          <div class="stat"><b>${(st.minutes / 60).toFixed(1)}</b><span>hours learned</span></div>
          <div class="stat"><b>${st.completedCourses.length}</b><span>courses completed</span></div>
          <div class="stat"><b>${st.streak}${st.streak ? ' 🔥' : ''}</b><span>day streak${st.bestStreak > st.streak ? ` · best ${st.bestStreak}` : ''}</span></div>
          <div class="stat"><b>${st.lessons}</b><span>lessons done</span></div>
        </section>

        <h2 class="section-title">Badges <span class="muted small">${Object.keys(store.badges).length} of ${BADGES.length}</span></h2>
        <section class="badges">
          ${BADGES.map((b) => {
            const at = store.badges[b.id];
            const earned = at || qualified.has(b.id);
            return `
              <div class="badge-card ${earned ? 'earned' : 'locked'}">
                <span class="badge-icon" aria-hidden="true">${b.icon}</span>
                <b>${esc(b.name)}</b>
                <span class="small">${esc(b.desc)}</span>
                <span class="small badge-status">${earned ? `Earned ${at ? new Date(at).toLocaleDateString() : ''}` : `🔒 ${esc(badgeProgress[b.id])}`}</span>
              </div>`;
          }).join('')}
        </section>

        <div class="profile-cols">
          <section>
            <h2 class="section-title">Courses completed</h2>
            ${st.completedCourses.length
              ? `<ul class="plain-list">${st.completedCourses.map((c) => `<li><span>${esc(c.icon)}</span><a href="#/course/${esc(c.id)}">${esc(c.title)}</a><span class="muted small">${c.items.length} lessons</span></li>`).join('')}</ul>`
              : '<p class="muted">Finish every lesson in a course to complete it.</p>'}

            <h2 class="section-title">Downloaded content</h2>
            ${recs.length
              ? `<ul class="plain-list">${recs.map((r) => `<li><span>${esc(r.course.icon)}</span><a href="#/course/${esc(r.id)}">${esc(r.course.title)}</a><span class="muted small">${fmtBytes(r.bytes)}</span></li>`).join('')}</ul>
                 <p class="small"><a href="#/offline">Manage in Offline Center →</a></p>`
              : '<p class="muted">No courses downloaded on this device. <a href="#/offline">Open the Offline Center</a>.</p>'}
          </section>
          <section>
            <h2 class="section-title">Learning history</h2>
            ${groups.length ? groups.map((g) => `
              <h3 class="history-day">${esc(g.label)}</h3>
              <ul class="history">
                ${g.entries.map((h) => `
                  <li>
                    <span class="history-ico" aria-hidden="true">${ITEM_TYPES[h.item.type].icon}</span>
                    <span class="history-main"><a href="#/learn/${esc(h.course.id)}/${esc(h.item.id)}">${esc(h.item.title)}</a><span class="muted small">${esc(h.course.title)}</span></span>
                    <span class="history-xp">+${h.item.minutes * XP_PER_MINUTE} XP</span>
                    <span class="muted small">${h.at ? new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                  </li>`).join('')}
              </ul>`).join('') : '<p class="muted">Lessons you complete will show up here.</p>'}
          </section>
        </div>

        <div class="reset-link"><button class="btn btn-ghost danger" id="reset-progress" type="button">Reset all my progress</button></div>
      </div>`;

    $('#logout').addEventListener('click', logOut);
    $('#reset-progress').addEventListener('click', async () => {
      if (!online) { toast('Resetting progress needs a connection, so every device is reset together.'); return; }
      if (!confirm('Erase all your progress, saved code, badges and history on every device? This cannot be undone.')) return;
      try {
        await api.resetProgress();
        store = emptyProgress();
        syncState.pending = 0;
        persistLearner();
        renderSyncPill();
        toast('Progress reset');
        refreshView();
      } catch (err) {
        toast(`Couldn't reset: ${err.message}`);
      }
    });

    if (u.role === 'student') {
      const gen = generation;
      loadLeaderboard().then((lb) => {
        if (!lb || gen !== generation) return;
        const me = lb.data.all_time.find((e) => e.is_me);
        const el = $('#rank-line');
        if (me && el) el.innerHTML = `🏆 Ranked <b>#${me.rank}</b> of ${lb.data.students} students · <a href="#/leaderboard">See rankings</a>`;
      });
    }
  }

  /* ================= Leaderboard ================= */
  let boardTab = 'all_time';

  /** Fresh rankings when online; the last copy seen when offline. */
  async function loadLeaderboard() {
    try {
      const data = await api.leaderboard();
      const entry = { data, at: new Date().toISOString() };
      meta.set('leaderboard', entry).catch(() => {});
      return { ...entry, live: true };
    } catch (err) {
      if (err.offline) { online = false; renderSyncPill(); }
      const cached = await meta.get('leaderboard').catch(() => null);
      return cached ? { ...cached, live: false } : null;
    }
  }

  async function renderLeaderboard() {
    document.title = 'Rankings · Codelingo';
    const gen = generation;
    loading('Loading rankings…');
    const lb = await loadLeaderboard();
    if (gen !== generation || disposed) return;
    if (!lb) {
      app.innerHTML = '<div class="state"><div class="state-icon">📡</div><h1>Rankings need a connection</h1><p>Connect to the internet to see how you compare with other students.</p></div>';
      return;
    }
    const draw = () => {
      const rows = lb.data[boardTab];
      const field = boardTab === 'all_time' ? 'xp' : 'week_xp';
      const me = rows.find((r) => r.is_me);
      const podium = rows.slice(0, 3).filter((r) => r[field] > 0);
      app.innerHTML = `
        <div class="page">
          <div class="page-head">
            <div>
              <h1>Rankings</h1>
              <p class="muted">Students ranked by XP. Earn XP by completing lessons, quizzes and activities.${lb.live ? '' : ` <b>Offline: showing rankings from ${esc(timeAgo(lb.at))}.</b>`}</p>
            </div>
            <div class="seg" role="group" aria-label="Period">
              <button type="button" data-tab="all_time" aria-pressed="${boardTab === 'all_time'}">All time</button>
              <button type="button" data-tab="this_week" aria-pressed="${boardTab === 'this_week'}">This week</button>
            </div>
          </div>
          ${me ? `<p class="notice">You're <b>#${me.rank}</b> of ${lb.data.students} with <b>${me[field]} XP</b>${boardTab === 'this_week' ? ' this week' : ''}.</p>` : isAdmin() ? '<p class="notice">Administrators aren\'t ranked. This is how your students are doing.</p>' : ''}
          ${podium.length ? `
          <section class="podium">
            ${podium.map((r) => `<div class="podium-spot place-${r.rank} ${r.is_me ? 'is-me' : ''}"><span class="medal">${['🥇', '🥈', '🥉'][r.rank - 1] || '🏅'}</span><b>${esc(r.name)}</b><span>${r[field]} XP</span></div>`).join('')}
          </section>` : ''}
          ${rows.length ? `
          <div class="table-wrap">
            <table class="board">
              <thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">XP</th><th scope="col">Streak</th><th scope="col">Lessons</th><th scope="col">Badges</th></tr></thead>
              <tbody>${rows.map((r) => `
                <tr class="${r.is_me ? 'is-me' : ''}">
                  <td>${r.rank}</td>
                  <td>${esc(r.name)}${r.is_me ? ' <span class="tag">You</span>' : ''}</td>
                  <td><b>${r[field]}</b></td>
                  <td>${r.streak ? `${r.streak} 🔥` : '0'}</td>
                  <td>${r.lessons}</td>
                  <td>${r.badges}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p class="empty-card">No students yet.</p>'}
        </div>`;
      $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { boardTab = b.dataset.tab; draw(); }));
    };
    draw();
  }

  /* ================= Arcade: coding games ================= */
  // Each game is a self-contained page in public/games, shown in a frame and saved for
  // offline use by the service worker. A game saves to localStorage under a key for this
  // learner; the app copies that save into progress.play["game:<id>"] so it syncs.
  const GAMES = {
    dungeon: {
      title: 'Code Dungeon', icon: '🏰', file: '/games/code-dungeon.html', hue: 258, lang: 'Python',
      blurb: 'Explore mysterious rooms, collect coins and unlock magic gates by writing real Python.',
      skills: ['Variables', 'If statements', 'Loops'],
      stats: (s) => [`Level ${Math.min(3, (Number(s.level) || 0) + 1)} of 3`, `🪙 ${s.coins || 0}`, `⭐ ${s.xp || 0} XP`],
    },
    farm: {
      title: 'Pixel Farm', icon: '🌽', file: '/games/pixel-farm.html', hue: 95, lang: 'Python-style',
      blurb: 'Help Moo grow a farm: plant, water and harvest crops with loops and function calls.',
      skills: ['Function calls', 'For loops', '2D grids'],
      stats: (s) => [`Farm level ${Math.floor((Number(s.xp) || 0) / 200) + 1}`, `🪙 ${s.coins ?? 120}`, `🧺 ${s.stats?.harvested || 0} harvested`],
    },
  };
  const gameKey = (id) => `codelingo-game:${id}:${session.user.username.toLowerCase()}`;
  const playKey = (id) => `game:${id}`;
  let gameSyncPending = false;
  const queueGameSync = debounce(() => { gameSyncPending = false; saveProgress(); }, 2500);

  function readSave(json) {
    try { const v = JSON.parse(json); return v && typeof v === 'object' ? v : null; } catch { return null; }
  }
  function saveTime(json) { return Number(readSave(json)?.updatedAt) || 0; }

  /** Before a game starts: if the account has a newer save (another device), put it where the game reads it. */
  function prepareGameSave(id) {
    const synced = store.play[playKey(id)];
    try {
      const local = localStorage.getItem(gameKey(id));
      if (synced && saveTime(synced) > saveTime(local)) localStorage.setItem(gameKey(id), synced);
      else if (local && saveTime(local) > saveTime(synced)) { store.play[playKey(id)] = local; queueGameSync(); }
    } catch { /* storage blocked: the game still runs for this visit */ }
  }

  // The game frame writes to localStorage; other windows (this app) get a storage event.
  on(window, 'storage', (e) => {
    if (!session || !e.key?.startsWith('codelingo-game:') || !e.newValue) return;
    for (const id of Object.keys(GAMES)) {
      if (e.key === gameKey(id) && saveTime(e.newValue) >= saveTime(store.play[playKey(id)])) {
        store.play[playKey(id)] = e.newValue;
        gameSyncPending = true;
        queueGameSync();
      }
    }
  });

  function flushGameSync() {
    if (!gameSyncPending) return;
    queueGameSync.cancel();
    gameSyncPending = false;
    saveProgress();
  }

  function renderArcade() {
    document.title = 'Arcade · Codelingo';
    app.innerHTML = `
      <div class="page arcade">
        <div class="page-head">
          <div>
            <span class="eyebrow">Second playground</span>
            <h1>Arcade</h1>
            <p class="muted">Learn to code by playing. Both games work offline, and your progress saves to your account.</p>
          </div>
          <a class="btn" href="#/playground">🧪 Code Playground</a>
        </div>
        <section class="game-grid">
          ${Object.entries(GAMES).map(([id, g]) => {
            const save = readSave(store.play[playKey(id)]) || readSave((() => { try { return localStorage.getItem(gameKey(id)); } catch { return null; } })());
            return `
              <article class="game-tile" style="--h:${g.hue}">
                <a class="game-art" href="#/arcade/${id}" tabindex="-1" aria-hidden="true"><span>${g.icon}</span></a>
                <div class="game-body">
                  <div class="card-tags">
                    <span class="tag tag-subject" style="--h:${g.hue}">${esc(g.lang)}</span>
                    <span class="tag tag-offline">✓ Works offline</span>
                  </div>
                  <h2><a href="#/arcade/${id}">${esc(g.title)}</a></h2>
                  <p class="card-desc">${esc(g.blurb)}</p>
                  <div class="skill-row">${g.skills.map((s) => `<span class="skill">${esc(s)}</span>`).join('')}</div>
                  <div class="game-stats">${save ? g.stats(save).map((s) => `<span>${esc(s)}</span>`).join('') : '<span>New game</span>'}</div>
                  <a class="btn btn-primary" href="#/arcade/${id}">${save ? '▶ Continue' : '▶ Play'}</a>
                </div>
              </article>`;
          }).join('')}
        </section>
      </div>`;
  }

  function renderGame(id) {
    const g = GAMES[id];
    document.title = `${g.title} · Codelingo`;
    prepareGameSave(id);
    app.innerHTML = `
      <div class="game-stage">
        <iframe class="game-frame" src="${g.file}?save=${encodeURIComponent(gameKey(id))}" title="${esc(g.title)}" allow="fullscreen"></iframe>
      </div>`;
    const frame = $('.game-frame', app);
    frame.addEventListener('load', () => frame.focus());
    teardown = flushGameSync;
  }

  /* ================= Playground ================= */
  const PLAY_DEFAULTS = {
    web: [
      '<!doctype html>', '<html>', '<head>', '  <style>',
      '    body { font-family: system-ui, sans-serif; padding: 24px; }',
      '    button { font-size: 18px; padding: 8px 16px; border-radius: 8px; }',
      '  </style>', '</head>', '<body>', '  <h1>My playground</h1>',
      '  <button id="btn">Clicked 0 times</button>', '', '  <script>', '    let count = 0;',
      '    const btn = document.getElementById("btn");', '    btn.addEventListener("click", () => {',
      '      count++;', '      btn.textContent = "Clicked " + count + " times";',
      '      console.log("count is", count);', '    });', '  </script>', '</body>', '</html>', '',
    ].join('\n'),
    js: [
      '// Experiment freely! Press Run (Ctrl + Enter).', 'const fruits = ["apple", "banana", "cherry"];', '',
      'for (const fruit of fruits) {', '  console.log(fruit.toUpperCase());', '}', '',
      'console.log({ total: fruits.length, first: fruits[0] });', '',
    ].join('\n'),
  };

  function renderPlayground() {
    document.title = 'Playground · Codelingo';
    let mode = store.play.mode === 'js' ? 'js' : 'web';
    app.innerHTML = `
      <div class="playground">
        <section class="workspace" aria-label="Playground editor">
          <div class="toolbar">
            <div class="seg" role="group" aria-label="Language">
              <button type="button" data-mode="web">HTML / CSS / JS</button>
              <button type="button" data-mode="js">JavaScript only</button>
            </div>
            <span class="spacer"></span>
            <button class="btn btn-ghost" id="pg-reset" type="button">Reset</button>
            <button class="btn btn-primary" id="pg-run" type="button">▶ Run <kbd>Ctrl ↵</kbd></button>
          </div>
          <div id="pg-editor"></div>
        </section>
        <section class="output" aria-label="Output">
          <div class="output-tabs" role="tablist">
            <button role="tab" data-tab="preview" aria-selected="true">Preview</button>
            <button role="tab" data-tab="console" aria-selected="false">Console <span class="badge" id="pg-count">0</span></button>
          </div>
          <div class="panel" data-panel="preview"><iframe class="preview-frame" title="Playground preview" sandbox="allow-scripts allow-modals"></iframe></div>
          <div class="panel is-hidden" data-panel="console" id="pg-console"></div>
        </section>
      </div>`;

    const frame = $('.preview-frame');
    const cons = consoleView($('#pg-console'));
    const countBadge = $('#pg-count');
    const previewTab = $('[data-tab="preview"]');
    const selectTab = tabs($('.playground .output'));
    cons.clear();
    const log = (level, text) => { cons.log(level, text); countBadge.textContent = String(cons.count); };

    const persist = debounce((v) => { store.play[mode] = v; persistLearner(); }, 400);
    const run = async () => {
      cons.clear();
      countBadge.textContent = '0';
      if (mode === 'web') {
        runners.runWeb(frame, editor.value, null, log);
      } else {
        selectTab('console');
        await runners.runJS(editor.value, null, log);
        if (!cons.count) cons.clear('Your code ran, but nothing was logged.');
      }
    };
    // Saved code, or the example when nothing (or only blank space) is saved.
    const savedOrExample = (m) => (store.play[m] && store.play[m].trim() ? store.play[m] : PLAY_DEFAULTS[m]);
    const editor = createEditor($('#pg-editor'), {
      value: savedOrExample(mode),
      label: 'Playground code editor. Press Escape then Tab to move focus out.',
      onChange: (v) => persist(v),
      onRun: run,
    });
    const setMode = (m) => {
      persist.cancel();
      store.play[mode] = editor.value;
      mode = m;
      store.play.mode = m;
      persistLearner();
      $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
      previewTab.hidden = m === 'js';
      selectTab(m === 'js' ? 'console' : 'preview');
      editor.value = savedOrExample(m);
      if (m === 'js') { frame.srcdoc = ''; cons.clear('Press Run to execute your code.'); countBadge.textContent = '0'; }
    };
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); }));
    $('#pg-run').addEventListener('click', run);
    $('#pg-reset').addEventListener('click', () => {
      if (!confirm('Reset the playground to the example code?')) return;
      editor.value = PLAY_DEFAULTS[mode];
      if (mode === 'js') run();
    });
    setMode(mode);
    if (mode === 'web') run();
    teardown = () => { persist.cancel(); store.play[mode] = editor.value; persistLearner(); };
  }

  /* ================= Boot ================= */
  async function startLearner() {
    loadLearner();
    const [cached, recs] = await Promise.all([meta.get('catalog').catch(() => null), downloads.list().catch(() => [])]);
    if (disposed) return;
    catalog = Array.isArray(cached) ? cached : [];
    catalogLoaded = false;
    downloaded.clear();
    for (const r of recs || []) downloaded.set(r.id, r);
    renderHeader();
    // In the background: refresh the account, the catalog and progress.
    api.me().then((user) => {
      if (disposed || !session) return;
      session = { ...session, user };
      writeJSON(SESSION_KEY, session);
      renderHeader();
    }).catch((err) => { if (err.status === 401) sessionExpired(); });
    refreshCatalog();
    syncNow();
  }

  async function boot() {
    registerServiceWorker();
    renderHeader();
    if (session) await startLearner();
    if (disposed) return;
    route();
  }

  // The browser offered (or completed) an install: update the Install buttons.
  on(window, 'codelingo:install', () => { renderInstallButton(); refreshView(); });
  on(window, 'online', () => setOnline(true));
  on(window, 'offline', () => setOnline(false));
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session && syncState.pending) syncNow({ keepalive: true });
    if (document.visibilityState === 'visible' && session) { syncNow(); refreshCatalog(); }
  });
  const retry = setInterval(() => { if (session && syncState.pending && !syncing) syncNow(); }, RETRY_EVERY);
  cleanups.push(() => clearInterval(retry));

  boot();

  return function unmount() {
    disposed = true;
    teardown();
    clearTimeout(syncTimer);
    cleanups.forEach((fn) => fn());
    root.innerHTML = '';
  };
}
