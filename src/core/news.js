// 분양 소식 규칙 (시안 r79 확정 2026-11-25) — DB를 모르는 순수 함수
//   글 = 분류 · 제목 · '한 줄로 먼저'(검색 설명 겸 첫 문단) · 본문 블록 · 해시태그 · 글 주소(slug) · 임시 저장 / 공개
//   본문 블록: h(소제목) · p(글) · img(사진: 올린 파일 id 또는 단지 사진 assets/…) · table(줄마다 '칸 | 칸', 첫 줄 = 머리) · links(페이지 링크)
//   쓰기 = 대표 · 관리자만 · 공개 글에 전화번호 · 호수가 있으면 막음 (개인정보) · 점검 항목은 권장(막지 않음)
export const CATS = [['conv', '분양전환'], ['hedge', '매입보장'], ['plan', '평면 · 세대'], ['loc', '입지'], ['notice', '일정 · 공지']];
export const CAT = Object.fromEntries(CATS);
export const LINKS = { plan: ['/plan', '평면 안내', '타입별 평면 · 면적'], location: ['/location', '입지환경', '교통 · 생활권'], dongho: ['/dongho', '단지 개요', '단지배치 · 동호배치'], listings: ['/listings', '현재 매물', '공개 매물 보기'], news: ['/news', '분양 소식', '다른 글 보기'] };
export const MAX_BLOCKS = 60;

const s = (v, n) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n);
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isMedia = x => /^[a-z0-9]{8,40}$/.test(String(x));
export const isAsset = x => /^assets\/[\w\-./]+\.(jpg|jpeg|png|webp)$/i.test(String(x)) && !String(x).includes('..');

export function cleanBlocks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const b of list.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== 'object') continue;
    if (b.t === 'h' || b.t === 'p') { const x = s(b.x, b.t === 'h' ? 80 : 4000); if (x) out.push({ t: b.t, x }); }
    else if (b.t === 'img') { const src = String(b.src || ''); if (isMedia(src) || isAsset(src)) out.push({ t: 'img', src, cap: s(b.cap, 120) }); }
    else if (b.t === 'table') { const rows = s(b.x, 3000).split('\n').map(r => r.split('|').map(c => c.trim()).slice(0, 6)).filter(r => r.some(Boolean)).slice(0, 30); if (rows.length) out.push({ t: 'table', x: rows.map(r => r.join(' | ')).join('\n') }); }
    else if (b.t === 'links') { const items = (Array.isArray(b.items) ? b.items : []).filter(k => LINKS[k]).slice(0, 5); if (items.length) out.push({ t: 'links', items }); }
  }
  return out;
}

export const cleanTags = v => [...new Set(String(Array.isArray(v) ? v.join(',') : v || '').split(/[,#\n]/).map(x => x.trim().replace(/\s+/g, '')).filter(Boolean))].slice(0, 12).map(x => x.slice(0, 30));

// 저장할 칸. 틀리면 { err }
export function cleanNews(b, isNew) {
  if (!b || typeof b !== 'object') return { err: 'input' };
  const o = {};
  if (isNew || 'cat' in b) { if (!CAT[b.cat]) return { err: 'cat' }; o.cat = b.cat; }
  if (isNew || 'title' in b) { o.title = s(b.title, 80); if (!o.title) return { err: 'title' }; }
  if ('lead' in b) o.lead = s(b.lead, 300);
  if ('blocks' in b) o.body = JSON.stringify(cleanBlocks(b.blocks));
  if ('tags' in b) o.tags = cleanTags(b.tags).join(',');
  if (isNew || 'slug' in b) { o.slug = s(b.slug, 80).toLowerCase(); if (!SLUG.test(o.slug)) return { err: 'slug' }; }
  return o;
}

export const blocksOf = n => { try { return cleanBlocks(JSON.parse(n.body || '[]')); } catch (e) { return []; } };
export const textOf = n => [n.title, n.lead].concat(blocksOf(n).map(b => b.t === 'img' ? b.cap : b.x || '')).join('\n');
export const coverOf = n => (blocksOf(n).find(b => b.t === 'img') || {}).src || null;

// 개인정보: 전화번호(사무소 번호 · 1588 류 대표번호 빼고) · 호수(101동 1502호, 101-1502)
export function privacy(text, allow = []) {
  const t = String(text || ''), bad = [];
  const ok = new Set(allow.map(x => String(x).replace(/\D/g, '')));
  (t.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || []).forEach(m => { if (!ok.has(m.replace(/\D/g, ''))) bad.push('전화번호 ' + m); });
  (t.match(/\d{3}\s*동\s*\d{3,4}\s*호|\b1\d{2}-\d{3,4}\b/g) || []).forEach(m => bad.push('호수 ' + m));
  return [...new Set(bad)];
}

// 올리기 전 점검 (권장)
export function checks(n, name) {
  const bl = blocksOf(n), text = bl.filter(b => b.t === 'p' || b.t === 'h').map(b => b.x).join('') + (n.lead || '');
  const imgs = bl.filter(b => b.t === 'img'), heads = bl.filter(b => b.t === 'h').length, len = [...text.replace(/\s/g, '')].length, tl = [...(n.title || '')].length, ll = [...(n.lead || '')].length;
  return [
    [!!name && String(n.title || '').includes(name) && tl <= 60, "제목에 '" + name + "' · 60자 이하 (지금 " + tl + '자)'],
    [ll >= 60 && ll <= 150, "'한 줄로 먼저' 60~150자 (지금 " + ll + '자)'],
    [imgs.length >= 3 && imgs.every(b => b.cap), '사진 3장 이상 · 사진 설명 (지금 ' + imgs.length + '장)'],
    [len >= 800, '본문 800자 이상 (지금 ' + len.toLocaleString() + '자)'],
    [heads >= 2, '소제목 2개 이상 (지금 ' + heads + '개)']
  ].map(([ok, t]) => ({ ok, t }));
}
