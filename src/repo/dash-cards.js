// 상담카드(대시보드 '상담카드' 탭, kv 'c') → KPI · 일일업무보고 · 청구서가 쓰던 모양 (2026-11-17 대표 결정: '분양전환상담' 카드 삭제, 상담카드로 하나로)
//   손님 = 연락처(없으면 카드 번호)로 묶음 · 한 손님의 가장 최근 카드 = 그 손님 상태 · 카드 한 장 = 상담 한 번(이력 한 줄)
//   구분: 임차인(seller) = tenant · 신규분양 매수(client) · 전세 희망(buyer) = new · 개인 소유자(owner) = owner
//   계약관리(ct) · 방문(vis) 값만 꺼내고, 이름 말고 연락처 · 메모 같은 개인정보는 넘기지 않음 (가리기는 각 API)
import { parse } from './kv.js';

const dg = v => String(v || '').replace(/\D/g, '');
const KIND = { seller: 'tenant', client: 'new', buyer: 'new', owner: 'owner' };
const dayOf = c => String(c.at || '').slice(0, 10);

export async function dashCards(db) {
  const r = (await db.prepare("SELECT k, v FROM kv WHERE s = 'c' AND v IS NOT NULL AND v <> 'null'").all()).results || [];
  return r.map(x => Object.assign({ id: x.k }, parse(x.v) || {})).filter(c => !c.deleted && KIND[c.kind]);
}

// cards → { consults: [손님 한 명 = 한 줄], logs: [카드 한 장 = 한 줄] }
export function asConsults(cards) {
  const g = {};
  cards.forEach(c => { const k = dg(c.phone) || c.id; (g[k] = g[k] || []).push(c); });
  const consults = [], logs = [];
  Object.values(g).forEach(list => {
    list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    const last = list[list.length - 1], ct = [...list].reverse().find(c => c.ct) || {}, vs = [...list].reverse().find(c => c.vis) || {}, kind = KIND[last.kind];
    const C = ct.ct || {}, V = vs.vis || {}, guestVisit = !V.on && last.guest && last.visit ? String(last.visit).slice(0, 16) : null;
    const id = last.id;
    consults.push({ id, kind, unit_id: kind === 'tenant' || kind === 'owner' ? (last.unit || null) : null, name: last.name || '', mgr: C.staff || last.mgr || '', writer: last.writer || '', at: last.at || '',
      progress: C.prog || '', book: V.on && V.date ? V.date + ' ' + (V.time || '') : guestVisit, contractUnit: C.unit || null, intUnits: (V.units || []).map(u => u.unit).filter(Boolean), ctype: (last.inflow || [])[0] || '',
      mgmAgency: C.intro === 'MGM' ? (C.bk || null) : null, mgmBroker: null, mgmFee: C.intro === 'MGM' ? (C.mgmFee || null) : null, mgmFixed: C.intro === 'MGM' && C.fixed ? { by: C.fixed.by, at: Date.parse(String(C.fixed.at || '').replace(' ', 'T') + ':00+09:00') || null } : null });
    list.forEach(c => { if (c.guest) return; logs.push({ consult_id: id, date: dayOf(c), at: Date.parse(String(c.at || '').replace(' ', 'T') + ':00+09:00') || 0, channel: (c.inflow || []).includes('방문') ? '방문상담' : '전화'   /* 유입경로 '방문' = 방문상담 (예약만 한 날은 아님) */, memo: '', kind, unit_id: kind === 'tenant' ? (c.unit || null) : null, mgr: (c.ct && c.ct.staff) || c.mgr || '' }); });
  });
  return { consults, logs };
}
