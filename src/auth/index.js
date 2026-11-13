// 로그인 · 출입증(세션) · 기기 등록 (설계서 7.1)
//  ① 기기 등록: 사무실 코드(STAFF_KEY)를 그 기기에서 한 번 → 기기증 쿠키 1년
//  ② 등록된 기기에서만 이름 + PIN 로그인 → 출입증 쿠키 8시간
//  ③ PIN 5회 틀리면 15분 잠금 (서버 저장)
import { J, body, cookie, setCookie, ip, device } from '../lib/http.js';
import { randomHex, sha256, pinHash, same, validPin } from './crypto.js';
import * as A from '../repo/auth.js';
import { getOne, purgePins } from '../repo/kv.js';
import { audit } from '../repo/audit.js';
import { hit } from '../repo/rate.js';
import { ROLES } from '../core/permissions.js';
import { notify, reps } from '../notify/index.js';

const SESSION_MS = 8 * 3600e3, DEVICE_MS = 365 * 86400e3, LOCK_MS = 15 * 60e3, MAX_FAILS = 5;
const SC = 'hwip_s', DC = 'hwip_dev';
const validName = n => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 20;

export async function currentDevice(req, env) {
  const t = cookie(req, DC);
  if (!t) return null;
  const tok = await sha256(t);
  const d = await A.getDevice(env.DB, tok);
  return d && !d.revoked && d.exp > Date.now() ? d : null;
}

// 로그인한 직원 { name, role, mustChange } 또는 null. 출입증은 발급받은 기기에서만 통함
export async function currentUser(req, env) {
  const t = cookie(req, SC);
  if (!t) return null;
  const tok = await sha256(t);
  const s = await A.getSession(env.DB, tok);
  if (!s || s.exp < Date.now() || !s.active) return null;
  const d = await currentDevice(req, env);
  if (!d || d.tok !== s.dev) return null;
  return { name: s.name, role: s.role, mustChange: !!s.must_change, tok };
}

async function startSession(req, env, name, dev) {
  const t = randomHex(32);
  await A.addSession(env.DB, await sha256(t), name, dev, Date.now() + SESSION_MS);
  if (Math.random() < 0.05) await A.cleanSessions(env.DB);
  return setCookie(req, SC, t, SESSION_MS / 1000);
}

export async function authApi(req, env, url) {
  const db = env.DB, p = url.pathname, who = { ip: ip(req), dev: device(req) };

  if (p === '/api/auth/me' && req.method === 'GET') {
    const d = await currentDevice(req, env);
    const u = d ? await currentUser(req, env) : null;
    const setup = !!d && !(await A.hasAnyPin(db));
    const staff = d ? (await A.listStaff(db)).filter(x => x.active).map(x => ({ name: x.name, role: x.role })) : [];
    let candidates = [];
    if (setup) { const old = await getOne(db, 'cfg', 'roles') || {}; candidates = Object.keys(old).filter(n => old[n] === '관리자' || old[n] === '대표'); }
    // restoreAt: 백업에서 되돌린 시각 (P7) — 화면은 이 값이 바뀌면 기기에 저장해 둔 자료를 버리고 처음부터 다시 받는다
    const restoreAt = u ? await getOne(db, 'cfg', 'restoreAt') : null;
    return J({ ok: true, device: !!d, user: u && { name: u.name, role: u.role, mustChange: u.mustChange }, setup, staff, candidates, restoreAt });
  }

  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {};

  if (p === '/api/auth/device') {
    if (!env.STAFF_KEY) return J({ ok: false, err: 'config' }, 500);
    if (!(await hit(db, 'dev:' + who.ip, 10, 10 * 60e3))) return J({ ok: false, err: 'rate' }, 429);
    if (!same(String(b.code || ''), env.STAFF_KEY)) { await audit(db, Object.assign({ act: '기기등록 실패' }, who)); return J({ ok: false, err: 'code' }, 401); }
    const t = randomHex(32);
    await A.addDevice(db, await sha256(t), who.dev, Date.now() + DEVICE_MS);
    await audit(db, Object.assign({ act: '기기등록' }, who));
    return J({ ok: true }, 200, [setCookie(req, DC, t, DEVICE_MS / 1000)]);
  }

  if (p === '/api/auth/logout') {
    const u = await currentUser(req, env);
    if (u) { await A.delSession(db, u.tok); await audit(db, Object.assign({ who: u.name, act: '로그아웃' }, who)); }
    return J({ ok: true }, 200, [setCookie(req, SC, '', 0)]);
  }

  const d = await currentDevice(req, env);
  if (!d) return J({ ok: false, err: 'device' }, 401);

  // 처음 한 번: 대표 PIN 만들기. 옛 화면 직원 명단은 PIN 없이 옮겨 둠 (대표가 임시 PIN 발급)
  if (p === '/api/auth/setup') {
    if (await A.hasAnyPin(db)) return J({ ok: false, err: 'done' }, 409);
    const name = String(b.name || '').trim();
    if (!validName(name) || !validPin(b.pin)) return J({ ok: false, err: 'input' }, 400);
    const old = await getOne(db, 'cfg', 'roles') || {};
    for (const n of Object.keys(old)) if (n !== name && validName(n)) await A.addStaff(db, n, ROLES.includes(old[n]) && old[n] !== '대표' ? old[n] : '직원');
    await A.addStaff(db, name, '대표');
    const salt = randomHex(16);
    await A.setPin(db, name, await pinHash(b.pin, salt), salt, false);
    await purgePins(db);
    await A.syncRoles(db);
    await audit(db, Object.assign({ who: name, act: '대표 PIN 처음 설정' }, who));
    return J({ ok: true }, 200, [await startSession(req, env, name, d.tok)]);
  }

  if (p === '/api/auth/login') {
    if (!(await hit(db, 'login:' + who.ip, 30, 10 * 60e3))) return J({ ok: false, err: 'rate' }, 429);
    const name = String(b.name || '').trim();
    const s = validName(name) ? await A.getStaff(db, name) : null;
    if (!s || !s.active) return J({ ok: false, err: 'pin' }, 401);
    const now = Date.now();
    if (s.lock_until > now) return J({ ok: false, err: 'locked', until: s.lock_until }, 423);
    if (!s.hash) return J({ ok: false, err: 'nopin' }, 400);
    if (!validPin(b.pin) || !same(await pinHash(b.pin, s.salt), s.hash)) {
      const n = (s.fails || 0) + 1;
      if (n >= MAX_FAILS) {
        await A.setFails(db, name, 0, now + LOCK_MS);
        await audit(db, Object.assign({ who: name, act: '로그인 잠김', detail: MAX_FAILS + '회 실패 · 15분' }, who));
        await notify(env, { kind: 'security', urgent: true, text: '[긴급 · 로그인 잠김] ' + name + ' · PIN ' + MAX_FAILS + '회 틀림 → 15분 잠금\nIP ' + who.ip + ' · ' + who.dev.slice(0, 60), dm: await reps(db), path: '?go=audit' });
        return J({ ok: false, err: 'locked', until: now + LOCK_MS }, 423);
      }
      await A.setFails(db, name, n, 0);
      await audit(db, Object.assign({ who: name, act: '로그인 실패', detail: n + '/' + MAX_FAILS }, who));
      return J({ ok: false, err: 'pin', n, max: MAX_FAILS }, 401);
    }
    await A.setFails(db, name, 0, 0);
    await audit(db, Object.assign({ who: name, act: '로그인' }, who));
    return J({ ok: true, user: { name, role: s.role, mustChange: !!s.must_change } }, 200, [await startSession(req, env, name, d.tok)]);
  }

  // 내 PIN 바꾸기 (임시 PIN 받은 뒤 첫 로그인 때 필수)
  if (p === '/api/auth/pin') {
    const u = await currentUser(req, env);
    if (!u) return J({ ok: false, err: 'auth' }, 401);
    if (!validPin(b.pin)) return J({ ok: false, err: 'input' }, 400);
    const salt = randomHex(16);
    await A.setPin(db, u.name, await pinHash(b.pin, salt), salt, false);
    await A.delSessionsOf(db, u.name, u.tok);
    await audit(db, Object.assign({ who: u.name, act: 'PIN 변경' }, who));
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
