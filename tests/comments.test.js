// P2-b 게스트 댓글 자동 테스트 — 설계서 7.5
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { maskComment } from '../src/core/comment-mask.js';

const KEY = 'test-office-code', T = 'u:101-1001';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());

// 쿠키를 기억하는 간이 브라우저
function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr };
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.body ? 'POST' : 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}
const lead = (a, name, phone) => a('/api/public/lead', { body: { card: { kind: 'buyer', name, phone, consent: { req: true } } } });
const post = (a, b) => a('/api/public/comments', { body: b });
const list = async a => (await a('/api/public/comments?t=' + T)).json.rows;

test('가림: 전화 · 한글 숫자 · 카톡 아이디 · 메일 · 링크', () => {
  for (const s of ['010-1234-5678', '010 1234 5678', '공일공일이삼사오육칠팔', '카톡 abc123', '오픈채팅: hello_99', 'a@b.com', 'https://x.io/aa', 'open.kakao.com/o/xyz']) {
    const m = maskComment('문의 ' + s + ' 주세요');
    assert.ok(m.masked && m.text.includes('***'), s + ' → ' + m.text);
  }
  for (const s of ['80A 타입 3층 좋네요', '101동 1001호', '2027년 1월 입주', '대표번호 1800-7240']) assert.equal(maskComment(s).masked, false, s);
});

let g1, g2, boss, staff;
test('관심등록 안 한 사람은 읽기만', async () => {
  const anon = agent('9.9.9.1');
  assert.equal((await anon('/api/public/comments?t=' + T)).status, 200);
  assert.equal((await post(anon, { op: 'add', t: T, text: '안녕하세요' })).status, 401);
  assert.equal((await anon('/api/public/comments?t=x')).status, 400);
});

test('관심등록하면 출입증 → 글쓰기, 연락처는 서버가 가려서 저장, 이름도 가림', async () => {
  g1 = agent('9.9.9.2'); g2 = agent('9.9.9.3');
  assert.equal((await lead(g1, '김하나', '010-1111-2222')).text, '{"ok":true}');
  await lead(g2, '이두리', '010-3333-4444');
  const r = await post(g1, { op: 'add', t: T, text: '전망 좋나요? 010-9999-8888 카톡 kim77 로 연락 주세요' });
  assert.equal(r.status, 200);
  assert.equal(r.json.item.masked, true);
  const raw = (await agent('9.9.9.9')('/api/public/comments?t=' + T)).text;
  for (const s of ['9999-8888', 'kim77', '김하나', '1111-2222']) assert.ok(!raw.includes(s), s + ' 노출');
  assert.ok(raw.includes('김*나'));
});

test('금지어 글은 승인 대기 — 본인만 보임', async () => {
  const r = await post(g2, { op: 'add', t: T, text: '여기 사기꾼 같아요' });
  assert.equal(r.json.item.wait, true);
  assert.ok((await list(g2)).some(c => c.id === r.json.item.id), '본인은 보임');
  assert.ok(!(await list(g1)).some(c => c.id === r.json.item.id), '남은 안 보임');
});

test('본인 글만 수정 · 삭제, 고치기 전 글은 기록으로 남음', async () => {
  const id = (await list(g1)).find(c => c.mine).id;
  assert.equal((await post(g2, { op: 'edit', id, text: '남의 글 고치기' })).status, 403);
  assert.equal((await post(g2, { op: 'del', id })).status, 403);
  assert.equal((await post(g1, { op: 'edit', id, text: '전망 좋나요? (수정)' })).status, 200);
  const c = (await list(g1)).find(x => x.id === id);
  assert.equal(c.text, '전망 좋나요? (수정)');
  assert.equal(c.edited, true);
  // 직원 준비
  boss = agent('9.9.8.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원이', role: '직원' } });
  await boss('/api/admin/staff', { body: { op: 'pin', name: '직원이', pin: '0000' } });
  staff = agent('9.9.8.2');
  await staff('/api/auth/device', { body: { code: KEY } });
  await staff('/api/auth/login', { body: { name: '직원이', pin: '0000' } });
  await staff('/api/auth/pin', { body: { pin: '5678' } });
  assert.equal((await staff('/api/staff/comments/hist?id=' + id)).status, 403, '직원은 기록 못 봄');
  const h = (await boss('/api/staff/comments/hist?id=' + id)).json.rows;
  assert.equal(h[0].act, '수정');
  assert.ok(h[0].text.startsWith('전망 좋나요? ***'), '고치기 전 글(가린 상태)');
});

test('직원 답글은 사무소 이름으로, 직원 이름은 게스트에게 안 보임', async () => {
  const pid = (await list(g1)).find(c => c.mine).id;
  assert.equal((await staff('/api/staff/comments', { body: { op: 'add', t: T, pid, text: '거실 남향이라 전망 좋습니다' } })).status, 200);
  const raw = (await agent('9.9.9.9')('/api/public/comments?t=' + T)).text;
  assert.ok(raw.includes('제니스원부동산'));
  assert.ok(!raw.includes('직원이'));
});

test('신고 3건이면 자동 숨김 → 관리자 복구 · 감사기록', async () => {
  const id = (await post(g1, { op: 'add', t: T, text: '신고될 글' })).json.item.id;
  assert.equal((await post(g1, { op: 'report', id })).status, 409, '본인 글 신고 불가');
  for (const [i, a] of [g2, g2].entries()) await post(a, { op: 'report', id }); // 같은 사람 두 번은 1건
  assert.ok((await list(g1)).some(c => c.id === id && !c.del));
  for (let i = 0; i < 2; i++) { const a = agent('9.9.7.' + i); await lead(a, '신고자' + i, '010-777' + i + '-0000'); await post(a, { op: 'report', id }); }
  assert.ok(!(await list(g1)).some(c => c.id === id), '숨김');
  assert.ok((await boss('/api/staff/comments?view=hidden')).json.rows.some(c => c.id === id && c.hideBy === 'auto'));
  assert.equal((await staff('/api/staff/comments', { body: { op: 'restore', ids: [id] } })).status, 403, '직원은 복구 못 함');
  assert.equal((await boss('/api/staff/comments', { body: { op: 'restore', ids: [id] } })).json.n, 1);
  assert.ok((await list(g1)).some(c => c.id === id));
  const acts = (await boss('/api/admin/audit')).json.rows.map(r => r.act);
  assert.ok(acts.includes('댓글 자동 숨김') && acts.includes('댓글 복구'));
});

test('관리자 승인 대기 글 승인 · 한 번에 숨김', async () => {
  const wait = (await boss('/api/staff/comments?view=wait')).json.rows;
  assert.equal(wait.length, 1);
  await boss('/api/staff/comments', { body: { op: 'approve', ids: [wait[0].id] } });
  assert.ok((await list(g1)).some(c => c.id === wait[0].id));
  const ids = (await list(g1)).filter(c => !c.office).map(c => c.id);
  assert.equal((await boss('/api/staff/comments', { body: { op: 'hide', ids } })).json.n, ids.length);
  assert.ok((await list(g1)).every(c => c.del || c.office), '게스트 글 모두 숨김 (답글 있는 글은 자리만)');
});

test('하루 10건 넘게는 못 씀', async () => {
  const a = agent('9.9.6.1');
  await lead(a, '도배자', '010-6666-0000');
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await post(a, { op: 'add', t: 'u:102-2001', text: '글 ' + i })).status);
  assert.equal(codes.filter(s => s === 200).length, 10);
  assert.equal(codes[10], 429);
});

test('게스트 새 글은 그룹방 알림(게스트 댓글)으로 남음 — 링크는 설정 › 댓글 관리', async () => {
  await post(g1, { op: 'add', t: 'u:103-1502', text: '입주 시기 궁금합니다' });
  const n = (await boss('/api/admin/notify')).json.rows.find(x => x.kind === 'cmt' && x.text.includes('103동 1502호'));
  assert.ok(n, '알림 기록 없음');
  assert.ok(n.text.includes('입주 시기 궁금합니다') && n.text.includes('?go=cmt'));
});

test('동호배치표 칸 표시: 호실별 글 수 · 답글 필요 (사무소 답글 달리면 줄어듦)', async () => {
  const cnt = async () => (await staff('/api/staff/comments?view=counts')).json.units['104-0901'] || { n: 0, need: 0 };
  const id = (await post(g1, { op: 'add', t: 'u:104-0901', text: '9층 전망 어떤가요' })).json.item.id;
  assert.deepEqual(await cnt(), { n: 1, need: 1 });
  await staff('/api/staff/comments', { body: { op: 'add', t: 'u:104-0901', pid: id, text: '확인해서 안내드리겠습니다' } });
  assert.deepEqual(await cnt(), { n: 2, need: 0 });
});

test('[확인]: 상황별 자동 답글 · 한 번만 · 관심등록 상담카드 담당 · 답글 필요 꺼짐', async () => {
  const T2 = 'u:105-1001';
  const id = (await post(g1, { op: 'add', t: T2, text: '이 라인 전세 나오면 연락 주세요' })).json.item.id;
  const r = await staff('/api/staff/comments', { body: { op: 'ack', id } });
  assert.equal(r.status, 200);
  assert.equal(r.json.kind, 'buy');
  assert.equal(r.json.mgr, true, '관심등록 상담카드 담당이 비어 있었음');
  assert.equal((await staff('/api/staff/comments', { body: { op: 'ack', id } })).status, 409, '두 번째는 안 됨');
  const rows = (await g1('/api/public/comments?t=' + T2)).json.rows;
  const rep = rows.find(c => c.pid === id);
  assert.ok(rep && rep.office && rep.name === '제니스원부동산' && rep.text.includes('조건에 맞는 매물'), '손님에게 사무소 답글로 보임');
  assert.equal(rep.auto, undefined, '자동 표시는 손님에게 안 보냄');
  const st = (await staff('/api/staff/comments?t=' + T2)).json.rows;
  assert.equal(st.find(c => c.id === id).ack, '직원이');
  assert.equal(st.find(c => c.pid === id).auto, true);
  assert.equal(((await staff('/api/staff/comments?view=counts')).json.units['105-1001'] || {}).need, 0);
});
