// P7 엑셀 · 백업 자동 테스트 — 설계서 13.1 · 14장
//   완료 기준 (16장): 백업 → 복구 테스트 성공
//   + 내보내기는 대표 · 관리자만 · 가림 옵션 · 하루 10번 · 감사기록 / 받는 백업 파일은 비밀번호 잠금 / 복구는 대표 PIN · 직원 명단은 그대로
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { lock, unpack, gzip, MAGIC } from '../src/backup/pack.js';
import { cleanReq, maskPh } from '../src/export/sheets.js';

const KEY = 'test-office-code';
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
    const buf = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(buf);
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json, buf, headers: r.headers };
  };
}
const pushRow = (a, s, k, v, at = Date.now()) => a('/api/staff/push', { body: { rows: [{ s, k, v: JSON.stringify(v), at }] } });
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const cardsOf = async a => (await a('/api/staff/pull?since=0')).json.rows.filter(r => r.s === 'c').map(r => JSON.parse(r.v)).filter(Boolean);

test('파일 잠금: 비밀번호 맞아야 열림 · 아무 파일이나 안 받음', async () => {
  const data = { format: 'hwip-backup', v: 1, at: 1, tables: { kv: { cols: ['s'], rows: [['c']] } } };
  const file = await lock(await gzip(JSON.stringify(data)), 'pass-1234');
  assert.equal(new TextDecoder().decode(file.slice(0, MAGIC.length)), MAGIC);
  assert.ok(!new TextDecoder().decode(file).includes('hwip-backup'), '내용이 그대로 보이면 안 됨');
  assert.deepEqual(await unpack(file, 'pass-1234'), data);
  await assert.rejects(unpack(file, 'wrong-pass'), /pw/);
  await assert.rejects(unpack(file, ''), /nopw/);
  await assert.rejects(unpack(new TextEncoder().encode('{"a":1}')), /format/);
  assert.deepEqual(await unpack(await gzip(JSON.stringify(data))), data, '저장소의 잠그지 않은 gzip');
});

test('내보내기 요청 정리: 모르는 묶음 · 이상한 날짜 버림, 칸을 안 고르면 기본 칸', () => {
  const q = cleanReq({ sets: ['consults', 'nope'], f: { from: '2026-11-01', to: 'x', dong: '103', deal: 'zzz' }, cols: { consults: ['name', 'evil'] } });
  assert.deepEqual(q.sets, ['consults']);
  assert.deepEqual([q.f.from, q.f.to, q.f.dong, q.f.deal], ['2026-11-01', '', 103, '']);
  assert.deepEqual(q.cols.consults.map(c => c.k), ['name']);
  assert.ok(cleanReq({ sets: ['units'] }).cols.units.every(c => c.base));
  assert.equal(maskPh('010-1234-5678'), '010-****-5678');
});

let boss, mgr, top, staff;
test('준비: 대표 · 관리자 · 권한자 · 직원, 상담카드 3장 · 관심등록 1건', async () => {
  boss = agent('5.5.5.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (name, role, ipA) => {
    await boss('/api/admin/staff', { body: { op: 'add', name, role, license: '중개보조원' } });
    await boss('/api/admin/staff', { body: { op: 'pin', name, pin: '0000' } });
    const x = agent(ipA);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    return x;
  };
  mgr = await mk('관리가', '관리자', '5.5.5.2');
  top = await mk('권한나', '권한자', '5.5.5.3');
  staff = await mk('직원다', '직원', '5.5.5.4');
  await pushRow(boss, 'c', 'c1', { id: 'c1', kind: 'buyer', at: '2026-10-20 10:00', name: '김매수', phone: '010-1111-2222', writer: '대표', mgr: '직원다', text: '80A 전세 찾음', consent: { mkt: true } });
  await pushRow(boss, 'c', 'c2', { id: 'c2', kind: 'buyer', at: '2026-11-02 15:00', name: '김매수', phone: '01011112222', writer: '대표', text: '다시 문의' });
  await pushRow(boss, 'c', 'c3', { id: 'c3', kind: 'owner', at: '2026-11-01 09:00', unit: '101-1503', name: '윤소유', phone: '010-3131-4141', writer: '대표', trades: { jeonse: { dep: '52000', move: '협의' } } });
  const g = agent('5.5.5.9');
  assert.equal((await g('/api/public/lead', { body: { card: { id: 'g1730000000000', kind: 'client', at: '2026-11-03 09:30', name: '홍길동', phone: '010-2222-3333', interest: '80B', text: '원래 문의', consent: { req: true, mkt: true } } } })).status, 200);
  // 직원이 나중에 고쳐도 '관심등록 원본'은 처음 모습
  const gc = (await cardsOf(boss)).find(c => c.id === 'g1730000000000');
  await pushRow(boss, 'c', gc.id, Object.assign({}, gc, { text: '직원이 고친 내용' }));
});

test('내보내기: 대표 · 관리자만 (권한자 · 직원은 안 됨)', async () => {
  for (const x of [top, staff]) {
    assert.equal((await x('/api/admin/export')).status, 403);
    assert.equal((await x('/api/admin/export', { body: { sets: ['customers'] } })).status, 403);
  }
  const m = await mgr('/api/admin/export');
  assert.equal(m.status, 200);
  assert.deepEqual(m.json.sets.map(s => s.key), ['customers', 'consults', 'listings', 'units', 'tenancies', 'leads']);
  assert.equal(m.json.left, 10);
});

test('내보내기: 고객DB 는 연락처로 묶음 · 조건 · 가림 · 관심등록 원본 · 감사기록', async () => {
  let r = await boss('/api/admin/export', { body: { sets: ['customers', 'consults', 'leads', 'units', 'listings'] } });
  assert.equal(r.status, 200);
  const sh = k => r.json.sheets.find(s => s.key === k), col = (s, l) => s.cols.indexOf(l);
  const cu = sh('customers'), kim = cu.rows.find(x => x[col(cu, '성명')] === '김매수');
  assert.equal(kim[col(cu, '상담 수')], 2, '같은 번호 두 장 → 한 사람');
  assert.equal(sh('consults').rows.length, 4);
  const ld = sh('leads');
  assert.equal(ld.rows.length, 1);
  assert.equal(ld.rows[0][col(ld, '문의')], '원래 문의');
  assert.equal(sh('units').rows.length, 300);
  assert.ok(sh('listings').rows.some(x => x.includes('101동 1503호')), 'R1 매물');
  assert.match(r.json.file, /^대라수1차_.*\.xlsx$/);
  // 조건 + 가림 (외부 전달용)
  r = await boss('/api/admin/export', { body: { sets: ['consults'], f: { from: '2026-11-01' }, mask: { phone: true, name: true } } });
  const c = r.json.sheets[0];
  assert.equal(c.rows.length, 3, '11-01 이후만');
  assert.ok(!r.text.includes('3131-4141') && !r.text.includes('윤소유'));
  assert.ok(r.text.includes('010-****-4141') && r.text.includes('윤*유'));
  const log = (await boss('/api/admin/audit')).json.rows.filter(x => x.act === '엑셀 내보내기');
  assert.equal(log.length, 2);
  assert.match(log[0].detail, /가림 전화번호 · 이름/);
  assert.match(log[1].target, /고객DB 3건 · 상담이력 4건 · 관심등록 원본 1건 · 세대현황 300건/);
});

test('내보내기: 한 사람 하루 10번까지', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await mgr('/api/admin/export', { body: { sets: ['tenancies'] } })).status, 200, String(i));
  const r = await mgr('/api/admin/export', { body: { sets: ['tenancies'] } });
  assert.equal(r.status, 429);
  assert.equal((await mgr('/api/admin/export')).json.left, 0);
  assert.equal((await boss('/api/admin/export')).json.left, 8, '대표는 따로 셈');
});

let file;
test('백업: 관리자는 목록 · 지금 백업만, 전체 받기 · 복구는 대표', async () => {
  assert.equal((await staff('/api/admin/backup')).status, 403);
  assert.equal((await top('/api/admin/backup')).status, 403);
  let r = await mgr('/api/admin/backup', { body: { op: 'now' } });
  assert.equal(r.status, 200);
  assert.match(r.json.backup.key, /^hand\/\d{8}-\d{6}\.json\.gz$/);
  r = await mgr('/api/admin/backup');
  assert.equal(r.json.r2, true);
  assert.equal(r.json.full, false);
  assert.equal(r.json.list.length, 1);
  assert.ok(r.json.counts.kv > 0 && !('sessions' in r.json.counts), '출입증 표는 백업 안 함');
  assert.equal((await mgr('/api/admin/backup', { body: { op: 'download', pw: 'abcdefgh' } })).status, 403);
  assert.equal((await boss('/api/admin/backup', { body: { op: 'download', pw: 'short' } })).status, 400, '비밀번호 8자 이상');
  r = await boss('/api/admin/backup', { body: { op: 'download', pw: 'office-2027' } });
  assert.equal(r.status, 200);
  assert.match(decodeURIComponent(r.headers.get('content-disposition')), /전체백업_\d{8}\.hwipbak/);
  file = r.buf;
  assert.equal(new TextDecoder().decode(file.slice(0, MAGIC.length)), MAGIC);
  assert.ok(!r.text.includes('윤소유') && !r.text.includes('3131-4141'), '받은 파일에 고객 정보가 그대로 보이면 안 됨');
});

test('기준: 백업 → 복구 성공 (바뀐 자료는 백업 때로 · 직원 명단은 그대로 · 복구 직전 백업 남음)', async () => {
  // 백업 뒤에 생긴 일: 카드 하나 지움 · 하나 고침 · 새 카드 · 새 직원
  await pushRow(boss, 'c', 'c1', null);
  await pushRow(boss, 'c', 'c2', { id: 'c2', kind: 'buyer', at: '2026-11-02 15:00', name: '김매수', phone: '01011112222', writer: '대표', text: '바뀐 내용' });
  await pushRow(boss, 'c', 'c9', { id: 'c9', kind: 'client', at: '2026-11-03 11:00', name: '새손님', phone: '010-9999-0000', writer: '대표' });
  await boss('/api/admin/staff', { body: { op: 'add', name: '신입라', role: '직원' } });

  // 미리보기: 잠긴 파일 → 비밀번호 필요 · 틀리면 안 열림
  assert.equal((await boss('/api/admin/backup', { body: { op: 'preview', file: b64(file) } })).json.err, 'nopw');
  assert.equal((await boss('/api/admin/backup', { body: { op: 'preview', file: b64(file), pw: 'wrong-pass' } })).json.err, 'pw');
  let r = await boss('/api/admin/backup', { body: { op: 'preview', file: b64(file), pw: 'office-2027' } });
  assert.equal(r.status, 200);
  const st = r.json.rows.find(x => x.t === 'staff');
  assert.ok(st.keep && st.now === st.bak + 1, '직원 표는 지금 그대로 (표시)');
  assert.ok(r.json.rows.find(x => x.t === 'units').bak === 300);

  // 복구: 관리자 안 됨 · PIN 틀리면 안 됨
  assert.equal((await mgr('/api/admin/backup', { body: { op: 'restore', file: b64(file), pw: 'office-2027', pin: '4321' } })).status, 403);
  assert.equal((await boss('/api/admin/backup', { body: { op: 'restore', file: b64(file), pw: 'office-2027', pin: '9999' } })).status, 401);
  assert.ok(await cardsOf(boss).then(cs => cs.some(c => c.id === 'c9')), '틀린 PIN → 아무것도 안 바뀜');
  r = await boss('/api/admin/backup', { body: { op: 'restore', file: b64(file), pw: 'office-2027', pin: '1234' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.pre, /^pre\//);

  const cs = await cardsOf(boss), by = id => cs.find(c => c.id === id);
  assert.ok(by('c1'), '지웠던 카드 돌아옴');
  assert.equal(by('c2').text, '다시 문의', '고친 카드는 백업 때 내용');
  assert.ok(!by('c9'), '백업 뒤에 만든 카드는 없어짐');
  assert.ok(by('g1730000000000'));
  assert.ok((await boss('/api/admin/staff')).json.staff.some(s => s.name === '신입라'), '직원 명단은 그대로');
  assert.ok((await boss('/api/auth/me')).json.restoreAt > 0, '직원 화면에 복구 표시');
  assert.equal((await boss('/api/staff/listings')).json.rows.filter(l => l.unit_id === '101-1503').length, 1, '매물도 백업 때로');
  assert.ok((await mgr('/api/staff/pull?since=0')).status === 200, '복구 뒤 다른 직원 출입증 유지');

  // 복구 직전 상태가 저장소에 남아 → 그것으로 다시 되돌리면 c9 가 돌아옴
  const list = (await boss('/api/admin/backup')).json.list;
  assert.deepEqual(list.map(b => b.kind).sort(), ['hand', 'pre']);
  r = await boss('/api/admin/backup', { body: { op: 'preview', key: r.json.pre } });
  assert.equal(r.status, 200);
  r = await boss('/api/admin/backup', { body: { op: 'restore', key: list.find(b => b.kind === 'pre').key, pin: '1234' } });
  assert.equal(r.status, 200);
  assert.ok((await cardsOf(boss)).some(c => c.id === 'c9'), '복구를 되돌림');

  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  for (const a of ['복구', '복구 PIN 틀림', '전체 백업 받기', '백업 만들기']) assert.ok(acts.includes(a), a);
  assert.equal((await boss('/api/admin/backup', { body: { op: 'preview', key: '../../etc' } })).status, 404, '저장소 밖 이름 막음');
});

test('권한표(perms)는 대표만 바꿈 (관리자가 보낸 값은 거절)', async () => {
  const r = await pushRow(mgr, 'cfg', 'perms', { excel: { 관리자: true, 직원: true, 열람: true } });
  assert.deepEqual(r.json.rejected, ['cfg|perms']);
  assert.deepEqual((await pushRow(mgr, 'cfg', 'restoreAt', 1)).json.rejected, ['cfg|restoreAt']);
  assert.deepEqual((await pushRow(boss, 'cfg', 'perms', { excel: { 관리자: true, 직원: false, 열람: false } })).json.rejected, []);
});
