// R3-4 직원 소통 3종 (시안 r3-board 확정 2026-11-13)
//   글쓰기 · 중요 고정 · 남의 글 못 고침 · 요청함은 본인 것만 · 처리완료 → 알림 · 처리된 요청 못 고침 · 불편사항 답변은 관리자
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { cleanPost, sortPosts } from '../src/core/board.js';

test('규칙: 칸 검사 · 정렬', () => {
  assert.equal(cleanPost('note', { body: '' }, true).err, 'body');
  assert.equal(cleanPost('note', { body: 'a', dept: '없는부서' }, true).err, 'dept');
  assert.equal(cleanPost('req', { body: 'a', rkind: '이상' }, true).rkind, '일반 요청');
  assert.equal(cleanPost('xx', { body: 'a' }, true).err, 'kind');
  assert.deepEqual(sortPosts('note', [{ pin: 0, at: 3 }, { pin: 1, at: 1 }, { pin: 0, at: 5 }]).map(r => r.at), [1, 5, 3]);
  assert.deepEqual(sortPosts('req', [{ status: '처리완료', at: 9 }, { status: '대기', at: 1 }]).map(r => r.at), [1, 9]);
});

const KEY = 'board-office';
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

test('API: 상담참고 · 요청함 · 불편사항', async () => {
  const boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  const mk = async (n, a) => { await boss('/api/admin/staff', { body: { op: 'add', name: n, role: '직원' } }); await boss('/api/admin/staff', { body: { op: 'pin', name: n, pin: '0000' } }); const x = agent(a); await x('/api/auth/device', { body: { code: KEY } }); await x('/api/auth/login', { body: { name: n, pin: '0000' } }); await x('/api/auth/pin', { body: { pin: '4321' } }); return x; };
  const a = await mk('직원A', '4.4.4.4'), b = await mk('직원B', '5.5.5.5');
  const G = async x => (await x('/api/staff/board')).json;

  // 상담참고: 누구나 · 중요 맨 위 · 남의 글은 못 고침(관리자는 됨)
  const n1 = (await a('/api/staff/board', { body: { kind: 'note', body: '저녁 방문 응답 좋음', dept: '2팀' } })).json.id;
  await b('/api/staff/board', { body: { kind: 'note', body: '혜택가 종료 안내', pin: true } });
  let v = await G(a);
  assert.equal(v.note[0].body, '혜택가 종료 안내', '중요 먼저'); assert.equal(v.note[1].author, '직원A');
  assert.equal((await b('/api/staff/board/' + n1, { body: { body: '바꿈' } })).status, 403);
  assert.equal((await boss('/api/staff/board/' + n1, { body: { body: '관리자가 고침' } })).status, 200);
  assert.ok((await G(a)).note.find(r => r.id === n1).edited_at);

  // 요청함: 본인 것만 · 관리자 전체 · 처리완료 → 처리된 요청은 못 고침
  const r1 = (await a('/api/staff/board', { body: { kind: 'req', rkind: '담당자 변경', ref: '102-1502', body: '담당을 김철수로' } })).json.id;
  await b('/api/staff/board', { body: { kind: 'req', body: '토너 교체' } });
  assert.equal((await G(a)).req.length, 1); assert.equal((await G(b)).req.length, 1);
  v = await G(boss); assert.equal(v.req.length, 2); assert.equal(v.reqWait, 2); assert.equal(v.admin, true);
  assert.equal((await b('/api/staff/board/' + r1, { body: { body: 'x' } })).status, 404, '남의 요청은 안 보임');
  assert.equal((await a('/api/staff/board/' + r1 + '/answer', { body: { status: '처리완료' } })).status, 403);
  assert.equal((await boss('/api/staff/board/' + r1 + '/answer', { body: { status: '처리완료', answer: '변경했습니다' } })).status, 200);
  const mine = (await G(a)).req[0];
  assert.equal(mine.status, '처리완료'); assert.equal(mine.answer, '변경했습니다'); assert.equal(mine.ans_by, '대표');
  assert.equal((await a('/api/staff/board/' + r1, { body: { body: '다시' } })).status, 409);

  // 불편사항: 모두 봄 · 상태 · 답변은 관리자
  const f1 = (await a('/api/staff/board', { body: { kind: 'fb', rkind: 'KPI', body: '담당자별 거르기' } })).json.id;
  assert.equal((await G(b)).fb.length, 1);
  assert.equal((await boss('/api/staff/board/' + f1 + '/answer', { body: { status: '없는상태' } })).status, 400);
  assert.equal((await boss('/api/staff/board/' + f1 + '/answer', { body: { status: '반영완료', answer: '고쳤습니다' } })).status, 200);
  assert.equal((await G(b)).fb[0].status, '반영완료');

  // 지우기 · 알림 기록 · 감사기록
  assert.equal((await a('/api/staff/board/' + n1 + '/del', { body: {} })).status, 200);
  assert.ok(!(await G(b)).note.some(r => r.id === n1));
  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(acts.includes('요청 처리') && acts.includes('불편사항 답변') && acts.includes('상담참고 · 지시 지움'));
});
