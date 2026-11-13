// R3-1 KPI 보드 (시안 r3-kpi 확정 2026-11-13) — 상태 집계 · 미상담 세대 · 담당자별 · 예약방문 · 이름 가림
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { buildKpi } from '../src/core/kpi.js';

const NOW = Date.parse('2026-11-13T03:00:00Z');   // 한국 2026-11-13 12:00
const day = s => Date.parse(s + 'T03:00:00Z');

test('계산: 상태 · 미상담 · 담당자별 · 예약방문', () => {
  const k = buildKpi({
    conv: [{ unit_id: '101-401', status: '계약완료', at: day('2026-11-13') }, { unit_id: '101-402', status: '상담중', at: day('2026-10-01') }, { unit_id: '101-403', status: '공실', at: 0 }, { unit_id: '101-501', status: '상담중', at: 0 }],
    cards: [
      { id: 'A', kind: 'tenant', unit_id: '101-402', mgr: '홍길동', progress: '상담중', book: '2026-11-13T14:00' },
      { id: 'B', kind: 'tenant', unit_id: '101-501', mgr: '김철수', progress: '상담중', book: null },
      { id: 'N', kind: 'new', unit_id: null, mgr: '홍길동', progress: '계약완료', name: '박신규', book: '2026-11-14T11:00', contractUnit: '101-401' }
    ],
    logs: [
      { consult_id: 'A', kind: 'tenant', unit_id: '101-402', mgr: '홍길동', date: '2026-11-13', channel: '방문상담', at: NOW },
      { consult_id: 'B', kind: 'tenant', unit_id: '101-501', mgr: '김철수', date: '2026-09-01', channel: '유선상담', at: 0 },
      { consult_id: 'N', kind: 'new', unit_id: null, mgr: '홍길동', date: null, channel: '유선상담', at: NOW }
    ],
    pub: [{ kind: 'vac' }]
  }, NOW, 30);
  assert.equal(k.today, '2026-11-13');
  assert.equal(k.units.length, 300);
  const u = id => k.units.find(x => x.id === id);
  assert.equal(u('101-401').st, '계약완료'); assert.equal(u('101-401').todayChg, true);
  assert.equal(u('101-402').mgr, '홍길동'); assert.equal(u('101-402').ago, 0);
  assert.equal(u('101-502').st, '미정');
  const un = k.unvisited.map(x => x.id);
  assert.ok(!un.includes('101-401') && !un.includes('101-403'), '계약완료 · 공실은 미상담 아님');
  assert.ok(!un.includes('101-402'), '오늘 상담');
  assert.ok(un.includes('101-501') && un.includes('101-502'), '73일 전 · 기록 없음');
  assert.equal(k.unvisited[0].ago, null, '기록 없음이 맨 위');
  assert.deepEqual([k.act.visitToday, k.act.visitAll, k.act.otherToday, k.act.otherAll], [1, 1, 1, 2]);
  const h = k.byMgr.find(x => x.mgr === '홍길동');
  assert.deepEqual([h.cards, h.today, h.done, h.month], [2, 2, 1, 2]);
  assert.equal(k.books.length, 2); assert.equal(k.books[0].day, '오늘'); assert.equal(k.books[1].day, '내일');
  assert.equal(k.newCards.prog['계약완료'], 1); assert.equal(k.pub.vac, 1);
});

const KEY = 'kpi-office';
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

test('API: 로그인 필요 · 신규고객 예약 이름은 권한 없으면 가림 · 개인정보 없음', async () => {
  assert.equal((await mf.fetch('http://localhost/api/staff/kpi')).status, 401);
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '열람이', role: '열람' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '열람이', pin: '0000' } });
  const v = agent('3.3.3.3');
  await v('/api/auth/device', { body: { code: KEY } }); await v('/api/auth/login', { body: { name: '열람이', pin: '0000' } }); await v('/api/auth/pin', { body: { pin: '4321' } });
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  await boss('/api/staff/consults', { body: { kind: 'new', name: '박신규', phone: '010-9876-5432', mgr: '대표', data: { book: kst + 'T15:00' } } });
  await boss('/api/staff/consults', { body: { kind: 'tenant', unit: '101-401', name: '김임차', phone: '010-1111-2222', mgr: '대표', log: { date: kst, channel: '방문상담', memo: '상담' } } });
  const a = (await boss('/api/staff/kpi')).json, b = (await v('/api/staff/kpi?days=14')).json;
  assert.equal(a.ok, true); assert.equal(b.days, 14);
  assert.equal(a.books[0].name, '박신규'); assert.equal(b.books[0].name, '박*규');
  assert.equal(a.act.visitToday, 1); assert.equal(a.units.find(u => u.id === '101-401').mgr, '대표');
  assert.ok(!/010-|김임차/.test(JSON.stringify(b)), '전화번호 · 임차인 이름 없음');
});
