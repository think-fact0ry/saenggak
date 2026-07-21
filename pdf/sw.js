// 킬스위치 — 구주소에 등록된 서비스워커를 스스로 해제한다 (앱은 /pdfpng/로 이사)
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(
    self.registration.unregister()
      .then(function(){ return caches.keys(); })
      .then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
  );
});
