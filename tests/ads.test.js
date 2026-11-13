// P6 광고 자동 테스트 — 설계서 11장 · 10.3-3
//   + 검색 노출 자동화: 사이트맵 · RSS · 매물 검색용 페이지 · 끝나면 410 · IndexNow 기록
//   완료 기준 (16장): 매물 1건으로 5개 매체 초안 생성 · 필수 표시 블록은 뺄 수 없음 · 게시기록 → 비공개 때 '내려야 할 광고' · 매칭은 수신 동의 고객만
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { draft, withBlock, banHits, requiredBlock, BLOCK_HEAD, MEDIA_KEYS } from '../src/ads/templates.js';
import { cardFits, matchCards, manwon, dongOk, floorOk } from '../src/core/match.js';

const KEY = 'test-office-code';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', INDEXNOW_KEY: 'testkey0123456789', INDEXNOW_API: 'http://127.0.0.1:9/indexnow' } }] }); await mf.listen(); });
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
const mineL = async a => (await a('/api/staff/listings')).json.rows.find(x => x.unit_id === UID && x.deal === 'jeonse');
const act = (a, l, op, b) => a('/api/staff/listings/' + l.id + (op ? '/' + op : ''), { method: op ? 'POST' : 'PATCH', body: Object.assign({ ver: l.ver }, b) });
const ads = (a, l, b) => a('/api/staff/listings/' + l.id + '/ads', b ? { body: b } : {});

const ROW = { id: 'x', deal: 'jeonse', dong: 103, block: '1단지', label: '103동 중층/38층', band: '중층', type: '84A', kind: '아파트', exclusive: 84.641, supply: 116.551, dep: 52000, rent: null, move: '협의', mgmt: 22, mgmt_na: 0, mgmt_items: '["일반관리비"]', facing: '남', basis: '거실', rooms: 3, baths: 2, approval: '2027-01 예정 (사용승인 전)', parking: '공동주택 519대', urgent: 0, badge: '', contact: '제니스원부동산', tel: '1800-7240' };

test('초안: 5개 매체 · 필수 표시 블록 · 지워도 다시 붙음 · 금지 표현', () => {
  for (const k of MEDIA_KEYS) {
    const d = draft(k, ROW, 3);
    assert.ok(d && d.body.length > 30, k);
    assert.ok(d.body.includes('29170-2025-00089'), k + ' 등록번호');
    assert.ok(!d.body.includes('1504'), k + ' 호수 노출');
    if (k !== 'sms') { assert.ok(d.body.includes(BLOCK_HEAD), k); assert.ok(d.body.includes('관리비: 월 22만원 (포함: 일반관리비)'), k); }
  }
  assert.match(requiredBlock(ROW), /전세 5억 2,000만원/);
  assert.ok(draft('sms', ROW, 0).body.split('\n').length <= 6, '문자는 짧게');
  assert.ok(draft('insta', ROW, 0).tags.length <= 30);
  // 블록을 지우거나 고쳐도 원래 블록으로
  const cut = withBlock('blog', '새 본문입니다\n\n' + BLOCK_HEAD + '\n가격: 1원', ROW);
  assert.ok(cut.startsWith('새 본문입니다'));
  assert.ok(!cut.includes('가격: 1원') && cut.includes('가격: 전세 5억 2,000만원'));
  assert.ok(withBlock('blog', '블록 없이', ROW).includes(BLOCK_HEAD));
  assert.deepEqual(banHits('최저가 급매! 확정 수익', null, false), ['최저가', '확정 수익', '급매']);
  assert.deepEqual(banHits('급매', null, true), [], '급매 표시 매물은 허용');
  assert.deepEqual(banHits('대박', ['대박'], false), ['대박']);
});

test('매칭 규칙: 동 · 층 · 타입 · 거래 · 예산, 동의한 고객만', () => {
  assert.equal(manwon('5억 2천'), 52000); assert.equal(manwon('5.5억'), 55000); assert.equal(manwon('48000'), 48000); assert.equal(manwon('협의'), 0);
  assert.ok(dongOk('1단지 전체 (101~104동)', 103) && dongOk('103동', 103) && !dongOk('104동', 103));
  assert.ok(floorOk('11~20층', 15) && floorOk('10층 이하', 3) && floorOk('31층 이상', 38) && !floorOk('11~20층', 21));
  const l = { unit_id: UID, deal: 'sale', ask: 60000 };   // 103-1504 : 15층 84A
  const c = (want, more) => Object.assign({ kind: 'buyer', want, consent: { mkt: true } }, more);
  assert.deepEqual(cardFits(c({ dongs: ['103동'], floors: ['11~20층'], types: ['84A'], budget: '6억' }), l), { ok: true, why: ['동', '층', '타입', '예산'] });
  assert.equal(cardFits(c({ dongs: ['무관'], types: ['84B'] }), l).ok, false);
  assert.equal(cardFits(c({ budget: '5억' }), l).ok, false, '예산 10% 넘게 초과');
  assert.equal(cardFits(c({}, { wants: ['jeonse'] }), l).ok, false, '거래 다름');
  assert.equal(cardFits(c({}, { kind: 'owner' }), l).ok, false);
  const m = matchCards(l, [c({ types: ['84A'] }, { id: 'a' }), c({}, { id: 'b', consent: { mkt: false } }), c({}, { id: 'c', consent: undefined })]);
  assert.deepEqual(m.list.map(x => x.c.id), ['a']);
  assert.equal(m.noConsent, 2);
  // 같은 연락처는 가장 최근 카드 하나 (나중 상담에서 동의 철회 → 목록에서 빠짐)
  const p = { phone: '010-7777-8888' };
  const m2 = matchCards(l, [c({}, Object.assign({ id: 'c1', at: '2026-10-01' }, p)), c({}, Object.assign({ id: 'c2', at: '2026-10-20', consent: { mkt: false } }, p))]);
  assert.deepEqual([m2.list.length, m2.noConsent], [0, 1]);
  assert.equal(matchCards(l, [c({}, Object.assign({ id: 'c1', at: '2026-10-01' }, p)), c({}, Object.assign({ id: 'c2', at: '2026-10-20' }, p))]).list[0].c.id, 'c2');
});

let boss, a, b, viewer, L;
test('준비: 매물 하나 공개 (대표 · 직원 2명 · 열람)', async () => {
  boss = agent('2.2.2.2');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (name, role, ipA) => {
    await boss('/api/admin/staff', { body: { op: 'add', name, role, license: '중개보조원' } });
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
  await pushRow(boss, 'cfg', 'listingCfg', { ok: { approval: true, parking: true, rooms: true } });
  await pushRow(a, 'c', 'c1', { id: 'c1', kind: 'owner', unit: UID, name: '윤소유', phone: '010-3131-4141', writer: '직원가', trades: { jeonse: { dep: '52000', move: '협의' } } });
  L = await mineL(a);
  assert.equal((await act(a, L, null, { mgmt: 22, facing: '남', basis: '거실' })).status, 200);
  L = await mineL(a);
  // 공개 전에는 초안 못 만듦 (공개 승인을 거친 매물만 밖으로)
  let r = await ads(a, L);
  assert.equal(r.json.can, false);
  assert.equal((await ads(a, L, { op: 'draft' })).status, 409);
  assert.equal((await act(boss, L, 'publish', { op: 'approve' })).status, 200);
  L = await mineL(a);
  assert.equal(L.pub, 'on');
});

test('기준: 매물 1건 → 5개 매체 초안 · 고친 글도 블록 유지 · AI 키 없으면 501', async () => {
  let r = await ads(a, L, { op: 'draft', seed: 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.drafts.map(d => d.media).sort(), [...MEDIA_KEYS].sort());
  const blog = r.json.drafts.find(d => d.media === 'blog');
  assert.ok(blog.body.includes(BLOCK_HEAD) && blog.title.includes('84A'));
  assert.ok(!r.text.includes('윤소유') && !r.text.includes('1504호') && !r.text.includes('직원가 ·'), '초안에 소유자 · 호수 · 보조원 이름 없음');
  r = await ads(a, L, { op: 'save', media: 'blog', body: '최저가 매물입니다' });
  const saved = r.json.drafts.find(d => d.media === 'blog');
  assert.equal(saved.ver, 2);
  assert.ok(saved.body.startsWith('최저가 매물입니다') && saved.body.includes('29170-2025-00089'));
  assert.deepEqual(saved.ban, ['최저가']);
  r = await ads(a, L, { op: 'ai', media: 'blog' });
  assert.equal(r.status, 501);
  assert.equal(r.json.err, 'nokey');
  // 권한: 남의 매물 · 열람
  assert.equal((await ads(b, L, { op: 'draft' })).status, 403);
  assert.equal((await ads(viewer, L)).status, 403);
  assert.equal((await viewer('/api/staff/ads')).status, 403);
});

test('매칭 고객: 수신 동의만 · 남의 고객은 가림', async () => {
  const want = { dongs: ['1단지 전체 (101~104동)'], floors: ['11~20층'], types: ['84A'], budget: '' };
  await pushRow(b, 'c', 'k1', { id: 'k1', kind: 'client', name: '박매수', phone: '010-5555-6666', writer: '직원나', mgr: '직원나', want, wants: ['jeonse'], consent: { mkt: true, by: '직원나' } });
  await pushRow(b, 'c', 'k2', { id: 'k2', kind: 'client', name: '최동의없음', phone: '010-7777-8888', writer: '직원나', want });
  await pushRow(b, 'c', 'k3', { id: 'k3', kind: 'client', name: '정다른타입', phone: '010-1212-3434', writer: '직원나', want: { types: ['148'] }, consent: { mkt: true } });
  let r = await ads(a, L);
  assert.equal(r.json.matches.list.length, 1);
  assert.equal(r.json.matches.noConsent, 1);
  const m = r.json.matches.list[0];
  assert.equal(m.masked, true);
  assert.ok(!r.text.includes('박매수') && !r.text.includes('5555-6666'), '남의 고객 원문 노출');
  assert.deepEqual(m.why, ['거래', '동', '층', '타입']);
  r = await ads(boss, L);
  assert.equal(r.json.matches.list[0].name, '박매수', '대표는 원문');
});

test('검색 노출: 사이트맵 · RSS · 매물 페이지(구조화 데이터 · 호수 없음) · 키 파일 · IndexNow 기록', async () => {
  const g = agent('9.9.9.9');
  let r = await g('/daelasoo/sitemap.xml');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('https://rental-home.onegongin.workers.dev/daelasoo/listings/' + L.id), '사이트맵에 매물');
  assert.ok(r.text.includes('/daelasoo/listings/jeonse'));
  r = await g('/daelasoo/rss.xml');
  assert.ok(r.text.includes('<item><title>광주 센테니얼 아이파크 103동 중층 84A 전세'));
  r = await g('/daelasoo/listings/' + L.id);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('"@type":"RealEstateListing"') && r.text.includes('29170-2025-00089') && r.text.includes('rel="canonical"'));
  for (const s of ['1504', '윤소유', '3131', '직원가', '박매수']) assert.ok(!r.text.includes(s), s + ' 노출');
  r = await g('/daelasoo/listings/jeonse');
  assert.ok(r.text.includes('"@type":"ItemList"') && r.text.includes('/daelasoo/listings/' + L.id));
  assert.ok(!(await g('/daelasoo/listings/sale')).text.includes(L.id));
  assert.equal((await g('/daelasoo/listings/01ARZ3NDEKTSV4RRFFQ69G5FAV')).status, 410);
  assert.equal((await g('/daelasoo/listings/abc')).status, 404);
  assert.equal((await g('/daelasoo/testkey0123456789.txt')).text, 'testkey0123456789');
  // 공개 승인 때 IndexNow 를 보냈어야 함 (테스트 주소라 연결 실패 = 0)
  const t = await a('/api/staff/ads');
  assert.equal(t.json.seo.indexnow, true);
  assert.equal(t.json.seo.listings, 1);
  assert.ok(t.json.seo.pings.some(p => p.why === '공개' && p.urls.includes('https://rental-home.onegongin.workers.dev/daelasoo/listings/' + L.id)));
});

test('게시기록 → 보류(자동 비공개) → 내려야 할 광고 → 내림 완료', async () => {
  assert.equal((await ads(a, L, { op: 'post', media: 'blog', url: 'javascript:alert(1)' })).status, 400);
  let r = await ads(a, L, { op: 'post', media: 'blog', url: 'https://blog.naver.com/h2k2800/1' });
  assert.equal(r.json.posts.length, 1);
  await ads(a, L, { op: 'post', media: 'karrot', url: 'https://www.daangn.com/kr/x/2' });
  let t = await a('/api/staff/ads');
  assert.equal(t.json.live.length, 2);
  assert.ok(t.json.live.every(p => !p.due), '공개 중엔 내릴 것 없음');
  L = await mineL(a);
  assert.equal((await act(a, L, 'status', { status: '보류', reason: '소유자 보류' })).status, 200);
  t = await a('/api/staff/ads');
  assert.equal(t.json.live.filter(p => p.due).length, 2);
  // 검색: 끝난 매물은 410 · 사이트맵에서 빠짐 · 비공개 알림
  assert.equal((await agent('9.9.9.9')('/daelasoo/listings/' + L.id)).status, 410);
  assert.ok(!(await agent('9.9.9.9')('/daelasoo/sitemap.xml')).text.includes(L.id));
  assert.ok(t.json.seo.pings.some(p => p.why === '비공개'));
  // 아침 요약에 '내려야 할 광고'
  const mo = await boss('/api/admin/notify', { body: { op: 'morning', preview: true } });
  assert.equal(mo.status, 200);
  assert.match(mo.json.text, /내려야 할 광고 2건/);
  // 보류 상태에선 새 초안 · 게시 기록 막힘, 내림 완료는 됨
  assert.equal((await ads(a, L, { op: 'draft' })).status, 409);
  const post = t.json.live[0];
  r = await ads(a, L, { op: 'down', post: post.id });
  assert.equal(r.status, 200);
  assert.ok(r.json.posts.find(p => p.id === post.id).down_at);
  t = await a('/api/staff/ads');
  assert.equal(t.json.live.length, 1);
  const ev = (await a('/api/staff/listings/' + L.id)).json.events.map(e => e.act);
  assert.ok(ev.includes('광고 게시 기록') && ev.includes('광고 내림 완료'));
});
