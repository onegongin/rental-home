// 공지사항 저장 (시안 r77) — 직원용
import { ulid } from '../lib/id.js';

export const list = async db => (await db.prepare('SELECT * FROM notices WHERE deleted_at IS NULL ORDER BY at DESC LIMIT 500').all()).results || [];
export const get = (db, id) => db.prepare('SELECT * FROM notices WHERE id = ? AND deleted_at IS NULL').bind(id).first();
export const reads = async db => (await db.prepare('SELECT r.* FROM notice_reads r JOIN notices n ON n.id = r.nid WHERE n.deleted_at IS NULL').all()).results || [];
export const replies = async db => (await db.prepare('SELECT x.* FROM notice_replies x JOIN notices n ON n.id = x.nid WHERE n.deleted_at IS NULL AND x.deleted_at IS NULL ORDER BY x.at').all()).results || [];
export const getReply = (db, id) => db.prepare('SELECT * FROM notice_replies WHERE id = ? AND deleted_at IS NULL').bind(id).first();
export const staff = async db => ((await db.prepare("SELECT name, role FROM staff WHERE active = 1 AND role <> '열람' ORDER BY at").all()).results || []);

export async function insert(db, o, now = Date.now()) {
  const id = ulid(now), row = Object.assign({ id, at: now, pin: 0, popup: 0, files: '[]' }, o), k = Object.keys(row);
  await db.prepare('INSERT INTO notices (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(c => row[c] ?? null)).run();
  return id;
}
export async function edit(db, id, patch, now = Date.now()) {
  const k = Object.keys(patch); if (!k.length) return;
  await db.prepare('UPDATE notices SET ' + k.map(c => c + ' = ?').join(', ') + ', edited_at = ? WHERE id = ?').bind(...k.map(c => patch[c]), now, id).run();
}
export const hide = (db, id, by, now = Date.now()) => db.prepare('UPDATE notices SET deleted_at = ?, del_by = ? WHERE id = ?').bind(now, by, id).run();
export const setStatus = (db, id, st) => db.prepare('UPDATE notices SET status = ? WHERE id = ?').bind(st, id).run();

// 읽음: ack = [확인했습니다], seen = 글을 열어 봄
export const mark = (db, nid, who, what, now = Date.now()) => db.prepare('INSERT INTO notice_reads (nid, who, ' + (what === 'ack' ? 'ack_at, seen_at' : 'seen_at') + ') VALUES (?, ?, ?' + (what === 'ack' ? ', ?' : '') + ') ON CONFLICT (nid, who) DO UPDATE SET ' + (what === 'ack' ? 'ack_at = COALESCE(ack_at, excluded.ack_at), seen_at = excluded.seen_at' : 'seen_at = excluded.seen_at'))
  .bind(...(what === 'ack' ? [nid, who, now, now] : [nid, who, now])).run();

export async function addReply(db, nid, who, body, now = Date.now()) {
  const id = ulid(now);
  await db.prepare('INSERT INTO notice_replies (id, nid, who, body, at) VALUES (?, ?, ?, ?, ?)').bind(id, nid, who, body, now).run();
  return id;
}
export const hideReply = (db, id, now = Date.now()) => db.prepare('UPDATE notice_replies SET deleted_at = ? WHERE id = ?').bind(now, id).run();

// 첨부 파일 정보 (R2 rental-home-media · media 표, aud = 'notice' — 팝업 정리에서 빠짐)
export const addMedia = (db, id, kind, name, size, by, now = Date.now()) =>
  db.prepare("INSERT INTO media (id, kind, aud, name, size, at, by, dl) VALUES (?, ?, 'notice', ?, ?, ?, ?, 0)").bind(id, kind, name, size, now, by).run();
