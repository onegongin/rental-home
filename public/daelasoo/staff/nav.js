// [대라수 업무 ▾] 펼침 메뉴 — 따로 열리는 직원 화면(KPI · 소통 · 청구서 …) 위쪽 줄에 붙임 (시안 r40 A안 확정 2026-11-16)
// 목록 · 권한은 대시보드 grpMenu() 와 같게 (상담카드는 2026-11-16 대시보드 탭으로 다시 뺌): 일일업무보고 = 대표 · 관리자 · 권한자, 청구서 · 자료 옮기기 = 대표 · 관리자
// 쓰는 법: <div class="top"><div class="wrap"><a href="./">← 직원 대시보드</a><span data-grpnav></span></div></div> + <script src="nav.js"></script>
(function () {
  var host = document.querySelector('[data-grpnav]');
  if (!host) return;
  var page = (location.pathname.split('/').pop() || '').toLowerCase();
  var G = [
    ['상담', [['board.html', '💬 소통', '상담참고 · 요청함 · 불편사항']]],
    ['세대 · 가격', [['./?tab=vac', '🔑 공실 · 신규분양', '공실 일수 · 손님 화면 공개'], ['units.html', '🏠 전환상태', '세대 상태 · 손님 공개 세대'], ['prices.html', '💰 분양가표 · 전세연장', '호실별 분양가 · 보증금']]],
    ['관리', [['kpi.html', '📊 KPI', '담당별 실적 · 미상담 세대'], ['report.html', '🧾 일일업무보고', '오늘 실적 · 인쇄 · 엑셀', 'top'], ['claims.html', '📑 청구서', '수수료 청구 · MGM', 'boss'], ['migrate.html', '📥 자료 옮기기', '고객DB 엑셀 옮기기', 'boss']]]
  ];
  var css = document.createElement('style');
  css.textContent = '[data-grpnav]{position:relative;display:inline-block}' +
    '.gn-b{border:1.5px solid #c8381e;border-radius:9999px;padding:6px 13px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;background:#c8381e;color:#fff;white-space:nowrap}' +
    '.gn-m{position:absolute;top:calc(100% + 6px);left:0;z-index:60;background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.18);padding:14px;width:min(640px,calc(100vw - 32px));display:none;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}' +
    '.gn-m.on{display:grid}.gn-m h4{margin:0 0 4px 10px;font-size:11.5px;color:#8e8e93}.gn-m a{display:flex;flex-direction:column;gap:1px;padding:8px 10px;border-radius:10px;text-decoration:none;color:#1d1d1f}' +
    '.gn-m a:hover{background:#f5f5f7}.gn-m a.cur{background:#fdecea}.gn-m a b{font-size:14px}.gn-m a span{font-size:11.5px;color:#6e6e73;font-weight:400}' +
    '@media(max-width:560px){.gn-m{position:fixed;left:16px;right:16px;top:60px;width:auto;max-height:calc(100vh - 80px);overflow-y:auto}}';
  document.head.appendChild(css);
  var curName = '';
  G.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === page) curName = x[1].replace(/^\S+\s/, ''); }); });
  host.innerHTML = '<button type="button" class="gn-b" aria-haspopup="true" aria-expanded="false">대라수 업무' + (curName ? ' · ' + curName : '') + ' ▾</button><div class="gn-m" role="menu"></div>';
  var btn = host.querySelector('.gn-b'), menu = host.querySelector('.gn-m');
  function draw(role) {
    var top = ['대표', '관리자', '권한자'].indexOf(role) >= 0, boss = role === '대표' || role === '관리자';
    menu.innerHTML = G.map(function (g) {
      var items = g[1].filter(function (x) { return !x[3] || (x[3] === 'top' ? top : boss); });
      return '<div><h4>' + g[0] + '</h4>' + items.map(function (x) { return '<a role="menuitem" href="' + x[0] + '"' + (x[0] === page ? ' class="cur"' : '') + '><b>' + x[1] + '</b><span>' + x[2] + '</span></a>'; }).join('') + '</div>';
    }).join('');
  }
  draw('');
  fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.user) draw(j.user.role); }).catch(function () {});
  btn.addEventListener('click', function (e) { e.stopPropagation(); var on = !menu.classList.contains('on'); menu.classList.toggle('on', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  document.addEventListener('click', function (e) { if (!host.contains(e.target)) { menu.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.classList.remove('on'); });
})();
