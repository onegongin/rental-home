// P5 알림 자동 테스트 — 설계서 12장 · 2026-11-02 대표 결정
//   그룹방 = 사이트 알림 전부(원문) · 개인 = 그 직원 담당 건만 · 조용한 시간 → 아침 요약에 합침 · 긴급은 바로
//   진짜 텔레그램 대신 이 파일이 띄운 가짜 텔레그램 서버로 보낸다 (TG_API)
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTestHarness } from './harness.js';
import { isQuiet } from '../src/notify/index.js';

const KEY = 'test-office-code', GROUP = '-1001234567', BOSS_TG = '777', A_TG = '555';
const sent = [], fakeUpdates = [];
let failChat = '';
const tgServer = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
    const m = req.url.split('/').pop(), b = raw ? JSON.parse(raw) : {};
    let out = { ok: true, result: true };
    if (m === 'getMe') out = { ok: true, result: { username: 'centennial_test_bot' } };
    if (m === 'getUpdates') out = { ok: true, result: fakeUpdates };
    if (m === 'sendMessage') {
      if (String(b.chat_id) === failChat) out = { ok: false, description: 'Bad Request: server down' };
      else sent.push({ chat: String(b.chat_id), text: b.text });
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
});

let mf;
before(async () => {
  await new Promise(r => tgServer.listen(0, '127.0.0.1', r));
  mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '', TG_TOKEN: 'T', TG_API: 'http://127.0.0.1:' + tgServer.address().port } }] });
  await mf.listen();
});
after(() => { mf && mf.close(); tgServer.close(); });

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
// 응답 뒤에 보내므로(waitUntil) 잠깐 기다리며 확인
async function waitSent(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const x = sent.filter(fn); if (x.length) return x; await new Promise(r => setTimeout(r, 30)); }
  return [];
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const UID = '102-1201';
const pushRow = (a, s, k, v, at = Date.now()) => a('/api/staff/push', { body: { rows: [{ s, k, v: JSON.stringify(v), at }] } });
const boardOf = async (a, uid) => (await a('/api/staff/listings')).json.rows.filter(x => x.unit_id === uid);
const act = (a, l, op, b) => a('/api/staff/listings/' + l.id + (op ? '/' + op : ''), { method: op ? 'POST' : 'PATCH', body: Object.assign({ ver: l.ver }, b) });
const admin = (a, b) => a('/api/admin/notify', b ? { body: b } : {});

test('조용한 시간 계산 (한국 시간 21시 ~ 다음날 8시)', () => {
  const at = h => Date.parse('2026-11-02T' + String(h).padStart(2, '0') + ':30:00+09:00');
  assert.equal(isQuiet([21, 8], at(21)), true);
  assert.equal(isQuiet([21, 8], at(3)), true);
  assert.equal(isQuiet([21, 8], at(8)), false);
  assert.equal(isQuiet([21, 8], at(14)), false);
  assert.equal(isQuiet([0, 0], at(3)), false, '같은 숫자 = 조용한 시간 없음');
});

let boss, a, b;
test('준비: 대표 · 직원 2명 · 그룹방 찾기 · 조용한 시간 끄기', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (name, ipA) => {
    await boss('/api/admin/staff', { body: { op: 'add', name, role: '직원' } });
    await boss('/api/admin/staff', { body: { op: 'pin', name, pin: '0000' } });
    const x = agent(ipA);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    return x;
  };
  a = await mk('직원가', '3.3.3.1');
  b = await mk('직원나', '3.3.3.2');
  fakeUpdates.push({ update_id: 1, message: { chat: { id: Number(GROUP), type: 'supergroup', title: '센테니얼아이파크 알람' }, text: '/start' } });
  const f = await admin(boss, { op: 'find' });
  assert.deepEqual(f.json.groups, [{ id: GROUP, title: '센테니얼아이파크 알람' }]);
  assert.equal((await admin(boss, { op: 'group', id: GROUP, title: '센테니얼아이파크 알람' })).status, 200);
  assert.equal((await admin(boss, { op: 'set', quiet: [0, 0] })).status, 200);
  const g = await admin(boss);
  assert.equal(g.json.bot, 'centennial_test_bot');
  assert.equal(g.json.cfg.group, GROUP);
});

test('권한: 알림 설정은 대표 · 관리자만 · 화면 공유로 못 바꾸고 직원에겐 안 보냄', async () => {
  assert.equal((await admin(a)).status, 403);
  assert.equal((await admin(a, { op: 'group', id: '-1' })).status, 403);
  const r = await pushRow(boss, 'cfg', 'notify', { group: '-999' });
  assert.deepEqual(r.json.rejected, ['cfg|notify']);
  const pull = await a('/api/staff/pull?since=0');
  assert.ok(!pull.json.rows.some(x => x.s === 'cfg' && x.k === 'notify'), '직원에게 그룹방 번호가 내려감');
});

test('내 텔레그램 연결: 코드 → 봇에서 [시작] → [확인] → 연결 · 환영 메시지', async () => {
  const l = await a('/api/staff/notify/link', { body: {} });
  assert.equal(l.status, 200);
  assert.match(l.json.url, /^https:\/\/t\.me\/centennial_test_bot\?start=[0-9a-f]{12}$/);
  assert.equal((await a('/api/staff/notify/check', { body: {} })).json.linked, false, '아직 [시작] 전');
  fakeUpdates.push({ update_id: 2, message: { chat: { id: Number(A_TG), type: 'private' }, text: '/start ' + l.json.code } });
  assert.equal((await a('/api/staff/notify/check', { body: {} })).json.linked, true);
  assert.ok((await waitSent(x => x.chat === A_TG && /연결되었습니다/.test(x.text))).length);
  assert.equal((await a('/api/staff/notify/me')).json.linked, true);
  assert.equal((await b('/api/staff/notify/check', { body: {} })).status, 409, '남의 코드로는 연결 안 됨');
  // 대표도 연결 (보안 긴급 개인 알림 확인용)
  const lb = await boss('/api/staff/notify/link', { body: {} });
  fakeUpdates.push({ update_id: 3, message: { chat: { id: Number(BOSS_TG), type: 'private' }, text: '/start ' + lb.json.code } });
  assert.equal((await boss('/api/staff/notify/check', { body: {} })).json.linked, true);
});

test('관심등록 → 그룹방에 원문(이름 · 번호) · 개인 알림 없음', async () => {
  sent.length = 0;
  const g = agent('9.9.9.1');
  const r = await g('/api/public/lead', { body: { card: { kind: 'client', name: '홍길동', phone: '010-2222-3333', interest: '84B 전세', consent: { req: true } } } });
  assert.equal(r.status, 200);
  const m = await waitSent(x => x.chat === GROUP);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /^\[관심등록\] 신규고객 · 홍길동 · 010-2222-3333/);
  assert.match(m[0].text, /\/staff\/\?go=c:g\d+/, '직원 화면 바로가기');
  await pause(100);
  assert.equal(sent.filter(x => x.chat !== GROUP).length, 0);
});

let L;
test('매물: 상태 바뀜 → 그룹방 + 담당 개인 · 바꾼 본인에겐 개인 알림 안 감', async () => {
  await pushRow(a, 'c', 'n1', { id: 'n1', kind: 'owner', unit: UID, name: '윤소유', phone: '010-3131-4141', writer: '직원가', trades: { jeonse: { dep: '52000', move: '협의' } } });
  [L] = await boardOf(a, UID);
  assert.equal(L.mgr, '직원가');
  sent.length = 0;
  let r = await act(boss, L, 'status', { status: '가계약' });
  assert.equal(r.status, 200);
  const dm = await waitSent(x => x.chat === A_TG);
  assert.equal(dm.length, 1);
  assert.match(dm[0].text, /^\[가계약\] 102동 1201호 · 전세 · 5억 2,000만/);
  assert.ok(sent.some(x => x.chat === GROUP && /^\[가계약\]/.test(x.text)));
  sent.length = 0;
  r = await act(a, Object.assign(L, { ver: r.json.ver }), 'status', { status: '협의중' });
  assert.equal(r.status, 200);
  await waitSent(x => x.chat === GROUP);
  await pause(100);
  assert.equal(sent.filter(x => x.chat === A_TG).length, 0, '본인이 바꾼 건 본인에게 안 보냄');
});

test('개인 알림은 본인 담당 건만: 직원나 매물이 바뀌어도 직원가에게 안 감', async () => {
  await pushRow(b, 'c', 'n2', { id: 'n2', kind: 'owner', unit: '102-1301', name: '박소유', phone: '010-5151-6161', writer: '직원나', trades: { sale: { ask: '90000' } } });
  const [l2] = await boardOf(boss, '102-1301');
  sent.length = 0;
  assert.equal((await act(boss, l2, 'status', { status: '협의중' })).status, 200);
  assert.equal((await waitSent(x => x.chat === GROUP)).length, 1);
  await pause(100);
  assert.equal(sent.filter(x => x.chat === A_TG).length, 0);
});

test('담당 변경 → 새 담당 개인 알림', async () => {
  const [l2] = await boardOf(boss, '102-1301');
  sent.length = 0;
  assert.equal((await act(boss, l2, 'assign', { staff: '직원가' })).status, 200);
  const dm = await waitSent(x => x.chat === A_TG);
  assert.match(dm[0].text, /^\[매물 담당\] 102동 1301호 · 매매 · 9억\n직원나 → 직원가/);
});

test('조용한 시간: 보류 → 아침 요약에 합쳐서 한 번 · 긴급(로그인 잠김)은 바로', async () => {
  await admin(boss, { op: 'set', quiet: [0, 24] });   // 하루 종일 조용한 시간
  sent.length = 0;
  await agent('9.9.9.2')('/api/public/lead', { body: { card: { kind: 'buyer', name: '김밤중', phone: '010-4444-5555', consent: { req: true } } } });
  [L] = await boardOf(a, UID);
  await act(boss, L, 'status', { status: '가계약' });
  await pause(200);
  assert.equal(sent.length, 0, '조용한 시간엔 안 보냄');
  let g = await admin(boss);
  assert.ok(g.json.rows.filter(x => x.status === 'held').length >= 3, '그룹방 2 + 직원가 1 보류');

  // 긴급: 로그인 5번 틀림 → 조용한 시간이어도 그룹방 + 대표 바로
  const x = agent('3.3.3.9');
  await x('/api/auth/device', { body: { code: KEY } });
  for (let i = 0; i < 5; i++) await x('/api/auth/login', { body: { name: '직원나', pin: '9999' } });
  assert.ok((await waitSent(m => m.chat === BOSS_TG && /로그인 잠김/.test(m.text))).length);
  assert.ok(sent.some(m => m.chat === GROUP && /^\[긴급 · 로그인 잠김\] 직원나/.test(m.text)));

  sent.length = 0;
  const r = await admin(boss, { op: 'morning' });
  assert.equal(r.status, 200);
  const grp = sent.filter(m => m.chat === GROUP);
  assert.equal(grp.length, 1, '그룹방엔 요약 한 통');
  assert.match(grp[0].text, /아침 요약/);
  assert.match(grp[0].text, /밤사이 알림 2건/);
  assert.match(grp[0].text, /\[관심등록\] 분양권 매수 · 김밤중/);
  const mine = sent.filter(m => m.chat === A_TG);
  assert.equal(mine.length, 1);
  assert.match(mine[0].text, /직원가님 담당[\s\S]*밤사이 내 알림 1건[\s\S]*\[가계약\]/);
  g = await admin(boss);
  assert.equal(g.json.rows.filter(x => x.status === 'held').length, 0, '보류는 모두 합쳐짐');
  await admin(boss, { op: 'set', quiet: [0, 0] });
});

test('권한 변경은 긴급 · 보안 알림은 끌 수 없음', async () => {
  await admin(boss, { op: 'set', off: ['lead', 'security'] });
  assert.deepEqual((await admin(boss)).json.cfg.off, ['lead']);
  sent.length = 0;
  await agent('9.9.9.3')('/api/public/lead', { body: { card: { kind: 'buyer', name: '끈알림', phone: '010-6666-7777', consent: { req: true } } } });
  await boss('/api/admin/staff', { body: { op: 'role', name: '직원나', role: '권한자' } });
  const m = await waitSent(x => x.chat === GROUP);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /^\[권한 변경\] 역할 변경 · 직원나 직원 → 권한자/);
  await admin(boss, { op: 'set', off: [] });
});

test('보내기 실패 → 3번 시도 후 실패 기록 → [다시 보내기]', async () => {
  failChat = GROUP;
  await agent('9.9.9.4')('/api/public/lead', { body: { card: { kind: 'buyer', name: '실패중', phone: '010-8888-9999', consent: { req: true } } } });
  let g;
  for (let i = 0; i < 100; i++) { g = await admin(boss); if (g.json.fails) break; await pause(30); }
  assert.equal(g.json.fails, 1);
  const f = g.json.rows.find(x => x.status === 'fail');
  assert.equal(f.tries, 3);
  assert.match(f.err, /server down/);
  failChat = '';
  sent.length = 0;
  const r = await admin(boss, { op: 'retry' });
  assert.equal(r.json.sent, 1);
  assert.match(sent[0].text, /실패중/);
});
