// Course management for administrators (teachers, Ed Farm contributors, school
// administrators, community partners and volunteer mentors): list, create, edit,
// save drafts and publish. Course management needs a connection.
import { $, $$, esc, fmtMinutes, newId, slugify, timeAgo, thumbHTML, SUBJECTS, DIFFICULTIES, ITEM_TYPES } from './util';

/**
 * ctx: { app, api, toast, runners, setLeaveGuard(isDirty), onCatalogChanged(), isStale(), rememberHash() }
 */

function statusPill(c) {
  if (c.status === 'draft') return '<span class="pill pill-draft">Draft</span>';
  if (c.has_unpublished_changes) return `<span class="pill pill-changes">Published v${c.version} · unpublished changes</span>`;
  return `<span class="pill pill-live">Published v${c.version}</span>`;
}

function needsConnection(ctx, what) {
  ctx.app.innerHTML = `
    <div class="state">
      <div class="state-icon" aria-hidden="true">📡</div>
      <h1>${esc(what)} needs a connection</h1>
      <p>Students can keep learning offline, but creating and editing courses happens on the server. Reconnect and try again.</p>
      <a class="btn" href="#/">Back to courses</a>
    </div>`;
}

export async function renderAdminList(ctx) {
  document.title = 'Manage courses · CodeLingo';
  ctx.app.innerHTML = '<div class="state"><div class="spinner" aria-hidden="true"></div><p>Loading courses…</p></div>';
  let courses;
  try {
    courses = await ctx.api.admin.list();
  } catch (err) {
    if (err.offline) return needsConnection(ctx, 'Course management');
    ctx.app.innerHTML = `<div class="state"><h1>Couldn't load courses</h1><p>${esc(err.message)}</p></div>`;
    return;
  }
  if (ctx.isStale()) return;

  ctx.app.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Manage courses</h1>
          <p class="muted">Create courses, save drafts and publish them to students. Students only see published versions.</p>
        </div>
        <a class="btn btn-primary" href="#/admin/new">+ New course</a>
      </div>
      ${courses.length ? `
      <div class="admin-list">
        ${courses.map((c) => `
          <a class="admin-row" href="#/admin/edit/${esc(c.id)}">
            ${thumbHTML(c, 'thumb thumb-sm')}
            <div class="admin-row-main">
              <b>${esc(c.title || 'Untitled course')}</b>
              <span class="muted">${esc(SUBJECTS[c.subject]?.label || '')} · ${esc(DIFFICULTIES[c.difficulty] || '')} · ${c.items} item${c.items === 1 ? '' : 's'}</span>
            </div>
            <div class="admin-row-meta">
              ${statusPill(c)}
              <span class="muted small">Edited ${esc(timeAgo(c.updated_at))}${c.updated_by ? ` by ${esc(c.updated_by)}` : ''}</span>
            </div>
          </a>`).join('')}
      </div>` : `
      <div class="empty-card">
        <p>No courses yet.</p>
        <a class="btn btn-primary" href="#/admin/new">Create the first course</a>
      </div>`}
    </div>`;
}

/* ---------------- Editor ---------------- */

const NEW_ITEM = {
  lesson: () => ({ minutes: 5, body: '' }),
  quiz: () => ({ minutes: 5, body: '', questions: [{ prompt: '', choices: ['', ''], answer: 0, explanation: '' }] }),
  code: () => ({ minutes: 10, lang: 'js', body: '', task: '', starter: '', solution: '', hint: '', checks: [{ label: '', test: '' }] }),
  task: () => ({ minutes: 15, body: '', task: '' }),
};

const blankCourse = () => ({
  title: '', description: '', subject: 'coding', difficulty: 'beginner', icon: '📘', thumbnail: '', items: [],
});

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/** Shrink an uploaded image to a 640×360 JPEG data URL so courses stay small enough to download. */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 640, H = 360;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const scale = Math.max(W / img.width, H / img.height); // cover, centered
      const w = img.width * scale, h = img.height * scale;
      canvas.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read')); };
    img.src = url;
  });
}

export async function renderEditor(ctx, courseId) {
  const { app, api, toast } = ctx;
  let meta = null; // server status for an existing course
  let course;

  if (courseId) {
    app.innerHTML = '<div class="state"><div class="spinner" aria-hidden="true"></div><p>Loading course…</p></div>';
    try {
      meta = await api.admin.get(courseId);
    } catch (err) {
      if (err.offline) return needsConnection(ctx, 'Editing courses');
      app.innerHTML = `<div class="state"><h1>Couldn't open this course</h1><p>${esc(err.message)}</p><a class="btn" href="#/admin">Back to courses</a></div>`;
      return;
    }
    if (ctx.isStale()) return;
    course = { ...blankCourse(), ...meta.content };
  } else {
    course = blankCourse();
  }

  let dirty = false;
  let busy = false;
  const open = new Set(course.items.length ? [] : ['__details']); // which item panels are expanded
  ctx.setLeaveGuard(() => dirty); // the router asks before leaving with unsaved changes

  const markDirty = () => {
    dirty = true;
    updateHead();
  };

  function headStatus() {
    const parts = [];
    if (meta) parts.push(statusPill(meta));
    else parts.push('<span class="pill pill-draft">New course · not saved yet</span>');
    if (dirty) parts.push('<span class="pill pill-unsaved">Unsaved changes</span>');
    return parts.join(' ');
  }

  function updateHead() {
    $('#ed-status').innerHTML = headStatus();
    $('#ed-unpublish').hidden = !(meta && meta.status === 'published');
    $('#ed-delete').hidden = !meta;
    const total = course.items.reduce((s, i) => s + (Number(i.minutes) || 0), 0);
    $('#ed-count').textContent = `${course.items.length} item${course.items.length === 1 ? '' : 's'} · about ${fmtMinutes(total)}`;
    $$('#ed-actions button').forEach((b) => { b.disabled = busy; });
  }

  function message(kind, text) {
    const el = $('#ed-msg');
    el.className = kind ? `ed-msg ${kind}` : 'ed-msg';
    el.textContent = text || '';
    if (text) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const field = (label, control, help = '') =>
    `<label class="field"><span class="field-label">${label}</span>${control}${help ? `<small>${help}</small>` : ''}</label>`;
  const input = (path, attrs = '') =>
    `<input data-path="${path}" value="${esc(getPath(course, path) ?? '')}" ${attrs}>`;
  const area = (path, rows = 4, cls = '', attrs = '') =>
    `<textarea data-path="${path}" rows="${rows}" class="${cls}" ${attrs}>${esc(getPath(course, path) ?? '')}</textarea>`;

  function itemFields(item, i) {
    const p = `items.${i}`;
    const mdHelp = 'Supports **bold**, `code`, ## headings, - lists and ~~~ code blocks.';
    const common = `
      <div class="field-row">
        ${field('Title', input(`${p}.title`, 'maxlength="120" required data-title="' + i + '"'))}
        ${field('Minutes', input(`${p}.minutes`, 'type="number" min="1" max="600" data-type="int" class="input-narrow"'))}
      </div>`;
    if (item.type === 'lesson') {
      return common + field('Lesson text', area(`${p}.body`, 10), mdHelp);
    }
    if (item.type === 'task') {
      return common
        + field('Instructions', area(`${p}.body`, 8), mdHelp)
        + field('What students should write about', area(`${p}.task`, 2), 'Students write a short response, then mark the activity complete.');
    }
    if (item.type === 'quiz') {
      return common
        + field('Introduction (optional)', area(`${p}.body`, 2))
        + `<div class="questions">${(item.questions || []).map((q, qi) => `
          <fieldset class="question">
            <legend>Question ${qi + 1}</legend>
            ${field('Question', area(`${p}.questions.${qi}.prompt`, 2))}
            <div class="field-label">Answer choices <span class="muted">(select the correct one)</span></div>
            ${q.choices.map((ch, ci) => `
              <div class="choice-row">
                <input type="radio" name="ans-${i}-${qi}" data-path="${p}.questions.${qi}.answer" data-type="int" value="${ci}" ${q.answer === ci ? 'checked' : ''} aria-label="Choice ${ci + 1} is correct">
                <input data-path="${p}.questions.${qi}.choices.${ci}" value="${esc(ch)}" placeholder="Choice ${ci + 1}" aria-label="Choice ${ci + 1}">
                <button type="button" class="icon-btn icon-sm" data-act="del-choice" data-i="${i}" data-q="${qi}" data-c="${ci}" aria-label="Remove choice ${ci + 1}" ${q.choices.length <= 2 ? 'disabled' : ''}>✕</button>
              </div>`).join('')}
            ${q.choices.length < 8 ? `<button type="button" class="btn btn-ghost btn-sm" data-act="add-choice" data-i="${i}" data-q="${qi}">+ Add choice</button>` : ''}
            ${field('Explanation shown after answering (optional)', area(`${p}.questions.${qi}.explanation`, 2))}
            <button type="button" class="btn btn-ghost btn-sm danger" data-act="del-question" data-i="${i}" data-q="${qi}" ${item.questions.length <= 1 ? 'disabled' : ''}>Remove question</button>
          </fieldset>`).join('')}
        </div>
        <button type="button" class="btn btn-sm" data-act="add-question" data-i="${i}">+ Add question</button>`;
    }
    // code
    return common
      + field('Language', `<select data-path="${p}.lang"><option value="html" ${item.lang === 'html' ? 'selected' : ''}>HTML & CSS (live preview)</option><option value="js" ${item.lang === 'js' ? 'selected' : ''}>JavaScript (console)</option></select>`)
      + field('Lesson text', area(`${p}.body`, 8), mdHelp)
      + field('Task', area(`${p}.task`, 2), 'What the student must do. Shown in a highlighted box.')
      + field('Starter code', area(`${p}.starter`, 5, 'mono'))
      + field('Solution', area(`${p}.solution`, 5, 'mono'), 'Students can reveal this if they get stuck.')
      + field('Hint', input(`${p}.hint`, 'maxlength="2000"'))
      + `<div class="field-label">Automatic checks</div>
        <p class="muted small">Each test is a JavaScript expression that must be true. HTML: it runs inside the preview page (<code>document</code>, <code>getComputedStyle</code>…). JavaScript: it runs after the student's code and can use their variables, <code>__logs</code> (printed lines), <code>__code</code> (source text) and <code>__eq(a, b)</code> (deep equality).</p>
        ${(item.checks || []).map((c, k) => `
          <div class="check-row">
            <input data-path="${p}.checks.${k}.label" value="${esc(c.label)}" placeholder="What students see, e.g. Logs Hello" aria-label="Check ${k + 1} label">
            <input class="mono" data-path="${p}.checks.${k}.test" value="${esc(c.test)}" placeholder="e.g. __logs.includes('Hello')" aria-label="Check ${k + 1} test">
            <button type="button" class="icon-btn icon-sm" data-act="del-check" data-i="${i}" data-k="${k}" aria-label="Remove check ${k + 1}" ${item.checks.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>`).join('')}
        <div class="row-gap">
          <button type="button" class="btn btn-sm" data-act="add-check" data-i="${i}">+ Add check</button>
          <button type="button" class="btn btn-sm" data-act="test-checks" data-i="${i}">▶ Test checks against the solution</button>
          <span class="small" id="test-result-${i}" role="status"></span>
        </div>`;
  }

  function itemHTML(item, i) {
    const t = ITEM_TYPES[item.type];
    const uid = item.id;
    return `
      <details class="ed-item" data-uid="${esc(uid)}" ${open.has(uid) ? 'open' : ''}>
        <summary>
          <span class="ed-item-num">${i + 1}</span>
          <span class="ed-item-type" title="${esc(t.label)}">${t.icon}</span>
          <span class="ed-item-title" id="sum-title-${i}">${esc(item.title || `Untitled ${t.label.toLowerCase()}`)}</span>
          <span class="muted small">${esc(t.label)} · ${Number(item.minutes) || 0} min</span>
          <span class="ed-item-tools">
            <button type="button" class="icon-btn icon-sm" data-act="up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn icon-sm" data-act="down" data-i="${i}" aria-label="Move down" ${i === course.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn icon-sm" data-act="del-item" data-i="${i}" aria-label="Remove">✕</button>
          </span>
        </summary>
        <div class="ed-item-body">${itemFields(item, i)}</div>
      </details>`;
  }

  function renderItems() {
    $('#ed-items').innerHTML = course.items.length
      ? course.items.map(itemHTML).join('')
      : '<p class="empty-card">No content yet. Add a lesson, quiz or activity below.</p>';
    updateHead();
  }

  function renderThumb() {
    $('#ed-thumb').innerHTML = thumbHTML(course, 'thumb thumb-edit');
    $('#ed-thumb-remove').hidden = !course.thumbnail;
  }

  app.innerHTML = `
    <div class="page editor-page">
      <a class="back-link" href="#/admin">← All courses</a>
      <div class="page-head">
        <div>
          <h1>${courseId ? 'Edit course' : 'New course'}</h1>
          <div id="ed-status" class="pill-row"></div>
        </div>
        <div class="row-gap" id="ed-actions">
          <button class="btn btn-ghost danger" id="ed-delete" type="button">Delete</button>
          <button class="btn btn-ghost" id="ed-unpublish" type="button">Unpublish</button>
          <button class="btn" id="ed-save" type="button">Save draft</button>
          <button class="btn btn-primary" id="ed-publish" type="button">Publish</button>
        </div>
      </div>
      <p id="ed-msg" class="ed-msg" role="alert"></p>

      <section class="ed-card">
        <h2>Course details</h2>
        <div class="ed-details">
          <div>
            ${field('Title', input('title', 'maxlength="120" placeholder="e.g. Fractions Made Simple"'))}
            ${field('Description', area('description', 3, '', 'maxlength="2000" placeholder="What will students learn?"'))}
            <div class="field-row">
              ${field('Subject', `<select data-path="subject">${Object.entries(SUBJECTS).map(([k, v]) => `<option value="${k}" ${course.subject === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`)}
              ${field('Difficulty', `<select data-path="difficulty">${Object.entries(DIFFICULTIES).map(([k, v]) => `<option value="${k}" ${course.difficulty === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
              ${field('Icon', input('icon', 'maxlength="4" class="input-narrow" aria-describedby="icon-help"'), '<span id="icon-help">An emoji</span>')}
            </div>
          </div>
          <div class="thumb-field">
            <span class="field-label">Thumbnail</span>
            <div id="ed-thumb"></div>
            <div class="row-gap">
              <label class="btn btn-sm">Upload image<input type="file" id="ed-thumb-file" accept="image/*" hidden></label>
              <button type="button" class="btn btn-ghost btn-sm" id="ed-thumb-remove">Remove</button>
            </div>
            <small>Without an image, a tile is made from the icon and subject color.</small>
          </div>
        </div>
      </section>

      <section class="ed-card">
        <div class="ed-section-head">
          <h2>Lessons, quizzes & activities</h2>
          <span class="muted small" id="ed-count"></span>
        </div>
        <div id="ed-items"></div>
        <div class="add-row">
          <span class="muted small">Add:</span>
          ${Object.entries(ITEM_TYPES).map(([type, t]) => `<button type="button" class="btn btn-sm" data-act="add" data-type="${type}">${t.icon} ${t.label}</button>`).join('')}
        </div>
      </section>
    </div>`;

  renderThumb();
  renderItems();

  const page = $('.editor-page');

  // Text fields write straight into the course object.
  page.addEventListener('input', (e) => {
    const el = e.target;
    const path = el.dataset.path;
    if (!path) return;
    if (el.type === 'radio' && !el.checked) return;
    let value = el.value;
    if (el.dataset.type === 'int') value = Math.max(0, parseInt(value, 10) || 0);
    setPath(course, path, value);
    if (el.dataset.title != null) $(`#sum-title-${el.dataset.title}`).textContent = value || 'Untitled';
    if (path === 'icon' || path === 'subject') renderThumb();
    markDirty();
  });
  page.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName === 'SELECT' && el.dataset.path) {
      setPath(course, el.dataset.path, el.value);
      if (/^items\.\d+\.lang$/.test(el.dataset.path)) renderItems();
      if (el.dataset.path === 'subject') renderThumb();
      markDirty();
    }
  });
  page.addEventListener('toggle', (e) => {
    const d = e.target.closest?.('details.ed-item');
    if (!d) return;
    if (d.open) open.add(d.dataset.uid); else open.delete(d.dataset.uid);
  }, true);

  // Structural edits re-render the item list.
  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    e.preventDefault(); // buttons inside <summary> must not toggle it
    const i = Number(btn.dataset.i);
    const item = course.items[i];
    const act = btn.dataset.act;
    if (act === 'add') {
      const type = btn.dataset.type;
      const newItem = { id: `${slugify(type)}-${newId()}`, type, title: '', ...NEW_ITEM[type]() };
      course.items.push(newItem);
      open.add(newItem.id);
      renderItems();
      markDirty();
      $(`details[data-uid="${newItem.id}"] input[data-title]`)?.focus();
      return;
    }
    if (act === 'test-checks') return testChecks(item, i);
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      [course.items[i], course.items[j]] = [course.items[j], course.items[i]];
    } else if (act === 'del-item') {
      if (!confirm(`Remove "${item.title || 'this item'}"? Students who completed it keep their XP until you publish.`)) return;
      course.items.splice(i, 1);
    } else if (act === 'add-question') {
      item.questions.push({ prompt: '', choices: ['', ''], answer: 0, explanation: '' });
    } else if (act === 'del-question') {
      item.questions.splice(Number(btn.dataset.q), 1);
    } else if (act === 'add-choice') {
      item.questions[Number(btn.dataset.q)].choices.push('');
    } else if (act === 'del-choice') {
      const q = item.questions[Number(btn.dataset.q)];
      const c = Number(btn.dataset.c);
      q.choices.splice(c, 1);
      if (q.answer >= c && q.answer > 0) q.answer--;
    } else if (act === 'add-check') {
      item.checks.push({ label: '', test: '' });
    } else if (act === 'del-check') {
      item.checks.splice(Number(btn.dataset.k), 1);
    } else {
      return;
    }
    renderItems();
    markDirty();
  });

  async function testChecks(item, i) {
    const out = $(`#test-result-${i}`);
    out.textContent = 'Running…';
    out.className = 'small';
    let res;
    if (item.lang === 'html') {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.hidden = true;
      document.body.appendChild(frame);
      res = await ctx.runners.runWeb(frame, item.solution, item.checks);
      frame.remove();
    } else {
      res = await ctx.runners.runJS(item.solution, item.checks, () => {});
    }
    if (!res.results) {
      out.textContent = '⚠ The solution has an error or timed out.';
      out.className = 'small text-bad';
      return;
    }
    const failing = item.checks.filter((_, k) => !res.results[k]).map((c) => c.label || 'Unnamed check');
    out.textContent = failing.length
      ? `✕ ${failing.length} of ${item.checks.length} fail with the solution: ${failing.join(', ')}`
      : `✓ All ${item.checks.length} checks pass with the solution`;
    out.className = failing.length ? 'small text-bad' : 'small text-ok';
  }

  $('#ed-thumb-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      course.thumbnail = await resizeImage(file);
      renderThumb();
      markDirty();
    } catch (err) {
      message('bad', err.message);
    }
  });
  $('#ed-thumb-remove').addEventListener('click', () => {
    course.thumbnail = '';
    renderThumb();
    markDirty();
  });

  async function withBusy(fn) {
    if (busy) return;
    busy = true;
    updateHead();
    try {
      await fn();
    } catch (err) {
      message('bad', err.offline ? "You're offline. Your changes are still here; save again once you reconnect." : err.message);
    } finally {
      busy = false;
      if (!ctx.isStale()) updateHead();
    }
  }

  async function save() {
    if (!meta) {
      meta = await api.admin.create(course);
      courseId = meta.id;
      history.replaceState(null, '', `#/admin/edit/${courseId}`);
      ctx.rememberHash();
      $('.editor-page h1').textContent = 'Edit course';
    } else {
      meta = await api.admin.save(courseId, course);
    }
    dirty = false;
  }

  $('#ed-save').addEventListener('click', () => withBusy(async () => {
    await save();
    message('ok', meta.status === 'published'
      ? 'Draft saved. Students still see the published version until you publish again.'
      : 'Draft saved. It stays hidden from students until you publish it.');
  }));

  $('#ed-publish').addEventListener('click', () => withBusy(async () => {
    if (dirty || !meta) await save();
    const before = meta.version;
    meta = await api.admin.publish(courseId);
    ctx.onCatalogChanged();
    message('ok', meta.version === before
      ? 'Already up to date. Nothing new to publish.'
      : `Published version ${meta.version}. Students will see it next time they're online, and downloaded copies will show an update.`);
    toast('🚀 Course published');
  }));

  $('#ed-unpublish').addEventListener('click', () => withBusy(async () => {
    if (!confirm('Unpublish this course? Students will no longer see it. Your draft is kept.')) return;
    meta = await api.admin.unpublish(courseId);
    ctx.onCatalogChanged();
    message('ok', 'Unpublished. The course is a draft again.');
  }));

  $('#ed-delete').addEventListener('click', () => withBusy(async () => {
    if (!confirm(`Delete "${course.title || 'this course'}" for everyone? This cannot be undone.`)) return;
    await api.admin.remove(courseId);
    dirty = false;
    ctx.onCatalogChanged();
    toast('Course deleted');
    location.hash = '#/admin';
  }));
}
