// 매칭 고객 (설계서 11.2, P6) — 새 매물 조건에 맞는 매수 · 임차 희망 상담카드 찾기. DB를 모르는 순수 함수
//   희망 동 · 층수대 · 타입 · 거래 · 예산을 비교. 광고 문자는 수신 동의(consent.mkt)한 고객만 (2026-11-03 대표 결정)
//   직원 화면 고르기 목록 모양 (wantLists): '1단지 전체 (101~104동)' · '101동' · '11~20층' · '10층 이하' · '41층 이상' · '79 (오피스텔)' · '무관'
import { UNIT } from './units.js';

const ANY = v => !v || v === '무관';
const list = (a, s) => (Array.isArray(a) && a.length ? a : String(s || '').split(',')).map(x => String(x).trim()).filter(x => !ANY(x));

export function dongOk(opt, dong) {
  const r = opt.match(/(\d+)\s*~\s*(\d+)동/);
  if (r) return dong >= +r[1] && dong <= +r[2];
  const m = opt.match(/^(\d+)동/);
  return m ? +m[1] === dong : false;
}
export function floorOk(opt, f) {
  let m;
  if ((m = opt.match(/(\d+)층\s*이하/))) return f <= +m[1];
  if ((m = opt.match(/(\d+)\s*~\s*(\d+)층/))) return f >= +m[1] && f <= +m[2];
  if ((m = opt.match(/(\d+)층\s*이상/))) return f >= +m[1];
  return false;
}
export const typeOk = (opt, type) => opt.split(/\s|\(/)[0] === type;

// '5억 2천' · '52000' · '5.2억' → 만원. 못 읽으면 0
export function manwon(v) {
  const s = String(v || '').replace(/[,\s원]/g, '');
  if (!s) return 0;
  let m = s.match(/^(\d+(?:\.\d+)?)억(?:(\d+)천)?(\d+)?만?$/);
  if (m) return Math.round(+m[1] * 10000 + (+m[2] || 0) * 1000 + (+m[3] || 0));
  m = s.match(/^(\d+)만?$/);
  return m ? +m[1] : 0;
}

// 카드 하나 → { ok, why[] } (why: 맞은 조건 — 화면 표시용)
export function cardFits(c, l) {
  const u = UNIT[l.unit_id];
  if (!u || !c || c.deleted || !['buyer', 'client'].includes(c.kind)) return { ok: false };
  const w = c.want || {}, why = [];
  // 거래: 카드 'wants'(입주 후 거래 희망)가 있으면 그 안에서만
  if (Array.isArray(c.wants) && c.wants.length) { if (!c.wants.includes(l.deal)) return { ok: false }; why.push('거래'); }
  const d = list(w.dongs, w.dong), f = list(w.floors, w.floor), t = list(w.types, w.type);
  if (d.length) { if (!d.some(x => dongOk(x, u.dong))) return { ok: false }; why.push('동'); }
  if (f.length) { if (!f.some(x => floorOk(x, u.floor))) return { ok: false }; why.push('층'); }
  if (t.length) { if (!t.some(x => typeOk(x, u.type))) return { ok: false }; why.push('타입'); }
  // 예산은 매매만 (매수 예산). 10% 넘게 비싸면 뺌
  const b = manwon(w.budget);
  if (l.deal === 'sale' && b && l.ask) { if (l.ask > b * 1.1) return { ok: false }; why.push('예산'); }
  return { ok: true, why };
}

// 맞는 카드 → 동의한 고객(조건 많이 맞은 순 · 최근 순) + 동의 없는 수
//   같은 고객(연락처)은 상담할 때마다 카드가 새로 생기므로 가장 최근 카드 하나만 봄 (조건 · 동의도 최근 값)
const keyOf = c => String(c.phone || '').replace(/\D/g, '') || c.custKey || c.id;
const ord = c => String(c.at || '') + String(c.id || '');
export function matchCards(l, cards) {
  const last = {}, hit = [];
  (cards || []).forEach(c => { if (!c || c.deleted || !['buyer', 'client'].includes(c.kind)) return; const k = keyOf(c); if (!last[k] || ord(c) > ord(last[k])) last[k] = c; });
  Object.values(last).forEach(c => { const r = cardFits(c, l); if (r.ok) hit.push({ c, why: r.why }); });
  const ok = hit.filter(h => h.c.consent && h.c.consent.mkt);
  ok.sort((a, b) => b.why.length - a.why.length || String(b.c.at || b.c.id).localeCompare(String(a.c.at || a.c.id)));
  return { list: ok, noConsent: hit.length - ok.length };
}
