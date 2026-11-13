// 기존 자료 옮기기 — 고객DB (R4, 시안 preview/r4-migrate 확정 2026-11-13) — DB를 모르는 순수 함수
//   기존 대라수 사이트 고객DB 엑셀(고객DB_양식.xlsx) 한 줄 = 한 세대 → 전환상태 · 퇴거일 + 임차인 상담카드(성명 · 연락처 · 생년월일 · 담당 = 팀)
//   대표 결정: 300세대 모두 임차인 카드 · 팀 = 담당자('2팀') · 계약완료는 날짜 없이(일일보고 '이전', 청구 대상 아님)
//   화면이 엑셀을 읽어 { dong, ho, team, type, name, birth, phone, moveOut, status } 줄로 보냄 (파일은 안 올라옴)
import { UNIT } from './units.js';
import { CONV } from './conv.js';

// 기존 사이트 전환여부 별칭 (참고 사이트 ST_ALIAS)
const ALIAS = { 퇴거: '퇴거확정', 퇴거예정: '퇴거확정', 퇴거매물동의: '퇴거확정(매물동의)', 퇴거확정매물동의: '퇴거확정(매물동의)', 매물동의: '퇴거확정(매물동의)', 미전환: '상담중', '미전환(매물동의)': '퇴거확정(매물동의)', 계약중: '계약중', 상담: '상담중', 계약: '계약완료', 분양전환: '계약완료', 전세: '전세연장', 부재: '장기부재' };
// 전환상태 → 임차인 카드 진행상태
const PROG = { 상담중: '상담중', 장기부재: '상담중', 호실변경: '상담중', 전세연장: '전세연장', 가계약: '가계약', 계약중: '계약중', 신규입주: '계약완료', 계약완료: '계약완료', 퇴거확정: '퇴거', '퇴거확정(매물동의)': '퇴거', 공실: '퇴거' };

const s = v => String(v == null ? '' : v).trim();
export function normStatus(v) {
  const t = s(v).replace(/\s+/g, '');
  if (!t) return null;
  return CONV.includes(t) ? t : ALIAS[t] || undefined;
}
export function normPhone(v) {
  let d = s(v).replace(/\D/g, '');
  if (/^1\d{8,9}$/.test(d)) d = '0' + d;            // 엑셀이 앞자리 0 을 지운 번호
  if (!/^01\d{8,9}$/.test(d)) return s(v) ? undefined : null;
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}
export function normDay(v) {
  const t = s(v);
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t) && +t > 20000 && +t < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(+t) * 864e5).toISOString().slice(0, 10);   // 엑셀 날짜 숫자
  const m = t.replace(/[./]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : undefined;
}

// 줄 검사 → { rows: [{ unit, team, name, birth, phone, moveOut, status, prog }], errors: [{ line, unit, msg }], warns: [...] }
export function readRows(list) {
  const rows = [], errors = [], warns = [], seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, 2000).forEach((r, i) => {
    const line = i + 2, unit = s(r.dong) + '-' + Number(s(r.ho).replace(/\D/g, ''));
    if (!UNIT[unit]) return errors.push({ line, unit, msg: '사이트에 없는 호실' });
    if (seen.has(unit)) return errors.push({ line, unit, msg: '같은 호실이 두 번' });
    seen.add(unit);
    const status = normStatus(r.status);
    if (status === undefined) return errors.push({ line, unit, msg: '전환여부를 알 수 없음 (' + s(r.status) + ')' });
    const phone = normPhone(r.phone), moveOut = normDay(r.moveOut);
    if (phone === undefined) warns.push({ line, unit, msg: '연락처 자릿수 이상 — 비워서 넣음' });
    if (moveOut === undefined) warns.push({ line, unit, msg: '퇴거일 형식 이상 — 비워서 넣음' });
    if (s(r.type) && s(r.type) !== UNIT[unit].type) warns.push({ line, unit, msg: '타입이 사이트(' + UNIT[unit].type + ')와 다름 (' + s(r.type) + ')' });
    const t = s(r.team).replace(/팀$/, '');
    rows.push({ unit, team: t ? t + '팀' : null, name: s(r.name).slice(0, 30) || null, birth: s(r.birth).slice(0, 20) || null, phone: phone || null, moveOut: moveOut || null, status, prog: status ? PROG[status] : null });
  });
  const by = {}; rows.forEach(r => { const k = r.status || '(비어 있음)'; by[k] = (by[k] || 0) + 1; });
  return { rows, errors, warns, byStatus: by };
}
