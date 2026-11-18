/* לו"ז צוות · משלחת אדוות לונדון
   אין כאן שום נתון. הנתונים יושבים בשרת, נעולים, ונשלפים רק עם קוד אישי. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  var SB = 'https://ndrhiikczkbosentclnh.supabase.co';
  var KEY = 'sb_publishable_EckoZz1eIoRjjjQ9XhXhzA_EpuKVWQG';
  var TZ = 'Europe/London';
  var LS_KEY = 'ops-k', LS_CACHE = 'ops-cache', LS_VIEW = 'ops-view';
  var POLL_MS = 15000;
  var LOCAL = window.OPS_LOCAL || null; // תצוגה מקומית בלבד (הפקת PDF), לא קיים באתר

  var S = { code: null, me: null, days: [], items: [], rev: 0, day: null, view: 'ops', editing: false, offline: false, dirty: false };
  var $app = document.getElementById('app');
  var $print = document.getElementById('print');

  // ── עזרים ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function toast(msg) {
    var t = h('<div class="toast" role="status">' + esc(msg) + '</div>');
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function londonNow() {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + '-' + o.month + '-' + o.day, hm: (o.hour === '24' ? '00' : o.hour) + ':' + o.minute };
  }
  function toMin(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fromMin(n) { n = ((n % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function dayLabel(d) { return d.title || d.date; }
  function shortDay(d) {
    var m = /^(\S+ \S+)\s+(.*)$/.exec(d.title || ''); // "יום שני 23.11"
    return m ? { a: m[1].replace('יום ', ''), b: m[2] } : { a: d.date, b: '' };
  }

  // ── שרת ──
  function rpc(fn, args) {
    if (LOCAL) return Promise.reject(new Error('local'));
    return fetch(SB + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ p_code: S.code }, args || {}))
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || ('http ' + r.status)); e.denied = j && j.code === '28000'; throw e; }
        return j;
      });
    });
  }

  function applyData(d) {
    S.me = d.me; S.days = d.days || []; S.items = d.items || []; S.rev = d.rev || 0;
  }

  function load(silent) {
    return rpc('ops_get').then(function (d) {
      applyData(d); S.offline = false;
      lsSet(LS_CACHE, JSON.stringify(d));
      if (!S.day) S.day = pickDay();
      render();
    }).catch(function (e) {
      if (e.denied) { logout(true); return; }
      S.offline = true;
      if (!silent) render();
    });
  }

  function poll() {
    if (LOCAL || !S.code || document.hidden) return;
    rpc('ops_rev').then(function (rev) {
      if (S.offline) { S.offline = false; render(); }
      if (rev !== S.rev) {
        if (S.editing) { S.dirty = true; return; }
        load(true);
      }
    }).catch(function (e) {
      if (e.denied) { logout(true); return; }
      if (!S.offline) { S.offline = true; render(); }
    });
  }

  // ── סדר הפריטים ──
  function dayItems(date) {
    var list = S.items.filter(function (i) { return i.day === date && !i.deleted; })
      .sort(function (a, b) { return a.sort - b.sort; });
    var last = null;
    list.forEach(function (i) { var m = toMin(i.t); if (m != null) last = m; i._eff = (m != null ? m : last); });
    function band(i) { return i.pre ? 0 : i.endp ? 2 : 1; }
    return list.slice().sort(function (a, b) {
      var d = band(a) - band(b); if (d) return d;
      var ea = a._eff == null ? -1 : a._eff, eb = b._eff == null ? -1 : b._eff;
      return (ea - eb) || (a.sort - b.sort);
    });
  }
  function groups(list) {
    var out = [], cur = null;
    list.forEach(function (i) {
      if (cur && (i.t ? cur.t === i.t : cur.untimed)) { cur.items.push(i); return; }
      cur = { t: i.t, untimed: !i.t, items: [i] }; out.push(cur);
    });
    return out;
  }
  function pickDay() {
    var now = londonNow(), dates = S.days.map(function (d) { return d.date; });
    if (dates.indexOf(now.date) >= 0) return now.date;
    if (now.date < dates[0]) return dates[0];
    return dates[dates.length - 1];
  }
  function liveState(date) {
    var now = londonNow(); if (now.date !== date) return null;
    var nm = toMin(now.hm);
    var ev = dayItems(date).filter(function (i) { return !i.pre && !i.endp && i.kind === 'event' && toMin(i.t) != null; });
    var cur = null, next = null;
    ev.forEach(function (i) { var m = toMin(i.t); if (m <= nm) cur = i; else if (!next || m < toMin(next.t)) next = next || i; });
    return { now: now.hm, nm: nm, cur: cur, next: next };
  }

  // ── מסכים ──
  function renderLogin(msg) {
    $app.innerHTML = '';
    var el = h('<main class="login"><form class="login-box" autocomplete="off">' +
      '<h1>לו"ז צוות</h1><p>כניסה עם הקוד האישי שקיבלתם מניר.</p>' +
      '<label for="code" class="hidden">קוד אישי</label>' +
      '<input id="code" name="code" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="24" required>' +
      '<div class="err" role="alert">' + esc(msg || '') + '</div>' +
      '<button class="btn solid" style="width:100%;justify-content:center;margin-top:6px;padding:12px">כניסה</button>' +
      '<div class="lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>גישה לצוות בלבד</div>' +
      '</form></main>');
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = cleanCode(el.querySelector('input').value);
      if (c.length < 12) { el.querySelector('.err').textContent = 'הקוד קצר מדי'; return; }
      S.code = c;
      rpc('ops_get').then(function (d) {
        lsSet(LS_KEY, c); applyData(d); lsSet(LS_CACHE, JSON.stringify(d)); S.day = pickDay(); render();
      }).catch(function (e2) {
        S.code = null;
        el.querySelector('.err').textContent = e2.denied ? 'הקוד לא מוכר' : 'אין חיבור לשרת. נסו שוב בעוד רגע';
      });
    });
    $app.appendChild(el);
    el.querySelector('input').focus();
  }

  function logout(revoked) {
    lsDel(LS_KEY); lsDel(LS_CACHE);
    S.code = null; S.me = null; S.days = []; S.items = [];
    renderLogin(revoked ? 'הקוד הזה כבר לא פעיל' : '');
  }

  function render() {
    if (!S.me) { renderLogin(); return; }
    var day = S.days.filter(function (d) { return d.date === S.day; })[0] || S.days[0];
    if (!day) { $app.innerHTML = '<div class="wrap">אין ימים בלו"ז</div>'; return; }
    S.day = day.date;
    var today = londonNow().date;
    var scrollY = window.scrollY;

    var tabs = S.days.map(function (d) {
      var s = shortDay(d);
      return '<button class="tab" role="tab" data-day="' + d.date + '" aria-selected="' + (d.date === S.day) + '"><b>' + esc(s.a) + (d.date === today ? '<span class="dot" title="היום"></span>' : '') + '</b>' + esc(s.b) + (d.published ? ' <span class="pubmark" title="גלוי לעמיתים">●</span>' : '') + '</button>';
    }).join('');

    var html = '<header class="top"><div class="top-row"><h1>לו"ז תפעול · לונדון</h1>' +
      (LOCAL ? '' : '<span class="who">' + esc(S.me.name) + '</span>') +
      '<button class="icon-btn" data-act="history" aria-label="היסטוריית שינויים">' + svgClock() + '</button>' +
      '<button class="icon-btn" data-act="menu" aria-label="עוד">⋯</button>' +
      '</div><nav class="tabs" role="tablist">' + tabs + '</nav></header><main class="wrap">';

    if (S.offline) html += '<div class="banner warn">אין חיבור לשרת. מוצגת הגרסה האחרונה שנשמרה בטלפון, ושינויים לא יישמרו עד שהחיבור יחזור.</div>';

    var live = liveState(day.date);
    if (live && !live.next && live.cur && live.nm - toMin(live.cur.t) > 120) live = null;
    if (live && (live.cur || live.next)) {
      html += '<section class="now" aria-label="עכשיו" aria-live="polite"><div class="now-label"><span class="pulse"></span>עכשיו · ' + live.now + ' בלונדון</div>' +
        (live.cur ? '<div class="now-what">' + esc(live.cur.what) + '</div>' : '<div class="now-what">עוד לא התחלנו</div>') +
        (live.next ? '<div class="now-next">הבא: <b>' + live.next.t + '</b> <span class="bidi">' + esc(live.next.what) + '</span> · בעוד ' + mins(toMin(live.next.t) - live.nm) + '</div>' : '<div class="now-next">זה האירוע האחרון לפי הלו"ז</div>') +
        '</section>';
    }

    html += '<div class="bar"><div class="seg" role="group" aria-label="תצוגה">' +
      '<button data-view="ops" aria-pressed="' + (S.view === 'ops') + '">הכול</button>' +
      '<button data-view="events" aria-pressed="' + (S.view === 'events') + '">רק לו"ז</button>' +
      '<button data-view="pub" aria-pressed="' + (S.view === 'pub') + '">כמו שהעמיתים רואים</button></div>' +
      '<span class="spacer"></span>' +
      '<button class="btn solid" data-act="image">' + svgImg() + 'תמונה לעמיתים</button>' +
      '<button class="btn ghost" data-act="print">' + svgPrint() + 'הדפסה</button></div>';

    if (S.view === 'pub') html += '<div class="banner info">תצוגה בלבד: כך זה ייראה בתמונה לעמיתים. לעריכה חוזרים ל"הכול".</div>';
    html += '<section class="dayhead"><h2>' + esc(dayLabel(day)) + '</h2>' +
      (day.owner ? '<div class="owner">מחזיק יום: ' + esc(day.owner) + '</div>' : '') +
      (day.gear && S.view !== 'pub' ? '<div class="gear"><b>ציוד ליום:</b> <bdi>' + esc(day.gear) + '</bdi></div>' : '') +
      '<div class="pubrow"><span class="pubstate' + (day.published ? ' on' : '') + '">' + (day.published ? 'גלוי לעמיתים בקישור' : 'מוסתר מהעמיתים') + '</span>' +
      '<button class="btn' + (day.published ? ' ghost' : ' solid') + '" data-act="publish">' + (day.published ? 'הסתרה מהעמיתים' : 'פרסום לעמיתים') + '</button>' +
      (S.view !== 'pub' ? '<button class="btn ghost" data-act="editday">עריכת פרטי היום</button>' : '') + '</div></section>';

    var list = dayItems(day.date).filter(function (i) {
      if (S.view === 'events') return i.kind === 'event';
      if (S.view === 'pub') return i.pub;
      return true;
    });
    var pre = list.filter(function (i) { return i.pre; });
    var mid = list.filter(function (i) { return !i.pre && !i.endp; });
    var end = list.filter(function (i) { return i.endp; });

    if (pre.length) html += '<div class="sec-title">לפני היום</div>' + slotHtml({ t: '', untimed: true, items: pre }, live, true);
    html += '<div class="sec-title">במהלך היום</div>';
    groups(mid).forEach(function (g) { html += slotHtml(g, live); });
    if (end.length) html += '<div class="sec-title">בסוף היום</div>' + slotHtml({ t: '', untimed: true, items: end }, live, true);
    if (S.view !== 'pub') html += '<div class="add-row"><button class="btn" data-act="add" data-kind="event">+ אירוע בלו"ז</button><button class="btn ghost" data-act="add" data-kind="task">+ משימת תפעול</button></div>';
    html += '</main>';

    $app.innerHTML = html;
    if (!S.jumped && live && day.date === today) {
      S.jumped = true;
      var cs = $app.querySelector('.slot.current');
      if (cs) { cs.scrollIntoView({ block: 'center' }); scrollY = window.scrollY; }
    }
    window.scrollTo(0, scrollY);
    buildPrint();
  }

  function mins(n) { if (n < 60) return n + ' דק\''; var hh = Math.floor(n / 60), m = n % 60; return (hh === 1 ? 'שעה' : hh + ' שעות') + (m ? ' ו-' + m + ' דק\'' : ''); }

  function slotHtml(g, live, flat) {
    var cls = 'slot';
    var m = toMin(g.t);
    if (live && m != null) {
      if (live.cur && live.cur.t === g.t) cls += ' current';
      else if (m < live.nm) cls += ' past';
    }
    var time = flat ? '<div class="slot-time none"></div>' : (g.t ? '<div class="slot-time">' + g.t + '</div>' : '<div class="slot-time none">שעה חסרה</div>');
    return '<div class="' + cls + '">' + time + '<div class="slot-items">' + g.items.map(itemHtml).join('') + '</div></div>';
  }

  function itemHtml(i) {
    var pubView = S.view === 'pub';
    var what = pubView ? (i.pw || i.what) : i.what;
    var meta = [];
    if (pubView) {
      var pl = i.pl || '';
      if (pl) meta.push('<span><i>מקום</i><bdi>' + esc(pl) + '</bdi></span>');
    } else {
      if (i.where) meta.push('<span><i>מקום</i><bdi>' + esc(i.where) + '</bdi></span>');
      if (i.task) meta.push('<span><i>משימה</i><bdi>' + esc(i.task) + '</bdi></span>');
      if (i.gear) meta.push('<span><i>ציוד</i><bdi>' + esc(i.gear) + '</bdi></span>');
      if (i.note) meta.push('<span><i>הערה</i><bdi>' + esc(i.note) + '</bdi></span>');
    }
    var tags = [];
    if (!pubView) {
      if (i.pub) tags.push('<span class="tag">בלו"ז לעמיתים</span>');
      if (/להשלים|\?/.test(i.what + i.where + i.note) || (!i.t && !i.pre && !i.endp && i.kind === 'event')) tags.push('<span class="tag warn">חסר פרט</span>');
    }
    var isTask = i.kind === 'task';
    var check = isTask && !pubView ? '<button class="check" role="checkbox" aria-checked="' + !!i.done + '" aria-label="בוצע" data-done="' + i.id + '">' + (i.done ? '✓' : '') + '</button>' : '';
    return '<div class="item ' + (isTask ? 'task' : 'ev') + (i.done ? ' done' : '') + '">' + check +
      '<button class="i-body" data-edit="' + i.id + '"' + (pubView ? ' disabled' : '') + '><div class="i-what">' + esc(what) + '</div>' +
      (meta.length ? '<div class="i-meta">' + meta.join('') + '</div>' : '') +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') + '</button></div>';
  }

  // ── אירועים ──
  $app.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.day) { S.day = t.dataset.day; window.scrollTo(0, 0); render(); return; }
    if (t.dataset.view) { S.view = t.dataset.view; lsSet(LS_VIEW, S.view); render(); return; }
    if (t.dataset.done) { toggleDone(t.dataset.done); return; }
    if (t.dataset.edit) { openEditor(byId(t.dataset.edit)); return; }
    var a = t.dataset.act;
    if (a === 'add') openEditor({ day: S.day, kind: t.dataset.kind, t: '', pub: t.dataset.kind === 'event' });
    else if (a === 'editday') openDayEditor();
    else if (a === 'publish') togglePublish();
    else if (a === 'image') openImage();
    else if (a === 'print') window.print();
    else if (a === 'history') openHistory();
    else if (a === 'menu') openMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var sh = document.querySelectorAll('.sheet-bg'); if (!sh.length) return;
    var x = sh[sh.length - 1].querySelector('[data-x]'); if (x) x.click();
  });
  function byId(id) { return S.items.filter(function (i) { return i.id === id; })[0]; }

  function save(item) {
    if (LOCAL) { // תצוגה מקומית: שמירה בזיכרון בלבד
      var r0 = Object.assign({}, byId(item.id) || { id: 'l' + Date.now(), deleted: false, done: false }, item);
      var k0 = S.items.findIndex(function (x) { return x.id === r0.id; });
      if (k0 >= 0) S.items[k0] = r0; else S.items.push(r0);
      return Promise.resolve(r0);
    }
    if (S.offline) { toast('אין חיבור. השינוי לא נשמר'); return Promise.reject(new Error('offline')); }
    return rpc('ops_save_item', { p_item: item }).then(function (r) {
      var k = S.items.findIndex(function (x) { return x.id === r.id; });
      if (k >= 0) S.items[k] = r; else S.items.push(r);
      S.rev = -1; // יתעדכן בבדיקה הבאה
      return r;
    }).catch(function (e) { if (e.denied) logout(true); else toast('השמירה נכשלה. נסו שוב'); throw e; });
  }
  function toggleDone(id) {
    var i = byId(id); if (!i) return;
    i.done = !i.done; render();
    save({ id: id, done: i.done }).catch(function () { i.done = !i.done; render(); });
  }

  // ── עורך פריט ──
  function openEditor(it) {
    var isNew = !it.id;
    var dayOpts = S.days.map(function (d) { return '<option value="' + d.date + '"' + (d.date === it.day ? ' selected' : '') + '>' + esc(d.title) + '</option>'; }).join('');
    var pos = it.pre ? 'pre' : it.endp ? 'end' : 'mid';
    var el = h('<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="עריכת פריט"><form class="sheet">' +
      '<h3>' + (isNew ? (it.kind === 'task' ? 'משימת תפעול חדשה' : 'אירוע חדש') : 'עריכה') + '</h3>' +
      '<div class="field"><label for="f-what">מה קורה</label><textarea id="f-what" rows="2" required>' + esc(it.what) + '</textarea></div>' +
      '<div class="field"><label for="f-t">שעה</label><div class="time-row"><input type="time" id="f-t" value="' + esc(it.t || '') + '">' +
      '<button type="button" class="chip" data-d="-15">−15</button><button type="button" class="chip" data-d="-5">−5</button><button type="button" class="chip" data-d="5">+5</button><button type="button" class="chip" data-d="15">+15</button><button type="button" class="chip" data-d="x">בלי שעה</button></div>' +
      (isNew ? '' : '<label class="shift-row"><input type="checkbox" id="f-shift"> להזיז באותו הפרש גם את כל מה שאחרי זה באותו יום</label>') + '</div>' +
      '<div class="row2"><div class="field"><label for="f-kind">סוג</label><select id="f-kind"><option value="event"' + (it.kind !== 'task' ? ' selected' : '') + '>אירוע בלו"ז</option><option value="task"' + (it.kind === 'task' ? ' selected' : '') + '>משימת תפעול</option></select></div>' +
      '<div class="field"><label for="f-pos">מתי</label><select id="f-pos"><option value="pre"' + (pos === 'pre' ? ' selected' : '') + '>לפני היום</option><option value="mid"' + (pos === 'mid' ? ' selected' : '') + '>במהלך היום</option><option value="end"' + (pos === 'end' ? ' selected' : '') + '>בסוף היום</option></select></div></div>' +
      '<div class="field"><label for="f-where">מקום ואופן ישיבה</label><textarea id="f-where" rows="1">' + esc(it.where) + '</textarea></div>' +
      '<div class="field"><label for="f-task">משימה</label><textarea id="f-task" rows="1">' + esc(it.task) + '</textarea></div>' +
      '<div class="row2"><div class="field"><label for="f-gear">ציוד</label><textarea id="f-gear" rows="1">' + esc(it.gear) + '</textarea></div>' +
      '<div class="field"><label for="f-note">הערות</label><textarea id="f-note" rows="1">' + esc(it.note) + '</textarea></div></div>' +
      '<label class="toggle"><input type="checkbox" id="f-pub"' + (it.pub ? ' checked' : '') + '><span><b>מופיע בלו"ז לעמיתים</b><br><span class="hint">רק השעה, הניסוח והמקום שלמטה יוצאים בתמונה. שום פרט תפעולי לא יוצא.</span></span></label>' +
      '<div class="pubbox" id="pubbox"><div class="field"><label for="f-pw">ניסוח לעמיתים</label><input type="text" id="f-pw" value="' + esc(it.pw) + '" placeholder="' + esc(it.what || 'אם ריק, יופיע הניסוח שלמעלה') + '"><span class="hint">אם ריק, יופיע הניסוח של "מה קורה"</span></div>' +
      '<div class="field"><label for="f-pl">מקום לעמיתים</label><input type="text" id="f-pl" value="' + esc(it.pl) + '" placeholder="כתובת, שם מקום, או קישור מגוגל מפות"><span class="hint">בקישור לעמיתים יופיע ככפתור ניווט בגוגל מפות</span></div></div>' +
      '<div class="field"><label for="f-day">יום</label><select id="f-day">' + dayOpts + '</select></div>' +
      '<div class="sheet-actions"><button class="btn solid">שמירה</button><button type="button" class="btn ghost" data-x>ביטול</button><span class="spacer"></span>' +
      (isNew ? '' : '<button type="button" class="btn danger" data-del>מחיקה</button>') + '</div>' +
      (it.updated_by ? '<p class="hint">עודכן לאחרונה על ידי ' + esc(it.updated_by) + '</p>' : '') +
      '</form></div>');
    var $ = function (s) { return el.querySelector(s); };
    function syncPub() { $('#pubbox').classList.toggle('hidden', !$('#f-pub').checked); }
    $('#f-pub').addEventListener('change', syncPub); syncPub();
    var nAfter = isNew ? 0 : dayItems(it.day).filter(function (x) { return x.id !== it.id && !x.pre && !x.endp && toMin(x.t) != null && toMin(it.t) != null && toMin(x.t) >= toMin(it.t); }).length;
    if ($('#f-shift')) $('#f-shift').parentNode.lastChild.textContent = (nAfter === 1 ? ' להזיז באותו הפרש גם את הפריט שאחרי זה' : ' להזיז באותו הפרש גם את ' + nAfter + ' הפריטים שאחרי זה באותו יום');
    el.querySelectorAll('[data-d]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.dataset.d, inp = $('#f-t');
        if (d === 'x') { inp.value = ''; return; }
        var m = toMin(inp.value); if (m == null) m = toMin(it.t) || 9 * 60;
        inp.value = fromMin(m + (+d));
      });
    });
    function close() { el.remove(); S.editing = false; if (S.dirty) { S.dirty = false; load(true); } }
    $('[data-x]').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    if (!isNew) $('[data-del]').addEventListener('click', function () {
      if (!confirm('למחוק את הפריט? אפשר לשחזר מהיסטוריית השינויים.')) return;
      save({ id: it.id, deleted: true }).then(function () { S.items = S.items.filter(function (x) { return x.id !== it.id; }); close(); render(); toast('נמחק. אפשר לשחזר מההיסטוריה'); });
    });
    $('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = $('#f-pos').value;
      var rec = {
        id: it.id || null, day: $('#f-day').value, t: $('#f-t').value || '', kind: $('#f-kind').value,
        pre: p === 'pre', endp: p === 'end',
        what: $('#f-what').value.trim(), where: $('#f-where').value.trim(), task: $('#f-task').value.trim(),
        gear: $('#f-gear').value.trim(), note: $('#f-note').value.trim(),
        pub: $('#f-pub').checked, pw: $('#f-pw').value.trim(), pl: $('#f-pl').value.trim()
      };
      if (isNew) rec.sort = nextSort(rec.day, rec.t);
      if (!rec.what) { $('#f-what').focus(); return; }
      var shift = !isNew && $('#f-shift') && $('#f-shift').checked;
      var delta = (toMin(rec.t) != null && toMin(it.t) != null) ? toMin(rec.t) - toMin(it.t) : 0;
      var btn = $('.btn.solid'); btn.disabled = true; btn.textContent = 'שומר…';
      var after = shift && delta ? dayItems(it.day).filter(function (x) { return x.id !== it.id && !x.pre && !x.endp && toMin(x.t) != null && toMin(x.t) >= toMin(it.t); }) : [];
      save(rec).then(function () {
        return after.reduce(function (pr, x) { return pr.then(function () { return save({ id: x.id, t: fromMin(toMin(x.t) + delta) }); }); }, Promise.resolve());
      }).then(function () {
        close(); render(); toast(after.length ? 'נשמר, והוזזו עוד ' + after.length + ' פריטים' : 'נשמר');
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'שמירה';
        if (after.length) toast('ההזזה נעצרה באמצע. בדקו את השעות או בטלו מההיסטוריה');
      });
    });
    S.editing = true;
    document.body.appendChild(el);
    if (isNew) $('#f-what').focus(); else $('.btn.solid').focus({ preventScroll: true });
  }
  function nextSort(date, t) {
    var list = dayItems(date), m = toMin(t), s = 0;
    list.forEach(function (x) { if (m == null || (x._eff != null && x._eff <= m)) s = Math.max(s, x.sort); });
    return s + 5;
  }

  function togglePublish() {
    var d = S.days.filter(function (x) { return x.date === S.day; })[0];
    var on = !d.published;
    var n = dayItems(d.date).filter(function (i) { return i.pub && i.kind === 'event' && !i.pre && !i.endp; }).length;
    if (!confirm(on ? 'לפרסם את ' + d.title + ' לעמיתים? ' + n + ' פריטים יופיעו מיד בקישור של העמיתים.' : 'להסתיר את ' + d.title + ' מהעמיתים? היום ייעלם מהקישור שלהם.')) return;
    if (LOCAL) { d.published = on; render(); return; }
    rpc('ops_save_day', { p_day: { date: d.date, published: on } })
      .then(function (r) { S.days = S.days.map(function (x) { return x.date === r.date ? r : x; }); render(); toast(on ? 'פורסם לעמיתים' : 'הוסתר מהעמיתים'); })
      .catch(function (e) { if (e.denied) logout(true); else toast('לא נשמר. נסו שוב'); });
  }
  function openDayEditor() {
    var d = S.days.filter(function (x) { return x.date === S.day; })[0];
    var el = h('<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="פרטי היום"><form class="sheet"><h3>פרטי היום</h3>' +
      '<div class="field"><label for="d-title">כותרת</label><input type="text" id="d-title" value="' + esc(d.title) + '"></div>' +
      '<div class="field"><label for="d-owner">מחזיק יום</label><input type="text" id="d-owner" value="' + esc(d.owner) + '"></div>' +
      '<div class="field"><label for="d-gear">ציוד ליום</label><textarea id="d-gear" rows="4">' + esc(d.gear) + '</textarea><span class="hint">להפריד בנקודה אמצעית · או בשורות</span></div>' +
      '<div class="sheet-actions"><button class="btn solid">שמירה</button><button type="button" class="btn ghost" data-x>ביטול</button></div></form></div>');
    function close() { el.remove(); S.editing = false; }
    el.querySelector('[data-x]').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      rpc('ops_save_day', { p_day: { date: d.date, title: el.querySelector('#d-title').value.trim(), owner: el.querySelector('#d-owner').value.trim(), gear: el.querySelector('#d-gear').value.trim() } })
        .then(function (r) { S.days = S.days.map(function (x) { return x.date === r.date ? r : x; }); close(); render(); toast('נשמר'); })
        .catch(function () { toast('השמירה נכשלה'); });
    });
    S.editing = true; document.body.appendChild(el);
  }

  // ── היסטוריה ──
  var ACT = { add: 'הוסיף', edit: 'ערך', delete: 'מחק', done: 'סימן כבוצע', undone: 'ביטל סימון', day: 'ערך את פרטי היום', publish: 'פרסם לעמיתים', unpublish: 'הסתיר מהעמיתים' };
  function openHistory() {
    var el = h('<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="היסטוריה"><div class="sheet"><h3>שינויים אחרונים</h3><div class="hist">טוען…</div><div class="sheet-actions"><button class="btn ghost" data-x>סגירה</button></div></div></div>');
    function close() { el.remove(); S.editing = false; if (S.dirty) { S.dirty = false; load(true); } }
    el.querySelector('[data-x]').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    S.editing = true; document.body.appendChild(el);
    rpc('ops_history').then(function (rows) {
      var box = el.querySelector('.hist');
      if (!rows.length) { box.textContent = 'עוד אין שינויים מאז הייבוא מהאקסל.'; return; }
      box.innerHTML = rows.map(function (r) {
        var when = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(r.at));
        return '<div class="hist-row"><div class="h-txt"><b>' + esc(r.staff) + '</b> ' + (ACT[r.action] || r.action) + ': <span class="bidi">' + esc(r.summary || '') + '</span><small>' + when + ' (שעון לונדון)</small></div>' +
          (r.can_undo || r.action === 'add' ? '<button class="btn ghost" data-undo="' + r.id + '">ביטול</button>' : '') + '</div>';
      }).join('');
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-undo]'); if (!b) return;
        b.disabled = true;
        rpc('ops_undo', { p_log_id: +b.dataset.undo }).then(function () { toast('שוחזר'); S.dirty = false; close(); load(true); })
          .catch(function () { b.disabled = false; toast('לא הצלחנו לשחזר'); });
      });
    }).catch(function () { el.querySelector('.hist').textContent = 'אין חיבור לשרת.'; });
  }

  function openMenu() {
    var el = h('<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="תפריט"><div class="sheet"><h3>' + esc(S.me.name) + '</h3>' +
      '<p class="hint">הקוד האישי שלך שמור רק בטלפון הזה. בטלפון משותף או אם הטלפון אבד, צאו כאן וניר יחליף את הקוד.</p>' +
      '<div class="sheet-actions"><button class="btn danger" data-out>יציאה מהטלפון הזה</button><button class="btn ghost" data-x>סגירה</button></div></div></div>');
    el.querySelector('[data-x]').addEventListener('click', function () { el.remove(); });
    el.querySelector('[data-out]').addEventListener('click', function () { el.remove(); logout(false); });
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
  }

  // ── תמונה לעמיתים (ציור על קנבס, בלי ספריות ובלי שליחה לשום שרת) ──
  var logoImg = new Image(); logoImg.src = 'assets/advot-logo-white.png';
  function imageDay() {
    var now = londonNow(), dates = S.days.map(function (d) { return d.date; });
    // אחרי 14:00 ביום של הטיול: מחר. אחרת: היום הנבחר
    var i = dates.indexOf(now.date);
    if (i >= 0 && toMin(now.hm) >= 14 * 60 && i + 1 < dates.length) return dates[i + 1];
    if (now.date < dates[0] && S.day === dates[0]) return dates[0];
    return S.day;
  }
  function openImage() {
    var date = imageDay();
    var opts = S.days.map(function (d) { return '<option value="' + d.date + '"' + (d.date === date ? ' selected' : '') + '>' + esc(d.title) + '</option>'; }).join('');
    var el = h('<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="תמונה לעמיתים"><div class="sheet"><h3>תמונה לעמיתים</h3>' +
      '<div class="field"><label for="im-day">איזה יום</label><select id="im-day">' + opts + '</select></div>' +
      '<p class="hint">בתמונה מופיעים רק הפריטים שמסומנים "בלו"ז לעמיתים": שעה, ניסוח ומקום. בלי משימות, ציוד או הערות.</p>' +
      '<img class="img-prev" alt="תצוגה מקדימה של הלו״ז לעמיתים">' +
      '<div class="sheet-actions"><button class="btn solid" data-share>' + svgImg() + 'שיתוף לווטסאפ</button><button class="btn" data-dl>שמירת תמונה</button><button class="btn ghost" data-x>סגירה</button></div></div></div>');
    var img = el.querySelector('img'), blob = null, name = '';
    function draw() {
      var d = el.querySelector('#im-day').value;
      drawImage(d).then(function (b) { blob = b; name = 'לוז-' + d + '.png'; img.src = URL.createObjectURL(b); });
    }
    el.querySelector('#im-day').addEventListener('change', draw);
    el.querySelector('[data-x]').addEventListener('click', function () { el.remove(); });
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
    el.querySelector('[data-dl]').addEventListener('click', function () {
      if (!blob) return; var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    });
    el.querySelector('[data-share]').addEventListener('click', function () {
      if (!blob) return;
      var f = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(function () {});
      else { el.querySelector('[data-dl]').click(); toast('התמונה נשמרה. אפשר לצרף אותה בווטסאפ'); }
    });
    document.body.appendChild(el);
    draw();
  }

  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawImage(date) {
    var day = S.days.filter(function (d) { return d.date === date; })[0];
    var rows = dayItems(date).filter(function (i) { return i.pub && !i.pre && !i.endp; })
      .concat(dayItems(date).filter(function (i) { return i.pub && (i.pre || i.endp); }));
    return Promise.all([document.fonts.load('700 40px Rubik'), document.fonts.load('400 30px Rubik'), document.fonts.load('500 30px Rubik'),
      logoImg.complete ? 1 : new Promise(function (r) { logoImg.onload = logoImg.onerror = r; })]).then(function () {
      var W = 1080, P = 64, TIMEW = 150, GAP = 28, textW = W - P * 2 - TIMEW - GAP;
      var c = document.createElement('canvas'), ctx = c.getContext('2d');
      ctx.direction = 'rtl';
      // מדידה
      var blocks = rows.map(function (i) {
        ctx.font = '500 34px Rubik'; var tl = wrap(ctx, i.pw || i.what, textW);
        ctx.font = '400 26px Rubik'; var pl = i.pl ? wrap(ctx, i.pl, textW) : [];
        return { t: i.t, tl: tl, pl: pl, h: tl.length * 46 + (pl.length ? pl.length * 36 + 6 : 0) + 36 };
      });
      var HEAD = 250, FOOT = 110;
      var H = HEAD + 30 + blocks.reduce(function (s, b) { return s + b.h; }, 0) + FOOT;
      if (!blocks.length) H = HEAD + 200 + FOOT;
      var scale = 1; c.width = W * scale; c.height = H * scale; ctx = c.getContext('2d'); ctx.direction = 'rtl';
      // רקע
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0046ff'; ctx.fillRect(0, 0, W, HEAD);
      // גלים עדינים בכותרת
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3;
      for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(80, HEAD + 40, 120 + k * 46, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '500 30px Rubik';
      ctx.fillText('משלחת אדוות · לונדון', W - P, 92);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 64px Rubik';
      ctx.fillText(day.title, W - P, 176);
      if (logoImg.naturalWidth) {
        var lh = 70, lw = logoImg.naturalWidth * (lh / logoImg.naturalHeight);
        ctx.drawImage(logoImg, P, 70, lw, lh);
      }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '400 26px Rubik';
      ctx.fillText('השעות לפי שעון לונדון', W - P, 220);
      // שורות
      var y = HEAD + 30, tx = W - P, xx = W - P - TIMEW - GAP;
      if (!blocks.length) { ctx.fillStyle = '#7a7f8c'; ctx.font = '400 32px Rubik'; ctx.fillText('אין עדיין פריטים לעמיתים ביום הזה', tx, y + 110); }
      blocks.forEach(function (b, n) {
        if (n) { ctx.strokeStyle = '#e4e6ec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); }
        var by = y + 18 + 34;
        ctx.textAlign = 'right'; ctx.direction = 'ltr';
        ctx.fillStyle = '#0046ff'; ctx.font = '700 36px Rubik';
        ctx.fillText(b.t || '', tx, by);
        ctx.direction = 'rtl';
        ctx.fillStyle = '#14161c'; ctx.font = '500 34px Rubik';
        b.tl.forEach(function (l, j) { ctx.direction = /^[A-Za-z0-9]/.test(l) ? 'ltr' : 'rtl'; ctx.fillText(l, xx, by + j * 46); });
        ctx.fillStyle = '#5b606d'; ctx.font = '400 26px Rubik';
        var py = by + b.tl.length * 46 + 2;
        b.pl.forEach(function (l, j) { ctx.direction = /^[A-Za-z0-9]/.test(l) ? 'ltr' : 'rtl'; ctx.fillText(l, xx, py + j * 36); });
        ctx.direction = 'rtl';
        y += b.h;
      });
      // תחתית
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, H - FOOT + 20, W, FOOT);
      ctx.fillStyle = '#4a4f5c'; ctx.font = '400 26px Rubik'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.fillText('שינויים יעודכנו בקבוצה', W / 2, H - FOOT / 2 + 30);
      return new Promise(function (r) { c.toBlob(r, 'image/png'); });
    });
  }

  // ── הדפסה: דף לכל יום (שורה לכל שעה, המשימות לצד האירוע) ──
  function buildPrint() {
    $print.innerHTML = S.days.map(function (d) {
      var list = dayItems(d.date);
      var pre = list.filter(function (i) { return i.pre; }), mid = list.filter(function (i) { return !i.pre && !i.endp; }), end = list.filter(function (i) { return i.endp; });
      var rows = groups(mid).map(function (g) {
        var ev = g.items.filter(function (i) { return i.kind !== 'task'; });
        var tk = g.items.filter(function (i) { return i.kind === 'task'; });
        var evHtml = ev.map(function (i) {
          return '<div class="p-ev">' + esc(i.what) + (i.pub ? '<span class="p-pub"></span>' : '') + '</div>' +
            (i.where ? '<div class="p-sub bidi">' + esc(i.where) + '</div>' : '');
        }).join('');
        var tasks = [];
        ev.forEach(function (i) { if (i.task) tasks.push(i.task); });
        tk.forEach(function (i) { tasks.push(i.what + (i.task ? ': ' + i.task : '') + (i.where ? ' (' + i.where + ')' : '')); });
        var gn = [];
        g.items.forEach(function (i) { if (i.gear) gn.push('<div class="bidi"><b>ציוד:</b> ' + esc(i.gear) + '</div>'); if (i.note) gn.push('<div class="bidi">' + esc(i.note) + '</div>'); });
        return '<tr' + (ev.length ? '' : ' class="only-task"') + '><td class="t">' + esc(g.t || '?') + '</td><td>' + evHtml + '</td>' +
          '<td>' + tasks.map(function (x) { return '<div class="p-task">' + esc(x) + '</div>'; }).join('') + '</td><td class="p-gn">' + gn.join('') + '</td></tr>';
      }).join('');
      return '<section class="p-day"><div class="p-head"><div><div class="p-trip">משלחת אדוות לונדון · לו"ז תפעול · לשימוש הצוות בלבד</div><h2>' + esc(d.title) + '</h2></div>' +
        (d.owner ? '<div class="p-owner">מחזיק יום: ' + esc(d.owner) + '</div>' : '') + '</div>' +
        (d.gear ? '<div class="p-gear"><b>ציוד ליום:</b> <span class="bidi">' + esc(d.gear) + '</span></div>' : '') +
        (pre.length ? '<div class="p-pre"><b>לפני היום:</b>' + pre.map(function (i) { return '<div class="p-task">' + esc(i.what) + '</div>'; }).join('') + '</div>' : '') +
        '<table class="p"><colgroup><col style="width:8%"><col style="width:38%"><col style="width:34%"><col style="width:20%"></colgroup>' +
        '<thead><tr><th>שעה</th><th>מה קורה ואיפה</th><th>משימות תפעול</th><th>ציוד והערות</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        (end.length ? '<div class="p-end"><h4>בסוף היום</h4><div class="p-cols">' + end.map(function (i) { return '<div class="p-task">' + esc(i.what) + '</div>'; }).join('') + '</div></div>' : '') +
        '<div class="p-foot"><span class="p-pub"></span> מופיע בלו"ז לעמיתים · ☐ משימה · הודפס ' + new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()) + '</div></section>';
    }).join('');
    fitPrint();
  }
  // מקטין כל יום כך שייכנס בדיוק בעמוד A4 אחד
  function fitPrint() {
    var PAGE_H = 273 * 96 / 25.4, PAGE_W = 190 * 96 / 25.4;
    $print.classList.add('measure');
    $print.style.width = PAGE_W + 'px';
    [].forEach.call($print.querySelectorAll('.p-day'), function (sec) {
      sec.style.zoom = '';
      var hgt = sec.scrollHeight;
      if (hgt > PAGE_H) sec.style.zoom = Math.max(0.6, Math.floor((PAGE_H / hgt) * 100) / 100 - 0.01);
    });
    $print.classList.remove('measure');
    $print.style.width = '';
  }
  window.addEventListener('beforeprint', fitPrint);

  // ── אייקונים ──
  function svgImg() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>'; }
  function svgPrint() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>'; }
  function svgClock() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>'; }

  // ── הפעלה ──
  S.view = lsGet(LS_VIEW) || 'ops';
  if (LOCAL) {
    S.me = { name: 'מקומי' }; S.days = LOCAL.days; S.items = LOCAL.items; S.day = LOCAL.day || pickDay(); render();
    return;
  }
  var m = /[#&]k=([A-Za-z0-9-]+)/.exec(location.hash);
  if (m) { lsSet(LS_KEY, cleanCode(m[1])); history.replaceState(null, '', location.pathname); }
  S.code = lsGet(LS_KEY);
  if (!S.code) { renderLogin(); return; }
  var cached = lsGet(LS_CACHE);
  if (cached) { try { applyData(JSON.parse(cached)); S.day = pickDay(); render(); } catch (e) {} }
  load(false).then(function () { if (!S.me) renderLogin(); });
  setInterval(poll, POLL_MS);
  setInterval(function () { if (!S.editing && S.me) render(); }, 60000); // רענון "עכשיו" כל דקה
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
