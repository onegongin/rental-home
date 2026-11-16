// 관심단지 고르기 (시안 r37 확정 2026-11-16) — 목록 정리 · 손님 등록에 담기 · 텔레그램 줄 · 손님용 목록 주소
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { complexList, DEFAULT_COMPLEX } from '../src/core/complexes.js';
import { cleanLead, leadNote } from '../src/public-api/index.js';

test('목록이 없으면 단지 이름 하나 · 기본도 그것', () => {
  assert.equal(DEFAULT_COMPLEX, '첨단대라수1차');
  assert.deepEqual(complexList(null, null), { list: ['첨단대라수1차'], def: '첨단대라수1차' });
  assert.deepEqual(complexList([' ', ''], 'x'), { list: ['첨단대라수1차'], def: '첨단대라수1차' });
});

test('목록 정리: 빈칸 · 겹침 빼고, 기본은 목록 안에 있을 때만 (없으면 맨 위)', () => {
  assert.deepEqual(complexList(['첨단대라수1차', ' 첨단대라수2차 ', '첨단대라수1차', ''], '첨단대라수2차'), { list: ['첨단대라수1차', '첨단대라수2차'], def: '첨단대라수2차' });
  assert.equal(complexList(['A', 'B'], '없는단지').def, 'A');
  assert.equal(complexList(['가'.repeat(80)], null).list[0].length, 40);
});

const base = { id: 'g1763290000000', kind: 'client', at: '2026-11-16 21:00', name: '시험손님', phone: '010-1234-5678', consent: { req: true } };

test('손님 등록: 관심단지를 40자까지 담고, 없으면 빈칸', () => {
  assert.equal(cleanLead(Object.assign({ complex: '첨단대라수1차', interest: '104동 고층' }, base)).complex, '첨단대라수1차');
  assert.equal(cleanLead(Object.assign({ complex: 'x'.repeat(99) }, base)).complex.length, 40);
  assert.equal(cleanLead(base).complex, undefined);
});

test('텔레그램: 관심 줄 앞에 [관심단지]', () => {
  const t = leadNote(cleanLead(Object.assign({ complex: '첨단대라수1차', interest: '104동 고층, 80B 고층' }, base))).text;
  assert.match(t, /관심: \[첨단대라수1차\] 104동 고층, 80B 고층/);
  assert.match(leadNote(cleanLead(Object.assign({ complex: '첨단대라수1차' }, base))).text, /관심: \[첨단대라수1차\]/);
  assert.doesNotMatch(leadNote(cleanLead(base)).text, /관심:/);
});

let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: 'test-office-code', TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());

test('손님용 목록 주소: 로그인 없이 기본 목록', async () => {
  const r = await mf.fetch('http://localhost/api/public/complexes');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, list: ['첨단대라수1차'], def: '첨단대라수1차' });
});

test('관심단지 목록은 직원(일반)이 서버에 못 씀 — 대표 · 관리자 · 권한자만', async () => {
  const { can } = await import('../src/core/permissions.js');
  assert.equal(can({ role: '직원', name: 'a' }, 'cfg.write', 'complexes', {}), false);
  assert.equal(can({ role: '열람', name: 'a' }, 'cfg.write', 'complexDef', {}), false);
  assert.equal(can({ role: '관리자', name: 'a' }, 'cfg.write', 'complexes', {}), true);
  assert.equal(can({ role: '대표', name: 'a' }, 'cfg.write', 'complexDef', {}), true);
});
