// P3 세대 DB 자동 테스트 — 설계서 8.1 · 8.2 · 13.2
//   완료 기준: 엑셀로 전 세대(847) 올리고 만기 목록 확인
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { UNITS } from '../src/core/units.js';
import { normDate, normMan, normMobile, dday, bucket, isCurrent, today, addDays, occOf } from '../src/core/tenancy.js';

const KEY = 'test-office-code';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());

// 쿠키를 기억하는 간이 브라우저
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
const push = (a, id, v, at = Date.now()) => a('/api/staff/push', { body: { rows: [{ s: 'u', k: id, v: JSON.stringify(v), at }] } });
const detail = async (a, id) => (await a('/api/staff/units/' + id)).json;
const imp = (a, b) => a('/api/admin/import', { body: b });

test('규칙: 날짜 · 금액 · 남은 날 · 현재 임대차', () => {
  assert.equal(UNITS.length, 847, '호실 수 = 동호배치표 검산 847');
  assert.equal(normDate('2027.1.5'), '2027-01-05');
  assert.equal(normDate('20270105'), '2027-01-05');
  assert.equal(normDate(46392), '2027-01-05', '엑셀 날짜 숫자');
  assert.equal(normDate('2027-02-30'), null);
  assert.equal(normMan('3억 5,000'), 35000);
  assert.equal(normMan('3.5억'), 35000);
  assert.equal(normMan('120만'), 120);
  assert.equal(normMan('abc'), null);
  assert.equal(normMobile(1012345678), '010-1234-5678', '엑셀 숫자로 0 빠진 번호');
  assert.equal(dday('2027-01-31', '2027-01-01'), 30);
  assert.deepEqual([-1, 0, 30, 31, 60, 90, 91].map(bucket), ['지남', 'D-30', 'D-30', 'D-60', 'D-60', 'D-90', '']);
  assert.equal(isCurrent({ move_in: '2027-01-01', end_date: '2029-01-01' }, '2028-01-01'), true);
  assert.equal(isCurrent({ move_in: '2027-01-01', moved_out: '2027-06-01' }, '2028-01-01'), false);
  assert.equal(isCurrent({ move_in: '2028-05-01' }, '2028-01-01'), false, '아직 입주 전');
  assert.equal(occOf({ own: { ocType: '실거주' } }), '자가거주');
});

let boss, viewer;
test('준비: 대표 · 열람 직원', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  await boss('/api/admin/staff', { body: { op: 'add', name: '열람이', role: '열람' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '열람이', pin: '0000' } });
  viewer = agent('3.3.3.3');
  await viewer('/api/auth/device', { body: { code: KEY } });
  await viewer('/api/auth/login', { body: { name: '열람이', pin: '0000' } });
  await viewer('/api/auth/pin', { body: { pin: '4321' } });
});

test('세대 저장 → 소유자 · 임대차 표로 나뉘고, 바뀌면 이전 줄은 이력으로 남음', async () => {
  const id = '101-1001';
  const v = { status: '미확인', owner: '김소유', phone: '010-1111-2222', carrier: 'SKT', own: { ocType: '전세', ocTen: '이임차', ocTenPh: '010-3333-4444', ocDep: '30000', ocEnd: '2029-01-31' } };
  assert.equal((await push(boss, id, v)).json.n, 1);
  let d = await detail(boss, id);
  assert.equal(d.unit.occupancy, '전세');
  assert.equal(d.owners.length, 1);
  assert.equal(d.owners[0].name, '김소유');
  assert.equal(d.tenancies[0].name, '이임차');
  assert.equal(d.tenancies[0].deposit, 30000);
  assert.equal(d.tenancies[0].is_current, 1);

  // 같은 임차인 갱신(만기만 바뀜) → 같은 줄 고침
  v.own = Object.assign({}, v.own, { ocEnd: '2031-01-31', ocParty: '갱신연장' });
  await push(boss, id, v, Date.now() + 10);
  d = await detail(boss, id);
  assert.equal(d.tenancies.length, 1);
  assert.equal(d.tenancies[0].end_date, '2031-01-31');

  // 임차인 바뀜 → 이전 임대차 닫힘 + 새 줄
  v.own = { ocType: '월세', ocTen: '박새입', ocDep: '5000', ocRent: '120', ocEnd: '2030-06-30' };
  // 소유자도 바뀜 (매매)
  Object.assign(v, { owner: '최매수', phone: '010-5555-6666' });
  await push(boss, id, v, Date.now() + 20);
  d = await detail(boss, id);
  assert.equal(d.unit.occupancy, '월세');
  assert.deepEqual(d.owners.map(o => [o.name, o.is_current]), [['최매수', 1], ['김소유', 0]]);
  assert.deepEqual(d.tenancies.map(t => [t.name, t.kind, t.is_current]), [['박새입', '월세', 1], ['이임차', '전세', 0]]);
  assert.ok(d.tenancies[1].moved_out, '닫힌 임대차에 퇴거일');

  // 실거주로 바뀜 → 임대차 닫힘
  v.own = { ocType: '실거주' };
  await push(boss, id, v, Date.now() + 30);
  d = await detail(boss, id);
  assert.equal(d.unit.occupancy, '자가거주');
  assert.ok(d.tenancies.every(t => !t.is_current));

  // 화면 동기화는 예전처럼 세대 덩어리로
  const rows = (await boss('/api/staff/pull?since=0')).json.rows.filter(r => r.s === 'u');
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].v).owner, '최매수');
  // 예전 시각으로 보낸 저장은 무시 (나중 저장이 이김)
  await push(boss, id, Object.assign({}, v, { owner: '옛날값' }), 1);
  assert.equal((await detail(boss, id)).owners[0].name, '최매수');
});

test('열람 직원 · 로그인 안 한 사람: 세대 상세 · 임차만기 이름 · 번호 가림', async () => {
  const d = await viewer('/api/staff/units/101-1001');
  assert.equal(d.status, 200);
  for (const s of ['최매수', '5555-6666', '김소유', '박새입', '이임차', '3333-4444']) assert.ok(!d.text.includes(s), s + ' 노출');
  assert.equal(d.json.owners[0].name, '최*수');
  const anon = agent('4.4.4.4');
  for (const p of ['/api/staff/units/101-1001', '/api/staff/tenancies']) assert.equal((await anon(p)).status, 401);
  assert.equal((await anon('/api/admin/import', { body: { op: 'list' } })).status, 401);
  assert.equal((await imp(viewer, { op: 'list' })).status, 403, '열람은 가져오기 못 함');
});

// 연습용 가짜 엑셀 (화면에서 SheetJS가 읽은 모양 = 줄 목록)
const T0 = today();
const leased = UNITS.filter((u, i) => i % 3 === 0);
const endOf = i => addDays(T0, (i * 7) % 400 - 30);   // 30일 지난 것 ~ 1년 뒤
const ownersSheet = [['동', '호', '성명', '핸드폰', '통신사', '관계1', '연락처1', '취득원인']].concat(UNITS.map((u, i) => [u.dong, u.ho, '소유자' + i, '010-7' + String(i).padStart(3, '0') + '-' + String(1000 + i).slice(-4), 'skt', i % 5 ? '' : '배우자', i % 5 ? '' : '01098760000', '분양']));
const tenSheet = [['동', '호', '유형', '임차인', '임차인연락처', '보증금', '월세', '계약일', '입주일', '만기일', '갱신청구권', '계약주체']].concat(leased.map((u, i) => [u.dong, u.ho, i % 4 ? '전세' : '월세', '임차인' + i, '', i % 4 ? '3억 2,000' : '5000', i % 4 ? '' : '110', '', addDays(endOf(i), -730), endOf(i), i % 2 ? '사용' : '', i % 6 ? '' : '본사']));

test('엑셀 가져오기: 검사 · 미리보기 (아직 저장 안 됨)', async () => {
  const bad = [['동', '호', '성명', '핸드폰'], [101, 9999, '없는호', ''], [101, 1101, '번호틀림', '010-12'], [101, 1201, 'A', ''], [101, 1201, 'B', ''], ['※ 안내 줄', '', '', '']];
  const r = await imp(boss, { op: 'preview', kind: 'owners', file: 'bad.xlsx', rows: bad });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.rows.map(x => x.st), ['err', 'err', 'new', 'err']);
  assert.match(r.json.rows[0].msg, /없는 호실/);
  assert.match(r.json.rows[1].msg, /자릿수/);
  assert.match(r.json.rows[3].msg, /중복/);
  assert.equal((await imp(boss, { op: 'preview', kind: 'owners', rows: [['이름', '전화']] })).json.err, 'sheet');
  const p = await imp(boss, { op: 'preview', kind: 'owners', file: '소유자.xlsx', rows: ownersSheet });
  assert.equal(p.json.cnt.err, 0);
  assert.equal(p.json.cnt.new + p.json.cnt.ok + p.json.cnt.diff + p.json.cnt.same, 847);
  assert.equal(p.json.rows.find(x => x.unit === '101동 1001호').st, 'same', '빈 칸만 채우기: 이미 이름 · 번호 · 통신사가 있는 세대');
  assert.equal((await detail(boss, '101-401')).owners.length, 0, '미리보기는 저장 안 함');
});

test('완료 기준: 엑셀로 전 세대 올리고 만기 목록 확인 → 되돌리기', async () => {
  let r = await imp(boss, { op: 'apply', kind: 'owners', mode: 'over', file: '소유자.xlsx', rows: ownersSheet });
  assert.equal(r.json.n, 847);
  r = await imp(boss, { op: 'apply', kind: 'tenancies', mode: 'over', file: '임대차.xlsx', rows: tenSheet });
  assert.equal(r.json.n, leased.length);

  const t = (await boss('/api/staff/tenancies')).json.rows;
  assert.equal(t.length, leased.length);
  const want90 = leased.map((u, i) => dday(endOf(i), T0)).filter(d => d >= 0 && d <= 90).length;
  assert.equal(t.filter(x => x.dday >= 0 && x.dday <= 90).length, want90, 'D-90 안쪽 건수');
  assert.ok(t.some(x => x.dday < 0), '만기 지난 것도 보임');
  assert.ok(t[0].dday <= t[t.length - 1].dday, '만기 가까운 순');
  const ws = t.find(x => x.kind === '월세');
  assert.equal(ws.rent, 110);
  assert.equal(t.find(x => x.kind === '전세').deposit, 32000);
  const d = await detail(boss, leased[1].id);
  assert.equal(d.owners[0].name, '소유자3');
  assert.equal(d.owners[0].cause, '분양');
  assert.ok(d.tenancies[0].move_in, '입주일은 임대차 표에');
  // 101-1001 은 앞 테스트의 이력 + 엑셀 새 소유자
  assert.ok((await detail(boss, '101-1001')).owners.length >= 3);

  // 빈 칸만 채우기: 이미 있는 이름은 안 바뀜
  r = await imp(boss, { op: 'preview', kind: 'owners', mode: 'fill', rows: [['동', '호', '성명'], [101, 401, '딴사람']] });
  assert.equal(r.json.rows[0].st, 'same');

  // 되돌리기: 임대차 → 소유자 순서로 (마지막 것부터)
  assert.equal((await imp(boss, { op: 'undo' })).json.n, leased.length);
  assert.equal((await boss('/api/staff/tenancies')).json.rows.length, 0);
  assert.equal((await detail(boss, leased[1].id)).owners[0].name, '소유자3', '소유자는 그대로');
  assert.equal((await imp(boss, { op: 'undo' })).json.n, 847);
  assert.equal((await detail(boss, '101-401')).owners.length, 0);
  const back = await detail(boss, '101-1001');
  assert.equal(back.owners[0].name, '최매수', '가져오기 전 소유자로 돌아옴');
  assert.equal(back.owners[0].is_current, 1);
  const L = (await imp(boss, { op: 'list' })).json;
  assert.equal(L.canUndo, false);
  const log = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  for (const a of ['엑셀 가져오기', '엑셀 가져오기 되돌림']) assert.ok(log.includes(a), a);
});

test('지난 임대차만 직접 고침 (현재 임대차는 세대 창에서)', async () => {
  const d = await detail(boss, '101-1001');
  const past = d.tenancies.find(t => !t.is_current);
  let r = await boss('/api/staff/tenancies/' + past.id, { method: 'PATCH', body: { move_in: '2025.3.1', memo: '확인함', deposit: '2억' } });
  assert.equal(r.status, 200);
  const t = (await detail(boss, '101-1001')).tenancies.find(x => x.id === past.id);
  assert.deepEqual([t.move_in, t.memo, t.deposit], ['2025-03-01', '확인함', 20000]);
  assert.equal((await boss('/api/staff/tenancies/' + past.id, { method: 'PATCH', body: { end_date: '모름' } })).status, 400);
  assert.equal((await viewer('/api/staff/tenancies/' + past.id, { method: 'PATCH', body: { memo: 'x' } })).status, 403);
});
