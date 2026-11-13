// 수수료 청구서 · MGM 저장 (R3-3) — 대표 · 관리자 전용 API 에서만 부름
import { ulid } from '../lib/id.js';
import { parse } from './kv.js';

const all = async (db, sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];

export async function claimRows(db) {
  const [conv, claims, locks, staff, cards] = await Promise.all([
    all(db, "SELECT unit_id, status, done_at, done_from FROM unit_conv WHERE status IN ('계약완료', '신규입주') AND done_at IS NOT NULL"),
    all(db, 'SELECT * FROM claims ORDER BY at'),
    all(db, 'SELECT * FROM claim_locks'),
    all(db, 'SELECT name, fee, tax FROM claim_staff'),
    all(db, 'SELECT id, kind, unit_id, name, mgr, progress, data FROM consults WHERE deleted_at IS NULL')
  ]);
  cards.forEach(c => { const d = parse(c.data) || {}; ['contractUnit', 'mgmAgency', 'mgmBroker', 'mgmFee', 'mgmFixed'].forEach(k => { c[k] = d[k] || null; }); delete c.data; });
  return { conv, claims, locks, staff, cards };
}

export const getClaim = (db, id) => db.prepare('SELECT * FROM claims WHERE id = ?').bind(id).first();
export const unitClaim = (db, unit) => db.prepare('SELECT * FROM claims WHERE unit_id = ? AND extra = 0').bind(unit).first();
export const isLocked = async (db, date) => !!date && !!(await db.prepare('SELECT 1 FROM claim_locks WHERE date = ? AND locked = 1').bind(date).first());

export async function insertClaim(db, o, by, now = Date.now()) {
  const id = ulid(now);
  await db.prepare('INSERT INTO claims (id, unit_id, extra, reason, date, fee, tax, memo, excluded, at, by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, o.unit_id, o.extra ? 1 : 0, o.reason || null, o.date || null, o.fee ?? null, o.tax || null, o.memo || null, o.excluded ? 1 : 0, now, by).run();
  return id;
}
export async function updateClaim(db, id, patch, by, now = Date.now()) {
  const k = Object.keys(patch);
  if (!k.length) return;
  await db.prepare('UPDATE claims SET ' + k.map(x => x + ' = ?').concat(['at = ?', 'by = ?']).join(', ') + ' WHERE id = ?').bind(...k.map(x => patch[x]), now, by, id).run();
}
export const deleteClaim = (db, id) => db.prepare('DELETE FROM claims WHERE id = ?').bind(id).run();
export async function setLock(db, date, locked, by, now = Date.now()) {
  await db.prepare('INSERT INTO claim_locks (date, locked, at, by) VALUES (?, ?, ?, ?) ON CONFLICT (date) DO UPDATE SET locked = excluded.locked, at = excluded.at, by = excluded.by').bind(date, locked ? 1 : 0, now, by).run();
}
export async function setStaffFee(db, name, fee, tax, by, now = Date.now()) {
  if (fee == null) { await db.prepare('DELETE FROM claim_staff WHERE name = ?').bind(name).run(); return; }
  await db.prepare('INSERT INTO claim_staff (name, fee, tax, at, by) VALUES (?, ?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET fee = excluded.fee, tax = excluded.tax, at = excluded.at, by = excluded.by').bind(name, fee, tax, now, by).run();
}
