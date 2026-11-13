// 이관 비교 (설계서 4.3 4번 · 1.4 기준 6) — 백업 내용 두 개를 표마다 '건수 + 지문값(SHA-256)'으로 대조
//   줄 순서 · 칸 순서는 따지지 않고, 값은 글자/숫자/빈칸 종류까지 같아야 같다고 본다
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function tableFp(t) {
  const cols = (t && t.cols) || [], order = cols.map((c, i) => [c, i]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lines = ((t && t.rows) || []).map(r => JSON.stringify(order.map(([c, i]) => [c, r[i] === undefined ? null : r[i]]))).sort();
  return { n: lines.length, hash: hex(await crypto.subtle.digest('SHA-256', enc.encode(lines.join('\n')))) };
}

export async function fingerprint(data) {
  const out = {};
  for (const name of Object.keys(data.tables || {}).sort()) out[name] = await tableFp(data.tables[name]);
  return out;
}

// → { same: true/false, rows: [{ t, a: {n, hash}, b: {n, hash}, ok }] }  · skip: 비교에서 뺄 표 (예: 이관 뒤 바로 쌓이는 감사기록)
export async function compare(a, b, skip = []) {
  const fa = await fingerprint(a), fb = await fingerprint(b), rows = [];
  for (const t of [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()) {
    if (skip.includes(t)) continue;
    const x = fa[t] || null, y = fb[t] || null;
    rows.push({ t, a: x, b: y, ok: !!(x && y && x.n === y.n && x.hash === y.hash) });
  }
  return { same: rows.every(r => r.ok), rows };
}

export const report = c => c.rows.map(r => (r.ok ? '  ✔ ' : '  ✖ ') + r.t.padEnd(18) + ' ' + String(r.a ? r.a.n : '없음').padStart(6) + ' ↔ ' + String(r.b ? r.b.n : '없음').padEnd(6) + (r.ok ? '' : '  ← 다름')).join('\n')
  + '\n' + (c.same ? '→ 100% 일치 (' + c.rows.length + '개 표)' : '→ 다른 표 ' + c.rows.filter(r => !r.ok).length + '개');

// 백업 내용 → D1(SQLite)에 넣을 SQL 글 (Supabase → D1 되돌아가기: npx wrangler d1 execute hwip-db --remote --file 파일)
export function toSqlite(data, skip = []) {
  const q = n => '"' + String(n).replace(/"/g, '""') + '"';
  const v = x => x == null ? 'NULL' : typeof x === 'number' ? (Number.isFinite(x) ? String(x) : 'NULL') : typeof x === 'boolean' ? (x ? '1' : '0') : "'" + String(x).replace(/'/g, "''") + "'";
  const out = [];
  for (const t of Object.keys(data.tables)) {
    if (skip.includes(t)) continue;
    const { cols = [], rows = [] } = data.tables[t];
    out.push('DELETE FROM ' + q(t) + ';');
    for (const r of rows) out.push('INSERT INTO ' + q(t) + ' (' + cols.map(q).join(', ') + ') VALUES (' + cols.map((c, i) => v(r[i])).join(', ') + ');');
  }
  return out.join('\n') + '\n';
}
