// 수수료 청구서 · MGM 규칙 (R3-3, 시안 preview/r3-claim 확정 2026-11-13) — DB를 모르는 순수 함수
//   청구 대상(대표 결정): 이 사이트에서 계약완료 · 신규입주가 된 호실 모두 (done_at 있음). 날짜 없이 옮겨 온 기존 계약완료는 제외
//   수수료 = 만원 단위. 기본값 = 계약담당 직원에게 정한 값, 없으면 100만 · 3.3% 원천징수 (대표 결정)
//   세금: 3.3% = 원천징수(10원 아래 버림, 빼기) · 현금영수증 = 0 · 부가세 = 10% 더하기 (기존 사이트와 같음)
export const TAXES = ['3.3%', '현금영수증', '부가세'];
export const TAX_KO = { '3.3%': '3.3% 원천징수', '현금영수증': '현금영수증', '부가세': '부가세 10%' };
export const FEE0 = { fee: 100, tax: '3.3%' };
export const MGM_FEES = { '100만 · 현금영수증': [1000000, '현금영수증'], '110만 · 세금계산서': [1100000, '세금계산서'], '200만 · 현금영수증': [2000000, '현금영수증'], '220만 · 세금계산서': [2200000, '세금계산서'] };

export const taxAmt = (fee, tax) => { const a = (Number(fee) || 0) * 10000; return tax === '3.3%' ? -Math.floor(a * 0.033 / 10) * 10 : tax === '부가세' ? Math.round(a * 0.1) : 0; };
export const finAmt = (fee, tax) => (Number(fee) || 0) * 10000 + taxAmt(fee, tax);

// 구분: 신규입주 = 퇴거>신규 · 계약완료는 바로 전 상태로 (전세연장 → 전세>분양, 퇴거 · 공실 → 퇴거>분양, 그 밖 → 분양전환)
export function kindOf(status, from) {
  if (status === '신규입주') return '퇴거>신규';
  if (from === '전세연장') return '전세>분양';
  if (['퇴거확정', '퇴거확정(매물동의)', '공실'].includes(from)) return '퇴거>분양';
  return '분양전환';
}

const fee = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; };
// 호실 한 줄 고치기 값 검사 → { fee, tax, memo, excluded } 중 보낸 것만. 틀리면 null
export function cleanItem(b) {
  if (!b || typeof b !== 'object') return null;
  const o = {};
  if ('fee' in b) { if (b.fee === '' || b.fee == null) o.fee = null; else { o.fee = fee(b.fee); if (o.fee == null) return null; } }
  if ('tax' in b) { if (!TAXES.includes(b.tax)) return null; o.tax = b.tax; }
  if ('memo' in b) o.memo = String(b.memo || '').trim().slice(0, 200) || null;
  if ('excluded' in b) o.excluded = b.excluded ? 1 : 0;
  return o;
}

// 청구서 한 장 합계
export function totals(rows) {
  const on = rows.filter(r => !r.excluded && r.fee != null);
  const total = on.reduce((s, r) => s + r.fee * 10000, 0);
  const wh = on.filter(r => r.tax === '3.3%').reduce((s, r) => s + taxAmt(r.fee, r.tax), 0);
  const vat = on.filter(r => r.tax === '부가세').reduce((s, r) => s + taxAmt(r.fee, r.tax), 0);
  const byFee = {}; on.forEach(r => { (byFee[r.fee] = byFee[r.fee] || []).push(r.unit); });
  return { n: on.length, total, wh, vat, fin: total + wh + vat, byFee, unset: rows.filter(r => !r.excluded && r.fee == null).length };
}

// MGM: 확정된 신규고객 카드 → 부동산별
export function mgmGroups(cards) {
  const g = {};
  cards.filter(c => c.mgmFixed && c.mgmAgency && MGM_FEES[c.mgmFee]).forEach(c => {
    const a = (g[c.mgmAgency] = g[c.mgmAgency] || { agency: c.mgmAgency, brokers: [], rows: [] });
    if (c.mgmBroker && !a.brokers.includes(c.mgmBroker)) a.brokers.push(c.mgmBroker);
    a.rows.push({ id: c.id, unit: c.contractUnit || '', name: c.name || '', amt: MGM_FEES[c.mgmFee][0], proof: MGM_FEES[c.mgmFee][1], fixed: c.mgmFixed });
  });
  return Object.values(g).map(a => Object.assign(a, { total: a.rows.reduce((s, r) => s + r.amt, 0) })).sort((x, y) => y.total - x.total || x.agency.localeCompare(y.agency));
}
