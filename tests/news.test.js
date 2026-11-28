// 분양 소식 (시안 r79 확정 2026-11-28)
//   대표 · 관리자만 씀 · 임시 저장은 손님에게 안 보임 · 공개 = 검색용 글 페이지 · 목록 · 사이트맵 · RSS · 손님 API · 호수 · 전화번호 있으면 공개 막음
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestHarness } from './harness.js';
import { cleanNews, cleanBlocks, privacy, checks, isAsset } from '../src/core/news.js';

test('규칙: 칸 검사 · 블록 · 개인정보 · 점검', () => {
  assert.equal(cleanNews({ cat: 'hedge', title: 'a', slug: 'Bad Slug' }, true).err, 'slug');
  assert.equal(cleanNews({ cat: 'x', title: 'a', slug: 'ok' }, true).err, 'cat');
  assert.equal(cleanNews({ cat: 'hedge', title: '', slug: 'ok' }, true).err, 'title');
  assert.deepEqual(cleanBlocks([{ t: 'img', src: '../../etc/passwd' }, { t: 'img', src: 'assets/dls/sky1.jpg', cap: '전경' }, { t: 'h', x: ' 소제목 ' }, { t: 'script', x: 'x' }, { t: 'links', items: ['plan', 'evil'] }]),
    [{ t: 'img', src: 'assets/dls/sky1.jpg', cap: '전경' }, { t: 'h', x: '소제목' }, { t: 'links', items: ['plan'] }]);
  assert.ok(!isAsset('assets/../x.jpg') && isAsset('assets/dls/interior/80A_01.jpg'));
  assert.deepEqual(privacy('상담 1800-7240 · 010-1234-5678 · 101동 1502호 · 102-803 · 2026-11-28 · 4억 1,900', ['1800-7240']), ['전화번호 010-1234-5678', '호수 101동 1502호', '호수 102-803']);
  assert.deepEqual(privacy('대표번호 1800-7240 로 전화 주세요', ['1800-7240']), []);
  const c = checks({ title: '첨단대라수1차 매입보장', lead: 'x'.repeat(80), body: JSON.stringify([{ t: 'h', x: 'a' }, { t: 'p', x: 'y'.repeat(900) }]) }, '첨단대라수1차');
  assert.deepEqual(c.map(x => x.ok), [true, true, false, true, false]);
});

const KEY = 'news-office';
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

test('API · 검색용 페이지: 쓰기 · 공개 · 목록 · 사이트맵 · RSS · 권한', async () => {
  const boss = agent('2.2.4.2'), guest = agent('7.7.4.7');
  await boss('/api/auth/device', { body: { code: KEY } });
  await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } });
  await boss('/api/admin/staff', { body: { op: 'add', name: '직원A', role: '권한자' } }); await boss('/api/admin/staff', { body: { op: 'pin', name: '직원A', pin: '0000' } });
  const a = agent('4.4.4.5'); await a('/api/auth/device', { body: { code: KEY } }); await a('/api/auth/login', { body: { name: '직원A', pin: '0000' } }); await a('/api/auth/pin', { body: { pin: '4321' } });

  assert.equal((await a('/api/staff/news')).status, 403, '권한자도 못 씀');
  const post = { cat: 'hedge', title: '첨단대라수1차 매입보장 — 3년 뒤 분양가에', lead: '헷지했지 매입보장 안내입니다.', slug: 'maeip-bojang', tags: '첨단대라수1차, 매입보장',
    blocks: [{ t: 'img', src: 'assets/dls/sky1.jpg', cap: '단지 전경' }, { t: 'h', x: '매입보장이 뭔가요?' }, { t: 'p', x: '3년 뒤 시세가 내려가면 분양가에 다시 삽니다.' }, { t: 'table', x: '타입 | 금액대\n80타입 | 4억 원대' }, { t: 'links', items: ['plan', 'location'] }] };
  const id = (await boss('/api/staff/news', { body: post })).json.id;
  assert.ok(id);
  assert.equal((await boss('/api/staff/news', { body: Object.assign({}, post, { title: '다른 글' }) })).status, 409, '같은 글 주소');

  // 임시 저장 = 손님에게 안 보임
  assert.equal((await guest('/daelasoo/news/maeip-bojang')).status, 404);
  assert.equal((await guest('/api/public/news')).json.rows.length, 0);

  // 호수가 있으면 공개 막힘 → 고치면 공개
  await boss('/api/staff/news/' + id, { body: { blocks: post.blocks.concat([{ t: 'p', x: '101동 1502호 손님이 계약하셨습니다' }]) } });
  const pb = await boss('/api/staff/news/' + id + '/pub', { body: {} });
  assert.equal(pb.status, 409); assert.equal(pb.json.err, 'privacy');
  await boss('/api/staff/news/' + id, { body: { blocks: post.blocks } });
  assert.equal((await boss('/api/staff/news/' + id + '/pub', { body: {} })).status, 200);

  const pg = await guest('/daelasoo/news/maeip-bojang');
  assert.equal(pg.status, 200);
  assert.match(pg.text, /<h1>첨단대라수1차 매입보장 — 3년 뒤 분양가에<\/h1>/);
  assert.match(pg.text, /"@type":"BlogPosting"/);
  assert.match(pg.text, /한 줄로 먼저/);
  assert.match(pg.text, /<h2>매입보장이 뭔가요\?<\/h2>/);
  assert.match(pg.text, /<th>타입<\/th><th>금액대<\/th>/);
  assert.match(pg.text, /src="\/daelasoo\/assets\/dls\/sky1\.jpg"/, '사진 주소 = 단지 앞머리');
  assert.match(pg.text, /href="\/daelasoo\/plan"/);
  assert.match(pg.text, /og:type" content="article"/);
  assert.match(pg.text, /rel="canonical" href="[^"]*\/news\/maeip-bojang"/);
  const ls = await guest('/daelasoo/news?c=hedge');
  assert.equal(ls.status, 200); assert.match(ls.text, /href="\/daelasoo\/news\/maeip-bojang"/);
  assert.doesNotMatch((await guest('/daelasoo/news?c=loc')).text, /maeip-bojang/);
  assert.match((await guest('/daelasoo/sitemap.xml')).text, /\/news\/maeip-bojang<\/loc>/);
  assert.match((await guest('/daelasoo/rss.xml')).text, /<title>첨단대라수1차 매입보장 — 3년 뒤 분양가에<\/title>/);
  const pub = (await guest('/api/public/news')).json.rows;
  assert.deepEqual(pub.map(x => [x.slug, x.cat, x.cover]), [['maeip-bojang', '매입보장', 'assets/dls/sky1.jpg']]);

  // 공개 글 고칠 때도 개인정보 막음 · 내리면 404 · 지우기
  assert.equal((await boss('/api/staff/news/' + id, { body: { lead: '문의 010-2222-3333' } })).status, 409);
  assert.equal((await boss('/api/staff/news/' + id + '/unpub', { body: {} })).status, 200);
  assert.equal((await guest('/daelasoo/news/maeip-bojang')).status, 404);
  assert.doesNotMatch((await guest('/daelasoo/sitemap.xml')).text, /maeip-bojang/);
  assert.equal((await boss('/api/staff/news/' + id + '/del', { body: {} })).status, 200);
  assert.equal((await boss('/api/staff/news')).json.list.length, 0);
  assert.equal((await guest('/daelasoo/news/img/abcdef0123456789abcdef01')).status, 404);
  assert.equal((await boss('/api/staff/news/upload?name=x', { body: { a: 1 } })).status, 400);
  const acts = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(acts.includes('분양 소식 공개') && acts.includes('분양 소식 내림') && acts.includes('분양 소식 지움'));
});

test('화면: 대라수 업무 홍보 › 분양 소식 · 단지 화면 칸', () => {
  const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
  assert.match(src, /it\('news', '📰 분양 소식'/);
  assert.match(src, /<sc-if value="\{\{ si\.newsOn \}\}"/);
  assert.match(src, /\['glist', guestOnly \? '현재 매물' : '게스트 매물'\]\]\)\.concat\(guestOnly \? \[\['gnews', '분양 소식'\]\]/, '손님 탭 현재 매물 뒤 (시안 r80)');
  assert.match(src, /<sc-if value="\{\{ isGN \}\}"/);
  assert.match(readFileSync(new URL('../public/daelasoo/staff/nav.js', import.meta.url), 'utf8'), /news\.html/);
});
