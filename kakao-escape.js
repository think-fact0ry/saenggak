// 카톡 인앱 브라우저 = 상단 주소바+하단 네비바가 화면(제출 버튼 등)을 잠식 →
// 진입 즉시 기본 브라우저로 자동 전환 (docs/1 §3.7, 유성 2026-07-04 ex49).
// 검증=실기기 카톡 전용(헤드리스·PC 재현 불가). 스킴이 실패해도 페이지는 그대로 동작(무해).
//
// + 남은 창 닫기 (2026-10-13, 유성 go — 켜는 곳 = 급여명세서 pay/만, 폰에서 닫히는 걸 본 뒤 넓힌다):
//   기본 브라우저로 넘겨도 카톡 안 창은 처음 화면 그대로 남는다 → 카톡으로 돌아오면 「다시 처음부터」로 보인다
//   (소장님 10-12 「서구 보고 다시 돌아오면 사라지고 다시 처음부터」). 켜기 = <script … data-leftover>.
//   ① 넘긴 직후 3초 안에 화면이 가려지면 「넘겨줬다」로 친다 — 3초 제한은 카톡 안 창에서 쓰다가 문자 앱에
//      다녀오는 경우(넘기기 실패한 분)를 안내로 덮지 않으려는 것.
//   ② 가려진 동안 안내(「인터넷 창에서 열렸어요 / 이 창은 닫으셔도 돼요」)를 깔아 두고,
//   ③ 돌아오면 창 닫기 명령을 보낸다. 안 닫히면 안내가 보인다(버튼 없음 — 위 X와 중복, 유성 10-13).
//   ⛔가려짐 신호 = visibilitychange만(blur·pagehide 안 씀) — 카톡 확인 창이나 스킴 이동에도 올 수 있어,
//     넘기기에 실패한 창을 안내로 덮거나 닫아 버린다.
//   ⚠️닫기 스킴(kakaotalk://inappbrowser/close · iOS kakaoweb://closeBrowser)은 카카오 공식 문서에 없다 = 실기기 미검증.
//   판 = 메인 레포 prototype/공통_카톡안창_남은창_안내_프리뷰.html (2판).
(function () {
  if (!/KAKAOTALK/i.test(navigator.userAgent)) return;
  var me = document.currentScript;
  var leftover = !!(me && me.hasAttribute('data-leftover'));
  var t0 = Date.now();
  location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  if (!leftover) return;

  var HAND_MS = 3000;
  var handed = false, closing = false;
  var IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  function showNotice() {
    if (document.getElementById('kakaoLeftover')) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', showNotice); return; }
    var d = document.createElement('div');
    d.id = 'kakaoLeftover';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;text-align:center;padding:0 26px 40px;word-break:keep-all;' +
      'font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;color:var(--g900,#191f28)';
    d.innerHTML =
      '<div style="width:64px;height:64px;border-radius:50%;background:var(--green-bg,#e9f8ee);display:flex;align-items:center;justify-content:center;margin-bottom:18px">' +
        '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#3a8a5f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 12.5 10 17 19 7.5"/></svg>' +
      '</div>' +
      '<div style="font-size:21px;font-weight:700;margin-bottom:8px">인터넷 창에서 열렸어요</div>' +
      '<div style="font-size:15px;color:var(--g700,#4e5968)">이 창은 닫으셔도 돼요</div>';
    document.body.appendChild(d);
    document.documentElement.style.overflow = 'hidden';
  }

  function away() {
    if (handed || Date.now() - t0 > HAND_MS) return;
    handed = true;
    showNotice();
  }

  function back() {
    if (!handed || closing) return;
    closing = true;
    location.href = IOS ? 'kakaoweb://closeBrowser' : 'kakaotalk://inappbrowser/close';
    setTimeout(function () { closing = false; }, 1500);
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) away(); else back(); });
  window.addEventListener('focus', back);
  window.addEventListener('pageshow', function (e) { if (e.persisted) back(); });
})();
