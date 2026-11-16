// 공실 · 신규분양 공개 (시안 r46 확정 2026-11-17) — 계약조건 빈칸 세대 공개 · 거래 구분 · 손님 화면에서 자동으로 빠지기
// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pubRowKind, groupPub, cleanDeal, DEAL_KO } from '../src/core/conv.js';
import { pubEligible, listVacancy, setPub, setConv } from '../src/repo/conv.js';
import { listPubGuest } from '../src/repo/public-units.js';

function sqliteD1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, a = []) => ({
    bind: (...x) => st(sql, x),
    async all() { const p = s.prepare(sql); return /^\s*(SELECT|PRAGMA)/i.test(sql) ? { results: p.all(...a) } : { results: [], meta: { changes: Number(p.run(...a).changes) } }; },
    async run() { return this.all(); },
    async first() { return (await this.all()).results[0] || null; }
  });
  s.exec(`CREATE TABLE units (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE tenancies (id INTEGER PRIMARY KEY, unit_id TEXT, end_date TEXT, is_current INTEGER, deleted_at TEXT);
    CREATE TABLE unit_conv (unit_id TEXT PRIMARY KEY, status TEXT, move_out TEXT, memo TEXT, at INTEGER, by TEXT, done_at INTEGER, done_from TEXT);
    CREATE TABLE public_units (unit_id TEXT PRIMARY KEY, dong INTEGER, band TEXT, type TEXT, kind TEXT, exclusive REAL, at INTEGER, by TEXT, deal TEXT);`);
  return { s, prepare: sql => st(sql) };
}

test('거래 구분 · 구분 직접 지정 · 손님 묶기', () => {
  assert.equal(cleanDeal('전세'), '전세'); assert.equal(cleanDeal('이상한'), '매매'); assert.equal(DEAL_KO['둘 다'], '신규분양 · 전세');
  assert.equal(pubRowKind('103-2002', 'vac').kind, 'vac'); assert.equal(pubRowKind('103-2002', 'x'), null); assert.equal(pubRowKind('999-1', 'vac'), null);
  const g = groupPub([Object.assign(pubRowKind('103-2002', 'vac'), { deal: '전세' }), Object.assign(pubRowKind('103-2102', 'vac'), { deal: '매매' })]);
  assert.equal(g.length, 2, '거래 구분이 다르면 다른 줄');
});

test('계약조건 빈칸 + 임대차 있는 세대만 공개 · 만기 지남 = 즉시 입주 · 거래 구분 저장', async () => {
  const db = sqliteD1(), q = (sql, ...a) => db.s.prepare(sql).run(...a);
  q("INSERT INTO tenancies (unit_id, end_date, is_current) VALUES ('103-2002', '2026-09-29', 1), ('104-701', '2099-01-31', 1), ('101-401', '2026-01-01', 1), ('102-1701', '2026-01-01', 1)");
  q("INSERT INTO units (id, data) VALUES ('101-401', ?), ('102-1701', ?)", JSON.stringify({ cond: '10.16 혜택가', owner: '김' }), JSON.stringify({ cond: '전세연장', owner: '대라수(회사)' }));
  assert.equal((await pubEligible(db, '103-2002')).kind, 'vac', '만기 지남 = 즉시 입주');
  assert.equal((await pubEligible(db, '104-701')).kind, 'out', '만기 전 = 입주일 협의');
  assert.equal(await pubEligible(db, '101-401'), null, '분양전환 계약은 공개 불가');
  assert.equal(await pubEligible(db, '102-1701'), null, '전세연장은 공개 불가');
  assert.equal(await pubEligible(db, '101-501'), null, '임대차 없는 세대는 공개 불가');
  assert.equal(await setPub(db, '101-401', true, '대표'), 'status');
  assert.equal(await setPub(db, '103-2002', true, '대표', Date.now(), '전세'), 'ok');
  assert.equal(await setPub(db, '104-701', true, '대표', Date.now(), '둘 다'), 'ok');
  const v = await listVacancy(db);
  assert.deepEqual(v.map(r => r.id).sort(), ['103-2002', '104-701'], '목록 = 신규분양 대상만');
  assert.equal(v.find(r => r.id === '103-2002').deal, '전세');
  assert.equal(v.find(r => r.id === '103-2002').vacant, true);
  const g = await listPubGuest(db);
  assert.equal(g.length, 2); assert.ok(g.every(r => !('unit_id' in r)), '손님에게 호수 없음');
  assert.deepEqual(g.map(r => r.deal).sort(), ['둘 다', '전세']);
});

test('계약조건이 생기거나 계약 끝나면 손님 화면에서 빠짐 · 다른 상태로 바꿔도 대상이면 공개 유지', async () => {
  const db = sqliteD1(), q = (sql, ...a) => db.s.prepare(sql).run(...a);
  q("INSERT INTO tenancies (unit_id, end_date, is_current) VALUES ('103-2002', '2026-09-29', 1), ('104-701', '2026-09-29', 1)");
  await setPub(db, '103-2002', true, '대표', Date.now(), '매매'); await setPub(db, '104-701', true, '대표', Date.now(), '매매');
  assert.equal((await listPubGuest(db)).length, 2);
  assert.equal(await setConv(db, '104-701', { status: '상담중', move_out: null, memo: null }, '직원'), false, '상담중이어도 신규분양 대상이면 공개 유지');
  q("INSERT INTO units (id, data) VALUES ('103-2002', ?)", JSON.stringify({ cond: '10.16 혜택가' }));
  assert.equal((await listPubGuest(db)).length, 1, '계약조건이 생기면 바로 손님 화면에서 빠짐');
  assert.equal(await setConv(db, '104-701', { status: '계약완료', move_out: null, memo: null }, '직원'), true, '계약완료 = 공개 내림');
  assert.equal((await listPubGuest(db)).length, 0);
});
