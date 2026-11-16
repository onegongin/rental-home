// 세대 전환 상태 · 공개 세대 저장 (R2) — 직원용. 손님용 읽기는 repo/public-units.js
import { pubRow, canPub, pubRowKind, cleanDeal } from '../core/conv.js';

export async function listConv(db) {
  const conv = (await db.prepare('SELECT unit_id, status, move_out, memo, at, by FROM unit_conv').all()).results || [];
  const pub = (await db.prepare('SELECT unit_id, deal, at, by FROM public_units').all()).results || [];
  return { conv, pub };
}

export const getConv = (db, id) => db.prepare('SELECT * FROM unit_conv WHERE unit_id = ?').bind(id).first();
export const isPubUnit = async (db, id) => !!(await db.prepare('SELECT 1 FROM public_units WHERE unit_id = ?').bind(id).first());

// 상태 저장. 공개 중인데 공개할 수 없는 상태가 되면 바로 내림 → true 돌려줌
//   done_at: 계약완료 · 신규입주가 된 시각 (그 사이를 오갈 땐 그대로, 벗어나면 지움) — 일일업무보고 10.16 이전/이후 · 금일계약
const DONE = ['계약완료', '신규입주'];
export async function setConv(db, id, v, by, now = Date.now()) {
  const old = await getConv(db, id);
  const keep = old && DONE.includes(old.status) && old.done_at;   // 계약완료 ↔ 신규입주 사이를 오가면 완료 시각 · 바로 전 상태 유지
  const done_at = DONE.includes(v.status) ? (keep ? old.done_at : now) : null;
  const done_from = DONE.includes(v.status) ? (keep ? old.done_from : (old && old.status) || null) : null;   // 청구서 '구분' (R3-3)
  await db.prepare('INSERT INTO unit_conv (unit_id, status, move_out, memo, at, by, done_at, done_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET status = excluded.status, move_out = excluded.move_out, memo = excluded.memo, at = excluded.at, by = excluded.by, done_at = excluded.done_at, done_from = excluded.done_from')
    .bind(id, v.status, v.move_out, v.memo, now, by, done_at, done_from).run();
  if (!(await isPubUnit(db, id))) return false;
  if (!canPub(v.status)) { if (DONE.includes(v.status) || !(await pubEligible(db, id))) { await dropPubListing(db, id); await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return true; } return false; }   // 신규분양 대상(시안 r46) 세대는 다른 상태여도 공개 유지
  const r = pubRow(id, v.status);   // 공실 ↔ 퇴거확정(매물동의) 사이로 바뀌면 구분만 새로
  await db.prepare('UPDATE public_units SET kind = ? WHERE unit_id = ?').bind(r.kind, id).run();
  return false;
}

// 상담카드 진행상태 → 전환 상태 (R2 상담카드). 퇴거일 · 메모는 그대로 두고 상태만 (move_out 을 주면 그것도)
export async function syncConv(db, id, status, by, move_out) {
  const old = (await getConv(db, id)) || {};
  const v = { status, move_out: move_out || old.move_out || null, memo: old.memo || null };
  return { old: old.status || null, off: await setConv(db, id, v, by) };
}

// 공개 켜기 · 내리기. 켤 때 상태가 공개 불가면 'status' 돌려줌
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
// 신규분양 대상인가 (시안 r46 확정 2026-11-17): 현재 임대차가 있고, 계약자DB 계약조건이 빈칸이며, 전환상태가 계약완료 · 신규입주가 아님 → { kind } (만기 지남 = vac 즉시 입주 · 아니면 out 입주일 협의)
export async function pubEligible(db, id) {
  const t = await db.prepare('SELECT end_date FROM tenancies WHERE unit_id = ? AND is_current = 1 AND deleted_at IS NULL ORDER BY end_date DESC LIMIT 1').bind(id).first();
  if (!t) return null;
  const u = await db.prepare("SELECT json_extract(data, '$.cond') AS cond FROM units WHERE id = ?").bind(id).first();
  if (u && u.cond && u.cond !== '-') return null;
  const c = await getConv(db, id);
  if (c && DONE.includes(c.status)) return null;
  return { kind: t.end_date && t.end_date < kstDay() ? 'vac' : 'out', end: t.end_date || '' };
}

// 공실 · 신규분양 목록 (직원) — 신규분양 대상 세대 전부: 임대차 만기 · 전환상태 · 공개(거래 구분)
export async function listVacancy(db) {
  const ten = (await db.prepare('SELECT unit_id, max(end_date) AS end_date FROM tenancies WHERE is_current = 1 AND deleted_at IS NULL GROUP BY unit_id').all()).results || [];
  const cond = {}; ((await db.prepare("SELECT id, json_extract(data, '$.cond') AS cond FROM units WHERE data IS NOT NULL AND data <> 'null'").all()).results || []).forEach(r => { cond[r.id] = r.cond; });
  const conv = {}; ((await db.prepare('SELECT unit_id, status FROM unit_conv').all()).results || []).forEach(r => { conv[r.unit_id] = r.status; });
  const pub = {}; ((await db.prepare('SELECT unit_id, deal FROM public_units').all()).results || []).forEach(r => { pub[r.unit_id] = r.deal || '매매'; });
  const today = kstDay();
  return ten.filter(t => !(cond[t.unit_id] && cond[t.unit_id] !== '-') && !DONE.includes(conv[t.unit_id]))
    .map(t => ({ id: t.unit_id, end: t.end_date || '', vacant: !!(t.end_date && t.end_date < today), conv: conv[t.unit_id] || '', deal: pub[t.unit_id] || '' }));
}

// 신규분양 공개 → 손님 '현재 매물' (시안 r47 확정 2026-11-17): 공개용 사본(public_listings)에 매매 · 매입보장가 한 줄. 번호(pid)는 호수와 상관없는 무작위
//   row = 서버(직원 API)가 만든 공개 칸만 (동 · 층구간 · 타입 · 면적 · 매입보장가 · 입주 시기) — 호수 · 층 · 혜택가 · 보증금 없음
export async function putPubListing(db, id, row, now = Date.now()) {
  const p = await db.prepare('SELECT pid FROM public_units WHERE unit_id = ?').bind(id).first();
  if (!p) return null;
  let pid = p.pid; if (!pid) { pid = 'nu' + [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join(''); await db.prepare('UPDATE public_units SET pid = ? WHERE unit_id = ?').bind(pid, id).run(); }
  const r = Object.assign({}, row, { id: pid, at: now, updated: now }), k = Object.keys(r);
  await db.prepare('DELETE FROM public_listings WHERE id = ?').bind(pid).run();
  await db.prepare('INSERT INTO public_listings (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => r[x] ?? null)).run();
  return pid;
}
export async function dropPubListing(db, id) {
  const p = await db.prepare('SELECT pid FROM public_units WHERE unit_id = ?').bind(id).first();
  if (p && p.pid) await db.prepare('DELETE FROM public_listings WHERE id = ?').bind(p.pid).run();
}
// 계약조건이 생겼거나 계약이 끝난 공개 세대는 손님 화면 · 현재 매물에서 내림 (직원이 세대 · 상태를 저장할 때 · 매일 새벽)
export async function cleanupPub(db) {
  const bad = (await db.prepare("SELECT p.unit_id, p.pid FROM public_units p LEFT JOIN units u ON u.id = p.unit_id LEFT JOIN unit_conv c ON c.unit_id = p.unit_id WHERE coalesce(json_extract(u.data, '$.cond'), '') NOT IN ('', '-') OR coalesce(c.status, '') IN ('계약완료', '신규입주')").all()).results || [];
  for (const b of bad) { if (b.pid) await db.prepare('DELETE FROM public_listings WHERE id = ?').bind(b.pid).run(); await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(b.unit_id).run(); }
  return bad.length;
}

export async function setPub(db, id, on, by, now = Date.now(), deal) {
  if (!on) { await dropPubListing(db, id); await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return 'ok'; }
  const c = await getConv(db, id); let r = c && pubRow(id, c.status);
  if (!r) { const e = await pubEligible(db, id); r = e && pubRowKind(id, e.kind); }
  if (!r) return 'status';
  const d = cleanDeal(deal);
  await db.prepare('INSERT INTO public_units (unit_id, dong, band, type, kind, exclusive, at, by, deal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET kind = excluded.kind, deal = excluded.deal, at = excluded.at, by = excluded.by')
    .bind(id, r.dong, r.band, r.type, r.kind, r.exclusive, now, by, d).run();
  return 'ok';
}
