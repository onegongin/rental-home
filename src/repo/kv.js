// 화면 공유 자료 (설정 cfg · 세대 u · 상담카드 c) 읽기 · 쓰기 — 직원 API 전용
export async function pullRows(db, since, lim) {
  const r = await db.prepare('SELECT s, k, v, at, by, sv FROM kv WHERE sv > ? ORDER BY sv LIMIT ?').bind(since, lim).all();
  return r.results || [];
}

// 지금 저장된 값 여러 개 (권한 검사 · 가림 되돌리기용). { 'c|id': 값 }
export async function getMany(db, keys) {
  const out = {};
  const by = {};
  keys.forEach(([s, k]) => { (by[s] = by[s] || []).push(String(k)); });
  for (const s of Object.keys(by)) {
    const ks = [...new Set(by[s])];
    for (let i = 0; i < ks.length; i += 90) {
      const part = ks.slice(i, i + 90);
      const r = await db.prepare('SELECT k, v FROM kv WHERE s = ? AND k IN (' + part.map(() => '?').join(',') + ')').bind(s, ...part).all();
      (r.results || []).forEach(x => { out[s + '|' + x.k] = parse(x.v); });
    }
  }
  return out;
}

export async function getOne(db, s, k) {
  const r = await db.prepare('SELECT v FROM kv WHERE s = ? AND k = ?').bind(s, k).first();
  return r ? parse(r.v) : null;
}

// rows: [{ s, k, v(문자열), at, by }] — 같은 칸은 나중 시각(at)이 이김
export async function putRows(db, rows) {
  let sv = Date.now() * 1000;
  const st = [];
  for (const x of rows) {
    sv += 1;
    st.push(db.prepare('INSERT INTO kv (s, k, v, at, by, sv) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (s, k) DO UPDATE SET v = excluded.v, at = excluded.at, by = excluded.by, sv = excluded.sv WHERE excluded.at >= kv.at').bind(x.s, String(x.k), x.v, x.at, x.by, sv));
    st.push(db.prepare('INSERT INTO hist (s, k, v, at, by, sv) VALUES (?, ?, ?, ?, ?, ?)').bind(x.s, String(x.k), x.v, x.at, x.by, sv));
  }
  for (let i = 0; i < st.length; i += 100) await db.batch(st.slice(i, i + 100));
}

export async function histRows(db, s, k) {
  const r = await db.prepare('SELECT v, at, by FROM hist WHERE s = ? AND k = ? ORDER BY id DESC LIMIT 50').bind(s, k).all();
  return r.results || [];
}

// 옛 브라우저 PIN 암호값 지우기 (서버 PIN으로 바꾼 뒤)
export async function purgePins(db) {
  await db.batch([
    db.prepare("DELETE FROM hist WHERE s = 'cfg' AND k = 'pins'"),
    db.prepare("UPDATE kv SET v = '{}', at = ?, by = '서버', sv = ? WHERE s = 'cfg' AND k = 'pins'").bind(Date.now(), Date.now() * 1000)
  ]);
}

export function parse(v) { try { return JSON.parse(v); } catch (e) { return null; } }
