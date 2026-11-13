// 횟수 제한: win(밀리초) 안에 limit 번까지 허용. 넘으면 false
export async function hit(db, k, limit, win) {
  const now = Date.now();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate WHERE reset < ?').bind(now).run();
  const r = await db.prepare('SELECT n, reset FROM rate WHERE k = ?').bind(k).first();
  if (!r || r.reset <= now) {
    await db.prepare('INSERT INTO rate (k, n, reset) VALUES (?, 1, ?) ON CONFLICT (k) DO UPDATE SET n = 1, reset = excluded.reset').bind(k, now + win).run();
    return true;
  }
  if (r.n >= limit) return false;
  await db.prepare('UPDATE rate SET n = n + 1 WHERE k = ?').bind(k).run();
  return true;
}
