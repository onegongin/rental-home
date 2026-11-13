// R2 상담카드 2종 (시안 r2-consult-card 확정 2026-11-13)
//   칸 검사 · 세대당 임차인 카드 1장 · 가리기 · 진행상태 → 전환 상태 자동 · 관심등록 → 신규고객 카드 · 지우기 사유 필수
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { cleanCard, cleanLog, convTarget, fund, unitId } from '../src/core/consult.js';

const KEY = 'consult-office';
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
    return { status: r.status, text, json };
  };
}

test('규칙: 칸 검사 · 호실 · 자금 계산 · 전환 상태 대응', () => {
  assert.equal(unitId('102동 1502호'), '102-1502');
  assert.equal(unitId('102-0502'), '102-502');
  assert.equal(unitId('105-101'), null);
  assert.equal(cleanCard('tenant', { data: { price: '286,000,000' } }).data.price, 286000000);
  assert.equal(cleanCard('tenant', { data: { fundType: '아무거나' } }).err, 'fundType');
  assert.equal(cleanCard('tenant', { phone: '123' }).err, 'phone');
  assert.equal(cleanCard('new', { progress: '퇴거' }).err, 'progress', '신규고객엔 퇴거 없음');
  assert.deepEqual(cleanCard('new', { data: { intUnits: '101-2101, 102동 1902' } }).data.intUnits, ['101-2101', '102-1902']);
  assert.equal(cleanLog({ channel: '유선상담' }), null, '내용 없는 기록은 안 남김');
  assert.deepEqual(cleanLog({ prob: '5.고민(긍정)', docs: ['합의서', '가짜'] }).docs, ['합의서']);
  assert.deepEqual(fund({ price: 286e6, deposit: 180e6, own: 30e6, loan: 60e6 }), { need: 106e6, gap: 16e6 });
  assert.deepEqual(convTarget('tenant', { unit_id: '101-501', progress: '퇴거', data: {} }, '상담중'), { unit: '101-501', status: '퇴거확정' });
  assert.equal(convTarget('tenant', { unit_id: '101-501', progress: '퇴거', data: {} }, '퇴거확정(매물동의)'), null, '더 나아간 상태는 그대로');
  assert.deepEqual(convTarget('new', { progress: '계약완료', data: { contractUnit: '102-1902' } }, '공실'), { unit: '102-1902', status: '신규입주' });
  assert.equal(convTarget('new', { progress: '상담중', data: { contractUnit: '102-1902' } }, '공실'), null);
});

let boss, staff, staff2, viewer;
test('준비: 대표 · 직원 2 · 열람', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (n, role, a) => {
    await boss('/api/admin/staff', { body: { op: 'add', name: n, role } });
    await boss('/api/admin/staff', { body: { op: 'pin', name: n, pin: '0000' } });
    const x = agent(a);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name: n, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    return x;
  };
  staff = await mk('직원A', '직원', '4.4.4.4'); staff2 = await mk('직원B', '직원', '5.5.5.5'); viewer = await mk('열람이', '열람', '3.3.3.3');
});

test('임차인 카드: 세대당 1장 · 상담 기록 · 가리기 · 전환 상태 자동', async () => {
  const mk = b => staff('/api/staff/consults', { body: Object.assign({ kind: 'tenant' }, b) });
  assert.equal((await viewer('/api/staff/consults', { body: { kind: 'tenant', unit: '101-501', name: '가' } })).status, 403, '열람은 못 만듦');
  assert.equal((await mk({ unit: '999-1', name: '가' })).status, 400);
  let r = await mk({ unit: '101-501', name: '김임차', phone: '010-1234-5678', data: { price: '286,000,000', deposit: '180000000', moveOut: '2026-12-20' }, log: { date: '2026-11-13', channel: '방문상담', prob: '5.고민(긍정)', memo: '대출 문의 010-1111-2222' } });
  assert.equal(r.status, 200, r.text);
  const id = r.json.id;
  assert.equal(r.json.synced, '101-501 → 상담중', '새 카드 = 상담중');
  assert.equal((await mk({ unit: '101-501', name: '또' })).status, 409, '같은 세대 두 장 안 됨');
  assert.equal((await staff('/api/staff/consults?unit=101-501')).json.id, id);

  let d = (await staff('/api/staff/consults/' + id)).json;
  assert.equal(d.card.name, '김임차'); assert.equal(d.card.fund.need, 106e6); assert.equal(d.logs.length, 1); assert.equal(d.canEdit, true);
  const other = (await staff2('/api/staff/consults/' + id)).json;
  assert.equal(other.card.name, '김*차', '남의 카드는 이름 가림');
  assert.ok(!/1234-5678|1111-2222/.test(JSON.stringify(other)), '전화번호 가림');
  assert.equal(other.canEdit, false);
  assert.equal((await staff2('/api/staff/consults/' + id, { body: { name: '바꿈' } })).status, 403);

  // 다른 칸만 고치면 전환 상태 안 건드림 → 진행상태 '퇴거' → 퇴거확정 + 퇴거일
  await boss('/api/staff/conv/101-501', { body: { status: '장기부재', memo: '직원 메모' } });
  r = await staff('/api/staff/consults/' + id, { body: { data: { visitCoop: '협조 가능' } } });
  assert.equal(r.json.synced, '');
  r = await staff('/api/staff/consults/' + id, { body: { progress: '퇴거', log: { prob: '8.미동의예정(퇴거)', docs: ['매물동의서'] } } });
  assert.equal(r.json.synced, '101-501 → 퇴거확정');
  const conv = (await boss('/api/staff/conv')).json.conv.find(c => c.unit_id === '101-501');
  assert.equal(conv.status, '퇴거확정'); assert.equal(conv.move_out, '2026-12-20'); assert.equal(conv.memo, '직원 메모', '메모는 그대로');
  d = (await staff('/api/staff/consults/' + id)).json;
  assert.equal(d.logs.length, 2); assert.deepEqual(d.logs[0].docs, ['매물동의서']); assert.equal(d.conv.status, '퇴거확정');

  // 공실로 공개 중 → 임차인 카드 '퇴거' 저장해도 공실 유지
  await boss('/api/staff/conv/101-501', { body: { status: '공실' } });
  await boss('/api/staff/conv/101-501/pub', { body: { on: true } });
  r = await staff('/api/staff/consults/' + id, { body: { data: { moveOut: '2026-12-21' } } });
  assert.equal(r.json.synced, '');
  assert.equal((await (await mf.fetch('http://localhost/api/public/units')).json()).rows.length, 1);

  // 지우기: 직원 못 함 · 사유 필수 · 지우면 목록에서 빠짐 · 되살리기
  assert.equal((await staff('/api/staff/consults/' + id + '/del', { body: { reason: 'x' } })).status, 403);
  assert.equal((await boss('/api/staff/consults/' + id + '/del', { body: { reason: '' } })).status, 400);
  assert.equal((await boss('/api/staff/consults/' + id + '/del', { body: { reason: '중복 카드' } })).status, 200);
  assert.equal((await staff('/api/staff/consults?kind=tenant')).json.rows.length, 0);
  assert.equal((await boss('/api/staff/consults?kind=tenant&del=1')).json.rows.length, 1);
  assert.equal((await boss('/api/staff/consults/' + id + '/del', { body: { on: false } })).status, 200);
  assert.equal((await staff('/api/staff/consults?kind=tenant')).json.rows.length, 1);
});

test('신규고객: 관심등록 → 카드 · 계약완료 → 계약할 호실 신규입주 · 공개 내림', async () => {
  // 손님 관심등록 (입주 신규고객)
  const g = await mf.fetch('http://localhost/api/public/lead', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ card: { kind: 'client', name: '박신규', phone: '010-9876-5432', interest: '102동 고층 80B (즉시 입주)', consent: { req: true } } }) });
  assert.equal(g.status, 200);
  let list = (await staff('/api/staff/consults?kind=new')).json;
  assert.equal(list.leads.length, 1);
  assert.equal(list.leads[0].name, '박*규', '직원에겐 관심등록 이름 가림');
  const lead = list.leads[0].k;
  let r = await staff('/api/staff/consults', { body: { kind: 'new', lead } });
  assert.equal(r.status, 200, r.text);
  const id = r.json.id;
  assert.equal((await staff('/api/staff/consults', { body: { kind: 'new', lead } })).status, 409, '같은 관심등록 두 번 안 됨');
  list = (await staff('/api/staff/consults?kind=new')).json;
  assert.equal(list.leads.length, 0); assert.equal(list.rows.length, 1);
  let d = (await staff('/api/staff/consults/' + id)).json;
  assert.equal(d.card.name, '박신규', '만든 직원은 원문'); assert.equal(d.card.data.inflow, '관심등록'); assert.equal(d.card.data.interest, '102동 고층 80B (즉시 입주)');

  await boss('/api/staff/conv/102-1902', { body: { status: '공실' } });
  await boss('/api/staff/conv/102-1902/pub', { body: { on: true } });
  r = await staff('/api/staff/consults/' + id, { body: { data: { contractUnit: '102-1902' } } });
  assert.equal(r.json.synced, '', '상담중이면 호실 상태 안 바뀜');
  r = await staff('/api/staff/consults/' + id, { body: { progress: '계약완료' } });
  assert.equal(r.json.synced, '102-1902 → 신규입주 (공개 내림)');
  const pub = (await (await mf.fetch('http://localhost/api/public/units')).json()).rows;
  assert.ok(!pub.some(x => x.dong === 102 && x.type === '80B' && x.band === '중층'), '계약된 세대는 손님 화면에서 내려감');

  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(acts.includes('상담카드 만듦') && acts.includes('상담카드 지움') && acts.includes('상담카드 되살림'));
});
