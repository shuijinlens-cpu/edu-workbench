/* 教培三端工作台 · Service Worker
   作用：满足 Chrome「安装应用」条件（需带 fetch 处理器），并提供离线缓存。 */
var CACHE = 'edu3-pwa-v1';

/* sharecode 由注册 URL 携带：sw.js?sharecode=xxx */
var SC = '';
try { SC = new URL(self.serviceWorker.scriptURL).searchParams.get('sharecode') || ''; } catch (e) {}

var HOST = self.location.origin;
function q(p) { return HOST + p + (SC ? ('?sharecode=' + encodeURIComponent(SC)) : ''); }

var PRECACHE = [
  '/index.html',
  '/gh-principal.html', '/gh-teacher.html', '/gh-xueguan.html',
  '/icon-principal-192.png', '/icon-principal-512.png',
  '/icon-teacher-192.png', '/icon-teacher-512.png',
  '/icon-xueguan-192.png', '/icon-xueguan-512.png'
].map(q);

self.addEventListener('install', function (e) {
  /* 逐个预缓存且单个失败不阻断安装（站点对无 sharecode 请求返回 403） */
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* 页面导航：网络优先，失败回退缓存（离线可打开） */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.ok) {
          var cp = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); });
        }
        return r;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (m) {
          return m || Response.error();
        });
      })
    );
    return;
  }

  /* 静态资源：缓存优先 */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (m) {
      if (m) return m;
      return fetch(req).then(function (r) {
        if (r && r.ok && r.type === 'basic') {
          var cp = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); });
        }
        return r;
      });
    })
  );
});
