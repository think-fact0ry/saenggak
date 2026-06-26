// tfnav.js — 화면 단위 단계적 뒤로가기 (디자인원칙 §5.9). 모든 태블릿 페이지 공용.
//
// 새 페이지는 이 한 줄만 추가하면 자동 적용 (페이지 끝, 인라인 <script> 뒤에):
//     <script src="tfnav.js"></script>
//
// 관례(이미 우리 페이지들이 따르는 것):
//   ① 화면 = <div class="screen">, 활성 화면 = .active (한 번에 1개)
//   ② 화면 전환 = 전역 함수 show(id) 호출  (또는 .active 토글)
//   ③ 각 화면 안에 그 화면의 '뒤로' 버튼 = .back  (부모 화면으로 가는 기존 로직·미저장 confirm 포함)
//   ④ 첫(베이스) 화면에서 뒤로 = 브라우저 기본(= 이전 페이지/허브)
//
// 동작: 전진(새 화면) = history 1칸 push / 스와이프·하드웨어 뒤로 = 현재 화면 .back 클릭(=한 단계, 페이지 로직 재사용)
//       / 백버튼 직접 탭도 history 되감기로 통일 → 스와이프와 동일 경로.
// 허브(index.html)·상담일지는 자체 네비가 있어 이 파일을 안 쓴다(중복 로드 금지).

(function () {
  if (window.__tfnav) return;            // 중복 로드 가드
  window.__tfnav = true;

  var stack = [];        // 활성 화면 id 스택 (베이스가 [0])
  var suppress = 0;      // 우리가 부른 history.go 의 popstate 반향 무시 카운트
  var driving = false;   // popstate가 .back 을 클릭하는 중 (그때의 show는 히스토리 건드리지 않음)

  function curId() { var a = document.querySelector('.screen.active'); return a ? a.id : ''; }

  // show()가 부른(또는 .active가 바뀐) 화면을 히스토리에 반영
  function track(id) {
    if (driving || !id) return;
    if (stack.length === 0) { stack = [id]; return; }     // 첫 화면 = 베이스 (push 안 함)
    var i = stack.lastIndexOf(id);
    if (i >= 0) {                                          // 이미 방문 = 뒤로(코드/버튼이 부모로) → 그만큼 되감기
      var steps = stack.length - 1 - i;
      stack.length = i + 1;
      if (steps > 0) { suppress += steps; history.go(-steps); }
    } else {                                               // 전진 = 1칸 push
      stack.push(id);
      try { history.pushState({ tf: id }, ''); } catch (e) {}
    }
  }

  // 전역 show(id) 래핑 (있으면). 없으면 .active 변화를 MutationObserver로 감지(폴백).
  function wrapShow() {
    if (typeof window.show !== 'function' || window.show.__tf) return false;
    var orig = window.show;
    var w = function (id) { var r = orig.apply(this, arguments); track(id || curId()); return r; };
    w.__tf = true;
    window.show = w;
    return true;
  }
  if (!wrapShow()) {
    // show()가 전역이 아닌 페이지 → .active 클래스 변화 감지
    var last = '';
    var mo = new MutationObserver(function () { var c = curId(); if (c && c !== last) { last = c; track(c); } });
    mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // 초기 베이스 = 로드 시점의 활성 화면
  function initBase() { if (stack.length === 0 && curId()) stack = [curId()]; }
  if (document.readyState !== 'loading') initBase();
  else document.addEventListener('DOMContentLoaded', initBase);

  window.addEventListener('popstate', function () {
    if (suppress > 0) { suppress--; return; }           // 우리가 부른 history.go 반향
    if (stack.length <= 1) return;                       // 베이스 → 브라우저 기본(이전 페이지/허브)
    var a = document.querySelector('.screen.active');
    var bb = a ? a.querySelector('.back') : null;
    var before = curId();
    if (bb) {
      driving = true; bb.click(); driving = false;       // 현재 화면 백버튼(부모 이동 + 미저장 confirm) 1회
      if (curId() === before) { try { history.pushState({ tf: before }, ''); } catch (e) {} }  // confirm 취소 등 → 머무름
      else { stack.pop(); }                              // 한 단계 내려감
    } else {
      stack.pop();                                       // .back 없는 화면 = 그냥 한 칸 (안전)
    }
  });
})();
