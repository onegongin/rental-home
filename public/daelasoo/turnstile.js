// 로봇 확인 (Cloudflare Turnstile) — 게스트 관심등록 · 방문예약 보낼 때만. 키는 config.js 의 HWIP_TS_KEY
// 대부분 사람에게는 아무것도 안 보이고, 의심스러울 때만 화면 아래에 체크 칸이 잠깐 뜸
(function () {
  var loading = null, wid = null, box = null;
  function load() {
    if (window.turnstile) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = ok; s.onerror = function () { loading = null; no(new Error('turnstile')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  window.hwipTs = function () {
    var key = window.HWIP_TS_KEY;
    if (!key) return Promise.resolve('');
    return load().then(function () {
      return new Promise(function (ok) {
        if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:3000'; document.body.appendChild(box); }
        if (wid !== null) { try { window.turnstile.remove(wid); } catch (e) {} }
        var done = function (t) { ok(t || ''); };
        wid = window.turnstile.render(box, { sitekey: key, appearance: 'interaction-only', callback: done, 'error-callback': function () { done(''); }, 'timeout-callback': function () { done(''); } });
      });
    });
  };
})();
