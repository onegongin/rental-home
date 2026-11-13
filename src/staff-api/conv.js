// 세대 전환 상태 · 공개 세대 고르기 (R2, 시안 r2-public-pick 확정 2026-11-13) — 직원용
//   GET  /api/staff/conv               → 300세대 상태 · 퇴거일 · 메모 · 공개 여부 + 내 권한
//   POST /api/staff/conv/101-1502      { status, move_out, memo }  (세대 고치기 권한) — 공개 불가 상태가 되면 공개 자동 내림
//   POST /api/staff/conv/101-1502/pub  { on }                       (대표 · 관리자 · 권한자)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { CONV, PUB_KIND, KIND_KO, cleanConv } from '../core/conv.js';
import { UNIT } from '../core/units.js';
import { listConv, getConv, setConv, setPub } from '../repo/conv.js';
import { getOne } from '../repo/kv.js';
import { audit } from '../repo/audit.js';

export async function staffConv(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  const perms = await getOne(db, 'cfg', 'perms');

  if (p === '/api/staff/conv' && req.method === 'GET') {
    const { conv, pub } = await listConv(db);
    return J({ ok: true, statuses: CONV, pubKinds: PUB_KIND, kindKo: KIND_KO, canEdit: can(u, 'conv.edit', null, perms), canPub: can(u, 'unit.publish'), conv, pub });
  }

  let m = p.match(/^\/api\/staff\/conv\/(\d+-\d+)$/);
  if (m && req.method === 'POST') {
    if (!UNIT[m[1]]) return J({ ok: false, err: 'notfound' }, 404);
    if (!can(u, 'conv.edit', null, perms)) return J({ ok: false, err: 'perm' }, 403);
    const v = cleanConv(await body(req));
    if (!v) return J({ ok: false, err: 'input' }, 400);
    const old = await getConv(db, m[1]);
    const off = await setConv(db, m[1], v, u.name);
    if (!old || old.status !== v.status || old.move_out !== v.move_out)
      await audit(db, Object.assign({ act: '전환 상태', target: '세대 ' + m[1], detail: ((old && old.status) || '미정') + ' → ' + (v.status || '미정') + (v.move_out ? ' · 퇴거 ' + v.move_out : '') + (off ? ' · 공개 자동 내림' : '') }, who));
    return J({ ok: true, unpublished: off });
  }

  m = p.match(/^\/api\/staff\/conv\/(\d+-\d+)\/pub$/);
  if (m && req.method === 'POST') {
    if (!UNIT[m[1]]) return J({ ok: false, err: 'notfound' }, 404);
    if (!can(u, 'unit.publish')) return J({ ok: false, err: 'perm' }, 403);
    const on = !!((await body(req)) || {}).on;
    const r = await setPub(db, m[1], on, u.name);
    if (r === 'status') return J({ ok: false, err: 'status', msg: '공실 · 퇴거확정(매물동의) 세대만 공개할 수 있습니다' }, 409);
    await audit(db, Object.assign({ act: on ? '세대 공개' : '세대 공개 내림', target: '세대 ' + m[1] }, who));
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
