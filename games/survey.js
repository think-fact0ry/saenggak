/* 보드게임 교사 설문 2판(23, 2026-10-01 유성 재설계) — survey.html 전용. 백엔드 = scripts/23_보드게임목록(survey_names·survey_load·survey_save·survey_picks).
   흐름: 열쇠(?k=) → 이름 → 해 본 게임 고르기(92종 사진) → 고른 게임만 한 장씩 5단(누르면 0.6초 뒤 다음, ← → 로 오감)
         → 고칠 게임이 있으면 눌러 주세요(답별로 모아 보기, 누르면 시트) → 먼저 권할 3 → 안 가져갈 3 → 끝.
   저장은 낙관적이다: 답을 누르는 즉시 다음 장으로 가고 서버엔 뒤에서 보낸다. 못 보낸 답은 기기에 남아(p) 다음에 열 때·끝낼 때 다시 보낸다.
   고르기에서 뺀 게임 중 서버에 답이 있던 것 = 안 해봄(skip)으로 보낸다.
   ?demo=1 = 서버를 안 부르는 가짜 명부·목록(열쇠 없이 열린다).
   ⚠️ 서버·토스트·사진 헬퍼는 games.js와 같은 코드다(games.js는 로드되면 목록 흐름을 스스로 시작해 같이 못 싣는다) — 한쪽을 고치면 다른 쪽도(3-G). */
(function () {
  "use strict";
  var GAS_EXEC = "https://script.google.com/macros/s/AKfycbyRilxEvRNPTl55yYPraNUGbdz6SbQDOdrdyFiAyfx4aHMdbXIoPhAx8E1HZsBj90rB_w/exec";
  var DEMO = /[?&]demo=1/.test(location.search);
  var KEY = (location.search.match(/[?&]k=([^&]+)/) || [])[1] || "";
  var STORE = "tf_survey_v2", GAMES_CACHE = "tf_games_v1";
  var SCALE = [
    { v: 5, t: "아이가 또 하자고 했어요", c: "p2" },
    { v: 4, t: "잘 맞았어요", c: "p1" },
    { v: 3, t: "보통이에요", c: "z" },
    { v: 2, t: "잘 안 맞았어요", c: "n1" },
    { v: 1, t: "아이가 그만두고 싶어했어요", c: "n2" }
  ];
  var FORGOT = "잘 기억이 안 나요";
  var IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    chk: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
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
  var demoStore = { "박서연": { "도블": { skip: false, v: 5, forgot: false, best: 0, no: 0 } } };
  function demoPost(obj) {
    return wait(obj.action === "survey_save" ? 700 : 400).then(function () {
      if (obj.action === "games") return { ok: true, games: JSON.parse(JSON.stringify(demoGames)) };
      if (obj.action === "survey_names") return { ok: true, names: demoNames.slice() };
      if (obj.action === "survey_load") return { ok: true, answers: JSON.parse(JSON.stringify(demoStore[obj.name] || {})) };
      if (obj.action === "survey_save") {
        if (obj.key === "스택버거") return { ok: false, error: "server" };   // 「저장 안 됨」 길
        var a = obj.a || {}; (demoStore[obj.name] = demoStore[obj.name] || {})[obj.key] = { skip: !!a.skip, v: a.v || 0, forgot: !!a.forgot, best: 0, no: 0 };
        window.__tfSaved = obj; return { ok: true };
      }
      if (obj.action === "survey_picks") { window.__tfPicks = obj; return { ok: true }; }
      return { ok: false, error: "unknown_action" };
    });
  }

  /* ── 공통 UI ── */
  var toastT;
  function toast(msg, ok) {
    var t = document.getElementById("toast");
    t.querySelector(".tx").textContent = msg;
    t.classList.toggle("okk", !!ok); t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
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
  document.addEventListener("pointerdown", function (e) { var b = e.target.closest(".btn"); if (b) pressRipple(b, e); });
  function btnHTML(label) { return '<button class="btn" type="button"><span class="bl">' + label + '</span></button>'; }
  function setBtn(b, label, off) { b.querySelector(".bl").textContent = label; b.setAttribute("aria-disabled", off ? "true" : "false"); }

  /* 화면 전환: 새 화면이 오른쪽에서 들어온다(dir<0이면 왼쪽에서). 휴대폰 뒤로가기 = 지금 화면의 ← 와 같다 */
  var curPg = null;
  function show(pg, dir) {
    var old = curPg; curPg = pg;
    if (!old || !dir) { if (old) old.remove(); app.appendChild(pg); return; }   // 첫 화면은 미끄러지지 않는다
    pg.classList.add(dir < 0 ? "off-l" : "off-r"); app.appendChild(pg);
    void pg.offsetWidth;   // rAF는 뒤에 있는 탭에서 멈춘다 → 강제 리플로우로 시작점을 확정
    pg.classList.remove("off-r", "off-l");
    old.classList.add(dir < 0 ? "off-r" : "off-l"); setTimeout(function () { old.remove(); }, 380);
  }
  history.replaceState({ sv: 0 }, ""); history.pushState({ sv: 1 }, "");
  window.addEventListener("popstate", function () {
    if (curPg && curPg._back) { curPg._back(); history.pushState({ sv: 1 }, ""); }
  });

  /* ── 상태 ── */
  var games = [], name = "", ans = {}, picked = [], rateI = 0;
  // ans[k] = {skip, v, forgot, best, no, p(못 보낸 답)} / picked = 지금 고른 게임 키(고르기 화면 순서)
  function loadStore() {
    if (DEMO) return;
    try { var s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.name) { name = s.name; ans = s.ans || {}; picked = s.picked || []; } } catch (e) {}
  }
  function saveStore() { if (DEMO) return; try { localStorage.setItem(STORE, JSON.stringify({ name: name, ans: ans, picked: picked })); } catch (e) {} }
  function byK(k) { for (var i = 0; i < games.length; i++) if (games[i].k === k) return games[i]; return null; }
  function sorted() { return games.slice().sort(function (a, b) { return a.n.localeCompare(b.n, "ko"); }); }
  function order() { var ks = sorted().map(function (g) { return g.k; }); return picked.filter(byK).sort(function (a, b) { return ks.indexOf(a) - ks.indexOf(b); }); }
  function answered(k) { var a = ans[k]; return !!a && !a.skip && (a.v > 0 || a.forgot); }
  function farIndex(list) { for (var i = 0; i < list.length; i++) if (!answered(list[i])) return i; return list.length; }
  function scored(list) { return list.filter(function (k) { return ans[k] && ans[k].v > 0 && !ans[k].skip; }); }

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
  function send(k) {
    var a = ans[k]; if (!a || !a.p || inflight[k]) return;
    inflight[k] = true;
    var body = a.skip ? { skip: true } : a.forgot ? { forgot: true } : { v: a.v };
    post({ action: "survey_save", k: KEY, name: name, key: k, a: body }, true).then(function (d) {
      if (d && d.ok) { if (ans[k] === a) { delete a.p; saveStore(); } return; }
      fail(d && d.error);
    }).catch(function () { fail("net"); }).then(function () { delete inflight[k]; });
  }
  function fail(code) {
    if (code === "bad_key" || code === "nokey") { gate(); return; }
    if (code === "unknown_name") { toast("명부에서 이름을 찾지 못했어요. 이름을 다시 선택해 주세요"); toNames(-1); return; }
    toast("답을 아직 보내지 못했어요. 이 폰에 남겨 두었다가 다시 보낼게요");
  }
  function setAns(k, a) { a.p = 1; var old = ans[k] || {}; a.best = old.best || 0; a.no = old.no || 0; if (!(a.v > 0)) { a.best = 0; a.no = 0; } ans[k] = a; saveStore(); send(k); }
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
    if (name) pg._back = function () { toPick(1); };
    show(pg, dir);
  }
  function loadNames() {
    return post({ action: "survey_names", k: KEY }, true).then(function (d) {
      if (!(d && d.ok)) { if (d && (d.error === "bad_key" || d.error === "nokey")) { gate(); return null; } throw new Error(); }
      namesCache = d.names || []; return namesCache;
    });
  }
  function pickName(n) {
    if (n !== name) { name = n; ans = {}; picked = []; }
    saveStore(); loadAnswers(); toPick(1);
  }
  /* 서버에 적힌 내 답을 받아 합친다(다른 기기에서 이어 하기). 아직 못 보낸 답(p)은 이 기기 것이 이긴다 → 다시 보낸다 */
  function loadAnswers() {
    post({ action: "survey_load", k: KEY, name: name }, true).then(function (d) {
      if (!(d && d.ok)) return;
      var srv = d.answers || {};
      Object.keys(srv).forEach(function (k) {
        if (ans[k] && ans[k].p) return;
        ans[k] = srv[k];
        var on = answered(k);
        if (on && picked.indexOf(k) < 0) picked.push(k);
        if (srv[k].skip) picked = picked.filter(function (x) { return x !== k; });
      });
      saveStore(); pending().forEach(send);
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

  /* ── 1 해 본 게임 고르기 ── */
  function toPick(dir) {
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-top"><span></span><button class="sv-who" type="button" aria-label="이름 바꾸기"></button></div><div class="sv-ttl"><h1>아이들과 해 본 게임을<br>모두 눌러 주세요</h1></div><div class="sv-body"><div class="sv-grid"></div></div><div class="sv-cta">' + btnHTML("") + '</div>';
    pg.querySelector(".sv-who").textContent = name;
    pg.querySelector(".sv-who").onclick = function () { toNames(-1); };
    var grid = pg.querySelector(".sv-grid"), btn = pg.querySelector(".btn");
    var paintBtn = function () { var n = order().length; setBtn(btn, n ? n + "개 골랐어요" : "해 본 게임을 눌러 주세요", !n); };
    var draw = function () {
      grid.textContent = "";
      if (!games.length) { grid.innerHTML = '<div class="sv-msg" style="grid-column:1/-1">목록을 불러오는 중이에요</div>'; paintBtn(); return; }
      sorted().forEach(function (g) {
        var b = h("button", "sv-tile" + (picked.indexOf(g.k) >= 0 ? " on" : "")); b.type = "button";
        var ph = photo(g, 300); ph.insertAdjacentHTML("beforeend", '<span class="sv-badge">' + IC.chk + '</span>');
        b.appendChild(ph); b.appendChild(h("span", "t")).textContent = g.n;
        b.onclick = function () {
          var i = picked.indexOf(g.k);
          if (i >= 0) { picked.splice(i, 1); b.classList.remove("on"); b.classList.add("out"); setTimeout(function () { b.classList.remove("out"); }, 200); }
          else { picked.push(g.k); b.classList.remove("out"); b.classList.add("on"); buzz(); }
          saveStore(); paintBtn(); bump(btn);
        };
        grid.appendChild(b);
      });
      paintBtn();
    };
    btn.onclick = function () {
      var list = order();
      if (!list.length) { shake(btn); toast("아직 고른 게임이 없어요. 해 본 게임 사진을 눌러 주세요"); return; }
      // 고르기에서 뺀 게임 중 답이 있던 것 = 안 해봄으로
      Object.keys(ans).forEach(function (k) { if (list.indexOf(k) < 0 && !ans[k].skip && (ans[k].v > 0 || ans[k].forgot)) setAns(k, { skip: true }); });
      var far = farIndex(list);
      if (far >= list.length) toReview(1); else { rateI = far; toRate(1); }
    };
    pg._repaint = draw;
    draw(); show(pg, dir);
  }

  /* ── 2 한 장 한 질문 ── */
  function toRate(dir) {
    var list = order(), k = list[rateI], g = byK(k);
    if (!g) { toPick(-1); return; }
    var far = farIndex(list), a = ans[k] || {};
    var pg = h("div", "sv-pg sv-rate");
    pg.innerHTML = '<div class="sv-top"><button class="sv-ico back" type="button" aria-label="뒤로">' + IC.back + '</button><span class="sv-cnt">' + (rateI + 1) + " / " + list.length + '</span><button class="sv-ico fwd" type="button" aria-label="앞으로"' + (rateI < far ? "" : " disabled") + ">" + IC.fwd + '</button></div>' +
      '<div class="sv-bar"><i style="width:' + (Math.max(rateI, far) / list.length * 100) + '%"></i></div><div class="sv-body"><div class="sv-stack"><div class="ph"></div><p class="sv-gn"></p><p class="sv-gq">아이들에게 어땠나요?</p><div class="sv-opts"></div><button class="sv-forgot" type="button">' + FORGOT + '</button></div></div>';
    pg.querySelector(".ph").replaceWith(photo(g, 600));
    pg.querySelector(".sv-gn").textContent = g.n;
    var opts = pg.querySelector(".sv-opts"), busy = false;
    var next = function () {
      pg.querySelector(".sv-bar i").style.width = (Math.max(rateI + 1, farIndex(list)) / list.length * 100) + "%";
      setTimeout(function () { if (rateI < list.length - 1) { rateI++; toRate(1); } else toReview(1); }, 600);
    };
    SCALE.forEach(function (o) {
      var b = h("button", "sv-opt " + o.c + (a.v === o.v && !a.skip ? " sel" : ""), "<span></span><span class=\"sv-ck\">" + IC.chk + "</span>"); b.type = "button";
      b.firstChild.textContent = o.t;
      b.onclick = function () {
        if (busy) return; busy = true;
        [].forEach.call(opts.children, function (x) { x.classList.remove("sel", "now"); });
        b.classList.add("sel", "now"); buzz();
        setAns(k, { v: o.v }); next();
      };
      opts.appendChild(b);
    });
    var fb = pg.querySelector(".sv-forgot");
    if (a.forgot && !a.skip) fb.classList.add("sel");
    fb.onclick = function () {
      if (busy) return; busy = true;
      [].forEach.call(opts.children, function (x) { x.classList.remove("sel", "now"); });
      var ov = h("span", "sv-chk", "<b>" + IC.chk + "</b>"); fb.appendChild(ov); buzz();
      requestAnimationFrame(function () { fb.classList.add("confirming", "sel"); });
      setAns(k, { forgot: true }); next();
    };
    var back = function () { if (busy) return; if (rateI > 0) { rateI--; toRate(-1); } else toPick(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    pg.querySelector(".fwd").onclick = function () { if (busy) return; if (rateI < list.length - 1) { rateI++; toRate(1); } else toReview(1); };
    show(pg, dir);
  }

  /* ── 3 고칠 게임 ── */
  function toReview(dir) {
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-top"><button class="sv-ico back" type="button" aria-label="뒤로">' + IC.back + '</button><span></span><span style="width:40px"></span></div><div class="sv-ttl"><h1>고칠 게임이 있으면 눌러 주세요</h1></div><div class="sv-body"></div><div class="sv-cta">' + btnHTML("다음") + '</div><div class="sv-dim"></div><div class="sv-sheet" role="dialog" aria-label="답 고치기"></div>';
    var body = pg.querySelector(".sv-body"), dim = pg.querySelector(".sv-dim"), sheet = pg.querySelector(".sv-sheet");
    var moved = null;
    var mini = function (k) {
      var g = byK(k); var m = h("button", "sv-mini" + (k === moved ? " moved" : "")); m.type = "button";
      m.appendChild(photo(g, 200)); m.appendChild(h("span")).textContent = g.n; m.onclick = function () { open(k); }; return m;
    };
    var draw = function () {
      body.textContent = "";
      var list = order();
      SCALE.concat([{ v: 0, t: FORGOT, c: "fg" }]).forEach(function (o) {
        var ks = list.filter(function (k) { var a = ans[k]; return a && !a.skip && (o.v ? a.v === o.v : a.forgot); });
        if (!ks.length) return;
        var lv = h("div", "sv-lv " + o.c, '<div class="sv-lvh"></div><div class="sv-lvg"></div>');
        lv.firstChild.textContent = o.t;
        ks.forEach(function (k) { lv.lastChild.appendChild(mini(k)); });
        body.appendChild(lv);
      });
      moved = null;
    };
    var close = function () { dim.classList.remove("on"); sheet.classList.remove("on"); sheet.style.transform = ""; };
    var open = function (k) {
      var g = byK(k), a = ans[k] || {}, busy = false;
      sheet.innerHTML = '<div class="hd"><span class="handle"></span><div class="who"><div class="ph"></div><b></b></div></div><div class="sv-opts"></div><button class="sv-forgot" type="button">' + FORGOT + '</button>';
      sheet.querySelector(".ph").replaceWith(photo(g, 200)); sheet.querySelector(".who b").textContent = g.n;
      var opts = sheet.querySelector(".sv-opts");
      SCALE.forEach(function (o) {
        var b = h("button", "sv-opt " + o.c + (a.v === o.v ? " sel" : ""), "<span></span><span class=\"sv-ck\">" + IC.chk + "</span>"); b.type = "button";
        b.firstChild.textContent = o.t;
        b.onclick = function () { if (busy) return; busy = true; [].forEach.call(opts.children, function (x) { x.classList.remove("sel", "now"); }); b.classList.add("sel", "now"); buzz();
          setTimeout(function () { setAns(k, { v: o.v }); moved = k; close(); draw(); }, 600); };
        opts.appendChild(b);
      });
      var fb = sheet.querySelector(".sv-forgot"); if (a.forgot) fb.classList.add("sel");
      fb.onclick = function () { if (busy) return; busy = true; setTimeout(function () { setAns(k, { forgot: true }); moved = k; close(); draw(); }, 300); fb.classList.add("sel"); };
      var hd = sheet.querySelector(".hd"), y0 = null, dy = 0;   // 위 영역을 아래로 끌면 닫힘(§4.3-5)
      hd.onpointerdown = function (e) { y0 = e.clientY; dy = 0; hd.setPointerCapture(e.pointerId); sheet.style.transition = "none"; };
      hd.onpointermove = function (e) { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = "translateY(" + dy + "px)"; };
      hd.onpointerup = hd.onpointercancel = function () { if (y0 == null) return; y0 = null; sheet.style.transition = ""; if (dy > 80) close(); else sheet.style.transform = ""; };
      requestAnimationFrame(function () { dim.classList.add("on"); sheet.classList.add("on"); });
    };
    dim.onclick = close;
    pg.querySelector(".btn").onclick = function () { toPicks("best", 1); };
    var back = function () { if (sheet.classList.contains("on")) { close(); return; } rateI = Math.max(0, order().length - 1); toRate(-1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    pg._repaint = draw;
    draw(); show(pg, dir);
  }

  /* ── 4·5 먼저 권할 3 / 안 가져갈 3 ── */
  function toPicks(kind, dir) {
    var best = kind === "best", field = best ? "best" : "no";
    var cands = scored(order());
    if (best && cands.length < 2) { toPicks("no", dir); return; }   // 점수 있는 게임이 0~1개면 순위를 고를 게 없다
    var sel = cands.filter(function (k) { return ans[k][field] > 0; }).sort(function (a, b) { return ans[a][field] - ans[b][field]; });
    var need = best ? Math.min(3, cands.length) : 0;
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-top"><button class="sv-ico back" type="button" aria-label="뒤로">' + IC.back + '</button><span class="sv-cnt"></span><span style="width:40px"></span></div>' +
      '<div class="sv-ttl"><h1>' + (best ? "다른 선생님께 먼저 권하고 싶은 게임 " + need + "개를 골라 주세요" : "다음 달에 안 가져갈 게임이 있나요?") + '</h1><p>' + (best ? "누른 순서대로 번호가 붙어요" : "3개까지 고를 수 있어요") + '</p></div>' +
      '<div class="sv-body"><div class="sv-grid"></div></div><div class="sv-cta">' + btnHTML("") + (best ? "" : '<button class="sv-link" type="button">없어요</button>') + '</div>';
    var grid = pg.querySelector(".sv-grid"), btn = pg.querySelector(".btn");
    var paint = function () {
      [].forEach.call(grid.children, function (t) { var i = sel.indexOf(t.dataset.k); t.classList.toggle("on", i >= 0); t.querySelector(".sv-ord").textContent = i >= 0 ? i + 1 : ""; });
      setBtn(btn, best ? (sel.length >= need ? "다음" : need + "개 골라 주세요") : (sel.length ? "끝내기" : "끝내기"), sel.length < need);
      pg.querySelector(".sv-cnt").textContent = sel.length + " / " + (best ? need : 3);
    };
    // 안 가져갈 후보에서 「먼저 권할」 게임은 뺀다(두 목록에 같은 게임 금지)
    var pool = best ? cands : cands.filter(function (k) { return !(ans[k].best > 0); });
    if (!pool.length) { finish(dir); return; }   // 남은 후보가 없으면 묻지 않는다
    pool.forEach(function (k) {
      var g = byK(k), b = h("button", "sv-tile"); b.type = "button"; b.dataset.k = k;
      var ph = photo(g, 300); ph.insertAdjacentHTML("beforeend", '<span class="sv-ord' + (best ? "" : " no") + '"></span>');
      b.appendChild(ph); b.appendChild(h("span", "t")).textContent = g.n;
      b.onclick = function () {
        var i = sel.indexOf(k);
        if (i >= 0) sel.splice(i, 1);
        else { if (sel.length >= (best ? need : 3)) { shake(b); toast((best ? need : 3) + "개까지 고를 수 있어요. 바꾸려면 하나를 먼저 빼 주세요"); return; } sel.push(k); buzz(); }
        paint(); bump(btn);
      };
      grid.appendChild(b);
    });
    var commit = function () { cands.forEach(function (k) { ans[k][field] = sel.indexOf(k) + 1; }); saveStore(); };
    btn.onclick = function () {
      if (sel.length < need) { shake(btn); toast("아직 " + sel.length + "개예요. " + need + "개를 골라 주세요"); return; }
      commit(); if (best) toPicks("no", 1); else finish(1);
    };
    var skip = pg.querySelector(".sv-link"); if (skip) skip.onclick = function () { sel.length = 0; commit(); finish(1); };
    var back = function () { commit(); if (best || cands.length < 2) toReview(-1); else toPicks("best", -1); };
    pg.querySelector(".back").onclick = back; pg._back = back;
    paint(); show(pg, dir);
  }

  /* ── 끝 ── */
  function finish(dir) {
    var list = scored(order());
    var rank = function (f) { return list.filter(function (k) { return ans[k][f] > 0; }).sort(function (a, b) { return ans[a][f] - ans[b][f]; }); };
    var pg = h("div", "sv-pg");
    pg.innerHTML = '<div class="sv-done"><div class="sv-ring">' + IC.chk + '</div><h1>고마워요, 선생님</h1><p>다른 선생님들이 게임을 고를 때 쓸게요</p><p class="sv-wait" hidden></p></div><div class="sv-cta"><button class="sv-link" type="button">답 고치기</button></div>';
    var waitEl = pg.querySelector(".sv-wait");
    var paintWait = function () { var n = pending().length; waitEl.hidden = !n; waitEl.textContent = n ? "아직 보내지 못한 답이 " + n + "개 있어요. 인터넷이 되는 곳에서 이 화면을 다시 열어 주세요" : ""; };
    pg.querySelector(".sv-link").onclick = function () { toReview(-1); };
    pg._back = function () { toReview(-1); };
    paintWait(); show(pg, dir);
    pending().forEach(send);
    // 순위는 점수가 서버에 적힌 게임에만 붙는다 → 방금 보낸 답이 아직 안 닿았으면(unknown_game) 조금 기다렸다 다시
    var sendPicks = function (n) {
      post({ action: "survey_picks", k: KEY, name: name, best: rank("best"), no: rank("no") }, true).then(function (d) {
        if (d && d.ok) return;
        if (d && d.error === "unknown_game" && n < 3) { wait(2500).then(function () { sendPicks(n + 1); }); return; }
        toast("먼저 권할 게임을 아직 보내지 못했어요. 이 화면을 다시 열면 다시 보내요");
      }).catch(function () { toast("먼저 권할 게임을 아직 보내지 못했어요. 이 화면을 다시 열면 다시 보내요"); });
    };
    sendPicks(0);
    setTimeout(paintWait, 3000);
  }

  /* ── 시작 ── */
  warmGas();
  loadStore();
  if (!KEY && !DEMO) { gate(); return; }
  loadGames().catch(function () {});
  if (name) { toPick(1); loadAnswers(); loadNames().catch(function () {}); }
  else toNames(1);
})();
