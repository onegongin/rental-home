// 직원 소통 3종 규칙 (R3-4, 시안 preview/r3-board 확정 2026-11-13) — DB를 모르는 순수 함수
//   note = 상담참고 · 지시사항 (누구나 쓰고, 쓴 사람 · 관리자가 고침, 중요 = 맨 위 고정)
//   req  = 요청함 (직원은 본인 요청만 봄, 관리자가 처리 결과를 적고 처리완료)
//   fb   = 사용 불편사항 (모두 봄, 관리자가 상태 · 답변)
export const KINDS = ['note', 'req', 'fb'];
export const DEPTS = ['분양팀', '1팀', '2팀', '관리', '기타'];
export const REQ_KINDS = ['일반 요청', '담당자 변경', '성명 · 연락처 수정'];
export const ST = { req: ['대기', '처리완료'], fb: ['접수', '확인중', '반영완료', '보류'] };
export const ST0 = { req: '대기', fb: '접수', note: null };

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// 새 글 · 고친 글 → 저장할 칸. 틀리면 { err }
export function cleanPost(kind, b, isNew) {
  if (!KINDS.includes(kind) || !b || typeof b !== 'object') return { err: 'kind' };
  const o = {};
  if (isNew || 'body' in b) { o.body = s(b.body, 3000); if (!o.body) return { err: 'body' }; }
  if (kind === 'note') {
    if ('dept' in b) { o.dept = s(b.dept, 20) || null; if (o.dept && !DEPTS.includes(o.dept)) return { err: 'dept' }; }
    if ('pin' in b) o.pin = b.pin ? 1 : 0;
  }
  if (kind === 'req' && (isNew || 'rkind' in b)) { o.rkind = REQ_KINDS.includes(b.rkind) ? b.rkind : REQ_KINDS[0]; }
  if (kind === 'fb' && 'rkind' in b) o.rkind = s(b.rkind, 40) || null;   // 화면 · 메뉴
  if (kind === 'req' && 'ref' in b) o.ref = s(b.ref, 40) || null;        // 관련 호실 · 카드
  return o;
}

// 목록 정렬: note = 중요 먼저 → 최신 · req = 대기 먼저 → 최신 · fb = 최신
export function sortPosts(kind, rows) {
  const t = r => -(r.at || 0);
  if (kind === 'note') return rows.sort((a, b) => (b.pin - a.pin) || t(a) - t(b));
  if (kind === 'req') return rows.sort((a, b) => ((a.status === '대기' ? 0 : 1) - (b.status === '대기' ? 0 : 1)) || t(a) - t(b));
  return rows.sort((a, b) => t(a) - t(b));
}
