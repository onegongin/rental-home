// 공지사항 규칙 (시안 r77 확정 2026-11-25) — DB를 모르는 순수 함수
//   분류: 업무 · 교육 · 일정 = 대표 · 관리자만 씀 / 요청 · 기타 = 모든 직원 (열람 제외)
//   [확인했습니다] · 확인한 직원 · 접속 알림 창 = 업무 · 일정 · 요청만 (교육 · 기타 = NEW 표시만)
//   요청 글 = 바로 답변 (누구나) · 대표 · 관리자가 답하며 '답변 완료'
//   확인한 직원 목록 · 확인 수 = 대표 · 관리자만 봄 · 필독 고정 · 알림 창은 대표 · 관리자만 고름 · 첨부 = 사진 · PDF 3개
export const CATS = ['업무', '요청', '교육', '일정', '기타'];
export const BOSS_CATS = ['업무', '교육', '일정'];
export const ACK_CATS = ['업무', '일정', '요청'];
export const ST = ['답변 대기', '답변 완료'];
export const MAX_FILES = 3;

export const isBoss = role => role === '대표' || role === '관리자';
export const canWrite = (role, cat) => CATS.includes(cat) && role !== '열람' && (!BOSS_CATS.includes(cat) || isBoss(role));
export const ackOn = cat => ACK_CATS.includes(cat);

const s = (v, n) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n);

export function cleanFiles(f) {
  if (!Array.isArray(f)) return [];
  return f.filter(x => x && /^[a-z0-9]{8,40}$/.test(String(x.id))).slice(0, MAX_FILES)
    .map(x => ({ id: String(x.id), name: s(x.name, 150) || '파일', img: x.img ? 1 : 0 }));
}

// 새 글 · 고친 글 → 저장할 칸. 틀리면 { err }
export function cleanNotice(b, role, isNew) {
  if (!b || typeof b !== 'object') return { err: 'input' };
  const o = {}, boss = isBoss(role);
  if (isNew || 'cat' in b) { if (!CATS.includes(b.cat)) return { err: 'cat' }; if (!canWrite(role, b.cat)) return { err: 'perm' }; o.cat = b.cat; }
  if (isNew || 'title' in b) { o.title = s(b.title, 100); if (!o.title) return { err: 'title' }; }
  if (isNew || 'body' in b) { o.body = s(b.body, 5000); if (!o.body) return { err: 'body' }; }
  if ('files' in b) o.files = JSON.stringify(cleanFiles(b.files));
  if (boss && 'pin' in b) o.pin = b.pin ? 1 : 0;
  if (boss && 'popup' in b) o.popup = b.popup ? 1 : 0;
  return o;
}

// 목록 정렬: 필독 먼저 → 최신
export const sortNotices = rows => rows.sort((a, b) => ((b.pin || 0) - (a.pin || 0)) || (b.at || 0) - (a.at || 0));

// 내가 아직 볼 것: 확인 안 한 업무 · 일정 · 요청(남이 쓴 것) + 내 요청에 내가 본 뒤 달린 남의 답변
export function todo(n, me, rd, replies) {
  const r = rd || {};
  if (n.author !== me && ackOn(n.cat) && !r.ack_at) return true;
  if (n.author === me && n.cat === '요청') return (replies || []).some(x => x.who !== me && x.at > (r.seen_at || 0));
  return false;
}

// 접속 알림 창: 알림 창 켠 업무 · 일정 · 요청 중 내가 확인 안 한 것
export const popOf = (n, me, rd) => !!n.popup && ackOn(n.cat) && n.author !== me && !(rd && rd.ack_at);
