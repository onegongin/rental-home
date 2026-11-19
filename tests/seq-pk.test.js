// 상담 N차 = 같은 연락처면 같은 사람 (시안 r66 A안 확정 2026-11-19)
//   서버: 상담카드마다 사람 표시 pk — 가린 화면에서도 같은 값, 번호는 안 보임, 화면이 보낸 pk 는 저장 안 함
//   화면: dashboard 의 N차 셈(seqKeyOf · seqMap)이 pk 로 묶음 — 쓴 직원 · 구분이 달라도 이어서, 같은 호실 다른 사람은 따로
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestHarness } from './harness.js';
import { personBase } from '../src/staff-api/pk.js';

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
    const r = await mf.fetch('http://localhost' + path, { method: opt.body ? 'POST' : 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}

// dashboard.dc.html 에서 N차 셈 함수만 꺼내 씀
function seqFns(cards) {
  const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
  const pick = name => { const m = src.match(new RegExp(String.raw`\n  ` + name + String.raw`\([^)]*\) \{[\s\S]*?(?=\n  [a-zA-Z_]+\(|\n  //)`)); assert.ok(m, name); return m[0].trim(); };
  const o = new Function('return { ' + ['gDig', 'gTs', 'pAlias', 'pKey', 'seqKeyOf', 'seqMap'].map(pick).join(',\n') + ' }')();
  o.state = { cards };
  return o;
}

const C = [
  { id: 'c1763000000001', at: '2026-11-10', kind: 'client', name: '김민수', phone: '010-1111-2222', writer: '황후권' },
  { id: 'c1763000000002', at: '2026-11-12', kind: 'client', name: '김민수', phone: '01011112222', writer: '직원이' },
  { id: 'c1763000000003', at: '2026-11-14', kind: 'client', name: '김진수', phone: '010-3333-4444', writer: '황후권' },
  { id: 'c1763000000004', at: '2026-11-05', kind: 'seller', unit: '101-501', name: '홍길동', phone: '010-5555-6666', writer: '황후권' },
  { id: 'c1763000000005', at: '2026-11-15', kind: 'client', name: '홍길동', phone: '010-5555-6666', writer: '황후권' },
  { id: 'c1763000000006', at: '2026-11-16', kind: 'seller', unit: '101-501', name: '이영희', phone: '010-7777-8888', writer: '황후권' },
  { id: 'c1763000000007', at: '2026-11-17', kind: 'seller', unit: '102-301', name: '박없음', writer: '황후권' },
  { id: 'c1763000000008', at: '2026-11-18', kind: 'seller', unit: '102-301', name: '박없음', writer: '황후권' }
];

let boss, staff;
test('준비: 대표 · 직원 + 상담카드 8장', async () => {
  boss = agent('8.8.1.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '황후권', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원이', role: '직원' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '직원이', pin: '0000' } });
  const r = await boss('/api/staff/push', { body: { rows: C.map(c => ({ s: 'c', k: c.id, v: JSON.stringify(c), at: Date.now() })) } });
  assert.equal(r.json.n, 8);
  staff = agent('8.8.1.2');
  await staff('/api/auth/device', { body: { code: KEY } });
  await staff('/api/auth/login', { body: { name: '직원이', pin: '0000' } });
  await staff('/api/auth/pin', { body: { pin: '5678' } });
});

const cardsOf = async who => (await who('/api/staff/pull?since=0')).json.rows.filter(x => x.s === 'c').map(x => JSON.parse(x.v));

test('서버: 가린 카드도 같은 사람이면 같은 pk · 번호는 안 보임', async () => {
  const S = await cardsOf(staff), B = await cardsOf(boss), by = (L, id) => L.find(c => c.id === id);
  assert.equal(new Set(S.map(c => c.id)).size, 8, '가린 화면도 카드 번호는 그대로 (c + 13자리)');
  assert.equal(by(S, C[0].id).phone, '010-****-****');
  assert.equal(by(S, C[0].id).pk, by(S, C[1].id).pk, '쓴 직원이 달라도 같은 사람');
  assert.equal(by(S, C[0].id).pk, by(B, C[0].id).pk, '대표 화면과 같은 값');
  assert.notEqual(by(S, C[0].id).pk, by(S, C[2].id).pk, '김민수 ≠ 김진수');
  assert.match(by(S, C[0].id).pk, /^p[0-9a-f]{16}$/);
  assert.match(by(S, C[6].id).pk, /^n[0-9a-f]{16}$/, '연락처 없으면 호실 + 이름');
  assert.equal(by(S, C[6].id).pk, by(S, C[7].id).pk);
  for (const c of S) assert.ok(!JSON.stringify(c).includes('1111') || c.writer === '직원이', '가린 카드에 번호 없음');
  assert.equal(personBase({ name: '홍길동', kind: 'seller', unit: '101-501' }), 'n|101-501|홍길동');
});

test('서버: 화면이 보낸 pk 는 저장 안 함', async () => {
  const c = Object.assign({}, C[1], { pk: 'pFAKE', text: '다시 저장' });
  assert.equal((await staff('/api/staff/push', { body: { rows: [{ s: 'c', k: c.id, v: JSON.stringify(c), at: Date.now() + 1000 }] } })).json.n, 1);
  const B = await cardsOf(boss), x = B.find(y => y.id === c.id);
  assert.equal(x.text, '다시 저장');
  assert.equal(x.pk, B.find(y => y.id === C[0].id).pk);
});

test('화면: N차 = 같은 연락처 (구분 · 쓴 직원 달라도) · 같은 호실 다른 사람은 따로 · 가린 화면도 같은 숫자', async () => {
  for (const who of [staff, boss]) {
    const L = (await cardsOf(who)).sort((a, b) => a.id.localeCompare(b.id)), m = seqFns(L).seqMap();
    const n = i => m[C[i].id].n + '/' + m[C[i].id].tot;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(n), ['1/2', '2/2', '1/1', '1/2', '2/2', '1/1', '1/2', '2/2']);
  }
  // 아직 서버에 안 간 카드 = 원래 번호로 같은 사람 찾음
  const L = await cardsOf(boss), f = seqFns(L), nw = { id: 'c1763000000099', at: '2026-11-19', kind: 'buyer', name: '김민수 ', phone: '010 1111 2222' };
  assert.equal(f.seqKeyOf(nw), f.seqKeyOf(L.find(c => c.id === C[0].id)));
});
