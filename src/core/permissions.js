// 역할 · 권한 판단 (설계서 6장). 서버의 모든 권한 검사는 can() 하나로
export const ROLES = ['대표', '관리자', '권한자', '직원', '열람'];
const TOP = new Set(['대표', '관리자', '권한자']);

// 설정 화면의 역할별 체크표(cfg.perms) 기본값 — 화면 기본값과 같게. 대표 · 권한자는 '관리자' 칸을 따른다
const DEFAULT_PERMS = { create: { 관리자: true, 직원: true, 열람: false }, edit: { 관리자: true, 직원: false, 열람: false }, excel: { 관리자: true, 직원: false, 열람: false }, broker: { 관리자: true, 직원: false, 열람: false }, media: { 관리자: true, 직원: false, 열람: false }, inflow: { 관리자: true, 직원: false, 열람: false } };
export function perm(perms, role, k) {
  const r = TOP.has(role) ? '관리자' : role;
  const row = (perms && perms[k]) || DEFAULT_PERMS[k] || {};
  return !!row[r];
}

// 직원이 바꿀 수 있는 설정 → 필요한 체크표 칸
const STAFF_CFG = { brokers: 'broker', media: 'media', inflow: 'inflow', impLog: 'excel' };

const mine = (u, item) => !!item && (item.writer === u.name || item.mgr === u.name);
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const grantOk = (item, need) => { const g = item && item.grant; return !!g && (!g.until || g.until >= kstDay()) && (!need || g.perm === need); };

export function can(u, action, item, perms) {
  if (!u || !ROLES.includes(u.role)) return false;
  const top = TOP.has(u.role), staff = u.role === '직원';
  switch (action) {
    case 'card.raw': return top || (staff && mine(u, item));            // 고객 이름 · 연락처 원문
    case 'card.create': return u.role !== '열람';
    case 'card.edit': return top || (staff && mine(u, item));
    case 'popup.manage': return u.role === '대표' || u.role === '관리자';   // 팝업 만들기 · 고치기 · 지우기 · 파일 올리기
    case 'card.delete': return u.role === '대표' || u.role === '관리자';    // 상담이력 삭제 · 되살리기 (사유 필수, 시안 log-delete A안 2026-11-04)
    case 'unit.raw': return top;                                         // 소유자 연락처 (담당 구분은 P3 정식 표에서)
    case 'unit.edit': return top || (staff && (perm(perms, '직원', 'create') || perm(perms, '직원', 'edit')));
    case 'unit.delete': return top;
    case 'unit.import': return top || (staff && perm(perms, '직원', 'excel'));   // 엑셀 가져오기 (설정 체크표 '엑셀')
    case 'tenancy.edit': return top || (staff && perm(perms, '직원', 'edit'));  // 지난 임대차 고치기
    case 'cfg.read': return item !== 'pins' && ((item !== 'sync' && item !== 'notify') || top);
    case 'cfg.write':
      if (item === 'roles' || item === 'pins' || item === 'licenses' || item === 'notify' || item === 'restoreAt') return false;   // 직원 명단 · 자격은 /api/admin/staff, 알림 설정은 /api/admin/notify, 복구 표시는 서버만
      if (item === 'perms') return u.role === '대표';
      if (item === 'popups' || item === 'popKeep') return can(u, 'popup.manage');
      return top || (staff && !!STAFF_CFG[item] && perm(perms, '직원', STAFF_CFG[item]));
    case 'staff.manage': return u.role === '대표';
    case 'staff.list': return top;
    case 'cmt.reply': return u.role !== '열람';                        // 게스트 댓글에 사무소 이름으로 답글
    case 'cmt.manage': return top;                                       // 숨김 · 복구 · 승인 · 삭제 · 고친 기록 보기
    case 'audit.read': return u.role === '대표' || u.role === '관리자';
    case 'notify.admin': return u.role === '대표' || u.role === '관리자';   // 설정 › 알림 (그룹방 · 조용한 시간 · 발송기록)
    // 엑셀 내보내기 · 백업 (설계서 13 · 14장, 17.0 #8: 권한자 제외)
    case 'export': return u.role === '대표' || u.role === '관리자';
    case 'backup.list': return u.role === '대표' || u.role === '관리자';  // 백업 목록 · [지금 백업]
    case 'backup.full': return u.role === '대표';                          // 전체 백업 받기 · 복구
    // 매물 (설계서 6.2 · 6.3 · 17.0 #6). item = 매물 줄 + grant(이 직원이 받은 공유, 만료일 지나면 없음)
    case 'listing.edit': return top || (staff && (mine(u, item) || grantOk(item, 'edit')));
    case 'listing.raw': return top || (staff && (mine(u, item) || grantOk(item)));   // 소유자 연락처 원문
    case 'listing.request': return staff && (mine(u, item) || grantOk(item, 'edit')); // 직원은 공개 '요청'만
    case 'listing.publish': return top;                                               // 공개 켜기 · 승인 · 반려
    case 'listing.share': return top || (staff && mine(u, item));                     // 공유 · 담당 바꾸기 (본인 매물만)
    case 'listing.cfg': return top;                                                   // 공개 설정 (사용승인일 · 주차 · 방/욕실)
    // R2 세대 전환 상태 · 공개 세대 (시안 r2-public-pick 2026-11-13): 상태 고치기는 세대 고치기와 같은 권한, 공개는 관리자급만
    case 'conv.edit': return top || (staff && (perm(perms, '직원', 'create') || perm(perms, '직원', 'edit')));
    case 'unit.publish': return top;
    case 'report.use': return top;
    case 'claim.use': return u.role === '대표' || u.role === '관리자';   // R3-3 수수료 청구서 · MGM 확정 (돈 — 권한자 제외)
    case 'claim.unlock': return u.role === '대표';                         // 잠근 청구서 풀기   // R3-2 일일업무보고 보기 · 저장 (기존 사이트: 관리자 · 권한자)
  }
  return false;
}
