// R2 세대 전환 상태 · 공개 세대 (시안 r2-public-pick 확정 2026-11-13)
//   공실 · 퇴거확정(매물동의)만 공개 · 손님에게 호수 안 감 · 상태가 바뀌면 자동 내림 · 공개는 관리자급만 · 열람은 못 고침
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { cleanConv, pubRow, groupPub, CONV } from '../src/core/conv.js';

const KEY = 'conv-office';
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

test('규칙: 상태 검사 · 공개 사본에 호수 없음 · 묶기', () => {
  assert.equal(CONV.length, 11);
  assert.equal(cleanConv({ status: '없는상태' }), null);
  assert.equal(cleanConv({ status: '공실', move_out: '2026/12/01' }), null);
  assert.deepEqual(cleanConv({ status: '퇴거확정', move_out: '2026-12-01', memo: ' 메모 ' }), { status: '퇴거확정', move_out: '2026-12-01', memo: '메모' });
  assert.equal(pubRow('102-1502', '상담중'), null);
  const r = pubRow('102-1502', '공실');
  assert.deepEqual(Object.keys(r).sort(), ['band', 'dong', 'exclusive', 'kind', 'type']);
  assert.equal(r.band, '중층'); assert.equal(r.type, '80B'); assert.equal(r.kind, 'vac');
  assert.equal(pubRow('102-2501', '퇴거확정(매물동의)').kind, 'out');
  const g = groupPub([pubRow('102-1502', '공실'), pubRow('102-1602', '공실'), pubRow('101-501', '퇴거확정(매물동의)')]);
  assert.equal(g.length, 2); assert.equal(g[0].n, 2); assert.equal(g[0].kind, 'vac');
});

let boss, staff, viewer;
test('준비: 대표 · 직원 · 열람', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  for (const [n, role, a] of [['직원이', '직원', '4.4.4.4'], ['열람이', '열람', '3.3.3.3']]) {
    await boss('/api/admin/staff', { body: { op: 'add', name: n, role } });
    await boss('/api/admin/staff', { body: { op: 'pin', name: n, pin: '0000' } });
    const x = agent(a);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name: n, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    if (role === '직원') staff = x; else viewer = x;
  }
});

test('상태 고치기 · 공개 · 손님 화면 · 자동 내림', async () => {
  const set = (a, id, b) => a('/api/staff/conv/' + id, { body: b });
  const pub = (a, id, on) => a('/api/staff/conv/' + id + '/pub', { body: { on } });
  const guest = async () => (await mf.fetch('http://localhost/api/public/units')).json();

  assert.equal((await set(viewer, '102-1502', { status: '공실' })).status, 403, '열람은 못 고침');
  assert.equal((await set(boss, '999-101', { status: '공실' })).status, 404, '없는 호실');
  assert.equal((await set(boss, '102-1502', { status: '이상한' })).status, 400);
  assert.equal((await set(staff, '102-1502', { status: '공실' })).status, 200, '직원도 상태는 고침');
  assert.equal((await set(boss, '102-1602', { status: '공실' })).status, 200);
  assert.equal((await set(boss, '101-501', { status: '상담중' })).status, 200);

  assert.equal((await pub(staff, '102-1502', true)).status, 403, '직원은 공개 못 함');
  assert.equal((await pub(boss, '101-501', true)).status, 409, '상담중은 공개 불가');
  assert.equal((await pub(boss, '102-1502', true)).status, 200);
  assert.equal((await pub(boss, '102-1602', true)).status, 200);

  let g = await guest();
  assert.equal(g.rows.length, 1); assert.equal(g.rows[0].n, 2);
  const txt = JSON.stringify(g);
  assert.ok(!/1502|1602|unit_id|대표/.test(txt), '손님 응답에 호수 · 누가 없음: ' + txt);

  const list = (await boss('/api/staff/conv')).json;
  assert.equal(list.canPub, true); assert.equal(list.pub.length, 2);
  assert.equal((await staff('/api/staff/conv')).json.canPub, false);

  // 공실 → 퇴거확정(매물동의): 공개 유지, 구분만 바뀜 / → 계약완료: 자동 내림
  await set(boss, '102-1602', { status: '퇴거확정(매물동의)', move_out: '2026-12-20' });
  g = await guest();
  assert.deepEqual(g.rows.map(r => r.kind).sort(), ['out', 'vac']);
  const r = await set(staff, '102-1502', { status: '계약완료' });
  assert.equal(r.json.unpublished, true);
  g = await guest();
  assert.equal(g.rows.length, 1); assert.equal(g.rows[0].kind, 'out');
  assert.equal((await pub(boss, '102-1602', false)).status, 200);
  assert.equal((await guest()).rows.length, 0);

  const audit = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(audit.includes('세대 공개') && audit.includes('세대 공개 내림') && audit.includes('전환 상태'));
});

test('손님 화면 공개 → 매물보드 광고중 카드 (시안 r56 A안)', async () => {
  const set = (a, id, b) => a('/api/staff/conv/' + id, { body: b });
  const pub = (a, id, deal) => a('/api/staff/conv/' + id + '/pub', { body: deal ? { on: true, deal } : { on: false } });
  const cards = async () => (await boss('/api/staff/listings')).json.rows.filter(l => l.unit_id === '103-1502' && l.source === 'unitpub');
  const one = async d => (await cards()).find(l => l.deal === d);
  const pubDeal = async () => ((await boss('/api/staff/conv')).json.pub.find(x => x.unit_id === '103-1502') || {}).deal || '';
  const move = (a, l, status) => a('/api/staff/listings/' + l.id + '/status', { body: { ver: l.ver, status } });

  await set(boss, '103-1502', { status: '공실' });
  assert.equal((await pub(boss, '103-1502', '둘 다')).status, 200);
  let s = await one('sale'), j = await one('jeonse');
  assert.equal(s.status, '광고중'); assert.equal(j.status, '광고중'); assert.equal((await cards()).length, 2, '둘 다 = 카드 2장');
  assert.ok(s.ask > 0, '매매 = 매입보장가'); assert.equal(s.pub, 'on', '카드가 곧 공개 매물 (시안 r57)'); assert.ok(j.dep > 0, '전세 = 임대보증금');
  const gl = async () => ((await mf.fetch('http://localhost/api/public/listings')).json()).then(x => (x.rows || x.listings || []).filter(r => r.nu));
  let G = await gl(); assert.equal(G.length, 2, '손님 현재 매물에 매매 · 전세'); assert.ok(G.find(r => r.deal === 'jeonse').dep > 0, '전세 보증금 공개 (A안)');
  assert.ok(!JSON.stringify(G).includes('1502'), '손님 응답에 호수 없음');
  assert.equal((await boss('/api/staff/listings/' + s.id, { method: 'PATCH', body: { ver: s.ver, ask: 1, facing: '남동', basis: '거실', memo_pub: '즉시 상담' } })).status, 200);
  s = await one('sale'); assert.ok(s.ask > 1, '매매가 잠금'); assert.equal(s.facing, '남동');
  G = await gl(); assert.equal(G.find(r => r.deal === 'sale').facing, '남동', '창에서 고친 향 → 손님 화면');
  assert.equal((await move(staff, s, '협의중')).status, 403, '직원은 분양팀 카드 못 옮김');

  // 매매 카드 철회 → 손님 화면은 전세만 / 전세 카드 계약 → 공개 끔
  assert.equal((await move(boss, s, '철회')).status, 200); assert.equal(await pubDeal(), '전세');
  j = await one('jeonse'); assert.equal((await move(boss, j, '계약')).status, 200); assert.equal(await pubDeal(), '', '계약 = 공개 끔');
  assert.equal((await one('sale')).status, '철회');

  // 다시 신규분양 공개 → 철회 카드가 광고중으로 / 공개 끄기 → 철회
  await pub(boss, '103-1502', '매매'); assert.equal((await one('sale')).status, '광고중');
  s = await one('sale'); assert.equal((await move(boss, s, '가계약')).status, 200); assert.equal(await pubDeal(), '매매', '가계약까지는 공개 유지');
  await pub(boss, '103-1502', null); assert.equal((await one('sale')).status, '철회'); assert.equal((await gl()).length, 0, '공개 끄면 현재 매물에서 빠짐');
  await pub(boss, '103-1502', '둘 다'); j = await one('jeonse');
  assert.equal((await boss('/api/staff/listings/' + j.id + '/publish', { body: { ver: j.ver, op: 'off' } })).status, 200, '창의 공개 끄기');
  assert.equal(await pubDeal(), '매매', '공개 끄기 = 그 거래만 빼기'); await pub(boss, '103-1502', null);

  // 공개 중 계약완료 → 카드 '계약'
  await pub(boss, '103-1502', '매매'); await set(boss, '103-1502', { status: '계약완료' });
  assert.equal((await one('sale')).status, '계약'); assert.equal(await pubDeal(), '');
});
