// 매물 · 매물 권한 · 매물 이력 · 공개용 사본 (설계서 8.4 · 10.3) — 직원 API 전용
//   매물을 바꾸는 묶음마다 공개용 사본도 같이 지우고 다시 넣는다 → 상태가 끝나는 순간 공개사이트에서 사라짐
import { ulid } from '../lib/id.js';
import { ACTIVE, DEALS, DONE, cfgOf, publicRow, doneRow, termsOf, faceOf } from '../core/listings.js';
import { UNIT } from '../core/units.js';
import { getOne } from './kv.js';

const parse = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];

export const loadCfg = async db => cfgOf(await getOne(db, 'cfg', 'listingCfg'));
export const getListing = (db, id) => db.prepare('SELECT * FROM listings WHERE id = ? AND deleted_at IS NULL').bind(id).first();
export const staffRow = (db, name) => name ? db.prepare('SELECT name, role, active, license FROM staff WHERE name = ?').bind(name).first() : null;
export const grantOf = (db, id, staff) => db.prepare('SELECT * FROM listing_grants WHERE listing_id = ? AND staff = ?').bind(id, staff).first();
export const grantsOf = (db, id) => all(db, 'SELECT staff, perm, until, by, at FROM listing_grants WHERE listing_id = ? ORDER BY at', id);
export const eventsOf = (db, id) => all(db, 'SELECT at, who, act, detail FROM listing_events WHERE listing_id = ? ORDER BY id DESC LIMIT 60', id);
export async function myGrants(db, staff) {
  const o = {}; (await all(db, 'SELECT listing_id, perm, until FROM listing_grants WHERE staff = ?', staff)).forEach(g => { o[g.listing_id] = g; }); return o;
}

// 보드: 진행 중 전부 + 끝난 매물(잔금완료 · 보류 · 철회)은 최근 60일
export async function boardRows(db) {
  return all(db, `SELECT * FROM listings WHERE deleted_at IS NULL AND (status IN (${ACTIVE.map(() => '?').join(',')}) OR at >= ?) ORDER BY urgent DESC, at DESC LIMIT 800`, ...ACTIVE, Date.now() - 60 * 864e5);
}

// 현재 소유자 (보드에 표시, 가림은 API 에서)
export async function ownersOf(db, unitIds) {
  const o = {}, ids = [...new Set(unitIds)];
  for (let i = 0; i < ids.length; i += 90) {
    const p = ids.slice(i, i + 90);
    (await all(db, 'SELECT w.unit_id, p.name, p.phone FROM unit_owners w LEFT JOIN persons p ON p.id = w.person_id WHERE w.is_current = 1 AND w.deleted_at IS NULL AND w.unit_id IN (' + p.map(() => '?').join(',') + ')', ...p))
      .forEach(r => { o[r.unit_id] = { name: r.name || '', phone: r.phone || '' }; });
  }
  return o;
}

const ev = (db, id, who, act, detail, at = Date.now()) => db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(id, at, who, act, String(detail || '').slice(0, 300));

// 공개용 사본 지우고 (공개면) 다시 넣는 문장
async function copyStmts(db, l, cfg, now) {
  const ud = await db.prepare('SELECT data FROM units WHERE id = ?').bind(l.unit_id).first();
  let data = null; try { data = ud && ud.data ? JSON.parse(ud.data) : null; } catch (e) { data = null; }
  const row = publicRow(l, cfg, await staffRow(db, l.mgr || l.writer), now, data);
  const st = [db.prepare('DELETE FROM public_listings WHERE id = ?').bind(l.id), db.prepare('DELETE FROM public_done WHERE id = ?').bind(l.id)];
  // 최근 거래완료 사본: 계약 · 잔금완료 + '표시 안 함' 아닐 때만 — 타입 · 단지 · 면적 (가격 · 동 · 층 · 사람 없음)
  const d = doneRow(l);
  if (d) st.push(db.prepare('INSERT INTO public_done (id, deal, type, block, kind, exclusive, done_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(d.id, d.deal, d.type, d.block, d.kind, d.exclusive, d.done_at));
  if (row) { const k = Object.keys(row); st.push(db.prepare('INSERT INTO public_listings (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => row[x] ?? null))); }
  return { st, row };
}

// 한 매물 저장: 버전 확인 → 고치기 → 이력 → 공개 사본 (한 묶음). 공개 중인데 필수 항목이 빠지면 자동으로 비공개
//   돌려주는 값: { ok, conflict?, row(새 매물), copy(공개 사본 또는 null) }
export async function commit(db, cur, patch, { ver, who, events = [], cfg } = {}) {
  cfg = cfg || await loadCfg(db);
  const now = Date.now();
  // 계약 · 잔금완료가 된 때 (최근 거래완료 30일 기준) — 진행 상태로 되돌리거나 보류 · 철회면 지움
  if ('status' in patch) { if (DONE.includes(patch.status)) { if (!cur.done_at) patch.done_at = now; } else if (cur.done_at) patch.done_at = null; }
  const next = Object.assign({}, cur, patch, { at: now });
  let { st: cs, row } = await copyStmts(db, next, cfg, now);
  if (next.pub === 'on' && !row) { next.pub = 'off'; events.push(['자동 비공개', '필수 항목 부족']); }
  if (next.pub !== 'on') next.pub_at = null;
  const keys = [...new Set(Object.keys(patch).concat(['pub', 'pub_at', 'at']))].filter(k => !['id', 'ver'].includes(k));
  const st = [
    db.prepare('INSERT INTO listing_guard (ok) SELECT 1 FROM listings WHERE id = ? AND ver != ?').bind(cur.id, ver ?? cur.ver),
    db.prepare('UPDATE listings SET ' + keys.map(k => k + ' = ?').join(', ') + ', ver = ver + 1 WHERE id = ?').bind(...keys.map(k => next[k] ?? null), cur.id),
    ...events.map(([act, detail]) => ev(db, cur.id, who, act, detail, now)),
    ...cs
  ];
  try { await db.batch(st); } catch (e) {
    if (/CHECK constraint/i.test(String(e && e.message))) return { ok: false, conflict: true };
    throw e;
  }
  next.ver = (cur.ver || 1) + 1;
  return { ok: true, row: next, copy: row };
}

// R1: 상담카드(소유자) '입주 후 거래' → 거래 유형마다 매물. 같은 호실 · 같은 유형의 진행 중 매물이 있으면 조건만 갱신 (설계서 10.1)
export async function syncFromCard(db, card, by) {
  if (!card || card.kind !== 'owner' || !card.unit || !card.trades || typeof card.trades !== 'object') return 0;
  const cfg = await loadCfg(db), now = Date.now();
  let n = 0;
  for (const deal of Object.keys(DEALS)) {
    const t = card.trades[deal];
    if (!t) continue;
    const terms = termsOf(deal, t);
    const cur = await db.prepare(`SELECT * FROM listings WHERE unit_id = ? AND deal = ? AND deleted_at IS NULL AND status IN (${ACTIVE.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 1`).bind(card.unit, deal, ...ACTIVE).first();
    if (cur) {
      const patch = {}; Object.keys(terms).forEach(k => { if (terms[k] != null && terms[k] !== '' && terms[k] !== cur[k]) patch[k] = terms[k]; });
      if (!Object.keys(patch).length) continue;
      await commit(db, cur, patch, { who: by, cfg, events: [['상담카드 갱신', Object.keys(patch).join(', ')]] });
    } else {
      const id = ulid(), writer = card.writer || by, row = Object.assign({ id, unit_id: card.unit, deal, status: '접수', pub: 'off', source: 'card', card_id: String(card.id || ''), writer, mgr: card.mgr || writer, mgmt_items: '[]', urgent: (card.tags || []).includes('급매') ? 1 : 0, at: now, created_at: now, ver: 1 }, faceOf((UNIT[card.unit] || {}).type), terms);
      const k = Object.keys(row);
      await db.batch([db.prepare('INSERT INTO listings (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => row[x] ?? null)), ev(db, id, by, '접수', '상담카드 ' + DEALS[deal] + ' 칩')]);
    }
    n++;
  }
  return n;
}

// 공개 설정 · 직원 자격이 바뀌면 공개 중인 매물 사본을 전부 다시 만듦 (빠진 항목이 생기면 비공개로)
// 세대 옵션이 바뀌면 그 세대의 공개 매물 사본도 다시 (상담카드 › 소유자 옵션)
export async function refreshUnits(db, ids, who) {
  const list = [...new Set(ids)].slice(0, 200); if (!list.length) return;
  const cfg = await loadCfg(db);
  for (let i = 0; i < list.length; i += 90) {
    const p = list.slice(i, i + 90);
    for (const l of await all(db, "SELECT * FROM listings WHERE pub = 'on' AND deleted_at IS NULL AND unit_id IN (" + p.map(() => '?').join(',') + ')', ...p)) await commit(db, l, {}, { who, cfg });
  }
}

export async function rebuildPublic(db, who) {
  const cfg = await loadCfg(db);
  for (const l of await all(db, "SELECT * FROM listings WHERE pub = 'on' AND deleted_at IS NULL")) await commit(db, l, {}, { who, cfg });
}

export async function setGrant(db, id, staff, perm, until, by) {
  const now = Date.now();
  await db.batch([
    perm ? db.prepare('INSERT INTO listing_grants (listing_id, staff, perm, until, by, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (listing_id, staff) DO UPDATE SET perm = excluded.perm, until = excluded.until, by = excluded.by, at = excluded.at').bind(id, staff, perm, until || null, by, now)
      : db.prepare('DELETE FROM listing_grants WHERE listing_id = ? AND staff = ?').bind(id, staff),
    ev(db, id, by, perm ? '공유' : '공유 해제', staff + (perm ? ' · ' + (perm === 'edit' ? '수정' : '보기') + (until ? ' (~' + until + ')' : '') : '')),
    db.prepare('UPDATE listings SET at = ? WHERE id = ?').bind(now, id)
  ]);
}

export const parseItems = v => parse(v) || [];
