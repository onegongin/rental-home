// 세대 상세(소유자 · 임대차 이력) · 임차만기 목록 · 지난 임대차 고치기 — 직원용
//   이름 · 전화번호는 권한(unit.raw) 없으면 서버에서 가려서 보냄
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskName, maskPhone } from '../core/mask.js';
import { normDate, normMan, OCCS } from '../core/tenancy.js';
import { repo } from '../repo/index.js';
import { TEN_EDIT } from '../repo/d1.js';
import { getOne } from '../repo/kv.js';
import { audit } from '../repo/audit.js';

const hide = (o, raw) => {
  if (raw || !o) return o;
  const x = Object.assign({}, o, { name: maskName(o.name), phone: maskPhone(o.phone), memo: o.memo ? '' : o.memo });
  if (Array.isArray(x.contacts)) x.contacts = x.contacts.map(c => Object.assign({}, c, { phone: maskPhone(c.phone) }));
  return x;
};

export async function staffUnits(req, env, url, u) {
  const R = repo(env), p = url.pathname, raw = can(u, 'unit.raw');

  let m = p.match(/^\/api\/staff\/units\/([\d]+-[\d]+)$/);
  if (m && req.method === 'GET') {
    const d = await R.unitDetail(m[1]);
    if (!d) return J({ ok: false, err: 'notfound' }, 404);
    return J({ ok: true, raw, unit: d.unit, owners: d.owners.map(o => hide(o, raw)), tenancies: d.tenancies.map(t => hide(t, raw)) });
  }

  if (p === '/api/staff/tenancies' && req.method === 'GET') {
    const rows = await R.currentTenancies();
    return J({ ok: true, raw, occs: OCCS, rows: rows.map(t => hide(t, raw)) });
  }

  m = p.match(/^\/api\/staff\/tenancies\/([0-9A-Z]{26})$/);
  if (m && (req.method === 'PATCH' || req.method === 'POST')) {
    const perms = await getOne(env.DB, 'cfg', 'perms');
    if (!can(u, 'tenancy.edit', null, perms)) return J({ ok: false, err: 'perm' }, 403);
    const t = await R.getTenancy(m[1]);
    if (!t || t.deleted_at) return J({ ok: false, err: 'notfound' }, 404);
    if (t.is_current) return J({ ok: false, err: 'current', msg: '현재 임대차는 세대 정보 창에서 고칩니다' }, 409);
    const b = await body(req) || {}, patch = {};
    for (const k of TEN_EDIT) {
      if (!(k in b)) continue;
      let v = b[k];
      if (/date|move_in|moved_out/.test(k)) { v = normDate(v); if (v === null) return J({ ok: false, err: 'input', field: k }, 400); }
      else if (k === 'deposit' || k === 'rent') { v = normMan(v); if (v === null) return J({ ok: false, err: 'input', field: k }, 400); }
      else if (k === 'implicit_renewal' || k === 'ours') v = v ? 1 : 0;
      else if (k === 'kind') { if (!['전세', '월세', '반전세'].includes(v)) return J({ ok: false, err: 'input', field: k }, 400); }
      else v = String(v || '').slice(0, 500);
      patch[k] = v === '' ? null : v;
    }
    await R.updateTenancy(t, patch, u.name);
    await audit(env.DB, { who: u.name, act: '지난 임대차 수정', target: t.unit_id, detail: Object.keys(patch).join(', '), ip: ip(req), dev: device(req) });
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
