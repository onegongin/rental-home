// 고정 화면 파일에 단지 이름 · 주소 · 검색 문구를 site.json 으로 다시 써 넣는다 (S0, 2026-11-05)
//   검색 로봇이 읽는 글자라 화면이 그리는 대신 파일에 직접 들어가야 하는 곳:
//     public/daelasoo/index.html 머리말(제목 · 설명 · og · 구조화 데이터) · 아래 정보 칸(단지 · FAQ · 안내 링크 · 사무소)
//     public/daelasoo/staff/index.html 제목 · public/daelasoo/maps/location.html 제목 · 카카오 지도 · public/robots.txt 사이트맵 주소
//   값: public/daelasoo/data/site.json (site · office · seo) · 사이트 주소는 wrangler.jsonc SITE_URL
//   실행: node tools/apply_site.mjs          → 바뀐 파일만 다시 씀
//         node tools/apply_site.mjs --check  → 다시 쓸 게 있으면 목록만 보이고 실패 (tests/site-files.test.js)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const J = v => JSON.stringify(v ?? '').replace(/</g, '\\u003c');
const tel = v => String(v || '').replace(/\D/g, '');

// 표시 칸: <!-- site:이름 --> … <!-- /site:이름 --> 사이를 통째로 바꿈
function region(html, name, body, file) {
  const a = '<!-- site:' + name + ' -->\n', b = '<!-- /site:' + name + ' -->';
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < i) throw new Error(file + ': ' + a.trim() + ' 표시가 없음');
  return html.slice(0, i + a.length) + body + html.slice(j);
}
function swap(html, re, to, file) {
  if (!re.test(html)) throw new Error(file + ': ' + re + ' 를 찾지 못함');
  return html.replace(re, to);
}

function head(D, U) {
  const S = D.site, O = D.office, E = D.seo, V = E.verify || {}, L = E.ld || {};
  return [
    '<title>' + esc(E.title) + '</title>',
    '<meta name="description" content="' + esc(E.description) + '">',
    '<meta name="keywords" content="' + esc(E.keywords) + '">',
    '<meta name="robots" content="index,follow">',
    V.naver ? '<meta name="naver-site-verification" content="' + esc(V.naver) + '" />' : null,
    V.google ? '<meta name="google-site-verification" content="' + esc(V.google) + '" />' : null,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta property="og:site_name" content="' + esc(S.name) + '">',
    '<meta property="og:title" content="' + esc(E.title) + '">',
    '<meta property="og:description" content="' + esc(E.description) + '">',
    '<link rel="canonical" href="' + esc(U) + '/">',
    '<meta property="og:url" content="' + esc(U) + '/">',
    '<meta property="og:image" content="' + esc(U + '/' + E.ogImage) + '">',
    '<meta property="og:image:alt" content="' + esc(E.ogAlt) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="alternate" type="application/rss+xml" title="' + esc(S.name) + ' 매물" href="' + esc(U) + '/rss.xml">',
    '<script type="application/ld+json">',
    '{',
    '  "@context": "https://schema.org",',
    '  "@graph": [',
    '    {"@type": ' + J(L.type) + ', "name": ' + J(S.name) + ',',
    '     "alternateName": [' + (L.alternateName || []).map(J).join(', ') + '],',
    '     "address": {"@type": "PostalAddress", "addressCountry": "KR", "addressRegion": ' + J(L.region) + ', "addressLocality": ' + J(L.locality) + ', "streetAddress": ' + J(L.street) + '},',
    '     "numberOfAccommodationUnits": ' + ((S.households || 0) + (S.officetels || 0)) + ',',
    '     "description": ' + J(L.description) + '},',
    '    {"@type": "RealEstateAgent", "name": ' + J(O.name) + ', "telephone": ' + J(O.tel) + ',',
    '     "address": {"@type": "PostalAddress", "addressCountry": "KR", "streetAddress": ' + J(O.address) + '},',
    '     "sameAs": [' + [O.blog, O.place].filter(Boolean).map(J).join(', ') + ']}',
    '  ]',
    '}',
    '</script>'
  ].filter(x => x !== null).join('\n') + '\n';
}

function info(D) {
  const S = D.site, O = D.office, I = (D.seo || {}).info || {}, sc = I.scale || [];
  const faq = (I.faq || []).map(([q, a]) => '        <div><dt style="display:inline;font-weight:700">Q. ' + esc(q) + '</dt> <dd style="display:inline;margin:0">' + esc(a) + '</dd></div>');
  const links = (I.links || []).map(([h, t]) => '<a href="' + esc(h) + '">' + esc(t) + '</a>').join('');
  return [
    '    <section style="flex:1 1 auto;min-width:0">',
    '      <h1 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#1d1d1f">' + esc(S.name) + (I.nameSub ? ' <span style="font-size:13px;font-weight:600;color:#6e6e73">' + esc(I.nameSub) + '</span>' : '') + '</h1>',
    '      <p class="si-line" style="margin:0">' + esc(I.addr) + '</p>',
    '      <p class="si-line" style="margin:0;font-weight:700;color:#c8381e">' + esc(I.deals) + '</p>',
    '      <p class="si-line" style="margin:0"><span class="pc">' + esc(sc[0]) + '</span><span class="mo">' + esc(sc[1] || sc[0]) + '</span></p>',
    '      <p class="si-line" style="margin:6px 0 0">상담문의 <a href="tel:' + tel(O.tel) + '">' + esc(O.tel) + '</a></p>',
    '    </section>',
    '    <section style="flex:0 1 auto;margin-left:auto;min-width:0">',
    '      <h2 style="margin:0 0 6px;font-size:14px;font-weight:800;color:#1d1d1f">자주 묻는 질문</h2>',
    '      <dl class="si-faq" style="margin:0;display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,auto);gap:4px 28px;justify-content:start">',
    ...faq,
    '      </dl>',
    '    </section>',
    '    <!-- 안내 페이지 링크 한 줄 (시안 preview/home-links A안, 2026-11-05) — 손님 이동 + 검색 로봇이 안내 페이지를 따라 들어오게 -->',
    '    <nav class="hwln" aria-label="단지 안내" style="flex:1 1 100%;font-size:12.5px;line-height:1.9">',
    '      <style>.hwln b{color:#1d1d1f;margin-right:8px}.hwln a+a::before{content:"·";color:#c7c7cc;margin:0 7px;display:inline-block}</style>',
    '      <b>단지 안내</b>' + links,
    '    </nav>',
    '    <section style="flex:1 1 100%;border-top:1px solid #ececf0;padding-top:12px;font-size:12px;color:#6e6e73">',
    '      <!-- 사무소 정보 한 줄 (시안 preview/footer-office B안): 항목이 중간에 끊기지 않게, 휴대폰은 회사 정보 / 주소 · 연락처 2줄 -->',
    '      <style>.hwof{display:flex;flex-wrap:wrap;gap:0 6px;line-height:1.7}.hwof>span{white-space:nowrap}.hwof>.d::before{content:"·";margin-right:6px}.hwof>i{display:none}@media (max-width:760px){.hwof>i{display:block;flex-basis:100%;height:0}.hwof>i+.d::before{content:none}}.si-line .mo,.hwof b.mo{display:none}.hwof b{font-weight:inherit}@media (max-width:560px){html:root .hwof{font-size:min(12px,3vw);gap:0 4px}html:root .hwof>.d::before{margin-right:4px}html:root .hwof>i.m{display:block;flex-basis:100%;height:0}html:root .hwof>i.m+.d::before{content:none}html:root .si-line .pc,html:root .hwof b.pc{display:none}html:root .si-line .mo,html:root .hwof b.mo{display:inline}}</style>',
    '      <div class="hwof"><span><strong style="color:#3a3a3c">' + esc(O.name) + '</strong></span>' +
      '<span class="d"><b class="pc">대표자</b><b class="mo">대표</b> ' + esc(O.ceo) + '</span>' +
      '<span class="d"><b class="pc">등록번호</b><b class="mo">등록</b> ' + esc(O.regNo) + '</span><i></i>' +
      '<span class="d">' + esc(O.address) + '</span><i class="m"></i>' +
      '<span class="d">대표전화 <a href="tel:' + tel(O.tel) + '">' + esc(O.tel) + '</a></span>' +
      (O.mobile ? '<span class="d"><a href="tel:' + tel(O.mobile) + '">' + esc(O.mobile) + '</a></span>' : '') + '<i class="m"></i>' +
      (O.blog ? '<span class="d"><a href="' + esc(O.blog) + '" target="_blank" rel="noopener">네이버블로그</a></span>' : '') +
      (O.place ? '<span class="d"><a href="' + esc(O.place) + '" target="_blank" rel="noopener">네이버 플레이스</a></span>' : '') + '</div>',
    '    </section>'
  ].join('\n') + '\n';
}

// { 파일: 새 내용 } — 지금 내용과 같으면 다시 쓰지 않음
export function build(root = ROOT) {
  const rd = f => readFileSync(join(root, f), 'utf8');
  const D = JSON.parse(rd('public/daelasoo/data/site.json'));
  const m = rd('wrangler.jsonc').match(/"SITE_URL"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('wrangler.jsonc 에 SITE_URL 이 없음');
  const U = m[1].replace(/\/$/, ''), S = D.site, MAP = (D.seo || {}).map || {};
  const out = {};
  let f = 'public/daelasoo/index.html', h = rd(f);
  h = region(h, 'head', head(D, U), f);
  out[f] = region(h, 'info', info(D), f);
  f = 'public/daelasoo/staff/index.html';
  out[f] = swap(rd(f), /<title>[^<]*<\/title>/, () => '<title>' + esc(S.name) + ' · 직원 대시보드</title>', f);
  f = 'public/daelasoo/maps/location.html'; h = rd(f);
  h = swap(h, /<title>[^<]*<\/title>/, () => '<title>' + esc(S.name) + ' 위치</title>', f);
  h = swap(h, /daumRoughmapContainer\d*/, () => 'daumRoughmapContainer' + (MAP.timestamp || ''), f);
  h = swap(h, /"timestamp" : "[^"]*"/, () => '"timestamp" : ' + J(MAP.timestamp), f);
  out[f] = swap(h, /"key" : "[^"]*"/, () => '"key" : ' + J(MAP.key), f);
  f = 'public/robots.txt';
  out[f] = swap(rd(f), /^Sitemap: .*$/m, () => 'Sitemap: ' + U + '/sitemap.xml', f);
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => v !== rd(k)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ch = build(), files = Object.keys(ch);
  if (process.argv.includes('--check')) {
    console.log(files.length ? 'site.json 과 다른 파일: ' + files.join(', ') : '모두 site.json 과 같음');
    process.exit(files.length ? 1 : 0);
  }
  files.forEach(k => writeFileSync(join(ROOT, k), ch[k]));
  console.log(files.length ? '다시 씀: ' + files.join(', ') : '바뀐 것 없음');
}
