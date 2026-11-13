// R3-2 일일업무보고 (시안 r3-daily 확정 2026-11-13)
//   이전/이후/금일계약 (완료일 · 기준일) · 영업통계 · 세대관람 · 직전 보고서 이어받기 · 관리자급만 · 완료일 기록
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { buildReport, cleanReport, CUTOFF } from '../src/core/report.js';

const at = d => Date.parse(d + 'T03:00:00Z');   // 한국 그날 12:00

test('계산: 분양현황 · 영업통계 · 세대관람 · 이어받기', () => {
  const rows = {
    conv: [
      { unit_id: '101-401', status: '계약완료', done_at: null },            // 날짜 없음 → 이전
      { unit_id: '101-402', status: '계약완료', done_at: at('2026-10-01') }, // 이전
      { unit_id: '101-403', status: '신규입주', done_at: at('2026-11-01') }, // 101-403 = 80A → 이후
      { unit_id: '102-401', status: '계약완료', done_at: at('2026-11-13') }, // 102-401 = 80A → 금일
      { unit_id: '102-402', status: '계약완료', done_at: at('2026-11-20') }, // 보고일 뒤 → 안 셈
      { unit_id: '101-501', status: '전세연장' }, { unit_id: '101-502', status: '퇴거확정(매물동의)' }, { unit_id: '101-503', status: '공실' }
    ],
    logs: [
      { consult_id: 'N1', kind: 'new', date: '2026-11-13', channel: '방문상담', memo: '전망 좋아함' },
      { consult_id: 'T1', kind: 'tenant', date: '2026-11-12', channel: '방문상담' },
      { consult_id: 'T1', kind: 'tenant', date: '2026-11-13', channel: '유선상담' },
      { consult_id: 'T1', kind: 'tenant', date: '2026-11-14', channel: '유선상담' }
    ],
    cards: [
      { id: 'N1', kind: 'new', name: '박신규', ctype: '실거주', progress: '상담중', book: '2026-11-13T15:00', intUnits: ['102-1902', '102-2002'] },
      { id: 'N2', kind: 'new', name: '정고객', progress: '상담중', book: '2026-11-10T11:00', intUnits: ['104-1501'] },
      { id: 'T1', kind: 'tenant', book: null, intUnits: [] }
    ]
  };
  const r = buildReport(rows, '2026-11-13', null);
  assert.equal(r.cutoff, CUTOFF);
  const t = Object.fromEntries(r.types.map(x => [x.type, x]));
  assert.deepEqual(Object.keys(t), ['80A', '80B', '59A', '59B', '59C']);
  assert.equal(r.types.reduce((s, x) => s + x.units, 0), 300);
  // 101동 1·2라인 80B, 3라인 80A / 102동 1라인 80A
  assert.deepEqual([t['80B'].pre, t['80B'].post, t['80B'].today, t['80B'].jeon, t['80B'].mi], [2, 0, 0, 1, 1]);
  assert.deepEqual([t['80A'].post, t['80A'].today, t['80A'].vac], [1, 1, 1]);
  assert.deepEqual(r.stats, { visit: { today: 1, total: 2 }, other: { today: 1, total: 1 }, book: { today: 1, total: 2 } });
  assert.equal(r.view.today, 2); assert.equal(r.view.total, 3);
  assert.equal(r.view.rows[0].memo, '박*규(실거주) · 전망 좋아함', '이름 가림');
  assert.deepEqual(r.work, { today: '', tomorrow: '' });
  // 이어받기 + 기준일 바꾸기
  const r2 = buildReport(rows, '2026-11-13', { date: '2026-11-12', cutoff: '2026-10-01', staff: [['대표', '1']], work: { tomorrow: '재방문' } });
  assert.equal(r2.cutoff, '2026-10-01'); assert.equal(r2.prevDate, '2026-11-12');
  assert.deepEqual(r2.staff, [['대표', '1']]); assert.equal(r2.work.today, '재방문');
  assert.equal(r2.types.find(x => x.type === '80B').post, 1, '10-01 은 기준일 당일 → 이후');
  assert.equal(buildReport(rows, '2026-11-13', null, '2026-12-01').types.find(x => x.type === '80A').post, 0, '화면에서 바꾼 기준일');
  assert.equal(cleanReport({ types: 'x' }, '2026-11-13'), null);
  assert.equal(cleanReport({ types: [{ type: '80A', pre: '1,2' }], staff: [['가', 'x3']] }, '2026-11-13').types[0].pre, 12);
});

const KEY = 'report-office';
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

test('API: 관리자급만 · 완료일 기록 · 저장 · 다음 날 이어받기', async () => {
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원A', role: '직원' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '직원A', pin: '0000' } });
  const st = agent('4.4.4.4');
  await st('/api/auth/device', { body: { code: KEY } }); await st('/api/auth/login', { body: { name: '직원A', pin: '0000' } }); await st('/api/auth/pin', { body: { pin: '4321' } });
  assert.equal((await st('/api/staff/report')).status, 403, '직원은 못 봄');

  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  // 완료일: 계약완료 → 금일, 계약완료 ↔ 신규입주 오가도 그대로, 벗어나면 지움
  await boss('/api/staff/conv/101-401', { body: { status: '계약완료' } });
  await boss('/api/staff/conv/101-401', { body: { status: '신규입주' } });
  let r = (await boss('/api/staff/report')).json;
  assert.equal(r.fresh.types.find(x => x.type === '80B').today, 1);
  await boss('/api/staff/conv/101-401', { body: { status: '상담중' } });
  r = (await boss('/api/staff/report')).json;
  assert.equal(r.fresh.types.find(x => x.type === '80B').today, 0);
  assert.equal(r.saved, null);

  const future = '2099-01-01';
  assert.equal((await boss('/api/staff/report?date=' + future)).status, 400);
  assert.equal((await boss('/api/staff/report', { body: { date: today, data: { types: 'x' } } })).status, 400);
  const yest = new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 10);
  const y = (await boss('/api/staff/report?date=' + yest)).json.fresh;
  y.staff = [['대표', '1'], ['상담', '3']]; y.work.tomorrow = '104동 재방문'; y.types[0].pre = 99;
  assert.equal((await boss('/api/staff/report', { body: { date: yest, data: y } })).status, 200);
  r = (await boss('/api/staff/report')).json;
  assert.equal(r.fresh.prevDate, yest); assert.equal(r.fresh.work.today, '104동 재방문');
  assert.deepEqual(r.fresh.staff, [['대표', '1'], ['상담', '3']]);
  assert.equal(r.dates[0].date, yest);
  const saved = (await boss('/api/staff/report?date=' + yest)).json.saved;
  assert.equal(saved.data.types[0].pre, 99, '고친 숫자 그대로 저장'); assert.equal(saved.saved_by, '대표');
  assert.ok((await boss('/api/admin/audit')).json.rows.some(x => x.act === '일일업무보고 저장'));
});
