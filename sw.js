// Service Worker:网络优先 + 缓存兜底,让 iPad/手机离线也能刷题
// 策略:所有 GET 先走网络(拿到就更新缓存),失败(断网)再用缓存。
// 这样永远优先最新版,离线时退回上次用过的版本。
const CACHE = 'wpc-v2';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/data.js', 'js/store.js', 'js/sync.js', 'js/ui.js', 'js/status.js', 'js/print-sheet.js',
  'js/gen/engine.js', 'js/gen/generators.js',
  'js/views/home.js', 'js/views/learn.js', 'js/views/drill.js', 'js/views/bank.js', 'js/views/errors.js', 'js/views/log.js', 'js/views/print.js', 'js/views/grade.js',
  'data/questions.json', 'data/methods.json', 'data/examples.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return; // GitHub API 等直连
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
