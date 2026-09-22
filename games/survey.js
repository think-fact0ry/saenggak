/* 보드게임 교사 설문(23) — survey.html 전용. 백엔드 = scripts/23_보드게임목록(survey_names·survey_load·survey_save).
   흐름: 열쇠(?k=) → 이름 고르기 → 목록(사진 92종) → 게임 화면(예/아니오 3 + 횟수 + 한 줄, 「안 해봤어요」는 척도 밖).
   저장은 낙관적이다: 누르면 바로 목록으로 돌아가 카드에 체크가 뜨고, 서버가 거절하면 그 카드에 「저장 안 됨」이 남아 다시 열어 저장하게 한다.
   ?demo=1 = 서버를 안 부르는 가짜 명부·목록(열쇠 없이 열린다).
   ⚠️ 서버·토스트·사진 헬퍼는 games.js와 같은 코드다(games.js는 로드되면 목록 흐름을 스스로 시작해 같이 못 싣는다) — 한쪽을 고치면 다른 쪽도(3-G). */
(function () {
  "use strict";
  var GAS_EXEC = "https://script.google.com/macros/s/AKfycbyRilxEvRNPTl55yYPraNUGbdz6SbQDOdrdyFiAyfx4aHMdbXIoPhAx8E1HZsBj90rB_w/exec";
  var DEMO = /[?&]demo=1/.test(location.search);
  var KEY = (location.search.match(/[?&]k=([^&]+)/) || [])[1] || "";
  var STORE = "tf_survey_v1", GAMES_CACHE = "tf_games_v1";
  /* 모두가 답하는 5종(관대함 보정의 공통 앵커 — 사전계획 §4). 목록 맨 앞에 「먼저」로 온다. ⚠️잠정 — 유성 확정 전 */
  var ANCHORS = ["할리갈리", "도블", "uno", "젬블로", "텀블링몽키"];
  var $ = function (id) { return document.getElementById(id); };
  var IC = { box: '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
             chk: '<svg viewBox="0 0 24 24"><polyline points="4 12 9 17 20 6"/></svg>',
             x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' };

  /* ── 서버 ── */
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
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function warmGas() { if (DEMO) return; try { fetch(GAS_EXEC, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(function () {}); } catch (e) {} }

  /* ── 가짜 서버(?demo=1) ── */
  function demoImg(w, h, fill) {
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '"><rect width="' + w + '" height="' + h + '" rx="12" fill="' + fill + '"/><rect x="' + w * 0.12 + '" y="' + h * 0.2 + '" width="' + w * 0.76 + '" height="' + h * 0.18 + '" rx="6" fill="#fff" opacity=".85"/></svg>');
  }
  var demoGames = [
    { k: "할리갈리", n: "할리갈리", c: 3, o: 0, p: demoImg(300, 300, "#3a8a5f") },
    { k: "도블", n: "도블", c: 3, o: 0, p: demoImg(200, 200, "#D25357") },
    { k: "개구리알먹기", n: "개구리알 먹기", c: 2, o: 0, p: demoImg(300, 300, "#57a77a") },
    { k: "늑대가나타났다", n: "늑대가 나타났다!", c: 5, o: 1, p: demoImg(420, 140, "#f5a623") },
    { k: "딕인", n: "딕인", c: 4, o: 0, p: "" },
    { k: "메모리체스", n: "메모리체스", c: 3, o: 0, p: demoImg(180, 360, "#525966") },
    { k: "스택버거", n: "스택버거", c: 1, o: 1, p: "" },
    { k: "쿠키박스티니핑", n: "쿠키박스 티니핑", c: 10, o: 0, p: demoImg(360, 260, "#7bcb9c") }
  ];
  var demoNames = ["김하늘", "박서연", "이도윤", "정민준", "최지우"];
  var demoStore = { "박서연": { "도블": { skip: false, q1: "예", q2: "예", q3: "예", n: "5번 넘게", memo: "" } } };
  function demoPost(obj) {
    return wait(obj.action === "survey_save" ? 900 : 500).then(function () {
      if (obj.action === "games") return { ok: true, games: JSON.parse(JSON.stringify(demoGames)) };
      if (obj.action === "survey_names") return { ok: true, names: demoNames.slice() };
      if (obj.action === "survey_load") return { ok: true, answers: JSON.parse(JSON.stringify(demoStore[obj.name] || {})) };
      if (obj.action === "survey_save") {
        if (obj.key === "스택버거") return { ok: false, error: "server" };   // 하니스가 「저장 안 됨」 길을 본다
        (demoStore[obj.name] = demoStore[obj.name] || {})[obj.key] = obj.a; window.__tfSaved = obj; return { ok: true };
      }
      return { ok: false, error: "unknown_action" };
    });
  }

  /* ── 공통 UI ── */
  var toastT;
  function toast(msg, ok) {
    var t = $("toast");
    t.querySelector(".tx").textContent = msg;
    t.classList.toggle("okk", !!ok);
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }
  function shake(el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
  function pressRipple(btn, e) {
    var r = btn.getBoundingClientRect();
    var x = (e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left;
    var rs = Math.ceil(Math.hypot(Math.max(x, r.width - x), r.height / 2) / 15) + 1;
    var rip = document.createElement("span"); rip.className = "rip";
    rip.style.left = x + "px"; rip.style.top = (r.height / 2) + "px"; rip.style.setProperty("--rs", rs);
    btn.appendChild(rip); requestAnimationFrame(function () { rip.classList.add("go"); });
    setTimeout(function () { rip.remove(); }, 480);
  }
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest(".btn");
    if (b && !b.disabled) pressRipple(b, e);
  });
  function show(id) {
    [].forEach.call(document.querySelectorAll(".screen"), function (s) { s.classList.toggle("active", s.id === id); });
    window.scrollTo(0, 0); fades();
  }
  function fades() {
    var wrap = $("wrap"); if (!wrap) return;
    var over = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || 0;
    wrap.classList.toggle("moreTop", over > 6 && y > 6);
    wrap.classList.toggle("more", over > 6 && y < over - 6);
  }
  window.addEventListener("scroll", fades, { passive: true });
  window.addEventListener("resize", fades);

  /* ── 상태 ── */
  var games = [], name = "", answers = {}, query = "", onlyTodo = false, cur = null, draft = {};
  function loadStore() {
    if (DEMO) return;
    try { var s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.name) { name = s.name; answers = s.answers || {}; } } catch (e) {}
  }
  function saveStore() {
    if (DEMO) return;
    try { localStorage.setItem(STORE, JSON.stringify({ name: name, answers: answers })); } catch (e) {}
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s/g, ""); }
  function photoUrl(p) { return p.indexOf("data:") === 0 ? p : "https://drive.google.com/thumbnail?id=" + encodeURIComponent(p) + "&sz=w600"; }
  function isAnchor(k) { return ANCHORS.indexOf(k) >= 0; }
  function answered(k) { return !!answers[k]; }

  function setPhoto(ph, g) {
    var old = ph.querySelector("img,.noph"); if (old) old.remove();
    if (!g.p) { var n = document.createElement("span"); n.className = "noph"; n.innerHTML = IC.box; ph.insertBefore(n, ph.firstChild); return; }
    var img = document.createElement("img");
    img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.onerror = function () {   // Drive 썸네일이 막히면 서버 예비 길(thumb) 한 번
      img.onerror = function () { img.remove(); var n = document.createElement("span"); n.className = "noph"; n.innerHTML = IC.box; ph.insertBefore(n, ph.firstChild); };
      if (DEMO) { img.onerror(); return; }
      post({ action: "thumb", key: g.k }).then(function (d) { if (d && d.ok) img.src = "data:image/jpeg;base64," + d.img; else img.onerror(); }).catch(function () { img.onerror(); });
    };
    img.src = photoUrl(g.p);
    ph.insertBefore(img, ph.firstChild);
  }

  /* ── 이름 ── */
  function renderNames(list) {
    var box = $("names"); box.textContent = "";
    list.forEach(function (n) {
      var b = document.createElement("button"); b.type = "button"; b.className = "nmb"; b.textContent = n;
      b.addEventListener("click", function () { pickName(n); });
      box.appendChild(b);
    });
  }
  function loadNames() {
    return post({ action: "survey_names", k: KEY }, true).then(function (d) {
      if (!(d && d.ok)) { if (d && (d.error === "bad_key" || d.error === "nokey")) { show("s-gate"); return null; } throw new Error(); }
      renderNames(d.names || []); return d.names;
    });
  }
  function pickName(n) {
    if (n !== name) { name = n; answers = {}; }
    saveStore();
    enterList();
  }

  /* ── 목록 ── */
  function enterList() {
    $("who").textContent = name;
    show("s-list");
    loadGames();
    loadAnswers();
  }
  function loadGames() {
    var cached = null;
    if (!DEMO) { try { cached = JSON.parse(localStorage.getItem(GAMES_CACHE) || "null"); } catch (e) {} }
    if (cached && cached.length) { games = cached; render(); } else skeleton();
    post({ action: "games" }, true).then(function (d) {
      if (!(d && d.ok)) throw new Error();
      games = d.games || []; render();
      if (!DEMO) { try { localStorage.setItem(GAMES_CACHE, JSON.stringify(games)); } catch (e) {} }
    }).catch(function () {
      if (games.length) { toast("새 목록을 받지 못해 지난번 목록을 보여 드려요"); return; }
      var grid = $("grid");
      grid.innerHTML = '<div class="errbox"><p>목록을 불러오지 못했어요.<br>잠시 후 다시 시도해 주세요.</p><button class="retry-btn" id="retryBtn">다시 시도</button></div>';
      $("retryBtn").onclick = loadGames;
      fades();
    });
  }
  /* 서버에 적힌 내 답을 받아 합친다(다른 기기에서 이어 적기). 아직 못 보낸 답(p)은 내 것이 이긴다 → 다시 보낸다 */
  function loadAnswers() {
    post({ action: "survey_load", k: KEY, name: name }, true).then(function (d) {
      if (!(d && d.ok)) return;
      var srv = d.answers || {};
      Object.keys(srv).forEach(function (k) { if (!(answers[k] && answers[k].p)) answers[k] = srv[k]; });
      saveStore(); render();
      Object.keys(answers).forEach(function (k) { if (answers[k].p) send(k); });
    }).catch(function () {});
  }
  function sortGames(list) {
    return list.slice().sort(function (a, b) {
      var aa = isAnchor(a.k) ? 0 : 1, bb = isAnchor(b.k) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (aa === 0) return ANCHORS.indexOf(a.k) - ANCHORS.indexOf(b.k);
      return a.n.localeCompare(b.n, "ko");
    });
  }
  function card(g) {
    var a = answers[g.k];
    var el = document.createElement("div"); el.className = "gc" + (a ? (a.skip ? " skip" : " done") : ""); el.dataset.k = g.k;
    var box = document.createElement("div"); box.className = "phbox";
    var ph = document.createElement("div"); ph.className = "ph"; ph.setAttribute("role", "button"); ph.tabIndex = 0; ph.setAttribute("aria-label", g.n);
    setPhoto(ph, g);
    var mk = document.createElement("span"); mk.className = "mark"; mk.innerHTML = IC.chk; ph.appendChild(mk);
    ph.addEventListener("click", function () { openGame(g); });
    ph.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGame(g); } });
    box.appendChild(ph);
    var nm = document.createElement("div"); nm.className = "nm"; nm.textContent = g.n;
    var meta = document.createElement("div"); meta.className = "meta";
    if (isAnchor(g.k)) { var b1 = document.createElement("span"); b1.className = "bdg first"; b1.textContent = "먼저"; meta.appendChild(b1); }
    if (a && a.skip) { var b2 = document.createElement("span"); b2.className = "bdg"; b2.textContent = "안 해봄"; meta.appendChild(b2); }
    if (a && a.p) { var b3 = document.createElement("span"); b3.className = "bdg wait"; b3.textContent = "저장 안 됨"; meta.appendChild(b3); }
    el.appendChild(box); el.appendChild(nm); el.appendChild(meta);
    return el;
  }
  function render() {
    var grid = $("grid"); grid.textContent = "";
    var q = norm(query);
    var list = sortGames(games).filter(function (g) {
      if (onlyTodo && answered(g.k)) return false;
      return !q || norm(g.n).indexOf(q) >= 0 || g.k.indexOf(q) >= 0;
    });
    list.forEach(function (g) { grid.appendChild(card(g)); });
    if (!list.length) {
      var e = document.createElement("div"); e.className = "empty";
      var p = document.createElement("p");
      p.textContent = q ? "다른 이름으로 찾아 보세요" : (onlyTodo ? "모든 게임에 답했어요. 고마워요" : "아직 등록된 보드게임이 없어요");
      e.appendChild(p); grid.appendChild(e);
    }
    var n = games.filter(function (g) { return answered(g.k); }).length;
    $("cnt").textContent = games.length ? "답함 " + n + " / " + games.length : "";
    fades();
  }
  function skeleton() {
    var grid = $("grid"); grid.textContent = "";
    for (var i = 0; i < 8; i++) {
      var el = document.createElement("div"); el.className = "gc sk";
      el.innerHTML = '<div class="phbox"><div class="ph"></div></div><div class="nm"></div><div class="meta"></div>';
      grid.appendChild(el);
    }
  }
  function bindFind() {
    var inp = $("q"), box = inp.parentNode, clr = $("qClr");
    clr.innerHTML = IC.x;
    inp.addEventListener("input", function () { query = inp.value; box.classList.toggle("has-val", !!inp.value); render(); });
    clr.addEventListener("click", function () { inp.value = ""; query = ""; box.classList.remove("has-val"); render(); inp.focus(); });
    [].forEach.call(document.querySelectorAll("#seg button"), function (b) {
      b.addEventListener("click", function () {
        onlyTodo = b.getAttribute("data-f") === "todo";
        [].forEach.call(document.querySelectorAll("#seg button"), function (x) { x.classList.toggle("on", x === b); });
        render(); window.scrollTo(0, 0);
      });
    });
    $("who").addEventListener("click", function () { show("s-name"); });
  }

  /* ── 게임 화면 ── */
  function openGame(g) {
    cur = g;
    var a = answers[g.k] || {};
    draft = { q1: a.skip ? "" : (a.q1 || ""), q2: a.skip ? "" : (a.q2 || ""), q3: a.skip ? "" : (a.q3 || ""), n: a.skip ? "" : (a.n || ""), memo: a.skip ? "" : (a.memo || "") };
    $("gTitle").textContent = g.n + " 어땠어요?";
    setPhoto($("gPh"), g);
    $("gMemo").value = draft.memo; autoGrow($("gMemo"));
    paintOpts();
    [].forEach.call(document.querySelectorAll("#s-game .q"), function (q) { q.classList.remove("err"); });
    history.pushState({ g: g.k }, "");
    show("s-game");
  }
  function closeGame() { if (history.state && history.state.g) history.back(); else backToList(); }
  function backToList() { cur = null; show("s-list"); render(); }
  window.addEventListener("popstate", function () { if (cur) backToList(); });
  function paintOpts() {
    [].forEach.call(document.querySelectorAll("#s-game .opts"), function (box) {
      var q = box.getAttribute("data-q");
      [].forEach.call(box.querySelectorAll(".opt"), function (b) { b.classList.toggle("on", !!draft[q] && b.getAttribute("data-v") === draft[q]); });
    });
  }
  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
  function bindGame() {
    $("gBack").addEventListener("click", closeGame);
    [].forEach.call(document.querySelectorAll("#s-game .opts"), function (box) {
      box.addEventListener("click", function (e) {
        var b = e.target.closest(".opt"); if (!b) return;
        var q = box.getAttribute("data-q");
        draft[q] = b.getAttribute("data-v"); paintOpts();
        box.parentNode.classList.remove("err");
      });
    });
    $("gMemo").addEventListener("input", function () { draft.memo = $("gMemo").value; autoGrow($("gMemo")); });
    $("gSkip").addEventListener("click", function () { commit({ skip: true }); });
    $("gSave").addEventListener("click", function () {
      var missing = ["q1", "q2", "q3", "n"].filter(function (q) { return !draft[q]; });
      if (missing.length) {   // 오류 표시는 누를 때만(§4.1-7ⓒ) — 빠진 질문이 흔들리고 첫 칸으로 스크롤
        missing.forEach(function (q) { var el = $(q === "n" ? "qn" : q); el.classList.remove("err"); void el.offsetWidth; el.classList.add("err"); });
        $(missing[0] === "n" ? "qn" : missing[0]).scrollIntoView({ behavior: "smooth", block: "center" });
        toast("네 질문에 다 답해 주세요");
        return;
      }
      commit({ skip: false, q1: draft.q1, q2: draft.q2, q3: draft.q3, n: draft.n, memo: String(draft.memo || "").trim().slice(0, 300) });
    });
  }
  /* 낙관적 저장: 화면부터 정리하고(목록으로, 체크) 서버엔 뒤에서 보낸다 */
  function commit(a) {
    var g = cur; if (!g) return;
    a.p = 1; answers[g.k] = a; saveStore();
    closeGame();
    send(g.k, g.n);
  }
  var inflight = {};
  function send(k, label) {
    if (inflight[k]) return;
    var a = answers[k]; if (!a || !a.p) return;
    inflight[k] = true;
    var body = { skip: !!a.skip, q1: a.q1 || "", q2: a.q2 || "", q3: a.q3 || "", n: a.n || "", memo: a.memo || "" };
    post({ action: "survey_save", k: KEY, name: name, key: k, a: body }, true).then(function (d) {
      if (d && d.ok) {
        if (answers[k] === a) { delete a.p; saveStore(); }
        if (label) toast(label + (a.skip ? " 안 해봤다고 적었어요" : " 답을 저장했어요"), true);
        render(); return;
      }
      fail(d && d.error, label);
    }).catch(function () { fail("net", label); }).then(function () { delete inflight[k]; });
  }
  function fail(code, label) {
    render();   // 카드에 「저장 안 됨」이 남는다 — 토스트가 사라져도 사실은 화면에(§5.5)
    if (code === "bad_key" || code === "nokey") { show("s-gate"); return; }
    if (code === "unknown_name") { toast("명부에서 이름을 찾지 못했어요. 이름을 다시 골라 주세요"); show("s-name"); return; }
    toast((label ? label + " " : "") + "답을 아직 저장하지 못했어요. 잠시 후 다시 열어 저장을 눌러 주세요");
  }

  /* ── 시작 ── */
  warmGas();
  bindFind(); bindGame();
  loadStore();
  if (!KEY && !DEMO) { show("s-gate"); return; }
  if (name) {   // 지난번 이름이 있으면 바로 목록(명부 검증은 첫 저장이 한다)
    enterList();
    loadNames().catch(function () {});
  } else {
    show("s-name");
    var box = $("names"); box.innerHTML = '<div class="gc sk"><div class="nm"></div></div>';
    loadNames().catch(function () {
      box.innerHTML = '<div class="errbox"><p>명부를 불러오지 못했어요.<br>잠시 후 다시 시도해 주세요.</p><button class="retry-btn" id="retryNames">다시 시도</button></div>';
      $("retryNames").onclick = function () { location.reload(); };
    });
  }
})();
