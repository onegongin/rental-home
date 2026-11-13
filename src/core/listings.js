// 매물 규칙 (설계서 10장 · 부록 A) — DB를 모르는 순수 함수만 (테스트하기 쉽게)
//   상태 9단계 · 공개 가능 여부 · 필수 항목 검사 · 호실 가림(동 + 층구간) · 연락 표시 · 공개용 사본 한 줄
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { UNIT, UNITS } from './units.js';
import OPTS from '../../public/daelasoo/data/options.json' with { type: 'json' };

export const ST = ['접수', '확인중', '광고중', '협의중', '가계약', '계약', '잔금완료', '보류', '철회'];
export const ACTIVE = ['접수', '확인중', '광고중', '협의중', '가계약', '계약'];
export const PUB_OK = ['광고중', '협의중', '가계약'];               // 공개 유지 가능 (가계약은 '계약 진행중' 배지, 17.0 #4)
export const OFF = ['계약', '잔금완료', '보류', '철회'];             // 바뀌는 순간 즉시 비공개
export const DONE = ['계약', '잔금완료'];                          // '최근 거래완료' 칸 (30일, 날짜 · 가격 없이)
export const DONE_DAYS = 30;
export const DEALS = { sale: '매매', jeonse: '전세', wolse: '월세', short: '단기' };
export const FACING = ['남', '남동', '남서', '동', '서', '북동', '북서', '북'];   // 매물마다 선택 (단지정보 2026-10-25)
export const BASIS = ['거실', '안방'];
export const MGMT = ['일반관리비', '수도', '전기', '가스', '난방', '인터넷', 'TV'];
// 관리비를 확인할 수 없을 때 금액 대신 붙는 안내 (공개 화면에도 그대로)
export const MGMT_NA = '미등기건물 · 신축건물 등 관리비 내역 확인 불가';
// 직원 자격 (설정 › 담당자에서 지정, 2026-11-02 대표 확정): 공인중개사만 공개 매물에 이름 표시
export const LICENSES = ['공인중개사', '중개보조원'];

// 동별 최고층 (호실 목록에서)
export const TOP = {};
UNITS.forEach(u => { TOP[u.dong] = Math.max(TOP[u.dong] || 0, u.floor); });

// 층구간: 그 동 최고층을 3등분, 1~2층은 저층 (10.5)
export function band(floor, top) {
  if (!floor || !top) return '';
  const c = Math.ceil(top / 3);
  return floor <= 2 || floor <= c ? '저층' : floor <= c * 2 ? '중층' : '고층';
}
// '103동 고층/34층' — 호수는 절대 넣지 않음
export const label = unit => unit.dong + '동 ' + band(unit.floor, TOP[unit.dong]) + '/' + TOP[unit.dong] + '층';

// 공개 매물 설정 기본값 — 자료에서 미리 채워 두고 대표가 [확인]해야 공개에 쓰임 (2026-11-02 대표 요청)
//   주차: site.json site.parking(모집공고) · 방 · 욕실: 타입별 평면 안내도(소스/평면/안내_*, 기본형) → site.json types · 사용승인일: site.approvalNote
const S0 = SITE.site || {};
export const CFG0 = {
  approval: S0.approvalNote || '',
  parking: Object.fromEntries((S0.parking || []).map(p => [p.block, '공동주택 ' + p.apt + '대 (세대당 약 ' + p.perUnit + '대)'])),
  rooms: Object.fromEntries(Object.entries(SITE.types || {}).filter(([, t]) => t.rooms > 0).map(([k, t]) => [k, [t.rooms, t.baths]]))
};
export const CFG_OK = ['approval', 'parking', 'rooms'];   // 확인 받는 묶음
export function cfgOf(v) {
  v = v && typeof v === 'object' ? v : {};
  const ok = {}; CFG_OK.forEach(k => { ok[k] = !!(v.ok && v.ok[k]); });
  return { approval: String(v.approval ?? CFG0.approval), parking: Object.assign({}, CFG0.parking, v.parking || {}), rooms: Object.assign({}, CFG0.rooms, v.rooms || {}), ok };
}

// 향 기본값 (단지배치도 기준, 북쪽이 위): 1 · 2라인 84B · 202동 84D · 102동 79 · 펜트 148 · 218은 남향.
//   84A · 84C(3 · 4라인) · 204동 69 는 배치도로 판단이 어려워 비워 둠. 자동으로 넣은 향은 매물 창에서 [맞음]을 눌러야 공개됨
export const FACE0 = S0.face0 || {};   // site.json site.face0
export const faceOf = type => FACE0[type] ? { facing: FACE0[type], basis: '거실', facing_auto: 1 } : {};
export const OFFICE = SITE.office || {};

const blank = v => v == null || String(v).trim() === '';
const typeOf = t => (SITE.types || {})[t] || {};
export function areaOf(unit) {
  const b = (typeOf(unit.type).byBlock || {})[unit.block] || {};
  return { exclusive: b.exclusive || null, supply: b.supply || null };
}

// 필수 항목 (부록 A) → [{ k, label }]. k 가 있으면 매물 창에서, 없으면 공개 설정에서 채움
export function missing(l, cfg) {
  const u = UNIT[l.unit_id] || {}, m = [], need = (ok, k, lab) => { if (!ok) m.push({ k, label: lab }); };
  need(!blank(OFFICE.name) && !blank(OFFICE.address) && !blank(OFFICE.tel) && !blank(OFFICE.regNo) && !blank(OFFICE.ceo), '', '사무소 표시 (사이트 자료)');
  need(!blank(cfg.approval) && cfg.ok.approval, '', '사용승인일 확인 (공개 설정)');
  need(!blank(cfg.parking[u.block]) && cfg.ok.parking, '', '주차대수 확인 (공개 설정)');
  const r = cfg.rooms[u.type];
  need(Array.isArray(r) && r[0] > 0 && r[1] > 0 && cfg.ok.rooms, '', '방 · 욕실 수 확인 (공개 설정)');
  need(!!areaOf(u).exclusive, '', '전용면적 (사이트 자료)');
  if (l.deal === 'sale') need(l.ask > 0, 'ask', '매매가');
  else need(l.dep > 0, 'dep', '보증금');
  if (l.deal === 'wolse' || l.deal === 'short') need(l.rent > 0, 'rent', '월세');
  need(!blank(l.move), 'move', '입주 가능일');
  need(!!l.mgmt_na || (l.mgmt != null && l.mgmt !== ''), 'mgmt', '관리비');   // 금액 또는 '확인 불가'
  need(FACING.includes(l.facing), 'facing', '향');
  need(!(FACING.includes(l.facing) && l.facing_auto), 'facing', '향 확인 (배치도 기준 자동)');
  need(BASIS.includes(l.basis), 'basis', '향 기준');
  return m;
}

// 상태가 바뀐 뒤 공개 상태: 끝난 상태 · 접수/확인중이면 끔, 공개 요청은 끝난 상태에서만 취소
export function pubAfter(st, pub) {
  if (pub === 'on') return PUB_OK.includes(st) ? 'on' : 'off';
  if (pub === 'req') return OFF.includes(st) ? 'off' : 'req';
  return 'off';
}

// 연락 표시 (10.4): 담당 자격이 '공인중개사'일 때만 이름, 그 밖(중개보조원 · 미지정 · 관심등록 출처)은 모두 사무소명. 전화는 항상 대표번호
export function contactOf(l, staff) {
  const named = l.source === 'card' && !!staff && !!staff.active && staff.license === '공인중개사';
  return { contact: named ? '담당 ' + staff.name + ' · ' + OFFICE.name : OFFICE.name, tel: OFFICE.tel || '' };
}

// 세대 옵션 요약 (상담카드 › 소유자 옵션 = 세대 자료 sel · expand) — 공개 카드엔 '확장' + 유상옵션 이름만 (금액 없음)
//   PH(펜트하우스)는 기본 확장, 그 밖은 expand === false 일 때만 비확장 (화면 optCalc 와 같게)
export function optSummary(type, data) {
  const d = data || {}, t = (SITE.types || {})[type] || {}, sel = (d.sel && d.sel.paid) || {};
  const exp = t.ph ? true : d.expand !== false;
  const items = (OPTS.paid || []).filter(it => { const x = sel[it.id]; return x && (it.variants || []).some(v => v.k === x.v && v.t && v.t[type]); }).map(it => it.name);
  return { exp, items: exp ? items : [] };
}
// 공개용 기타 내용: 전화번호 모양은 가림 (개인정보 실수 방지)
export const pubMemo = s => String(s || '').replace(/(01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g, m => m.slice(0, 3) + '-****-****').trim().slice(0, 200);

// 공개용 사본 한 줄. 공개할 수 없으면 null — 사람 정보 · 호수 칸은 아예 없음
//   unitData: 그 세대 자료(옵션) — 없으면 옵션 줄 없음
export function publicRow(l, cfg, staff, now, unitData) {
  if (l.pub !== 'on' || !PUB_OK.includes(l.status) || l.deleted_at || missing(l, cfg).length) return null;
  const u = UNIT[l.unit_id], t = typeOf(u.type), a = areaOf(u), r = cfg.rooms[u.type];
  return Object.assign({
    id: l.id, deal: l.deal, dong: u.dong, block: u.block, label: label(u), band: band(u.floor, TOP[u.dong]), type: u.type, kind: t.kind || '',
    exclusive: a.exclusive, supply: a.supply, ask: l.deal === 'sale' ? l.ask : null, dep: l.deal === 'sale' ? null : l.dep,
    rent: l.deal === 'wolse' || l.deal === 'short' ? l.rent : null, term: l.deal === 'short' ? l.term || '' : '',
    move: l.move, mgmt: l.mgmt_na ? null : l.mgmt, mgmt_na: l.mgmt_na ? 1 : 0, mgmt_items: l.mgmt_na ? '[]' : l.mgmt_items || '[]', facing: l.facing, basis: l.basis, rooms: r[0], baths: r[1],
    approval: cfg.approval, parking: cfg.parking[u.block], urgent: l.urgent ? 1 : 0, badge: l.status === '가계약' ? '계약 진행중' : '',
    memo: pubMemo(l.memo_pub) || null, opts: l.opt_show === 0 || unitData == null ? null : JSON.stringify(optSummary(u.type, unitData)),
    at: l.pub_at || now, updated: now
  }, contactOf(l, staff));
}

// 최근 거래완료 사본 한 줄 (계약 · 잔금완료 · 표시 안 함 아님) — 가격 · 동 · 층 · 날짜는 화면에 안 보냄 (부당 표시·광고 방지, 시안 listing-done B안)
export function doneRow(l) {
  if (!DONE.includes(l.status) || l.done_hide || l.deleted_at || !l.done_at) return null;
  const u = UNIT[l.unit_id]; if (!u) return null;
  const t = typeOf(u.type);
  return { id: l.id, deal: l.deal, type: u.type, block: u.block, kind: t.kind || '', exclusive: areaOf(u).exclusive, done_at: l.done_at };
}

// 상담카드 '입주 후 거래' 칸 → 매물 조건 (R1). 숫자 칸은 만원
const num = v => { const n = Number(String(v ?? '').replace(/[^\d]/g, '')); return n > 0 ? n : null; };
export function termsOf(deal, t) {
  t = t || {};
  if (deal === 'sale') return { ask: num(t.ask), adj: num(t.adj), move: String(t.move || '').slice(0, 30) };
  if (deal === 'jeonse') return { dep: num(t.dep), move: String(t.move || '').slice(0, 30) };
  return { dep: num(t.dep), rent: num(t.rent), move: String(t.move || '').slice(0, 30), term: deal === 'short' ? String(t.term || '').slice(0, 30) : '' };
}
