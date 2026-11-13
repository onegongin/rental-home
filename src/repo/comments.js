// 게스트 댓글 · 게스트 출입증 (설계서 7.5) — 고객 · 소유자 · 임차인 자료는 여기서 읽지 않는다
import { parse } from './kv.js';

const COLS = 'id, target, pid, author, staff, name, text, masked, broker, status, hide_by, reports, ip, at, edited, del_at, bk_claim, ack_by, ack_at, auto';
// 중개요청 확인 표시 (직원 쪽에서만 부름)
export const markClaimed = (db, id) => db.prepare('UPDATE comments SET bk_claim = ? WHERE id = ?').bind(Date.now(), id).run();

export const getGuest = (db, tok) => db.prepare('SELECT id, name, exp FROM guests WHERE tok = ?').bind(tok).first();
export const addGuest = (db, id, tok, name, exp, card) => db.prepare('INSERT INTO guests (id, tok, name, at, exp, card) VALUES (?, ?, ?, ?, ?, ?)').bind(id, tok, name, Date.now(), exp, card || null).run();
export const renewGuest = (db, id, name, exp, card) => db.prepare('UPDATE guests SET name = ?, exp = ?, card = COALESCE(?, card) WHERE id = ?').bind(name, exp, card || null, id).run();
// [확인]한 손님의 관심등록 상담카드 번호 (직원 쪽에서만 부름)
export const guestCard = async (db, gid) => { const r = await db.prepare('SELECT card FROM guests WHERE id = ?').bind(gid).first(); return (r && r.card) || ''; };
export const markAck = (db, id, who) => db.prepare('UPDATE comments SET ack_by = ?, ack_at = ? WHERE id = ? AND ack_by IS NULL').bind(who, Date.now(), id).run();

export const getComment = (db, id) => db.prepare('SELECT ' + COLS + ' FROM comments WHERE id = ?').bind(id).first();

export async function listByTarget(db, target) {
  const r = await db.prepare('SELECT ' + COLS + ' FROM comments WHERE target = ? ORDER BY at LIMIT 500').bind(target).all();
  return r.results || [];
}

// 관리 목록: wait 승인 대기 | hidden 숨김 | reported 신고 있음 | all 전체 (지운 글 빼고)
export async function listForAdmin(db, view, before, limit) {
  const where = { wait: "status = 'wait'", hidden: "status = 'hidden'", reported: 'reports > 0' }[view] || '1 = 1';
  const r = await db.prepare('SELECT ' + COLS + ' FROM comments WHERE del_at IS NULL AND ' + where + ' AND at < ? ORDER BY at DESC LIMIT ?')
    .bind(before || Number.MAX_SAFE_INTEGER, Math.min(Math.max(Number(limit) || 100, 1), 300)).all();
  return r.results || [];
}

// 직원 동호배치표 칸 표시 (시안 staff-unit-talk A안 확정 2026-11-04): 호실마다 { n: 보이는 글 수, need: 답글 필요 } — 숨긴 · 지운 글 빼고
//   답글 필요 = 승인 대기 글 + 사무소 답글이 아직 없는 손님 원글
export async function unitCounts(db) {
  const r = await db.prepare("SELECT id, target, pid, staff, status FROM comments WHERE del_at IS NULL AND status != 'hidden' AND target LIKE 'u:%' ORDER BY at DESC LIMIT 5000").all();
  const rows = r.results || [], answered = new Set(rows.filter(c => c.staff && c.pid).map(c => c.pid)), out = {};
  for (const c of rows) {
    const o = out[c.target.slice(2)] || (out[c.target.slice(2)] = { n: 0, need: 0 });
    o.n++;
    if (c.status === 'wait' || (!c.staff && !c.pid && !answered.has(c.id))) o.need++;
  }
  return out;
}

export function addComment(db, c) {
  return db.prepare('INSERT INTO comments (id, target, pid, author, staff, name, text, masked, broker, status, ip, at, auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c.id, c.target, c.pid || '', c.author || '', c.staff || '', c.name, c.text, c.masked ? 1 : 0, c.broker ? 1 : 0, c.status, c.ip || '', Date.now(), c.auto ? 1 : 0).run();
}

// 고치기 · 지우기 전에 그때 글을 기록으로 남긴다 (관리자만 봄)
const keep = (db, c, who, act) => db.prepare('INSERT INTO comment_hist (cid, at, who, act, text) VALUES (?, ?, ?, ?, ?)').bind(c.id, Date.now(), who, act, c.text);

export async function editComment(db, c, who, text, masked, status) {
  await db.batch([keep(db, c, who, '수정'),
    db.prepare('UPDATE comments SET text = ?, masked = ?, status = ?, edited = ? WHERE id = ?').bind(text, masked ? 1 : 0, status, Date.now(), c.id)]);
}

export async function deleteComment(db, c, who) {
  await db.batch([keep(db, c, who, '삭제'), db.prepare('UPDATE comments SET del_at = ? WHERE id = ?').bind(Date.now(), c.id)]);
}

export const setStatus = (db, ids, status, by) => db.batch(ids.map(id => db.prepare('UPDATE comments SET status = ?, hide_by = ? WHERE id = ?').bind(status, by || '', id)));

export async function histOf(db, cid) {
  const r = await db.prepare('SELECT at, who, act, text FROM comment_hist WHERE cid = ? ORDER BY id DESC LIMIT 50').bind(cid).all();
  return r.results || [];
}

// 신고 한 사람당 한 번. 지금까지 신고 수를 돌려준다
export async function report(db, cid, who) {
  const r = await db.prepare('INSERT INTO comment_reports (cid, who, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(cid, who, Date.now()).run();
  if (r.meta && r.meta.changes) await db.prepare('UPDATE comments SET reports = reports + 1 WHERE id = ?').bind(cid).run();
  const c = await db.prepare('SELECT reports FROM comments WHERE id = ?').bind(cid).first();
  return { added: !!(r.meta && r.meta.changes), n: c ? c.reports : 0 };
}

export const clearReports = (db, ids) => db.batch(ids.flatMap(id => [
  db.prepare('DELETE FROM comment_reports WHERE cid = ?').bind(id),
  db.prepare('UPDATE comments SET reports = 0 WHERE id = ?').bind(id)]));

// 금지어 (설정 cfg.cmtBan, 관리자가 바꿈). 없으면 기본 목록
const BAN = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '지랄', '미친놈', '미친년', '꺼져', '사기꾼', '쓰레기'];
export async function banWords(db) {
  const r = await db.prepare("SELECT v FROM kv WHERE s = 'cfg' AND k = 'cmtBan'").first();
  const v = r && parse(r.v);
  const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : BAN;
  return a.map(x => String(x).trim()).filter(Boolean);
}
