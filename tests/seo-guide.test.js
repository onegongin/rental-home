// 검색용 안내 페이지 (시안 seo-pages 확정 2026-11-05) — /plan · /plan/{타입} · /price · /dongho · /location
//   모두 열림 · 제목 40자 · 설명 80자 이내 · 대표 주소 · 그림 설명 · 사이트맵 등록 · 없는 타입은 404
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { TYPES, slugOf, guideUrls } from '../src/seo/guide.js';

let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: 'k', TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());
const get = async p => { const r = await mf.fetch('http://localhost' + p); return { status: r.status, text: await r.text() }; };
const pick = (h, re) => ((h.match(re) || [])[1] || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

test('안내 페이지 모두 열림 · 제목 40자 · 설명 80자 이내 · 대표 주소', async () => {
  assert.equal(TYPES.length, 8);
  for (const p of guideUrls()) {
    const r = await get('/daelasoo' + p);
    assert.equal(r.status, 200, p);
    const t = pick(r.text, /<title>([^<]*)<\/title>/), d = pick(r.text, /<meta name="description" content="([^"]*)"/);
    assert.ok(t.length > 0 && t.length <= 40, p + ' 제목 ' + t.length + '자: ' + t);
    assert.ok(d.length > 0 && d.length <= 80, p + ' 설명 ' + d.length + '자: ' + d);
    assert.match(r.text, new RegExp('<link rel="canonical" href="[^"]*' + p.replace(/\//g, '\\/') + '"'), p + ' 대표 주소');
    assert.ok(!/<img(?![^>]*alt="[^"]+")[^>]*>/.test(r.text), p + ' 그림 설명 없는 사진');
    assert.ok(r.text.includes('/?reg=1') && r.text.includes('1800-7240'), p + ' 상담 단추 · 사무소 표시');
  }
});

test('타입 페이지: 평면도 · 면적 · 세대수 · 분양가 범위 · 다른 타입 링크, 없는 타입은 404', async () => {
  const r = await get('/daelasoo/plan/84a');
  for (const s of ['84A타입 평면도', '전용 84.641㎡', '238세대', '4억 8,400만원', '/plan/84b', 'FloorPlan']) assert.ok(r.text.includes(s), s);
  assert.equal((await get('/daelasoo/plan/99z')).status, 404);
  const sm = (await get('/daelasoo/sitemap.xml')).text;
  for (const t of TYPES) assert.ok(sm.includes('/daelasoo/plan/' + slugOf(t) + '</loc>'), t + ' 사이트맵');
  for (const p of ['/price', '/dongho', '/location']) assert.ok(sm.includes(p + '</loc>'), p + ' 사이트맵');
});
