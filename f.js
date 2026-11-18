/* לו"ז המשלחת לעמיתים. אין כאן נתונים: הם נשלפים רק עם המפתח שבקישור,
   והשרת מחזיר רק ימים שפורסמו ורק שעה, כותרת ומקום. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  var SB = 'https://ndrhiikczkbosentclnh.supabase.co';
  var KEY = 'sb_publishable_EckoZz1eIoRjjjQ9XhXhzA_EpuKVWQG';
  var TZ = 'Europe/London';
  var LS_T = 'advot-f-t', LS_C = 'advot-f-cache';
  var $app = document.getElementById('app');
  var S = { token: null, days: [], items: [], day: null, offline: false, picked: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function toMin(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function londonNow() {
    var o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + '-' + o.month + '-' + o.day, hm: (o.hour === '24' ? '00' : o.hour) + ':' + o.minute };
  }
  function mapsUrl(p) {
    var m = /(https?:\/\/\S+)/.exec(p);
    if (m && /^https:\/\/(maps\.app\.goo\.gl|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/.test(m[1])) return m[1];
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.replace(/https?:\/\/\S+/g, '').trim());
  }
  function placeLabel(p) { var s = p.replace(/https?:\/\/\S+/g, '').replace(/[\s·,]+$/, '').trim(); return s || 'ניווט'; }

  function load() {
    return fetch(SB + '/rest/v1/rpc/ops_public', {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: S.token })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error('x'); e.denied = j && j.code === '28000'; throw e; }
        return j;
      });
    }).then(function (d) {
      S.days = d.days || []; S.items = d.items || []; S.offline = false;
      lsSet(LS_C, JSON.stringify(d)); render();
    }).catch(function (e) {
      if (e.denied) { lsDel(LS_T); lsDel(LS_C); S.token = null; render(); return; }
      S.offline = true; render();
    });
  }

  function pickDay() {
    var now = londonNow().date, ds = S.days.map(function (d) { return d.date; });
    if (!ds.length) return null;
    if (ds.indexOf(now) >= 0) return now;
    var next = ds.filter(function (d) { return d > now; })[0];
    return next || ds[ds.length - 1];
  }

  function render() {
    if (!S.token) {
      $app.innerHTML = '<main class="wrap"><div class="empty"><b>הקישור לא בתוקף</b>בקשו מצוות המשלחת קישור עדכני.</div></main>';
      return;
    }
    if (!S.picked || S.days.every(function (d) { return d.date !== S.day; })) { S.day = pickDay(); }
    var now = londonNow();
    var html = '<header class="top"><div class="top-row"><h1>לו"ז המשלחת<small>אדוות · לונדון · השעות לפי שעון לונדון</small></h1>' +
      '<img src="assets/advot-logo-white.png" alt="אדוות"></div>';
    if (S.days.length > 1) {
      html += '<nav class="tabs" role="tablist" aria-label="ימים">' + S.days.map(function (d) {
        var m = /^(\S+ \S+)\s+(.*)$/.exec(d.title) || [0, d.title, ''];
        return '<button class="tab" role="tab" data-day="' + d.date + '" aria-selected="' + (d.date === S.day) + '"><b>' + esc(m[1].replace('יום ', '')) + '</b>' + esc(m[2]) + '</button>';
      }).join('') + '</nav>';
    }
    html += '</header><main class="wrap">';
    if (S.offline) html += '<div class="banner">אין חיבור כרגע. מוצג הלו"ז האחרון שנשמר בטלפון.</div>';
    if (!S.day) {
      html += '<div class="empty"><b>הלו"ז עוד לא פורסם</b>הלו"ז של כל יום יופיע כאן ערב לפני. אפשר לשמור את הקישור ולחזור אליו.</div></main>';
      $app.innerHTML = html; return;
    }
    var day = S.days.filter(function (d) { return d.date === S.day; })[0];
    var items = S.items.filter(function (i) { return i.day === S.day; })
      .map(function (i, n) { return { i: i, n: n }; })
      .sort(function (a, b) { var x = toMin(a.i.t), y = toMin(b.i.t); return (x == null || y == null) ? a.n - b.n : (x - y) || (a.n - b.n); })
      .map(function (o) { return o.i; });
    var live = now.date === S.day, nm = toMin(now.hm), cur = null, next = null;
    if (live) items.forEach(function (i) { var m = toMin(i.t); if (m == null) return; if (m <= nm) cur = i; else if (!next) next = i; });
    if (live && !next && cur && nm - toMin(cur.t) > 120) live = false;
    if (live && (cur || next)) {
      html += '<section class="now" aria-live="polite"><div class="now-label">עכשיו · ' + now.hm + '</div>' +
        '<div class="now-what">' + (cur ? esc(cur.what) : 'עוד לא התחלנו') + '</div>' +
        (next ? '<div class="now-next">הבא: <b>' + esc(next.t) + '</b> ' + esc(next.what) + '</div>' : '') + '</section>';
    }
    html += '<h2 class="day-title">' + esc(day.title) + '</h2><ol class="list">';
    items.forEach(function (i) {
      var m = toMin(i.t), cls = 'row';
      if (live && cur === i) cls += ' current'; else if (live && m != null && m < nm) cls += ' past';
      html += '<li class="' + cls + '"><div class="t">' + esc(i.t) + '</div><div><div class="what">' + esc(i.what) + '</div>' +
        (i.place ? '<div class="place"><bdi>' + esc(placeLabel(i.place)) + '</bdi></div><a class="nav" href="' + esc(mapsUrl(i.place)) + '" target="_blank" rel="noopener noreferrer">' + pin() + 'ניווט</a>' : '') +
        '</div></li>';
    });
    html += '</ol><p class="note">שינויים בלו"ז מתעדכנים כאן אוטומטית.</p></main>';
    $app.innerHTML = html;
  }
  function pin() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'; }

  $app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-day]'); if (!b) return;
    S.day = b.dataset.day; S.picked = true; window.scrollTo(0, 0); render();
  });

  if (window.F_LOCAL) { S.token = 'local'; S.days = F_LOCAL.days; S.items = F_LOCAL.items; render(); return; } // תצוגה מקומית בלבד
  var m = /[#&]t=([A-Za-z0-9]{24,64})/.exec(location.hash);
  if (m) { lsSet(LS_T, m[1]); }
  S.token = lsGet(LS_T);
  if (S.token) {
    var c = lsGet(LS_C); if (c) { try { var d = JSON.parse(c); S.days = d.days || []; S.items = d.items || []; } catch (e) {} }
    render(); load();
    setInterval(function () { if (!document.hidden) load(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  } else render();
})();
