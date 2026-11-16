// 세대 전환 상태 · 공개 세대 규칙 (R2, 시안 preview/r2-public-pick 확정 2026-11-13) — DB를 모르는 순수 함수만
//   상태 10가지는 기존 대라수 사이트(STATUSES) 그대로 + '공실'. 공개는 공실 · 퇴거확정(매물동의)만
//   손님에게는 동 · 층구간 · 타입 · 전용면적 · 구분만 (호수 · 가격 없음, 대표 결정 2026-11-13)
import { UNIT } from './units.js';
import { band, TOP, areaOf } from './listings.js';

export const CONV = ['상담중', '장기부재', '호실변경', '전세연장', '가계약', '계약중', '신규입주', '계약완료', '퇴거확정', '퇴거확정(매물동의)', '공실'];
// 공개할 수 있는 상태 → 손님 화면 구분 (vac = 즉시 입주 · out = 입주일 협의)
export const PUB_KIND = { '공실': 'vac', '퇴거확정(매물동의)': 'out' };
export const KIND_KO = { vac: '즉시 입주', out: '입주일 협의' };

export const canPub = status => !!PUB_KIND[status];
// 손님 화면 거래 구분 (시안 r46 확정 2026-11-17) — 직원이 고름: 신규분양(매매) · 전세 · 둘 다
export const DEALS = ['매매', '전세', '둘 다'];
export const DEAL_KO = { 매매: '신규분양', 전세: '전세', '둘 다': '신규분양 · 전세' };
export const cleanDeal = d => DEALS.includes(d) ? d : '매매';
// 계약조건 빈칸(신규분양 대상) 세대 공개용 한 줄 — 구분은 임대차 만기로 (지남 = 즉시 입주 · 아니면 입주일 협의)
export function pubRowKind(id, kind) {
  const u = UNIT[id];
  if (!u || !KIND_KO[kind]) return null;
  return { dong: u.dong, band: band(u.floor, TOP[u.dong]), type: u.type, kind, exclusive: areaOf(u).exclusive };
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// 직원이 보낸 상태 고치기 → 저장할 값. 틀리면 null
export function cleanConv(b) {
  if (!b || typeof b !== 'object') return null;
  const status = String(b.status || '');
  if (status && !CONV.includes(status)) return null;
  const move_out = String(b.move_out || '').trim();
  if (move_out && !DATE.test(move_out)) return null;
  return { status: status || null, move_out: move_out || null, memo: String(b.memo || '').trim().slice(0, 300) || null };
}

// 공개용 사본 한 줄 — 호수 · 층 · 라인은 넣지 않음
export function pubRow(id, status) {
  const u = UNIT[id];
  if (!u || !canPub(status)) return null;
  return { dong: u.dong, band: band(u.floor, TOP[u.dong]), type: u.type, kind: PUB_KIND[status], exclusive: areaOf(u).exclusive };
}

// 손님 목록: 같은 동 · 층구간 · 타입 · 구분은 한 줄로 묶고 세대 수(n)만. 즉시 입주 먼저 → 동 → 층구간
const BAND_ORD = { 저층: 0, 중층: 1, 고층: 2 };
export function groupPub(rows) {
  const g = {};
  rows.forEach(r => { const k = [r.dong, r.band, r.type, r.kind, r.deal || ''].join('|'); (g[k] = g[k] || { dong: r.dong, band: r.band, type: r.type, kind: r.kind, deal: r.deal || '매매', exclusive: r.exclusive, n: 0 }).n++; });
  return Object.values(g).sort((a, b) => (a.kind === 'vac' ? 0 : 1) - (b.kind === 'vac' ? 0 : 1) || a.dong - b.dong || BAND_ORD[a.band] - BAND_ORD[b.band] || a.type.localeCompare(b.type));
}
