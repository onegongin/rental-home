// 검색 노출 자동화 (설계서 11.2 L1 · 「검색·광고_최적화」 2장, P6) — 검색로봇이 읽는 가벼운 HTML · 사이트맵 · RSS
//   화면(대시보드)은 자바스크립트로 그려져 검색로봇이 매물을 못 읽음 → 같은 공개 사본(public_listings)으로 서버가 직접 만든다
//   /listings · /listings/{sale|jeonse|wolse|short} 목록(ItemList)  · /listings/{id} 매물 1건(RealEstateListing)
//   공개 사본에 없는 매물 번호 = 끝났거나 내린 매물 → 410(영구 삭제). 호수 · 사람 정보는 공개 사본에 원래 없음
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { priceText, mgmtText } from '../ads/templates.js';

const S = SITE.site || {}, O = SITE.office || {};
export const DEAL = { sale: '매매', jeonse: '전세', wolse: '월세', short: '단기임대' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ld = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const ymd = t => new Date((t || Date.now()) + 9 * 3600e3).toISOString().slice(0, 10);
const where = r => String(r.label || '').replace(/\/\d+층$/, '');
const top = r => (String(r.label || '').match(/\/(\d+)층/) || [])[1] || '';
export const titleOf = r => S.name + ' ' + where(r) + ' ' + r.type + ' ' + DEAL[r.deal] + ' ' + priceText(r).replace(/^\S+ /, '');
export const urlOf = (base, r) => base + '/listings/' + r.id;
const planOf = r => { const t = (SITE.types || {})[r.type] || {}, b = (t.byBlock || {})[r.block] || {}; return '/assets/hwip/' + (b.plan || t.plan || 'hero1.jpg'); };
const descOf = r => [where(r) + ' ' + r.type + '타입', priceText(r), '전용 ' + r.exclusive + '㎡', '방 ' + r.rooms + ' · 욕실 ' + r.baths, r.facing + '향', '입주 ' + r.move].join(' · ') + '. ' + O.name + ' ' + (r.tel || O.tel);

const CSS = `*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:'Pretendard Variable',Pretendard,-apple-system,'Apple SD Gothic Neo',sans-serif;line-height:1.6}
a{color:#0066cc}.w{max-width:880px;margin:0 auto;padding:16px 16px 40px}.top{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:6px 0 14px;font-size:13px}.top b{font-size:15px;font-weight:800}.top a{margin-left:auto}
nav.bc{font-size:12px;color:#6e6e73;margin-bottom:8px}nav.bc a{color:#6e6e73;text-decoration:none}h1{font-size:22px;font-weight:800;margin:0 0 6px;line-height:1.35}
.sub{color:#6e6e73;font-size:13.5px;margin:0 0 14px}.card{background:#fff;border:1px solid #ececf0;border-radius:14px;padding:16px 18px;margin-bottom:12px}
.deal{display:inline-block;font-size:12px;font-weight:800;color:#fff;border-radius:9999px;padding:2px 10px;margin-right:6px;vertical-align:2px}.sale{background:#8e2c6e}.jeonse{background:#3a5aa0}.wolse{background:#b25000}.short{background:#c77700}
.badge{font-size:12px;font-weight:800;color:#b25000;background:#fff4e5;border-radius:9999px;padding:2px 9px;margin-left:6px}
.price{font-size:24px;font-weight:800;margin:4px 0 2px}.pic{width:100%;max-height:420px;object-fit:contain;background:#fafafa;border-radius:12px;display:block}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;width:120px;color:#6e6e73;font-weight:600;padding:8px 0;border-bottom:1px solid #f2f2f5;vertical-align:top}td{padding:8px 0;border-bottom:1px solid #f2f2f5}
.go{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{display:inline-flex;align-items:center;height:42px;padding:0 18px;border-radius:9999px;font-weight:800;font-size:14px;text-decoration:none}.p{background:#c8381e;color:#fff}.s{background:#f2f2f5;color:#1d1d1f}
h2{font-size:16px;font-weight:800;margin:0 0 8px}ul{margin:0;padding-left:18px;font-size:14px}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.li{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:#1d1d1f}.li img{width:100%;aspect-ratio:4/3;object-fit:contain;background:#fafafa;border-radius:10px}.li b{font-size:15px}.li span{font-size:13px;color:#6e6e73}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.tabs a{font-size:13px;font-weight:700;border:1px solid #d2d2d7;border-radius:9999px;padding:5px 13px;text-decoration:none;color:#1d1d1f;background:#fff}.tabs a.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}
footer{font-size:12px;color:#6e6e73;line-height:1.8;border-top:1px solid #e5e5ea;margin-top:18px;padding-top:12px}.upd{font-size:12px;color:#8e8e93}
@media(max-width:560px){h1{font-size:19px}.price{font-size:21px}.list{grid-template-columns:1fr}th{width:96px}.card{padding:14px}}`;

export function page({ base, path, title, desc, img, body, json }) {
  const url = base + path;
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '"><link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="' + esc(S.name) + '">' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:url" content="' + esc(url) + '"><meta property="og:image" content="' + esc(base + (img || '/assets/hwip/hero1.jpg')) + '">' +
    '<link rel="alternate" type="application/rss+xml" title="' + esc(S.name) + ' 매물" href="' + base + '/rss.xml">' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><style>' + CSS + '</style>' +
    (json || []).map(ld).join('') + '</head><body><div class="w">' +
    '<div class="top"><b>' + esc(S.name) + '</b><span style="color:#8e8e93">' + esc(S.alias) + '</span><a href="/">단지 안내 · 동호배치표 →</a></div>' +
    body + footer() + '</div></body></html>';
}
// 사무소 필수 표시 (부록 A ①) — 모든 페이지 아래
const footer = () => '<footer><b>' + esc(O.name) + '</b> · 대표 공인중개사 ' + esc(O.ceo) + ' · 중개사무소 등록번호 ' + esc(O.regNo) + '<br>' + esc(O.address) + ' · 대표번호 <a href="tel:' + esc(O.tel) + '">' + esc(O.tel) + '</a>' + (O.blog ? ' · <a href="' + esc(O.blog) + '">블로그</a>' : '') + '</footer>';
export const crumbs = (base, list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + path })) });

// 옵션 한 줄 (공개 사본 opts = { exp, items }) — '확장 + 시스템에어컨 · 빌트인 냉장고'
export function optLine(r) {
  let o = null; try { o = r.opts ? JSON.parse(r.opts) : null; } catch (e) { o = null; }
  if (!o) return '';
  if (!o.exp) return '기본 (확장 없음)';
  return '발코니 확장' + (o.items && o.items.length ? ' + ' + o.items.join(' · ') : '');
}

// 매물 1건
export function listingPage(base, r) {
  const title = titleOf(r), desc = descOf(r), img = planOf(r);
  const rows = [
    ['소재지', S.address + ' · ' + S.name + ' ' + where(r)], ['종류 · 거래', (r.kind || '공동주택') + ' · ' + DEAL[r.deal]], ['가격', priceText(r)],
    ['면적', '전용 ' + r.exclusive + '㎡' + (r.supply ? ' · 공급 ' + r.supply + '㎡' : '') + ' (' + r.type + '타입)'], ['층', r.band + ' / 총 ' + top(r) + '층'],
    ['방향', r.facing + '향 (' + r.basis + ' 기준)'], ['방 · 욕실', r.rooms + '개 · ' + r.baths + '개'], ['입주 가능일', r.move], ['관리비', mgmtText(r)],
    ['사용승인일', r.approval], ['주차', r.parking]
  ].concat(optLine(r) ? [['옵션', optLine(r)]] : [], r.memo ? [['기타', r.memo]] : [], [['연락', (r.contact || O.name) + ' · ' + (r.tel || O.tel)]]);
  const body = '<nav class="bc"><a href="/">홈</a> › <a href="/listings">매물</a> › <a href="/listings/' + r.deal + '">' + DEAL[r.deal] + '</a></nav>' +
    '<h1><span class="deal ' + r.deal + '">' + DEAL[r.deal] + '</span>' + esc(S.name + ' ' + where(r) + ' ' + r.type) + (r.badge ? '<span class="badge">' + esc(r.badge) + '</span>' : '') + '</h1>' +
    '<p class="sub">' + esc(S.address) + ' · 갱신 ' + ymd(r.updated) + '</p>' +
    '<div class="card"><div class="price">' + esc(priceText(r)) + '</div><img class="pic" src="' + esc(img) + '" alt="' + esc(S.name + ' ' + r.type + '타입 평면도') + '" loading="lazy">' +
    '<div class="go"><a class="btn p" href="tel:' + esc(r.tel || O.tel) + '">전화 ' + esc(r.tel || O.tel) + '</a><a class="btn s" href="/?tab=list">사이트에서 중개요청 · 다른 매물</a></div></div>' +
    '<div class="card"><h2>중개대상물 표시</h2><table>' + rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table></div>' +
    '<div class="card"><h2>단지 안내</h2><ul><li>' + esc(S.name + ' (구 ' + S.alias + ') · 아파트 ' + S.households + '세대 + 오피스텔 ' + S.officetels + '실') + '</li><li>' + esc('입주 ' + ((S.blocks || {})['1단지'] || {}).moveIn + ' (1 · 2단지 동일)') + '</li><li><a href="/?type=' + esc(encodeURIComponent(r.type)) + '">' + esc(r.type) + '타입 평면 · 실내 사진 보기</a></li></ul></div>';
  const offer = { '@type': 'Offer', price: (r.deal === 'sale' ? r.ask : r.dep) * 10000, priceCurrency: 'KRW', availability: 'https://schema.org/InStock', seller: { '@type': 'RealEstateAgent', name: O.name, telephone: O.tel } };
  const json = [{ '@context': 'https://schema.org', '@type': 'RealEstateListing', name: title, url: urlOf(base, r), description: desc, datePosted: ymd(r.at), image: base + img, offers: offer,
    about: { '@type': r.kind === '오피스텔' ? 'Accommodation' : 'Apartment', floorSize: { '@type': 'QuantitativeValue', value: r.exclusive, unitCode: 'MTK' }, numberOfRooms: r.rooms, numberOfBathroomsTotal: r.baths, address: { '@type': 'PostalAddress', addressCountry: 'KR', streetAddress: S.address } } },
    crumbs(base, [['홈', '/'], ['매물', '/listings'], [DEAL[r.deal], '/listings/' + r.deal], [where(r) + ' ' + r.type, '/listings/' + r.id]])];
  return page({ base, path: '/listings/' + r.id, title: title + ' | ' + O.name, desc, img, body, json });
}

// 목록 (전체 또는 거래별) — 파워링크 착륙 페이지 겸 캐러셀(ItemList)
export function listPage(base, rows, deal) {
  const name = S.name + ' ' + (deal ? DEAL[deal] : '매매 · 전세 · 월세') + ' 매물';
  const desc = S.name + '(' + S.alias + ') 현재 공개 매물 ' + rows.length + '건. 동 · 층구간 · 타입 · 가격 · 입주 가능일. ' + O.name + ' ' + O.tel;
  const tabs = '<div class="tabs">' + [['', '전체']].concat(Object.entries(DEAL)).map(([k, v]) => '<a href="/listings' + (k ? '/' + k : '') + '"' + (k === (deal || '') ? ' class="on"' : '') + '>' + v + '</a>').join('') + '</div>';
  const cards = rows.length ? '<div class="list">' + rows.map(r => '<a class="li card" href="/listings/' + r.id + '"><img src="' + esc(planOf(r)) + '" alt="' + esc(r.type + '타입 평면도') + '" loading="lazy"><b><span class="deal ' + r.deal + '">' + DEAL[r.deal] + '</span>' + esc(priceText(r).replace(/^\S+ /, '')) + '</b><span>' + esc(where(r) + ' · ' + r.type + ' · 전용 ' + r.exclusive + '㎡ · ' + r.facing + '향 · 입주 ' + r.move) + '</span></a>').join('') + '</div>'
    : '<div class="card">지금 공개 중인 ' + (deal ? DEAL[deal] + ' ' : '') + '매물이 없습니다. <a href="/?visit=1">관심등록</a>하시면 새 매물이 나올 때 연락드립니다.</div>';
  const body = '<nav class="bc"><a href="/">홈</a> › 매물' + (deal ? ' › ' + DEAL[deal] : '') + '</nav><h1>' + esc(name) + '</h1><p class="sub">공개 중 ' + rows.length + '건 · 거래가 끝난 매물은 바로 내려갑니다 · 갱신 ' + ymd(rows.reduce((m, r) => Math.max(m, r.updated || 0), 0) || Date.now()) + '</p>' + tabs + cards;
  const json = [{ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: rows.slice(0, 50).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: urlOf(base, r), name: titleOf(r), image: base + planOf(r) })) },
    crumbs(base, [['홈', '/'], ['매물', '/listings']].concat(deal ? [[DEAL[deal], '/listings/' + deal]] : []))];
  return page({ base, path: '/listings' + (deal ? '/' + deal : ''), title: name + ' | ' + O.name, desc, body, json });
}

// 끝났거나 없는 매물 → 410 (검색엔진이 목록에서 빼도록)
export const gonePage = base => page({ base, path: '/listings', title: '거래가 끝난 매물입니다 | ' + S.name, desc: '이 매물은 거래가 끝났거나 공개가 종료되었습니다.',
  body: '<h1>거래가 끝난 매물입니다</h1><p class="sub">계약 · 보류 등으로 공개가 끝난 매물입니다.</p><div class="card"><a class="btn p" href="/listings">현재 공개 매물 보기</a></div>' });

const iso = t => new Date(t || Date.now()).toISOString();
const xesc = s => esc(s).replace(/&#39;/g, '&apos;');
export function sitemap(base, rows, extra = []) {
  const last = rows.reduce((m, r) => Math.max(m, r.updated || 0), 0) || Date.now();
  const u = (loc, mod, freq, pri) => '<url><loc>' + xesc(loc) + '</loc><lastmod>' + iso(mod).slice(0, 10) + '</lastmod><changefreq>' + freq + '</changefreq><priority>' + pri + '</priority></url>';
  const deals = [...new Set(rows.map(r => r.deal))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [u(base + '/', last, 'weekly', '1.0'), u(base + '/listings', last, 'daily', '0.9'), ...extra.map(p => u(base + p, last, 'weekly', p.startsWith('/plan/') ? '0.7' : '0.8')), ...deals.map(d => u(base + '/listings/' + d, last, 'daily', '0.8')), ...rows.map(r => u(urlOf(base, r), r.updated, 'weekly', '0.7'))].join('\n') + '\n</urlset>\n';
}
const rfc = t => new Date(t || Date.now()).toUTCString().replace('GMT', '+0000');
export function rss(base, rows) {
  const items = rows.slice(0, 50).map(r => '<item><title>' + xesc(titleOf(r)) + '</title><link>' + xesc(urlOf(base, r)) + '</link><guid isPermaLink="true">' + xesc(urlOf(base, r)) + '</guid><description>' + xesc(descOf(r)) + '</description><pubDate>' + rfc(r.at) + '</pubDate></item>');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>' + xesc(S.name + ' 매물 · 소식') + '</title><link>' + xesc(base + '/') + '</link>' +
    '<description>' + xesc(S.name + '(구 ' + S.alias + ') ' + S.address + ' · 아파트 ' + S.households + '세대 · 오피스텔 ' + S.officetels + '실. 매매 · 전세 · 월세 공개 매물. ' + O.name + ' ' + O.tel) + '</description><language>ko</language>' +
    '<lastBuildDate>' + rfc(rows.reduce((m, r) => Math.max(m, r.updated || 0), 0) || Date.now()) + '</lastBuildDate><atom:link href="' + xesc(base + '/rss.xml') + '" rel="self" type="application/rss+xml"/>' +
    '<item><title>' + xesc(S.name + ' 단지 안내 · 평면 · 동호배치표 · 방문상담') + '</title><link>' + xesc(base + '/') + '</link><guid isPermaLink="false">' + xesc((S.slug || S.code) + '-site') + '</guid><description>' + xesc(S.address + ' · ' + ((S.blocks || {})['1단지'] || {}).moveIn + ' 입주. 상담 ' + O.tel) + '</description></item>' +
    items.join('') + '</channel></rss>\n';
}
