/* 教师端 · 离线缓存 */
const CACHE = 'wb-tx-teacher-v1';
const ASSETS = [
  './教培教师端.html',
  './manifest-teacher.webmanifest',
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
        return caches.match('./教培教师端.html');
      });
    })
  );
});
