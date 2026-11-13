// 직원 소통 3종 저장 (R3-4) — 직원용
import { ulid } from '../lib/id.js';

export const listPosts = async db => (await db.prepare('SELECT * FROM board_posts WHERE deleted_at IS NULL ORDER BY at DESC LIMIT 1500').all()).results || [];
export const getPost = (db, id) => db.prepare('SELECT * FROM board_posts WHERE id = ? AND deleted_at IS NULL').bind(id).first();
export const admins = async db => ((await db.prepare("SELECT name FROM staff WHERE active = 1 AND role IN ('대표', '관리자')").all()).results || []).map(x => x.name);

export async function insertPost(db, o, now = Date.now()) {
  const id = ulid(now), row = Object.assign({ id, at: now, pin: 0 }, o), k = Object.keys(row);
  await db.prepare('INSERT INTO board_posts (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(c => row[c] ?? null)).run();
  return id;
}
export async function editPost(db, id, patch, now = Date.now()) {
  const k = Object.keys(patch);
  await db.prepare('UPDATE board_posts SET ' + k.map(c => c + ' = ?').join(', ') + ', edited_at = ? WHERE id = ?').bind(...k.map(c => patch[c]), now, id).run();
}
export const answerPost = (db, id, status, answer, by, now = Date.now()) =>
  db.prepare('UPDATE board_posts SET status = ?, answer = ?, ans_by = ?, ans_at = ? WHERE id = ?').bind(status, answer, by, now, id).run();
export const hidePost = (db, id, by, now = Date.now()) => db.prepare('UPDATE board_posts SET deleted_at = ?, del_by = ? WHERE id = ?').bind(now, by, id).run();
