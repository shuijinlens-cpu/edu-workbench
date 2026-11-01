/* 教师端 · 离线缓存（GitHub Pages 版） */
const CACHE = 'wb-tx-gh-teacher-v2';
const ASSETS = [
  './gh-teacher.html',
  './manifest-gh-teacher.webmanifest',
  './icon.svg'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) {
        return k === CACHE ? Promise.resolve() : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  /* 页面导航：网络优先。发布新版本后手机刷新即可拿到最新页面，避免'缓存优先'导致改了看不到 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (r) {
        if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
        return r;
      }).catch(function () { return caches.match(req, { ignoreSearch: true }); })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.ok) { caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }); }
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) { caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }); }
        return res;
      }).catch(function () {
        return caches.match('./gh-teacher.html');
      });
    })
  );
});
