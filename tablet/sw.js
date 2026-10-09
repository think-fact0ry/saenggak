// 생각공작소 태블릿 서비스워커 — 설치 가능(앱) 조건 충족 + 오프라인 폴백.
// 전략: network-first. 온라인이면 항상 최신을 받고(Pages 캐시 지연·스테일 회피),
//       실패(오프라인)일 때만 캐시로 폴백. 캐시 이름에 버전 → 갱신 시 v 올리면 무효화.
var CACHE = 'tf-tablet-v147';   // 10-09: 상담일지·검사·ai일지·허브 마이페이지 읽기 재시도(구글 HTML 응답). v146 10-08: 동의 시트 「필수」 뒤 간격 4→8px(§4.16). v145 10-01: 목록 뼈대 모션 깜빡임→훑기(§5.4). v144 09-07: 상담일지 회기 평가 = range → 탭 타깃(§4.9). network-first라 온라인은 이미 최신이지만 오프라인 폴백분을 무효화
var SHELL = [
  './', './index.html', './가격표.html', './검사_오감.html', './상담일지.html', './ai일지.html', './대응매뉴얼.html', './서식.html', './tfnav.js', './install.js', './manifest.json',
  '/saenggak/favicon.js',
  '/saenggak/kakao-escape.js',
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
