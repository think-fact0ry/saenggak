/* 보드게임 교사 설문 3판(23, 2026-10-01 유성 A7 확정) — survey.html 전용. 백엔드 = scripts/23_보드게임목록(survey_names·survey_load·survey_save·survey_picks).
   흐름: 열쇠(?k=) → 이름 → 해 본 게임 고르기(92종 사진) → 고른 게임만 한 장씩(몇 번 해 봤어요? + 아이 반응 5단)
         → 고칠 게임이 있으면 눌러 주세요(답별로 모아 보기, 누르면 그 장으로) → 형제와 같이 해도 괜찮았던 게임
         → 다른 선생님께 권하고 싶은 게임(잘 맞았어요 이상, 0~3개, 순서 없음) → 더 남기고 싶은 말(선택) → 끝.
   「아이가 그만두고 싶어했어요」·「아이가 또 하자고 했어요」는 이유 글이 있어야 넘어간다(칩은 선택). 서버도 같은 규칙으로 거절한다.
   저장은 낙관적이다: 답이 끝나는 즉시 다음 장으로 가고 서버엔 뒤에서 보낸다. 못 보낸 답은 기기에 남아(p) 다음에 열 때·끝낼 때 다시 보낸다.
   고르기에서 뺀 게임 중 서버에 답이 있던 것 = 안 해봄(skip)으로 보낸다. 끝 화면 「처음부터 다시 보기」 = 같은 이름으로 고르기부터, 이미 한 답이 그대로 보인다.
   ?demo=1 = 서버를 안 부르는 가짜 명부·목록(열쇠 없이 열린다).
   ⚠️ 서버·토스트·사진 헬퍼는 games.js와 같은 코드다(games.js는 로드되면 목록 흐름을 스스로 시작해 같이 못 싣는다) — 한쪽을 고치면 다른 쪽도(3-G).
   ⚠️ WHY 칩 목록은 서버 SURVEY_WHY와 같아야 한다(다르면 서버가 bad_request로 거절). */
(function () {
  "use strict";
  var GAS_EXEC = "https://script.google.com/macros/s/AKfycbyRilxEvRNPTl55yYPraNUGbdz6SbQDOdrdyFiAyfx4aHMdbXIoPhAx8E1HZsBj90rB_w/exec";
  var DEMO = /[?&]demo=1/.test(location.search);
  var KEY = (location.search.match(/[?&]k=([^&]+)/) || [])[1] || "";
  var STORE = "tf_survey_v3", GAMES_CACHE = "tf_games_v1";
  var SCALE = [
    { v: 5, t: "아이가 또 하자고 했어요", c: "p2" },
    { v: 4, t: "잘 맞았어요", c: "p1" },
    { v: 3, t: "보통이에요", c: "z" },
    { v: 2, t: "잘 안 맞았어요", c: "n1" },
    { v: 1, t: "아이가 그만두고 싶어했어요", c: "n2" }
  ];
  var COUNTS = [{ c: "1", t: "1~2번" }, { c: "2", t: "여러 번" }];
  var WHY = {
    1: { q: "그만두고 싶어한 이유를 적어 주세요", tone: "neg", chips: ["설명이 길어서", "너무 어려워서", "기다리기 지루해서", "계속 져서", "손이 안 따라와서", "너무 쉬워서"] },
    5: { q: "또 하자고 한 이유를 적어 주세요", tone: "pos", chips: ["이겨서 신나서", "손으로 하는 재미", "짧게 끝나서", "같이 웃어서", "규칙이 쉬워서", "두근두근해서"] }
  };
  var FORGOT = "잘 기억이 안 나요";
  var IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    chk: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>'
  };
  var app = document.getElementById("sv");

  /* ── 서버 ── */
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function post(obj, retries) {
    if (DEMO) return demoPost(obj);
    var go = function () {
      return fetch(GAS_EXEC, { method: "POST", body: JSON.stringify(obj) }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    };
    if (!retries) return go();
    return go().catch(function () { return wait(700).then(go); }).catch(function () { return wait(1600).then(go); });
  }
  function warmGas() { if (DEMO) return; try { fetch(GAS_EXEC, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(function () {}); } catch (e) {} }

  /* ── 가짜 서버(?demo=1) ── */
  function demoImg(fill) {
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" rx="16" fill="' + fill + '"/><rect x="36" y="60" width="228" height="54" rx="8" fill="#fff" opacity=".85"/></svg>');
  }
  var demoGames = [["할리갈리", "할리갈리", "#3a8a5f"], ["도블", "도블", "#D25357"], ["개구리알먹기", "개구리알 먹기", "#57a77a"], ["늑대가나타났다", "늑대가 나타났다!", "#f5a623"],
    ["딕인", "딕인", ""], ["메모리체스", "메모리체스", "#525966"], ["스택버거", "스택버거", "#7bcb9c"], ["젬블로", "젬블로", "#8a6f5c"], ["uno", "UNO", "#c0392b"]]
    .map(function (a) { return { k: a[0], n: a[1], c: 1, o: 0, p: a[2] ? demoImg(a[2]) : "" }; });
  var demoNames = ["김하늘", "박서연", "이도윤", "정민준", "최지우"];
  var demoStore = { "박서연": { "도블": { skip: false, v: 5, forgot: false, c: "2", chips: ["같이 웃어서"], memo: "또 하자고 졸랐어요", best: true, sib: false } } };
  function demoPost(obj) {
    return wait(obj.action === "survey_save" ? 700 : 400).then(function () {
      if (obj.action === "games") return { ok: true, games: JSON.parse(JSON.stringify(demoGames)) };
      if (obj.action === "survey_names") return { ok: true, names: demoNames.slice() };
      if (obj.action === "survey_load") return { ok: true, answers: JSON.parse(JSON.stringify(demoStore[obj.name] || {})) };
      if (obj.action === "survey_save") {
        if (obj.key === "스택버거") return { ok: false, error: "server" };   // 「저장 안 됨」 길
        var a = obj.a || {}, st = (demoStore[obj.name] = demoStore[obj.name] || {}), old = st[obj.key] || {};
        if (a.v && !a.c) return { ok: false, error: "incomplete" };
        if (WHY[a.v] && !String(a.memo || "").trim()) return { ok: false, error: "incomplete" };
        st[obj.key] = { skip: !!a.skip, v: a.v || 0, forgot: !!a.forgot, c: a.c || "", chips: a.chips || [], memo: a.memo || "", best: a.v ? !!old.best : false, sib: a.v ? !!old.sib : false };
        window.__tfSaved = obj; return { ok: true };
      }
      if (obj.action === "survey_picks") { window.__tfPicks = obj; return { ok: true }; }
      return { ok: false, error: "unknown_action" };
    });
  }

  /* ── 공통 UI ── */
  var toastT;
  function toast(msg, ok, ms) {
    var t = document.getElementById("toast");
    t.querySelector(".tx").textContent = msg;
    t.classList.toggle("okk", !!ok); t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, ms || 2600);
  }
  function shake(el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
  function bump(el) { el.classList.remove("sv-bump"); void el.offsetWidth; el.classList.add("sv-bump"); }
  function buzz() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function pressRipple(btn, e) {   // §5.3-1 솔리드 버튼 = 물결(상담일지 실코드)
    var r = btn.getBoundingClientRect();
    var x = (e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left;
    var rs = Math.ceil(Math.hypot(Math.max(x, r.width - x), r.height / 2) / 15) + 1;
    var rip = document.createElement("span"); rip.className = "rip";
    rip.style.left = x + "px"; rip.style.top = (r.height / 2) + "px"; rip.style.setProperty("--rs", rs);
    btn.appendChild(rip); requestAnimationFrame(function () { rip.classList.add("go"); });
    setTimeout(function () { rip.remove(); }, 480);
  }
  document.addEventListener("pointerdown", function (e) { var b = e.target.closest(".btn"); if (b && b.getAttribute("aria-disabled") !== "true") pressRipple(b, e); });
  function btnHTML(label) { return '<button class="btn" type="button"><span class="bl">' + label + '</span></button>'; }
  function setBtn(b, label, off) { b.querySelector(".bl").textContent = label; b.setAttribute("aria-disabled", off ? "true" : "false"); }
  function topHTML(cnt, fwdOn) {
    return '<div class="sv-top"><button class="sv-ico back" type="button" aria-label="뒤로">' + IC.back + '</button><span class="sv-cnt">' + (cnt || "") + '</span>' +
      (fwdOn == null ? '<span style="width:40px"></span>' : '<button class="sv-ico fwd" type="button" aria-label="앞으로"' + (fwdOn ? "" : " disabled") + ">" + IC.fwd + "</button>") + "</div>";
  }
  function autoGrow(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }

  /* 화면 전환: 새 화면이 오른쪽에서 들어온다(dir<0이면 왼쪽에서). 휴대폰 뒤로가기 = 지금 화면의 ← 와 같다 */
  var curPg = null;
  function show(pg, dir) {
    var old = curPg; curPg = pg;
    scrollFade(pg);
    if (!old || !dir) { if (old) old.remove(); app.appendChild(pg); return; }   // 첫 화면은 미끄러지지 않는다
    pg.classList.add(dir < 0 ? "off-l" : "off-r"); app.appendChild(pg);
    void pg.offsetWidth;   // rAF는 뒤에 있는 탭에서 멈춘다 → 강제 리플로우로 시작점을 확정
    pg.classList.remove("off-r", "off-l");
    old.classList.add(dir < 0 ? "off-r" : "off-l"); setTimeout(function () { old.remove(); }, 380);
  }
  /* 뒤로(스와이프·하드웨어) = docs/1 §4.11. 가드 칸은 늘 1칸: 화면에 _back이 있으면 그 화면의 ← 와 같은 한 단계 + 가드 다시 쌓기.
     맨 처음 화면(이름 선택, 열쇠 없음)에서는 더블백 종료(§4.11-4): 첫 뒤로 = 기존 토스트로 「한 번 더 뒤로 가면 나가요.」 2초, 가드는 다시 쌓지 않는다
     → 그 2초 안의 두 번째 뒤로는 아래가 비어 브라우저가 받아 나간다. 2초가 지나거나 그 사이 화면을 만지면 가드를 다시 쌓는다 */
  var exitArmed = false, exitT = null;
  function pushGuard() { history.pushState({ sv: 1 }, ""); }
  function disarmExit() { if (!exitArmed) return; exitArmed = false; clearTimeout(exitT); pushGuard(); }
  history.replaceState({ sv: 0 }, ""); pushGuard();

  /* 스크롤 그라데이션(docs/1 §4.13-6 A안): 막대는 숨기고, 맨 위 = 아래 띠만 / 중간 = 위아래 / 맨 끝 = 위 띠만, 안 넘치면 둘 다 끔.
     띠는 화면(.sv-pg)의 ::before/::after — 위치는 그 화면 .sv-body의 실제 offsetTop·높이를 변수로 넘긴다(매직 px 금지).
     다시 재는 때 = 스크롤 + 크기 변화(ResizeObserver, 키보드 포함) + 내용 변화(MutationObserver — 띠 클래스를 붙이는 화면이 아니라 body에 건다) */
  function scrollFade(pg) {
    var body = pg.querySelector(".sv-body"); if (!body) return;
    var paint = function () {
      var over = body.scrollHeight - body.clientHeight, y = body.scrollTop;
      pg.style.setProperty("--sf-t", body.offsetTop + "px"); pg.style.setProperty("--sf-h", body.clientHeight + "px");
      pg.classList.toggle("sv-more", over > 6 && y < over - 6);
      pg.classList.toggle("sv-moreTop", over > 6 && y > 6);
    };
    body.addEventListener("scroll", paint, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(body);
    if (window.MutationObserver) new MutationObserver(function () { requestAnimationFrame(paint); }).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    requestAnimationFrame(paint);
  }

  /* 키보드(§4.1-5): viewport meta interactive-widget=resizes-content라 키보드가 뜨면 앱 높이가 줄어 하단 버튼이 저절로 키보드 위에 앉는다.
     떠 있는 동안만 버튼을 좌우 여백·라운드 없이 꽉 채운다(.sv-kb). 키보드 판정 = 창 높이가 가장 컸던 때보다 120px 넘게 줄었나
     (입력 칸 포커스로 판정하지 않는다 — 안드로이드는 뒤로 제스처로 키보드만 닫으면 포커스가 남는다) */
  var tallest = window.innerHeight;
  function kbCheck() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (h > tallest) tallest = h;
    document.body.classList.toggle("sv-kb", tallest - h > 120);
  }
  if (window.visualViewport) window.visualViewport.addEventListener("resize", kbCheck);
  window.addEventListener("resize", kbCheck);
  window.addEventListener("popstate", function () {
    if (curPg && curPg._back) { curPg._back(); pushGuard(); return; }
    exitArmed = true; toast("한 번 더 뒤로 가면 나가요.", true, 2000);
    clearTimeout(exitT); exitT = setTimeout(disarmExit, 2000);
  });
  document.addEventListener("pointerdown", disarmExit, true);

  /* ── 상태 ── */
  var games = [], name = "", ans = {}, picked = [], rateI = 0, editFromReview = false, picksDue = false, touched = {};
  // picksDue = 권함·형제를 아직 서버에 못 보냄(다음에 열 때 다시 보낸다) / touched = 이번에 이 기기에서 저장한 게임(늦게 온 불러오기가 덮지 않게)
  // ans[k] = {skip, v, forgot, c, chips, memo, best, sib, p(못 보낸 답)} / picked = 지금 고른 게임 키
  function loadStore() {
    if (DEMO) return;
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null") || JSON.parse(localStorage.getItem("tf_survey_v2") || "null");   // 2판 기기의 못 보낸 답도 이어 받는다(횟수 없는 답은 서버가 거절 → 버리고 다시 묻는다)
      if (s && s.name) { name = s.name; ans = s.ans || {}; picked = s.picked || []; picksDue = !!s.picksDue; }
    } catch (e) {}
  }
  function saveStore() { if (DEMO) return; try { localStorage.setItem(STORE, JSON.stringify({ name: name, ans: ans, picked: picked, picksDue: picksDue })); } catch (e) {} }
  function byK(k) { for (var i = 0; i < games.length; i++) if (games[i].k === k) return games[i]; return null; }
  function sorted() { return games.slice().sort(function (a, b) { return a.n.localeCompare(b.n, "ko"); }); }
  function order() { var ks = sorted().map(function (g) { return g.k; }); return picked.filter(byK).sort(function (a, b) { return ks.indexOf(a) - ks.indexOf(b); }); }
  // 끝난 답 = 기억 안 남, 또는 점수+횟수(+이유 글이 필요한 답이면 글). 2판 답(횟수 없음)은 다시 묻는다
  function complete(a) { return !!a && !a.skip && (a.forgot || (a.v > 0 && !!a.c && (!WHY[a.v] || !!String(a.memo || "").trim()))); }
  function answered(k) { return complete(ans[k]); }
  function farIndex(list) { for (var i = 0; i < list.length; i++) if (!answered(list[i])) return i; return list.length; }
  function scored(list) { return list.filter(function (k) { return ans[k] && ans[k].v > 0 && !ans[k].skip; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  function photo(g, sz) {
    var box = h("div", "sv-pic");
    if (!g.p) { box.innerHTML = '<span class="noph">' + IC.box + '</span>'; return box; }
    var img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.onerror = function () {   // Drive 썸네일이 막히면 서버 예비 길(thumb) 한 번
      img.onerror = function () { img.remove(); box.insertAdjacentHTML("afterbegin", '<span class="noph">' + IC.box + '</span>'); };
      if (DEMO) { img.onerror(); return; }
      post({ action: "thumb", key: g.k }).then(function (d) { if (d && d.ok) img.src = "data:image/jpeg;base64," + d.img; else img.onerror(); }).catch(function () { img.onerror(); });
    };
    img.src = g.p.indexOf("data:") === 0 ? g.p : "https://drive.google.com/thumbnail?id=" + encodeURIComponent(g.p) + "&sz=w" + (sz || 400);
    box.appendChild(img); return box;
  }

  /* ── 저장 ── */
  var inflight = {};
  function body(a) {
    if (a.skip) return { skip: true };
    if (a.forgot) return { forgot: true, c: a.c || "", memo: a.memo || "" };
    return { v: a.v, c: a.c, chips: (a.chips || []).slice(), memo: a.memo || "" };
  }
  function send(k) {
    var a = ans[k]; if (!a || !a.p) return;
    if (inflight[k]) { inflight[k] = "again"; return; }   // 보내는 중에 또 바뀌면 끝난 뒤 한 번 더
    inflight[k] = true;
    post({ action: "survey_save", k: KEY, name: name, key: k, a: body(a) }, true).then(function (d) {
      if (d && d.ok) { if (ans[k] === a) { delete a.p; saveStore(); } return; }
      if (d && (d.error === "unknown_game" || d.error === "bad_request" || d.error === "incomplete")) {   // 다시 보내도 같은 답 → 버린다(목록에서 빠진 게임, 2판 답 등). 덜 끝난 답은 화면이 다시 묻는다
        if (ans[k] === a) { delete a.p; if (d.error !== "unknown_game" && !a.skip && !a.forgot) a.c = ""; saveStore(); }
        return;
      }
      fail(d && d.error);
    }).catch(function () { fail("net"); }).then(function () { var again = inflight[k] === "again"; delete inflight[k]; if (again) send(k); });
  }
  function fail(code) {
    if (code === "bad_key" || code === "nokey") { gate(); return; }
    if (code === "unknown_name") { toast("명부에서 이름을 찾지 못했어요. 이름을 다시 선택해 주세요"); toNames(-1); return; }
    toast("답을 아직 보내지 못했어요. 이 폰에 남겨 두었다가 다시 보낼게요");
  }
  // 새 답 저장. 권함·형제는 점수 답일 때만 이어 간다(서버와 같은 규칙)
  function setAns(k, a) {
    var old = ans[k] || {};
    a.p = 1; a.best = a.v >= 4 ? !!old.best : false; a.sib = a.v > 0 ? !!old.sib : false;
    if (!!old.best !== a.best || !!old.sib !== a.sib) picksDue = true;   // 권함·형제가 바뀌었으면 끝 화면이 아니어도 다음에 다시 보낸다
    ans[k] = a; touched[k] = true; saveStore(); send(k);
  }
  function pending() { return Object.keys(ans).filter(function (k) { return ans[k].p; }); }

  /* ── 열쇠 없음 ── */
  function gate() {
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-done"><h1>카톡방에 온 링크로 열면 시작할 수 있어요</h1></div>';
    show(pg, 1);
  }

  /* ── 이름 ── */
  var namesCache = null;
  function toNames(dir) {
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-top"><span></span><span></span></div><div class="sv-ttl"><h1>이름을 선택해 주세요</h1></div><div class="sv-body"><div class="sv-names"></div></div>';
    var box = pg.querySelector(".sv-names");
    var paint = function (list) {
      box.textContent = "";
      list.forEach(function (n) { var b = h("button", "sv-nm"); b.type = "button"; b.textContent = n; b.onclick = function () { pickName(n); }; box.appendChild(b); });
    };
    if (namesCache) paint(namesCache);
    else {
      box.innerHTML = '<div class="sv-msg">명부를 불러오는 중이에요</div>';
      loadNames().then(function (l) { if (l) paint(l); }).catch(function () {
        box.innerHTML = '<div class="sv-msg">명부를 불러오지 못했어요.<br>잠시 후 다시 시도해 주세요.<br><br><button class="retry-btn" type="button">다시 시도</button></div>';
        box.querySelector("button").onclick = function () { location.reload(); };
      });
    }
    show(pg, dir);
  }
  function loadNames() {
    return post({ action: "survey_names", k: KEY }, true).then(function (d) {
      if (!(d && d.ok)) { if (d && (d.error === "bad_key" || d.error === "nokey")) { gate(); return null; } throw new Error(); }
      namesCache = d.names || []; return namesCache;
    });
  }
  function pickName(n) {
    if (n !== name) { name = n; ans = {}; picked = []; picksDue = false; touched = {}; }
    saveStore(); loadAnswers(); toPick(1);
  }
  /* 서버에 적힌 내 답을 받아 합친다(다른 기기에서 이어 하기). 아직 못 보낸 답(p)은 이 기기 것이 이긴다 → 다시 보낸다 */
  function loadAnswers() {
    post({ action: "survey_load", k: KEY, name: name }, true).then(function (d) {
      if (!(d && d.ok)) return;
      var srv = d.answers || {};
      Object.keys(srv).forEach(function (k) {
        if ((ans[k] && ans[k].p) || touched[k]) return;
        ans[k] = srv[k];
        var on = !srv[k].skip && (srv[k].v > 0 || srv[k].forgot);
        if (on && picked.indexOf(k) < 0) picked.push(k);
        if (srv[k].skip) picked = picked.filter(function (x) { return x !== k; });
      });
      saveStore(); pending().forEach(send); if (picksDue) sendPicks(0);
      if (curPg && curPg._repaint) curPg._repaint();
    }).catch(function () {});
  }

  /* ── 목록 ── */
  function loadGames() {
    var cached = null;
    if (!DEMO) { try { cached = JSON.parse(localStorage.getItem(GAMES_CACHE) || "null"); } catch (e) {} }
    if (cached && cached.length) games = cached;
    return post({ action: "games" }, true).then(function (d) {
      if (!(d && d.ok)) throw new Error();
      games = d.games || [];
      if (!DEMO) { try { localStorage.setItem(GAMES_CACHE, JSON.stringify(games)); } catch (e) {} }
      if (curPg && curPg._repaint) curPg._repaint();
    }).catch(function () { if (games.length) toast("새 목록을 받지 못해 지난번 목록을 보여 드려요"); else throw new Error("no games"); });
  }

  /* 격자(고르기·형제·권하기 공통): sel = 고른 키 배열(제자리에서 바꾼다), max = 최대 개수 */
  function tileGrid(keys, sel, max, onChange) {
    var grid = h("div", "sv-grid");
    keys.forEach(function (k) {
      var g = byK(k); if (!g) return;
      var b = h("button", "sv-tile" + (sel.indexOf(k) >= 0 ? " on" : "")); b.type = "button";
      var ph = photo(g, 300); ph.insertAdjacentHTML("beforeend", '<span class="sv-badge">' + IC.chk + '</span>');
      b.appendChild(ph); b.appendChild(h("span", "t")).textContent = g.n;
      b.onclick = function () {
        var i = sel.indexOf(k);
        if (i >= 0) { sel.splice(i, 1); b.classList.remove("on"); b.classList.add("out"); setTimeout(function () { b.classList.remove("out"); }, 200); }
        else {
          if (max && sel.length >= max) { shake(b); toast(max + "개까지 고를 수 있어요. 하나를 먼저 빼 주세요"); return; }
          sel.push(k); b.classList.remove("out"); b.classList.add("on"); buzz();
        }
        if (onChange) onChange();
      };
      grid.appendChild(b);
    });
    return grid;
  }

  /* ── 1 해 본 게임 고르기 ── */
  function toPick(dir) {
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-top"><button class="sv-ico back" type="button" aria-label="이름 선택으로">' + IC.back + '</button><button class="sv-who" type="button" aria-label="이름 바꾸기"></button></div><div class="sv-ttl"><h1>아이들과 해 본 게임을<br>모두 눌러 주세요</h1></div><div class="sv-body"></div><div class="sv-cta">' + btnHTML("") + '</div>';
    pg.querySelector(".sv-who").textContent = name;
    pg.querySelector(".sv-who").onclick = function () { toNames(-1); };
    pg.querySelector(".back").onclick = pg._back = function () { toNames(-1); };
    var body = pg.querySelector(".sv-body"), btn = pg.querySelector(".btn");
    var paintBtn = function () { var n = order().length; setBtn(btn, n ? n + "개 골랐어요" : "해 본 게임을 눌러 주세요", !n); };
    var draw = function () {
      body.textContent = "";
      if (!games.length) { body.innerHTML = '<div class="sv-msg">목록을 불러오는 중이에요</div>'; paintBtn(); return; }
      body.appendChild(tileGrid(sorted().map(function (g) { return g.k; }), picked, 0, function () { saveStore(); paintBtn(); bump(btn); }));
      paintBtn();
    };
    btn.onclick = function () {
      var list = order();
      if (!list.length) { shake(btn); toast("아직 고른 게임이 없어요. 해 본 게임 사진을 눌러 주세요"); return; }
      // 고르기에서 뺀 게임 중 답이 있던 것 = 안 해봄으로
      Object.keys(ans).forEach(function (k) { if (byK(k) && list.indexOf(k) < 0 && !ans[k].skip && (ans[k].v > 0 || ans[k].forgot)) setAns(k, { skip: true }); });
      var far = farIndex(list);
      rateI = far >= list.length ? 0 : far;   // 다 답했으면(처음부터 다시 보기) 첫 장부터 — 고른 답이 그대로 보이고 → 로 넘길 수 있다
      editFromReview = false; toRate(1);
    };
    pg._repaint = draw;
    draw(); show(pg, dir);
  }

  /* ── 2 한 장: 몇 번 해 봤어요? + 아이 반응 ── */
  function toRate(dir) {
    var list = order(), k = list[rateI], g = byK(k);
    if (!g) { toPick(-1); return; }
    var far = farIndex(list), saved = ans[k] && !ans[k].skip ? ans[k] : {};
    // 고치는 중인 답(d)은 화면에만 있다. 다 끝났을 때(다음으로 넘어갈 때) setAns로 저장한다
    var d = { v: saved.v > 0 ? saved.v : 0, c: saved.c || "", chips: (saved.chips || []).slice(), memo: saved.memo || "" };
    var pg = h("div", "sv-pg sv-rate");
    pg.innerHTML = topHTML((rateI + 1) + " / " + list.length, rateI < far) +
      '<div class="sv-bar"><i style="width:' + (Math.max(rateI, far) / list.length * 100) + '%"></i></div>' +
      '<div class="sv-ttl"><h1>아이들에게 어땠나요?</h1></div>' +
      '<div class="sv-body"><div class="sv-thumb"><span class="nm"></span></div>' +
      '<div class="sv-sec"><p class="sv-qlab cl">몇 번 해 봤어요?</p><div class="sv-cnt2"></div></div>' +
      '<div class="sv-sec"><p class="sv-qlab ol">아이 반응</p><div class="sv-opts"></div></div>' +
      '<button class="sv-forgot" type="button">' + FORGOT + '</button>' +
      '<div class="sv-why"><div class="wq">' + IC.down + '<span></span></div><div class="sv-chips"></div><textarea class="sv-ta" rows="3" maxlength="500" placeholder="여기에 적어 주세요"></textarea></div></div>' +
      '<div class="sv-cta" hidden>' + btnHTML("다음") + '</div>';
    var thumb = pg.querySelector(".sv-thumb");
    thumb.insertBefore(photo(g, 600), thumb.firstChild);
    pg.querySelector(".nm").textContent = g.n;
    var bodyEl = pg.querySelector(".sv-body"), cnt = pg.querySelector(".sv-cnt2"), clab = pg.querySelector(".cl"), opts = pg.querySelector(".sv-opts");
    var fb = pg.querySelector(".sv-forgot"), why = pg.querySelector(".sv-why"), chipsEl = pg.querySelector(".sv-chips"), ta = pg.querySelector(".sv-ta");
    var cta = pg.querySelector(".sv-cta"), nb = pg.querySelector(".btn"), busy = false;
    var memoNeeded = function () { return !!WHY[d.v]; };
    var ok = function () { return d.v > 0 && !!d.c && (!memoNeeded() || !!ta.value.trim()); };
    var leave = function () {
      pg.querySelector(".sv-bar i").style.width = (Math.max(rateI + 1, farIndex(list)) / list.length * 100) + "%";
      setTimeout(function () {
        if (editFromReview) { editFromReview = false; toReview(1); return; }
        if (rateI < list.length - 1) { rateI++; toRate(1); } else toReview(1);
      }, 600);
    };
    var commit = function () {
      busy = true;
      setAns(k, { v: d.v, c: d.c, chips: memoNeeded() ? d.chips.slice() : [], memo: memoNeeded() ? ta.value.trim() : (saved.v > 0 && !WHY[saved.v] ? saved.memo || "" : "") });
      leave();
    };
    var paintChips = function () {
      chipsEl.className = "sv-chips " + (WHY[d.v] ? WHY[d.v].tone : "");
      chipsEl.textContent = "";
      if (!WHY[d.v]) return;
      WHY[d.v].chips.forEach(function (c) {
        var b = h("button", "sv-chip" + (d.chips.indexOf(c) >= 0 ? " on" : "")); b.type = "button"; b.textContent = c;
        b.onclick = function () { var i = d.chips.indexOf(c); if (i >= 0) d.chips.splice(i, 1); else d.chips.push(c); b.classList.toggle("on", i < 0); };
        chipsEl.appendChild(b);
      });
    };
    var paint = function () {
      [].forEach.call(cnt.children, function (b) { b.classList.toggle("on", b.dataset.c === d.c); });
      [].forEach.call(opts.children, function (b) { b.classList.toggle("sel", +b.dataset.v === d.v); });
      fb.classList.toggle("gone", d.v > 0);   // 사라져도 자리는 그대로(세트가 밀려 내려가지 않게)
      if (d.c) clab.classList.remove("err");
      var m = memoNeeded(); bodyEl.classList.toggle("memo-on", m); cta.hidden = !m;
      if (m) { why.querySelector(".wq span").textContent = WHY[d.v].q; setBtn(nb, "다음", !ok()); }
    };
    COUNTS.forEach(function (o) {
      var b = h("button"); b.type = "button"; b.dataset.c = o.c; b.textContent = o.t;
      b.onclick = function () {
        if (busy) return;
        d.c = d.c === o.c ? "" : o.c;   // 고른 칸을 다시 누르면 빠진다
        paint();
        if (d.c && d.v > 0 && !memoNeeded()) commit();
      };
      cnt.appendChild(b);
    });
    SCALE.forEach(function (o) {
      var b = h("button", "sv-opt " + o.c, "<span></span><span class=\"sv-ck\">" + IC.chk + "</span>"); b.type = "button"; b.dataset.v = o.v;
      b.firstChild.textContent = o.t;
      b.onclick = function () {
        if (busy) return;
        if (d.v === o.v) { d.v = 0; d.chips = []; paint(); return; }   // 고른 칸을 다시 누르면 체크가 빠진다
        var wasMemo = memoNeeded();
        d.v = o.v;
        if (WHY[o.v]) { d.chips = saved.v === o.v ? (saved.chips || []).slice() : []; paintChips(); if (!wasMemo) ta.value = saved.v === o.v ? saved.memo || "" : ""; }   // 1↔5로 바꾸면 칩은 새 목록, 쓰던 글은 둔다
        else d.chips = [];
        paint(); b.classList.add("now"); setTimeout(function () { b.classList.remove("now"); }, 400); buzz();
        if (WHY[o.v]) {
          if (!wasMemo) setTimeout(function () { autoGrow(ta); ta.classList.remove("glow"); void ta.offsetWidth; ta.classList.add("glow"); }, 340);
          return;
        }
        if (!d.c) { clab.classList.add("err"); shake(cnt); return; }   // 횟수를 안 골랐으면 그 소제목이 빨개진다
        commit();
      };
      opts.appendChild(b);
    });
    fb.onclick = function () {
      if (busy || d.v > 0) return;
      busy = true; buzz();
      var ov = h("span", "sv-chk", "<b>" + IC.chk + "</b>"); fb.appendChild(ov);
      requestAnimationFrame(function () { fb.classList.add("confirming", "sel"); });
      setAns(k, { forgot: true, c: d.c, memo: saved.memo || "" }); leave();
    };
    ta.oninput = function () { autoGrow(ta); setBtn(nb, "다음", !ok()); };
    nb.addEventListener("pointerdown", function (e) { if (document.activeElement === ta) e.preventDefault(); });   // 키보드 위 버튼을 누르는 순간 칸이 blur되면 버튼이 제자리로 튀어 누름이 빠진다
    nb.onclick = function () {
      if (busy) return;
      if (ok()) ta.blur();
      if (!ok()) { shake(nb); if (!d.c) { clab.classList.add("err"); shake(cnt); } else ta.focus(); return; }
      commit();
    };
    if (saved.forgot) fb.classList.add("sel");
    var back = function () { if (busy) return; if (editFromReview) { editFromReview = false; toReview(-1); return; } if (rateI > 0) { rateI--; toRate(-1); } else toPick(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    pg.querySelector(".fwd").onclick = function () { if (busy) return; if (editFromReview) { editFromReview = false; toReview(1); return; } if (rateI < list.length - 1) { rateI++; toRate(1); } else toReview(1); };
    if (memoNeeded()) { paintChips(); ta.value = d.memo; }
    paint(); show(pg, dir);
    if (memoNeeded()) requestAnimationFrame(function () { autoGrow(ta); });
  }

  /* ── 3 고칠 게임 ── 누르면 그 장으로 가서 고치고, 끝나면 이 화면으로 돌아온다 */
  function toReview(dir) {
    var pg = h("div", "sv-pg");
    pg.innerHTML = topHTML("") + '<div class="sv-ttl"><h1>고칠 게임이 있으면<br>눌러 주세요</h1></div><div class="sv-body"></div><div class="sv-cta">' + btnHTML("다음") + '</div>';
    var body = pg.querySelector(".sv-body");
    var list = order();
    SCALE.concat([{ v: 0, t: FORGOT, c: "fg" }]).forEach(function (o) {
      var ks = list.filter(function (k) { var a = ans[k]; return a && !a.skip && (o.v ? a.v === o.v : a.forgot); });
      if (!ks.length) return;
      var lv = h("div", "sv-lv " + o.c, '<div class="sv-lvh"></div><div class="sv-lvg"></div>');
      lv.firstChild.textContent = o.t;
      ks.forEach(function (k) {
        var g = byK(k), m = h("button", "sv-mini"); m.type = "button";
        m.appendChild(photo(g, 200)); m.appendChild(h("span")).textContent = g.n;
        m.onclick = function () { rateI = list.indexOf(k); editFromReview = true; toRate(-1); };
        lv.lastChild.appendChild(m);
      });
      body.appendChild(lv);
    });
    pg.querySelector(".btn").onclick = function () {
      var miss = list.filter(function (k) { return !answered(k); });   // 2판 답처럼 아직 덜 끝난 게임이 있으면 그 장부터
      if (miss.length) { rateI = list.indexOf(miss[0]); editFromReview = false; toast("아직 덜 끝난 게임이 있어요"); toRate(1); return; }
      toSibling(1);
    };
    var back = function () { rateI = Math.max(0, list.length - 1); editFromReview = false; toRate(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    show(pg, dir);
  }

  /* ── 4 형제 ── */
  function toSibling(dir) {
    var cands = scored(order());
    var sel = cands.filter(function (k) { return ans[k].sib; });
    var pg = h("div", "sv-pg");
    pg.innerHTML = topHTML("") + '<div class="sv-ttl"><h1>형제와 같이 해도<br>괜찮았던 게임을 눌러 주세요</h1></div><div class="sv-body"></div><div class="sv-cta">' + btnHTML("다음") + '<button class="sv-link" type="button">형제와 해 본 적 없어요</button></div>';
    var commit = function () { cands.forEach(function (k) { ans[k].sib = sel.indexOf(k) >= 0; }); saveStore(); };
    pg.querySelector(".sv-body").appendChild(tileGrid(cands, sel, 0, null));
    var next = function () { commit(); if (bestPool().length) toPicks(1); else toMemo(1); };
    pg.querySelector(".btn").onclick = next;
    pg.querySelector(".sv-link").onclick = function () { sel.length = 0; next(); };
    var back = function () { commit(); toReview(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    if (!cands.length) { toPicksOrMemo(dir); return; }   // 점수 있는 게임이 없으면 묻지 않는다
    show(pg, dir);
  }
  function toPicksOrMemo(dir) { if (bestPool().length) toPicks(dir); else toMemo(dir); }

  /* ── 5 권하기 ── 「잘 맞았어요」 이상만, 0~3개, 순서 없음. 높은 칸부터, 같은 칸 안은 섞는다 */
  function bestPool() {
    var list = order(), out = [];
    [5, 4].forEach(function (v) { out = out.concat(shuffle(list.filter(function (k) { return ans[k] && !ans[k].skip && ans[k].v === v; }))); });
    return out;
  }
  function toPicks(dir) {
    var pool = bestPool();
    var sel = pool.filter(function (k) { return ans[k].best; }).slice(0, 3);
    var pg = h("div", "sv-pg");
    pg.innerHTML = topHTML("") + '<div class="sv-ttl"><h1>다른 선생님께 권하고 싶은<br>게임을 골라 주세요</h1></div><div class="sv-body"></div><div class="sv-cta">' + btnHTML("다음") + '</div>';
    var btn = pg.querySelector(".btn"), cntEl = pg.querySelector(".sv-cnt");
    var paint = function () { cntEl.textContent = sel.length + " / 3"; setBtn(btn, sel.length ? "다음" : "권할 게임 없이 넘어가기", false); };
    var commit = function () { order().forEach(function (k) { if (ans[k]) ans[k].best = sel.indexOf(k) >= 0; }); saveStore(); };
    pg.querySelector(".sv-body").appendChild(tileGrid(pool, sel, 3, function () { paint(); bump(btn); }));
    btn.onclick = function () { commit(); toMemo(1); };
    var back = function () { commit(); toSibling(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    paint(); show(pg, dir);
  }

  /* ── 6 더 남기고 싶은 말(선택) ── 쓴 글은 칸에 그대로(바로 고친다), 안 쓴 게임은 「적기」. 칩은 띄우지 않는다 */
  var memoTimers = {};
  function saveMemoLater(k, text, now) {
    clearTimeout(memoTimers[k]);
    var run = function () {
      delete memoTimers[k];
      var a = ans[k]; if (!a || a.skip) return;
      var t = String(text).trim();
      if (t === String(a.memo || "").trim()) return;
      if (WHY[a.v] && !t) return;   // 이유 글이 필요한 답은 비워서 보내지 않는다(칸을 떠나면 원래 글로 돌아간다)
      var copy = { v: a.v, forgot: a.forgot, c: a.c, chips: (a.chips || []).slice(), memo: t };
      if (a.forgot) delete copy.v;
      setAns(k, copy);
    };
    if (now) run(); else memoTimers[k] = setTimeout(run, 900);
  }
  function toMemo(dir) {
    var pg = h("div", "sv-pg");
    // 제출하기는 하단 고정이 아니라 목록 맨 아래(유성 10-01 「맨 밑으로 내려야 나오게」, 글을 쓸 때 키보드 위로 붙지 않게)
    pg.innerHTML = topHTML("") + '<div class="sv-ttl"><h1>더 남기고 싶은 말이 있으면<br>적어 주세요</h1></div><div class="sv-body sv-memo"><div class="sv-mlist"></div><div class="sv-endcta">' + btnHTML("제출하기") + '</div></div>';
    var body = pg.querySelector(".sv-mlist"), fields = [];
    var field = function (k, tx) {
      var a = ans[k], t = h("textarea", "sv-ta short"); t.rows = 2; t.maxLength = 500; t.placeholder = "여기에 적어 주세요"; t.value = a.memo || "";
      t.oninput = function () { autoGrow(t); saveMemoLater(k, t.value); };
      t.onblur = function () { if (WHY[ans[k].v] && !t.value.trim()) { t.value = ans[k].memo || ""; autoGrow(t); } saveMemoLater(k, t.value, true); };
      tx.appendChild(t); fields.push({ k: k, t: t }); requestAnimationFrame(function () { autoGrow(t); });
      return t;
    };
    order().filter(function (k) { return answered(k); }).forEach(function (k) {
      var a = ans[k], g = byK(k), s = null;
      SCALE.forEach(function (o) { if (o.v === a.v) s = o; });
      var r = h("div", "sv-mrow"); r.appendChild(photo(g, 300));
      var tx = h("div", "sv-mtx", '<b></b><span class="sv-dot ' + (s ? s.c : "fg") + '"></span>'); r.appendChild(tx);
      tx.querySelector("b").textContent = g.n; tx.querySelector(".sv-dot").textContent = s ? s.t : FORGOT;
      if (String(a.memo || "").trim()) field(k, tx);
      else { var ad = h("button", "sv-add", "적기"); ad.type = "button"; ad.onclick = function () { ad.remove(); field(k, tx).focus(); }; tx.appendChild(ad); }
      body.appendChild(r);
    });
    var send = function () { fields.forEach(function (f) { saveMemoLater(f.k, f.t.value, true); }); };
    var sent = false;
    pg.querySelector(".btn").onclick = function () { if (sent) return; sent = true; send(); finish(1); };
    var back = function () { send(); toPicksOrSibling(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    show(pg, dir);
  }
  function toPicksOrSibling(dir) { if (bestPool().length) toPicks(dir); else if (scored(order()).length) toSibling(dir); else toReview(dir); }

  /* ── 끝 ── */
  function finish(dir) {
    var list = scored(order());
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-done"><div class="sv-ring">' + IC.chk + '</div><h1>감사해요 ☺️</h1><p>남겨 주신 답으로 아이들에게<br>더 좋은 게임을 남길게요</p><p class="sv-wait" hidden></p></div><div class="sv-cta"><button class="sv-link" type="button">처음부터 다시 보기</button></div>';
    var waitEl = pg.querySelector(".sv-wait");
    var paintWait = function () { var n = pending().length; waitEl.hidden = !n; waitEl.textContent = n ? "아직 보내지 못한 답이 " + n + "개 있어요. 인터넷이 되는 곳에서 이 화면을 다시 열어 주세요" : ""; };
    pg.querySelector(".sv-link").onclick = function () { toPick(-1); };
    pg._back = function () { toMemo(-1); };
    paintWait(); show(pg, dir);
    pending().forEach(send);
    picksDue = true; saveStore(); sendPicks(0);
    setTimeout(paintWait, 3000);
  }
  /* 권함·형제 전송. 점수가 서버에 적힌 게임에만 붙는다 → 방금 보낸 답이 아직 안 닿았으면(unknown_game) 조금 기다렸다 다시.
     끝내 못 보내면 picksDue가 남아 다음에 열 때(loadAnswers 뒤) 다시 보낸다 */
  var picksBusy = false;
  function sendPicks(n) {
    if (picksBusy && !n) return;
    if (!games.length) return;   // 목록이 없으면 order()가 비어 권함·형제를 통째로 지워 보낸다 → 다음 기회에
    picksBusy = true;
    var list = scored(order());
    var best = list.filter(function (k) { return ans[k].best && ans[k].v >= 4; }), sib = list.filter(function (k) { return ans[k].sib; });
    var giveUp = function () { picksBusy = false; toast("권하고 싶은 게임을 아직 보내지 못했어요. 다음에 이 링크를 열면 다시 보내요"); };
    post({ action: "survey_picks", k: KEY, name: name, best: best, sib: sib }, true).then(function (d) {
      if (d && d.ok) { picksBusy = false; picksDue = false; saveStore(); return; }
      if (d && d.error === "unknown_game" && n < 3) { wait(2500).then(function () { sendPicks(n + 1); }); return; }
      giveUp();
    }).catch(giveUp);
  }

  /* ── 시작 ── */
  warmGas();
  loadStore();
  if (!KEY && !DEMO) { gate(); return; }
  loadGames().catch(function () {});
  if (name) { toPick(1); loadAnswers(); loadNames().catch(function () {}); }
  else toNames(1);
})();
