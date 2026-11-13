// 관리 API — 직원 · 권한 관리(대표), 감사기록 보기(대표 · 관리자), 엑셀 가져오기 · 내보내기, 백업 · 복구
import { J, body, ip, device } from '../lib/http.js';
import { randomHex, pinHash, validPin } from '../auth/crypto.js';
import { can, ROLES } from '../core/permissions.js';
import * as A from '../repo/auth.js';
import { audit, listAudit } from '../repo/audit.js';
import { importApi } from './import.js';
import { rebuildPublic } from '../repo/listings.js';
import { LICENSES } from '../core/listings.js';
import { notify, reps as repNames } from '../notify/index.js';
import { notifyAdmin } from './notify.js';
import { backupApi } from './backup.js';
import { uploadMedia, mediaUsage } from '../popups/index.js';
import { govAdmin } from '../gov/index.js';
import { migrateApi } from './migrate.js';

export async function adminApi(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };

  if (p === '/api/admin/staff' && req.method === 'GET') {
    if (!can(u, 'staff.list')) return J({ ok: false, err: 'perm' }, 403);
    const now = Date.now();
    return J({ ok: true, staff: (await A.listStaff(db)).filter(x => x.active).map(x => ({ name: x.name, role: x.role, license: x.license || '', hasPin: !!x.hasPin, mustChange: !!x.must_change, locked: x.lock_until > now })) });
  }

  if (p === '/api/admin/staff' && req.method === 'POST') {
    if (!can(u, 'staff.manage')) return J({ ok: false, err: 'perm' }, 403);
    const b = await body(req) || {};
    const name = String(b.name || '').trim();
    if (!name || name.length > 20) return J({ ok: false, err: 'input' }, 400);
    const s = await A.getStaff(db, name);
    const reps = async () => (await A.listStaff(db)).filter(x => x.active && x.role === '대표').length;
    let note = '';   // 권한이 바뀌는 일 → 긴급 알림 (그룹방 + 대표)

    if (b.op === 'add') {
      if (s && s.active) return J({ ok: false, err: 'exists' }, 409);
      const role = ROLES.includes(b.role) ? b.role : '직원';
      const lic = b.license || null;                     // 자격: 추가할 때 같이 정함
      if (lic && !LICENSES.includes(lic)) return J({ ok: false, err: 'input' }, 400);
      await A.addStaff(db, name, role);
      await A.setLicense(db, name, lic);
      await audit(db, Object.assign({ act: '직원 추가', target: name, detail: role + (lic ? ' · ' + lic : '') }, who));
      note = '직원 추가 · ' + name + ' (' + role + ')';
    } else {
      if (!s || !s.active) return J({ ok: false, err: 'nostaff' }, 404);
      if (b.op === 'role') {
        if (!ROLES.includes(b.role)) return J({ ok: false, err: 'input' }, 400);
        if (s.role === '대표' && b.role !== '대표' && (await reps()) < 2) return J({ ok: false, err: 'lastrep' }, 409);
        await A.setRole(db, name, b.role);
        await audit(db, Object.assign({ act: '역할 변경', target: name, detail: s.role + ' → ' + b.role }, who));
        note = '역할 변경 · ' + name + ' ' + s.role + ' → ' + b.role;
      } else if (b.op === 'license') {
        // 자격 (설계서 6.4): 공개 매물에 이름이 나가는지 정함 → 공개 사본 다시 만들기
        const lic = b.license || null;
        if (lic && !LICENSES.includes(lic)) return J({ ok: false, err: 'input' }, 400);
        await A.setLicense(db, name, lic);
        await rebuildPublic(db, u.name);
        await audit(db, Object.assign({ act: '자격 변경', target: name, detail: (s.license || '미지정') + ' → ' + (lic || '미지정') }, who));
      } else if (b.op === 'pin') {
        if (!validPin(b.pin)) return J({ ok: false, err: 'input' }, 400);
        const salt = randomHex(16), self = name === u.name;
        await A.setPin(db, name, await pinHash(b.pin, salt), salt, !self); // 남에게 준 PIN은 임시 → 첫 로그인 때 본인이 바꿈
        await A.delSessionsOf(db, name, self ? u.tok : '');
        await audit(db, Object.assign({ act: self ? 'PIN 변경' : '임시 PIN 발급', target: name }, who));
      } else if (b.op === 'del') {
        if (name === u.name) return J({ ok: false, err: 'self' }, 409);
        if (s.role === '대표' && (await reps()) < 2) return J({ ok: false, err: 'lastrep' }, 409);
        await A.deactivate(db, name);
        await A.delSessionsOf(db, name, '');
        await audit(db, Object.assign({ act: '직원 삭제', target: name }, who));
        note = '직원 삭제 · ' + name;
      } else return J({ ok: false, err: 'input' }, 400);
    }
    await A.syncRoles(db);
    if (note) await notify(env, { kind: 'security', urgent: true, text: '[권한 변경] ' + note + '\n— ' + u.name, dm: await repNames(db), actor: u.name, path: '?go=audit' });
    return J({ ok: true });
  }

  if (p === '/api/admin/import' && req.method === 'POST') return importApi(req, env, u);
  if (p === '/api/admin/notify') return notifyAdmin(req, env, url, u);   // 설정 › 알림 (P5)
  if (p === '/api/admin/export' || p === '/api/admin/backup') return backupApi(req, env, url, u);   // 엑셀 내보내기 · 백업 · 복구 (P7)

  // 팝업 그림 · 첨부 올리기 · 저장소 사용량 (대표 · 관리자, 시안 popup-image)
  if (p === '/api/admin/media') {
    if (!can(u, 'popup.manage')) return J({ ok: false, err: 'perm' }, 403);
    return req.method === 'POST' ? uploadMedia(req, env, url, u) : mediaUsage(env);
  }

  if (p === '/api/admin/gov') return govAdmin(req, env, u);
  if (p === '/api/admin/migrate' || p.startsWith('/api/admin/migrate/')) return migrateApi(req, env, url, u);   // R4 기존 자료 옮기기 (고객DB)   // 국토부 실거래가 · 건축물대장 상태 · 지금 받기 (대표 · 관리자)

  if (p === '/api/admin/audit' && req.method === 'GET') {
    if (!can(u, 'audit.read')) return J({ ok: false, err: 'perm' }, 403);
    return J({ ok: true, rows: await listAudit(db, Number(url.searchParams.get('before')) || 0, url.searchParams.get('limit')) });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
