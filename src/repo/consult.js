// 상담카드 2종 저장 (R2) — 직원용. 손님 화면 코드는 이 파일을 부르지 않음
import { ulid } from '../lib/id.js';
import { parse } from './kv.js';

const row = r => r && Object.assign({}, r, { data: parse(r.data) || {} });

// 목록: 카드 + 마지막 상담 기록 한 줄 (지운 카드는 del=1 일 때만)
export async function listConsults(db, kind, del = false) {
  const cards = ((await db.prepare('SELECT * FROM consults WHERE kind = ? AND ' + (del ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL') + ' ORDER BY at DESC LIMIT 2000').bind(kind).all()).results || []).map(row);
  const last = {};
  ((await db.prepare('SELECT l.consult_id, l.date, l.prob, l.next_date, l.at, l.by FROM consult_logs l JOIN consults c ON c.id = l.consult_id WHERE c.kind = ? ORDER BY l.id').bind(kind).all()).results || []).forEach(l => { last[l.consult_id] = l; });
  return cards.map(c => Object.assign(c, { last: last[c.id] || null }));
}

export const getConsult = async (db, id) => row(await db.prepare('SELECT * FROM consults WHERE id = ?').bind(id).first());
export const tenantCardOf = async (db, unit) => row(await db.prepare("SELECT * FROM consults WHERE kind = 'tenant' AND unit_id = ? AND deleted_at IS NULL").bind(unit).first());
export const cardOfLead = (db, lead) => db.prepare('SELECT id FROM consults WHERE lead_id = ? AND deleted_at IS NULL').bind(lead).first();
export async function logsOf(db, id) {
  return ((await db.prepare('SELECT * FROM consult_logs WHERE consult_id = ? ORDER BY id DESC').bind(id).all()).results || []).map(l => Object.assign(l, { docs: parse(l.docs) || [] }));
}

export async function insertConsult(db, c, by, now = Date.now()) {
  const id = ulid(now);
  await db.prepare('INSERT INTO consults (id, kind, unit_id, name, phone, progress, mgr, writer, data, lead_id, created_at, at, by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.kind, c.unit_id || null, c.name || null, c.phone || null, c.progress || '상담중', c.mgr || null, by, JSON.stringify(c.data || {}), c.lead_id || null, now, now, by).run();
  return id;
}

export async function updateConsult(db, id, patch, by, now = Date.now()) {
  const k = ['name', 'phone', 'progress', 'mgr', 'data'].filter(x => x in patch);
  const v = k.map(x => x === 'data' ? JSON.stringify(patch.data) : patch[x]);
  await db.prepare('UPDATE consults SET ' + k.map(x => x + ' = ?').concat(['at = ?', 'by = ?']).join(', ') + ' WHERE id = ?').bind(...v, now, by, id).run();
}

export async function addLog(db, id, l, progress, by, now = Date.now()) {
  await db.prepare('INSERT INTO consult_logs (consult_id, at, by, date, channel, prob, memo, docs, next_date, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, now, by, l.date, l.channel, l.prob, l.memo, JSON.stringify(l.docs || []), l.next_date, progress || null).run();
}

export async function setDeleted(db, id, on, by, reason, now = Date.now()) {
  if (on) await db.prepare('UPDATE consults SET deleted_at = ?, del_by = ?, del_reason = ? WHERE id = ?').bind(now, by, reason, id).run();
  else await db.prepare('UPDATE consults SET deleted_at = NULL, del_by = NULL, del_reason = NULL WHERE id = ?').bind(id).run();
}

// 손님 관심등록 중 '입주 신규고객'(kind client) — 아직 신규고객 카드가 안 된 것
export async function pendingLeads(db) {
  const used = new Set(((await db.prepare('SELECT lead_id FROM consults WHERE lead_id IS NOT NULL AND deleted_at IS NULL').all()).results || []).map(r => r.lead_id));
  return ((await db.prepare("SELECT k, v, at FROM kv WHERE s = 'c'").all()).results || [])
    .map(r => Object.assign({ k: r.k }, parse(r.v) || {}))
    .filter(c => c.guest && c.kind === 'client' && !c.deleted && !used.has(c.k))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}
export async function leadCard(db, k) {
  const r = await db.prepare("SELECT v FROM kv WHERE s = 'c' AND k = ?").bind(k).first();
  const c = r && parse(r.v);
  return c && c.guest && c.kind === 'client' ? c : null;
}
