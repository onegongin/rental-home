// 감사기록 (설계서 7.4): 누가 · 언제 · 어느 기기 · 무엇을
export function audit(db, a) {
  return db.prepare('INSERT INTO audit (at, who, act, target, detail, ip, dev) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), a.who || '', a.act, String(a.target || '').slice(0, 200), String(a.detail || '').slice(0, 500), a.ip || '', String(a.dev || '').slice(0, 160)).run();
}

export async function listAudit(db, before, limit) {
  const r = await db.prepare('SELECT id, at, who, act, target, detail, ip, dev FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?')
    .bind(before || Number.MAX_SAFE_INTEGER, Math.min(Math.max(Number(limit) || 100, 1), 500)).all();
  return r.results || [];
}
