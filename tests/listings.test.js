// P4 매물보드 자동 테스트 — 설계서 10장 · 6.2 · 6.3
//   완료 기준 (1.4): ④ 필수 항목이 하나라도 비면 공개가 켜지지 않는다 · ⑤ 거래가 끝나면 공개사이트에서 즉시 사라진다
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { band, label, missing, pubAfter, contactOf, cfgOf, faceOf, CFG0 } from '../src/core/listings.js';
import { UNIT } from '../src/core/units.js';

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
    const r = await mf.fetch('http://localhost' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}
const UID = '103-1504';
const pushRow = (a, s, k, v, at = Date.now()) => a('/api/staff/push', { body: { rows: [{ s, k, v: JSON.stringify(v), at }] } });
const board = async a => (await a('/api/staff/listings')).json.rows;
const mineL = async a => (await board(a)).find(x => x.unit_id === UID && x.deal === 'jeonse');
const pub = async (q = '') => (await agent('8.8.8.8')('/api/public/listings' + q));
const act = (a, l, op, b) => a('/api/staff/listings/' + l.id + (op ? '/' + op : ''), { method: op ? 'POST' : 'PATCH', body: Object.assign({ ver: l.ver }, b) });

test('규칙: 층구간 · 표시 주소 · 필수 항목 · 상태별 공개 · 연락 표시', () => {
  assert.deepEqual([2, 12, 13, 24, 25, 34].map(f => band(f, 34)), ['저층', '저층', '중층', '중층', '고층', '고층']);
  assert.equal(label(UNIT[UID]), '103동 중층/38층');
  const OK = { approval: true, parking: true, rooms: true }, cfg = cfgOf({ ok: OK });
  const l = { unit_id: UID, deal: 'jeonse', dep: 52000, move: '협의', mgmt: 22, facing: '남', basis: '거실' };
  assert.deepEqual(missing(l, cfg), []);
  assert.deepEqual(missing(Object.assign({}, l, { mgmt: null, facing: '' }), cfg).map(m => m.label), ['관리비', '향']);
  assert.deepEqual(missing(Object.assign({}, l, { deal: 'wolse' }), cfg).map(m => m.label), ['월세']);
  assert.deepEqual(missing(Object.assign({}, l, { mgmt: null, mgmt_na: 1 }), cfg), [], '관리비 확인 불가도 채운 것으로');
  // 자료로 미리 채운 값은 [확인] 전엔 공개에 못 씀
  assert.equal(CFG0.approval, '2027-01 예정 (사용승인 전)');
  assert.deepEqual(CFG0.rooms['84A'], [3, 2]);
  assert.deepEqual(missing(l, cfgOf({})).map(m => m.label), ['사용승인일 확인 (공개 설정)', '주차대수 확인 (공개 설정)', '방 · 욕실 수 확인 (공개 설정)']);
  assert.deepEqual(faceOf('84B'), { facing: '남', basis: '거실', facing_auto: 1 });
  assert.deepEqual(faceOf('84A'), {}, '배치도로 판단 어려운 타입은 비워 둠');
  assert.deepEqual(missing(Object.assign({}, l, { facing_auto: 1 }), cfg).map(m => m.label), ['향 확인 (배치도 기준 자동)']);
  for (const s of ['계약', '잔금완료', '보류', '철회', '접수', '확인중']) assert.equal(pubAfter(s, 'on'), 'off', s);
  for (const s of ['광고중', '협의중', '가계약']) assert.equal(pubAfter(s, 'on'), 'on', s);
  assert.equal(pubAfter('보류', 'req'), 'off');
  const c = { source: 'card' };
  assert.match(contactOf(c, { name: '김', role: '직원', active: 1, license: '공인중개사' }).contact, /^담당 김/);
  assert.equal(contactOf(c, { name: '이', role: '직원', active: 1, license: '중개보조원' }).contact, '제니스원부동산');
  assert.equal(contactOf(c, { name: '황', role: '대표', active: 1 }).contact, '제니스원부동산', '자격 미지정이면 대표도 사무소명');
  assert.equal(contactOf(c, { name: '김', role: '직원', active: 0, license: '공인중개사' }).contact, '제니스원부동산', '퇴사 직원');
  assert.equal(contactOf({ source: 'guest' }, { name: '황', role: '대표', active: 1 }).contact, '제니스원부동산', '관심등록 출처는 사무소명');
  assert.equal(contactOf(c, null).tel, '1800-7240');
});

let boss, a, b, viewer, L;
test('준비: 대표 · 직원 2명 · 열람', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (name, role, ipA) => {
    await boss('/api/admin/staff', { body: { op: 'add', name, role } });
    await boss('/api/admin/staff', { body: { op: 'pin', name, pin: '0000' } });
    const x = agent(ipA);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    return x;
  };
  a = await mk('직원가', '직원', '3.3.3.1');
  b = await mk('직원나', '직원', '3.3.3.2');
  viewer = await mk('열람이', '열람', '3.3.3.3');
  await pushRow(boss, 'u', UID, { status: '보유', owner: '윤소유', phone: '010-3131-4141' });
});

test('R1: 소유자 상담카드 전세 칩 → 매물 접수 · 다시 저장하면 새로 만들지 않고 조건만 갱신', async () => {
  const card = { id: 'c1', kind: 'owner', unit: UID, name: '윤소유', phone: '010-3131-4141', writer: '직원가', trades: { jeonse: { dep: '52000', move: '협의' } } };
  assert.equal((await pushRow(a, 'c', 'c1', card)).json.n, 1);
  L = await mineL(a);
  assert.equal(L.status, '접수');
  assert.equal(L.mgr, '직원가');
  assert.equal(L.dep, 52000);
  assert.equal(L.can.edit, true);
  assert.equal(L.owner.name, '윤소유');
  card.trades.jeonse.dep = '53000';
  await pushRow(a, 'c', 'c1', card, Date.now() + 5);
  const rows = (await board(a)).filter(x => x.unit_id === UID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dep, 53000);
  L = rows[0];
});

test('권한: 남의 매물은 가려 보이고 못 고침 · 열람은 보기만', async () => {
  for (const x of [b, viewer]) {
    const r = await x('/api/staff/listings');
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes('윤소유') && !r.text.includes('3131-4141'), '소유자 원문 노출');
    const l = r.json.rows.find(y => y.id === L.id);
    assert.equal(l.owner.masked, true);
    assert.equal(l.can.edit, false);
    assert.equal((await act(x, l, 'status', { status: '확인중' })).status, 403);
    assert.equal((await act(x, l, null, { mgmt: 1 })).status, 403);
  }
  assert.equal((await agent('4.4.4.4')('/api/staff/listings')).status, 401);
});

test('기준 4: 필수 항목이 비면 공개 요청 · 승인 모두 거부 (빠진 항목 목록)', async () => {
  let r = await act(a, L, 'publish', { op: 'request' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.missing.filter(m => m.k).map(m => m.label), ['관리비', '향', '향 기준']);
  assert.equal((await act(boss, L, 'publish', { op: 'approve' })).status, 400);
  r = await act(a, L, null, { mgmt: 22, facing: '남', basis: '거실', mgmt_items: ['일반관리비', '수도', '없는항목'] });
  assert.equal(r.status, 200);
  L = await mineL(a);
  assert.deepEqual(L.mgmt_items, ['일반관리비', '수도']);
  assert.ok(L.missing.length > 0 && L.missing.every(m => !m.k), '남은 건 공개 설정 항목뿐');
  assert.equal((await act(a, L, null, { facing: '위쪽' })).status, 400);
  // 공개 설정은 대표 · 관리자 · 권한자만
  assert.ok((await pushRow(a, 'cfg', 'listingCfg', { approval: 'x' })).json.rejected.length === 1);
  L = await mineL(a);
  assert.ok(L.missing.some(m => m.label === '방 · 욕실 수 확인 (공개 설정)'), '확인 전');
  await pushRow(boss, 'cfg', 'listingCfg', { approval: '2027-01 예정 (사용승인 전)', ok: { approval: true, parking: true, rooms: true } });
  L = await mineL(a);
  assert.deepEqual(L.missing, []);
});

test('직원은 공개 요청만 → 대표 승인 시 광고중 · 공개 사본 (호수 · 소유자 없음, 중개보조원 규칙)', async () => {
  assert.equal((await act(a, L, 'publish', { op: 'approve' })).status, 403, '직원은 직접 공개 못 함');
  assert.equal((await act(a, L, 'publish', { op: 'request' })).status, 200);
  L = await mineL(a);
  assert.equal(L.pub, 'req');
  assert.equal((await pub()).json.rows.length, 0, '승인 전엔 안 보임');
  const r = await act(boss, L, 'publish', { op: 'approve' });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, '광고중');
  const p = await pub();
  const row = p.json.rows.find(x => x.id === L.id);
  assert.equal(row.label, '103동 중층/38층');
  assert.equal(row.contact, '제니스원부동산', '자격 미지정 직원 → 사무소명');
  assert.equal(row.tel, '1800-7240');
  assert.equal(row.rooms, 3);
  for (const s of ['1504', '윤소유', '3131', '직원가', 'unit_id', 'writer']) assert.ok(!p.text.includes(s), s + ' 노출');
  assert.equal(p.json.office.regNo, '29170-2025-00089');
  await boss('/api/admin/staff', { body: { op: 'license', name: '직원가', license: '공인중개사' } });
  assert.equal((await pub()).json.rows[0].contact, '담당 직원가 · 제니스원부동산', '공인중개사만 이름');
  await boss('/api/admin/staff', { body: { op: 'license', name: '직원가', license: '중개보조원' } });
  assert.equal((await pub()).json.rows[0].contact, '제니스원부동산', '중개보조원 → 사무소명');
  await boss('/api/admin/staff', { body: { op: 'license', name: '직원가', license: '공인중개사' } });
  assert.equal((await boss('/api/admin/staff', { body: { op: 'license', name: '직원가', license: '소속공인중개사' } })).status, 400, '선택지는 공인중개사 · 중개보조원 둘');
  assert.equal((await a('/api/admin/staff', { body: { op: 'license', name: '직원가', license: '공인중개사' } })).status, 403, '대표만');
  // 직원 추가할 때 자격 같이 정함 → 화면용 설정(cfg licenses)에 보임
  assert.equal((await boss('/api/admin/staff', { body: { op: 'add', name: '신입', role: '직원', license: '중개보조원' } })).status, 200);
  assert.equal((await boss('/api/admin/staff', { body: { op: 'add', name: '신입2', role: '직원', license: '박사' } })).status, 400);
  const lic = (await boss('/api/staff/pull?since=0')).json.rows.filter(r => r.s === 'cfg' && r.k === 'licenses').pop();
  assert.deepEqual(JSON.parse(lic.v), { 대표: '', 직원가: '공인중개사', 직원나: '', 열람이: '', 신입: '중개보조원' });
  assert.ok((await pushRow(boss, 'cfg', 'licenses', { 신입: '공인중개사' })).json.rejected.length === 1, '화면에서 직접 못 바꿈');
});

test('기준 5: 가계약은 공개 유지 + 배지, 보류 · 계약은 즉시 비공개 · 잔금완료는 상담카드로 · 옛 버전 409', async () => {
  L = await mineL(a);
  assert.equal((await act(a, L, 'status', { status: '가계약' })).status, 200);
  assert.equal((await pub()).json.rows[0].badge, '계약 진행중');
  assert.equal((await act(a, L, 'status', { status: '협의중' })).status, 409, '옛 버전');
  L = await mineL(a);
  assert.equal((await act(a, L, 'status', { status: '잔금완료' })).json.err, 'card');
  const r = await act(a, L, 'status', { status: '보류', reason: '소유자 재고' });
  assert.equal(r.json.pub, 'off');
  assert.equal((await pub()).json.rows.length, 0, '즉시 사라짐');
  L = await mineL(a);
  assert.equal((await act(a, L, 'publish', { op: 'request' })).status, 409, '보류 상태는 공개 불가');
  await act(a, L, 'status', { status: '광고중' });
  L = await mineL(a);
  await act(boss, L, 'publish', { op: 'approve' });
  L = await mineL(a);
  await act(a, L, 'status', { status: '계약' });
  assert.equal((await pub()).json.rows.length, 0, '계약 → 즉시 사라짐');
  const d = (await a('/api/staff/listings/' + L.id)).json;
  assert.ok(d.events.some(e => e.act === '자동 비공개'));
  assert.ok(d.events.some(e => e.act === '공개 승인'));
});

test('공유: 수정 권한 받은 직원은 고칠 수 있고 소유자 원문 · 해제하면 다시 막힘', async () => {
  L = await mineL(a);
  assert.equal((await b('/api/staff/listings/' + L.id + '/grants', { body: { staff: '직원나', perm: 'edit' } })).status, 403, '남의 매물 공유 못 함');
  assert.equal((await a('/api/staff/listings/' + L.id + '/grants', { body: { staff: '직원나', perm: 'edit' } })).status, 200);
  let l = await mineL(b);
  assert.equal(l.can.edit, true);
  assert.equal(l.owner.name, '윤소유');
  assert.equal((await act(b, l, null, { mgmt: 25 })).status, 200);
  await a('/api/staff/listings/' + L.id + '/grants', { body: { staff: '직원나', perm: null } });
  l = await mineL(b);
  assert.equal((await act(b, l, null, { mgmt: 30 })).status, 403);
  // 담당 바꾸기 → 이전 담당은 '보기'로 남음
  assert.equal((await act(a, l, 'assign', { staff: '직원나' })).status, 200);
  const d = (await boss('/api/staff/listings/' + L.id)).json;
  assert.equal(d.listing.mgr, '직원나');
  assert.ok(d.events.some(e => e.act === '담당 변경'));
});

test('관리비 확인 불가: 고르면 금액이 비고, 공개 사본에 안내 표시', async () => {
  L = await mineL(boss);
  await act(boss, L, 'status', { status: '광고중' });
  L = await mineL(boss);
  assert.equal((await act(boss, L, null, { mgmt_na: true, mgmt: 30 })).status, 200);
  L = await mineL(boss);
  assert.equal(L.mgmt_na, true);
  assert.equal(L.mgmt, null);
  assert.deepEqual(L.missing, []);
  await act(boss, L, 'publish', { op: 'approve' });
  const row = (await pub()).json.rows.find(x => x.id === L.id);
  assert.equal(row.mgmt_na, 1);
  assert.equal(row.mgmt, null);
  L = await mineL(boss);
  await act(boss, L, null, { mgmt_na: false, mgmt: 21 });
  assert.equal((await pub()).json.rows.find(x => x.id === L.id).mgmt, 21, '다시 금액으로');
});

test('공개 카드 기타 · 옵션: 기타는 전화번호 가림, 소유자 옵션(세대 자료)이 바뀌면 바로 반영, 끄면 옵션 줄 없음', async () => {
  const OPTS = (await import('../public/daelasoo/data/options.json', { with: { type: 'json' } })).default;
  const type = UNIT[UID].type, it = OPTS.paid.find(x => x.variants.some(v => v.t && v.t[type])), v = it.variants.find(v => v.t && v.t[type]);
  L = await mineL(boss);
  assert.equal((await act(boss, L, null, { memo_pub: '남향 고층 · 문의 010-9999-8888' })).status, 200);
  let row = (await pub()).json.rows.find(x => x.id === L.id);
  assert.equal(row.memo, '남향 고층 · 문의 010-****-****');
  const u0 = JSON.parse((await boss('/api/staff/pull?since=0')).json.rows.filter(r => r.s === 'u' && r.k === UID).pop()?.v || '{}') || {};
  await pushRow(boss, 'u', UID, Object.assign({}, u0, { sel: { paid: { [it.id]: { v: v.k } } } }));
  row = (await pub()).json.rows.find(x => x.id === L.id);
  assert.deepEqual(JSON.parse(row.opts), { exp: true, items: [it.name] }, '세대 옵션 바뀌면 공개 카드도');
  assert.ok(!JSON.stringify(row).includes(String(v.t[type].p)), '옵션 금액은 안 보냄');
  L = await mineL(boss);
  await act(boss, L, null, { opt_show: false });
  assert.equal((await pub()).json.rows.find(x => x.id === L.id).opts, null);
  L = await mineL(boss);
  assert.equal(L.opt_show, false);
  await act(boss, L, null, { opt_show: true });
});

test('R2: 게스트 내 집 내놓기 → 매물 확인중 (담당 미배정) · 공개 API 쓰기 막힘 · 비공개 매물엔 댓글 못 씀', async () => {
  const g = agent('7.7.7.7');
  const r = await g('/api/public/lead', { body: { card: { kind: 'owner', name: '게소유', phone: '010-7070-8080', unit: '201-801', consent: { req: true }, trades: { wolse: { dep: '5000', rent: '150', move: '즉시' } } } } });
  assert.equal(r.status, 200);
  const l = (await board(boss)).find(x => x.unit_id === '201-801');
  assert.equal(l.status, '확인중');
  assert.equal(l.source, 'guest');
  assert.equal(l.mgr, null);
  assert.equal(l.rent, 150);
  // 84B → 배치도 기준 남향 · 거실 자동, [맞음] 전엔 공개 못 함
  assert.equal(l.facing, '남');
  assert.equal(l.facing_auto, true);
  assert.ok(l.missing.some(m => m.label === '향 확인 (배치도 기준 자동)'));
  assert.equal((await act(boss, l, null, { facing_auto: false })).status, 200);
  assert.ok(!(await board(boss)).find(x => x.id === l.id).missing.some(m => m.label.startsWith('향')));
  assert.equal((await g('/api/public/listings', { body: {} })).status, 404);
  assert.equal((await pub('?deal=x')).status, 400);
  const c = await g('/api/public/comments', { body: { op: 'add', t: 'l:' + l.id, text: '문의합니다' } });
  assert.equal(c.status, 400, '공개 안 된 매물');
});

// 공개 매물 중개요청 (2026-11-02): 관심등록 없이 접수 → 댓글 '홍** · 매물 중개요청' · 직원 알림 · 첫 확인 한 명만
test('중개요청: 관심등록 없이 접수 · 댓글엔 가린 이름만 · 첫 확인 직원 한 명만 · 담당자 확인 표시 · 자동 답글', async () => {
  L = await mineL(boss);
  if (!(await pub()).json.rows.find(x => x.id === L.id)) { await act(boss, L, 'publish', { op: 'approve' }); L = await mineL(boss); }
  const g = agent('9.9.9.1'), body = { lid: L.id, name: '홍길동', phone: '010-5151-6262', msg: '대출 상담도 원해요 010-5151-6262', consent: { req: true } };
  assert.equal((await g('/api/public/broker', { body: Object.assign({}, body, { consent: {} }) })).status, 400, '필수 동의 없으면 거부');
  assert.equal((await g('/api/public/broker', { body: Object.assign({}, body, { lid: '0'.repeat(26) }) })).status, 400, '공개 안 된 매물');
  const r = await g('/api/public/broker', { body });
  assert.equal(r.status, 200);
  assert.equal(r.json.name, '홍*동');
  assert.equal((await g('/api/public/broker', { body })).status, 409, '같은 매물 같은 번호는 한 번');
  const cm = (await g('/api/public/comments?t=l:' + L.id)).json.rows.find(c => c.broker);
  assert.equal(cm.name, '홍*동');
  assert.equal(cm.bk, 'new');
  assert.ok(!cm.text.includes('5151'), '댓글에 연락처 안 나옴: ' + cm.text);
  // 직원 알림: 확인 전엔 모두 가림
  let row = (await a('/api/staff/broker')).json.rows.find(x => x.lid === L.id);
  assert.equal(row.phone, '010-****-****');
  assert.equal(row.by, '');
  assert.equal((await viewer('/api/staff/broker/claim', { body: { id: row.id } })).status, 403, '열람은 못 맡음');
  // 두 직원이 동시에 → 한 명만
  const [ra, rb] = await Promise.all([a('/api/staff/broker/claim', { body: { id: row.id } }), b('/api/staff/broker/claim', { body: { id: row.id } })]);
  const win = ra.status === 200 ? ra : rb, lose = ra.status === 200 ? rb : ra, winner = ra.status === 200 ? '직원가' : '직원나';
  assert.equal(win.status, 200);
  assert.equal(lose.status, 409);
  assert.equal(lose.json.by, winner);
  assert.equal(win.json.item.phone, '010-5151-6262', '맡은 직원은 원문');
  const other = ra.status === 200 ? b : a;
  row = (await other('/api/staff/broker')).json.rows.find(x => x.id === row.id);
  assert.equal(row.by, winner);
  assert.equal(row.phone, '010-****-****', '다른 직원은 계속 가림');
  const ev = (await boss('/api/staff/listings/' + L.id)).json.events.filter(e => e.act === '중개요청 확인');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].who, winner);
  const after = (await g('/api/public/comments?t=l:' + L.id)).json.rows;
  assert.equal(after.find(c => c.id === cm.id).bk, 'done');
  assert.ok(after.some(c => c.pid === cm.id && c.office && c.name === '제니스원부동산'), '사무소 자동 답글 (직원 이름 안 나옴)');
});

test('최근 거래완료: 계약이 되면 타입 · 단지 · 면적만 (가격 · 동 · 층 · 날짜 없음) · 표시 안 함 · 되돌리면 빠짐', async () => {
  const L0 = (await board(boss)).find(x => x.unit_id === UID);
  let r = await act(boss, L0, 'status', { status: '계약' });
  assert.equal(r.status, 200);
  let p = await pub();
  const d = p.json.done.find(x => x.type === UNIT[UID].type);
  assert.ok(d, '거래완료 칸에 나옴');
  assert.deepEqual(Object.keys(d).sort(), ['block', 'deal', 'exclusive', 'kind', 'type']);
  for (const s of ['1504', 'done_at', 'dep', 'ask', '윤소유']) assert.ok(!JSON.stringify(p.json.done).includes(s), s + ' 노출');
  let L1 = (await board(boss)).find(x => x.id === L0.id);
  await act(boss, L1, null, { done_hide: true });
  assert.equal((await pub()).json.done.length, 0, '표시 안 함');
  L1 = (await board(boss)).find(x => x.id === L0.id);
  assert.equal(L1.done_hide, true);
  await act(boss, L1, null, { done_hide: false });
  assert.equal((await pub()).json.done.length, 1);
  L1 = (await board(boss)).find(x => x.id === L0.id);
  assert.equal((await pub()).json.rows.some(x => x.id === L0.id), false, '계약 중엔 공개 매물에서 빠짐');
  await act(boss, L1, 'status', { status: '광고중' });
  p = await pub();
  assert.equal(p.json.done.length, 0, '진행 상태로 되돌리면 빠짐');
  assert.ok(p.json.rows.some(x => x.id === L0.id), '계약 취소 → 광고중이면 공개 매물에 다시 나옴');
  const L2 = (await board(boss)).find(x => x.id === L0.id);
  assert.equal(L2.pub, 'on');
  // 직접 공개를 끈 매물은 되살리지 않음
  await act(boss, L2, 'publish', { op: 'off' });
  let L3 = (await board(boss)).find(x => x.id === L0.id);
  await act(boss, L3, 'status', { status: '계약' });
  L3 = (await board(boss)).find(x => x.id === L0.id);
  await act(boss, L3, 'status', { status: '광고중' });
  assert.equal((await board(boss)).find(x => x.id === L0.id).pub, 'off', '직접 끈 공개는 그대로');
});
