// 일일업무보고 계산 (R3-2, 시안 preview/r3-daily 확정 2026-11-13) — 기존 대라수 사이트 rptBuild · rptTotals 를 옮김
//   분양현황: 계약완료 · 신규입주 세대를 완료일(done_at)로 — 그날 = 금일계약, 기준일(2026-10-16) 전 또는 날짜 없음 = 이전, 나머지 = 이후
//   전세연장 · 미동의(퇴거확정 · 퇴거확정(매물동의)) · 퇴거(공실)는 지금 상태로 셈
//   영업통계: 방문상담 / 그 밖의 상담 = 상담 기록(상담일) · 상담예약 = 상담카드 '예약방문' 날짜. 누계 = 그날까지 전부
//   세대관람: 그날 상담 기록이 있는 신규고객 카드의 관심호실 · 누계 = 모든 신규고객 카드의 관심호실 수
//   근무인원 · 기준일은 직전 저장 보고서에서, 금일 업무 = 직전 저장 보고서의 명일 업무
import { UNITS } from './units.js';
import { maskName } from './mask.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

export const CUTOFF = '2026-10-16';   // 10.16 혜택가 마감 (대표 결정 2026-11-13)
export const STAFF0 = [['대표', ''], ['팀장', ''], ['상담', ''], ['안내', '']];
const DONE = ['계약완료', '신규입주'];
const kst = t => new Date(Number(t) + 9 * 3600e3).toISOString().slice(0, 10);
const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const uLabel = id => String(id || '');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function buildReport({ conv, logs, cards }, date, prev, cut) {
  const cutoff = YMD.test(cut || '') ? cut : prev && YMD.test(prev.cutoff || '') ? prev.cutoff : CUTOFF;
  const C = Object.fromEntries(conv.map(c => [c.unit_id, c]));
  const order = Object.keys(SITE.types || {});
  const types = order.map(t => {
    const o = { type: t, units: 0, pre: 0, post: 0, today: 0, jeon: 0, mi: 0, vac: 0 };
    UNITS.filter(u => u.type === t).forEach(u => {
      o.units++;
      const c = C[u.id] || {}, st = c.status;
      if (DONE.includes(st)) {
        const d = c.done_at ? kst(c.done_at) : null;
        if (d && d > date) return;                 // 그날 이후에 완료 → 그날 보고서엔 아직 아님
        if (d === date) o.today++; else if (!d || d < cutoff) o.pre++; else o.post++;
      } else if (st === '전세연장') o.jeon++;
      else if (st === '퇴거확정' || st === '퇴거확정(매물동의)') o.mi++;
      else if (st === '공실') o.vac++;
    });
    return o;
  });

  const dOf = l => l.date || kst(l.at);
  const upto = logs.filter(l => dOf(l) <= date), isV = l => l.channel === '방문상담';
  const bookDay = c => String(c.book || '').slice(0, 10);
  const stats = {
    visit: { today: upto.filter(l => isV(l) && dOf(l) === date).length, total: upto.filter(isV).length },
    other: { today: upto.filter(l => !isV(l) && dOf(l) === date).length, total: upto.filter(l => !isV(l)).length },
    book: { today: cards.filter(c => bookDay(c) === date).length, total: cards.filter(c => bookDay(c) && bookDay(c) <= date).length }
  };

  const newCards = cards.filter(c => c.kind === 'new');
  const todayLog = {}; logs.filter(l => l.kind === 'new' && dOf(l) === date).forEach(l => { todayLog[l.consult_id] = l; });
  const seen = new Set(), rows = [];
  newCards.filter(c => todayLog[c.id]).forEach(c => (c.intUnits || []).forEach(u => {
    if (seen.has(u)) return; seen.add(u);
    const who = (c.name ? maskName(c.name) : '') + (c.ctype ? '(' + c.ctype + ')' : '');
    const note = short(todayLog[c.id].memo, 60);
    rows.push({ unit: uLabel(u), stage: c.progress || '상담중', memo: [who, note].filter(Boolean).join(' · ') });
  }));
  const view = { today: rows.length, units: rows.map(r => r.unit).join(' · '), total: newCards.reduce((s, c) => s + (c.intUnits || []).length, 0), rows };

  return {
    date, cutoff, types, stats, view,
    staff: prev && Array.isArray(prev.staff) && prev.staff.length ? prev.staff.map(s => [String(s[0] || ''), String(s[1] || '')]) : STAFF0.map(s => s.slice()),
    work: { today: prev && prev.work ? String(prev.work.tomorrow || '') : '', tomorrow: '' },
    prevDate: prev ? prev.date : null
  };
}

// 저장할 보고서 검사 — 모양만 맞추고 글 길이 제한 (숫자는 직원이 고칠 수 있으므로 그대로 받음)
const n = v => { const x = Number(String(v == null ? '' : v).replace(/[^0-9]/g, '')); return Number.isFinite(x) ? Math.min(x, 1e6) : 0; };
const s = (v, k) => String(v == null ? '' : v).slice(0, k);
export function cleanReport(r, date) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.types)) return null;
  const out = {
    date, cutoff: /^\d{4}-\d{2}-\d{2}$/.test(r.cutoff || '') ? r.cutoff : CUTOFF,
    types: r.types.slice(0, 20).map(t => ({ type: s(t.type, 10), units: n(t.units), pre: n(t.pre), post: n(t.post), today: n(t.today), jeon: n(t.jeon), mi: n(t.mi), vac: n(t.vac) })),
    stats: Object.fromEntries(['visit', 'other', 'book'].map(k => [k, { today: n(((r.stats || {})[k] || {}).today), total: n(((r.stats || {})[k] || {}).total) }])),
    view: { today: n((r.view || {}).today), units: s((r.view || {}).units, 500), total: n((r.view || {}).total), rows: ((r.view || {}).rows || []).slice(0, 60).map(v => ({ unit: s(v.unit, 20), stage: s(v.stage, 20), memo: s(v.memo, 300) })) },
    staff: (Array.isArray(r.staff) ? r.staff : []).slice(0, 12).map(x => [s((x || [])[0], 12), s(n((x || [])[1]) || '', 4)]),
    work: { today: s((r.work || {}).today, 3000), tomorrow: s((r.work || {}).tomorrow, 3000) },
    prevDate: /^\d{4}-\d{2}-\d{2}$/.test(r.prevDate || '') ? r.prevDate : null
  };
  return out;
}
