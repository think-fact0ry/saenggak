// 생각공작소 태블릿 서비스워커 — 설치 가능(앱) 조건 충족 + 오프라인 폴백.
// 전략: network-first. 온라인이면 항상 최신을 받고(Pages 캐시 지연·스테일 회피),
//       실패(오프라인)일 때만 캐시로 폴백. 캐시 이름에 버전 → 갱신 시 v 올리면 무효화.
var CACHE = 'tf-tablet-v113';   // ⚠️ 배포할 때마다 올릴 것(+index.html APP_VERSION 동기) → 켜둔 앱도 포그라운드 복귀 시 자동 갱신
var SHELL = [
  './', './index.html', './가격표.html', './검사_오감.html', './상담일지.html', './대응매뉴얼.html', './서식.html', './tfnav.js', './install.js', './manifest.json',
  '/saenggak/favicon.js',
  '/saenggak/favicon-32x32.png',
  '/saenggak/android-icon-192x192.png',
  '/saenggak/android-icon-512x512.png',
  '/saenggak/apple-icon-180x180.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){ return Promise.all(keys.map(function(k){ if (k !== CACHE) return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then(function(res){
      // 같은 출처 GET 성공분은 캐시 갱신(오프라인 대비)
      if (res && res.ok && new URL(req.url).origin === self.location.origin){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      // 오프라인 → 캐시, 없으면 허브로 폴백
      return caches.match(req).then(function(r){ return r || caches.match('./index.html'); });
    })
  );
});
