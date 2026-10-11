/* 28 급여명세서 선생님 화면 — 서버 = scripts/28_급여명세서발송 doPost(text/plain JSON).
   액션: start(휴대폰 → 문자) / verify(6자리 → 열쇠) / my(이번 달·지난 달 목록) / file(명세서 PDF 하나) / ack(확인했어요)
   ⚠️ 이 레포는 공개다 — 화면 코드에 비밀 0, 예시(?demo=1) 자료는 전부 지어낸 값. */
(function () {
  'use strict';
  var GAS_EXEC = 'https://script.google.com/macros/s/AKfycbzIFRx1AxDRByNQB_KLG09nhdMd8LQwBLkglJlsrBgWB-Y0qfMB4FpcXfr7vQz0Ez7tIA/exec';   // 12 급여 웹앱 배포 주소(10-12 28을 12에 합침 — 새 배포 말고 deploy -i로 덮어쓸 것)
  var Q = new URLSearchParams(location.search);
  var DEMO = Q.get('demo') === '1';
  var SCENE = Q.get('scene') || '';
  var KEY = 'tf_pay_v1', HINT_KEY = 'tf_pay_hint';
  var OTP_TTL = 300;   // ⚠️ 서버 인증번호 유효 시간과 같아야 한다(28 Code.js PAY_OTP_TTL)
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('ko-KR'); }
  var memStore = null;   // 예시는 기기에 안 남긴다
  function sess() { if (DEMO) return memStore; try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function setSess(v) {
    if (DEMO) { memStore = v; return; }
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { }
  }

  // ───────────── 서버 부르기 ─────────────
  // 읽기(my·file) = 4초 안에 안 오면 하나 더 보내 먼저 온 것(구글이 가끔 HTML·수십 초 — 22 rec 실측 10-08)
  // 쓰기(start·verify·ack) = 한 번만(문자 두 통·코드 소모 방지). ack는 서버가 멱등이라 다시 눌러도 안전
  var READS = { my: 1, file: 1 };
  function isTransient(x) { return x instanceof TypeError || String(x && x.message) === 'BAD_REPLY'; }
  function call(body) {
    if (DEMO) return demoApi(body);
    if (!GAS_EXEC) return Promise.reject(new Error('NO_SERVER'));
    var once = function () {
      return fetch(GAS_EXEC, { method: 'POST', body: JSON.stringify(body) })
        .then(function (r) { return r.text(); })
        .then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('BAD_REPLY'); } });
    };
    if (!READS[body.action]) return once();
    return new Promise(function (res, rej) {
      var started = 0, inflight = 0, done = false, timer = 0;
      var go = function () {
        started++; inflight++;
        once().then(function (d) { inflight--; if (done) return; done = true; clearTimeout(timer); res(d); },
          function (x) {
            inflight--; if (done) return;
            if (!isTransient(x)) { done = true; clearTimeout(timer); return rej(x); }
            if (started < 2) { clearTimeout(timer); return go(); }
            if (!inflight) { done = true; rej(x); }
          });
      };
      go();
      timer = setTimeout(function () { if (!done && started < 2) go(); }, 4000);
    });
  }
  // 서버를 미리 깨운다(콜드스타트 2~5초 — 상담일지 warmGas 결). 응답은 안 읽는다
  var warmAt = 0;
  function warm() { if (DEMO || !GAS_EXEC || Date.now() - warmAt < 60000) return; warmAt = Date.now(); try { fetch(GAS_EXEC, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(function () { }); } catch (e) { } }

  // ───────────── 화면 겹 ─────────────
  var stack = [];
  function pg(id) { return $(id); }
  function curId() { return stack[stack.length - 1]; }
  function place(el, cls) { el.classList.remove('gone', 'off-r', 'off-l'); if (cls) el.classList.add(cls); }
  function settle(keep) {
    setTimeout(function () {
      document.querySelectorAll('.pg').forEach(function (p) { if (p.id !== curId()) { p.classList.add('gone'); p.classList.remove('off-r', 'off-l', 'kb'); } });
      fadeAll();
    }, 380);
  }
  function goRoot(id) {
    stack = [id];
    document.querySelectorAll('.pg').forEach(function (p) { if (p.id !== id) p.classList.add('gone'); });
    place(pg(id)); settle(); fadeAll();
  }
  function swapRoot(id) {   // 인증을 마친 뒤 = 앞으로 넘기되 뒤로 돌아갈 칸은 없다
    var from = pg(curId()), to = pg(id); stack = [id];
    place(to, 'off-r'); void to.offsetWidth;
    requestAnimationFrame(function () { to.classList.remove('off-r'); if (from && from !== to) from.classList.add('off-l'); });
    settle();
  }
  function push(id) {
    var from = pg(curId()); var to = pg(id);
    stack.push(id);
    place(to, 'off-r'); void to.offsetWidth;
    requestAnimationFrame(function () { to.classList.remove('off-r'); if (from) from.classList.add('off-l'); });
    settle(); setTimeout(fadeAll, 40);
  }
  function pop() {
    if (stack.length < 2) return false;
    var from = pg(stack.pop()); var to = pg(curId());
    place(to, 'off-l'); void to.offsetWidth;
    requestAnimationFrame(function () { to.classList.remove('off-l'); from.classList.add('off-r'); });
    if (from.id === 'pDoc') closeViewer();
    settle(); return true;
  }

  // ───────────── 스크롤 그라디언트(§4.13-6 A안: 맨 위=아래만 / 중간=둘 다 / 맨 끝=위만) ─────────────
  function fade(p) {
    var sc = p.querySelector('.body'); if (!sc || p.classList.contains('gone')) return;
    p.style.setProperty('--sf-t', sc.offsetTop + 'px');
    p.style.setProperty('--sf-h', sc.clientHeight + 'px');
    var over = sc.scrollHeight - sc.clientHeight > 2;
    p.classList.toggle('moreTop', over && sc.scrollTop > 2);
    p.classList.toggle('more', over && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2);
  }
  function fadeAll() { document.querySelectorAll('.pg').forEach(fade); }
  document.querySelectorAll('.pg .body').forEach(function (sc) {
    var p = sc.closest('.pg');
    sc.addEventListener('scroll', function () { fade(p); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(function () { fade(p); }).observe(sc);
    // 감시는 내용이 바뀌는 몸통에만(띠 클래스를 붙이는 화면 자신에 걸면 자기 토글이 자기를 깨운다 — §4.13-6)
    new MutationObserver(function () { fade(p); }).observe(sc, { childList: true, subtree: true });
  });
  window.addEventListener('resize', fadeAll);

  // ───────────── 키패드(iOS는 resizes-content가 없다 → 보이는 높이로 앱을 줄인다. 비율 판정 — §3.7) ─────────────
  function fitVV() {
    var vv = window.visualViewport; if (!vv) return;
    if (vv.scale > 1.01) return;   // 확대 중엔 건드리지 않는다
    var kb = window.innerHeight - vv.height - vv.offsetTop;
    app.style.bottom = (vv.height < window.innerHeight * 0.75 && kb > 0) ? kb + 'px' : '';
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', fitVV); visualViewport.addEventListener('scroll', fitVV); }

  // ───────────── 토스트(§5.5 — 바닥 버튼 위 12px, 문구 먼저 넣고 잰다) ─────────────
  function bottomGap() {
    var p = pg(curId()); var c = p && p.querySelector('.cta');
    return (c && c.offsetHeight) ? c.offsetHeight + 12 : 0;
  }
  var toastT = 0;
  function toast(msg, ok) {
    var t = $('toast');
    t.querySelector('.tx').textContent = msg;   // textContent — 서버 문구를 그대로 넣어도 주입 없음
    t.classList.toggle('okk', !!ok);
    var g = bottomGap(); t.style.bottom = g ? 'calc(' + g + 'px + env(safe-area-inset-bottom))' : '';
    t.classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  // ───────────── 누름 물결(§5.3-1 — 누른 자리에서 양 끝까지) ─────────────
  function pressRipple(btn) {
    btn.addEventListener('pointerdown', function (e) {
      if (btn.classList.contains('off') || btn.classList.contains('busy')) return;
      if (!btn.querySelector('.bl')) { var bl = document.createElement('span'); bl.className = 'bl'; while (btn.firstChild) bl.appendChild(btn.firstChild); btn.appendChild(bl); }
      var r = btn.getBoundingClientRect(), x = e.clientX - r.left;
      var sp = document.createElement('span'); sp.className = 'rip'; sp.style.left = x + 'px';
      sp.style.setProperty('--rs', Math.ceil(Math.hypot(Math.max(x, r.width - x), r.height / 2) / 15) + 1);
      btn.appendChild(sp); requestAnimationFrame(function () { sp.classList.add('go'); });
      var end = function () { sp.classList.add('fade'); setTimeout(function () { if (sp.parentNode) sp.remove(); }, 340); btn.removeEventListener('pointerup', end); btn.removeEventListener('pointerleave', end); };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointerleave', end);
    });
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function loadingHTML(text) { return '<span class="ld">' + esc(text) + '<span class="ld-dots"><i></i><i></i><i></i></span></span>'; }
  function btnLoad(btn, text) { if (btn.dataset.lbl == null) btn.dataset.lbl = btn.textContent; btn.classList.add('busy'); btn.innerHTML = loadingHTML(text); }
  function btnDone(btn) { if (btn.dataset.lbl == null) return; btn.textContent = btn.dataset.lbl; delete btn.dataset.lbl; btn.classList.remove('busy'); }

  // ───────────── 가운데 확인 창(§4.4) ─────────────
  var cmGoFn = null;
  function confirmBox(title, sub, goLabel, fn) {
    $('cmT').textContent = title; $('cmS').textContent = sub; $('cmGo').textContent = goLabel; cmGoFn = fn;
    $('mdim').classList.add('on'); $('cmodal').classList.add('on');
  }
  function closeBox() { $('mdim').classList.remove('on'); $('cmodal').classList.remove('on'); cmGoFn = null; }
  $('cmNo').onclick = closeBox; $('mdim').onclick = closeBox;
  $('cmGo').onclick = function () { var f = cmGoFn; closeBox(); if (f) f(); };

  // ═════════════ 본인 확인(휴대폰) ═════════════
  var idIn = $('idPhone'), idTf = $('idTf'), idGo = $('idGo'), idNote = $('idNote'), idBusy = false;
  function digits() { return idIn.value.replace(/\D/g, ''); }
  function phoneOk(d) { return /^01[016789]\d{7,8}$/.test(d); }
  function idGate() { idGo.classList.toggle('off', !phoneOk(digits())); }
  function idClearErr() { idNote.className = 'note'; idNote.textContent = ''; idTf.classList.remove('bad'); }
  idIn.addEventListener('focus', function () {
    idIn.removeAttribute('readonly');   // readonly-until-focus = 자동완성·저장된 비번 줄 차단(§4.1-6)
    idTf.classList.add('focus'); pg('pId').classList.add('kb');
    idIn._wasFull = digits().length >= 11;   // 고치러 다시 연 칸이면 11자리에도 안 닫는다(§3.7)
  });
  idIn.addEventListener('blur', function () { idTf.classList.remove('focus'); pg('pId').classList.remove('kb'); });
  idIn.addEventListener('input', function () {
    var d = digits().slice(0, 11);   // 숫자만, 11자리까지(§4.1-11)
    idIn.value = d.length < 4 ? d : d.length < 8 ? d.slice(0, 3) + '-' + d.slice(3) : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    idTf.classList.toggle('has-val', idIn.value.length > 0);
    idClearErr(); idGate();
    if (d.length === 11 && !idIn._wasFull) { idIn.blur(); idNext(); }   // 다 채우면 키패드 닫고 바로(§3.7)
  });
  idTf.querySelector('.clr').addEventListener('click', function () { idIn.value = ''; idIn.dispatchEvent(new Event('input')); idIn.focus(); });
  // 입력 중 버튼을 누르는 순간 칸이 blur되면 버튼이 제자리로 튀어 누름이 빠진다(§4.1-5 🔴) → 포커스를 붙잡아 둔다
  idGo.addEventListener('pointerdown', function (e) { if (document.activeElement === idIn) e.preventDefault(); });
  idGo.addEventListener('click', function () {
    var d = digits();
    if (!phoneOk(d)) {   // 게이팅 = 흔들고 이유(§4.9). 이유가 상태마다 다르다
      shake(idGo); idTf.classList.add('bad'); shake(idTf);   // 버튼 + 덜 찬 칸이 같이 흔들리고 칸 밑줄이 빨강(§4.9 제출 게이트)
      toast(d.length ? '휴대폰 번호를 끝까지 적어 주세요' : '휴대폰 번호를 적어 주세요');
      return;
    }
    idIn.blur(); idNext();
  });
  function idErr(main, sub, red) {
    idNote.className = 'note' + (red ? ' err' : '');
    idNote.innerHTML = (red ? '<span class="eic">!</span>' : '') + esc(main) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '');
  }
  function idNext() {
    if (idBusy) return; var d = digits();
    if (!phoneOk(d)) { idGate(); return; }
    idBusy = true; idClearErr(); btnLoad(idGo, '문자를 보내고 있어요');   // 흐름 중간 액션 = 버튼 위 로딩(§4.13-4)
    call({ action: 'start', phone: d }).then(function (r) {
      idBusy = false; btnDone(idGo);
      if (r && r.ok) { openOtp(d, OTP_TTL, ''); return; }
      var c = r && r.code;
      if (c === 'cooldown' && r.left > 0) { openOtp(d, r.left, '조금 전에 보낸 문자가 있어요. 그 인증번호를 적어 주세요'); return; }
      // 성립하지 않는 일 = 이유와 함께 강조 / 다시 하면 되는 일 = 빨강 없음(§4.5)
      if (c === 'notfound') idErr('등록된 번호가 아니에요', '번호가 바뀌었다면 사무실 개인톡으로 알려 주세요', true);
      else if (c === 'ambiguous') idErr('이 번호로는 확인이 어려워요', '사무실 개인톡으로 알려 주세요', true);
      else if (c === 'daycap') idErr('오늘은 인증번호를 여러 번 받았어요', '내일 다시 해 주세요', false);
      else if (c === 'cooldown') idErr('방금 보냈어요', (r.wait || 60) + '초 뒤에 다시 받을 수 있어요', false);
      else idErr('문자를 못 보냈어요', '잠시 후 다시 해 주세요', false);
    }).catch(function () {
      idBusy = false; btnDone(idGo);
      idNote.className = 'note'; idNote.innerHTML = '연결이 안 됐어요<button class="lk" type="button">다시 시도</button>';
      idNote.querySelector('.lk').onclick = idNext;
    });
  }
  function openId() {
    idIn.value = ''; idIn.setAttribute('readonly', ''); idTf.classList.remove('has-val', 'focus', 'bad');
    idClearErr(); idGate(); goRoot('pId'); warm();
  }

  // ═════════════ 문자 6자리 — 근태 otpOv 이식 ═════════════
  var otp = { phone: '', err: false, prevLen: 0, busy: false, sending: false, timer: 0, deadline: 0 };
  var otpIn = $('otpIn'), otpBox = $('otpBox'), otpNote = $('otpNote');
  function renderCells() {
    var v = otpIn.value, cells = otpBox.querySelectorAll('.otp-cell');
    cells.forEach(function (c, i) {
      var ch = v[i] || ''; c.textContent = ch;
      c.classList.toggle('filled', !!ch && !otp.err);
      c.classList.toggle('active', !otp.err && v.length < 6 && i === v.length);
    });
    if (v.length > otp.prevLen) { var nc = cells[v.length - 1]; if (nc) { nc.classList.remove('pop'); void nc.offsetWidth; nc.classList.add('pop'); } }
    otp.prevLen = v.length;
  }
  function clearOtpErr() { if (!otp.err) return; otp.err = false; otpBox.classList.remove('err'); otpNote.className = 'note'; otpNote.textContent = ''; renderCells(); }
  function otpReset() {
    otp.err = false; otp.prevLen = 0; otp.busy = false;
    var p = pg('pOtp'); p.classList.remove('suc-textout', 'suc-done');
    otpBox.classList.remove('done', 'filling', 'err'); $('otpMorph').classList.remove('fill', 'circle', 'checked');
    otpIn.value = ''; otpIn.disabled = false; otpNote.className = 'note'; otpNote.textContent = ''; $('otpSub').textContent = '';
    renderCells();
  }
  function openOtp(phone, ttl, msg) {
    otp.phone = phone; otpReset(); push('pOtp'); startTimer(ttl);
    if (msg) { otpNote.className = 'note'; otpNote.textContent = msg; }
    setTimeout(function () { try { otpIn.focus(); } catch (e) { } }, 380);
  }
  function stopTimer() { if (otp.timer) { clearInterval(otp.timer); otp.timer = 0; } }
  function tick() {   // 0:00이 돼도 자리 유지(칸이 위로 안 튐 — §4.2-10)
    var left = Math.max(0, Math.round((otp.deadline - Date.now()) / 1000));
    $('otpSub').textContent = Math.floor(left / 60) + ':' + (left % 60 < 10 ? '0' : '') + left % 60 + ' 남았어요';
    if (left <= 0) { stopTimer(); otpExpired(); }
  }
  function startTimer(ttl) { stopTimer(); otp.deadline = Date.now() + (ttl || OTP_TTL) * 1000; tick(); otp.timer = setInterval(tick, 1000); }
  function otpExpired() {
    clearOtpErr(); otpIn.value = ''; renderCells(); otpIn.disabled = true;
    confirmBox('입력할 수 있는 시간이 지났어요', '인증번호를 다시 받아 주세요', '다시 받기', function () { otpSend(); });
  }
  otpIn.addEventListener('input', function () {
    var v = otpIn.value.replace(/\D/g, '');
    if (otp.err) { clearOtpErr(); v = v.slice(-1); }   // 틀린 뒤 첫 입력 = 새로 시작
    v = v.slice(0, 6); otpIn.value = v; renderCells();
    if (v.length === 6) { otpIn.blur(); otpVerify(); }   // 6자리 = 바로 확인(확인 버튼 없음)
  });
  otpIn.addEventListener('focus', function () { if (otp.err) { clearOtpErr(); otpIn.value = ''; renderCells(); } });
  function otpSend() {
    if (otp.sending) return; otp.sending = true;   // 유료 문자 재진입 가드(§4.2-3)
    clearOtpErr(); otpNote.className = 'note'; otpNote.innerHTML = loadingHTML('다시 보내고 있어요');
    call({ action: 'start', phone: otp.phone }).then(function (r) {
      otp.sending = false;
      if (curId() !== 'pOtp') return;   // 보내는 동안 뒤로 나갔으면 무시(닫힌 화면의 타이머 유령 방지)
      if (r && r.ok) { otpNote.textContent = '인증번호를 다시 보냈어요'; otpIn.value = ''; otpIn.disabled = false; renderCells(); startTimer(OTP_TTL); otpIn.focus(); return; }
      if (r && r.code === 'cooldown') { otpNote.textContent = '방금 보냈어요. ' + (r.wait || 60) + '초 뒤에 다시 받을 수 있어요'; if (!otp.timer && r.left) { otpIn.disabled = false; startTimer(r.left); } return; }
      otpFail((r && r.code === 'daycap') ? '오늘은 인증번호를 여러 번 받았어요' : '문자를 못 보냈어요');
    }).catch(function () { otp.sending = false; if (curId() === 'pOtp') otpFail('연결이 안 됐어요'); });
  }
  function otpFail(msg) {
    otpNote.className = 'note'; otpNote.innerHTML = '<span></span><button class="lk" type="button">다시 받기</button>';
    otpNote.firstChild.textContent = msg; otpNote.querySelector('.lk').onclick = otpSend;
  }
  $('otpResend').addEventListener('click', otpSend);
  function otpVerify() {
    if (otp.busy || otpIn.value.length !== 6) return;
    otp.busy = true;
    otpBox.classList.add('done');   // 6자리 즉시 테두리(서버 응답 전) — 기다림 체감 제거, 채움은 확정 신호(§4.2-10)
    otpNote.className = 'note'; otpNote.innerHTML = loadingHTML('확인하고 있어요');
    call({ action: 'verify', phone: otp.phone, code: otpIn.value }).then(function (r) {
      otp.busy = false;
      if (r && r.ok) { stopTimer(); otpNote.textContent = ''; setSess({ t: r.t, name: r.name }); PRE = r.my || null; otpSuccess(function () { openHome(true); }); return; }
      otpBox.classList.remove('done');   // 틀림 = 테두리가 거꾸로 사라지며 6칸 복구
      var c = r && r.code;
      if (c === 'expired' || !otp.timer) { otpNote.textContent = ''; otpExpired(); return; }
      if (c === 'many') { otpIn.value = ''; renderCells(); otpFail('여러 번 틀렸어요. 인증번호를 다시 받아 주세요'); return; }
      otpNote.className = 'note err'; otpNote.innerHTML = '<span class="eic">!</span>인증번호가 달라요';
      otpBox.classList.add('err'); otp.err = true; renderCells();
    }).catch(function () {
      otp.busy = false; otpBox.classList.remove('done');
      otpNote.className = 'note'; otpNote.innerHTML = '연결이 안 됐어요<button class="lk" type="button">다시 시도</button>';
      otpNote.querySelector('.lk').onclick = otpVerify;
    });
  }
  function otpSuccess(next) {   // 채움 → 원 → 체크 → 「인증을 마쳤어요!」 → 왼쪽으로(근태 13차 시간: 400 + 600)
    var p = pg('pOtp'), morph = $('otpMorph');
    morph.classList.add('fill', 'circle'); otpBox.classList.add('filling'); p.classList.add('suc-textout');
    setTimeout(function () { morph.classList.add('checked'); p.classList.add('suc-done'); }, 400);
    setTimeout(next, 1000);
  }
  $('otpBack').onclick = function () { goBack(); };

  // ═════════════ 명세서 ═════════════
  var ME = null;          // { name, months:[{ ym:'26.10', docs:[{id,label,fname,fixed}], ack:{at}|null }] }
  var FILES = {};         // id → { bytes:Uint8Array, slip:{net,pay,ded,calc}|null } (이 창 메모리만 — 기기에 안 남긴다)
  var viewing = -1;       // pMonth가 보고 있는 달
  function monthTitle(ym) {   // 올해가 아니면 연도까지(1월에 보는 12월분 = 「2026년 12월」)
    var p = String(ym).split('.'), y = +p[0], m = +p[1];
    return (y !== new Date().getFullYear() % 100 ? '20' + p[0] + '년 ' : '') + m + '월 급여명세서';
  }
  function mdText(iso) { var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  var CHEV = '<span class="chev"><svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg></span>';
  var CHECK = '<span class="ck"><svg viewBox="0 0 24 24"><polyline points="4 12 9 17 20 6"/></svg></span>';

  var ILL_DOC = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';
  var ILL_RETRY = '<svg viewBox="0 0 24 24"><polyline points="21 4 21 10 15 10"/><path d="M20 14a8 8 0 1 1-2-6l3 2"/></svg>';
  function stateHtml(ill, title, sub) { return '<div class="state"><div class="ill">' + ill + '</div><b>' + esc(title) + '</b><p>' + esc(sub) + '</p></div>'; }

  function skeletonHome() {   // 처음 여는 동안 = 실물과 같은 자리의 뼈대(§5.4)
    var p = pg('pHome'); p._gen = ++GEN;   // 다시 불러오는 동안 옛 응답이 뼈대 위에 숫자를 쓰지 않게
    p.querySelector('.m-title').innerHTML = '<span class="sk-b" style="width:190px;height:28px"></span>';
    p.querySelector('.m-who').innerHTML = '<span class="sk-b" style="width:96px;height:17px"></span>';
    p.querySelector('.m-sum').hidden = false; p.querySelector('.m-k').innerHTML = '<span class="sk-b" style="width:56px;height:16px"></span>';
    p.querySelector('.m-net').innerHTML = '<span class="sk-b" style="width:170px;height:34px"></span>';
    p.querySelector('.m-docs').innerHTML = docCardSkel();
    p.querySelector('.links').hidden = true;
    p.querySelector('.m-cta').innerHTML = '<button class="btn off" type="button" tabindex="-1">확인했어요</button>';
  }
  function docCardSkel() { return '<div class="doc" style="pointer-events:none"><div class="l"><div class="n"><span class="sk-b" style="width:96px;height:19px"></span></div><div class="s"><span class="sk-b" style="width:130px;height:15px"></span></div></div></div>'; }

  function openHome(fromLogin) {
    var s = sess(); if (!s) { openId(); return; }
    skeletonHome();
    if (fromLogin) swapRoot('pHome'); else goRoot('pHome');
    loadMy();
  }
  var PRE = null;   // 인증 응답에 같이 온 my 자료(한 번 쓰고 버린다)
  function loadMy() {
    var s = sess(); if (!s) { openId(); return; }
    var pre = PRE; PRE = null;
    (pre ? Promise.resolve(pre) : call({ action: 'my', t: s.t })).then(function (r) {
      if (r && r.ok) {
        ME = r; setSess({ t: r.t || s.t, name: r.name });   // 쓸 때마다 열쇠를 새로 받는다(90일 연장)
        drawMonth(pg('pHome'), 0, true); return;
      }
      if (r && r.code === 'auth') { setSess(null); openId(); toast('본인 확인을 다시 할게요'); return; }
      homeError();
    }).catch(homeError);
  }
  function homeError() {   // 일시 오류 = 빨강 없이 이유 + 다시 시도 하나(§4.5)
    var p = pg('pHome'); p._gen = ++GEN;
    p.querySelector('.m-title').textContent = '급여명세서'; p.querySelector('.m-who').textContent = '';
    p.querySelector('.m-sum').hidden = true; p.querySelector('.links').hidden = true; p.querySelector('.m-cta').innerHTML = '';
    p.querySelector('.m-docs').innerHTML = stateHtml(ILL_RETRY, '명세서를 아직 못 불러왔어요', '연결이 잠깐 끊겼을 수 있어요');
    p.querySelector('.m-cta').innerHTML = '<button class="btn" type="button">다시 불러오기</button>';   // 주액션 하나만, 바닥 버튼 자리(§4.5)
    var b = p.querySelector('.m-cta .btn'); pressRipple(b); b.onclick = function () { skeletonHome(); loadMy(); };
  }

  var GEN = 0;   // 화면을 그릴 때마다 오르는 번호 — 늦게 온 응답은 자기 번호가 아니면 버린다
  function drawMonth(p, i, isRoot) {
    var m = ME.months[i], g = p._gen = ++GEN;
    p.querySelector('.links') && (p.querySelector('.links').hidden = !isRoot);
    if (isRoot) $('toPast').hidden = ME.months.length < 2;
    if (!m) {   // 아직 올라온 명세서 없음
      p.querySelector('.m-title').textContent = '급여명세서';
      p.querySelector('.m-who').textContent = ME.name + ' 선생님';
      p.querySelector('.m-sum').hidden = true; p.querySelector('.m-cta').innerHTML = '';
      p.querySelector('.m-docs').innerHTML = stateHtml(ILL_DOC, '아직 올라온 명세서가 없어요', '명세서는 매달 15일쯤 올라와요');
      return;
    }
    p.querySelector('.m-title').textContent = monthTitle(m.ym);
    p.querySelector('.m-who').textContent = ME.name + ' 선생님';
    p.querySelector('.m-k').textContent = m.docs.length > 1 ? '실지급액 합계' : '실지급액';
    p.querySelector('.m-sum').hidden = false;
    p.querySelector('.m-net').innerHTML = '<span class="sk-b" style="width:170px;height:34px"></span>';
    var box = p.querySelector('.m-docs'); box.innerHTML = '';
    m.docs.forEach(function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'doc'; b.dataset.id = d.id;
      b.innerHTML = '<div class="l"><div class="n"><span class="nm"></span>' + (d.fixed ? '<span class="bdg">정정본</span>' : '') + '</div>' +
        '<div class="s"><span class="sk-b" style="width:130px;height:15px"></span></div></div>' +
        '<span class="a"><span class="sk-b" style="width:84px;height:19px"></span></span>' + CHEV;
      b.querySelector('.nm').textContent = d.label;
      b.onclick = function () { openDoc(d); };
      box.appendChild(b);
    });
    drawCta(p, i);
    fillAmounts(p, m, g);
  }
  // 금액은 명세서 PDF 글자에서 읽는다 — 화면 숫자와 문서 숫자가 같은 출처(두 진실 0).
  // 지급액계 − 공제액계 = 실지급액이 안 맞으면 숫자를 안 보이고 카드만 둔다(틀린 숫자보다 없는 숫자가 낫다)
  function fillAmounts(p, m, g) {
    var total = 0, allOk = true, left = m.docs.length;
    m.docs.forEach(function (d) {
      getFile(d).then(function (f) {
        if (p._gen !== g) return;
        var card = p.querySelector('.doc[data-id="' + d.id + '"]'); if (!card) { allOk = false; return; }
        var sl = f.slip;
        card.querySelector('.s').textContent = sl && sl.calc ? fmt(sl.calc.unit) + '원 × ' + sl.calc.n + '회기' : '';
        card.querySelector('.a').textContent = sl ? fmt(sl.net) + '원' : '';
        if (sl) total += sl.net; else allOk = false;
      }).catch(function () {
        allOk = false;
        if (p._gen !== g) return;
        var card = p.querySelector('.doc[data-id="' + d.id + '"]'); if (!card) return;
        card.querySelector('.s').textContent = ''; card.querySelector('.a').textContent = '';
      }).then(function () {
        if (--left || p._gen !== g) return;
        if (allOk) p.querySelector('.m-net').innerHTML = esc(fmt(total)) + '<span class="u">원</span>';
        else p.querySelector('.m-sum').hidden = true;
        fade(p);
      });
    });
  }
  function drawCta(p, i) {
    var m = ME.months[i], c = p.querySelector('.m-cta');
    if (m.noack) { c.innerHTML = ''; return; }   // 카톡으로 이미 받은 달 = 보기만
    if (m.ack) { c.innerHTML = '<div class="acked">' + CHECK + '<span></span></div>'; c.querySelector('span:last-child').textContent = mdText(m.ack.at) + '에 확인했어요'; return; }
    c.innerHTML = '<button class="btn" type="button">확인했어요</button>';
    var b = c.querySelector('.btn'); pressRipple(b);
    b.onclick = function () { doAck(p, i, b); };
  }
  var ackBusy = {};   // 달마다 — 한 달 확인을 남기는 동안 다른 달 버튼은 그대로 눌린다
  // 확인 = 교부 증거라 낙관 표시를 안 한다 — 서버가 남긴 뒤에만 「확인했어요」 줄(누른 동안은 버튼 위 로딩, §4.13-4).
  // 화면이 본 판(ver)을 같이 보낸다 → 그 사이 정정본이 올라왔으면 서버가 stale로 돌려주고 새로 불러온다(본 적 없는 판을 확인으로 남기지 않음)
  function doAck(p, i, b) {
    var m = ME.months[i], s = sess(), g = p._gen, ym = m.ym;
    if (ackBusy[ym]) return; ackBusy[ym] = 1;
    btnLoad(b, '확인을 남기고 있어요');
    call({ action: 'ack', t: s && s.t, ym: ym, ver: m.ver }).then(function (r) {
      delete ackBusy[ym];
      if (r && r.ok) {
        m.ack = { at: r.at || new Date().toISOString() };
        if (p._gen === g) drawCta(p, i);
        if (p.id === 'pMonth') drawPast();
        return;
      }
      if (p._gen === g) btnDone(b);
      if (r && r.code === 'auth') { setSess(null); openId(); toast('본인 확인을 다시 할게요'); return; }
      if (r && r.code === 'stale') { toast('명세서가 새로 바뀌었어요\n다시 보고 눌러 주세요'); openHome(false); return; }
      toast('확인을 못 남겼어요\n다시 눌러 주세요');
    }).catch(function () { delete ackBusy[ym]; if (p._gen === g) btnDone(b); toast('연결이 안 됐어요\n다시 눌러 주세요'); });
  }

  // 지난 명세서
  function drawPast() {
    var box = $('pastList'); box.innerHTML = '';
    ME.months.slice(1).forEach(function (m, k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mrow';
      b.innerHTML = '<span class="n"></span><span class="st"></span>' + CHEV;
      b.querySelector('.n').textContent = monthTitle(m.ym);
      var st = b.querySelector('.st');
      if (m.noack) { } else if (m.ack) st.textContent = mdText(m.ack.at) + ' 확인'; else { st.textContent = '확인 전'; st.classList.add('no'); }   // noack = 28 전에 카톡으로 받은 달 — 할 일이 없으니 아무 표시도 안 한다
      b.onclick = function () { viewing = k + 1; drawMonth(pg('pMonth'), viewing, false); push('pMonth'); };
      box.appendChild(b);
    });
  }
  $('toPast').onclick = function () { drawPast(); push('pPast'); };
  // 「이 기기에서 나가기」는 뺐다(유성 10-11) — 문자가 본인 폰으로만 와서 남의 기기에 로그인할 일이 드물고, 끝은 열쇠 수명(90일·180일)과 관리자 메뉴 「모든 기기 로그인 끊기」

  // ───────────── PDF(pdf.js — 문서리더 벤더 그대로, 처음 필요할 때만 받는다) ─────────────
  var pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) pdfjsP = import('./vendor/pdfjs/pdf.min.mjs').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href; return m;
    });
    return pdfjsP;
  }
  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  var inflight = {};
  function getFile(d) {
    if (FILES[d.id]) return Promise.resolve(FILES[d.id]);
    if (inflight[d.id]) return inflight[d.id];
    var s = sess();
    // 이번 달 명세서는 my 응답에 같이 실려 온다(왕복 1번 절약 — GAS 왕복 1.5~2초). 지난 달은 열 때 받는다
    var got = d.b64 ? Promise.resolve({ ok: true, b64: d.b64 }) : call({ action: 'file', t: s && s.t, id: d.id });
    delete d.b64;
    inflight[d.id] = got.then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.code) || 'file');
      var bytes = b64ToBytes(r.b64);
      return readSlip(bytes).then(function (slip) { FILES[d.id] = { bytes: bytes, slip: slip }; delete inflight[d.id]; return FILES[d.id]; });
    }).catch(function (e) { delete inflight[d.id]; throw e; });
    return inflight[d.id];
  }
  function readSlip(bytes) {
    return pdfjs().then(function (lib) { return lib.getDocument({ data: bytes.slice() }).promise; })
      .then(function (doc) { return doc.getPage(1).then(function (pg1) {
        var H = pg1.getViewport({ scale: 1 }).height;
        return pg1.getTextContent().then(function (tc) { doc.destroy(); return parseSlip(tc.items, H); });
      }); })
      .catch(function () { return DEMO && DEMO_SLIP[bytes.length] || null; });
  }
  // 12 배포용 명세서 글자 배치(26.09 실물 실측): 「실지급액」 오른쪽 숫자 / 「지급액계」~「공제액계」 사이 숫자 / 「공제액계」 오른쪽 숫자 / 「단가 x N회기」
  function parseSlip(items, H) {
    var it = items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
      return { s: i.str.trim(), k: i.str.replace(/\s+/g, ''), x: i.transform[4], y: H - i.transform[5] };
    });
    function num(s) { return /^-?[\d,]+$/.test(s) ? parseInt(s.replace(/,/g, ''), 10) : null; }
    function lab(k) { for (var j = 0; j < it.length; j++) if (it[j].k === k) return it[j]; return null; }
    function right(L, xMax) {
      return it.filter(function (i) { return Math.abs(i.y - L.y) < 5 && i.x > L.x && (xMax == null || i.x < xMax) && num(i.k) !== null; })
        .sort(function (a, b) { return a.x - b.x; });
    }
    var LN = lab('실지급액'), LP = lab('지급액계'), LD = lab('공제액계');
    if (!LN || !LP || !LD) return null;
    var n = right(LN), pp = right(LP, LD.x), dd = right(LD);
    if (!n.length || !pp.length) return null;
    var net = num(n[n.length - 1].k), pay = num(pp[pp.length - 1].k), ded = dd.length ? num(dd[dd.length - 1].k) : 0;
    if (pay - ded !== net) return null;
    // 「단가 x N회기」는 12에서 세 칸(단가·x·N회기)이라 PDF 글자 조각이 명세서마다 다르게 끊긴다(10-12 실측:
    // 「오감쑥쑥 서비스 19,000 x」+「4회기」 두 조각 / 「30,000 x 20회기」 한 조각). 그 줄 조각을 왼쪽부터 이어 붙여 찾는다
    var calc = null;
    for (var j = 0; j < it.length && !calc; j++) {
      if (it[j].k.indexOf('회기') < 0) continue;
      var y0 = it[j].y;
      var line = it.filter(function (i) { return Math.abs(i.y - y0) < 5; }).sort(function (a, b) { return a.x - b.x; })
        .map(function (i) { return i.k; }).join('');
      var mm = line.match(/([\d,]+)x(\d+)회기/);
      if (mm && num(mm[1]) !== null) calc = { unit: num(mm[1]), n: +mm[2] };
    }
    return { net: net, pay: pay, ded: ded, calc: calc };
  }

  // ───────────── 크게 보기 ─────────────
  var view = null;   // { d, pinch, z, render }
  function openDoc(d) {
    push('pDoc'); $('docT').textContent = d.label;
    var vb = $('vb'); vb.innerHTML = '<div class="vmsg">' + loadingHTML('명세서를 펼치고 있어요') + '</div>';
    vb.scrollTop = 0; vb.scrollLeft = 0;
    view = { d: d };
    var mine = view;
    getFile(d).then(function (f) { if (view === mine) return showPdf(f, mine); })
      .catch(function () {
        if (view !== mine) return;
        vb.innerHTML = '<div class="vmsg">명세서를 아직 못 불러왔어요<br><button class="lk" type="button">다시 불러오기</button></div>';
        vb.querySelector('.lk').onclick = function () { pop(); setTimeout(function () { openDoc(d); }, 400); };
      });
  }
  function showPdf(f, mine) {
    var vb = $('vb');
    return pdfjs().then(function (lib) { return lib.getDocument({ data: f.bytes.slice() }).promise; }).then(function (doc) {
      if (view !== mine) { doc.destroy(); return; }
      return doc.getPage(1).then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        var W = Math.max(200, vb.clientWidth - 24);
        vb.innerHTML = '<div class="pages"><div class="paper"></div></div>';
        var pages = vb.querySelector('.pages'), paper = vb.querySelector('.paper');
        paper.style.width = W + 'px'; paper.style.height = Math.round(W * vp1.height / vp1.width) + 'px';
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var drawn = 0;
        mine.render = function (z) {   // 멈추면 그 배율로 다시 선명하게(12MP 상한)
          var sc = (W / vp1.width) * dpr * Math.max(1, z);
          var px = vp1.width * sc * vp1.height * sc; if (px > 12e6) sc *= Math.sqrt(12e6 / px);
          if (Math.abs(sc - drawn) < 0.01) return;
          drawn = sc;
          var vp = page.getViewport({ scale: sc }), cv = document.createElement('canvas');
          cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
          page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () {
            if (view !== mine) return; paper.innerHTML = ''; paper.appendChild(cv);
          });
        };
        mine.render(1);
        mine.pinch = attachPinch(vb, function () { return pages; }, { min: 1, max: 3.5, onEnd: function (z) { mine.render(z); } });
        mine.doc = doc;
        firstHint();
      });
    }).catch(function () {
      if (view !== mine) return;
      if (DEMO && DEMO_PNG[f.bytes.length]) return showPng(DEMO_PNG[f.bytes.length], mine);   // 예시를 파일로 열면(file://) pdf.js가 못 뜬다
      vb.innerHTML = '<div class="vmsg">이 기기에서 명세서를 펼치지 못했어요<br><button class="lk" type="button">파일로 받기</button></div>';
      vb.querySelector('.lk').onclick = saveDoc;
    });
  }
  function showPng(src, mine) {
    var vb = $('vb'), W = Math.max(200, vb.clientWidth - 24);
    vb.innerHTML = '<div class="pages"><div class="paper"><img alt="" style="display:block;width:100%"></div></div>';
    vb.querySelector('.paper').style.width = W + 'px'; vb.querySelector('img').src = src;
    mine.pinch = attachPinch(vb, function () { return vb.querySelector('.pages'); }, { min: 1, max: 3.5 });
    firstHint();
  }
  function closeViewer() { if (view && view.doc) { try { view.doc.destroy(); } catch (e) { } } view = null; $('vhint').classList.remove('on'); }
  function firstHint() {   // 처음 한 번만(이 기기) — 확대가 된다는 걸 모르면 7~8px 글자를 그대로 읽게 된다
    var seen = false; try { seen = !!localStorage.getItem(HINT_KEY); localStorage.setItem(HINT_KEY, '1'); } catch (e) { }
    if (seen && !DEMO) return;
    var h = $('vhint'); h.classList.add('on'); setTimeout(function () { h.classList.remove('on'); }, 2600);
  }
  function saveDoc() {
    if (!view) return; var f = FILES[view.d.id]; if (!f) return;
    var url = URL.createObjectURL(new Blob([f.bytes], { type: 'application/pdf' }));
    var a = document.createElement('a'); a.href = url; a.download = view.d.fname || '급여명세서.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  $('docSave').onclick = saveDoc;
  // 두 손가락 확대 = 문서리더 attachPinch(CSS zoom + 손가락 가운데 고정) + 두 번 탭 = 1 ↔ 2.5배
  function attachPinch(scroller, getTarget, opts) {
    var min = opts.min || 1, max = opts.max || 3, startDist = 0, startZ = 1, z = 1, pinching = false, raf = 0, pend = null, lastTap = 0, lx = 0, ly = 0;
    var dist = function (e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); };
    function setZ(nz, mx, my) {
      var prev = z; z = nz; var t = getTarget(); if (!t) return;
      var sx = scroller.scrollLeft, sy = scroller.scrollTop; t.style.zoom = z;
      var k = z / prev; scroller.scrollLeft = (sx + mx) * k - mx; scroller.scrollTop = (sy + my) * k - my;
    }
    var apply = function () { raf = 0; if (!pend) return; var p = pend; pend = null; setZ(p.nz, p.mx, p.my); };
    scroller.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { pinching = true; startDist = dist(e); startZ = z; } }, { passive: true });
    scroller.addEventListener('touchmove', function (e) {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      var r = scroller.getBoundingClientRect();
      pend = { nz: Math.min(max, Math.max(min, startZ * dist(e) / startDist)), mx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: false });
    var end = function () { if (pinching) { pinching = false; if (opts.onEnd) opts.onEnd(z); } };
    scroller.addEventListener('touchend', function (e) {
      end();
      if (e.changedTouches.length !== 1 || e.touches.length) return;
      var t = e.changedTouches[0], now = Date.now();
      if (now - lastTap < 300 && Math.abs(t.clientX - lx) < 24 && Math.abs(t.clientY - ly) < 24) { lastTap = 0; e.preventDefault(); toggle(t.clientX, t.clientY); }
      else { lastTap = now; lx = t.clientX; ly = t.clientY; }
    }, { passive: false });
    scroller.addEventListener('touchcancel', end, { passive: true });
    scroller.addEventListener('dblclick', function (e) { toggle(e.clientX, e.clientY); });
    function toggle(cx, cy) {
      var r = scroller.getBoundingClientRect();
      setZ(z > 1.2 ? 1 : 2.5, cx - r.left, cy - r.top);
      if (opts.onEnd) opts.onEnd(z);
    }
    return { getZ: function () { return z; } };
  }

  // ───────────── 뒤로(§4.11 — 한 겹씩, 맨 처음 화면에선 두 번이라야 나감: 근태 26차-16c 그대로) ─────────────
  function goBack() {
    if ($('cmodal').classList.contains('on')) { closeBox(); return true; }
    var id = curId();
    if (id === 'pOtp') { if (otp.busy || pg('pOtp').classList.contains('suc-textout')) return true; stopTimer(); return pop(); }
    if (stack.length > 1) return pop();
    return false;
  }
  document.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { goBack(); }; });
  function guard() { try { history.pushState({ pay: 1 }, ''); } catch (e) { } }
  var exitArmed = false, exitT = 0;
  function showExit() {
    var e = $('exitHint'), g = bottomGap();
    e.style.bottom = g ? 'calc(' + g + 'px + env(safe-area-inset-bottom))' : '';
    e.classList.add('on');
  }
  function hideExit() { exitArmed = false; clearTimeout(exitT); $('exitHint').classList.remove('on'); }
  document.addEventListener('pointerdown', function () { if (exitArmed) { hideExit(); guard(); } }, true);   // 나가려던 게 아니었다 → 가드 복구
  window.addEventListener('popstate', function () {
    if (goBack()) { hideExit(); guard(); return; }
    if (exitArmed) { hideExit(); history.go(-1); return; }   // 아래에 칸이 남아 있던 경우(브라우저 탭)
    showExit(); exitArmed = true;                            // 첫 번째 = 머무르고 안내(가드는 다시 안 쌓는다)
    exitT = setTimeout(function () { exitArmed = false; $('exitHint').classList.remove('on'); guard(); }, 2000);
  });
  guard();
  [idGo].forEach(pressRipple);

  // ═════════════ 예시(?demo=1) — 지어낸 이름·금액. 서버 0 ═════════════
  var DEMO_SLIP = {}, DEMO_PNG = {};
  function demoApi(b) {
    var wait = function (ms, v) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms); }); };
    if (SCENE === 'error' && b.action === 'my') return wait(900).then(function () { throw new TypeError('demo'); });
    if (b.action === 'start') return wait(900, b.phone === '01000000000' ? { ok: false, code: 'notfound' } : b.phone === '01011111111' ? { ok: false, code: 'ambiguous' } : { ok: true });
    if (b.action === 'verify') return wait(1100, b.code === '000000' ? { ok: false, code: 'wrong' } : { ok: true, t: 'demo', name: '김하늘' });
    if (b.action === 'my') return wait(800, JSON.parse(JSON.stringify(demoMe())));
    if (b.action === 'file') {
      var f = b.id.indexOf('b') >= 0 ? 'demo/b' : 'demo/a';
      return fetch(f + '.pdf').then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
        var u = new Uint8Array(ab), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
        return { ok: true, b64: btoa(s) };
      }).catch(function () { return demoPngFallback(f); });
    }
    if (b.action === 'ack') return wait(900, { ok: true, at: new Date().toISOString() });
    return wait(300, { ok: false, code: 'bad' });
  }
  function demoMe() {
    var cur = { ym: '26.10', docs: [
      { id: 'a1', label: '미추홀 오감', fname: '급여명세서_생각미추오감_김하늘_26.10.pdf', fixed: SCENE === 'fixed' },
      { id: 'b1', label: '행복마음', fname: '(급여명세서_행복_김하늘_26.10.pdf', fixed: false }
    ], ack: SCENE === 'acked' ? { at: '2026-11-15T21:03:00+09:00' } : null };
    var past = [   // 11월 15일 첫날 모습 = 9월분(카톡으로 이미 받은 달)만 지난 명세서에
      { ym: '26.09', noack: true, docs: [{ id: 'a2', label: '미추홀 오감', fname: '급여명세서_생각미추오감_김하늘_26.09.pdf', fixed: false }], ack: null }
    ];
    return { ok: true, t: 'demo', name: '김하늘', months: SCENE === 'empty' ? [] : [cur].concat(past) };
  }
  // 파일로 연 예시(file://)는 fetch·pdf.js가 막힌다 → 미리 그려 둔 그림과 그 숫자로 대신 보인다
  function demoPngFallback(f) {
    var fake = f === 'demo/b' ? 7 : 5;   // 바이트 길이를 열쇠로 쓴다(진짜 PDF와 안 겹치게 아주 작게)
    DEMO_PNG[fake] = f + '.png';
    DEMO_SLIP[fake] = f === 'demo/b' ? { net: 100000, pay: 100000, ded: 0, calc: { unit: 25000, n: 4 } } : { net: 1126640, pay: 1140000, ded: 13360, calc: { unit: 20000, n: 57 } };
    return { ok: true, b64: btoa(f === 'demo/b' ? 'demo-bb' : 'demo-') };
  }

  // ═════════════ 시작 ═════════════
  if (DEMO && SCENE && SCENE !== 'id') memStore = { t: 'demo', name: '김하늘' };
  if (sess()) openHome(false); else openId();
})();
