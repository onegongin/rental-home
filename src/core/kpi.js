// KPI 보드 계산 (R3-1, 시안 preview/r3-kpi 확정 2026-11-13) — DB를 모르는 순수 함수
//   세대 담당 = 그 세대 임차인 상담카드의 담당 · 상담 날짜 = 기록의 상담일(없으면 저장 시각, 한국 날짜)
//   미상담 = 계약완료 · 신규입주 · 전세연장 · 공실을 뺀 세대 중 마지막 상담이 days 일 전보다 오래됐거나 없는 세대
import { UNITS } from './units.js';

export const DONE = ['계약완료', '신규입주'];
export const NO_FOLLOW = ['계약완료', '신규입주', '전세연장', '공실'];
const kst = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const VISIT = '방문상담';

export function buildKpi({ conv, cards, logs, pub }, now = Date.now(), days = 30) {
  const today = kst(now), tomorrow = kst(now + 864e5), month = today.slice(0, 7);
  const C = Object.fromEntries(conv.map(c => [c.unit_id, c]));
  const tcard = {}; cards.filter(c => c.kind === 'tenant').forEach(c => { tcard[c.unit_id] = c; });
  const dateOf = l => l.date || kst(l.at);
  const last = {};   // 세대별 마지막 상담일 (임차인 카드 기록)
  logs.forEach(l => { if (l.kind !== 'tenant') return; const d = dateOf(l); if (!last[l.unit_id] || d > last[l.unit_id]) last[l.unit_id] = d; });

  const units = UNITS.map(u => {
    const c = C[u.id], st = (c && c.status) || '미정', ld = last[u.id] || null;
    return { id: u.id, dong: u.dong, floor: u.floor, line: u.line, type: u.type, st, mgr: (tcard[u.id] || {}).mgr || '', card: (tcard[u.id] || {}).id || null,
      last: ld, ago: ld ? dayDiff(ld, today) : null, todayChg: !!(c && c.at && kst(c.at) === today) };
  });
  const unvisited = units.filter(u => !NO_FOLLOW.includes(u.st) && (u.ago == null || u.ago >= days))
    .sort((a, b) => (b.ago ?? 1e9) - (a.ago ?? 1e9) || a.dong - b.dong || a.floor - b.floor || a.line - b.line);

  // 상담 활동 (전체 · 담당별)
  const act = m => {
    const L = m == null ? logs : logs.filter(l => (l.mgr || '') === m);
    const visit = L.filter(l => l.channel === VISIT), other = L.filter(l => l.channel !== VISIT);
    return { visitToday: visit.filter(l => dateOf(l) === today).length, visitAll: visit.length, otherToday: other.filter(l => dateOf(l) === today).length, otherAll: other.length,
      month: L.filter(l => dateOf(l).slice(0, 7) === month).length, today: L.filter(l => dateOf(l) === today).length };
  };
  const newCards = cards.filter(c => c.kind === 'new');
  const prog = {}; newCards.forEach(c => { prog[c.progress] = (prog[c.progress] || 0) + 1; });
  const mgrs = [...new Set(cards.map(c => c.mgr).filter(Boolean))].sort();
  const byMgr = mgrs.map(m => Object.assign({ mgr: m, cards: cards.filter(c => c.mgr === m).length,
    done: units.filter(u => u.mgr === m && DONE.includes(u.st)).length + newCards.filter(c => c.mgr === m && c.progress === '계약완료').length,
    unvisited: unvisited.filter(u => u.mgr === m).length }, act(m)));

  const books = cards.filter(c => c.book && [today, tomorrow].includes(String(c.book).slice(0, 10)))
    .map(c => ({ id: c.id, kind: c.kind, unit: c.unit_id || c.contractUnit, at: c.book, day: String(c.book).slice(0, 10) === today ? '오늘' : '내일', mgr: c.mgr || '', name: c.name, writer: c.writer }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return { today, days, units, unvisited, act: act(null), byMgr, books,
    newCards: { total: newCards.length, prog }, pub: { total: pub.length, vac: pub.filter(p => p.kind === 'vac').length, out: pub.filter(p => p.kind === 'out').length } };
}
