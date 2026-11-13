// 세대 자료 규칙 (설계서 8.2) — 화면의 세대 덩어리(u) ↔ 소유자 · 임대차 칸 바꾸기, 만기 계산, 엑셀 값 정리
// DB를 모르는 순수 함수만 (테스트하기 쉽게)

// 화면 계약형태(own.ocType) → 거주형태(units.occupancy)
export const OCC = { 실거주: '자가거주', 전세: '전세', 월세: '월세', 반전세: '반전세', 공실: '공실', 미확인: '미확인', '신규(명변)': '미확인' };
export const OCCS = ['자가거주', '전세', '월세', '반전세', '공실', '미확인'];
// 엑셀 거주형태 → 화면 계약형태 (화면에 반전세가 없어 월세로, 임대차 표에는 반전세로 남김)
const OC_IN = { 자가거주: '실거주', 자가: '실거주', 실거주: '실거주', 전세: '전세', 월세: '월세', 반전세: '월세', 공실: '공실', 미확인: '미확인' };
export const occOf = blob => OCC[((blob && blob.own) || {}).ocType] || '미확인';

// 한국 날짜 'YYYY-MM-DD'
export const today = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// 만기까지 남은 날 (지났으면 음수)
export const dday = (end, now) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(now + 'T00:00:00Z')) / 864e5);
export const bucket = d => d < 0 ? '지남' : d <= 30 ? 'D-30' : d <= 60 ? 'D-60' : d <= 90 ? 'D-90' : '';

// 현재 임대차 = 입주일 ≤ 오늘 ≤ (실제퇴거일 또는 만기일). 날짜 빈 칸은 '모름'으로 보고 막지 않는다
export function isCurrent(t, now) {
  if (!t || t.deleted_at) return false;
  if (t.move_in && t.move_in > now) return false;
  const out = t.moved_out || '';
  return !out || out >= now;
}

// 날짜 정리: 2026.3.5 · 2026-03-05 · 20260305 · 엑셀 날짜 숫자(46000) → '2026-03-05'. 못 읽으면 null
export function normDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d{5}$/.test(String(v).trim())) {
    const n = Number(v); if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})일?\.?$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  return isNaN(Date.parse(d + 'T00:00:00Z')) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d ? null : d;
}

// 금액(만원). '3억 5,000' · '35000' · '3.5억' → 35000. 못 읽으면 null
export function normMan(v) {
  if (v == null || v === '') return '';
  const s = String(v).replace(/[,\s원]/g, '');
  let m = s.match(/^(\d+(?:\.\d+)?)억(\d+)?(?:만)?$/);
  if (m) return Math.round(parseFloat(m[1]) * 1e4) + (Number(m[2]) || 0);
  m = s.match(/^(\d+)(?:만)?$/);
  return m ? Number(m[1]) : null;
}

export const phoneDigits = p => String(p || '').replace(/\D/g, '');
// 엑셀이 숫자로 읽어 맨 앞 0이 빠진 번호(1012345678) 되살리기
const zero = d => /^1\d{8,9}$/.test(d) ? '0' + d : d;
export const fmtPhone = d => d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d;
// 휴대폰: 010… 10~11자리만. 빈 칸 '' · 틀리면 null
export function normMobile(v) {
  const d = zero(phoneDigits(v)); if (!d) return '';
  return d.length >= 10 && d.length <= 11 && d.startsWith('01') ? fmtPhone(d) : null;
}
// 보조 연락처: 일반 전화도 허용
export function normTel(v) {
  const d = zero(phoneDigits(v)); if (!d) return '';
  if (d.length < 9 || d.length > 11) return null;
  return d.startsWith('01') ? fmtPhone(d) : String(v).trim();
}

// 통신사 · 관계 표준화 (화면 normCarrier · normRel 과 같은 규칙)
export function normCarrier(v) {
  const s = String(v || '').toUpperCase().replace(/\s/g, ''); if (!s || s === '선택') return '';
  const base = /LG|유플/.test(s) ? 'LGU' : /SK/.test(s) ? 'SKT' : /KT/.test(s) ? 'KT' : '';
  return base ? base + (/알뜰|MVNO/.test(s) ? '_알뜰' : '') : null;
}
const RELS = ['부모', '배우자', '자녀', '지인', '부동산', '관리', '기타'];
export function normRel(v) { v = String(v || '').trim(); if (!v) return { rel: '', etc: '' }; return RELS.includes(v) && v !== '기타' ? { rel: v, etc: '' } : { rel: '기타', etc: v === '기타' ? '' : v }; }

// 화면 덩어리 → 지금 소유자
export function ownerOf(b) {
  b = b || {};
  const contacts = [1, 2].map(n => ({ rel: b['c' + n + 'Rel'] || '', etc: b['c' + n + 'Etc'] || '', phone: b['c' + n + 'Phone'] || '' })).filter(c => c.rel || c.phone);
  return { name: String(b.owner || '').trim(), phone: b.phone || '', carrier: b.carrier || '', contacts };
}

// 화면 덩어리 → 지금 임대차 (전세 · 월세일 때만)
export function leaseOf(b) {
  const o = (b && b.own) || {};
  if (o.ocType !== '전세' && o.ocType !== '월세') return null;
  return {
    kind: o.ocType, tenant: String(o.ocTen || '').trim(), tenant_phone: o.ocTenPh || '',
    deposit: Number(o.ocDep) || null, rent: o.ocType === '월세' ? Number(o.ocRent) || null : null,
    end_date: normDate(o.ocEnd) || null, renewal_right: o.ocRight || '',
    party: o.ocParty || '', party_name: o.ocPartyName || ''
  };
}

// 같은 사람인가: 이름이 같거나, 한쪽 이름이 비었으면 번호로
export function samePerson(a, b) {
  const an = String(a.name || '').trim(), bn = String(b.name || '').trim();
  const ap = phoneDigits(a.phone), bp = phoneDigits(b.phone);
  if (an && bn) return an === bn;
  if (ap && bp) return ap === bp;
  return true;
}
