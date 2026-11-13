// R3-3 수수료 청구서 + MGM (시안 r3-claim 확정 2026-11-13)
//   세금 계산 · 구분 · 대상(완료일 있는 계약완료 · 신규입주) · 담당자 기본값 · 청구 → 청구서 · 잠금 · 추가 호실 · MGM 확정 · 권한
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { taxAmt, finAmt, kindOf, totals, cleanItem, mgmGroups } from '../src/core/claim.js';

test('규칙: 세금 · 구분 · 합계 · MGM 묶기', () => {
  assert.equal(taxAmt(100, '3.3%'), -33000); assert.equal(finAmt(100, '3.3%'), 967000);
  assert.equal(taxAmt(110, '부가세'), 110000); assert.equal(finAmt(110, '현금영수증'), 1100000);
  assert.equal(taxAmt(77, '3.3%'), -25410, '10원 아래 버림 (25,410)');
  assert.equal(kindOf('신규입주', '공실'), '퇴거>신규'); assert.equal(kindOf('계약완료', '전세연장'), '전세>분양');
  assert.equal(kindOf('계약완료', '퇴거확정(매물동의)'), '퇴거>분양'); assert.equal(kindOf('계약완료', '상담중'), '분양전환');
  const s = totals([{ unit: 'a', fee: 100, tax: '3.3%' }, { unit: 'b', fee: 110, tax: '부가세' }, { unit: 'c', fee: 100, tax: '3.3%', excluded: true }, { unit: 'd', fee: null, tax: '3.3%' }]);
  assert.deepEqual([s.n, s.total, s.wh, s.vat, s.fin, s.unset], [2, 2100000, -33000, 110000, 2177000, 1]);
  assert.deepEqual(s.byFee, { 100: ['a'], 110: ['b'] });
  assert.equal(cleanItem({ tax: '모름' }), null); assert.equal(cleanItem({ fee: -1 }), null); assert.deepEqual(cleanItem({ fee: '' }), { fee: null });
  const g = mgmGroups([{ id: '1', mgmAgency: 'A', mgmBroker: '김', mgmFee: '100만 · 현금영수증', mgmFixed: { by: 'x' }, contractUnit: '101-401' }, { id: '2', mgmAgency: 'A', mgmFee: '220만 · 세금계산서', mgmFixed: { by: 'x' } }, { id: '3', mgmAgency: 'B', mgmFee: '100만 · 현금영수증' }]);
  assert.equal(g.length, 1, '확정 안 한 건 빠짐'); assert.equal(g[0].total, 3200000); assert.deepEqual(g[0].brokers, ['김']);
});

const KEY = 'claim-office';
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

test('API: 대상 · 기본값 · 청구 · 잠금 · 추가 호실 · MGM 확정 · 권한', async () => {
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  const mk = async (n, role, a) => { await boss('/api/admin/staff', { body: { op: 'add', name: n, role } }); await boss('/api/admin/staff', { body: { op: 'pin', name: n, pin: '0000' } }); const x = agent(a); await x('/api/auth/device', { body: { code: KEY } }); await x('/api/auth/login', { body: { name: n, pin: '0000' } }); await x('/api/auth/pin', { body: { pin: '4321' } }); return x; };
  const adm = await mk('관리', '관리자', '5.5.5.5'), aut = await mk('권한', '권한자', '6.6.6.6');
  assert.equal((await aut('/api/staff/claims')).status, 403, '권한자는 돈 화면 못 봄');

  // 대상: 전세연장 → 임차인 카드 계약완료(담당 홍) · 공실 → 신규고객 계약완료(담당 김) · 상담중이던 세대 직접 계약완료
  await boss('/api/staff/conv/101-401', { body: { status: '전세연장' } });
  await boss('/api/staff/consults', { body: { kind: 'tenant', unit: '101-401', name: '김임차', mgr: '홍', progress: '계약완료' } });
  await boss('/api/staff/conv/102-1902', { body: { status: '공실' } });
  const nw = (await boss('/api/staff/consults', { body: { kind: 'new', name: '박신규', mgr: '김', progress: '계약완료', data: { contractUnit: '102-1902', inflow: '부동산', mgmAgency: '행복부동산', mgmBroker: '이중개', mgmFee: '220만 · 세금계산서' } } })).json;
  await boss('/api/staff/conv/103-501', { body: { status: '상담중' } });
  await boss('/api/staff/conv/103-501', { body: { status: '계약완료' } });
  await boss('/api/staff/claims/staff', { body: { name: '김', fee: 110, tax: '부가세' } });
  let V = (await adm('/api/staff/claims')).json;
  const R = u => V.est.rows.find(r => r.unit === u);
  assert.equal(V.est.rows.length, 3);
  assert.deepEqual([R('101-401').kind, R('101-401').who, R('101-401').staff, R('101-401').fee, R('101-401').tax], ['전세>분양', '김임차', '홍', 100, '3.3%']);
  assert.deepEqual([R('102-1902').kind, R('102-1902').who, R('102-1902').fee, R('102-1902').tax], ['퇴거>신규', '박신규', 110, '부가세'], '신규입주 → 신규고객 카드 · 담당 김 기본값');
  assert.equal(R('103-501').kind, '분양전환');

  // 고치기 · 제외 · 추가 호실
  assert.equal((await adm('/api/staff/claims/item', { body: { key: R('103-501').key, excluded: true } })).status, 200);
  assert.equal((await adm('/api/staff/claims/item', { body: { key: R('101-401').key, fee: 200, memo: '특별' } })).status, 200);
  assert.equal((await adm('/api/staff/claims/extra', { body: { unit: '104-401', fee: 100 } })).status, 400, '사유 필수');
  assert.equal((await adm('/api/staff/claims/extra', { body: { unit: '104-401', reason: '기존 계약완료 지원', fee: 100, tax: '현금영수증' } })).status, 200);
  V = (await adm('/api/staff/claims')).json;
  assert.equal(R('101-401').fee, 200); assert.equal(R('103-501').excluded, true); assert.equal(V.est.rows.length, 4);
  assert.equal(V.est.sum.fin, 1934000 + 1210000 + 1000000);

  // 청구 → 오늘 청구서 (제외 호실은 예상청구에 남음) · 담당 기본값을 바꿔도 청구서 금액은 그대로
  const c = (await adm('/api/staff/claims/claim', { body: {} })).json;
  assert.equal(c.n, 3);
  await boss('/api/staff/claims/staff', { body: { name: '김', fee: 300, tax: '3.3%' } });
  V = (await adm('/api/staff/claims')).json;
  assert.equal(V.est.rows.length, 1); assert.equal(V.est.rows[0].unit, '103-501');
  const inv = V.invoices[0];
  assert.equal(inv.date, c.date); assert.equal(inv.rows.length, 3); assert.equal(inv.sum.fin, 4144000);
  assert.equal(inv.rows.find(r => r.unit === '102-1902').fee, 110, '청구 때 금액으로 굳음');
  // 되돌리기 · 잠금
  const one = inv.rows.find(r => r.unit === '104-401');
  assert.equal((await adm('/api/staff/claims/item', { body: { key: one.key, back: true } })).status, 200);
  assert.equal((await adm('/api/staff/claims/claim', { body: {} })).status, 200);
  assert.equal((await adm('/api/staff/claims/lock', { body: { date: c.date, locked: true } })).status, 200);
  assert.equal((await adm('/api/staff/claims/item', { body: { key: one.key, fee: 1 } })).status, 409, '잠긴 청구서');
  assert.equal((await adm('/api/staff/claims/claim', { body: {} })).status, 409);
  assert.equal((await adm('/api/staff/claims/lock', { body: { date: c.date, locked: false } })).status, 403, '풀기는 대표만');
  assert.equal((await boss('/api/staff/claims/lock', { body: { date: c.date, locked: false } })).status, 200);

  // MGM: 대기 → 확정 → 내역서 · 카드에서 부동산 바꾸면 확정 풀림
  V = (await adm('/api/staff/claims')).json;
  assert.equal(V.mgmWait.length, 1); assert.equal(V.mgm.length, 0);
  assert.equal((await adm('/api/staff/claims/mgm', { body: { id: nw.id, fixed: true } })).status, 200);
  V = (await adm('/api/staff/claims')).json;
  assert.equal(V.mgm[0].agency, '행복부동산'); assert.equal(V.mgm[0].total, 2200000); assert.equal(V.mgm[0].rows[0].unit, '102-1902');
  await boss('/api/staff/consults/' + nw.id, { body: { data: { mgmAgency: '다른부동산' } } });
  V = (await adm('/api/staff/claims')).json;
  assert.equal(V.mgm.length, 0); assert.equal(V.mgmWait[0].agency, '다른부동산');
  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  for (const a of ['수수료 청구', '청구서 잠금', '청구서 잠금 해제', 'MGM 확정', '청구 호실 추가', '청구 되돌림']) assert.ok(acts.includes(a), a);
});
