// 전체 백업 · 복구 — 표를 통째로 읽고 쓴다 (D1). P8 Supabase 통역기도 같은 모양을 내면 이관 파일로 그대로 쓸 수 있음
import { FORMAT } from '../backup/pack.js';

// 백업에 안 담는 표: 출입증 · 횟수 제한 · 일회용 연결 코드 · 잠금용 빈 표 (복구해도 의미 없거나 위험)
const SKIP = new Set(['sessions', 'rate', 'tg_links', 'listing_guard']);
// 복구 때 지금 그대로 두는 표 — 퇴사자 · 해지한 기기가 되살아나지 않게, 감사기록은 지우지 않게 (2026-11-03)
// media(팝업 파일 정보)도 그대로 — 파일 자체는 백업에 없어서 되돌리면 지운 파일이 '있는 척' 하게 됨 (2026-11-04)
export const KEEP = ['staff', 'devices', 'audit', 'media'];
const PAGE = 1000;
const q = n => '"' + String(n).replace(/"/g, '""') + '"';

export async function tables(db) {
  const r = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all();
  return (r.results || []).map(x => x.name).filter(n => !SKIP.has(n));
}
export async function colsOf(db, t) {
  const r = await db.prepare('PRAGMA table_info(' + q(t) + ')').all();
  return (r.results || []).map(x => x.name);
}

export async function counts(db) {
  const o = {};
  for (const t of await tables(db)) o[t] = (await db.prepare('SELECT COUNT(*) n FROM ' + q(t)).first()).n;
  return o;
}

// 전체 표 → 백업 내용 (1000줄씩 나눠 읽음)
export async function dump(db, by) {
  const out = { format: FORMAT, v: 1, at: Date.now(), by: by || '', tables: {} };
  for (const t of await tables(db)) {
    const cols = await colsOf(db, t), rows = [], sel = 'SELECT rowid AS _r, ' + cols.map(q).join(', ') + ' FROM ' + q(t) + ' WHERE rowid > ? ORDER BY rowid LIMIT ' + PAGE;
    let last = 0;
    for (;;) {
      const r = (await db.prepare(sel).bind(last).all()).results || [];
      r.forEach(x => rows.push(cols.map(c => x[c] === undefined ? null : x[c])));
      if (r.length < PAGE) break;
      last = r[r.length - 1]._r;
    }
    out.tables[t] = { cols, rows };
  }
  return out;
}

// 백업 내용 → 지금 DB. 표마다 비우고 다시 넣음 (KEEP 표 · 지금 DB에 없는 표 · 없는 칸은 건너뜀)
//   한 묶음(batch) = 한 번에 성공 또는 전부 취소. 줄이 많아 여러 묶음으로 나뉘면, 중간 실패는 '복구 직전 백업'으로 되돌린다
//   opt.all: KEEP 표까지 통째로 (DB 이관 — tools/db_move.mjs)
export async function restore(db, data, opt = {}) {
  const now = new Set(await tables(db)), st = [], done = {};
  for (const t of Object.keys(data.tables)) {
    if (!now.has(t) || (KEEP.includes(t) && !opt.all)) continue;
    const cur = new Set(await colsOf(db, t)), src = data.tables[t] || {};
    const cols = (src.cols || []).filter(c => cur.has(c)), idx = cols.map(c => src.cols.indexOf(c));
    st.push(db.prepare('DELETE FROM ' + q(t)));
    if (cols.length) {
      const sql = 'INSERT INTO ' + q(t) + ' (' + cols.map(q).join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')';
      for (const row of src.rows || []) st.push(db.prepare(sql).bind(...idx.map(i => row[i] === undefined ? null : row[i])));
    }
    done[t] = (src.rows || []).length;
  }
  for (let i = 0; i < st.length; i += 500) await db.batch(st.slice(i, i + 500));
  return done;
}

// 복구 뒤: 화면 동기화 번호를 새로 매겨 모든 직원 화면이 다시 받게 함
export async function restamp(db) {
  const base = Date.now() * 1000;
  await db.batch([
    db.prepare('UPDATE kv SET sv = ? + rowid * 2').bind(base),        // 세대 표와 번호가 겹치지 않게 짝수 · 홀수
    db.prepare('UPDATE units SET sv = ? + rowid * 2 + 1').bind(base)
  ]);
}
