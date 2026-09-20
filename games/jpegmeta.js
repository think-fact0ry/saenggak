/* JPEG에서 메타정보만 떼어 낸다 — 그림 데이터는 한 바이트도 건드리지 않는다(화질 손실 0).
   왜: 관리자가 넣는 상자 사진을 원본 그대로 Drive에 두기로 했다(유성 2026-09-21 — 나중에 홈페이지 등에 다시 쓴다).
       그런데 폰 원본에는 촬영 위치(GPS), 기종, 시각, 그리고 파일 끝에 붙는 덤(모션포토 영상 등)이 들어 있고 이 파일은 링크 공개다.
   하는 일: APP1(Exif, XMP), ICC가 아닌 APP2(MPF), APP3~13, APP15, 주석(COM)을 버리고, EOI 뒤에 붙은 덤을 자른다.
            사진이 누워 보이지 않게 **방향 값(Orientation) 하나만** 담은 작은 Exif를 새로 만들어 넣는다.
   남기는 것: APP0(JFIF), ICC 프로파일(색), APP14(Adobe — 색 변환에 쓰임), 그림 세그먼트 전부.
   구조가 조금이라도 이상하면 null — 부르는 쪽이 캔버스로 다시 그리는 길로 넘어간다(그 길도 메타정보는 안 남는다). */
(function (root) {
  "use strict";

  function be16(b, o) { return (b[o] << 8) | b[o + 1]; }

  /** APP1 payload(길이 2바이트 뒤)에서 Orientation(1~8). 없거나 이상하면 0. */
  function orientationOf(b, s, len) {
    if (len < 14) return 0;
    if (!(b[s] === 0x45 && b[s + 1] === 0x78 && b[s + 2] === 0x69 && b[s + 3] === 0x66 && b[s + 4] === 0 && b[s + 5] === 0)) return 0;   // "Exif\0\0"
    var t = s + 6, end = s + len;
    var le = b[t] === 0x49 && b[t + 1] === 0x49;
    if (!le && !(b[t] === 0x4D && b[t + 1] === 0x4D)) return 0;
    function r16(o) { return le ? (b[o] | (b[o + 1] << 8)) : ((b[o] << 8) | b[o + 1]); }
    function r32(o) { return le ? ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0) : (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0); }
    if (r16(t + 2) !== 42) return 0;
    var ifd = t + r32(t + 4);
    if (ifd + 2 > end) return 0;
    var n = r16(ifd);
    for (var i = 0; i < n; i++) {
      var e = ifd + 2 + i * 12;
      if (e + 12 > end) return 0;
      if (r16(e) === 0x0112) { var v = r16(e + 8); return v >= 1 && v <= 8 ? v : 0; }
    }
    return 0;
  }

  function isIcc(b, s, len) {   // "ICC_PROFILE\0"
    var sig = [0x49, 0x43, 0x43, 0x5F, 0x50, 0x52, 0x4F, 0x46, 0x49, 0x4C, 0x45, 0x00];
    if (len < sig.length) return false;
    for (var i = 0; i < sig.length; i++) if (b[s + i] !== sig[i]) return false;
    return true;
  }

  /** 방향 값 하나만 담은 APP1(36바이트). */
  function orientApp1(v) {
    return [0xFF, 0xE1, 0x00, 0x22,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                 // Exif\0\0
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,     // TIFF 헤더(little-endian), IFD0 = 8
      0x01, 0x00,                                         // 항목 1개
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, v, 0x00, 0x00, 0x00,   // 0x0112 SHORT ×1 = v
      0x00, 0x00, 0x00, 0x00];                            // 다음 IFD 없음
  }

  /** @param {Uint8Array} b @return {{bytes:Uint8Array, orientation:number, dropped:number}|null} */
  function strip(b) {
    if (!b || b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
    var n = b.length, o = 2, keep = [], orient = 0, done = false;
    while (!done) {
      if (o + 4 > n || b[o] !== 0xFF) return null;
      var m = b[o + 1];
      if (m === 0xFF) { o++; continue; }                                   // 채움 바이트
      if (m === 0xD9 || m === 0xD8) return null;                           // 그림이 나오기 전에 끝/시작 = 이상
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { keep.push([o, o + 2]); o += 2; continue; }
      var len = be16(b, o + 2);
      if (len < 2 || o + 2 + len > n) return null;
      var segEnd = o + 2 + len;
      if (m === 0xDA) {                                                    // SOS: 헤더 뒤로 압축 데이터가 이어진다
        var p = segEnd;
        for (;;) {
          if (p + 1 >= n) return null;                                     // EOI 없이 끝남
          if (b[p] !== 0xFF) { p++; continue; }
          var x = b[p + 1];
          if (x === 0x00 || (x >= 0xD0 && x <= 0xD7)) { p += 2; continue; } // 채움 0과 RST는 데이터의 일부
          if (x === 0xFF) { p++; continue; }
          break;                                                           // 진짜 마커
        }
        keep.push([o, p]);
        o = p;
        if (b[o + 1] === 0xD9) { keep.push([o, o + 2]); done = true; }     // EOI — 뒤에 붙은 덤은 버린다
        continue;                                                          // 점진(progressive) JPEG는 다음 스캔으로
      }
      var drop = false;
      if (m === 0xE1) { if (!orient) orient = orientationOf(b, o + 4, len - 2); drop = true; }
      else if (m === 0xE2) drop = !isIcc(b, o + 4, len - 2);
      else if (m >= 0xE3 && m <= 0xEF && m !== 0xEE) drop = true;
      else if (m === 0xFE) drop = true;
      if (!drop) keep.push([o, segEnd]);
      o = segEnd;
    }
    var head = orient > 1 ? orientApp1(orient) : [];
    var size = 2 + head.length;
    keep.forEach(function (r) { size += r[1] - r[0]; });
    var out = new Uint8Array(size);
    out[0] = 0xFF; out[1] = 0xD8;
    out.set(head, 2);
    var w = 2 + head.length;
    keep.forEach(function (r) { out.set(b.subarray(r[0], r[1]), w); w += r[1] - r[0]; });
    return { bytes: out, orientation: orient, dropped: n - size };
  }

  var api = { strip: strip };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TFJpegMeta = api;
})(typeof window !== "undefined" ? window : this);
