// 국토부 실거래가 · 건축물대장 (A안, 2026-11-13) — 진짜 국토부 대신 이 파일이 띄운 가짜 서버로 (GOV_API)
//   우리 단지 거래만 · 타입 자동 (59B·59C 묶음) · 전세/월세 나눔 · 해제 거래 숨김 · 같은 거래 두 번 받아도 한 줄
//   건축물대장 → 공개 설정 사용승인일 · 주차 빈칸만 채움 ([확인] 은 대표) · 키 없으면 501 · 직원은 못 누름
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTestHarness } from './harness.js';
import { parseItems, typeOfArea, tradeRow } from '../src/gov/index.js';

const KEY = 'gov-office', calls = [];
const NOW_YM = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7).replace('-', '');
const item = o => '<item>' + Object.entries(o).map(([k, v]) => '<' + k + '>' + v + '</' + k + '>').join('') + '</item>';
const wrap = items => '<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>' + items.join('') + '</items></body></response>';
const ME = { aptNm: '첨단대라수어울림1차', jibun: '123-4', umdNm: '테스트동' };
const govServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); calls.push(u.pathname + ' ' + (u.searchParams.get('DEAL_YMD') || '') + ' ' + u.searchParams.get('serviceKey'));
  let xml = wrap([]);
  const first = u.searchParams.get('DEAL_YMD') === NOW_YM;   // 받는 달 중 첫 달(이번 달)에만 거래가 있음
  if (u.pathname.endsWith('getRTMSDataSvcAptTradeDev') && first) xml = wrap([
    item({ ...ME, excluUseAr: '80.3831', floor: '15', dealYear: '2026', dealMonth: '11', dealDay: '3', dealAmount: '43,900', cdealType: '' }),
    item({ ...ME, excluUseAr: '59.6493', floor: '7', dealYear: '2026', dealMonth: '11', dealDay: '5', dealAmount: '33,000', cdealType: 'O' }),   // 해제
    item({ aptNm: '다른아파트', jibun: '9-9', excluUseAr: '84.9', floor: '3', dealYear: '2026', dealMonth: '11', dealDay: '1', dealAmount: '50,000' })
  ]);
  if (u.pathname.endsWith('getRTMSDataSvcAptRent') && first) xml = wrap([
    item({ ...ME, excluUseAr: '59.6493', floor: '20', dealYear: '2026', dealMonth: '11', dealDay: '7', deposit: '25,000', monthlyRent: '0' }),
    item({ ...ME, excluUseAr: '59.9614', floor: '9', dealYear: '2026', dealMonth: '11', dealDay: '8', deposit: '3,000', monthlyRent: '60' })
  ]);
  if (u.pathname.endsWith('getBrRecapTitleInfo')) xml = wrap([item({ platPlc: '광주광역시 테스트구 테스트동 123-4', newPlatPlc: '광주광역시 테스트구 테스트로 1', useAprDay: '20180630', hhldCnt: '300', totPkngCnt: '390' })]);
  if (u.pathname.endsWith('getBrTitleInfo')) xml = wrap([101, 102, 103, 104].map(n => item({ dongNm: n + '동', grndFlrCnt: '28', ugrndFlrCnt: '2', hhldCnt: '75', useAprDay: '20180630' })));
  res.setHeader('content-type', 'application/xml'); res.end(xml);
});

const GOV_CFG = JSON.stringify({ lawdCd: '29170', bjdongCd: '12345', bun: '123', ji: '4', jibun: '123-4', aptName: '대라수' });
let mf, mfNoKey;
before(async () => {
  await new Promise(r => govServer.listen(0, '127.0.0.1', r));
  const GOV_API = 'http://127.0.0.1:' + govServer.address().port;
  mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '', DATA_GO_KR_KEY: 'test-key', GOV_API, GOV_CFG } }] });
  await mf.listen();
});
after(() => { mf && mf.close(); govServer.close(); });

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

test('규칙: XML 읽기 · 면적 → 타입 (같은 면적은 묶음) · 전세/월세 나눔 · 오류 응답', () => {
  assert.deepEqual(parseItems(wrap([item({ a: '1', b: ' x ' })])), [{ a: '1', b: 'x' }]);
  assert.throws(() => parseItems('<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED</resultMsg></header></response>'), /30/);
  assert.equal(typeOfArea('80.3831'), '80A');
  assert.equal(typeOfArea('80.8837'), '80B');
  assert.equal(typeOfArea('59.6493'), '59B·59C', '실거래로는 구분 못 함');
  assert.equal(typeOfArea('84.9'), '전용 84.9㎡');
  assert.equal(tradeRow({ excluUseAr: '59.96', floor: '9', dealYear: '2026', dealMonth: '1', dealDay: '2', deposit: '3,000', monthlyRent: '60' }, 'rent').kind, 'wolse');
  assert.equal(tradeRow({ excluUseAr: '59.96', floor: '9', dealYear: '2026', dealMonth: '1', dealDay: '2', deposit: '25,000', monthlyRent: '0' }, 'rent').kind, 'jeonse');
});

let boss, staff;
test('준비: 대표 · 직원', async () => {
  boss = agent('5.5.5.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원가', role: '직원' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '직원가', pin: '0000' } });
  staff = agent('5.5.5.2');
  await staff('/api/auth/device', { body: { code: KEY } });
  await staff('/api/auth/login', { body: { name: '직원가', pin: '0000' } });
  await staff('/api/auth/pin', { body: { pin: '4321' } });
});

test('기준: 지금 받기 → 우리 단지 거래만 · 해제 숨김 · 공개 API · 다시 받아도 한 줄 · 직원은 못 누름', async () => {
  assert.equal((await staff('/api/admin/gov', { body: { op: 'sync' } })).status, 403);
  const r = await boss('/api/admin/gov', { body: { op: 'sync' } });
  assert.equal(r.status, 200, r.text);
  assert.ok(!r.json.result.tradeErr, r.json.result.tradeErr);
  assert.equal(r.json.result.trades.months, 12);
  assert.equal(r.json.result.trades.saved, 4, '다른 아파트 1건 뺌 (해제 거래는 저장하되 표시 안 함)');
  assert.ok(calls.some(c => c.includes('test-key')), '인증키를 붙여 보냄');
  const p = (await agent('8.8.8.8')('/api/public/trades')).json;
  assert.equal(p.source, '국토교통부 실거래가 공개시스템');
  assert.deepEqual(p.rows.map(x => [x.kind, x.type, x.floor, x.price || x.dep, x.rent]), [
    ['wolse', '59A', 9, 3000, 60], ['jeonse', '59B·59C', 20, 25000, 0], ['sale', '80A', 15, 43900, 0]]);
  assert.ok(!JSON.stringify(p).includes('123-4') && !JSON.stringify(p).includes('aptNm'), '지번 · 원본 칸은 안 보냄');
  await boss('/api/admin/gov', { body: { op: 'sync' } });
  assert.equal((await agent('8.8.8.8')('/api/public/trades')).json.rows.length, 3, '같은 거래는 한 줄');
});

test('건축물대장 → 공개 설정 사용승인일 · 주차 빈칸만 채움 ([확인] 전), 대표가 쓴 값은 그대로', async () => {
  const st = (await boss('/api/admin/gov')).json;
  assert.equal(st.bldg.useAprDay, '2018-06-30');
  assert.equal(st.bldg.parking, 390);
  assert.equal(st.bldg.floors, 28);
  assert.equal(st.bldg.platPlc, '광주광역시 테스트구 테스트동 123-4');
  const pull = (await boss('/api/staff/pull?since=0')).json.rows.filter(x => x.s === 'cfg' && x.k === 'listingCfg').pop();
  const cfg = JSON.parse(pull.v);
  assert.equal(cfg.approval, '2018-06-30 사용승인 (건축물대장)');
  assert.equal(cfg.parking['1차'], '총 390대 (세대당 약 1.3대) · 건축물대장');
  assert.ok(!(cfg.ok || {}).approval, '확인은 대표가');
  // 대표가 고친 값은 다시 받아도 안 덮음
  await boss('/api/staff/push', { body: { rows: [{ s: 'cfg', k: 'listingCfg', v: JSON.stringify(Object.assign(cfg, { approval: '2018-07 사용승인' })), at: Date.now() }] } });
  await boss('/api/admin/gov', { body: { op: 'sync' } });
  const again = JSON.parse((await boss('/api/staff/pull?since=0')).json.rows.filter(x => x.s === 'cfg' && x.k === 'listingCfg').pop().v);
  assert.equal(again.approval, '2018-07 사용승인');
});

test('인증키가 없으면 공개 API 는 빈 목록 (on: false) — 화면 칸도 안 보임', async () => {
  mfNoKey = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] });
  await mfNoKey.listen();
  try {
    const r = await mfNoKey.fetch('http://localhost/api/public/trades');
    const j = await r.json();
    assert.equal(j.on, false); assert.deepEqual(j.rows, []);
  } finally { mfNoKey.close(); }
});
