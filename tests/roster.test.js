// R4 기존 자료 옮기기 — 고객DB 300세대 → 전환상태 + 임차인 카드 (시안 r4-migrate 확정 2026-11-13) — 가짜 줄로만 (진짜 고객 자료 X)
//   칸 정리 · 미리보기는 가림 · 적용 → 전환상태(계약완료 날짜 없음) + 임차인 카드(담당 = 팀) · 빈 칸만 / 덮어쓰기 · 되돌리기(그 뒤 고친 건 남김) · 권한
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { normStatus, normPhone, normDay, readRows } from '../src/core/migrate.js';

test('규칙: 전환여부 · 연락처 · 날짜 · 줄 검사', () => {
  assert.equal(normStatus('퇴거확정(매물동의)'), '퇴거확정(매물동의)'); assert.equal(normStatus('미전환'), '상담중'); assert.equal(normStatus('이상함'), undefined); assert.equal(normStatus(''), null);
  assert.equal(normPhone('01012345678'), '010-1234-5678'); assert.equal(normPhone(1012345678), '010-1234-5678', '엑셀이 0 지운 번호'); assert.equal(normPhone('123'), undefined); assert.equal(normPhone(''), null);
  assert.equal(normDay('2026.11.8'), '2026-11-08'); assert.equal(normDay(46339), '2026-11-13'); assert.equal(normDay('모름'), undefined);
  const R = readRows([
    { dong: 101, ho: 401, team: 5, type: '80B', name: '가나다', phone: '010-1111-2222', status: '계약완료' },
    { dong: 101, ho: 402, team: '6', type: '80A', name: '라마바', phone: '12', moveOut: '2026-11-18', status: '퇴거확정' },
    { dong: 101, ho: 402, status: '상담중' }, { dong: 999, ho: 1, status: '상담중' }, { dong: 101, ho: 403, status: '???' }
  ]);
  assert.equal(R.rows.length, 2); assert.equal(R.errors.length, 3);
  assert.deepEqual(R.rows[1], { unit: '101-402', team: '6팀', name: '라마바', birth: null, phone: null, moveOut: '2026-11-18', status: '퇴거확정', prog: '퇴거' });
  assert.deepEqual(R.warns.map(w => w.msg.slice(0, 3)), ['연락처', '타입이']);
});

const KEY = 'migrate-office';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());
function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr };
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.body ? 'POST' : 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}

test('API: 미리보기 · 옮기기 · 빈 칸만 · 덮어쓰기 · 되돌리기', async () => {
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '권한', role: '권한자' } }); await boss('/api/admin/staff', { body: { op: 'pin', name: '권한', pin: '0000' } });
  const au = agent('6.6.6.6'); await au('/api/auth/device', { body: { code: KEY } }); await au('/api/auth/login', { body: { name: '권한', pin: '0000' } }); await au('/api/auth/pin', { body: { pin: '4321' } });
  assert.equal((await au('/api/admin/migrate')).status, 403);

  const rows = [
    { dong: 101, ho: 401, team: 5, type: '80B', name: '가나다', birth: '650101-1', phone: '010-1111-2222', status: '계약완료' },
    { dong: 101, ho: 402, team: 6, type: '80B', name: '라마바', phone: '010-3333-4444', moveOut: '2026-11-18', status: '퇴거확정' },
    { dong: 101, ho: 403, team: 5, type: '80A', name: '사아자', phone: '010-5555-6666', status: '전세연장' }
  ];
  // 이미 공개 중인 공실 세대가 퇴거확정으로 바뀌면 공개 내림 (덮어쓰기 때)
  await boss('/api/staff/conv/101-402', { body: { status: '공실' } }); await boss('/api/staff/conv/101-402/pub', { body: { on: true } });
  const d = (await boss('/api/admin/migrate/roster', { body: { rows, dry: true } })).json;
  assert.equal(d.n, 3); assert.equal(d.byStatus['계약완료'], 1);
  assert.ok(!/가나다|1111-2222|650101/.test(JSON.stringify(d)), '미리보기는 가림');
  assert.equal((await boss('/api/admin/conv')).status, 404);

  // 빈 칸만: 101-402 는 이미 공실 → 그대로, 퇴거일만 채움
  let r = (await boss('/api/admin/migrate/roster', { body: { rows } })).json.result;
  assert.deepEqual([r.cardNew, r.cardUpd, r.conv, r.unpub], [3, 0, 3, 0]);
  let conv = Object.fromEntries((await boss('/api/staff/conv')).json.conv.map(c => [c.unit_id, c]));
  assert.equal(conv['101-401'].status, '계약완료'); assert.equal(conv['101-402'].status, '공실'); assert.equal(conv['101-402'].move_out, '2026-11-18');
  const list = (await boss('/api/staff/consults?kind=tenant')).json.rows;
  const c401 = list.find(c => c.unit_id === '101-401');
  assert.deepEqual([c401.name, c401.mgr, c401.progress, c401.writer, c401.data.birth], ['가나다', '5팀', '계약완료', '자료 옮기기', '650101-1']);
  assert.equal(c401.data.price, 421e6, '분양가표 값');
  // 옮겨 온 계약완료 = 날짜 없음 → 일일보고 '이전', 청구 대상 아님
  const rep = (await boss('/api/staff/report')).json.fresh.types.find(t => t.type === '80B');
  assert.equal(rep.pre, 1); assert.equal(rep.today, 0);
  assert.equal((await boss('/api/staff/claims')).json.est.rows.length, 0);

  // 다시 빈 칸만 → 바뀌는 것 없음 · 덮어쓰기 → 101-402 퇴거확정 + 공개 내림
  r = (await boss('/api/admin/migrate/roster', { body: { rows } })).json.result;
  assert.deepEqual([r.cardNew, r.cardUpd, r.conv], [0, 0, 0]);
  const rows2 = rows.map(x => Object.assign({}, x, x.ho === 403 ? { name: '고친이름' } : {}));
  r = (await boss('/api/admin/migrate/roster', { body: { rows: rows2, mode: 'over' } })).json.result;
  assert.deepEqual([r.cardUpd, r.conv, r.unpub], [1, 1, 1], '값이 실제로 다른 것만 (403 이름 · 402 전환상태)');
  assert.equal((await (await mf.fetch('http://localhost/api/public/units')).json()).rows.length, 0);

  // 덮어쓰기 되돌리기 → 101-402 공실 + 다시 공개, 403 이름 되돌림. 그 뒤 직원이 고친 401 카드는 남김
  const logs = (await boss('/api/admin/migrate')).json.logs;
  assert.equal(logs.length, 3);
  const id401 = c401.id;
  await boss('/api/staff/consults/' + id401, { body: { data: { memo: '직원이 고침' } } });
  const u = (await boss('/api/admin/migrate/' + logs[0].id + '/undo', { body: {} })).json.result;
  assert.deepEqual([u.conv, u.pub, u.cardBack, u.kept], [1, 1, 1, 0]);
  conv = Object.fromEntries((await boss('/api/staff/conv')).json.conv.map(c => [c.unit_id, c]));
  assert.equal(conv['101-402'].status, '공실');
  assert.equal((await (await mf.fetch('http://localhost/api/public/units')).json()).rows.length, 1);
  assert.equal((await boss('/api/staff/consults?kind=tenant')).json.rows.find(c => c.unit_id === '101-403').name, '사아자');
  assert.equal((await boss('/api/admin/migrate/' + logs[0].id + '/undo', { body: {} })).status, 409);
  // 처음 옮기기 되돌리기 → 만든 카드 지움 (고친 401 은 남김)
  const u2 = (await boss('/api/admin/migrate/' + logs[2].id + '/undo', { body: {} })).json.result;
  assert.equal(u2.cardDel, 2); assert.equal(u2.kept, 1, '그 뒤 직원이 고친 401 카드는 남김');
  assert.deepEqual((await boss('/api/staff/consults?kind=tenant')).json.rows.map(c => c.unit_id), ['101-401']);
  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(acts.includes('자료 옮기기 (고객DB)') && acts.includes('자료 옮기기 되돌림'));
});
