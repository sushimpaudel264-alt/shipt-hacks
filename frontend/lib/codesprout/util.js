// Small DOM, text and formatting helpers shared by every Codelingo page.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 8);

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function toast(msg, { kind = '' } = {}) {
  let stack = document.querySelector('.toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast pop ${kind}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

export function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function fmtMinutes(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString();
}

/* ---------- Tiny Markdown: **bold**, *italic*, `code`, ## headings, - lists, ~~~ fences ---------- */
function dedent(src) {
  const lines = String(src || '').replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min));
}
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}
export function md(src) {
  const lines = dedent(src);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('~~~')) {
      const buf = [];
      while (++i < lines.length && !lines[i].startsWith('~~~')) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(`<li>${inline(lines[i++].slice(2))}</li>`);
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
    } else {
      const buf = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(~~~|## |- )/.test(lines[i + 1])) buf.push(lines[++i]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

/* ---------- Course presentation ---------- */
export const SUBJECTS = {
  coding: { label: 'Coding', hue: 145 },
  math: { label: 'Math', hue: 215 },
  science: { label: 'Science', hue: 275 },
  other: { label: 'Other', hue: 30 },
};
export const DIFFICULTIES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const ITEM_TYPES = {
  lesson: { label: 'Lesson', icon: '📖' },
  quiz: { label: 'Quiz', icon: '❓' },
  code: { label: 'Coding activity', icon: '💻' },
  task: { label: 'Hands-on activity', icon: '✋' },
};

/** Thumbnail: the uploaded image, or a generated tile from the course icon and subject color. */
export function thumbHTML(course, cls = 'thumb') {
  const hue = (SUBJECTS[course.subject] || SUBJECTS.other).hue;
  if (course.thumbnail) {
    return `<div class="${cls}"><img src="${esc(course.thumbnail)}" alt="" loading="lazy"></div>`;
  }
  return `<div class="${cls} thumb-generated" style="--h:${hue}" aria-hidden="true"><span>${esc(course.icon || '📘')}</span></div>`;
}
