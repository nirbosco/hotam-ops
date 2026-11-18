/* מטמון של קבצי האפליקציה בלבד (קוד, עיצוב, גופנים), כדי שתיפתח גם בלי קליטה.
   הנתונים לא עוברים כאן: הבקשות לשרת הנתונים הן לכתובת אחרת והן לא נשמרות במטמון. */
var CACHE = 'ops-shell-v1';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'f.html', 'f.css', 'f.js', 'assets/advot-logo-white.png',
  'fonts/rubik-hebrew-400-normal.woff2', 'fonts/rubik-hebrew-500-normal.woff2', 'fonts/rubik-hebrew-700-normal.woff2',
  'fonts/rubik-latin-400-normal.woff2', 'fonts/rubik-latin-500-normal.woff2', 'fonts/rubik-latin-700-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// קודם רשת (כדי שעדכונים יגיעו מיד), ורק בלי קליטה מהמטמון
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match(u.pathname.endsWith('f.html') ? 'f.html' : 'index.html'); });
  }));
});
