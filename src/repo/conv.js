// 세대 전환 상태 · 공개 세대 저장 (R2) — 직원용. 손님용 읽기는 repo/public-units.js
import { pubRow, canPub } from '../core/conv.js';

export async function listConv(db) {
  const conv = (await db.prepare('SELECT unit_id, status, move_out, memo, at, by FROM unit_conv').all()).results || [];
  const pub = (await db.prepare('SELECT unit_id, at, by FROM public_units').all()).results || [];
  return { conv, pub };
}

export const getConv = (db, id) => db.prepare('SELECT * FROM unit_conv WHERE unit_id = ?').bind(id).first();
export const isPubUnit = async (db, id) => !!(await db.prepare('SELECT 1 FROM public_units WHERE unit_id = ?').bind(id).first());

// 상태 저장. 공개 중인데 공개할 수 없는 상태가 되면 바로 내림 → true 돌려줌
export async function setConv(db, id, v, by, now = Date.now()) {
  await db.prepare('INSERT INTO unit_conv (unit_id, status, move_out, memo, at, by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET status = excluded.status, move_out = excluded.move_out, memo = excluded.memo, at = excluded.at, by = excluded.by')
    .bind(id, v.status, v.move_out, v.memo, now, by).run();
  if (!(await isPubUnit(db, id))) return false;
  if (!canPub(v.status)) { await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return true; }
  const r = pubRow(id, v.status);   // 공실 ↔ 퇴거확정(매물동의) 사이로 바뀌면 구분만 새로
  await db.prepare('UPDATE public_units SET kind = ? WHERE unit_id = ?').bind(r.kind, id).run();
  return false;
}

// 공개 켜기 · 내리기. 켤 때 상태가 공개 불가면 'status' 돌려줌
export async function setPub(db, id, on, by, now = Date.now()) {
  if (!on) { await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return 'ok'; }
  const c = await getConv(db, id), r = c && pubRow(id, c.status);
  if (!r) return 'status';
  await db.prepare('INSERT INTO public_units (unit_id, dong, band, type, kind, exclusive, at, by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET kind = excluded.kind, at = excluded.at, by = excluded.by')
    .bind(id, r.dong, r.band, r.type, r.kind, r.exclusive, now, by).run();
  return 'ok';
}
