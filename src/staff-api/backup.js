// 엑셀 내보내기 · 백업 · 복구 API (설계서 13.1 · 14장, P7)
//   /api/admin/export         GET 묶음 · 칸 목록 · 오늘 남은 횟수 / POST 자료 (대표 · 관리자, 하루 10번)
//   /api/admin/backup         GET 백업 목록 / POST op: now(지금 백업) · download(잠근 파일) · preview(건수 비교) · restore(대표 PIN 다시)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { audit } from '../repo/audit.js';
import { hit } from '../repo/rate.js';
import { putRows } from '../repo/kv.js';
import * as A from '../repo/auth.js';
import { counts, dump, restore, restamp, KEEP } from '../repo/backup.js';
import { rebuildPublic } from '../repo/listings.js';
import { pinHash, same, validPin } from '../auth/crypto.js';
import { gzip, lock, unpack, fromB64 } from '../backup/pack.js';
import { saveBackup, listBackups, readBackup, KIND_KO } from '../backup/index.js';
import { meta, cleanReq, build } from '../export/sheets.js';
import { notify, reps } from '../notify/index.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const BRAND = (SITE.site || {}).brand || '';   // 엑셀 · 백업 파일 이름 앞

export const EXPORT_LIMIT = 10;   // 한 사람 하루 내려받기 횟수 (설계서 13.1)
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const untilMidnight = () => { const t = Date.now(), d = new Date(t + 9 * 3600e3); d.setUTCHours(24, 0, 0, 0); return d.getTime() - 9 * 3600e3 - t; };
const PW_MIN = 8;
const ERR = { pw: '비밀번호가 맞지 않습니다', nopw: '잠긴 파일입니다 — 받을 때 정한 비밀번호를 넣으세요', format: '백업 파일이 아닙니다' };

export async function backupApi(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  // 그룹방 + 대표 개인 알림 (본인이 대표면 개인 알림은 안 감). 복구는 긴급(조용한 시간에도 · 못 끔)
  const tell = async (text, urgent) => notify(env, { kind: urgent ? 'security' : 'backup', urgent: !!urgent, text, dm: await reps(db), actor: u.name, path: '?go=audit' });

  // ── 엑셀 내보내기 ─────────────────────────────
  if (p === '/api/admin/export') {
    if (!can(u, 'export')) return J({ ok: false, err: 'perm' }, 403);
    const rk = 'export:' + u.name + ':' + kstDay();
    if (req.method === 'GET') {
      const r = await db.prepare('SELECT n, reset FROM rate WHERE k = ?').bind(rk).first();
      const used = r && r.reset > Date.now() ? r.n : 0;
      const mgrs = ((await db.prepare('SELECT name FROM staff WHERE active = 1 ORDER BY at').all()).results || []).map(x => x.name);
      return J({ ok: true, sets: meta(), left: Math.max(0, EXPORT_LIMIT - used), limit: EXPORT_LIMIT, mgrs });
    }
    const q = cleanReq(await body(req));
    if (!q.sets.length) return J({ ok: false, err: 'input' }, 400);
    if (!(await hit(db, rk, EXPORT_LIMIT, untilMidnight()))) return J({ ok: false, err: 'limit', limit: EXPORT_LIMIT }, 429);
    const sheets = await build(db, q);
    const sum = sheets.map(s => s.name + ' ' + s.rows.length + '건').join(' · ');
    const cond = [q.f.from || q.f.to ? (q.f.from || '처음') + '~' + (q.f.to || '오늘') : '', q.f.dong ? q.f.dong + '동' : '', q.f.deal, q.f.mgr ? '담당 ' + q.f.mgr : '', q.f.status].filter(Boolean).join(' · ');
    const masked = [q.mask.phone && '전화번호', q.mask.name && '이름'].filter(Boolean).join(' · ');
    await audit(db, Object.assign({ act: '엑셀 내보내기', target: sum, detail: [cond && '조건 ' + cond, masked ? '가림 ' + masked : '가림 없음'].filter(Boolean).join(' / ') }, who));
    await tell('[엑셀 내려받음] ' + u.name + '님이 ' + sum + (masked ? ' (가림: ' + masked + ')' : ' (원문)') + ' 내려받음');
    const file = BRAND + '_' + sheets.map(s => s.name.replace(/[\s·]+/g, '')).join('_') + '_' + kstDay().replace(/-/g, '') + '.xlsx';
    return J({ ok: true, file, sheets });
  }

  // ── 백업 ─────────────────────────────────────
  if (p !== '/api/admin/backup') return J({ ok: false, err: 'notfound' }, 404);
  if (!can(u, 'backup.list')) return J({ ok: false, err: 'perm' }, 403);

  if (req.method === 'GET') {
    const list = await listBackups(env);
    return J({ ok: true, r2: !!env.BACKUP, full: can(u, 'backup.full'), list: list.map(b => Object.assign(b, { kindKo: KIND_KO[b.kind] || b.kind })), counts: await counts(db), keep: KEEP });
  }

  const b = await body(req) || {};
  if (b.op === 'now') {
    if (!env.BACKUP) return J({ ok: false, err: 'nor2' }, 501);
    const r = await saveBackup(env, 'hand', u.name);
    await audit(db, Object.assign({ act: '백업 만들기', target: r.key, detail: r.rows + '줄' }, who));
    return J({ ok: true, backup: r });
  }

  if (!can(u, 'backup.full')) return J({ ok: false, err: 'perm' }, 403);

  // 전체 백업 받기 — 대표가 정한 비밀번호로 잠근 파일
  if (b.op === 'download') {
    if (String(b.pw || '').length < PW_MIN) return J({ ok: false, err: 'pwshort', min: PW_MIN }, 400);
    const data = await dump(db, u.name);
    const bytes = await lock(await gzip(JSON.stringify(data)), b.pw);
    const n = Object.values(data.tables).reduce((s, t) => s + t.rows.length, 0);
    await audit(db, Object.assign({ act: '전체 백업 받기', target: Object.keys(data.tables).length + '개 표', detail: n + '줄 · 비밀번호 잠금' }, who));
    await tell('[전체 백업 받음] ' + u.name + '님이 전체 백업 파일(' + n + '줄, 비밀번호 잠금)을 내려받음');
    const name = BRAND + '_전체백업_' + kstDay().replace(/-/g, '') + '.hwipbak';
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name) } });
  }

  // 미리보기 · 복구: 저장소의 백업(key) 또는 올린 파일(file = base64, 잠겼으면 pw)
  if (b.op === 'preview' || b.op === 'restore') {
    let raw = null;
    if (b.key) raw = await readBackup(env, b.key);
    else if (b.file) { try { raw = fromB64(b.file); } catch (e) { raw = null; } }
    if (!raw) return J({ ok: false, err: 'nofile', msg: '백업을 찾지 못했습니다' }, 404);
    let data;
    try { data = await unpack(raw, b.pw); } catch (e) { return J({ ok: false, err: e.message, msg: ERR[e.message] || '읽지 못했습니다' }, 400); }
    const now = await counts(db);
    const rows = Object.keys(Object.assign({}, now, data.tables)).sort().map(t => ({ t, now: now[t] ?? null, bak: data.tables[t] ? data.tables[t].rows.length : null, keep: KEEP.includes(t) }));
    const src = b.key ? '저장소 ' + b.key : '올린 파일';
    if (b.op === 'preview') return J({ ok: true, at: data.at, by: data.by || '', src, rows });

    // 복구 — 대표 PIN 다시 확인 → 지금 상태를 '복구 직전'으로 저장 → 되돌림
    const s = await A.getStaff(db, u.name);
    if (!validPin(b.pin) || !s || !s.hash || !same(await pinHash(b.pin, s.salt), s.hash)) {
      await audit(db, Object.assign({ act: '복구 PIN 틀림', target: src }, who));
      return J({ ok: false, err: 'pin', msg: 'PIN이 맞지 않습니다' }, 401);
    }
    if (!env.BACKUP) return J({ ok: false, err: 'nor2', msg: '백업 저장소(R2)가 없어 복구 직전 상태를 남길 수 없습니다' }, 501);
    const pre = await saveBackup(env, 'pre', u.name);
    let done;
    try { done = await restore(db, data); }
    catch (e) {
      // 묶음 중간 실패 → 방금 남긴 복구 직전 상태로 다시
      try { await restore(db, await unpack(await readBackup(env, pre.key))); } catch (e2) { /* 아래 알림으로 */ }
      await audit(db, Object.assign({ act: '복구 실패', target: src, detail: String(e && e.message || e).slice(0, 200) + ' → ' + pre.key + ' 로 되돌림' }, who));
      await tell('[긴급 · 복구 실패] ' + u.name + ' · ' + src + ' → 복구 직전 상태(' + pre.key + ')로 되돌렸습니다', true);
      return J({ ok: false, err: 'restore', msg: '복구 중 오류 — 복구 직전 상태로 되돌렸습니다', pre: pre.key }, 500);
    }
    await restamp(db);
    await A.syncRoles(db);                                   // 직원 명단은 지금 그대로 → 화면 명단 다시 씀
    await putRows(db, [{ s: 'cfg', k: 'restoreAt', v: JSON.stringify(Date.now()), at: Date.now(), by: u.name }]);   // 직원 화면: 이 값이 바뀌면 저장해 둔 자료를 버리고 새로 받음
    await rebuildPublic(db, u.name);                         // 공개 매물 사본도 복구한 매물 기준으로
    const when = new Date(data.at + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    await audit(db, Object.assign({ act: '복구', target: src, detail: when + ' 백업으로 · ' + Object.keys(done).length + '개 표 · 복구 직전 ' + pre.key }, who));
    await tell('[긴급 · 복구] ' + u.name + '님이 ' + when + ' 백업으로 전체 되돌림\n복구 직전 상태: ' + pre.key, true);
    return J({ ok: true, done, pre: pre.key, at: data.at });
  }

  return J({ ok: false, err: 'input' }, 400);
}
