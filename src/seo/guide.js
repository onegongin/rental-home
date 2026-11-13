// 검색용 안내 페이지 (시안 preview/seo-pages 확정 2026-11-05) — 화면 탭(평면 · 분양가 · 동호배치 · 입지)을 주소가 있는 가벼운 글자 페이지로
//   /plan · /plan/{84a|84b|…|79} · /price · /dongho · /location — site.json · prices.json · 공개 매물 사본으로 서버가 만든다 (자료가 바뀌면 바로 반영)
//   제목 40자 · 설명 80자 이내 (네이버 · 구글 권고), 대표 주소(canonical) · 구조화 데이터 · 사진 그림 설명(alt) · 상담 단추는 화면의 그 창으로 (/?reg=1 · /?visit=1)
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import PRICES from '../../public/daelasoo/data/prices.json' with { type: 'json' };
import { page, esc, crumbs, DEAL } from './pages.js';
import { priceText } from '../ads/templates.js';

const S = SITE.site || {}, O = SITE.office || {}, TY = SITE.types || {};
const NAME = S.name, ALIAS = S.alias;
export const TYPES = Object.keys(TY).sort((a, b) => (TY[a].kind === '오피스텔') - (TY[b].kind === '오피스텔') || parseFloat(a) - parseFloat(b) || a.localeCompare(b));
export const slugOf = t => String(t).toLowerCase();
const typeOfSlug = s => TYPES.find(t => slugOf(t) === s);
const won = v => { const e = Math.floor(v / 1e8), m = Math.round((v % 1e8) / 1e4); return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString() + '만' : '') + '원'; };
const kindOf = t => TY[t].kind === '오피스텔' ? '오피스텔' : TY[t].duplex ? '아파트 (펜트하우스)' : '아파트';
const blocks = t => Object.entries(TY[t].byBlock || {}).map(([b, v]) => ({ b, ex: v.exclusive, sup: v.supply, hh: v.households || 0, plan: v.plan }));
const hhOf = t => blocks(t).reduce((a, x) => a + x.hh, 0);
const exOf = t => (blocks(t)[0] || {}).ex;
const IMG = f => '/assets/' + S.code + '/' + f;   // 단지 사진 폴더 = assets/{site.code}
const planImg = t => IMG((blocks(t)[0] || {}).plan || TY[t].plan);
// 단지 이름(별칭) · 타입 목록 · 규모 글 — 단지마다 site.json 에서
const NAMEX = NAME + (ALIAS && ALIAS !== NAME ? '(' + ALIAS + ')' : '');
const TYLIST = TYPES.join(' · ');
const SCALE = '아파트 ' + (S.households || 0) + '세대' + (S.officetels ? ' · 오피스텔 ' + S.officetels + '실' : '');

// 분양가 범위 (입주자모집공고 기준) · 동별 타입 · 층 (동호배치 자료)
const PR = {};
(PRICES.rows || []).forEach(r => { const o = PR[r.type] = PR[r.type] || { min: Infinity, max: 0, n: 0 }; o.min = Math.min(o.min, r.total); o.max = Math.max(o.max, r.total); o.n += r.n || 0; });
const BLD = ((SITE.units || {}).buildings || []).map(b => {
  const ts = {};
  (b.lines || []).concat(b.wide || []).forEach(l => { const o = ts[l.type] = ts[l.type] || [99, 0]; o[0] = Math.min(o[0], l.from); o[1] = Math.max(o[1], l.to); });
  return { no: b.no, block: b.block, kind: b.kind || '', types: ts, bands: (b.bands || []).map(x => x.floor + '층 ' + x.label) };
});
const dongsOf = t => BLD.filter(b => b.types[t]).map(b => b.no + '동');
const floorText = (t, r) => (TY[t].duplex ? '펜트하우스 ' : '') + r[0] + '~' + r[1] + '층';
const moveIn = (Object.values(S.blocks || {})[0] || {}).moveIn || '';
// 분양가표 · 입지 페이지는 자료가 있을 때만 (대라수: 분양가 · 입지 보드 아직 없음)
const HAS_PRICE = Object.keys(PR).length > 0, HAS_LOC = !!((SITE.content || {}).siteMap || {}).board;
const GUIDES = ['/plan'].concat(HAS_PRICE ? ['/price'] : [], ['/dongho'], HAS_LOC ? ['/location'] : []);

const CSS2 = '.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}.fig{margin:0}.fig img{width:100%;display:block;border-radius:10px;background:#fafafa}.fig figcaption{font-size:12px;color:#6e6e73;margin-top:4px}' +
  '.tl{display:flex;gap:6px;flex-wrap:wrap}.tl a{white-space:nowrap;font-size:13px;font-weight:700;border:1px solid #d2d2d7;border-radius:9999px;padding:5px 13px;text-decoration:none;color:#1d1d1f;background:#fff}.tl a.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}' +
  '.cta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.cta b{margin-right:auto;font-size:14px}.b2{background:#0066cc;color:#fff}.b3{background:#1d1d1f;color:#fff}' +
  '.row{display:flex;gap:10px;align-items:center;text-decoration:none;color:#1d1d1f;padding:8px 0;border-bottom:1px solid #f2f2f5;font-size:14px}.row span{color:#6e6e73;font-size:13px}.row i{margin-left:auto;font-style:normal;color:#0066cc;font-size:13px;font-weight:700}' +
  '.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cards a{min-width:0;text-decoration:none;color:#1d1d1f;background:#fff;border:1px solid #ececf0;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:4px}.cards img{width:100%;aspect-ratio:1/1;object-fit:contain;background:#fafafa;border-radius:8px}.cards b{font-size:15px}.cards span{font-size:12px;color:#6e6e73}' +
  '@media(max-width:560px){.grid2{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}';
const cta = what => '<div class="card cta"><b>' + esc(what) + '</b><a class="btn b2" href="/?reg=1">관심등록하기</a><a class="btn p" href="/?visit=1">방문상담 예약</a><a class="btn b3" href="tel:' + esc(O.tel) + '">☎ ' + esc(O.tel) + '</a></div>';
const nav = cur => '<div class="tl" style="margin:0 0 12px">' + [['/plan', '평면'], ['/price', '분양가'], ['/dongho', '단지 개요'], ['/location', '입지'], ['/listings', '현재 매물']].filter(([p]) => p === '/listings' || GUIDES.includes(p)).map(([p, l]) => '<a href="' + p + '"' + (p === cur ? ' class="on"' : '') + '>' + l + '</a>').join('') + '</div>';
const typeTabs = cur => '<div class="tl">' + TYPES.map(t => '<a href="/plan/' + slugOf(t) + '"' + (t === cur ? ' class="on"' : '') + '>' + esc(t) + '</a>').join('') + '</div>';
const shell = (base, path, title, desc, body, json, img) => page({ base, path, title, desc, img, body: '<style>' + CSS2 + '</style>' + nav(path.startsWith('/plan') ? '/plan' : path) + body, json });
const apt = () => ({ '@type': 'ApartmentComplex', name: NAME, alternateName: ALIAS, address: { '@type': 'PostalAddress', addressCountry: 'KR', streetAddress: S.address }, numberOfAccommodationUnits: (S.households || 0) + (S.officetels || 0) });

// /plan — 타입 목록
export function planIndex(base) {
  const title = NAME + ' 평면 안내 (타입별)', desc = NAMEX + ' ' + TYLIST + ' 타입별 평면 · 면적 · 세대수';
  const body = '<nav class="bc"><a href="/">홈</a> › 평면</nav><h1>' + esc(NAME) + ' 평면 안내</h1><p class="sub">' + SCALE + ', ' + TYPES.length + '개 타입입니다. 타입을 누르면 평면도 · 면적 · 분양가 범위 · 지금 나와 있는 매물을 볼 수 있습니다.</p>' +
    '<div class="cards">' + TYPES.map(t => '<a href="/plan/' + slugOf(t) + '"><img src="' + IMG('plans/3d_' + esc(t) + '.png') + '" alt="' + esc(NAME + ' ' + t + '타입 3D 평면') + '" loading="lazy"><b>' + esc(t) + '</b><span>' + esc(kindOf(t) + ' · 전용 ' + exOf(t) + '㎡ · ' + hhOf(t) + '세대') + '</span></a>').join('') + '</div>' + cta('타입별 매매 · 전세 · 월세 상담');
  return shell(base, '/plan', title, desc, body, [{ '@context': 'https://schema.org', '@type': 'ItemList', name: title, itemListElement: TYPES.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: base + '/plan/' + slugOf(t), name: NAME + ' ' + t + '타입' })) }, crumbs(base, [['홈', '/'], ['평면', '/plan']])]);
}

// /plan/{타입}
export function planPage(base, slug, rows) {
  const t = typeOfSlug(slug); if (!t) return null;
  const T = TY[t], bl = blocks(t), pr = PR[t], ex = exOf(t), path = '/plan/' + slugOf(t);
  const title = NAME + ' ' + t + ' 평면 · 분양가', desc = NAMEX + ' ' + t + '타입 전용 ' + ex + '㎡ 방' + T.rooms + '·욕실' + T.baths + ', ' + hhOf(t) + '세대. 평면 · 분양가 · 매물';
  const mine = rows.filter(r => r.type === t);
  const tr = [['구분', kindOf(t)]].concat(bl.map(x => [x.b, '전용 ' + x.ex + '㎡ · 공급 ' + x.sup + '㎡ · ' + x.hh + '세대']),
    [['방 · 욕실', '방 ' + T.rooms + ' · 욕실 ' + T.baths], ['있는 동', dongsOf(t).join(' · ')], ['향', '라인 · 호실마다 다름 (매물에 표시)']], pr ? [['분양가', won(pr.min) + ' ~ ' + won(pr.max) + ' (층 · 동별, 발코니 확장 · 옵션 별도)']] : []);
  const body = '<nav class="bc"><a href="/">홈</a> › <a href="/plan">평면</a> › ' + esc(t) + '</nav><h1>' + esc(NAME + ' ' + t + '타입 평면') + '</h1>' +
    '<p class="sub">' + esc(NAMEX + ' ' + t + '타입은 ' + kindOf(t) + ' 전용 ' + ex + '㎡, 방 ' + T.rooms + '개 · 욕실 ' + T.baths + '개 구조로 ' + (bl.length > 1 ? bl.map(x => x.b).join(' · ') + '에 ' : '') + '모두 ' + hhOf(t) + '세대가 있습니다.' + (moveIn ? ' ' + moveIn + ' 입주입니다.' : '')) + '</p>' +
    '<div class="card grid2"><figure class="fig"><img src="' + esc(planImg(t)) + '" alt="' + esc(NAME + ' ' + t + '타입 평면도') + '"><figcaption>' + esc(t + '타입 평면도 (' + bl[0].b + ')') + '</figcaption></figure>' +
    '<table>' + tr.map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table></div>' +
    '<div class="card"><h2>지금 나와 있는 ' + esc(t) + ' 매물</h2>' + (mine.length ? mine.map(r => '<a class="row" href="/listings/' + esc(r.id) + '"><span class="deal ' + r.deal + '">' + DEAL[r.deal] + '</span><b>' + esc(String(r.label || '').replace(/\/\d+층$/, '') + ' ' + r.type) + '</b><span>' + esc(priceText(r).replace(/^\S+ /, '')) + '</span><i>자세히 ›</i></a>').join('')
      : '<p class="sub" style="margin:0">지금 공개 중인 매물이 없습니다 · <a href="/?reg=1">관심등록</a>하시면 나오는 대로 알려 드립니다</p>') + '</div>' +
    '<div class="card"><h2>다른 타입</h2>' + typeTabs(t) + '</div>' + cta(t + ' 매매 · 전세 · 월세 상담');
  const json = [{ '@context': 'https://schema.org', '@type': 'FloorPlan', name: NAME + ' ' + t + '타입', url: base + path, numberOfRooms: T.rooms, numberOfBathroomsTotal: T.baths, floorSize: { '@type': 'QuantitativeValue', value: ex, unitCode: 'MTK' }, layoutImage: base + planImg(t), isPlanForApartment: apt() },
    crumbs(base, [['홈', '/'], ['평면', '/plan'], [t, path]])];
  return shell(base, path, title, desc, body, json, planImg(t));
}

// /price — 타입별 분양가 범위
export function pricePage(base) {
  const title = NAME + ' 분양가표 (타입별)', desc = NAMEX + ' ' + TYLIST + ' 타입별 분양가 범위 · 세대수. 모집공고 기준';
  const body = '<nav class="bc"><a href="/">홈</a> › 분양가</nav><h1>' + esc(NAME) + ' 분양가표</h1><p class="sub">입주자모집공고 기준 타입별 공급금액 범위입니다. 층 · 동에 따라 다르며 발코니 확장비 · 유상옵션은 별도입니다.</p>' +
    '<div class="card"><table><tr><th>타입</th><td style="color:#6e6e73;font-weight:600">분양가 범위 · 세대수</td></tr>' + TYPES.filter(t => PR[t]).map(t => '<tr><th><a href="/plan/' + slugOf(t) + '">' + esc(t) + '</a> <span style="font-weight:500">' + esc(kindOf(t)) + '</span></th><td>' + esc(won(PR[t].min) + ' ~ ' + won(PR[t].max) + ' · ' + hhOf(t) + '세대') + '</td></tr>').join('') + '</table></div>' +
    '<div class="card"><h2>층별 · 호실별 분양가</h2><p class="sub" style="margin:0">호실마다 정확한 금액과 회차별 납부 일정은 <a href="/?tab=price">분양가표 화면</a>에서 동 · 호를 고르면 볼 수 있습니다.</p></div>' + cta('분양권 · 입주 후 매매 상담');
  return shell(base, '/price', title, desc, body, [crumbs(base, [['홈', '/'], ['분양가', '/price']])]);
}

// /dongho — 메인 '단지 개요' 칸 그대로 (단지배치도 · 동 · 호 배치도 · 동호개요 · 설명 타원 · 단지 조경), 누르는 기능 없이 그림 · 글만 (시안 seo-pages2 확정 2026-11-05)
const SP = SITE.siteplan || {}, DH = SP.dongho || {}, GD = SP.garden || {};
const SUMSEC = ((SITE.content || {}).sections || []).find(x => x.id === 'summary') || {};
const CSS3 = '.sec{background:#fff;border-radius:18px;padding:18px;margin-bottom:12px}.sec>h2{font-size:22px;font-weight:800;margin:0 0 12px}' +
  '.h3{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px}.h3 b{font-size:15px;font-weight:800}.h3 span{font-size:12px;color:#6e6e73}' +
  '.sum{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:18px;align-items:start}.sp img{width:100%;display:block;border-radius:12px;background:#1d1d1f}' +
  '.blk{font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:6px}.blk:before{content:"";width:7px;height:7px;border-radius:50%;background:#0066cc}' +
  '.dongs{display:flex;gap:6px;align-items:flex-end}.dongs img{width:100%;display:block;min-width:0}.sumtbl{width:100%;display:block;margin-top:4px}' +
  '.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pills span{flex:1 1 260px;text-align:center;background:#fbf3f1;border:1px solid #f2dcd6;border-radius:9999px;padding:9px 14px;font-size:13px;font-weight:700;color:#3a3a3c}' +
  '.garden{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}.garden figure{margin:0;position:relative}.garden img{width:100%;height:140px;object-fit:cover;display:block;border-radius:10px}.garden figcaption{position:absolute;right:8px;bottom:6px;color:#fff;font-size:11.5px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.6)}' +
  '.bhd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:12px}.bhd b{font-size:18px;font-weight:800}.bhd span{font-size:12.5px;color:#6e6e73}.bhd em{margin-left:auto;font-style:normal;font-size:13.5px;font-weight:800}.bhd em i{font-style:normal;color:#c8381e}' +
  '.pics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.pics figure{margin:0;position:relative;background:#fff;border:1px solid #ececf0;border-radius:12px;overflow:hidden}.pics img{width:100%;height:170px;object-fit:cover;display:block}' +
  '.pics .ai{position:absolute;right:8px;top:146px;font-size:10.5px;color:#e5e5ea;text-shadow:0 1px 2px rgba(0,0,0,.6)}.pics figcaption{padding:8px 10px;font-size:13px;font-weight:800}.pics figcaption span{display:block;font-size:11.5px;font-weight:700;color:#c8381e}' +
  '.bcards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cd{background:#fff;border:1px solid #ececf0;border-radius:14px;padding:16px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:12px}' +
  '.cd .ic{width:44px;height:44px;border-radius:50%;background:#fbf3f1;display:flex;align-items:center;justify-content:center;font-size:20px}.cd h3{margin:0 0 6px;font-size:16px;font-weight:800;line-height:1.4}.cd h3 i{font-style:normal;color:#c8381e}.cd ul{margin:0;padding-left:16px;font-size:13px;line-height:1.65;color:#3a3a3c}.cd li b{color:#1d1d1f}' +
  '@media(max-width:760px){.sum{grid-template-columns:1fr}.pics{grid-template-columns:1fr}.bcards{grid-template-columns:1fr}.garden{grid-template-columns:1fr 1fr}.garden figure:first-child{grid-column:1/-1}.bhd em{margin-left:0}}';
const dongRow = (i, label) => { const row = (DH.blocks || [])[i] || []; return '<div class="blk">' + esc(label) + '</div><div class="dongs">' + row.map(([n, w, h]) => '<img src="' + IMG('dongho/' + n + '.jpg') + '" alt="' + esc(NAME + ' ' + n + '동 동호배치도') + '" style="flex:' + w + ' 1 0;aspect-ratio:' + w + '/' + h + '" loading="lazy">').join('') + '</div>'; };
const grpLabel = i => { const g = (S.groups || [])[i] || {}; return (g.label || (i + 1) + '단지') + ' · ' + (g.dongs || []).join(' · ') + '동'; };
export function donghoPage(base) {
  const title = NAME + ' 단지 개요 · 동호배치도', desc = NAMEX + ' ' + ((S.groups || []).length > 1 ? (S.groups || []).length + '개 단지 ' : '') + BLD.length + '개동 ' + SCALE + ' 단지배치도 · 동호배치도';
  const pts = SUMSEC.points || [], pills = (SUMSEC.pills || []).map(i => pts[i]).filter(Boolean);
  const body = '<style>' + CSS3 + '</style><nav class="bc"><a href="/">홈</a> › 단지 개요</nav><h1>' + esc(NAME) + ' 단지 개요</h1><p class="sub">' + esc([pts[0], pts[1], pts[5]].filter(Boolean).join(' · ')) + '</p>' +
    '<div class="sec"><h2>단지 개요</h2><div class="sum"><div class="sp"><div class="h3"><b>단지배치</b><span>' + esc((S.groups || []).map(g => g.label).join(' · ')) + '</span></div><img src="' + IMG(SUMSEC.image || S.sitePlan || 'siteplan.jpg') + '" alt="' + esc(NAME + ' 단지배치도') + '"></div>' +
    '<div><div class="h3"><b>동 · 호 배치도</b><span>호실은 동호배치표 화면에서</span></div>' + dongRow(0, grpLabel(0)) +
    (DH.sum ? '<div class="h3" style="margin:12px 0 0"><b>동호개요</b><span>' + esc('총 ' + ((S.households || 0) + (S.officetels || 0)) + '세대 · ' + SCALE) + '</span></div><img class="sumtbl" src="' + IMG(DH.sum[0]) + '" alt="' + esc(NAME + ' 동호개요 (타입별 세대수)') + '" loading="lazy">' : '') + '</div></div>' +
    ((DH.blocks || []).length > 1 ? '<div class="h3" style="margin-top:16px"><b>동 · 호 배치도 (' + esc(((S.groups || [])[1] || {}).label || '2단지') + ')</b></div><div style="max-width:560px">' + dongRow(1, grpLabel(1)) + '</div>' : '') +
    (pills.length ? '<div class="pills">' + pills.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
    ((GD.photos || []).length ? '<div class="h3" style="margin-top:16px"><b>' + esc(GD.title || '단지 조경') + '</b><span>' + esc(GD.photos.map(x => x[1]).join(' · ')) + '</span></div><div class="garden">' + GD.photos.map(([f, n]) => '<figure><img src="' + IMG(f) + '" alt="' + esc(NAME + ' ' + n) + '" loading="lazy"><figcaption>' + esc(n) + '</figcaption></figure>').join('') + '</div>' : '') + '</div>' +
    '<div class="card cta"><b>호실 · 층 · 향까지 보려면</b><a class="btn b3" href="/?tab=board">동호배치표 화면 →</a><a class="btn b2" href="/?reg=1">관심등록하기</a><a class="btn p" href="tel:' + esc(O.tel) + '">☎ ' + esc(O.tel) + '</a></div>';
  return shell(base, '/dongho', title, desc, body, [Object.assign({ '@context': 'https://schema.org' }, apt()), crumbs(base, [['홈', '/'], ['단지 개요', '/dongho']])], IMG(SUMSEC.image || 'siteplan.jpg'));
}

// /location — 메인 '입지환경' 보드 그대로 (사진 3장 · 설명 카드 4개)
const ICON = { car: '🚇', cart: '🛒', school: '🎓', park: '🌳' };
export function locationPage(base) {
  const M = (SITE.content || {}).siteMap || {}, B = M.board || {};
  const title = NAME + ' 입지환경 · 교통 · 생활권', desc = NAMEX + ' ' + ((SITE.seo || {}).locationDesc || '');
  const tag = B.tag || [];
  const body = '<style>' + CSS3 + '</style><nav class="bc"><a href="/">홈</a> › 입지</nav><h1>' + esc(NAME) + ' 입지환경</h1><p class="sub">' + esc(S.address + ' · ' + (M.sub || '')) + '</p>' +
    '<div class="sec"><div class="bhd"><b>' + esc(B.title || '입지환경') + '</b><span>' + esc(B.sub || '') + '</span>' + (tag.length ? '<em>' + esc(tag[0] || '') + '<i>' + esc(tag[1] || '') + '</i>' + esc(tag[2] || '') + '</em>' : '') + '</div>' +
    '<div class="pics">' + (B.pics || []).map(p => '<figure><img src="' + IMG(p.img) + '" alt="' + esc(p.alt || '') + '" loading="lazy">' + (p.note ? '<span class="ai">' + esc(p.note) + '</span>' : '') + '<figcaption>' + esc(p.cap || String(p.alt || '').replace(/\s*\(.*\)$/, '')) + (p.capSub ? '<span>' + esc(p.capSub) + '</span>' : '') + '</figcaption></figure>').join('') + '</div>' +
    '<div class="bcards">' + (B.cards || []).map(c => '<div class="cd"><div class="ic">' + (ICON[c.icon] || '•') + '</div><div><h3>' + esc((c.head || [])[0] || '') + '<i>' + esc((c.head || [])[1] || '') + '</i></h3><ul>' + (c.items || []).map(([b, t]) => '<li>' + (b ? '<b>' + esc(b) + '</b>' : '') + esc(t || '') + '</li>').join('') + '</ul></div></div>').join('') + '</div></div>' +
    cta('입지 · 생활권 상담');
  return shell(base, '/location', title, desc, body, [Object.assign({ '@context': 'https://schema.org' }, apt()), crumbs(base, [['홈', '/'], ['입지', '/location']])], IMG(((B.pics || [])[1] || {}).img || 'location.jpg'));
}

// 주소 판별 · 사이트맵에 넣을 주소
export const isGuidePath = p => GUIDES.includes(p) || /^\/plan\/[0-9a-z]+$/.test(p);
export const guideUrls = () => GUIDES.concat(TYPES.map(t => '/plan/' + slugOf(t)));
