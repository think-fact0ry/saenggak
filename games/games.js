/* 보드게임 목록(23) — index.html(선생님 목록)과 admin.html(관리자 사진 등록)이 같이 쓴다. body[data-mode]로 갈린다.
   백엔드 = scripts/23_보드게임목록(JSON만). ?demo=1 = 서버를 안 부르고 가짜 목록으로 화면만 본다(백엔드 승인 전 확인용).
   ⚠️「대여 중」은 QR을 찍고 가져간 것만 안다. 그래서 화면은 "있어요"를 말하지 않는다 — 확실한 쪽(대여 중)만 표시한다(§2.1-9 가짜 단정 금지). */
(function () {
  "use strict";
  var GAS_EXEC = "https://script.google.com/macros/s/AKfycbyRilxEvRNPTl55yYPraNUGbdz6SbQDOdrdyFiAyfx4aHMdbXIoPhAx8E1HZsBj90rB_w/exec";
  var ADMIN = document.body.getAttribute("data-mode") === "admin";
  var DEMO = /[?&]demo=1/.test(location.search);
  var CACHE_KEY = "tf_games_v1", PIN_KEY = "tf_games_pin";
  var $ = function (id) { return document.getElementById(id); };

  var IC = {
    box: '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

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

  /* ── 가짜 서버(?demo=1) — 긴 상자와 정사각 상자가 같은 틀에 어떻게 담기는지 보이게 비율을 섞었다 ── */
  function demoImg(w, h, fill) {
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '"><rect width="' + w + '" height="' + h + '" rx="12" fill="' + fill + '"/><rect x="' + w * 0.12 + '" y="' + h * 0.2 + '" width="' + w * 0.76 + '" height="' + h * 0.18 + '" rx="6" fill="#fff" opacity=".85"/></svg>');
  }
  var demoGames = [
    { k: "개구리알먹기", n: "개구리알 먹기", c: 2, o: 0, p: demoImg(300, 300, "#3a8a5f") },
    { k: "늑대가나타났다", n: "늑대가 나타났다!", c: 5, o: 1, p: demoImg(420, 140, "#f5a623") },
    { k: "도블", n: "도블", c: 3, o: 0, p: demoImg(200, 200, "#D25357") },
    { k: "딕인", n: "딕인", c: 4, o: 0, p: "" },
    { k: "메모리체스", n: "메모리체스", c: 3, o: 0, p: demoImg(180, 360, "#525966") },
    { k: "스택버거", n: "스택버거", c: 1, o: 1, p: "" },
    { k: "쿠키박스티니핑", n: "쿠키박스 티니핑", c: 10, o: 0, p: demoImg(360, 260, "#57a77a") },
    { k: "플라잉치즈", n: "플라잉 치즈", c: 2, o: 2, p: "" }
  ];
  function demoPost(obj) {
    return wait(obj.action === "games" ? 500 : 900).then(function () {
      if (obj.action === "games") return { ok: true, games: JSON.parse(JSON.stringify(demoGames)) };
      if (obj.action === "admin_check") return obj.pin === "1234" ? { ok: true } : { ok: false, error: "bad_pin" };
      if (obj.action === "photo_set") return { ok: true, p: "data:image/jpeg;base64," + obj.img };
      if (obj.action === "photo_del") return { ok: true };
      return { ok: false, error: "unknown_action" };
    });
  }

  /* ── 공통 UI ── */
  var toastT;
  function toast(msg, ok) {   // §5.5 — 성공만 초록 원과 체크, 글자는 textContent로
    var t = $("toast");
    t.querySelector(".tx").textContent = msg;
    t.classList.toggle("okk", !!ok);
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }
  function dotsHTML(text) { return text + '<span class="ld-dots"><i></i><i></i><i></i></span>'; }
  function btnLoad(btn, text) { if (btn.dataset.lbl == null) btn.dataset.lbl = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="bl">' + dotsHTML(text) + "</span>"; }
  function btnDone(btn) { if (btn.dataset.lbl == null) return; btn.innerHTML = btn.dataset.lbl; delete btn.dataset.lbl; btn.disabled = false; }
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
    var b = e.target.closest(".btn,.retry-btn");
    if (b && !b.disabled) pressRipple(b, e);
    var d = e.target.closest(".btn:disabled");
    if (d && !d.querySelector(".ld-dots")) shake(d);
  });
  function show(id) {
    [].forEach.call(document.querySelectorAll(".screen"), function (s) { s.classList.toggle("active", s.id === id); });
    window.scrollTo(0, 0); fades();
  }
  /* 창 스크롤 띠(§4.13-6 A안): 맨 위 = 아래만, 중간 = 둘 다, 맨 끝 = 위만, 안 넘치면 둘 다 끔 */
  function fades() {
    var wrap = $("wrap"); if (!wrap) return;
    var over = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || 0;
    wrap.classList.toggle("moreTop", over > 6 && y > 6);
    wrap.classList.toggle("more", over > 6 && y < over - 6);
  }
  window.addEventListener("scroll", fades, { passive: true });
  window.addEventListener("resize", fades);

  /* ── 목록 ── */
  var games = [], query = "", onlyNoPhoto = false, localPhoto = {}, busyKey = {};
  function norm(s) { return String(s || "").toLowerCase().replace(/\s/g, ""); }
  function photoUrl(p) { return p.indexOf("data:") === 0 ? p : "https://drive.google.com/thumbnail?id=" + encodeURIComponent(p) + "&sz=w600"; }

  function setPhoto(ph, g) {
    var old = ph.querySelector("img,.noph"); if (old) old.remove();
    var src = localPhoto[g.k] || (g.p ? photoUrl(g.p) : "");
    if (!src) { var n = document.createElement("span"); n.className = "noph"; n.innerHTML = IC.box; ph.insertBefore(n, ph.firstChild); return; }
    var img = document.createElement("img");
    img.alt = ""; img.loading = src.indexOf("data:") === 0 ? "eager" : "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";   // 방금 찍은 사진(data:)은 미루지 않는다
    img.onerror = function () {   // Drive 썸네일 주소가 막히면 서버에서 한 번 직접 받아 온다(예비 길)
      img.onerror = function () { g._bad = true; setPhotoFallback(ph); };
      if (DEMO || !g.p) { setPhotoFallback(ph); return; }
      post({ action: "thumb", key: g.k }).then(function (d) {
        if (d && d.ok) img.src = "data:image/jpeg;base64," + d.img; else setPhotoFallback(ph);
      }).catch(function () { setPhotoFallback(ph); });
    };
    img.src = src;
    ph.insertBefore(img, ph.firstChild);
  }
  function setPhotoFallback(ph) {
    var old = ph.querySelector("img,.noph"); if (old) old.remove();
    var n = document.createElement("span"); n.className = "noph"; n.innerHTML = IC.box; ph.insertBefore(n, ph.firstChild);
  }

  function metaInto(el, g) {
    el.textContent = "";
    if (g.o > 0 && g.o >= g.c) {
      var b = document.createElement("span"); b.className = "bdg"; b.textContent = g.c > 1 ? "모두 대여 중" : "대여 중"; el.appendChild(b);
      if (g.c > 1) el.appendChild(document.createTextNode(g.c + "벌"));
    } else if (g.o > 0) {
      el.textContent = g.c + "벌 중 " + g.o + "벌 대여 중";
    } else if (g.c > 1) {
      el.textContent = g.c + "벌";
    }
  }

  function card(g) {
    var el = document.createElement("div"); el.className = "gc";
    var box = document.createElement("div"); box.className = "phbox";
    var ph = document.createElement(ADMIN ? "button" : "div"); ph.className = "ph";
    if (ADMIN) {
      ph.type = "button";
      ph.setAttribute("aria-label", g.n + " 사진 넣기");
      var cam = document.createElement("span"); cam.className = "cam"; cam.innerHTML = IC.cam; ph.appendChild(cam);
      ph.addEventListener("click", function () { pick(g, ph); });
    }
    setPhoto(ph, g);
    box.appendChild(ph);
    if (ADMIN && (g.p || localPhoto[g.k])) {
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "rm"; rm.setAttribute("aria-label", g.n + " 사진 빼기"); rm.innerHTML = IC.x;
      rm.addEventListener("click", function () { askRemove(g); });
      box.appendChild(rm);
    }
    var nm = document.createElement("div"); nm.className = "nm"; nm.textContent = g.n;
    var meta = document.createElement("div"); meta.className = "meta"; metaInto(meta, g);
    el.appendChild(box); el.appendChild(nm); el.appendChild(meta);
    return el;
  }

  function render() {
    var grid = $("grid"); grid.textContent = "";
    var q = norm(query);
    var list = games.filter(function (g) {
      if (onlyNoPhoto && (g.p || localPhoto[g.k])) return false;
      return !q || norm(g.n).indexOf(q) >= 0 || g.k.indexOf(q) >= 0;
    });
    list.forEach(function (g) { grid.appendChild(card(g)); });
    if (!list.length) {
      var e = document.createElement("div"); e.className = "empty";
      var p = document.createElement("p");
      p.textContent = q ? "다른 이름으로 찾아 보세요" : (onlyNoPhoto ? "모든 게임에 사진을 넣었어요" : "아직 등록된 보드게임이 없어요");
      e.appendChild(p); grid.appendChild(e);
    }
    count(list.length);
    fades();
  }
  function count(shown) {
    var el = $("cnt"); if (!el) return;
    if (ADMIN) {
      var has = games.filter(function (g) { return g.p || localPhoto[g.k]; }).length;
      el.textContent = "사진 " + has + " / " + games.length;
    } else {
      el.textContent = shown + "종";
    }
  }
  function skeleton() {
    var grid = $("grid"); grid.textContent = "";
    for (var i = 0; i < 8; i++) {
      var el = document.createElement("div"); el.className = "gc sk";
      el.innerHTML = '<div class="phbox"><div class="ph"></div></div><div class="nm"></div><div class="meta"></div>';
      grid.appendChild(el);
    }
  }
  function load() {
    var cached = null;
    if (!DEMO) { try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {} }
    if (cached && cached.length) { games = cached; render(); } else skeleton();
    post({ action: "games" }, true).then(function (d) {
      if (!(d && d.ok)) throw new Error();
      games = d.games || []; render();
      if (!DEMO) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(games)); } catch (e) {} }
    }).catch(function () {
      if (cached && cached.length) { toast("새 목록을 받지 못해 지난번 목록을 보여 드려요"); return; }
      var grid = $("grid");
      grid.innerHTML = '<div class="errbox"><p>목록을 불러오지 못했어요.<br>잠시 후 다시 시도해 주세요.</p><button class="retry-btn" id="retryBtn">다시 시도</button></div>';
      $("retryBtn").onclick = load;
      fades();
    });
  }

  /* 찾기 */
  function bindFind() {
    var inp = $("q"), box = inp.parentNode, clr = $("qClr");
    clr.innerHTML = IC.x;
    inp.addEventListener("input", function () { query = inp.value; box.classList.toggle("has-val", !!inp.value); render(); });
    clr.addEventListener("click", function () { inp.value = ""; query = ""; box.classList.remove("has-val"); render(); inp.focus(); });
  }

  /* ── 관리자: 사진 넣기 ── */
  var curPick = null;
  function pin() { try { return sessionStorage.getItem(PIN_KEY) || ""; } catch (e) { return ""; } }
  function pick(g, ph) {
    if (busyKey[g.k]) { toast("사진을 넣고 있어요. 잠깐만요"); return; }
    curPick = { g: g, ph: ph };
    $("pickTitle").textContent = g.n + " 사진을 어떻게 넣을까요?";
    $("pickDim").classList.add("on");
  }
  function bindPick() {   // 고르기 창은 버튼을 누른 그 손짓 안에서 열어야 한다(브라우저가 막지 않게)
    var close = function () { $("pickDim").classList.remove("on"); };
    $("pickCam").onclick = function () { close(); $("fileCam").click(); };
    $("pickAlbum").onclick = function () { close(); $("fileIn").click(); };
    $("pickDim").addEventListener("click", function (e) { if (e.target === $("pickDim")) { close(); curPick = null; } });
  }
  function decodeImage(file) {   // EXIF 회전 = createImageBitmap 우선(tablet/사진업로드 실코드)
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("decode")); };
      im.src = u;
    });
  }
  function toJpeg(src, max, q) {
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    var sc = Math.min(1, max / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    var cx = cv.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, cw, ch);   // 투명 PNG가 JPEG에서 검게 나오지 않게
    cx.drawImage(src, 0, 0, cw, ch);
    return cv.toDataURL("image/jpeg", q).split(",")[1];
  }
  function onFile(e) {
    var f = e.target.files && e.target.files[0]; e.target.value = "";
    var cur = curPick; curPick = null;
    if (!f || !cur) return;
    var g = cur.g, ph = cur.ph;
    busyKey[g.k] = true;
    var ov = document.createElement("span"); ov.className = "busy"; ov.innerHTML = dotsHTML("넣고 있어요"); ph.appendChild(ov);
    decodeImage(f).then(function (bm) {
      var b64 = toJpeg(bm, 1200, 0.82); if (bm.close) bm.close();
      return post({ action: "photo_set", pin: pin(), key: g.k, img: b64 }).then(function (d) { return { d: d, b64: b64 }; });
    }).then(function (r) {
      var d = r.d;
      if (d && d.ok) {
        g.p = DEMO ? "" : d.p; localPhoto[g.k] = "data:image/jpeg;base64," + r.b64;   // 방금 찍은 사진을 바로 보여 준다(Drive를 기다리지 않는다)
        saveCache(); rerenderCard(g, ph); toast("사진을 넣었어요", true);
        return;
      }
      failPhoto(d && d.error);
    }).catch(function (err) {
      failPhoto(err && err.message === "decode" ? "decode" : "net");
    }).then(function () { delete busyKey[g.k]; if (ov.parentNode) ov.remove(); });
  }
  function failPhoto(code) {
    if (code === "bad_pin" || code === "locked" || code === "nopin") { try { sessionStorage.removeItem(PIN_KEY); } catch (e) {} gateMsg(code); show("s-gate"); return; }
    toast(code === "decode" ? "이 사진은 읽지 못했어요\n다른 사진으로 해 주세요"
      : code === "too_big" ? "사진이 너무 커요\n다시 찍어 주세요"
      : code === "not_ready" ? "사진 폴더가 아직 준비되지 않았어요\n설정을 먼저 마쳐 주세요"
      : "사진을 넣지 못했어요\n잠시 후 다시 해 주세요");
  }
  function rerenderCard(g, ph) {
    var old = ph.closest(".gc"); if (!old) return;
    old.parentNode.replaceChild(card(g), old); count(0);
  }
  function saveCache() {
    if (DEMO) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(games)); } catch (e) {}
  }

  var rmTarget = null;
  function askRemove(g) {
    if (busyKey[g.k]) return;
    rmTarget = g; $("dlgTitle").textContent = g.n + " 사진을 뺄까요?"; $("dim").classList.add("on");
  }
  function bindDialog() {
    $("dlgNo").onclick = function () { $("dim").classList.remove("on"); rmTarget = null; };
    $("dim").addEventListener("click", function (e) { if (e.target === $("dim")) $("dlgNo").onclick(); });
    $("dlgYes").onclick = function () {
      var g = rmTarget; rmTarget = null; $("dim").classList.remove("on");
      if (!g) return;
      busyKey[g.k] = true;
      post({ action: "photo_del", pin: pin(), key: g.k }).then(function (d) {
        if (d && d.ok) { g.p = ""; delete localPhoto[g.k]; saveCache(); render(); toast("사진을 뺐어요", true); return; }
        failPhoto(d && d.error);
      }).catch(function () { failPhoto("net"); }).then(function () { delete busyKey[g.k]; });
    };
  }

  /* ── 관리자 문 ── */
  function gateMsg(code) {
    var h = $("gateTitle");
    h.classList.toggle("err", !!code);
    h.textContent = code === "bad_pin" ? "비밀번호가 달라요"
      : code === "locked" ? "여러 번 틀려서 잠겼어요. 10분 뒤에 다시 해 주세요"
      : code === "nopin" ? "관리자 비밀번호가 아직 없어요"
      : "관리자 비밀번호를 적어 주세요";
  }
  function bindGate() {
    var inp = $("pinIn"), btn = $("pinBtn"), busy = false;
    inp.addEventListener("input", function () { btn.disabled = !inp.value || busy; });
    function go() {
      if (busy || !inp.value) return;
      busy = true; btnLoad(btn, "확인하고 있어요");
      var v = inp.value;
      post({ action: "admin_check", pin: v }).then(function (d) {
        if (d && d.ok) { try { sessionStorage.setItem(PIN_KEY, v); } catch (e) {} inp.value = ""; gateMsg(""); show("s-list"); load(); return; }
        gateMsg((d && d.error) || "bad_pin"); inp.value = ""; shake(inp);
      }).catch(function () { toast("확인하지 못했어요\n잠시 후 다시 해 주세요"); })
        .then(function () { busy = false; btnDone(btn); btn.disabled = !inp.value; });
    }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  /* ── 시작 ── */
  warmGas();
  bindFind();
  if (ADMIN) {
    bindGate(); bindDialog(); bindPick();
    $("fileIn").addEventListener("change", onFile);
    $("fileCam").addEventListener("change", onFile);
    [].forEach.call(document.querySelectorAll("#seg button"), function (b) {
      b.addEventListener("click", function () {
        onlyNoPhoto = b.getAttribute("data-f") === "nophoto";
        [].forEach.call(document.querySelectorAll("#seg button"), function (x) { x.classList.toggle("on", x === b); });
        render(); window.scrollTo(0, 0);
      });
    });
    if (pin()) {   // 같은 탭에서 다시 열면 문을 건너뛰되, 비밀번호가 아직 맞는지는 서버에 묻는다
      show("s-list"); load();
      post({ action: "admin_check", pin: pin() }).then(function (d) { if (d && !d.ok) failPhoto(d.error); }).catch(function () {});
    } else { show("s-gate"); }
  } else {
    show("s-list"); load();
  }
})();
