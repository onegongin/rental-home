// R3-5 분양가표 + 전세연장 (시안 r3-price 확정 2026-11-13)
//   300세대 모두 가격 · 매입보장가 = 혜택가 + 4,000만 · 테라스 · 전세연장 표 · 직원만 · 손님 API · 공개 파일에 가격 없음 · 상담카드 자동 채움
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createTestHarness } from './harness.js';
import { ALL_PRICES, priceOf } from '../src/core/price.js';

test('규칙: 300세대 · 기존 표 값 · 전세연장', () => {
  const all = ALL_PRICES();
  assert.equal(all.length, 300);
  assert.ok(all.every(p => p.hedge - p.benefit === 40e6), '매입보장가 = 혜택가 + 4,000만');
  assert.ok(all.every(p => p.dep > 0 && p.need === p.benefit - p.dep), '필요금액 = 혜택가 − 보증금');
  const a = priceOf('101-401');
  assert.deepEqual([a.type, a.benefit, a.hedge, a.terrace], ['80B', 421e6, 461e6, true]);
  assert.equal(priceOf('101-501').benefit, 387e6); assert.equal(priceOf('101-701').benefit, 395e6);
  assert.equal(priceOf('103-2803').benefit, 302e6, '103동 3라인 59A 7~28층');
  assert.equal(priceOf('104-403').terrace, true); assert.equal(priceOf('102-401').terrace, false);
  assert.deepEqual(priceOf('101-403').rent, { cur: 250700000, next: 260700000, up: 10000000 });
  assert.deepEqual(priceOf('103-1502').rent, { cur: 186200000, next: 193600000, up: 7400000 });
  assert.ok(all.every(p => p.rent), '모든 세대 전세연장 구간 있음');
  assert.equal(all.filter(p => p.wall).length, 5, '가벽 미설치 5세대');
  assert.equal(priceOf('999-101'), null);
});

test('공개 폴더 · 손님 API 코드에 분양가 없음', () => {
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  for (const f of walk('public').filter(f => /\.(js|json|html)$/.test(f) && !f.includes('/preview/'))) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/421000000|461000000|RENT_UP/.test(s), f + ' 에 분양가 · 전세연장 표가 있음');
  }
  for (const f of readdirSync('src/public-api')) assert.ok(!/core\/price|dls-units/.test(readFileSync('src/public-api/' + f, 'utf8')), f);
});

const KEY = 'price-office';
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

test('API: 직원만 · 상담카드 자동 채움', async () => {
  assert.equal((await mf.fetch('http://localhost/api/staff/prices')).status, 401);
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  assert.equal((await boss('/api/staff/prices')).json.rows.length, 300);
  assert.equal((await boss('/api/staff/prices/101-401')).json.price.benefit, 421e6);
  assert.equal((await boss('/api/staff/prices/999-1')).status, 404);
  // 임차인 카드: 빈칸이면 혜택가 · 보증금 채움, 적은 값은 그대로
  const t = (await boss('/api/staff/consults', { body: { kind: 'tenant', unit: '101-501', name: '가' } })).json.id;
  let d = (await boss('/api/staff/consults/' + t)).json;
  assert.equal(d.card.data.price, 387e6); assert.equal(d.card.data.deposit, priceOf('101-501').dep); assert.equal(d.price.need, priceOf('101-501').need);
  const t2 = (await boss('/api/staff/consults', { body: { kind: 'tenant', unit: '101-502', name: '나', data: { price: '350,000,000' } } })).json.id;
  assert.equal((await boss('/api/staff/consults/' + t2)).json.card.data.price, 350e6);
  // 신규고객: 계약할 호실을 적으면 그 호실 혜택가
  const n = (await boss('/api/staff/consults', { body: { kind: 'new', name: '다' } })).json.id;
  assert.equal((await boss('/api/staff/consults/' + n)).json.card.data.price, undefined);
  await boss('/api/staff/consults/' + n, { body: { data: { contractUnit: '104-403' } } });
  d = (await boss('/api/staff/consults/' + n)).json;
  assert.equal(d.card.data.price, 336e6); assert.equal(d.price.terrace, true);
  // 손님 API 응답에 가격 없음
  const g = await (await mf.fetch('http://localhost/api/public/units')).text();
  assert.ok(!/benefit|hedge|421000000/.test(g));
});
