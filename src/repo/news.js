// 분양 소식 저장 (시안 r79) — 직원 쓰기 · 손님 읽기(공개 글만)
import { ulid } from '../lib/id.js';

const COLS = 'id, slug, cat, title, lead, body, tags, status, author, at, pub_at, edited_at';
export const listAll = async db => (await db.prepare('SELECT ' + COLS + ' FROM news WHERE deleted_at IS NULL ORDER BY COALESCE(pub_at, at) DESC LIMIT 300').all()).results || [];
export const listPub = async (db, cat, n = 200) => (await db.prepare("SELECT " + COLS + " FROM news WHERE deleted_at IS NULL AND status = 'pub' AND (? = '' OR cat = ?) ORDER BY pub_at DESC LIMIT ?").bind(cat || '', cat || '', n).all()).results || [];
export const get = (db, id) => db.prepare('SELECT * FROM news WHERE id = ? AND deleted_at IS NULL').bind(id).first();
export const bySlug = (db, slug) => db.prepare("SELECT * FROM news WHERE slug = ? AND deleted_at IS NULL AND status = 'pub'").bind(slug).first();
export const slugTaken = async (db, slug, id) => !!(await db.prepare('SELECT 1 FROM news WHERE slug = ? AND id <> ? AND deleted_at IS NULL').bind(slug, id || '').first());

export async function insert(db, o, now = Date.now()) {
  const id = ulid(now), row = Object.assign({ id, at: now, status: 'draft', lead: '', body: '[]', tags: '' }, o), k = Object.keys(row);
  await db.prepare('INSERT INTO news (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(c => row[c] ?? null)).run();
  return id;
}
export async function edit(db, id, patch, now = Date.now()) {
  const k = Object.keys(patch); if (!k.length) return;
  await db.prepare('UPDATE news SET ' + k.map(c => c + ' = ?').join(', ') + ', edited_at = ? WHERE id = ?').bind(...k.map(c => patch[c]), now, id).run();
}
export const setStatus = (db, id, st, now = Date.now()) => db.prepare("UPDATE news SET status = ?, pub_at = CASE WHEN ? = 'pub' THEN COALESCE(pub_at, ?) ELSE pub_at END, edited_at = ? WHERE id = ?").bind(st, st, now, now, id).run();
export const hide = (db, id, by, now = Date.now()) => db.prepare('UPDATE news SET deleted_at = ?, del_by = ? WHERE id = ?').bind(now, by, id).run();

// 사진 (R2 rental-home-media · media 표 aud = 'news' — 손님도 받음, 팝업 정리에서 빠짐)
export const addMedia = (db, id, name, size, by, now = Date.now()) =>
  db.prepare("INSERT INTO media (id, kind, aud, name, size, at, by, dl) VALUES (?, 'img', 'news', ?, ?, ?, ?, 0)").bind(id, name, size, now, by).run();
export const mediaOf = (db, id) => db.prepare("SELECT * FROM media WHERE id = ? AND aud = 'news'").bind(id).first();
