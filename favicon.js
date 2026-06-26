// 생각공작소 공유 파비콘 주입기.
// 새 페이지(태블릿 타일·웹앱·세션 등)는 <head> 안에 아래 한 줄만 넣으면 파비콘이 자동으로 붙는다:
//   <script src="/saenggak/favicon.js"></script>
// 파비콘 원본은 /saenggak/ 루트의 favicon-*.png · apple-icon-*.png · android-icon-*.png (provider-map.html 기준 세트).
(function () {
  var BASE = '/saenggak/';
  var ICONS = [
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: 'favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: 'favicon-16x16.png' },
    { rel: 'icon', type: 'image/png', sizes: '96x96', href: 'favicon-96x96.png' },
    { rel: 'icon', type: 'image/png', sizes: '192x192', href: 'android-icon-192x192.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: 'apple-icon-180x180.png' }
  ];
  var head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  ICONS.forEach(function (i) {
    // 이미 같은 rel+sizes 링크가 있으면 중복 추가 안 함(명시 태그를 둔 페이지와 공존)
    if (document.querySelector('link[rel="' + i.rel + '"][sizes="' + i.sizes + '"]')) return;
    var l = document.createElement('link');
    l.rel = i.rel;
    if (i.type) l.type = i.type;
    if (i.sizes) l.setAttribute('sizes', i.sizes);
    l.href = BASE + i.href;
    head.appendChild(l);
  });
})();
