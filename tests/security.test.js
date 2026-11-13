// P2 보안 기반 자동 테스트 — 설계서 1.4 기준 2 · 3
//   기준 2: 로그인 안 한 사람이 /api/ 어디를 두드려도 고객 이름 · 전화번호가 0건
//   기준 3: '열람' 직원은 고객 전화번호가 010-****-**** 로만 (서버가 가려서 보냄)
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createTestHarness } from './harness.js';

const KEY = 'test-office-code';
const SECRET_NAME = '홍길동', SECRET_PHONE = '010-1234-5678', OWNER = '김소유', OWNER_PHONE = '010-9876-5432';
let mf;
// wrangler.jsonc 그대로 띄우고 비밀값만 시험용으로 (DB는 매번 새로)
const server = async secrets => { const h = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets }] }); await h.listen(); return h; };

before(async () => { mf = await server({ STAFF_KEY: KEY, TURNSTILE_SECRET: '' }); });
after(() => mf && mf.close());

// 쿠키를 기억하는 간이 브라우저
function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = Object.assign({ 'content-type': 'application/json', 'cf-connecting-ip': ipAddr || '1.1.1.1' }, opt.headers);
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}

let boss, viewer, staff;
const login = async (a, name, pin) => (await a('/api/auth/login', { body: { name, pin } })).json;

test('준비: 기기 등록 → 대표 PIN → 직원 · 열람 등록 → 고객 자료 저장', async () => {
  boss = agent('2.2.2.2');
  assert.equal((await boss('/api/auth/device', { body: { code: 'wrong' } })).status, 401);
  assert.equal((await boss('/api/auth/device', { body: { code: KEY } })).status, 200);
  assert.equal((await boss('/api/auth/setup', { body: { name: '황후권', pin: '1234' } })).status, 200);
  assert.equal((await boss('/api/auth/setup', { body: { name: '누군가', pin: '9999' } })).status, 409, '대표 PIN은 처음 한 번만');
  for (const [name, role] of [['열람이', '열람'], ['직원이', '직원']]) {
    assert.equal((await boss('/api/admin/staff', { body: { op: 'add', name, role } })).status, 200);
    assert.equal((await boss('/api/admin/staff', { body: { op: 'pin', name, pin: '0000' } })).status, 200);
  }
  const r = await boss('/api/staff/push', { body: { rows: [
    { s: 'c', k: 'c1', v: JSON.stringify({ id: 'c1', name: SECRET_NAME, phone: SECRET_PHONE, birth: '1980-01-01', memo: '내부 메모', text: '연락처 ' + SECRET_PHONE + ' 로 전화', writer: '황후권' }), at: Date.now() },
    { s: 'c', k: 'c2', v: JSON.stringify({ id: 'c2', name: '이직원고객', phone: '010-2222-3333', writer: '직원이' }), at: Date.now() },
    { s: 'u', k: '101-1001', v: JSON.stringify({ owner: OWNER, phone: OWNER_PHONE, ownerHist: [{ from: { owner: '박전주', phone: '010-5555-6666' } }] }), at: Date.now() },
    { s: 'cfg', k: 'pins', v: JSON.stringify({ 황후권: 'abc' }), at: Date.now() }
  ] } });
  assert.equal(r.json.n, 3);
  assert.deepEqual(r.json.rejected, ['cfg|pins'], 'PIN 암호값은 화면 공유 설정에 못 올림');
});

test('기준 2: 로그인 안 한 사람은 어떤 /api/ 주소에서도 고객 이름 · 전화번호를 못 받음', async () => {
  const anon = agent('3.3.3.3');
  const paths = ['/api/staff/pull?since=0', '/api/staff/hist?s=c&k=c1', '/api/admin/staff', '/api/admin/audit', '/api/auth/me', '/api/public/ping',
    '/api/pull', '/api/push', '/api/hist?s=c&k=c1', '/api/guest', '/api/ping', '/api/comments', '/api/public/comments?t=u:101-1001', '/api/staff/comments?view=all', '/api/staff/comments/hist?id=x', '/api/public/listings', '/api/x', '/api/staff/../staff/pull'];
  for (const p of paths) for (const method of ['GET', 'POST']) {
    const r = await anon(p, { method, body: method === 'POST' ? { rows: [] } : undefined });
    for (const s of [SECRET_NAME, SECRET_PHONE, '1234-5678', OWNER, OWNER_PHONE]) assert.ok(!r.text.includes(s), method + ' ' + p + ' 에서 ' + s + ' 노출');
    if (p.startsWith('/api/staff/') || p.startsWith('/api/admin/')) assert.equal(r.status, 401, p);
  }
  // 기기만 등록하고 로그인 안 한 경우도 마찬가지
  const devOnly = agent('3.3.3.4');
  await devOnly('/api/auth/device', { body: { code: KEY } });
  const r = await devOnly('/api/staff/pull?since=0');
  assert.equal(r.status, 401);
  assert.ok(!r.text.includes(SECRET_PHONE));
});

test('기기 등록 없이 PIN만으로는 로그인 안 됨', async () => {
  const a = agent('4.4.4.4');
  const r = await a('/api/auth/login', { body: { name: '황후권', pin: '1234' } });
  assert.equal(r.status, 401);
  assert.equal(r.json.err, 'device');
});

test('임시 PIN으로 로그인하면 새 PIN을 정하기 전엔 자료를 못 받음', async () => {
  viewer = agent('5.5.5.5');
  await viewer('/api/auth/device', { body: { code: KEY } });
  const j = await login(viewer, '열람이', '0000');
  assert.equal(j.user.mustChange, true);
  assert.equal((await viewer('/api/staff/pull?since=0')).status, 403);
  assert.equal((await viewer('/api/auth/pin', { body: { pin: '4321' } })).status, 200);
});

test('기준 3: 열람 직원에게는 서버가 이름 · 전화번호를 가려서 보냄', async () => {
  const r = await viewer('/api/staff/pull?since=0');
  assert.equal(r.status, 200);
  const rows = r.json.rows;
  const c1 = JSON.parse(rows.find(x => x.s === 'c' && x.k === 'c1').v);
  assert.equal(c1.phone, '010-****-****');
  assert.equal(c1.name, '홍*동');
  assert.equal(c1.birth, '');
  assert.equal(c1.memo, '');
  assert.ok(!c1.text.includes('1234-5678'), '상담내용 속 전화번호도 가림');
  const u = JSON.parse(rows.find(x => x.s === 'u').v);
  assert.equal(u.phone, '010-****-****');
  assert.equal(u.ownerHist[0].from.phone, '010-****-****');
  for (const s of [SECRET_PHONE, '1234-5678', SECRET_NAME, OWNER_PHONE, '5555-6666']) assert.ok(!r.text.includes(s), s + ' 노출');
  assert.ok(!rows.some(x => x.s === 'cfg' && x.k === 'pins'), 'PIN 설정은 안 내려감');
  const h = await viewer('/api/staff/hist?s=c&k=c1');
  assert.ok(!h.text.includes(SECRET_PHONE), '수정 이력에서도 가림');
});

test('열람 직원은 고객 자료를 못 고침', async () => {
  const r = await viewer('/api/staff/push', { body: { rows: [
    { s: 'c', k: 'c1', v: JSON.stringify({ id: 'c1', name: '바꿈', phone: '010-0000-0000' }), at: Date.now() + 1000 },
    { s: 'c', k: 'new1', v: JSON.stringify({ id: 'new1', name: '새고객' }), at: Date.now() },
    { s: 'cfg', k: 'perms', v: '{}', at: Date.now() }
  ] } });
  assert.equal(r.json.n, 0);
  assert.equal(r.json.rejected.length, 3);
});

test('직원은 본인 카드만 원문, 남의 카드는 가림 · 수정 불가', async () => {
  staff = agent('6.6.6.6');
  await staff('/api/auth/device', { body: { code: KEY } });
  await login(staff, '직원이', '0000');
  await staff('/api/auth/pin', { body: { pin: '5678' } });
  const rows = (await staff('/api/staff/pull?since=0')).json.rows;
  assert.equal(JSON.parse(rows.find(x => x.k === 'c2').v).phone, '010-2222-3333');
  assert.equal(JSON.parse(rows.find(x => x.k === 'c1').v).phone, '010-****-****');
  const r = await staff('/api/staff/push', { body: { rows: [{ s: 'c', k: 'c1', v: JSON.stringify({ id: 'c1', name: '덮어쓰기' }), at: Date.now() + 2000 }] } });
  assert.deepEqual(r.json.rejected, ['c|c1']);
});

test('가린 값을 그대로 돌려보내도 원본이 지워지지 않음', async () => {
  // 직원 세대 수정 권한을 켜고, 가려진 세대 자료에서 메모만 바꿔 보냄
  await boss('/api/staff/push', { body: { rows: [{ s: 'cfg', k: 'perms', v: JSON.stringify({ create: { 관리자: true, 직원: true, 열람: false } }), at: Date.now() }] } });
  const rows = (await staff('/api/staff/pull?since=0')).json.rows;
  const u = JSON.parse(rows.find(x => x.s === 'u').v);
  u.status = '매물';
  const r = await staff('/api/staff/push', { body: { rows: [{ s: 'u', k: '101-1001', v: JSON.stringify(u), at: Date.now() + 3000 }] } });
  assert.equal(r.json.n, 1);
  const back = JSON.parse((await boss('/api/staff/pull?since=0')).json.rows.find(x => x.s === 'u').v);
  assert.equal(back.phone, OWNER_PHONE);
  assert.equal(back.owner, OWNER);
  assert.equal(back.status, '매물');
});

test('상담 삭제는 대표 · 관리자만, 사유 필수 · 지운 사람은 서버가 적음 · 되살리기', async () => {
  const pull = async () => JSON.parse((await boss('/api/staff/pull?since=0')).json.rows.filter(x => x.k === 'c2').pop().v);
  const c2 = await pull(), t = Date.now() + 5000;
  const send = (who, v, at) => who('/api/staff/push', { body: { rows: [{ s: 'c', k: 'c2', v: JSON.stringify(v), at }] } });
  assert.deepEqual((await send(staff, Object.assign({}, c2, { deleted: { reason: '중복 등록' } }), t)).json.rejected, ['c|c2'], '직원은 본인 카드도 못 지움');
  assert.deepEqual((await staff('/api/staff/push', { body: { rows: [{ s: 'c', k: 'c2', v: 'null', at: t }] } })).json.rejected, ['c|c2'], '직원은 완전 삭제도 못 함');
  assert.deepEqual((await send(boss, Object.assign({}, c2, { deleted: { reason: '  ' } }), t)).json.rejected, ['c|c2'], '사유 없으면 거절');
  assert.equal((await send(boss, Object.assign({}, c2, { deleted: { reason: '중복 등록', by: '가짜' } }), t + 1)).json.n, 1);
  const d = (await pull()).deleted;
  assert.equal(d.by, '황후권'); assert.equal(d.reason, '중복 등록');
  // 지운 뒤 고쳐 보내도 사유 · 지운 사람은 그대로
  await send(boss, Object.assign({}, c2, { memo: 'x', deleted: { reason: '바꿈', by: '누가' } }), t + 2);
  assert.equal((await pull()).deleted.reason, '중복 등록');
  assert.equal((await send(boss, Object.assign({}, c2), t + 3)).json.n, 1);
  assert.equal((await pull()).deleted, undefined);
  const log = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(log.includes('상담 삭제') && log.includes('상담 되살리기'));
});

test('PIN 5번 틀리면 잠김 (서버 저장) · 감사기록에 남음', async () => {
  const a = agent('7.7.7.7');
  await a('/api/auth/device', { body: { code: KEY } });
  for (let i = 1; i <= 4; i++) assert.equal((await a('/api/auth/login', { body: { name: '직원이', pin: '1111' } })).json.n, i);
  assert.equal((await a('/api/auth/login', { body: { name: '직원이', pin: '1111' } })).status, 423);
  assert.equal((await a('/api/auth/login', { body: { name: '직원이', pin: '5678' } })).status, 423, '맞는 PIN도 잠김 동안은 거절');
  const log = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  for (const act of ['로그인 잠김', '로그인 실패', '로그인', '임시 PIN 발급', '기기등록 실패', '대표 PIN 처음 설정', '권한표 변경']) assert.ok(log.includes(act), act);
  assert.equal((await viewer('/api/admin/audit')).status, 403, '열람은 감사기록 못 봄');
});

test('직원 관리는 대표만', async () => {
  assert.equal((await staff('/api/admin/staff', { body: { op: 'add', name: '몰래', role: '관리자' } })).status, 403);
  assert.equal((await boss('/api/admin/staff', { body: { op: 'role', name: '황후권', role: '직원' } })).status, 409, '대표는 최소 1명');
});

test('게스트 등록: 형식 검사 · 동의 필수 · 횟수 제한 · 응답에 내용 없음', async () => {
  const g = agent('8.8.8.8');
  const card = n => ({ id: 'g' + (Date.now() + n), kind: 'buyer', name: '게스트' + n, phone: '010-7777-' + String(1000 + n), consent: { req: true }, mgr: '황후권', memo: 'x' });
  assert.equal((await g('/api/public/lead', { body: { card: Object.assign(card(0), { phone: '12' }) } })).status, 400);
  assert.equal((await g('/api/public/lead', { body: { card: Object.assign(card(0), { consent: { req: false } }) } })).status, 400);
  for (let i = 1; i <= 5; i++) { const r = await g('/api/public/lead', { body: { card: card(i) } }); assert.equal(r.status, 200); assert.equal(r.text, '{"ok":true}'); }
  assert.equal((await g('/api/public/lead', { body: { card: card(6) } })).status, 429, '같은 IP 10분 5건');
  const g2 = agent('9.9.9.9'), same = card(9);
  for (let i = 0; i < 3; i++) assert.equal((await agent('9.9.9.' + (10 + i))('/api/public/lead', { body: { card: Object.assign({}, same, { id: 'g' + (Date.now() + 100 + i) }) } })).status, 200);
  assert.equal((await g2('/api/public/lead', { body: { card: same } })).status, 429, '같은 전화번호 하루 3건');
  const saved = JSON.parse((await boss('/api/staff/pull?since=0')).json.rows.find(x => x.v.includes('게스트1')).v);
  assert.equal(saved.writer, '게스트 등록');
  assert.equal(saved.mgr, undefined, '게스트가 담당자를 정할 수 없음');
  assert.equal(saved.memo, undefined);
});

test('로봇 확인 비밀키가 설정되면 토큰 없는 등록은 거절', async () => {
  const m2 = await server({ STAFF_KEY: KEY, TURNSTILE_SECRET: 'x' });
  const r = await m2.fetch('http://localhost/api/public/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card: { kind: 'buyer', name: '봇', phone: '010-1111-2222', consent: { req: true } } }) });
  assert.equal(r.status, 403);
  await m2.close();
});

test('다른 사이트에서 보낸 요청은 거절', async () => {
  const r = await boss('/api/staff/push', { body: { rows: [] }, headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('게스트 API 코드는 직원용 · 고객 읽기 함수를 import 하지 않음', () => {
  for (const f of readdirSync('src/public-api').map(x => 'src/public-api/' + x).concat('src/popups/public.js')) {
    const src = readFileSync(f, 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
    for (const i of imports) assert.ok(!/staff-api|repo\/kv|repo\/auth|repo\/index|repo\/d1|auth\/index|core\/mask/.test(i), f + ' 가 ' + i + ' 를 불러옴');
  }
});
