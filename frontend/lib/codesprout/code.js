// Code editor, sandboxed code runners, console view and output tabs.
// Learner code runs only in the browser: JavaScript in a Web Worker with a 3-second
// timeout, HTML in a sandboxed iframe. Nothing is sent to the server to execute.
import { $, esc } from './util';

export function createEditor(host, { value, label, onChange, onRun }) {
  host.classList.add('editor');
  host.innerHTML = `<div class="gutter" aria-hidden="true"></div><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="${esc(label)}"></textarea>`;
  const gutter = $('.gutter', host);
  const ta = $('textarea', host);
  ta.value = value;
  let escaped = false;

  const updateGutter = () => {
    const n = ta.value.split('\n').length;
    let s = '';
    for (let i = 1; i <= n; i++) s += i + '\n';
    gutter.textContent = s;
    gutter.scrollTop = ta.scrollTop;
  };
  const insert = (text) => {
    ta.focus();
    // execCommand keeps the browser's undo history; fall back if unsupported.
    if (!document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  };

  ta.addEventListener('input', () => { updateGutter(); onChange?.(ta.value); });
  ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escaped = true; return; } // next Tab leaves the editor
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun?.(); return; }
    if (e.key === 'Tab' && !escaped) {
      e.preventDefault();
      if (e.shiftKey) {
        const start = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        const spaces = ta.value.slice(start, start + 2).match(/^ {0,2}/)[0].length;
        if (spaces) {
          const caret = ta.selectionStart;
          ta.setSelectionRange(start, start + spaces);
          insert('');
          ta.setSelectionRange(Math.max(start, caret - spaces), Math.max(start, caret - spaces));
        }
      } else {
        insert('  ');
      }
      return;
    }
    escaped = false;
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const pos = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
      const indent = ta.value.slice(lineStart, pos).match(/^\s*/)[0];
      const before = ta.value[pos - 1];
      const after = ta.value[ta.selectionEnd];
      const opens = before !== undefined && '{[('.includes(before);
      if (opens && after !== undefined && '}])'.includes(after)) {
        insert('\n' + indent + '  \n' + indent);
        const caret = pos + 1 + indent.length + 2;
        ta.setSelectionRange(caret, caret);
      } else {
        insert('\n' + indent + (opens ? '  ' : ''));
      }
    }
  });
  updateGutter();

  return {
    get value() { return ta.value; },
    set value(v) { ta.value = v; updateGutter(); onChange?.(v); },
    focus() { ta.focus(); },
  };
}

// Shared value formatter injected into sandboxes (kept on a single line).
const FMT_SRC = "function __fmt(v,top,depth){top=top!==false;depth=depth||0;if(typeof v==='string')return top?v:JSON.stringify(v);if(v===undefined)return 'undefined';if(v===null)return 'null';if(typeof v==='function')return '[Function '+(v.name||'anonymous')+']';if(typeof v==='bigint')return v+'n';if(typeof v==='symbol')return v.toString();if(v instanceof Error)return v.name+': '+v.message;if(typeof v!=='object')return String(v);if(depth>3)return Array.isArray(v)?'[…]':'{…}';try{if(Array.isArray(v))return '['+v.map(function(x){return __fmt(x,false,depth+1)}).join(', ')+']';var ks=Object.keys(v);if(!ks.length)return '{}';return '{ '+ks.map(function(k){return k+': '+__fmt(v[k],false,depth+1)}).join(', ')+' }'}catch(e){return String(v)}}";

function compileChecks(checks) {
  return (checks || []).map((c) => `(function(){try{return !!(${c.test})}catch(e){return false}})()`).join(',');
}

/** Code runners. Returns { runJS, runWeb, dispose }. */
export function createRunners() {
  // Message bus for sandboxed iframes: each run gets a unique token.
  const listeners = new Map();
  const onMessage = (e) => {
    const d = e.data;
    if (d && typeof d === 'object' && d.__cs && listeners.has(d.__cs)) listeners.get(d.__cs)(d);
  };
  window.addEventListener('message', onMessage);
  const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /**
   * Run plain JavaScript in an isolated Web Worker (falls back to a sandboxed iframe).
   * Calls onLog(level, text) for console output; resolves { results, error, timedOut }.
   */
  function runJS(code, checks, onLog) {
    const prefix = [
      FMT_SRC,
      'var __logs=[];var __code=' + JSON.stringify(code) + ';',
      'function __eq(a,b){return JSON.stringify(a)===JSON.stringify(b)}',
      "['log','info','warn','error','debug'].forEach(function(l){console[l]=function(){var s=Array.prototype.map.call(arguments,function(a){return __fmt(a)}).join(' ');if(l!=='error'&&l!=='warn')__logs.push(s);__post({t:'log',level:l,s:s})}});",
      'try {',
    ];
    const PREFIX_LINES = prefix.length + 1; // +1 for the __post line added below
    const body = prefix.join('\n') + '\n' + code + `\n;__post({t:'done',results:[${compileChecks(checks)}]});\n} catch (__e) { __post({t:'error', s: (__e && __e.name ? __e.name + ': ' + __e.message : String(__e)), stack: String(__e && __e.stack || '')}); __post({t:'done', results:null}); }`;

    const lineOf = (stack) => {
      const m = String(stack || '').match(/(?:blob:[^\s)]*|about:srcdoc|<anonymous>):(\d+):\d+/);
      const n = m ? Number(m[1]) - PREFIX_LINES : 0;
      return n > 0 ? ` (line ${n})` : '';
    };

    return new Promise((resolve) => {
      let finished = false, cleanup = () => {};
      const finish = (res) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        setTimeout(cleanup, 400); // allow a moment for trailing async logs
        resolve(res);
      };
      const handle = (d) => {
        if (d.t === 'log') onLog(d.level, d.s);
        else if (d.t === 'error') { onLog('error', d.s + lineOf(d.stack)); finish({ results: null, error: true }); }
        else if (d.t === 'done') finish({ results: d.results, error: !d.results });
      };
      const timer = setTimeout(() => {
        cleanup();
        onLog('error', 'Your code ran for too long and was stopped. Do you have a loop that never ends?');
        finish({ results: null, error: true, timedOut: true });
      }, 3000);

      try {
        const url = URL.createObjectURL(new Blob(['var __post=function(m){postMessage(m)};\n' + body], { type: 'text/javascript' }));
        const worker = new Worker(url);
        cleanup = () => { worker.terminate(); URL.revokeObjectURL(url); };
        worker.onmessage = (e) => handle(e.data);
        worker.onerror = (e) => {
          e.preventDefault();
          const n = (e.lineno || 0) - PREFIX_LINES;
          onLog('error', (e.message || 'Error').replace(/^Uncaught /, '') + (n > 0 ? ` (line ${n})` : ''));
          finish({ results: null, error: true });
        };
      } catch {
        // Fallback: sandboxed iframe (e.g. if workers are blocked).
        const token = newToken();
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.hidden = true;
        const post = `var __post=function(m){m.__cs=${JSON.stringify(token)};parent.postMessage(m,'*')};window.onerror=function(msg,s,line){__post({t:'error',s:String(msg).replace(/^Uncaught /,''),stack:'about:srcdoc:'+(line+1)+':0'});return true};`;
        frame.srcdoc = `<script>${post}<\/script><script>\n${body.replace(/<\/script/gi, '<\\/script')}<\/script>`;
        listeners.set(token, handle);
        cleanup = () => { listeners.delete(token); frame.remove(); };
        document.body.appendChild(frame);
      }
    });
  }

  /** HTML document for a sandboxed preview iframe, with console capture and optional checks. */
  function buildWebDoc(code, token, checks) {
    const head = `<script>(function(){var T=${JSON.stringify(token)};${FMT_SRC};window.__csPost=function(m){m.__cs=T;parent.postMessage(m,'*')};['log','info','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){var s=Array.prototype.map.call(arguments,function(a){return __fmt(a)}).join(' ');window.__csPost({t:'log',level:l,s:s});o.apply(console,arguments)}});window.addEventListener('error',function(e){window.__csPost({t:'log',level:'error',s:String(e.message).replace(/^Uncaught /,'')+(e.lineno?' (line '+e.lineno+')':'')})});})();<\/script>`;
    const tail = checks
      ? `<script>document.addEventListener('DOMContentLoaded',function(){window.__csPost({t:'done',results:[${compileChecks(checks)}]})});<\/script>`
      : '';
    let doc = code;
    const m = doc.match(/<head[^>]*>/i) || doc.match(/<html[^>]*>/i) || doc.match(/^\s*<!doctype[^>]*>/i);
    if (m) doc = doc.slice(0, m.index + m[0].length) + head + doc.slice(m.index + m[0].length);
    else doc = head + doc;
    return doc + tail;
  }

  function runWeb(frame, code, checks, onLog) {
    const token = newToken();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { listeners.delete(token); resolve({ results: null }); }, 4000);
      listeners.set(token, (d) => {
        if (d.t === 'log') onLog?.(d.level, d.s);
        else if (d.t === 'done') { clearTimeout(timer); resolve({ results: d.results }); }
      });
      if (!checks) { clearTimeout(timer); resolve({ results: null }); }
      // Old runs' tokens are dropped so stale messages are ignored.
      if (frame.__cstoken) listeners.delete(frame.__cstoken);
      frame.__cstoken = token;
      frame.srcdoc = buildWebDoc(code, token, checks);
    });
  }

  return { runJS, runWeb, dispose: () => window.removeEventListener('message', onMessage) };
}

export function consoleView(host) {
  let count = 0;
  const empty = (msg) => { host.innerHTML = `<div class="console"><div class="empty">${esc(msg)}</div></div>`; count = 0; };
  return {
    clear(msg = 'Console output will appear here.') { empty(msg); },
    log(level, text) {
      if (count === 0) host.innerHTML = '<div class="console"></div>';
      const line = document.createElement('div');
      line.className = 'line ' + (level === 'error' ? 'error' : level === 'warn' ? 'warn' : '');
      line.textContent = text;
      $('.console', host).appendChild(line);
      if (++count > 500) $('.console', host).firstChild.remove();
      host.scrollTop = host.scrollHeight;
    },
    get count() { return count; },
  };
}

export function tabs(container, onSelect) {
  const buttons = [...container.querySelectorAll('.output-tabs button')];
  const select = (name) => {
    for (const b of buttons) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on);
      container.querySelector(`[data-panel="${b.dataset.tab}"]`).classList.toggle('is-hidden', !on);
    }
    onSelect?.(name);
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.tab)));
  return select;
}
