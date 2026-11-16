// 상담카드(신규분양 매수) 계약관리 '계약완료 정리' 잠금 (시안 r48 확정 2026-11-17)
//   확정은 대표 · 관리자만 · 확정된 소개 구분 · 이름 · 계약진행 직원은 직원이 못 바꿈 · 같은 값으로 다음 상담 저장은 됨 · 진행 → 계약할 호실 전환상태
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';

const KEY = 'contract-office';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());

function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr };
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json };
  };
}

let boss, staff;
test('준비: 대표 · 직원', async () => {
  boss = agent('6.6.6.6');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원이', role: '직원' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '직원이', pin: '0000' } });
  staff = agent('7.7.7.7');
  await staff('/api/auth/device', { body: { code: KEY } });
  await staff('/api/auth/login', { body: { name: '직원이', pin: '0000' } });
  await staff('/api/auth/pin', { body: { pin: '4321' } });
});

const card = (id, at, ct, phone = '010-1111-2222') => ({ s: 'c', k: id, v: JSON.stringify({ id, kind: 'client', at, name: '신규손님', phone, mgr: '직원이', ct }), at: Date.now() });
const push = (a, rows) => a('/api/staff/push', { body: { rows } });
const FX = { by: '대표', at: '2026-11-17 10:00' };
const base = { prog: '계약완료', unit: '103-2002', intro: 'MGM', bk: '첨단공인', staff: '직원이' };

test('확정은 대표 · 관리자만 · 확정 뒤 같은 값은 저장 · 바꾸면 거절 · 대표는 고칠 수 있음', async () => {
  let r = await push(staff, [card('cS1', '2026-11-17 09:00', Object.assign({}, base, { fixed: { by: '직원이', at: '2026-11-17 09:00' } }), '010-9999-0000')]);
  assert.deepEqual(r.json.rejected, ['c|cS1'], '직원이 확정을 넣으면 거절');
  r = await push(boss, [card('cB1', '2026-11-17 10:00', Object.assign({}, base, { fixed: FX }))]);
  assert.deepEqual(r.json.rejected, [], '대표 확정 저장');
  r = await push(staff, [card('cS2', '2026-11-17 11:00', Object.assign({}, base, { fixed: FX, etc: '에어컨 특약' }))]);
  assert.deepEqual(r.json.rejected, [], '확정 값 그대로 + 기타내역은 직원도 저장');
  r = await push(staff, [card('cS3', '2026-11-17 12:00', Object.assign({}, base, { fixed: FX, bk: '다른부동산' }))]);
  assert.deepEqual(r.json.rejected, ['c|cS3'], '확정된 부동산명을 직원이 바꾸면 거절');
  r = await push(staff, [card('cS4', '2026-11-17 12:30', Object.assign({}, base, { fixed: null, intro: '', bk: '' }))]);
  assert.deepEqual(r.json.rejected, ['c|cS4'], '직원이 지우면 거절');
  r = await push(boss, [card('cB2', '2026-11-17 13:00', Object.assign({}, base, { fixed: FX, bk: '다른부동산', hist: ['사유: 정정'] }))]);
  assert.deepEqual(r.json.rejected, [], '대표는 고침');
});

test('계약관리 진행 → 계약할 호실 전환상태 (계약완료 = 신규입주)', async () => {
  const list = await boss('/api/staff/conv');
  const row = list.json.conv.find(c => c.unit_id === '103-2002');
  assert.equal(row && row.status, '신규입주');
});
