// 분양 소식 검색용 페이지 (시안 r79 확정 2026-11-25) — 서버가 만든 가벼운 글자 페이지 (블로그 모양)
//   /news · /news?c={분류} 목록 · /news/{글 주소} 글 한 편 (BlogPosting) · /news/img/{id} 올린 사진 (공개 글 사진, 로고 새김)
//   맨 위 '한 줄로 먼저' 상자 = 검색 설명 겸 첫 문단 · 소제목 · 사진 + 설명 · 표 · 관련 페이지 · 상담 신청 · 해시태그 · 이전 / 다음 글
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { page, esc, crumbs } from './pages.js';
import { CAT, CATS, LINKS, blocksOf, coverOf } from '../core/news.js';

const S = SITE.site || {}, O = SITE.office || {};
const ymd = t => new Date((t || Date.now()) + 9 * 3600e3).toISOString().slice(0, 10);
export const imgSrc = src => !src ? '' : /^assets\//.test(src) ? '/' + src : '/news/img/' + src;
const mins = n => Math.max(1, Math.round([...blocksOf(n).map(b => b.x || b.cap || '').join('') + (n.lead || '')].length / 500));
const CSS = '.cat{display:inline-block;font-size:11.5px;font-weight:800;border-radius:6px;padding:2px 8px;background:#fdecea;color:#c8381e;text-decoration:none}' +
  '.nl{display:grid;grid-template-columns:200px minmax(0,1fr);gap:14px;padding:14px 0;border-top:1px solid #ececf0;text-decoration:none;color:#1d1d1f}.nl:first-of-type{border-top:0}.nl img,.nl .ni{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:10px;background:#eef2f7}.nl b{display:block;font-size:16.5px;margin:4px 0;line-height:1.4}.nl span.s{font-size:13.5px;color:#6e6e73;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.nl small{font-size:12px;color:#8e8e93;margin-left:6px}' +
  '.tl{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.tl a{white-space:nowrap;font-size:13px;font-weight:700;border:1px solid #d2d2d7;border-radius:9999px;padding:5px 13px;text-decoration:none;color:#1d1d1f;background:#fff}.tl a.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}' +
  '.art{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:22px 22px 18px}.art h1{font-size:25px;line-height:1.4;margin:8px 0}.by{font-size:12.5px;color:#6e6e73;margin-bottom:14px}.by b{color:#1d1d1f}' +
  '.lead{background:#f5f9ff;border:1px solid #d6e6fb;border-radius:14px;padding:14px 16px;margin:14px 0;font-size:15px;line-height:1.8}.lead b.k{display:block;font-size:12px;color:#0066cc;margin-bottom:2px}' +
  '.art h2{font-size:19px;margin:26px 0 8px}.art p{font-size:15.5px;line-height:1.9;margin:0 0 12px;white-space:pre-wrap;word-break:keep-all}.art figure{margin:14px 0}.art figure img{width:100%;display:block;border-radius:12px;background:#f5f5f7}.art figcaption{font-size:12.5px;color:#8e8e93;text-align:center;margin-top:6px}' +
  '.art table{margin:8px 0 14px;font-size:14.5px}.art table th{width:auto;background:#fafafc;padding:9px 8px}.art table td{padding:9px 8px}' +
  '.rel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0}.rel a{border:1px solid #ececf0;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:700;color:#1d1d1f;text-decoration:none;background:#fff}.rel a span{display:block;font-size:12px;color:#8e8e93;font-weight:500}' +
  '.ct{background:#fff4f2;border:1.5px solid #c8381e;border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}.ct b{font-size:15.5px}.ct span{display:block;font-size:13px;color:#6e6e73}.ct a.btn{margin-left:auto}' +
  '.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}.tags span{font-size:12.5px;color:#0066cc;background:#f0f6ff;border-radius:9999px;padding:3px 10px}' +
  '.nx{display:flex;justify-content:space-between;gap:10px;margin-top:16px;font-size:13.5px;border-top:1px solid #ececf0;padding-top:12px}.nx a{text-decoration:none;max-width:48%}' +
  '@media(max-width:560px){.nl{grid-template-columns:110px minmax(0,1fr)}.nl b{font-size:15px}.art{padding:18px 14px}.art h1{font-size:21px}.rel{grid-template-columns:1fr}.ct a.btn{margin-left:0}}';
const cta = () => '<div class="ct"><div><b>분양전환 · 매입보장 상담 신청</b><span>이름 · 연락처만 남기시면 담당자가 연락드립니다 · ' + esc(O.tel) + '</span></div><a class="btn p" href="/?reg=1">상담 신청</a><a class="btn s" href="tel:' + esc(O.tel) + '">☎ 전화</a></div>';
const org = () => ({ '@type': 'Organization', name: O.name, telephone: O.tel });

export function newsList(base, rows, cat) {
  const name = S.name + ' 분양 소식' + (cat ? ' · ' + CAT[cat] : ''), path = '/news' + (cat ? '?c=' + cat : '');
  const desc = S.name + '(' + S.alias + ') 분양전환 · 매입보장 · 평면 · 입지 소식' + (rows.length ? ' ' + rows.length + '편' : '') + '. ' + O.name + ' ' + O.tel;
  const tabs = '<div class="tl"><a href="/news"' + (!cat ? ' class="on"' : '') + '>전체</a>' + CATS.map(([k, v]) => '<a href="/news?c=' + k + '"' + (k === cat ? ' class="on"' : '') + '>' + esc(v) + '</a>').join('') + '</div>';
  const items = rows.length ? '<div class="card">' + rows.map(n => { const c = coverOf(n); return '<a class="nl" href="/news/' + esc(n.slug) + '">' + (c ? '<img src="' + esc(imgSrc(c)) + '" alt="' + esc(n.title) + '" loading="lazy">' : '<div class="ni"></div>') +
    '<div style="min-width:0"><span class="cat">' + esc(CAT[n.cat] || '') + '</span><small>' + ymd(n.pub_at) + '</small><b>' + esc(n.title) + '</b><span class="s">' + esc(n.lead || '') + '</span></div></a>'; }).join('') + '</div>'
    : '<div class="card">아직 올라온 소식이 없습니다. <a href="/?reg=1">관심등록</a>하시면 새 소식을 알려 드립니다.</div>';
  const body = '<style>' + CSS + '</style><nav class="bc"><a href="/">홈</a> › 분양 소식' + (cat ? ' › ' + esc(CAT[cat]) : '') + '</nav><h1>' + esc(name) + '</h1><p class="sub">' + esc(S.name) + ' 분양전환 · 매입보장 · 세대 · 입지 소식을 ' + esc(O.name) + '이 직접 정리합니다.</p>' + tabs + items + cta();
  const json = [{ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: rows.slice(0, 50).map((n, i) => ({ '@type': 'ListItem', position: i + 1, url: base + '/news/' + n.slug, name: n.title })) },
    crumbs(base, [['홈', '/'], ['분양 소식', '/news']].concat(cat ? [[CAT[cat], path]] : []))];
  return page({ base, path, title: name + ' | ' + O.name, desc, body, json, img: imgSrc(coverOf(rows[0] || {}) || '') || undefined });
}

const blockHtml = (b, title) => {
  if (b.t === 'h') return '<h2>' + esc(b.x) + '</h2>';
  if (b.t === 'p') return '<p>' + esc(b.x) + '</p>';
  if (b.t === 'img') return '<figure><img src="' + esc(imgSrc(b.src)) + '" alt="' + esc(b.cap || title) + '" loading="lazy">' + (b.cap ? '<figcaption>' + esc(b.cap) + '</figcaption>' : '') + '</figure>';
  if (b.t === 'table') { const r = b.x.split('\n').map(l => l.split('|').map(c => c.trim())); return '<table><thead><tr>' + r[0].map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + r.slice(1).map(l => '<tr>' + l.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; }
  if (b.t === 'links') return '<div class="rel">' + b.items.map(k => '<a href="' + LINKS[k][0] + '">' + esc(LINKS[k][1]) + '<span>' + esc(LINKS[k][2]) + '</span></a>').join('') + '</div>';
  return '';
};

export function newsPage(base, n, prev, next) {
  const bl = blocksOf(n), cover = coverOf(n), tags = (n.tags || '').split(',').filter(Boolean), path = '/news/' + n.slug;
  const body = '<style>' + CSS + '</style><nav class="bc"><a href="/">홈</a> › <a href="/news">분양 소식</a> › <a href="/news?c=' + esc(n.cat) + '">' + esc(CAT[n.cat] || '') + '</a></nav>' +
    '<article class="art"><a class="cat" href="/news?c=' + esc(n.cat) + '">' + esc(CAT[n.cat] || '') + '</a><h1>' + esc(n.title) + '</h1>' +
    '<div class="by"><b>' + esc(O.name) + '</b> · ' + ymd(n.pub_at) + (n.edited_at && ymd(n.edited_at) !== ymd(n.pub_at) ? ' · 고침 ' + ymd(n.edited_at) : '') + ' · 읽는 데 ' + mins(n) + '분</div>' +
    (n.lead ? '<div class="lead"><b class="k">한 줄로 먼저</b>' + esc(n.lead) + '</div>' : '') +
    bl.map(b => blockHtml(b, n.title)).join('') + cta() +
    (tags.length ? '<div class="tags">' + tags.map(t => '<span>#' + esc(t) + '</span>').join('') + '</div>' : '') +
    '<div class="nx">' + (next ? '<a href="/news/' + esc(next.slug) + '">← ' + esc(next.title) + '</a>' : '<span></span>') + '<a href="/news">소식 목록</a>' + (prev ? '<a href="/news/' + esc(prev.slug) + '" style="text-align:right">' + esc(prev.title) + ' →</a>' : '') + '</div></article>';
  const img = cover ? imgSrc(cover) : undefined;
  const json = [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: n.title, description: n.lead || '', url: base + path, mainEntityOfPage: base + path, datePublished: new Date(n.pub_at || n.at).toISOString(), dateModified: new Date(n.edited_at || n.pub_at || n.at).toISOString(),
    image: bl.filter(b => b.t === 'img').slice(0, 5).map(b => base + imgSrc(b.src)), author: org(), publisher: org(), keywords: tags.join(', '), articleSection: CAT[n.cat] || '', about: { '@type': 'ApartmentComplex', name: S.name, alternateName: S.alias } },
    crumbs(base, [['홈', '/'], ['분양 소식', '/news'], [CAT[n.cat] || '', '/news?c=' + n.cat], [n.title, path]])];
  return page({ base, path, title: n.title, desc: n.lead || n.title, body, json, img }).replace('<meta property="og:type" content="website">', '<meta property="og:type" content="article">');
}

// 올린 사진 — aud 'news' 만 (손님 누구나 · 1시간 캐시)
export async function newsImg(env, id) {
  if (!env.MEDIA || !/^[a-z0-9]{8,40}$/.test(id)) return new Response('not found', { status: 404 });
  const m = await env.DB.prepare("SELECT id FROM media WHERE id = ? AND aud = 'news'").bind(id).first();
  const o = m && await env.MEDIA.get('m/' + id);
  if (!o) return new Response('not found', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
}
