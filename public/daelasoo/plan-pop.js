// 상단 타입 칩 → 평면 창 (시안 preview/type-popup.html D안 확정 2026-10-28)
// - 왼쪽 타입소개 그림(마우스 휠로 마우스 위치 확대 · 끌어서 이동 · 두 번 누르면 원래대로 · 휴대폰 두 손가락)
// - 아파트: 오른쪽 확장형 · 기본형 평면(누르면 크게 보기) / 84A · 84B: 그 옆 실내 사진 칸 / 79OT: 그림 오른쪽 실내 사진
// - 화면(dashboard)에서 window.hwPlanPop.open(타입, { types, base, ver, onBoard, onReg }) 로 연다
(function () {
  const OT = { 69: 1, 79: 1 };
  const VN = { ext: '확장형', basic: '기본형' };
  // 오른쪽 두 평면 칸 이름: site.json types[타입].views 가 있으면 그것 (대라수: 입체 평면 · 위에서 본 평면, R1 2026-11-13)
  const vn = (k, v) => (((O.types || {})[k] || {}).views || {})[v] || VN[v];
  // 실내 사진 (소스/실내 → assets/hwip/interior/타입_번호.jpg)
  const INT = { '84A': ['거실', '침실', '욕실'], '84B': ['거실', '주방', '드레스룸', '수납장', '화장실'], '79': ['거실', '주방', '침실', '침실 2', '화장실'] };
  const name = k => OT[k] ? k + 'OT' : k === '218' ? 'PH 218' : k;
  // 타입 순서: 아파트(84A ~ PH 218) 먼저, 오피스텔(69 · 79) 뒤 — 숫자 이름(69 · 148 …)이 앞으로 오는 자바스크립트 순서를 바로잡음
  const order = T => Object.keys(T).sort((a, b) => !!OT[a] - !!OT[b] || parseFloat(a) - parseFloat(b) || a.localeCompare(b));
  const sumBy = (t, f) => Object.values(t.byBlock || {}).reduce((a, b) => a + (+b[f] || 0), 0);

  const CSS = `
#hpp, #hpp2, #hpp3 { font-family: 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif; color: #1d1d1f; }
#hpp *, #hpp2 *, #hpp3 * { box-sizing: border-box; }
#hpp { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 9000; }
#hpp.on, #hpp2.on, #hpp3.on { display: flex; }
#hpp .pop { width: 100%; max-width: min(1440px, calc((100vh - 190px) * 2.2)); max-height: calc(100vh - 40px); overflow-y: auto; scrollbar-width: none; background: #fff; border-radius: 20px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
#hpp .pop.ot { max-width: min(1200px, calc((100vh - 190px) * 1.878)); }
#hpp .pop.ot.hasPics { max-width: min(1500px, calc((100vh - 190px) * 2.55)); }
#hpp .pop.pcols { max-width: min(1760px, calc((100vh - 190px) * 2.8)); }
#hpp .hd { display: flex; align-items: center; gap: 8px 10px; padding: 14px 18px 10px; flex-wrap: wrap; }
#hpp .dot { width: 12px; height: 12px; border-radius: 4px; }
#hpp .t { font-size: 18px; font-weight: 800; }
#hpp .s { font-size: 12.5px; color: #6e6e73; }
#hpp .x, #hpp2 .x { margin-left: auto; border: none; background: #f0f0f2; border-radius: 9999px; width: 32px; height: 32px; font-size: 14px; cursor: pointer; color: #1d1d1f; }
#hpp .nav { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 18px 12px; align-items: center; }
#hpp .nav span { font-size: 11px; color: #6e6e73; margin-right: 2px; }
#hpp .nav button { border: 1px solid #d2d2d7; background: #fff; color: #1d1d1f; border-radius: 9999px; padding: 3px 11px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
#hpp .nav button.on { background: #1d1d1f; color: #fff; border-color: #1d1d1f; }
#hpp .body { display: flex; gap: 14px; align-items: stretch; border-top: 1px solid #f0f0f2; padding: 0 16px 0 0; }
#hpp .pop.ot .body { padding: 0; }
#hpp .side { flex: 0 0 23%; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 14px 0; }
#hpp .pop.pcols .side { flex-basis: 20%; }
#hpp .pop.ot .side { display: none; }
#hpp .card { border: none; padding: 0; margin: 0; background: #fff; cursor: zoom-in; display: flex; flex-direction: column; text-align: left; font: inherit; color: inherit; }
#hpp .card .cap { background: #4d7d93; color: #fff; font-size: 14px; font-weight: 700; text-align: center; padding: 6px 8px; letter-spacing: .02em; }
#hpp .card .box { display: block; border: 1.5px solid #c9ced3; border-top: none; aspect-ratio: 923 / 676; background: #fff center / contain no-repeat; transition: box-shadow .2s; }
#hpp .card:hover .box { box-shadow: inset 0 0 0 2px #4d7d93; }
#hpp .card .more { font-size: 11.5px; color: #6e6e73; text-align: right; padding-top: 4px; }
#hpp .stage, #hpp2 .stage { position: relative; flex: 1 1 auto; min-width: 0; aspect-ratio: 1200 / 720; overflow: hidden; background: #fff; cursor: zoom-in; touch-action: none; user-select: none; }
#hpp .pop.ot .stage { aspect-ratio: 1352 / 720; }
#hpp .stage.zoomed, #hpp2 .stage.zoomed { cursor: grab; } #hpp .stage.drag, #hpp2 .stage.drag { cursor: grabbing; }
#hpp .stage img, #hpp2 .stage img { position: absolute; left: 0; top: 0; height: 100%; max-width: none; transform-origin: 0 0; pointer-events: none; -webkit-user-drag: none; }
#hpp .stage img { width: 112.667%; }  /* 타입소개 그림 오른쪽 빈 곳(1200~1352px)은 잘라 냄 → 그 자리에 평면 2장 */
#hpp .pop.ot .stage img { width: 100%; }
#hpp2 .stage img { width: 100%; }
#hpp .zbar, #hpp2 .zbar { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,.95); border-radius: 9999px; padding: 3px; box-shadow: 0 1px 6px rgba(0,0,0,.18); z-index: 2; }
#hpp .zbar button, #hpp2 .zbar button { min-width: 30px; height: 30px; border: none; border-radius: 9999px; background: transparent; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; color: #1d1d1f; }
#hpp .zbar .pct, #hpp2 .zbar .pct { min-width: 54px; font-size: 12px; }
#hpp .hint, #hpp2 .hint { position: absolute; left: 12px; bottom: 12px; font-size: 12px; color: #6e6e73; background: rgba(255,255,255,.92); border-radius: 9999px; padding: 4px 10px; pointer-events: none; transition: opacity .3s; z-index: 2; }
#hpp .ph { position: relative; border: none; padding: 0; margin: 0; cursor: zoom-in; border-radius: 10px; overflow: hidden; background: #f5f5f7; min-height: 0; }
#hpp .ph img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .4s; }
#hpp .ph:hover img { transform: scale(1.04); }
#hpp .ph .cap { position: absolute; left: 8px; bottom: 8px; font-size: 11.5px; font-weight: 700; color: #fff; background: rgba(0,0,0,.5); border-radius: 9999px; padding: 2px 9px; }
#hpp .ph-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin-bottom: 8px; }
#hpp .ph-h b { font-size: 14px; font-weight: 800; } #hpp .ph-h span { font-size: 10.5px; color: #6e6e73; }
#hpp .pcol { display: none; flex: 0 0 21%; min-width: 0; flex-direction: column; padding: 12px 0; }
#hpp .oside { display: none; flex: 0 0 27%; min-width: 0; flex-direction: column; padding: 12px 16px 12px 0; }
#hpp .pop.pcols .pcol, #hpp .pop.ot.hasPics .oside { display: flex; }
#hpp .grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: minmax(0, 1fr); gap: 6px; }
#hpp .oside .grid { grid-template-rows: 1.25fr 1fr 1fr; gap: 8px; }
#hpp .grid .ph:first-child { grid-column: 1 / 3; }
#hpp .ft { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 18px 14px; border-top: 1px solid #f0f0f2; }
#hpp .ft .u { font-size: 12px; color: #6e6e73; margin-right: auto; }
#hpp .ft button { height: 36px; border-radius: 9999px; padding: 0 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #d2d2d7; background: #fff; color: #1d1d1f; }
#hpp .ft button.p { background: #c8381e; border-color: #c8381e; color: #fff; }
#hpp2 { position: fixed; inset: 0; background: rgba(0,0,0,.72); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 9010; }
#hpp2 .pop2 { width: 100%; max-width: min(1100px, calc((100vh - 120px) * var(--ar, 1.365))); background: #fff; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
#hpp2 .hd2 { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
#hpp2 .hd2 .cap { background: #4d7d93; color: #fff; font-size: 14px; font-weight: 700; padding: 4px 14px; border-radius: 6px; }
#hpp2 .tg { display: flex; gap: 4px; background: #f5f5f7; border-radius: 9999px; padding: 3px; }
#hpp2 .tg button { border: none; background: transparent; border-radius: 9999px; padding: 4px 12px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; color: #1d1d1f; }
#hpp2 .tg button.on { background: #1d1d1f; color: #fff; }
#hpp2 .stage { aspect-ratio: var(--ar, 1.365); border-top: 1px solid #f0f0f2; flex: none; }
#hpp3 { position: fixed; inset: 0; background: rgba(0,0,0,.86); display: none; align-items: center; justify-content: center; padding: 24px 70px; z-index: 9020; }
#hpp3 img { max-width: 100%; max-height: 100%; border-radius: 10px; }
#hpp3 .nv { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; border: none; background: rgba(255,255,255,.9); font-size: 20px; cursor: pointer; color: #1d1d1f; }
#hpp3 .pv { left: 14px; } #hpp3 .nx { right: 14px; }
#hpp3 .cl { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,.9); font-size: 18px; cursor: pointer; color: #1d1d1f; }
#hpp3 .lb { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); color: #fff; font-size: 13px; font-weight: 700; background: rgba(0,0,0,.5); border-radius: 9999px; padding: 4px 12px; white-space: nowrap; }
@media (max-width: 760px) {
  #hpp .body { flex-direction: column; padding: 0; }
  #hpp .side, #hpp .pop.pcols .side { flex: none; flex-direction: row; padding: 0 12px 12px; gap: 10px; }
  #hpp .card { flex: 1 1 0; min-width: 0; }
  #hpp .card .cap { font-size: 12px; }
  #hpp .stage { aspect-ratio: 1352 / 720; } #hpp .stage img { width: 100%; }
  #hpp .pcol, #hpp .oside { flex: none !important; padding: 0 12px 12px; }
  #hpp .grid, #hpp .oside .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: none; grid-auto-rows: auto; }
  #hpp .grid .ph:first-child { grid-column: auto; }
  #hpp .ph { aspect-ratio: 4 / 3; }
  #hpp .ft button { flex: 1 1 auto; }
  #hpp3 { padding: 24px 12px; }
}`;

  const ZBAR = '<div class="zbar"><button data-z="out" aria-label="축소">−</button><button class="pct" data-z="fit" aria-label="원래 크기">100%</button><button data-z="in" aria-label="확대">+</button></div>';
  const HTML = `
<div id="hpp"><div class="pop">
  <div class="hd"><span class="dot"></span><span class="t"></span><span class="s"></span><button class="x" aria-label="닫기">✕</button></div>
  <div class="nav"></div>
  <div class="body">
    <div class="stage"><img alt=""><span class="hint">마우스 휠로 원하는 곳을 확대 · 끌어서 이동 · 두 번 누르면 원래대로</span>${ZBAR}</div>
    <div class="side">
      <button class="card" data-v="ext"><span class="cap"></span><span class="box"></span><span class="more">누르면 크게 보기 ↗</span></button>
      <button class="card" data-v="basic"><span class="cap"></span><span class="box"></span><span class="more">누르면 크게 보기 ↗</span></button>
    </div>
    <div class="pcol"></div>
    <div class="oside"></div>
  </div>
  <div class="ft"><span class="u"></span><button class="b1">동호배치표에서 보기</button><button class="p b2">관심등록하기</button></div>
</div></div>
<div id="hpp2"><div class="pop2">
  <div class="hd2"><span class="cap"></span><span class="tg"><button data-v="ext">확장형</button><button data-v="basic">기본형</button></span><button class="x" aria-label="닫기">✕</button></div>
  <div class="stage"><img alt=""><span class="hint">마우스 휠로 원하는 곳을 확대 · 끌어서 이동</span>${ZBAR}</div>
</div></div>
<div id="hpp3"><img alt=""><button class="nv pv" aria-label="이전">‹</button><button class="nv nx" aria-label="다음">›</button><button class="cl" aria-label="닫기">✕</button><span class="lb"></span></div>`;

  // ── 확대 (마우스 휠은 마우스 위치 기준, 끌어서 이동, 두 번 누르면 원래대로, 휴대폰은 두 손가락) ──
  function zoomable(ST) {
    const IM = ST.querySelector('img'), PCT = ST.querySelector('.pct'), HINT = ST.querySelector('.hint'), MAX = 4; let z = 1, x = 0, y = 0;
    const clamp = () => { const w = ST.clientWidth, h = ST.clientHeight, iw = IM.offsetWidth * z, ih = IM.offsetHeight * z; x = Math.min(0, Math.max(w - iw, x)); y = Math.min(0, Math.max(h - ih, y)); };
    const draw = () => { clamp(); IM.style.transform = `translate(${x}px, ${y}px) scale(${z})`; PCT.textContent = Math.round(z * 100) + '%'; ST.classList.toggle('zoomed', z > 1.001); };
    // 100%로 돌아오면 위치도 처음 자리(왼쪽 위 0, 0)로 맞춤 — 줄이다 1배가 되었을 때 그림이 옆으로 밀린 채 남지 않게
    const at = (nz, px, py) => { nz = Math.min(MAX, Math.max(1, nz)); if (nz <= 1.02) return reset(true); x = px - (px - x) * nz / z; y = py - (py - y) * nz / z; z = nz; draw(); if (HINT) HINT.style.opacity = 0; };
    const reset = soft => { z = 1; x = 0; y = 0; IM.style.transition = soft === true ? '' : 'transform .25s ease'; draw(); setTimeout(() => { IM.style.transition = ''; }, 260); if (HINT) HINT.style.opacity = 1; };
    const pos = e => { const r = ST.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    ST.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = pos(e); at(z * Math.exp(-e.deltaY * 0.0015), px, py); }, { passive: false });
    ST.addEventListener('dblclick', reset);
    ST.querySelectorAll('.zbar button').forEach(b => { b.addEventListener('pointerdown', e => e.stopPropagation()); b.onclick = () => { const c = [ST.clientWidth / 2, ST.clientHeight / 2]; if (b.dataset.z === 'in') at(z * 1.5, ...c); else if (b.dataset.z === 'out') at(z / 1.5, ...c); else reset(); }; });
    const P = new Map(); let last = null, pinch = null;
    ST.addEventListener('pointerdown', e => { ST.setPointerCapture(e.pointerId); P.set(e.pointerId, pos(e)); last = pos(e); if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } if (z > 1.001) ST.classList.add('drag'); });
    ST.addEventListener('pointermove', e => { if (!P.has(e.pointerId)) return; const p = pos(e); P.set(e.pointerId, p);
      if (P.size === 2 && pinch) { const [a, b] = [...P.values()]; at(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
      if (z > 1.001 && last) { x += p[0] - last[0]; y += p[1] - last[1]; draw(); } last = p; });
    const up = e => { P.delete(e.pointerId); if (P.size < 2) pinch = null; last = P.size ? [...P.values()][0] : null; ST.classList.remove('drag'); };
    ST.addEventListener('pointerup', up); ST.addEventListener('pointercancel', up);
    window.addEventListener('resize', draw);
    return { reset };
  }

  let R = null, O = {}, cur = null, c3 = 0;
  const A = f => O.base + 'plans/' + f + O.v;
  const IA = (k, i) => O.base + 'interior/' + k + '_' + (i + 1) + '.jpg' + O.v;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.innerHTML = HTML; while (w.firstElementChild) document.body.appendChild(w.firstElementChild);
    const D1 = document.getElementById('hpp'), D2 = document.getElementById('hpp2'), D3 = document.getElementById('hpp3'), q = s => D1.querySelector(s);
    R = { D1, D2, D3, q, Z1: zoomable(q('.stage')), Z2: zoomable(D2.querySelector('.stage')) };
    D1.onclick = close; q('.pop').onclick = e => e.stopPropagation(); q('.x').onclick = close;
    D1.querySelectorAll('.card').forEach(c => c.onclick = () => open2(c.dataset.v));
    q('.b1').onclick = () => { const k = cur; close(); if (O.onBoard) O.onBoard(k); };
    q('.b2').onclick = () => { const k = cur; close(); if (O.onReg) O.onReg(k); };
    D2.onclick = close2; D2.querySelector('.pop2').onclick = e => e.stopPropagation(); D2.querySelector('.x').onclick = close2;
    D2.querySelectorAll('.tg button').forEach(b => b.onclick = () => open2(b.dataset.v));
    D3.querySelector('.pv').onclick = e => { e.stopPropagation(); show3(c3 - 1); };
    D3.querySelector('.nx').onclick = e => { e.stopPropagation(); show3(c3 + 1); };
    D3.onclick = () => D3.classList.remove('on');
    document.addEventListener('keydown', e => {
      if (D3.classList.contains('on')) { if (e.key === 'ArrowLeft') show3(c3 - 1); if (e.key === 'ArrowRight') show3(c3 + 1); if (e.key === 'Escape') D3.classList.remove('on'); return; }
      if (e.key !== 'Escape') return; if (D2.classList.contains('on')) close2(); else close(); });
  }

  // ── 평면 창 ──
  function open(k, opt) {
    if (opt) O = Object.assign({}, opt, { v: opt.ver ? '?v=' + opt.ver : '' });
    if (!R) build();
    const T = O.types || {}, q = R.q; cur = k;
    const t = T[k] || {}, b = Object.values(t.byBlock || {})[0] || {}, op = t.kind === '오피스텔';
    const L = INT[k] || [], otPics = !!OT[k] && L.length > 0, aptPics = !OT[k] && L.length > 0;
    const pop = q('.pop'); pop.classList.toggle('ot', !!OT[k]); pop.classList.toggle('hasPics', otPics); pop.classList.toggle('pcols', aptPics);
    q('.dot').style.background = t.color || '#ddd';
    q('.t').textContent = name(k) + ' 평면도';
    q('.s').textContent = (b.exclusive ? '전용 ' + (+b.exclusive).toFixed(2) + '㎡ · 공급 ' + (+b.supply).toFixed(2) + '㎡ (' + (b.supply * 0.3025).toFixed(1) + '평) · ' : '') + sumBy(t, 'households') + (op ? '실' : '세대');
    q('.u').textContent = Object.keys(t.byBlock || {}).map(g => g + ' ' + t.byBlock[g].households + (op ? '실' : '세대')).join(' · ');
    q('.nav').innerHTML = '<span>타입</span>' + order(T).map(x => `<button class="${x === k ? 'on' : ''}" data-k="${x}">${name(x)}</button>`).join('');
    q('.nav').querySelectorAll('button').forEach(b => b.onclick = () => open(b.dataset.k));
    const im = q('.stage img'); im.src = A('intro_' + k + '.jpg'); im.alt = name(k) + ' 타입 소개 평면도';
    if (!OT[k]) { const cs = R.D1.querySelectorAll('.card');
      cs[0].querySelector('.cap').textContent = '| ' + vn(k, 'ext') + ' |  ' + name(k); cs[1].querySelector('.cap').textContent = '| ' + vn(k, 'basic') + ' |  ' + name(k);
      cs[0].querySelector('.box').style.backgroundImage = `url(${A('ext_' + k + '.jpg')})`; cs[1].querySelector('.box').style.backgroundImage = `url(${A('basic_' + k + '.jpg')})`; }
    // 실내 사진: 84A · 84B는 평면 칸 옆, 79OT는 그림 오른쪽 (거실 크게 + 나머지 2칸씩)
    const tiles = L.map((n, i) => `<button class="ph" data-i="${i}" aria-label="${name(k)} ${n} 크게 보기"><img src="${IA(k, i)}" alt="${name(k)} 실내 · ${n}" loading="lazy"><span class="cap">${n}</span></button>`).join('');
    const box = L.length ? `<div class="ph-h"><b>실내 사진</b><span>견본주택 연출 사진 · 실제와 다를 수 있음</span></div><div class="grid">${tiles}</div>` : '';
    q('.pcol').innerHTML = aptPics ? box : ''; q('.oside').innerHTML = otPics ? box : '';
    R.D1.querySelectorAll('.ph').forEach(b => b.onclick = () => show3(+b.dataset.i));
    q('.ft').style.display = O.onBoard || O.onReg ? '' : 'none'; q('.b2').style.display = O.onReg ? '' : 'none';   // 관심등록은 공개 화면만
    R.D1.classList.add('on'); requestAnimationFrame(R.Z1.reset);
  }
  function close() { if (R) { R.D1.classList.remove('on'); R.D2.classList.remove('on'); R.D3.classList.remove('on'); } }

  // ── 평면 크게 보기 창 ──
  function open2(v) {
    const D2 = R.D2, im = D2.querySelector('img');
    im.onload = () => { D2.querySelector('.pop2').style.setProperty('--ar', (im.naturalWidth / im.naturalHeight).toFixed(4)); requestAnimationFrame(R.Z2.reset); };
    im.src = A(v + '_' + cur + '.jpg'); im.alt = name(cur) + ' ' + vn(cur, v) + ' 평면도';
    D2.querySelector('.cap').textContent = '| ' + vn(cur, v) + ' |  ' + name(cur);
    D2.querySelectorAll('.tg button').forEach(b => { b.textContent = vn(cur, b.dataset.v); });
    D2.querySelectorAll('.tg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    D2.classList.add('on');
  }
  function close2() { R.D2.classList.remove('on'); }

  // ── 실내 사진 크게 보기 ──
  function show3(i) { const L = INT[cur] || [], D3 = R.D3; c3 = (i + L.length) % L.length; const im = D3.querySelector('img'); im.src = IA(cur, c3); im.alt = name(cur) + ' 실내 · ' + L[c3]; D3.querySelector('.lb').textContent = name(cur) + ' 실내 · ' + L[c3] + ' (' + (c3 + 1) + ' / ' + L.length + ')'; D3.classList.add('on'); }

  window.hwPlanPop = { open, close };
})();
