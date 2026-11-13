// 직원 · 출입증(세션) · 등록 기기. 토큰은 원문 대신 sha256 값만 저장
import { putRows } from './kv.js';

export const getStaff = (db, name) => db.prepare('SELECT * FROM staff WHERE name = ?').bind(name).first();

export async function listStaff(db) {
  const r = await db.prepare('SELECT name, role, license, hash IS NOT NULL AS hasPin, must_change, lock_until, active FROM staff ORDER BY at').all();
  return r.results || [];
}

export async function hasAnyPin(db) {
  return !!(await db.prepare('SELECT 1 FROM staff WHERE hash IS NOT NULL AND active = 1 LIMIT 1').first());
}

export function addStaff(db, name, role) {
  return db.prepare('INSERT INTO staff (name, role, active, at) VALUES (?, ?, 1, ?) ON CONFLICT (name) DO UPDATE SET role = excluded.role, active = 1').bind(name, role, Date.now()).run();
}
export const setLicense = (db, name, lic) => db.prepare('UPDATE staff SET license = ? WHERE name = ?').bind(lic, name).run();
export const setRole = (db, name, role) => db.prepare('UPDATE staff SET role = ? WHERE name = ?').bind(role, name).run();
export const setPin = (db, name, hash, salt, mustChange) => db.prepare('UPDATE staff SET hash = ?, salt = ?, must_change = ?, fails = 0, lock_until = 0 WHERE name = ?').bind(hash, salt, mustChange ? 1 : 0, name).run();
export const setFails = (db, name, fails, lockUntil) => db.prepare('UPDATE staff SET fails = ?, lock_until = ? WHERE name = ?').bind(fails, lockUntil, name).run();
export const deactivate = (db, name) => db.prepare('UPDATE staff SET active = 0, hash = NULL, salt = NULL WHERE name = ?').bind(name).run();

// 직원 명단을 화면 공유 설정(cfg.roles)에 다시 써 둔다 — 화면은 이것만 보고 이름 · 역할을 그림
export async function syncRoles(db) {
  const r = await db.prepare('SELECT name, role, license FROM staff WHERE active = 1 ORDER BY at').all();
  const o = {}, lic = {};
  (r.results || []).forEach(x => { o[x.name] = x.role; lic[x.name] = x.license || ''; });
  // 자격(공인중개사 · 중개보조원)도 같이 — 설정 › 담당자 화면에 표시
  await putRows(db, [{ s: 'cfg', k: 'roles', v: JSON.stringify(o), at: Date.now(), by: '서버' }, { s: 'cfg', k: 'licenses', v: JSON.stringify(lic), at: Date.now(), by: '서버' }]);
}

export const addSession = (db, tok, name, dev, exp) => db.prepare('INSERT INTO sessions (tok, name, dev, exp, at) VALUES (?, ?, ?, ?, ?)').bind(tok, name, dev, exp, Date.now()).run();
export const getSession = (db, tok) => db.prepare('SELECT s.name, s.dev, s.exp, f.role, f.must_change, f.active FROM sessions s JOIN staff f ON f.name = s.name WHERE s.tok = ?').bind(tok).first();
export const delSession = (db, tok) => db.prepare('DELETE FROM sessions WHERE tok = ?').bind(tok).run();
export const delSessionsOf = (db, name, keepTok) => db.prepare('DELETE FROM sessions WHERE name = ? AND tok != ?').bind(name, keepTok || '').run();
export const cleanSessions = db => db.prepare('DELETE FROM sessions WHERE exp < ?').bind(Date.now()).run();

export const addDevice = (db, tok, label, exp) => db.prepare('INSERT INTO devices (tok, label, at, exp, seen) VALUES (?, ?, ?, ?, ?)').bind(tok, label, Date.now(), exp, Date.now()).run();
export const getDevice = (db, tok) => db.prepare('SELECT tok, label, exp, revoked FROM devices WHERE tok = ?').bind(tok).first();
