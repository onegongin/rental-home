// 상담카드 2종 규칙 (R2, 시안 preview/r2-consult-card 확정 2026-11-13) — DB를 모르는 순수 함수만
//   tenant = 기존 임차인(분양전환, 세대 하나에 카드 하나) · new = 신규고객. 칸은 기존 대라수 사이트 popFields 그대로
//   진행상태를 바꾸면 세대 전환 상태도 자동으로 (대표 결정): 임차인 → 그 세대 · 신규고객 → 계약할 호실 (계약완료 = 신규입주)
import { UNIT } from './units.js';
import { MGM_FEES } from './claim.js';

export const KINDS = ['tenant', 'new'];
export const PROG = {
  tenant: ['상담중', '가계약', '계약중', '계약완료', '전세연장', '퇴거'],
  new: ['상담중', '가계약', '계약중', '계약완료', '종료']
};
export const PROBS = ['1.합의서 작성', '2.미동의 작성', '3.부재', '4.통화거부(장기부재)', '5.고민(긍정)', '6.고민(부정)', '7.동의예정(서류미비)', '8.미동의예정(퇴거)', '9.전세연장'];
export const CHANNELS = ['유선상담', '방문상담', '문자 · 카톡'];
export const DOCS = ['합의서', '서류제출', '매물동의서'];
export const SEL = {
  ctype_tenant: ['임차인 본인', '배우자', '가족', '대리인'],
  ctype_new: ['실거주', '투자', '가족 대신'],
  visitCoop: ['협조 확인 전', '협조 가능', '협조 불가', '일정 조율 중'],
  fundType: ['자기자금', '주담대 활용', '전세 활용', '가족 지원', '미정'],
  inflow: ['방문', '유선', '부동산', '지인', '관심등록', '기타'],
  mgmFee: Object.keys(MGM_FEES)   // R3-3 MGM 금액 (기존 사이트 FEES)
};

// 칸 → 종류 (money = 원 단위 정수 · date = YYYY-MM-DD · unit = 호실 · units = 호실 여러 개 · sel:이름 · text:길이)
const F_COMMON = { date: 'date', fundType: 'sel:fundType', price: 'money', deposit: 'money', own: 'money', loan: 'money', family: 'text:200', book: 'text:20', memo: 'text:3000' };
export const FIELDS = {
  tenant: Object.assign({ ctype: 'sel:ctype_tenant', moveOut: 'date', visitCoop: 'sel:visitCoop', visitTime: 'text:100', moveMemo: 'text:300' }, F_COMMON),
  new: Object.assign({ ctype: 'sel:ctype_new', birth: 'text:20', inflow: 'sel:inflow', inflowAgencyName: 'text:60', inflowBroker: 'text:30', inflowAgencyTel: 'text:20', inflowCall: 'text:100', inflowFriend: 'text:60', inflowEtc: 'text:100', interest: 'text:200', intUnits: 'units', visitNotes: 'text:2000', depDue: 'date', contractUnit: 'unit', mgmAgency: 'text:60', mgmBroker: 'text:30', mgmFee: 'sel:mgmFee' }, F_COMMON)
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const unitId = s => { const m = String(s || '').trim().match(/^(\d{3})\s*[-동 ]\s*(\d{3,4})호?$/); const id = m ? m[1] + '-' + Number(m[2]) : ''; return UNIT[id] ? id : null; };
export { unitId };

// 칸 하나 검사 → 저장할 값 (빈칸 = null). 틀리면 undefined
function cleanOne(t, v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (t === 'money') { const n = Number(s.replace(/[^\d]/g, '')); return Number.isFinite(n) && n <= 1e11 ? n : undefined; }
  if (t === 'date') return DATE.test(s) ? s : undefined;
  if (t === 'unit') return unitId(s) || undefined;
  if (t === 'units') { const a = s.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).map(unitId); return a.every(Boolean) ? [...new Set(a)].slice(0, 20) : undefined; }
  if (t.startsWith('sel:')) return SEL[t.slice(4)].includes(s) ? s : undefined;
  if (t.startsWith('text:')) return s.slice(0, Number(t.slice(5)));
  return undefined;
}

// 화면이 보낸 카드 → { name, phone, progress, mgr, data } 중 보낸 칸만. 틀린 칸이 있으면 { err: 칸이름 }
export function cleanCard(kind, b) {
  if (!KINDS.includes(kind) || !b || typeof b !== 'object') return { err: 'kind' };
  const out = {}, data = {}, F = FIELDS[kind];
  if ('name' in b) out.name = String(b.name || '').trim().slice(0, 30) || null;
  if ('phone' in b) { const p = String(b.phone || '').replace(/[^\d-]/g, '').slice(0, 20); if (p && !/^0\d{8,10}$/.test(p.replace(/-/g, ''))) return { err: 'phone' }; out.phone = p || null; }
  if ('progress' in b) { if (!PROG[kind].includes(b.progress)) return { err: 'progress' }; out.progress = b.progress; }
  if ('mgr' in b) out.mgr = String(b.mgr || '').trim().slice(0, 20) || null;
  for (const k of Object.keys(F)) if (b.data && k in b.data) { const v = cleanOne(F[k], b.data[k]); if (v === undefined) return { err: k }; data[k] = v; }
  out.data = data;
  return out;
}

// 상담 기록 한 줄. 내용이 하나도 없으면 null (기록 안 남김)
export function cleanLog(l) {
  if (!l || typeof l !== 'object') return null;
  const o = {
    date: DATE.test(String(l.date || '')) ? l.date : null,
    channel: CHANNELS.includes(l.channel) ? l.channel : null,
    prob: PROBS.includes(l.prob) ? l.prob : null,
    memo: String(l.memo || '').trim().slice(0, 3000) || null,
    docs: Array.isArray(l.docs) ? DOCS.filter(d => l.docs.includes(d)) : [],
    next_date: DATE.test(String(l.next_date || '')) ? l.next_date : null
  };
  return o.memo || o.prob || o.docs.length || o.next_date ? o : null;
}

// 진행상태 → 세대 전환 상태 (대표 결정 2026-11-13). 바꿀 세대가 없거나 바꾸지 않으면 null
//   임차인 '퇴거' 는 이미 '퇴거확정(매물동의)' · '공실' 이면 그대로 둠 (더 나아간 상태를 되돌리지 않게)
const T_MAP = { 상담중: '상담중', 가계약: '가계약', 계약중: '계약중', 계약완료: '계약완료', 전세연장: '전세연장', 퇴거: '퇴거확정' };
const N_MAP = { 가계약: '가계약', 계약중: '계약중', 계약완료: '신규입주' };
export function convTarget(kind, card, curStatus) {
  const unit = kind === 'tenant' ? card.unit_id : (card.data || {}).contractUnit;
  const status = (kind === 'tenant' ? T_MAP : N_MAP)[card.progress];
  if (!unit || !status) return null;
  if (status === '퇴거확정' && (curStatus === '퇴거확정(매물동의)' || curStatus === '공실')) return null;
  if (status === curStatus) return null;
  return { unit, status };
}

// 자금계획 계산 (화면 · 엑셀 같은 규칙): 필요금액 = 분양가 − 보증금(계약금), 부족 = 필요 − 자기자금 − 대출 (음수면 여유)
export function fund(d) {
  d = d || {};
  const need = Math.max((d.price || 0) - (d.deposit || 0), 0);
  return { need, gap: need - (d.own || 0) - (d.loan || 0) };
}
