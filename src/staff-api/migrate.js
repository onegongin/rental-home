// 기존 자료 옮기기 — 고객DB (R4, 시안 r4-migrate 확정 2026-11-13) — 대표 · 관리자만 (migrate)
//   POST /api/admin/migrate/roster { rows, mode, dry }  dry = 미리보기(저장 안 함) · 아니면 적용
//   GET  /api/admin/migrate                            지난 옮기기 목록
//   POST /api/admin/migrate/:id/undo                   되돌리기
//   미리보기 응답의 이름 · 연락처 · 생년월일은 가려서 보냄 (화면에 그대로 띄우지 않게)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskName, maskPhone } from '../core/mask.js';
import { readRows } from '../core/migrate.js';
import { applyRoster, migrateLogs, undoRoster } from '../repo/migrate.js';
import { audit } from '../repo/audit.js';

export async function migrateApi(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  if (!can(u, 'migrate')) return J({ ok: false, err: 'perm', msg: '자료 옮기기는 대표 · 관리자만 할 수 있습니다' }, 403);

  if (p === '/api/admin/migrate' && req.method === 'GET') return J({ ok: true, logs: await migrateLogs(db) });

  if (p === '/api/admin/migrate/roster' && req.method === 'POST') {
    const b = await body(req) || {}, mode = b.mode === 'over' ? 'over' : 'fill';
    const R = readRows(b.rows);
    if (!R.rows.length) return J({ ok: false, err: 'input', msg: '옮길 줄이 없습니다', errors: R.errors.slice(0, 50) }, 400);
    if (b.dry) return J({ ok: true, dry: true, n: R.rows.length, byStatus: R.byStatus, errors: R.errors.slice(0, 100), warns: R.warns.slice(0, 100),
      sample: R.rows.slice(0, 8).map(r => ({ unit: r.unit, team: r.team, name: maskName(r.name), phone: maskPhone(r.phone), birth: r.birth ? r.birth.slice(0, 2) + '****' : '', status: r.status, moveOut: r.moveOut })) });
    const n = await applyRoster(db, R.rows, mode, u.name);
    await audit(db, Object.assign({ act: '자료 옮기기 (고객DB)', target: n.id, detail: mode + ' · 카드 새로 ' + n.cardNew + ' · 고침 ' + n.cardUpd + ' · 전환상태 ' + n.conv + (R.errors.length ? ' · 오류로 뺀 줄 ' + R.errors.length : '') }, who));
    return J({ ok: true, result: n, skipped: R.errors.length });
  }

  const m = p.match(/^\/api\/admin\/migrate\/([0-9A-Z]{26})\/undo$/);
  if (m && req.method === 'POST') {
    const n = await undoRoster(db, m[1], u.name);
    if (n.err) return J({ ok: false, err: n.err, msg: n.err === 'done' ? '이미 되돌렸습니다' : '찾을 수 없습니다' }, n.err === 'done' ? 409 : 404);
    await audit(db, Object.assign({ act: '자료 옮기기 되돌림', target: m[1], detail: '카드 지움 ' + n.cardDel + ' · 카드 되돌림 ' + n.cardBack + ' · 전환상태 ' + n.conv + ' · 그 뒤 고쳐서 남김 ' + n.kept }, who));
    return J({ ok: true, result: n });
  }
  return J({ ok: false, err: 'notfound' }, 404);
}
