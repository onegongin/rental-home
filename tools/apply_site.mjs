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
    '<meta property="og:title" content="' + esc(E.ogTitle || E.title) + '">',   // 링크 미리보기 제목 · 설명 = seo.ogTitle · ogDesc (없으면 title · description)
    '<meta property="og:description" content="' + esc(E.ogDesc || E.description) + '">',
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
  // 헷지했지 질문 (content.hedge.faq, 시안 r30-footer-faq A안 확정 2026-11-16) — 답이 길어 질문만 보이고 누르면 답. [글, 1] = 진하게
  const HQ = ((D.content || {}).hedge || {}).faq || [], seg = a => [].concat(a).map(x => Array.isArray(x) ? '<b>' + esc(x[0]) + '</b>' : esc(x)).join('');
  // 질문 한 줄(Q ｜ Q ｜ Q) · 누르면 바로 아래 답, 답 칸이 누른 질문 아래를 가리킴 · 휴대폰은 세로 + 질문 밑 (시안 r32-hedge-row 확정 2026-11-16). 답 글은 HTML 에 그대로 있어 검색에도 읽힘
  const hfqJs = "(function(){var r=document.currentScript.parentNode,w=r.querySelector('.hq-row'),o=-1;function at(b,a){if(matchMedia('(max-width:767px)').matches){b.after(a);a.style.marginLeft='';return}w.after(a);var R=w.getBoundingClientRect(),B=b.getBoundingClientRect(),W=Math.min(520,R.width),m=B.left+B.width/2-R.left,l=Math.max(0,Math.min(m-W/2,R.width-W));a.style.marginLeft=l+'px';a.style.setProperty('--tip',(m-l-6)+'px')}w.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var k=+b.getAttribute('data-k');r.querySelectorAll('.hq-ans').forEach(function(a){a.hidden=true});w.querySelectorAll('button').forEach(function(x){x.classList.remove('on');x.setAttribute('aria-expanded','false')});if(o===k){o=-1;return}o=k;var a=r.querySelector('#hqa'+k);b.classList.add('on');b.setAttribute('aria-expanded','true');at(b,a);a.hidden=false});addEventListener('resize',function(){if(o>=0)at(w.querySelector('[data-k=\"'+o+'\"]'),r.querySelector('#hqa'+o))})})();";
  const hfq = HQ.length ? ['      <div class="hfq"><b>헷지했지 <span>· 분양가 보호 약정 · 질문을 누르면 답이 열립니다</span></b>',
    '        <div class="hq-row">' + HQ.map(([q], k) => (k ? '<i>｜</i>' : '') + '<button type="button" data-k="' + k + '" aria-expanded="false" aria-controls="hqa' + k + '">Q. ' + esc(q) + '</button>').join('') + '</div>',
    ...HQ.map(([, a], k) => '        <div class="hq-ans" id="hqa' + k + '" hidden>' + seg(a) + '</div>'),
    '        <script>' + hfqJs + '</script>', '      </div>'] : [];
  const links = (I.links || []).map(([h, t]) => '<a href="' + esc(h) + '">' + esc(t) + '</a>').join('');
  // 단지 소개 · 사업개요 · 입지 (시안 r63 확정 2026-11-18) — 검색 로봇이 읽는 글. 손님에게도 똑같이 보임. {연차:2018} = 만들 때 기준 n년차
  const yr = t => String(t).replace(/\{연차:(\d{4})\}/g, (x, y) => (new Date().getFullYear() - Number(y) + 1) + '년차');
  const OV = ((D.content || {}).overview || {}).items || [], PM = ((((D.content || {}).siteMap || {}).board || {}).premium || {}).items || [];
  const H2 = '<h2 style="margin:0 0 6px;font-size:14px;font-weight:800;color:#1d1d1f">';
  const intro = I.intro || OV.length || PM.length ? [
    '    <div class="hwin" style="flex:1 1 100%;border-top:1px solid #ececf0;padding-top:14px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:18px 32px">',
    '      <style>.hwin dl{margin:0;display:grid;grid-template-columns:92px 1fr;gap:2px 10px;font-size:12.5px}.hwin dt{color:#6e6e73;font-weight:700}.hwin dd{margin:0}.hwin ul{margin:0;padding-left:16px;font-size:12.5px;line-height:1.8}@media (max-width:900px){.hwin{grid-template-columns:1fr!important}}</style>',
    I.intro ? '      <section>' + H2 + esc(S.name) + ' 단지 소개</h2><p style="margin:0;line-height:1.75">' + esc(I.intro) + '</p></section>' : null,
    OV.length ? '      <section>' + H2 + '사업개요</h2><dl>' + OV.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(yr(v)).replace(/\n/g, ' ') + '</dd>').join('') + '</dl></section>' : null,
    PM.length ? '      <section>' + H2 + '입지 · 개발 계획</h2><ul>' + PM.map(x => '<li>' + esc(x.title) + '</li>').join('') + '</ul><p style="margin:4px 0 0;font-size:11.5px;color:#8e8e93">예정 사항은 관계기관 사정에 따라 바뀔 수 있습니다</p></section>' : null,
    '    </div>'].filter(Boolean) : [];
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
    ...(hfq.length ? ['      <style>.hfq{margin-top:10px;padding-top:8px;border-top:1px dashed #e5e5ea}.hfq>b{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:#6b5ce7;margin-bottom:4px}.hfq>b:before{content:"";width:7px;height:7px;border-radius:50%;background:#6b5ce7}.hfq>b span{font-weight:500;color:#8e8e93}.hq-row{display:flex;flex-wrap:wrap;align-items:center}.hq-row button{border:0;background:none;padding:4px 0;font:inherit;font-weight:700;color:#1d1d1f;cursor:pointer;white-space:nowrap}.hq-row button::after{content:"+";color:#6b5ce7;font-weight:500;margin-left:5px}.hq-row button.on{color:#6b5ce7}.hq-row button.on::after{content:"−"}.hq-row i{font-style:normal;color:#c7c7cc;margin:0 12px}.hq-ans{position:relative;margin-top:6px;background:#f6f4ff;border-radius:10px;padding:10px 14px;color:#3a3a3c;max-width:520px;box-sizing:border-box}.hq-ans[hidden]{display:none}.hq-ans b{color:#1d1d1f}.hq-ans:before{content:"";position:absolute;top:-6px;left:var(--tip,24px);width:12px;height:12px;background:#f6f4ff;transform:rotate(45deg)}@media (max-width:767px){.hq-row{flex-direction:column;align-items:flex-start}.hq-row i{display:none}.hq-row button{white-space:normal;text-align:left}.hq-ans{margin:2px 0 6px;max-width:none}.hq-ans:before{display:none}}</style>', ...hfq] : []),
    '    </section>',
    ...intro,
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
  // 카카오 지도 퍼가기 목록: 0 = 단지(seo.map) · 1부터 = 입지환경 사진 칩(content.siteMap.spots[].map) — 지도 페이지 ?p=번호 (시안 r9-map 2026-11-14)
  const spots = ((D.content || {}).siteMap || {}).spots || [];
  const rows = [MAP].concat(spots.map(s => s.map || {})).map((m, i, a) => '    [' + J(m.timestamp || '') + ', ' + J(m.key || '') + ']' + (i < a.length - 1 ? ',' : '') + '   // ' + i + ' ' + (i ? spots[i - 1].name : S.name));
  out[f] = swap(h, /var P = \[[\s\S]*?\n  \];/, () => 'var P = [\n' + rows.join('\n') + '\n  ];', f);
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
