// 공지사항 (시안 r77 확정 2026-11-25)
//   업무 · 교육 · 일정 = 대표 · 관리자만 씀 · 확인 · 알림 창 = 업무 · 일정 · 요청 · 확인한 직원 = 대표 · 관리자만 봄 · 요청 = 바로 답변 · 답변 완료
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestHarness } from './harness.js';
import { canWrite, ackOn, cleanNotice, todo, popOf, sortNotices } from '../src/core/notice.js';

test('규칙: 쓰는 사람 · 확인 분류 · 칸 검사 · 볼 것', () => {
  assert.ok(canWrite('관리자', '업무') && canWrite('대표', '교육') && canWrite('대표', '일정'));
  assert.ok(!canWrite('직원', '업무') && !canWrite('권한자', '교육') && !canWrite('직원', '일정'));
  assert.ok(canWrite('직원', '요청') && canWrite('권한자', '기타') && !canWrite('열람', '요청'));
  assert.deepEqual(['업무', '요청', '교육', '일정', '기타'].map(ackOn), [true, true, false, true, false]);
  assert.equal(cleanNotice({ cat: '업무', title: 'a', body: 'b' }, '직원', true).err, 'perm');
  assert.equal(cleanNotice({ cat: '요청', title: '', body: 'b' }, '직원', true).err, 'title');
  assert.equal(cleanNotice({ cat: '없음', title: 'a', body: 'b' }, '대표', true).err, 'cat');
  const st = cleanNotice({ cat: '요청', title: 'a', body: 'b', pin: true, popup: true }, '직원', true);
  assert.ok(!('pin' in st) && !('popup' in st), '필독 · 알림 창은 대표 · 관리자만');
  assert.equal(cleanNotice({ cat: '업무', title: 'a', body: 'b', pin: true }, '관리자', true).pin, 1);
  assert.equal(todo({ cat: '업무', author: '대표' }, '직원A', null), true);
  assert.equal(todo({ cat: '교육', author: '대표' }, '직원A', null), false);
  assert.equal(todo({ cat: '업무', author: '대표' }, '직원A', { ack_at: 1 }), false);
  assert.equal(todo({ cat: '요청', author: '직원A' }, '직원A', { seen_at: 5 }, [{ who: '대표', at: 9 }]), true, '내 요청에 새 답변');
  assert.equal(todo({ cat: '요청', author: '직원A' }, '직원A', { seen_at: 10 }, [{ who: '대표', at: 9 }]), false);
  assert.equal(popOf({ cat: '교육', popup: 1, author: '대표' }, '직원A', null), false);
  assert.equal(popOf({ cat: '일정', popup: 1, author: '대표' }, '직원A', null), true);
  assert.deepEqual(sortNotices([{ pin: 0, at: 3 }, { pin: 1, at: 1 }, { pin: 0, at: 5 }]).map(r => r.at), [1, 5, 3]);
});

const KEY = 'notice-office';
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

test('API: 공지 · 확인 · 요청 답변 · 권한', async () => {
  const boss = agent('2.2.3.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  const mk = async (n, a) => { await boss('/api/admin/staff', { body: { op: 'add', name: n, role: '직원' } }); await boss('/api/admin/staff', { body: { op: 'pin', name: n, pin: '0000' } }); const x = agent(a); await x('/api/auth/device', { body: { code: KEY } }); await x('/api/auth/login', { body: { name: n, pin: '0000' } }); await x('/api/auth/pin', { body: { pin: '4321' } }); return x; };
  const a = await mk('직원A', '4.4.3.4'), b = await mk('직원B', '5.5.3.5');
  const G = async x => (await x('/api/staff/notice')).json, C = async x => (await x('/api/staff/notice/count')).json;

  // 업무 · 교육 · 일정 = 대표 · 관리자만
  assert.equal((await a('/api/staff/notice', { body: { cat: '업무', title: 't', body: 'b' } })).status, 403);
  const w1 = (await boss('/api/staff/notice', { body: { cat: '업무', title: '12월 계약 절차', body: '관리자 확인 후 계약중', pin: true, popup: true } })).json.id;
  const e1 = (await boss('/api/staff/notice', { body: { cat: '교육', title: '설명 요령', body: '...', popup: true } })).json.id;
  let v = await G(a);
  assert.deepEqual(v.writeCats, ['요청', '기타']);
  assert.equal(v.list[0].id, w1, '필독 먼저');
  assert.ok(!('ackOf' in v.list[0]) && !('ackN' in v.list[0]), '확인한 직원은 직원에게 안 보냄');
  assert.equal(v.n, 1, '교육은 숫자에 안 셈');
  let c = await C(a); assert.equal(c.n, 1); assert.deepEqual(c.pop.map(x => x.id), [w1], '교육은 알림 창 없음');
  assert.equal((await a('/api/staff/notice/' + e1 + '/ack', { body: {} })).status, 400, '교육은 확인 단추 없음');

  // 확인 → 대표만 확인한 직원 · 수를 봄
  assert.equal((await a('/api/staff/notice/' + w1 + '/ack', { body: {} })).status, 200);
  assert.equal((await C(a)).n, 0); assert.equal((await C(a)).pop.length, 0);
  v = await G(boss); const w = v.list.find(x => x.id === w1);
  assert.equal(w.ackN, 2); assert.deepEqual(w.ackOf.map(x => x.who).sort(), ['대표', '직원A']); assert.equal(w.total, 3);
  assert.equal(v.list.find(x => x.id === e1).ackN, undefined);

  // 요청: 직원이 씀 → 대표 숫자 · 답변 (누구나) · 대표 답변 완료 → 요청한 직원 숫자
  const r1 = (await a('/api/staff/notice', { body: { cat: '요청', title: '담당 바꿔 주세요', body: '102-803', pin: true } })).json.id;
  v = await G(boss); const r = v.list.find(x => x.id === r1);
  assert.equal(r.status, '답변 대기'); assert.equal(r.pin, 0, '직원은 필독 못 씀'); assert.equal((await C(boss)).n, 1);
  assert.equal((await b('/api/staff/notice/' + r1 + '/reply', { body: { body: '저는 괜찮아요', done: true } })).status, 200);
  assert.equal((await G(a)).list.find(x => x.id === r1).status, '답변 대기', '직원 답변은 완료로 못 바꿈');
  assert.equal((await C(a)).n, 1, '내 요청에 새 답변');
  assert.equal((await boss('/api/staff/notice/' + r1 + '/reply', { body: { body: '바꿨습니다', done: true } })).status, 200);
  v = await G(a); const rr = v.list.find(x => x.id === r1);
  assert.equal(rr.status, '답변 완료'); assert.deepEqual(rr.replies.map(x => [x.who, x.boss]), [['직원B', false], ['대표', true]]);
  assert.equal((await C(boss)).n, 0, '답변하면 확인한 것');
  await a('/api/staff/notice/' + r1 + '/seen', { body: {} });
  assert.equal((await C(a)).n, 0);
  assert.equal((await a('/api/staff/notice/' + r1, { body: { body: '고침' } })).status, 409, '답변 완료된 요청은 직원이 못 고침');
  assert.equal((await a('/api/staff/notice/' + w1 + '/reply', { body: { body: 'x' } })).status, 400, '답변은 요청 글에만');

  // 고치기 · 지우기 = 쓴 사람 · 대표 · 관리자
  assert.equal((await b('/api/staff/notice/' + w1, { body: { title: 'x' } })).status, 403);
  const rid = (await G(a)).list.find(x => x.id === r1).replies[0].id;
  assert.equal((await a('/api/staff/notice/reply/' + rid + '/del', { body: {} })).status, 403);
  assert.equal((await b('/api/staff/notice/reply/' + rid + '/del', { body: {} })).status, 200);
  assert.equal((await boss('/api/staff/notice/' + e1 + '/del', { body: {} })).status, 200);
  assert.ok(!(await G(a)).list.some(x => x.id === e1));
  assert.equal((await a('/api/staff/notice/upload?img=0&name=x.exe', { body: {} })).status, 400);
  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(acts.includes('공지 올림') && acts.includes('공지 지움') && acts.includes('공지 답변 지움'));

  // 로그인 안 하면 못 봄
  assert.equal((await agent('9.9.3.9')('/api/staff/notice')).status, 401);
});

test('화면: 대시보드 탭 = 설정 바로 앞 · iframe · 알림 창', () => {
  const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
  assert.match(src, /TABS\.push\(\['notice', '📢 공지사항'[^\n]*TABS\.push\(\['settings', '설정'\]\)/);
  assert.match(src, /<iframe data-ntcf="1" src="\{\{ ntcSrc \}\}"/);
  assert.match(src, /ntcPopVals\(tab\)/);
  const pg = readFileSync(new URL('../public/daelasoo/staff/notice.html', import.meta.url), 'utf8');
  assert.match(pg, /\/api\/staff\/notice/);
});
