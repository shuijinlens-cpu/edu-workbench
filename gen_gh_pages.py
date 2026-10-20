# -*- coding: utf-8 -*-
"""生成 GitHub Pages 版站点文件（根目录布局，gh- 前缀）"""
import io, os

os.chdir('C:/Users/Admin（无密码）/WorkBuddy/2026-10-19-20-00-28')

PORTS = [
    ('principal', 'gh-principal', '校长端', 'wb-tx-gh-principal-v1',
     '教培工作台 · 校长端', '经营看板、生源课时、师资工资、排课、家校反馈'),
    ('teacher', 'gh-teacher', '教师端', 'wb-tx-gh-teacher-v1',
     '教培工作台 · 教师端', '我的课表、上课打卡、学员跟进、课后反馈（仅本人数据）'),
    ('xueguan', 'gh-xueguan', '学管端', 'wb-tx-gh-xueguan-v1',
     '教培工作台 · 学管端', '今日课表、排课打卡、学员登记、跟进记录、续费预警'),
]

for src, gh, name, cache, full, desc in PORTS:
    h = io.open(src + '.html', encoding='utf-8').read()
    h = h.replace('manifest-%s.webmanifest' % src, 'manifest-gh-%s.webmanifest' % src)
    h = h.replace("navigator.serviceWorker.register('sw-%s.js')" % src,
                  "navigator.serviceWorker.register('sw-gh-%s.js')" % src)
    assert 'manifest-gh-' in h and 'sw-gh-' in h, src
    io.open(gh + '.html', 'w', encoding='utf-8').write(h)

    io.open('manifest-gh-%s.webmanifest' % src, 'w', encoding='utf-8').write('''{
  "name": "%s",
  "short_name": "%s",
  "description": "%s",
  "start_url": "./%s.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#eef1fb",
  "theme_color": "#4f5dff",
  "lang": "zh-CN",
  "icons": [
    {
      "src": "icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}''' % (full, name, desc, gh))

    io.open('sw-gh-%s.js' % src, 'w', encoding='utf-8').write('''/* %s · 离线缓存（GitHub Pages 版） */
const CACHE = '%s';
const ASSETS = [
  './%s.html',
  './manifest-gh-%s.webmanifest',
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
        return caches.match('./%s.html');
      });
    })
  );
});
''' % (name, cache, gh, src, gh))

print('gh pages assets done')
