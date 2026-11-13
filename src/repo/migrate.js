// 기존 자료 옮기기 저장 · 되돌리기 (R4) — 대표 · 관리자 전용 API 에서만 부름
//   전부 읽고 → 바꿀 것 계산 → 500개씩 묶어 저장 (Cloudflare 요청 한 번의 DB 호출 수 제한 때문에)
import { ulid } from '../lib/id.js';
import { parse } from './kv.js';
import { canPub } from '../core/conv.js';
import { priceOf } from '../core/price.js';

const all = async (db, sql) => (await db.prepare(sql).all()).results || [];
const run = async (db, st) => { for (let i = 0; i < st.length; i += 500) await db.batch(st.slice(i, i + 500)); };
const ins = (db, t, o) => { const k = Object.keys(o); return db.prepare('INSERT INTO ' + t + ' (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => o[x] ?? null)); };
const CONV_COLS = ['unit_id', 'status', 'move_out', 'memo', 'at', 'by', 'done_at', 'done_from'];
const upConv = (db, o) => db.prepare('INSERT INTO unit_conv (' + CONV_COLS.join(', ') + ') VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET ' + CONV_COLS.slice(1).map(c => c + ' = excluded.' + c).join(', ')).bind(...CONV_COLS.map(c => o[c] ?? null));

// mode: 'fill' 빈 칸만 · 'over' 덮어쓰기 (엑셀의 빈 칸은 어느 쪽이든 지우지 않음)
export async function applyRoster(db, rows, mode, by, now = Date.now()) {
  const conv = Object.fromEntries((await all(db, 'SELECT * FROM unit_conv')).map(r => [r.unit_id, r]));
  const cards = Object.fromEntries((await all(db, "SELECT * FROM consults WHERE kind = 'tenant' AND deleted_at IS NULL")).map(r => [r.unit_id, r]));
  const pub = Object.fromEntries((await all(db, 'SELECT * FROM public_units')).map(r => [r.unit_id, r]));
  const st = [], undo = { conv: [], cards: [], created: [], pub: [] }, n = { cardNew: 0, cardUpd: 0, conv: 0, unpub: 0 };
  const take = (cur, v) => v != null && v !== '' && (mode === 'over' || cur == null || cur === '');

  for (const r of rows) {
    // 전환상태 · 퇴거일
    const o = conv[r.unit], next = Object.assign({ unit_id: r.unit }, o || {});
    let ch = false;
    if (take(o && o.status, r.status) && (!o || o.status !== r.status)) { next.status = r.status; next.done_at = null; next.done_from = null; ch = true; }   // 옮겨 온 계약완료 = 날짜 없음
    if (take(o && o.move_out, r.moveOut) && (!o || o.move_out !== r.moveOut)) { next.move_out = r.moveOut; ch = true; }
    if (ch) {
      undo.conv.push(o || { unit_id: r.unit, _none: 1 });
      st.push(upConv(db, Object.assign(next, { at: now, by: by + ' (자료 옮기기)' }))); n.conv++;
      if (pub[r.unit] && !canPub(next.status)) { undo.pub.push(pub[r.unit]); st.push(db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(r.unit)); n.unpub++; }
    }
    // 임차인 상담카드
    const c = cards[r.unit], p = priceOf(r.unit);
    if (!c) {
      const id = ulid(now);
      const data = { birth: r.birth, moveOut: r.moveOut, price: p ? p.benefit : null, deposit: p && p.dep ? p.dep : null };
      Object.keys(data).forEach(k => data[k] == null && delete data[k]);
      st.push(ins(db, 'consults', { id, kind: 'tenant', unit_id: r.unit, name: r.name, phone: r.phone, progress: r.prog || '상담중', mgr: r.team, writer: '자료 옮기기', data: JSON.stringify(data), created_at: now, at: now, by }));
      undo.created.push(id); n.cardNew++;
    } else {
      const d = parse(c.data) || {}, patch = {};
      [['name', r.name], ['phone', r.phone], ['mgr', r.team], ['progress', r.prog]].forEach(([k, v]) => { if (take(c[k], v) && c[k] !== v) patch[k] = v; });
      let dch = false;
      [['birth', r.birth], ['moveOut', r.moveOut]].forEach(([k, v]) => { if (take(d[k], v) && d[k] !== v) { d[k] = v; dch = true; } });
      if (dch) patch.data = JSON.stringify(d);
      if (Object.keys(patch).length) {
        undo.cards.push(c);
        const k = Object.keys(patch);
        st.push(db.prepare('UPDATE consults SET ' + k.map(x => x + ' = ?').join(', ') + ', at = ?, by = ? WHERE id = ?').bind(...k.map(x => patch[x]), now, by, c.id)); n.cardUpd++;
      }
    }
  }
  const id = ulid(now);
  st.push(ins(db, 'migrate_log', { id, kind: 'roster', at: now, by, mode, summary: JSON.stringify(n), undo: JSON.stringify(undo) }));
  await run(db, st);
  return Object.assign({ id }, n);
}

export const migrateLogs = async db => (await all(db, 'SELECT id, kind, at, by, mode, summary, undone_at, undone_by FROM migrate_log ORDER BY at DESC LIMIT 20')).map(r => Object.assign(r, { summary: parse(r.summary) || {} }));

// 되돌리기: 만든 카드 지움 · 바꾼 카드 · 전환상태 · 공개를 옮기기 전으로. 그 뒤 직원이 고친 것(at 이 옮긴 시각과 다름)은 남김
export async function undoRoster(db, id, by, now = Date.now()) {
  const log = await db.prepare('SELECT * FROM migrate_log WHERE id = ?').bind(id).first();
  if (!log) return { err: 'notfound' };
  if (log.undone_at) return { err: 'done' };
  const u = parse(log.undo) || {}, st = [], n = { cardDel: 0, cardBack: 0, conv: 0, pub: 0, kept: 0 };
  const cur = Object.fromEntries((await all(db, 'SELECT id, at FROM consults')).map(r => [r.id, r.at]));
  const logged = new Set((await all(db, 'SELECT DISTINCT consult_id FROM consult_logs')).map(r => r.consult_id));
  const conv = Object.fromEntries((await all(db, 'SELECT unit_id, at FROM unit_conv')).map(r => [r.unit_id, r.at]));
  for (const cid of u.created || []) {
    if (cur[cid] !== log.at || logged.has(cid)) { n.kept++; continue; }
    st.push(db.prepare('DELETE FROM consults WHERE id = ?').bind(cid)); n.cardDel++;
  }
  for (const c of u.cards || []) {
    if (cur[c.id] !== log.at) { n.kept++; continue; }
    const k = ['name', 'phone', 'mgr', 'progress', 'data', 'at', 'by'];
    st.push(db.prepare('UPDATE consults SET ' + k.map(x => x + ' = ?').join(', ') + ' WHERE id = ?').bind(...k.map(x => c[x] ?? null), c.id)); n.cardBack++;
  }
  const back = new Set();
  for (const c of u.conv || []) {
    if (conv[c.unit_id] !== log.at) { n.kept++; continue; }
    st.push(c._none ? db.prepare('DELETE FROM unit_conv WHERE unit_id = ?').bind(c.unit_id) : upConv(db, c)); n.conv++; back.add(c.unit_id);
  }
  // 옮기기 때문에 내려간 공개 세대는 전환상태를 되돌린 경우에만 다시 공개
  for (const p of (u.pub || []).filter(p => back.has(p.unit_id))) {
    const k = Object.keys(p);
    st.push(db.prepare('INSERT OR IGNORE INTO public_units (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => p[x] ?? null))); n.pub++;
  }
  st.push(db.prepare('UPDATE migrate_log SET undone_at = ?, undone_by = ? WHERE id = ?').bind(now, by, id));
  await run(db, st);
  return n;
}
